/**
 * Generate Router
 * @module server/routers/generation/lifecycle/generate
 *
 * Initiates Stage 5 structure generation after Stage 4 analysis completes.
 * Requires analysis_result to be present. Creates BullMQ job for async processing.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { instructorProcedure } from '../../../procedures';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';
import { nanoid } from 'nanoid';
import { addJob } from '../../../../orchestrator/queue';
import { JobType } from '@megacampus/shared-types';
import type { Database, JobData } from '@megacampus/shared-types';
import { isValidStyle, DEFAULT_COURSE_STYLE } from '@megacampus/shared-types/style-prompts';
import { TIER_PRIORITY } from '../_shared/constants';
import type { CourseSettings } from '../_shared/types';
import {
  extractTierFromOrg,
  checkConcurrencyLimits,
  buildDocumentSummaries,
} from '../_shared/helpers';
import { assertCourseAccess, buildAuthContext } from '../../../helpers/course-authorization';
import { throwOnSupabaseError } from '../../../utils/supabase-query-guard';

export const generateRouter = {
  generate: instructorProcedure
    .use(createRateLimiter({ requests: 10, window: 60 }))
    .input(z.object({ courseId: z.string().uuid('Invalid course ID') }))
    .mutation(async ({ ctx, input }) => {
      const { courseId } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();
      const currentUser = ctx.user!;
      const userId = currentUser.id;

      try {
        // Step 1: Verify course ownership and get organization tier
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('*, organization:organizations(tier)')
          .eq('id', courseId)
          .single();

        throwOnSupabaseError(courseError, 'Course', { requestId, userId, courseId });
        if (!course) throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });

        assertCourseAccess(buildAuthContext(currentUser), course, 'generate course');

        const tier = extractTierFromOrg(
          course as unknown as { organization?: { tier?: string | null } | null }
        );
        logger.info({ requestId, userId, tier, courseId }, 'Generation request');

        // Step 2: Validate generation status (allow retry if failed)
        const generationStatus = course.generation_status as string;
        const inProgressStatuses = [
          'generating',
          'queued',
          'stage_2_init',
          'stage_2_processing',
          'stage_2_complete',
          'stage_3_init',
          'stage_3_summarizing',
          'stage_3_complete',
          'stage_4_init',
          'stage_4_analyzing',
          'stage_4_complete',
          'stage_5_init',
          'stage_5_generating',
          'stage_5_complete',
          'finalizing',
        ];
        if (inProgressStatuses.includes(generationStatus)) {
          logger.warn(
            { requestId, courseId, status: generationStatus },
            'Generation already in progress'
          );
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Course generation already in progress',
          });
        }

        // Step 3: Check concurrency limits
        await checkConcurrencyLimits({ userId, tier, courseId, requestId, supabase });

        // Step 4: Fetch analysis_result and document summaries
        const analysisResult = course.analysis_result;

        if (!analysisResult) {
          logger.warn({ requestId, courseId }, 'Cannot generate: analysis_result is missing');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Course analysis must be completed before generating structure. Please complete Stage 4 analysis first.',
          });
        }

        const { hasVectorizedDocs, documentSummaries } = await buildDocumentSummaries(
          supabase,
          courseId,
          requestId
        );

        // Step 5: Build GenerationJobInput
        const MAX_DESCRIPTION_LENGTH = 7000;
        const MAX_LEARNING_OUTCOMES = 20;
        const MAX_ESTIMATED_LESSONS = 200;
        const MAX_ESTIMATED_SECTIONS = 50;

        if (
          course.course_description &&
          course.course_description.length > MAX_DESCRIPTION_LENGTH
        ) {
          logger.warn(
            { requestId, courseId, descriptionLength: course.course_description.length },
            `Course description exceeds ${MAX_DESCRIPTION_LENGTH} chars (frontend validation bypassed?)`
          );
        }

        // Parse learning_outcomes: can be JSON array string or newline-separated string
        let parsedLearningOutcomes: string[] | undefined;
        if (course.learning_outcomes) {
          if (typeof course.learning_outcomes === 'string') {
            try {
              parsedLearningOutcomes = JSON.parse(course.learning_outcomes) as string[];
            } catch (parseError) {
              logger.warn(
                {
                  requestId,
                  courseId,
                  error: parseError instanceof Error ? parseError.message : 'Unknown',
                  rawValueLength: course.learning_outcomes.length,
                },
                'Failed to parse learning_outcomes as JSON, using newline fallback'
              );
              parsedLearningOutcomes = course.learning_outcomes
                .split('\n')
                .map((s: string) => s.trim())
                .filter(Boolean);
            }
          } else if (Array.isArray(course.learning_outcomes)) {
            parsedLearningOutcomes = course.learning_outcomes;
          }
        }

        if (parsedLearningOutcomes && parsedLearningOutcomes.length > MAX_LEARNING_OUTCOMES) {
          logger.warn(
            { requestId, courseId, count: parsedLearningOutcomes.length },
            `Learning outcomes exceed ${MAX_LEARNING_OUTCOMES} items (frontend validation bypassed?)`
          );
        }

        if (
          course.estimated_lessons &&
          (course.estimated_lessons < 1 || course.estimated_lessons > MAX_ESTIMATED_LESSONS)
        ) {
          logger.warn(
            { requestId, courseId, value: course.estimated_lessons },
            `estimated_lessons out of recommended range (1-${MAX_ESTIMATED_LESSONS})`
          );
        }
        if (
          course.estimated_sections &&
          (course.estimated_sections < 1 || course.estimated_sections > MAX_ESTIMATED_SECTIONS)
        ) {
          logger.warn(
            { requestId, courseId, value: course.estimated_sections },
            `estimated_sections out of recommended range (1-${MAX_ESTIMATED_SECTIONS})`
          );
        }

        // Step 6: Build GenerationJobInput-shaped object for Stage 5
        // Note: Cannot annotate as GenerationJobInput directly because Supabase returns
        // broad types (Json, string) that don't match strict Zod-inferred literal unions
        // (e.g., 'beginner'|'intermediate'|'advanced' for difficulty).
        // BullMQ serializes as JSON — the Stage 5 worker validates with GenerationJobInputSchema.
        // TODO: Align StructureGenerationJobData schema with GenerationJobInput in bullmq-jobs.ts
        const jobInput = {
          course_id: courseId,
          organization_id: course.organization_id,
          user_id: userId,
          analysis_result: analysisResult,
          frontend_parameters: {
            course_title: course.title,
            language: course.language ?? undefined,
            style: course.style && isValidStyle(course.style) ? course.style : DEFAULT_COURSE_STYLE,
            target_audience: course.target_audience ?? undefined,
            difficulty: course.difficulty ?? 'intermediate',
            description: course.course_description ?? undefined,
            course_size: course.course_size ?? undefined,
            desired_lessons_count: course.estimated_lessons ?? undefined,
            desired_modules_count: course.estimated_sections ?? undefined,
            lesson_duration_minutes: (course.settings as unknown as CourseSettings)
              ?.lesson_duration_minutes,
            learning_outcomes: parsedLearningOutcomes,
          },
          vectorized_documents: hasVectorizedDocs,
          document_summaries: documentSummaries,
        };

        // Create BullMQ job
        // Note: GenerationJobInput uses snake_case fields while JobData union uses camelCase.
        // BullMQ serializes as JSON — the Stage 5 worker reads GenerationJobInput fields directly.
        // TODO: Align StructureGenerationJobData schema with GenerationJobInput in bullmq-jobs.ts
        const priority = TIER_PRIORITY[tier] || 1;
        const jobType = JobType.STRUCTURE_GENERATION;

        const job = await addJob(jobType, jobInput as unknown as JobData, { priority });
        const jobId = job.id as string;

        logger.info(
          {
            requestId,
            jobId,
            courseId,
            priority,
            hasVectorizedDocs,
            documentCount: documentSummaries.length,
          },
          'Generation job created'
        );

        // Step 7: Update course status
        await supabase
          .from('courses')
          .update({
            generation_status:
              'queued' as unknown as Database['public']['Enums']['generation_status'],
            updated_at: new Date().toISOString(),
          })
          .eq('id', courseId);

        logger.info({ requestId, jobId, courseId }, 'Course generation initiated successfully');

        return {
          jobId,
          status: 'queued' as const,
          estimatedDuration: 150000,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error(
          {
            requestId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in generation.generate'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        });
      }
    }),
};
