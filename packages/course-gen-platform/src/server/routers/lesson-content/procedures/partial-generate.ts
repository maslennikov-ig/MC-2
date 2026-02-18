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
import { createStage6Queue } from '../../../../stages/stage6-lesson-content/factory';
import type { Stage6JobInput } from '../../../../stages/stage6-lesson-content/types';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { invalidateLessonUuidCache } from '../../../../shared/database/lesson-resolver';
import { JobType, parseAnalysisResult } from '@megacampus/shared-types';
import type { Language, CourseStyle } from '@megacampus/shared-types';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import { logger } from '../../../../shared/logger/index.js';

type LessonFromStructure = {
  lesson_number: number;
  lesson_title: string;
  lesson_objectives?: string[];
  key_topics?: string[];
  estimated_duration_minutes?: number;
  difficulty_level?: 'beginner' | 'intermediate' | 'advanced';
};

type SectionFromStructure = {
  section_number?: number;
  section_title: string;
  lessons: LessonFromStructure[];
};

function buildLessonId(sectionNumber: number, lessonOrder: number): string {
  return `${sectionNumber}.${lessonOrder}`;
}

function resolveSectionNumber(section: SectionFromStructure, sectionIndex: number): number {
  return section.section_number ?? sectionIndex + 1;
}

function parseLessonId(lessonId: string): { sectionNum: number; lessonOrder: number } | null {
  const match = lessonId.match(/^(\d+)\.(\d+)$/);
  if (!match) return null;

  const sectionNum = parseInt(match[1], 10);
  const lessonOrder = parseInt(match[2], 10);

  if (sectionNum <= 0 || lessonOrder <= 0) return null;

  return { sectionNum, lessonOrder };
}

