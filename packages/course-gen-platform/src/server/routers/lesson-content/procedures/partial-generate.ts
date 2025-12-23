/**
 * Partial Generate Procedure
 * @module server/routers/lesson-content/procedures/partial-generate
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { partialGenerateInputSchema } from '../schemas';
import { verifyCourseAccess, buildMinimalLessonSpec } from '../helpers';
import { addJob } from '../../../../orchestrator/queue';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { JobType, parseAnalysisResult } from '@megacampus/shared-types';
import type { LessonContentJobData, Language } from '@megacampus/shared-types';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import { logger } from '../../../../shared/logger/index.js';

/**
 * Partial Stage 6 generation for selected lessons
 *
 * Purpose: Regenerate specific lessons or sections without requiring frontend
 * to provide full lesson specifications. Fetches lesson data from course_structure
 * and builds minimal LessonSpecificationV2 objects for selected lessons.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - courseId: UUID of the course
 * - lessonIds (optional): Array of lesson IDs in format "section.lesson" (e.g., ["1.1", "2.3"])
 * - sectionIds (optional): Array of section numbers to generate all lessons (e.g., [1, 3])
 * - priority (optional): Job priority 1-10, default 5
 *
 * Output:
 * - success: Boolean success flag
 * - jobCount: Number of jobs enqueued
 * - jobIds: Array of BullMQ job IDs for tracking
 * - selectedLessonIds: Array of lesson IDs that were enqueued
 *
 * Validation:
 * - Course exists and user has access
 * - Course has completed Stage 5 (course_structure exists)
 * - Must provide either lessonIds OR sectionIds (not both empty)
 * - Lesson IDs must exist in course_structure
 *
 * Error Handling:
 * - Course not found -> 404 NOT_FOUND
 * - Access denied -> 403 FORBIDDEN
 * - Course structure missing -> 400 BAD_REQUEST
 * - Invalid lesson IDs -> 400 BAD_REQUEST
 * - Queue error -> 500 INTERNAL_SERVER_ERROR
 *
 * @example
 * ```typescript
 * // Regenerate specific lessons
 * const result = await trpc.lessonContent.partialGenerate.mutate({
 *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
 *   lessonIds: ['1.1', '1.2', '2.1'],
 *   priority: 7,
 * });
 * // { success: true, jobCount: 3, jobIds: [...], selectedLessonIds: ['1.1', '1.2', '2.1'] }
 *
 * // Regenerate all lessons in sections
 * const result2 = await trpc.lessonContent.partialGenerate.mutate({
 *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
 *   sectionIds: [1, 3],
 * });
 * // { success: true, jobCount: 8, jobIds: [...], selectedLessonIds: ['1.1', '1.2', ..., '3.1', '3.2'] }
 * ```
 */
