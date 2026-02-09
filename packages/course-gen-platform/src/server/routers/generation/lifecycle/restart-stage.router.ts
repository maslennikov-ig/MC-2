/**
 * Restart Stage Router
 * @module server/routers/generation/lifecycle/restart-stage
 *
 * Allows restarting the generation pipeline from a specific stage (2-6).
 * Useful for error recovery or regeneration after editing content.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { instructorProcedure } from '../../../procedures';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';
import { nanoid } from 'nanoid';
import { addJob, removeJobsByCourseId } from '../../../../orchestrator/queue';
import { JobType } from '@megacampus/shared-types';
import type { JobData } from '@megacampus/shared-types';
import { isValidStyle } from '@megacampus/shared-types/style-prompts';
import type { CourseSettings, RestartStageRPCResult } from '../_shared/types';
import { buildDocumentSummaries } from '../_shared/helpers';
import { deleteVectorsForDocument } from '../../../../shared/qdrant/lifecycle';
import { validateLocale } from '@/shared/validation';

export const restartStageRouter = {
  restartStage: instructorProcedure
    .use(createRateLimiter({ requests: 5, window: 60 }))
    .input(
      z.object({
        courseId: z.string().uuid('Invalid course ID'),
        stageNumber: z.number().int().min(2).max(6),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { courseId, stageNumber } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();
      const userId = ctx.user!.id;

      try {
        logger.info({ requestId, courseId, stageNumber, userId }, 'Restart stage request received');

        // Step 1: Call RPC to reset status (handles ownership check internally)
        const { data: rpcResult, error: rpcError } = await supabase.rpc(
          'restart_from_stage' as unknown as never,
          {
            p_course_id: courseId,
            p_stage_number: stageNumber,
            p_user_id: userId,
          } as unknown as never
        );

        if (rpcError) {
          logger.error(
            { requestId, courseId, stageNumber, error: rpcError },
            'RPC restart_from_stage failed'
          );
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to restart stage',
          });
        }

        const result = rpcResult as unknown as RestartStageRPCResult;

        if (!result.success) {
          logger.warn(
            { requestId, courseId, stageNumber, rpcResult: result },
            'Restart stage rejected by RPC'
          );

          const codeMap: Record<string, 'NOT_FOUND' | 'FORBIDDEN' | 'BAD_REQUEST'> = {
            NOT_FOUND: 'NOT_FOUND',
            FORBIDDEN: 'FORBIDDEN',
            INVALID_STAGE: 'BAD_REQUEST',
            INVALID_STATE: 'BAD_REQUEST',
          };

          throw new TRPCError({
            code: codeMap[result.code || ''] || 'BAD_REQUEST',
            message: result.error || 'Failed to restart stage',
          });
        }

        // Step 2: Clean up existing jobs for this course
        try {
          const cleanupResult = await removeJobsByCourseId(courseId);
          if (cleanupResult.removed > 0) {
            logger.info(
              {
                requestId,
                courseId,
                stageNumber,
                removedJobs: cleanupResult.removed,
                errors: cleanupResult.errors,
              },
              'Cleaned up existing jobs before restart'
            );
          }
        } catch (cleanupError) {
          logger.warn(
            {
              requestId,
              courseId,
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
            },
            'Failed to clean up existing jobs, continuing with restart'
          );
        }

        // Step 2.5: Clear Phase 1 Redis cache (stale on restart)
        if (stageNumber >= 4) {
          try {
            const { getRedisClient } = await import('../../../../shared/cache/redis');
            const redis = getRedisClient();
            await redis.del(`phase1_cache:${courseId}`);
            logger.debug({ requestId, courseId }, 'Cleared Phase 1 Redis cache');
          } catch (cacheError) {
            logger.debug(
              {
                requestId,
                courseId,
                error: cacheError instanceof Error ? cacheError.message : String(cacheError),
              },
              'Failed to clear Phase 1 Redis cache (non-fatal)'
            );
          }
        }

        // Step 3: Queue the appropriate job based on stage
        let jobId: string | undefined;
        const organizationId = result.organizationId || ctx.user!.organizationId;

        const { data: course } = await supabase
          .from('courses')
          .select('title, settings, language, course_size')
          .eq('id', courseId)
          .single();

        const baseJobData = {
          organizationId,
          courseId,
          userId,
          createdAt: new Date().toISOString(),
          locale: validateLocale(course?.language),
        };

        if (stageNumber === 2) {
          // Stage 2: Re-process documents
          const { data: files } = await supabase
            .from('file_catalog')
            .select('id, storage_path, mime_type')
            .eq('course_id', courseId);

          if (files && files.length > 0) {
            logger.info(
              { requestId, courseId, fileCount: files.length },
              'Deleting vectors for all course documents before Stage 2 restart'
            );
            for (const file of files) {
              await deleteVectorsForDocument(file.id, courseId);
            }

            await supabase
              .from('file_catalog')
              .update({ vector_status: 'pending' })
              .eq('course_id', courseId);

            for (const file of files) {
              const absoluteFilePath = `${process.env.DOCLING_UPLOADS_BASE_PATH || process.cwd()}/${file.storage_path}`;
              const job = await addJob(JobType.DOCUMENT_PROCESSING, {
                ...baseJobData,
                jobType: JobType.DOCUMENT_PROCESSING,
                fileId: file.id,
                filePath: absoluteFilePath,
                mimeType: file.mime_type,
                chunkSize: 512,
                chunkOverlap: 50,
              } as JobData);
              jobId = job.id;
            }
          }
        } else if (stageNumber === 3) {
          // Stage 3: Classification
          const job = await addJob(JobType.DOCUMENT_CLASSIFICATION, {
            ...baseJobData,
            jobType: JobType.DOCUMENT_CLASSIFICATION,
          } as JobData);
          jobId = job.id;
        } else if (stageNumber === 4) {
          // Stage 4: Analysis
          const job = await addJob(JobType.STRUCTURE_ANALYSIS, {
            ...baseJobData,
            jobType: JobType.STRUCTURE_ANALYSIS,
            title: course?.title,
            settings: course?.settings,
            courseSize: course?.course_size || null,
          } as JobData);
          jobId = job.id;
        } else if (stageNumber === 5) {
          // Stage 5: Structure Generation - requires full job input with analysis_result
          const { data: fullCourse, error: fullCourseError } = await supabase
            .from('courses')
            .select(
              'title, settings, language, style, target_audience, difficulty, analysis_result, organization_id'
            )
            .eq('id', courseId)
            .single();

          if (fullCourseError || !fullCourse) {
            logger.error(
              { requestId, courseId, error: fullCourseError },
              'Failed to fetch course for Stage 5 restart'
            );
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to fetch course data',
            });
          }

          if (!fullCourse.analysis_result) {
            logger.warn(
              { requestId, courseId },
              'Cannot restart Stage 5: analysis_result is missing'
            );
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

          // Build GenerationJobInput-shaped object for Stage 5
          // Note: This matches GenerationJobInput schema (snake_case) but we can't annotate it
          // directly because Supabase returns broad types (string vs literal unions).
          // BullMQ serializes as JSON — the Stage 5 worker validates with GenerationJobInputSchema.
          // TODO: Align StructureGenerationJobData schema with GenerationJobInput in bullmq-jobs.ts
          const stage5JobInput = {
            course_id: courseId,
            organization_id: fullCourse.organization_id,
            user_id: userId,
            analysis_result: fullCourse.analysis_result,
            frontend_parameters: {
              course_title: fullCourse.title,
              language: fullCourse.language ?? undefined,
              style:
                fullCourse.style && isValidStyle(fullCourse.style) ? fullCourse.style : undefined,
              target_audience: fullCourse.target_audience ?? undefined,
              difficulty: fullCourse.difficulty ?? 'intermediate',
              desired_lessons_count: (fullCourse.settings as unknown as CourseSettings)
                ?.desired_lessons_count,
              desired_modules_count: (fullCourse.settings as unknown as CourseSettings)
                ?.desired_modules_count,
              lesson_duration_minutes: (fullCourse.settings as unknown as CourseSettings)
                ?.lesson_duration_minutes,
              learning_outcomes: (fullCourse.settings as unknown as CourseSettings)
                ?.learning_outcomes,
            },
            vectorized_documents: hasVectorizedDocs,
            document_summaries: documentSummaries,
          };

          const job = await addJob(
            JobType.STRUCTURE_GENERATION,
            stage5JobInput as unknown as JobData
          );
          jobId = job.id;
        }
        // Stage 6: Triggered automatically when Stage 5 completes

        logger.info(
          {
            requestId,
            courseId,
            stageNumber,
            previousStatus: result.previousStatus,
            newStatus: result.newStatus,
            jobId,
          },
          'Stage restart initiated successfully'
        );

        return {
          success: true,
          jobId,
          previousStatus: result.previousStatus,
          newStatus: result.newStatus,
          stageNumber,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error(
          {
            requestId,
            courseId,
            stageNumber,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in restartStage'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to restart stage',
        });
      }
    }),
};
