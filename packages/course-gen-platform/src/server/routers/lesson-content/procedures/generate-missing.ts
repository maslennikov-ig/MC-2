/**
 * Generate Missing Content Procedure
 * @module server/routers/lesson-content/procedures/generate-missing
 *
 * Generates Stage 6 content only for lessons that do not yet have content.
 * Used after structure refinement adds new lessons, so only the new lessons
 * get content generated (instead of re-running Stage 5 or regenerating everything).
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { verifyCourseAccess, buildMinimalLessonSpec } from '../helpers';
import { addJob } from '../../../../orchestrator/queue';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { invalidateLessonUuidCache } from '../../../../shared/database/lesson-resolver';
import { JobType, parseAnalysisResult } from '@megacampus/shared-types';
import type { LessonContentJobData, Language } from '@megacampus/shared-types';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import { logger } from '../../../../shared/logger/index.js';
import { validateLocale } from '@/shared/validation';

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

type LessonWithContentRow = {
  order_index: number;
  lesson_contents: Array<{ id: string }> | null;
  sections: { order_index: number } | Array<{ order_index: number }> | null;
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

const generateMissingInputSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
  priority: z.number().int().min(1).max(10).default(7),
});

/**
 * Generate Stage 6 content for lessons that are missing content.
 *
 * This procedure:
 * 1. Fetches the course_structure from DB
 * 2. Gets ALL lesson IDs in "section.lesson" format from the structure
 * 3. Queries lesson_contents table to find which lessons already have content
 * 4. Filters to only lessons WITHOUT content
 * 5. Enqueues generation jobs for missing lessons
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * @example
 * ```typescript
 * const result = await trpc.lessonContent.generateMissingContent.mutate({
 *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
 *   priority: 7,
 * });
 * // { success: true, jobCount: 2, jobIds: [...], missingLessonIds: ['2.4', '3.1'] }
 * ```
 */