function findLessonByOrder(
  section: SectionFromStructure,
  lessonOrder: number
): LessonFromStructure | null {
  const lesson = section.lessons[lessonOrder - 1];
  return lesson ?? null;
}

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

    logger.info(
      {
        requestId,
        courseId,
        userId: currentUser.id,
        organizationId: currentUser.organizationId,
        lessonIds,
        sectionIds,
        priority,
      },
      'Partial Stage 6 generation request'
    );

    try {
      // Step 1: Verify course access
      await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

      // Step 2: Fetch course_structure and language from database
      const supabase = getSupabaseAdmin();

      const { data: course, error: courseError } = await supabase
        .from('courses')
        .select('course_structure, language, analysis_result, style')
        .eq('id', courseId)
        .single();

      if (courseError || !course) {
        logger.error(
          {
            requestId,
            courseId,
            error: courseError,
          },
          'Failed to fetch course structure'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch course structure',
        });
      }

      // Step 3: Validate course_structure exists
      const courseStructure = course.course_structure as {
        sections: SectionFromStructure[];
      } | null;

      if (!courseStructure || !courseStructure.sections) {
        logger.warn(
          {
            requestId,
            courseId,
          },
          'Course structure is missing - Stage 5 may not be completed'
        );

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

      // Stage 6 status flow: stage_5_complete -> stage_6_init -> stage_6_generating -> stage_6_complete
      // When user starts generation, we transition to stage_6_generating
      const statusesAllowingStage6 = [
        'stage_5_complete',
        'stage_5_awaiting_approval',
        'stage_6_init',
        'stage_6_generating',
        'stage_6_complete',
      ];

      if (currentStatus === 'stage_5_awaiting_approval') {
        logger.info(
          {
            requestId,
            courseId,
            currentStatus,
          },
          'Auto-approving Stage 5 and starting Stage 6'
        );

        // FSM requires: stage_5_awaiting_approval -> stage_6_init -> stage_6_generating
        // First transition to stage_6_init
        await supabase
          .from('courses')
          .update({ generation_status: 'stage_6_init' })
          .eq('id', courseId);

        // Then transition to stage_6_generating
        const { error: updateError } = await supabase
          .from('courses')
          .update({ generation_status: 'stage_6_generating' })
          .eq('id', courseId);

        if (updateError) {
          logger.error(
            {
              requestId,
              courseId,
              error: updateError,
            },
            'Failed to update generation_status to stage_6_generating'
          );
        }
      } else if (currentStatus === 'stage_5_complete') {
        // FSM requires: stage_5_complete -> stage_6_init -> stage_6_generating
        await supabase
          .from('courses')
          .update({ generation_status: 'stage_6_init' })
          .eq('id', courseId);

        const { error: updateError } = await supabase
          .from('courses')
          .update({ generation_status: 'stage_6_generating' })
          .eq('id', courseId);

        if (updateError) {
          logger.error(
            {
              requestId,
              courseId,
              error: updateError,
            },
            'Failed to update generation_status to stage_6_generating'
          );
        }

        logger.info(
          {
            requestId,
            courseId,
          },
          'Started Stage 6 generation from stage_5_complete'
        );
      } else if (currentStatus === 'stage_6_init') {
        // Transition to stage_6_generating when starting generation
        logger.info(
          {
            requestId,
            courseId,
            currentStatus,
          },
          'Starting Stage 6 generation'
        );

        const { error: updateError } = await supabase
          .from('courses')
          .update({ generation_status: 'stage_6_generating' })
          .eq('id', courseId);

        if (updateError) {
          logger.error(
            {
              requestId,
              courseId,
              error: updateError,
            },
            'Failed to update generation_status to stage_6_generating'
          );
        }
      } else if (!statusesAllowingStage6.includes(currentStatus || '')) {
        logger.warn(
          {
            requestId,
            courseId,
            currentStatus,
          },
          'Course not ready for Stage 6 generation'
        );
      }

      // Step 3.6: Materialize sections and lessons from course_structure if not exists
      // This runs regardless of status - ensures DB has actual section/lesson records
      const { data: existingSections } = await supabase
        .from('sections')
        .select('id')
        .eq('course_id', courseId)
        .limit(1);

      if (!existingSections || existingSections.length === 0) {
        logger.info(
          {
            requestId,
            courseId,
          },
          'Materializing sections and lessons from course_structure'
        );

        // Create sections
        for (let sectionIndex = 0; sectionIndex < courseStructure.sections.length; sectionIndex++) {
          const section = courseStructure.sections[sectionIndex];
          const sectionNumber = resolveSectionNumber(section, sectionIndex);
          const { data: newSection, error: sectionError } = await supabase
            .from('sections')
            .insert({
              course_id: courseId,
              title: section.section_title,
              order_index: sectionNumber,
            })
            .select('id')
            .single();

          if (sectionError || !newSection) {
            logger.error(
              {
                requestId,
                courseId,
                sectionNumber,
                error: sectionError,
              },
              'Failed to create section'
            );
            continue;
          }

          // Create lessons for this section
          for (let lessonIndex = 0; lessonIndex < section.lessons.length; lessonIndex++) {
            const lesson = section.lessons[lessonIndex];
            const { error: lessonError } = await supabase.from('lessons').insert({
              section_id: newSection.id,
              title: lesson.lesson_title,
              order_index: lessonIndex + 1,
              lesson_type: 'text',
              duration_minutes: lesson.estimated_duration_minutes || 15,
              objectives: lesson.lesson_objectives || [],
            });

            if (lessonError) {
              logger.error(
                {
                  requestId,
                  courseId,
                  lessonId: buildLessonId(sectionNumber, lessonIndex + 1),
                  error: lessonError,
                },
                'Failed to create lesson'
              );
            }
          }
        }

        logger.info(
          {
            requestId,
            courseId,
            sectionsCount: courseStructure.sections.length,
          },
          'Sections and lessons materialized successfully'
        );
      }

      // Step 4: Build list of lesson IDs to generate
      const lessonIdsToGenerate: string[] = [];

      if (lessonIds && lessonIds.length > 0) {
        // Use provided lesson IDs
        lessonIdsToGenerate.push(...lessonIds);
      } else if (sectionIds && sectionIds.length > 0) {
        // Build lesson IDs from section IDs
        for (const sectionId of sectionIds) {
          const sectionIndex = courseStructure.sections.findIndex(
            (s, idx) => resolveSectionNumber(s, idx) === sectionId
          );
          if (sectionIndex !== -1) {
            const section = courseStructure.sections[sectionIndex];
            for (let lessonIndex = 0; lessonIndex < section.lessons.length; lessonIndex++) {
              lessonIdsToGenerate.push(buildLessonId(sectionId, lessonIndex + 1));
            }
          }
        }
      }

      if (lessonIdsToGenerate.length === 0) {
        logger.warn(
          {
            requestId,
            courseId,
            lessonIds,
            sectionIds,
          },
          'No lessons found to generate'
        );

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No valid lessons found for the provided IDs',
        });
      }

      // Step 5: Build lesson specifications from course_structure
      const lessonSpecs: LessonSpecificationV2[] = [];

      for (const lessonId of lessonIdsToGenerate) {
        const parsedLessonId = parseLessonId(lessonId);
        if (!parsedLessonId) {
          logger.warn({ requestId, lessonId }, 'Invalid lesson ID format');
          continue;
        }

        const { sectionNum, lessonOrder } = parsedLessonId;

        const section = courseStructure.sections.find(
          (s, sectionIndex) => resolveSectionNumber(s, sectionIndex) === sectionNum
        );
        if (!section) {
          logger.warn(
            {
              requestId,
              lessonId,
              sectionNum,
            },
            'Section not found in course_structure'
          );
          continue;
        }

        const lesson = findLessonByOrder(section, lessonOrder);
        if (!lesson) {
          logger.warn(
            {
              requestId,
              lessonId,
              sectionNum,
              lessonOrder,
            },
            'Lesson not found in course_structure'
          );
          continue;
        }

        // Safely parse analysis_result using runtime type guard
        const analysisResult = parseAnalysisResult(course.analysis_result);
        const spec = buildMinimalLessonSpec(
          lessonId,
          lesson,
          sectionNum,
          requestId,
          analysisResult
        );
        lessonSpecs.push(spec);
      }

      if (lessonSpecs.length === 0) {
        logger.warn(
          {
            requestId,
            courseId,
            lessonIdsToGenerate,
          },
          'No lesson specifications built from course_structure'
        );

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Failed to build lesson specifications from course structure',
        });
      }

      // Step 5.5: Ensure all lessons exist in database (recreate if deleted)
      // This handles the case where a lesson was deleted but user wants to regenerate it
      for (const spec of lessonSpecs) {
        const parsedLessonId = parseLessonId(spec.lesson_id);
        if (!parsedLessonId) {
          logger.warn(
            { requestId, courseId, lessonId: spec.lesson_id },
            'Invalid lesson ID format while recreating lessons'
          );
          continue;
        }

        const { sectionNum, lessonOrder } = parsedLessonId;

        // Find section ID
        const { data: sectionData } = await supabase
          .from('sections')
          .select('id')
          .eq('course_id', courseId)
          .eq('order_index', sectionNum)
          .single();

        if (!sectionData) {
          logger.warn(
            {
              requestId,
              courseId,
              lessonId: spec.lesson_id,
              sectionNum,
            },
            'Section not found in database for lesson recreation'
          );
          continue;
        }

        // Check if lesson exists
        const { data: existingLesson } = await supabase
          .from('lessons')
          .select('id')
          .eq('section_id', sectionData.id)
          .eq('order_index', lessonOrder)
          .single();

        if (!existingLesson) {
          // Lesson was deleted - recreate it from course_structure
          const section = courseStructure.sections.find(
            (s, sectionIndex) => resolveSectionNumber(s, sectionIndex) === sectionNum
          );
          const lesson = section ? findLessonByOrder(section, lessonOrder) : null;

          if (lesson) {
            const { error: createError } = await supabase.from('lessons').insert({
              section_id: sectionData.id,
              title: lesson.lesson_title,
              order_index: lessonOrder,
              lesson_type: 'text',
              duration_minutes: lesson.estimated_duration_minutes || 15,
              objectives: lesson.lesson_objectives || [],
            });

            if (createError) {
              logger.error(
                {
                  requestId,
                  courseId,
                  lessonId: spec.lesson_id,
                  error: createError,
                },
                'Failed to recreate deleted lesson'
              );
            } else {
              // Invalidate UUID cache so worker can resolve the new lesson
              await invalidateLessonUuidCache(courseId, spec.lesson_id);

              logger.info(
                {
                  requestId,
                  courseId,
                  lessonId: spec.lesson_id,
                },
                'Lesson recreated after deletion'
              );
            }
          }
        }
      }

      // Step 6: Enqueue all lessons using dedicated Stage 6 queue (30 concurrent workers)
      const courseLanguage = (course.language || 'en') as Language;
      const stage6Queue = createStage6Queue();
      const jobs = await Promise.all(
        lessonSpecs.map(spec => {
          const jobData: Stage6JobInput = {
            lessonSpec: spec,
            courseId,
            language: courseLanguage,
            style: (course.style as CourseStyle | null) ?? undefined,
            ragChunks: [],
            ragContextId: null,
            skipCompletionCheck: true,
            // For job_status tracking
            organizationId: currentUser.organizationId,
            userId: currentUser.id,
            jobType: JobType.LESSON_CONTENT,
          };

          // Deterministic job ID for deduplication
          const jobName = `lesson:${spec.lesson_id}`;
          const deduplicationId = `stage6:${courseId}:${spec.lesson_id}`;

          return stage6Queue.add(jobName, jobData, {
            priority,
            jobId: deduplicationId,
          });
        })
      );

      // Step 7: Log success
      logger.info(
        {
          requestId,
          courseId,
          lessonsEnqueued: jobs.length,
          jobIds: jobs.map(j => j.id),
          selectedLessonIds: lessonSpecs.map(s => s.lesson_id),
        },
        'Partial Stage 6 jobs enqueued'
      );

      return {
        success: true,
        jobCount: jobs.length,
        jobIds: jobs.map(j => j.id).filter((id): id is string => id !== undefined),
        selectedLessonIds: lessonSpecs.map(s => s.lesson_id),
      };
    } catch (error) {
      // Re-throw tRPC errors as-is
      if (error instanceof TRPCError) {
        throw error;
      }

      // Log and wrap unexpected errors
      logger.error(
        {
          requestId,
          courseId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Partial Stage 6 generation failed'
      );

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to start partial generation',
      });
    }
  });