export const partialGenerate = protectedProcedure
  .use(createRateLimiter({ requests: 10, window: 60 })) // 10 partial generations per minute
  .input(partialGenerateInputSchema)
  .mutation(async ({ ctx, input }) => {
    const { courseId, lessonIds, sectionIds, priority } = input;
    const requestId = nanoid();

    // ctx.user is guaranteed non-null by protectedProcedure middleware
    const currentUser = ctx.user;

    logger.info({
      requestId,
      courseId,
      userId: currentUser.id,
      organizationId: currentUser.organizationId,
      lessonIds,
      sectionIds,
      priority,
    }, 'Partial Stage 6 generation request');

    try {
      // Step 1: Verify course access
      await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

      // Step 2: Fetch course_structure and language from database
      const supabase = getSupabaseAdmin();

      const { data: course, error: courseError } = await supabase
        .from('courses')
        .select('course_structure, language, analysis_result')
        .eq('id', courseId)
        .single();

      if (courseError || !course) {
        logger.error({
          requestId,
          courseId,
          error: courseError,
        }, 'Failed to fetch course structure');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch course structure',
        });
      }

      // Step 3: Validate course_structure exists
      const courseStructure = course.course_structure as {
        sections: Array<{
          section_number: number;
          section_title: string;
          lessons: Array<{
            lesson_number: number;
            lesson_title: string;
            lesson_objectives?: string[];
            key_topics?: string[];
            estimated_duration_minutes?: number;
            difficulty_level?: 'beginner' | 'intermediate' | 'advanced';
          }>;
        }>;
      } | null;

      if (!courseStructure || !courseStructure.sections) {
        logger.warn({
          requestId,
          courseId,
        }, 'Course structure is missing - Stage 5 may not be completed');

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Course structure not found. Please complete Stage 5 generation first.',
        });
      }

      // Step 3.5: Auto-approve Stage 5 if awaiting approval
      // When user triggers partial generation, structure is implicitly approved
      const { data: statusData } = await supabase
        .from('courses')
        .select('generation_status')
        .eq('id', courseId)
        .single();

      const currentStatus = statusData?.generation_status;
      if (currentStatus === 'stage_5_awaiting_approval') {
        logger.info({
          requestId,
          courseId,
          currentStatus,
        }, 'Auto-approving Stage 5 - structure approved for partial generation');

        // Update status to stage_5_complete (Stage 6 work proceeds from here)
        const { error: updateError } = await supabase
          .from('courses')
          .update({ generation_status: 'stage_5_complete' })
          .eq('id', courseId);

        if (updateError) {
          logger.error({
            requestId,
            courseId,
            error: updateError,
          }, 'Failed to update generation_status');
        }
      }

      // Step 3.6: Materialize sections and lessons from course_structure if not exists
      // This runs regardless of status - ensures DB has actual section/lesson records
      const { data: existingSections } = await supabase
        .from('sections')
        .select('id')
        .eq('course_id', courseId)
        .limit(1);

      if (!existingSections || existingSections.length === 0) {
        logger.info({
          requestId,
          courseId,
        }, 'Materializing sections and lessons from course_structure');

        // Create sections
        for (const section of courseStructure.sections) {
          const { data: newSection, error: sectionError } = await supabase
            .from('sections')
            .insert({
              course_id: courseId,
              title: section.section_title,
              order_index: section.section_number,
            })
            .select('id')
            .single();

          if (sectionError || !newSection) {
            logger.error({
              requestId,
              courseId,
              sectionNumber: section.section_number,
              error: sectionError,
            }, 'Failed to create section');
            continue;
          }

          // Create lessons for this section
          for (const lesson of section.lessons) {
            const { error: lessonError } = await supabase
              .from('lessons')
              .insert({
                section_id: newSection.id,
                title: lesson.lesson_title,
                order_index: lesson.lesson_number,
                lesson_type: 'text',
                duration_minutes: lesson.estimated_duration_minutes || 15,
                objectives: lesson.lesson_objectives || [],
              });

            if (lessonError) {
              logger.error({
                requestId,
                courseId,
                lessonId: `${section.section_number}.${lesson.lesson_number}`,
                error: lessonError,
              }, 'Failed to create lesson');
            }
          }
        }

        logger.info({
          requestId,
          courseId,
          sectionsCount: courseStructure.sections.length,
        }, 'Sections and lessons materialized successfully');
      }

      // Step 4: Build list of lesson IDs to generate
      const lessonIdsToGenerate: string[] = [];

      if (lessonIds && lessonIds.length > 0) {
        // Use provided lesson IDs
        lessonIdsToGenerate.push(...lessonIds);
      } else if (sectionIds && sectionIds.length > 0) {
        // Build lesson IDs from section IDs
        for (const sectionId of sectionIds) {
          const section = courseStructure.sections.find(s => s.section_number === sectionId);
          if (section) {
            for (const lesson of section.lessons) {
              lessonIdsToGenerate.push(`${sectionId}.${lesson.lesson_number}`);
            }
          }
        }
      }

      if (lessonIdsToGenerate.length === 0) {
        logger.warn({
          requestId,
          courseId,
          lessonIds,
          sectionIds,
        }, 'No lessons found to generate');

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No valid lessons found for the provided IDs',
        });
      }

      // Step 5: Build lesson specifications from course_structure
      const lessonSpecs: LessonSpecificationV2[] = [];

      for (const lessonId of lessonIdsToGenerate) {
        const [sectionNumStr, lessonNumStr] = lessonId.split('.');
        const sectionNum = parseInt(sectionNumStr, 10);
        const lessonNum = parseInt(lessonNumStr, 10);

        const section = courseStructure.sections.find(s => s.section_number === sectionNum);
        if (!section) {
          logger.warn({
            requestId,
            lessonId,
            sectionNum,
          }, 'Section not found in course_structure');
          continue;
        }

        const lesson = section.lessons.find(l => l.lesson_number === lessonNum);
        if (!lesson) {
          logger.warn({
            requestId,
            lessonId,
            sectionNum,
            lessonNum,
          }, 'Lesson not found in course_structure');
          continue;
        }

        // Safely parse analysis_result using runtime type guard
        const analysisResult = parseAnalysisResult(course.analysis_result);
        const spec = buildMinimalLessonSpec(lessonId, lesson, sectionNum, requestId, analysisResult);
        lessonSpecs.push(spec);
      }

      if (lessonSpecs.length === 0) {
        logger.warn({
          requestId,
          courseId,
          lessonIdsToGenerate,
        }, 'No lesson specifications built from course_structure');

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Failed to build lesson specifications from course structure',
        });
      }

      // Step 6: Enqueue all lessons using addJob with deduplication
      const courseLanguage = (course.language || 'en') as Language;
      const jobs = await Promise.all(
        lessonSpecs.map((spec) => {
          const jobData: LessonContentJobData = {
            organizationId: currentUser.organizationId,
            courseId,
            userId: currentUser.id,
            jobType: JobType.LESSON_CONTENT,
            createdAt: new Date().toISOString(),
            lessonSpec: spec,
            ragChunks: [], // Deprecated: RAG chunks are now fetched by handler via retrieveLessonContext()
            ragContextId: null,
            language: courseLanguage, // Pass course language for content generation
            locale: 'ru', // TODO: Get from user session/profile
          };

          // Deterministic job ID for deduplication
          // Format: stage6:{courseId}:{lessonId}
          const deduplicationId = `stage6:${courseId}:${spec.lesson_id}`;

          return addJob(JobType.LESSON_CONTENT, jobData, {
            priority,
            deduplication: {
              id: deduplicationId,
              ttl: 150000, // 2.5 minutes - half of job timeout to allow faster retries
            },
          });
        })
      );

      // Step 7: Log success
      logger.info({
        requestId,
        courseId,
        lessonsEnqueued: jobs.length,
        jobIds: jobs.map((j) => j.id),
        selectedLessonIds: lessonSpecs.map(s => s.lesson_id),
      }, 'Partial Stage 6 jobs enqueued');

      return {
        success: true,
        jobCount: jobs.length,
        jobIds: jobs.map((j) => j.id).filter((id): id is string => id !== undefined),
        selectedLessonIds: lessonSpecs.map(s => s.lesson_id),
      };
    } catch (error) {
      // Re-throw tRPC errors as-is
      if (error instanceof TRPCError) {
        throw error;
      }

      // Log and wrap unexpected errors
      logger.error({
        requestId,
        courseId,
        error: error instanceof Error ? error.message : String(error),
      }, 'Partial Stage 6 generation failed');

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to start partial generation',
      });
    }
  });