export const generateMissingContent = protectedProcedure
  .use(createRateLimiter({ requests: 5, window: 60 })) // 5 per minute
  .input(generateMissingInputSchema)
  .mutation(async ({ ctx, input }) => {
    const { courseId, priority } = input;
    const requestId = nanoid();
    const currentUser = ctx.user;

    logger.info(
      {
        requestId,
        courseId,
        userId: currentUser.id,
        organizationId: currentUser.organizationId,
        priority,
      },
      'Generate missing content request'
    );

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

      // Step 4: Build list of ALL lesson IDs from course_structure
      const allLessonIds: string[] = [];
      for (let sectionIndex = 0; sectionIndex < courseStructure.sections.length; sectionIndex++) {
        const section = courseStructure.sections[sectionIndex];
        const sectionNumber = resolveSectionNumber(section, sectionIndex);
        for (let lessonIndex = 0; lessonIndex < section.lessons.length; lessonIndex++) {
          allLessonIds.push(buildLessonId(sectionNumber, lessonIndex + 1));
        }
      }

      if (allLessonIds.length === 0) {
        return {
          success: true,
          jobCount: 0,
          jobIds: [],
          missingLessonIds: [],
          message: 'No lessons found in course structure',
        };
      }

      // Step 5: Query lessons with their content status to find which have content
      const { data: lessonsWithContent, error: lessonsError } = await supabase
        .from('lessons')
        .select(
          'id, order_index, section_id, sections!inner(order_index, course_id), lesson_contents(id)'
        )
        .eq('sections.course_id', courseId);

      if (lessonsError) {
        logger.error(
          {
            requestId,
            courseId,
            error: lessonsError,
          },
          'Failed to query lessons with content'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to query lesson content status',
        });
      }

      // Build a set of lesson IDs that already have content
      const lessonsWithContentSet = new Set<string>();
      const typedLessonsWithContent = (lessonsWithContent ?? []) as LessonWithContentRow[];
      for (const lesson of typedLessonsWithContent) {
        // lesson_contents is an array; if non-empty, the lesson has content
        const hasContent =
          Array.isArray(lesson.lesson_contents) && lesson.lesson_contents.length > 0;
        if (hasContent) {
          // sections is an inner join result - can be object or array depending on Supabase client
          const sectionData = Array.isArray(lesson.sections) ? lesson.sections[0] : lesson.sections;
          if (sectionData) {
            const lessonId = `${sectionData.order_index}.${lesson.order_index}`;
            lessonsWithContentSet.add(lessonId);
          }
        }
      }

      // Step 6: Filter to only lessons WITHOUT content
      const missingLessonIds = allLessonIds.filter(id => !lessonsWithContentSet.has(id));

      logger.info(
        {
          requestId,
          courseId,
          totalLessons: allLessonIds.length,
          lessonsWithContent: lessonsWithContentSet.size,
          missingLessons: missingLessonIds.length,
        },
        'Identified lessons missing content'
      );

      if (missingLessonIds.length === 0) {
        return {
          success: true,
          jobCount: 0,
          jobIds: [],
          missingLessonIds: [],
          message: 'All lessons already have content',
        };
      }

      // Step 7: Auto-transition FSM status for Stage 6
      const { data: statusData } = await supabase
        .from('courses')
        .select('generation_status')
        .eq('id', courseId)
        .single();

      const currentStatus = statusData?.generation_status;

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
          'Auto-approving Stage 5 and starting Stage 6 for missing content'
        );

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
            { requestId, courseId, error: updateError },
            'Failed to update generation_status to stage_6_generating'
          );
        }
      } else if (currentStatus === 'stage_5_complete') {
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
            { requestId, courseId, error: updateError },
            'Failed to update generation_status to stage_6_generating'
          );
        }
      } else if (currentStatus === 'stage_6_init') {
        const { error: updateError } = await supabase
          .from('courses')
          .update({ generation_status: 'stage_6_generating' })
          .eq('id', courseId);

        if (updateError) {
          logger.error(
            { requestId, courseId, error: updateError },
            'Failed to update generation_status to stage_6_generating'
          );
        }
      } else if (currentStatus === 'stage_6_complete') {
        // Transitioning back to generating when adding content for new lessons
        const { error: updateError } = await supabase
          .from('courses')
          .update({ generation_status: 'stage_6_generating' })
          .eq('id', courseId);

        if (updateError) {
          logger.error(
            { requestId, courseId, error: updateError },
            'Failed to update generation_status to stage_6_generating'
          );
        }
      } else if (!statusesAllowingStage6.includes(currentStatus || '')) {
        logger.warn(
          { requestId, courseId, currentStatus },
          'Course not ready for Stage 6 generation'
        );
      }

      // Step 8: Materialize sections and lessons from course_structure if not exists
      const { data: existingSections } = await supabase
        .from('sections')
        .select('id')
        .eq('course_id', courseId)
        .limit(1);

      if (!existingSections || existingSections.length === 0) {
        logger.info(
          { requestId, courseId },
          'Materializing sections and lessons from course_structure'
        );

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
              { requestId, courseId, sectionNumber, error: sectionError },
              'Failed to create section'
            );
            continue;
          }

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
      }

      // Step 9: Build lesson specifications for missing lessons
      const lessonSpecs: LessonSpecificationV2[] = [];

      for (const lessonId of missingLessonIds) {
        const parsedLessonId = parseLessonId(lessonId);
        if (!parsedLessonId) {
          logger.warn({ requestId, lessonId }, 'Invalid lesson ID format in missing lessons list');
          continue;
        }

        const { sectionNum, lessonOrder } = parsedLessonId;

        const section = courseStructure.sections.find(
          (s, sectionIndex) => resolveSectionNumber(s, sectionIndex) === sectionNum
        );
        if (!section) {
          logger.warn({ requestId, lessonId, sectionNum }, 'Section not found in course_structure');
          continue;
        }

        const lesson = findLessonByOrder(section, lessonOrder);
        if (!lesson) {
          logger.warn(
            { requestId, lessonId, sectionNum, lessonOrder },
            'Lesson not found in course_structure'
          );
          continue;
        }

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
          { requestId, courseId, missingLessonIds },
          'No lesson specifications built for missing lessons'
        );

        return {
          success: true,
          jobCount: 0,
          jobIds: [],
          missingLessonIds,
          message: 'Could not build specifications for missing lessons',
        };
      }

      // Step 9.5: Ensure all missing lessons exist in database (recreate if deleted)
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

        const { data: sectionData } = await supabase
          .from('sections')
          .select('id')
          .eq('course_id', courseId)
          .eq('order_index', sectionNum)
          .single();

        if (!sectionData) {
          logger.warn(
            { requestId, courseId, lessonId: spec.lesson_id, sectionNum },
            'Section not found in database for lesson recreation'
          );
          continue;
        }

        const { data: existingLesson } = await supabase
          .from('lessons')
          .select('id')
          .eq('section_id', sectionData.id)
          .eq('order_index', lessonOrder)
          .single();

        if (!existingLesson) {
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
                { requestId, courseId, lessonId: spec.lesson_id, error: createError },
                'Failed to recreate deleted lesson'
              );
            } else {
              await invalidateLessonUuidCache(courseId, spec.lesson_id);
              logger.info(
                { requestId, courseId, lessonId: spec.lesson_id },
                'Lesson recreated after deletion'
              );
            }
          }
        }
      }

      // Step 10: Enqueue all lessons using addJob with deduplication
      const courseLanguage = (course.language || 'en') as Language;
      const jobs = await Promise.all(
        lessonSpecs.map(spec => {
          const jobData: LessonContentJobData = {
            organizationId: currentUser.organizationId,
            courseId,
            userId: currentUser.id,
            jobType: JobType.LESSON_CONTENT,
            createdAt: new Date().toISOString(),
            lessonSpec: spec,
            ragChunks: [],
            ragContextId: null,
            language: courseLanguage,
            locale: validateLocale(courseLanguage),
          };

          const deduplicationId = `stage6:${courseId}:${spec.lesson_id}`;

          return addJob(JobType.LESSON_CONTENT, jobData, {
            priority,
            deduplication: {
              id: deduplicationId,
              ttl: 150000,
            },
          });
        })
      );

      logger.info(
        {
          requestId,
          courseId,
          lessonsEnqueued: jobs.length,
          jobIds: jobs.map(j => j.id),
          missingLessonIds: lessonSpecs.map(s => s.lesson_id),
        },
        'Missing content generation jobs enqueued'
      );

      return {
        success: true,
        jobCount: jobs.length,
        jobIds: jobs.map(j => j.id).filter((id): id is string => id !== undefined),
        missingLessonIds: lessonSpecs.map(s => s.lesson_id),
        message: `Enqueued ${jobs.length} lessons for content generation`,
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }

      logger.error(
        {
          requestId,
          courseId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Generate missing content failed'
      );

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to generate content for missing lessons',
      });
    }
  });
