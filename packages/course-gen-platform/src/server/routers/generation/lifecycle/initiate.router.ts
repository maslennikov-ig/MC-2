/**
 * Initiate Router
 * @module server/routers/generation/lifecycle/initiate
 *
 * Starts the course generation pipeline. Routes to Stage 2 (document processing)
 * if files are uploaded, Stage 3 (classification) if all files deduplicated,
 * or directly to Stage 4 (analysis) for title-only courses.
 */

import { TRPCError } from '@trpc/server';
import { instructorProcedure } from '../../../procedures';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';
import { nanoid } from 'nanoid';
import { JobType } from '@megacampus/shared-types';
import { initiateGenerationInputSchema } from '../_shared/schemas';
import { TIER_PRIORITY } from '../_shared/constants';
import { extractTierFromOrg, checkConcurrencyLimits } from '../_shared/helpers';
import { InitializeFSMCommandHandler } from '../../../../shared/fsm/fsm-initialization-command-handler';
import { generateGenerationCode } from '../../../../shared/utils/generation-code';
import { workerReadiness, getReadinessFromRedis } from '../../../../orchestrator/worker-readiness';
import { logTrace } from '../../../../shared/trace-logger';
import { validateLocale } from '@/shared/validation';
import { assertCourseAccess, buildAuthContext } from '../../../helpers/course-authorization';
import { throwOnSupabaseError } from '../../../utils/supabase-query-guard';
import * as path from 'path';

export const initiateRouter = {
  initiate: instructorProcedure
    .use(createRateLimiter({ requests: 10, window: 60 }))
    .input(initiateGenerationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { courseId, webhookUrl } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();
      const currentUser = ctx.user!;
      const userId = currentUser.id;

      try {
        // Verify course ownership and get organization tier
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select(
            '*, language, course_size, course_description, estimated_lessons, estimated_sections, learning_outcomes, organization:organizations(tier)'
          )
          .eq('id', courseId)
          .single();

        throwOnSupabaseError(courseError, 'Course', { requestId, userId, courseId });
        if (!course) throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });

        assertCourseAccess(buildAuthContext(currentUser), course, 'initiate generation');

        const tier = extractTierFromOrg(
          course as unknown as { organization?: { tier?: string | null } | null }
        );

        logger.info({ requestId, userId, tier, courseId }, 'Course generation request');

        // Check concurrency limits
        await checkConcurrencyLimits({ userId, tier, courseId, requestId, supabase });

        // Check worker readiness before accepting new jobs
        const redisReadiness = await getReadinessFromRedis();
        const readinessStatus = redisReadiness || workerReadiness.getStatus();
        if (!readinessStatus.ready) {
          const failedChecks = readinessStatus.checks.filter(c => !c.passed).map(c => c.name);

          logger.warn(
            { requestId, userId, courseId, readinessStatus, failedChecks },
            'Worker not ready - rejecting generation request'
          );

          throw new TRPCError({
            code: 'SERVICE_UNAVAILABLE',
            message: `Worker is not ready to process jobs. ${
              failedChecks.length > 0
                ? `Failed checks: ${failedChecks.join(', ')}.`
                : 'Pre-flight checks pending.'
            } Please try again in a few moments.`,
          });
        }

        // Determine job type based on uploaded files
        // Query 1: Files with pending vector_status (need Stage 2 processing)
        const { data: pendingFiles, error: pendingFilesError } = await supabase
          .from('file_catalog')
          .select('id, storage_path, mime_type')
          .eq('course_id', courseId)
          .eq('vector_status', 'pending');

        if (pendingFilesError) {
          logger.error(
            { requestId, courseId, error: pendingFilesError },
            'Failed to check pending files'
          );
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch uploaded files',
          });
        }

        // Query 2: All files regardless of status (for Stage 3 decision)
        const { data: allFiles, error: allFilesError } = await supabase
          .from('file_catalog')
          .select('id')
          .eq('course_id', courseId);

        if (allFilesError) {
          logger.error({ requestId, courseId, error: allFilesError }, 'Failed to check all files');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch course files',
          });
        }

        const hasPendingFiles = pendingFiles && pendingFiles.length > 0;
        const hasAnyFiles = allFiles && allFiles.length > 0;
        const priority = TIER_PRIORITY[tier] || 1;

        logger.info(
          {
            requestId,
            courseId,
            hasPendingFiles,
            hasAnyFiles,
            pendingFilesCount: pendingFiles?.length || 0,
            totalFilesCount: allFiles?.length || 0,
          },
          'Determined generation path'
        );

        // Three-path decision logic:
        // 1. hasPendingFiles=true -> Stage 2 (process documents)
        // 2. hasPendingFiles=false && hasAnyFiles=true -> Stage 3 (classify deduplicated docs)
        // 3. hasAnyFiles=false -> Stage 4 (no documents at all)
        let jobs: Array<{
          queue: string;
          data: Record<string, unknown>;
          options?: Record<string, unknown>;
        }>;
        let initialState: string;

        if (hasPendingFiles) {
          // Path 1: Document processing
          jobs = pendingFiles.map(file => {
            const absoluteFilePath = path.join(
              process.env.DOCLING_UPLOADS_BASE_PATH || process.cwd(),
              file.storage_path
            );

            return {
              queue: JobType.DOCUMENT_PROCESSING,
              data: {
                jobType: JobType.DOCUMENT_PROCESSING,
                organizationId: currentUser.organizationId,
                courseId,
                userId,
                createdAt: new Date().toISOString(),
                fileId: file.id,
                filePath: absoluteFilePath,
                mimeType: file.mime_type,
                chunkSize: 512,
                chunkOverlap: 50,
                locale: validateLocale(course.language),
              },
              options: { priority },
            };
          });
          initialState = 'stage_2_init';

          logger.info(
            { requestId, courseId, fileCount: pendingFiles.length },
            'Course generation path: document processing (Stage 2)'
          );
        } else if (hasAnyFiles) {
          // Path 2: All files already indexed - skip to Stage 3 for classification
          jobs = [
            {
              queue: JobType.DOCUMENT_CLASSIFICATION,
              data: {
                jobType: JobType.DOCUMENT_CLASSIFICATION,
                organizationId: currentUser.organizationId,
                courseId,
                userId,
                createdAt: new Date().toISOString(),
                locale: validateLocale(course.language),
              },
              options: { priority },
            },
          ];
          initialState = 'stage_3_init';

          // Log trace for each deduplicated file
          for (const file of allFiles) {
            await logTrace({
              courseId,
              stage: 'stage_2',
              phase: 'skip',
              stepName: 'deduplicated',
              inputData: { fileId: file.id, reason: 'already_indexed' },
              durationMs: 0,
            });
          }

          logger.info(
            { requestId, courseId, fileCount: allFiles.length },
            'Course generation path: classification only (Stage 3, all docs deduplicated/indexed)'
          );
        } else {
          // Path 3: Analysis-only (no files at all, skip to Stage 4)
          jobs = [
            {
              queue: JobType.STRUCTURE_ANALYSIS,
              data: {
                jobType: JobType.STRUCTURE_ANALYSIS,
                organizationId: currentUser.organizationId,
                courseId,
                userId,
                createdAt: new Date().toISOString(),
                webhookUrl: webhookUrl || null,
                title: course.title,
                settings: course.settings,
                courseSize: course.course_size || null,
              },
              options: { priority },
            },
          ];
          initialState = 'stage_4_init';

          logger.info(
            { requestId, courseId, courseSize: course.course_size },
            'Course generation path: analysis-only (Stage 4, no documents)'
          );
        }

        // Execute FSM init + outbox creation
        const commandHandler = new InitializeFSMCommandHandler();

        const result = await commandHandler.handle({
          entityId: courseId,
          userId,
          organizationId: currentUser.organizationId,
          idempotencyKey: `generation-${courseId}-${Date.now()}`,
          initiatedBy: 'API',
          initialState,
          data: {
            courseTitle: course.title,
            fileCount: allFiles?.length || 0,
            hasFiles: hasAnyFiles,
            hasPendingFiles,
          },
          jobs,
        });

        // Generate human-readable code for debugging
        const generationCode = generateGenerationCode();

        const { error: updateError } = await supabase
          .from('courses')
          .update({
            generation_code: generationCode,
            generation_started_at: new Date().toISOString(),
          })
          .eq('id', courseId);

        if (updateError) {
          logger.warn(
            { requestId, courseId, error: updateError },
            'Failed to save generation code'
          );
        }

        logger.info(
          {
            requestId,
            courseId,
            generationCode,
            jobCount: result.outboxEntries.length,
            fromCache: result.fromCache,
            initialState,
          },
          'Course generation initiated via transactional outbox'
        );

        return {
          success: true,
          jobId: result.outboxEntries[0]?.outbox_id,
          message: 'Генерация курса инициализирована',
          courseId,
          generationCode,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error(
          {
            requestId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in generation.initiate'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        });
      }
    }),
};
