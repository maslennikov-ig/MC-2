/**
 * Lifecycle Router
 * @module server/routers/generation/lifecycle
 *
 * Handles course generation lifecycle operations:
 * - initiate: Start course generation from Stage 2 (with documents) or Stage 4 (no documents)
 * - generate: Initiate Stage 5 structure generation after Stage 4 analysis
 * - restartStage: Restart generation from a specific stage (2-6)
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { instructorProcedure } from '../../procedures';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import { nanoid } from 'nanoid';
import { addJob, removeJobsByCourseId } from '../../../orchestrator/queue';
import { JobType } from '@megacampus/shared-types';
import type { Database, JobData } from '@megacampus/shared-types';
import { initiateGenerationInputSchema } from './_shared/schemas';
import { TIER_PRIORITY } from './_shared/constants';
import type { ConcurrencyCheckResult, CourseSettings } from './_shared/types';
import { ConcurrencyTracker } from '../../../shared/concurrency/tracker';
import { InitializeFSMCommandHandler } from '../../../shared/fsm/fsm-initialization-command-handler';
import { deleteVectorsForDocument } from '../../../shared/qdrant/lifecycle';
import { generateGenerationCode } from '../../../shared/utils/generation-code';
import * as path from 'path';

// Type aliases for Database tables
type Course = Database['public']['Tables']['courses']['Row'];
type Organization = Database['public']['Tables']['organizations']['Row'];

/**
 * Lifecycle Router
 *
 * Contains endpoints for managing the course generation lifecycle:
 * - initiate: Start a new course generation workflow
 * - generate: Initiate Stage 5 after Stage 4 analysis completes
 * - restartStage: Restart generation from a specific stage
 */
export const lifecycleRouter = router({
  /**
   * Initiate course generation
   *
   * Purpose: Starts the course generation pipeline. Routes to Stage 2 (document processing)
   * if files are uploaded, or directly to Stage 4 (analysis) for title-only courses.
   *
   * Authorization: Requires instructor or admin role
   *
   * Input:
   * - courseId: UUID of the course to generate
   * - webhookUrl: Optional webhook for status notifications
   *
   * Output:
   * - success: Boolean indicating successful initiation
   * - jobId: ID of the first job created
   * - message: Human-readable status message
   * - courseId: ID of the course being generated
   *
   * Validation:
   * - Course must exist and belong to the user
   * - Concurrency limits must not be exceeded
   * - Rate limit: 10 requests per minute
   *
   * @example
   * ```typescript
   * const result = await trpc.generation.lifecycle.initiate.mutate({
   *   courseId: '123e4567-e89b-12d3-a456-426614174000',
   * });
   * // { success: true, jobId: '...', message: '...', courseId: '...' }
   * ```
   */
  initiate: instructorProcedure
    .use(createRateLimiter({ requests: 10, window: 60 })) // 10 generation initiations per minute
    .input(initiateGenerationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { courseId, webhookUrl } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();

      // ctx.user is guaranteed non-null by instructorProcedure middleware
      // but TypeScript may not infer this, so we add a defensive check
      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const currentUser = ctx.user;
      const userId = currentUser.id;

      try {
        // T013: Verify course ownership and get organization tier
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('*, organization:organizations(tier)')
          .eq('id', courseId)
          .single();

        if (courseError || !course) {
          logger.warn({ requestId, userId, courseId, error: courseError }, 'Course not found');
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
        }

        if (course.user_id !== userId) {
          logger.warn({
            requestId,
            userId,
            courseId,
            courseOwnerId: course.user_id,
          }, 'Course ownership violation');
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this course',
          });
        }

        // Extract tier from organization
        const courseWithOrg = course as unknown as Course & { organization: Organization | null };
        const dbTier = (courseWithOrg.organization?.tier || 'free') as string;

        // Map database tier format to ConcurrencyTracker format
        const tierMap: Record<string, 'FREE' | 'BASIC' | 'STANDARD' | 'TRIAL' | 'PREMIUM'> = {
          'trial': 'TRIAL',
          'free': 'FREE',
          'basic': 'BASIC',
          'standard': 'STANDARD',
          'premium': 'PREMIUM',
        };
        const tier = tierMap[dbTier] || 'FREE';

        logger.info({
          requestId,
          userId,
          tier,
          courseId,
        }, 'Course generation request');

        // T014: Check concurrency limits using ConcurrencyTracker
        const concurrencyTracker = new ConcurrencyTracker();
        let concurrencyCheck: ConcurrencyCheckResult;

        try {
          concurrencyCheck = await concurrencyTracker.checkAndReserve(userId, tier);
        } catch (concurrencyError) {
          logger.error({
            requestId,
            userId,
            tier,
            error: concurrencyError,
          }, 'Concurrency check failed');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to check concurrency limits',
          });
        }

        if (!concurrencyCheck.allowed) {
          logger.warn({
            requestId,
            userId,
            tier,
            concurrencyCheck,
          }, 'Concurrency limit hit');

          // Write to system_metrics
          await supabase.from('system_metrics').insert({
            event_type: 'concurrency_limit_hit',
            severity: 'warn',
            user_id: userId,
            metadata: {
              tier,
              ...concurrencyCheck,
              rejected_course_id: courseId,
              request_id: requestId,
            },
          });

          const errorMessage =
            concurrencyCheck?.reason === 'user_limit'
              ? `Too many concurrent jobs. ${tier} tier allows ${concurrencyCheck.user_limit} concurrent course generation.`
              : 'System at capacity. Please try again in a few minutes.';

          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: errorMessage,
          });
        }

        // T015: Determine job type based on uploaded files
        // Query all files with complete metadata for per-file job creation
        const { data: uploadedFiles, error: filesError } = await supabase
          .from('file_catalog')
          .select('id, storage_path, mime_type')
          .eq('course_id', courseId)
          .eq('vector_status', 'pending'); // Only process pending files

        if (filesError) {
          logger.error({ requestId, courseId, error: filesError }, 'Failed to check uploaded files');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch uploaded files',
          });
        }

        const hasFiles = uploadedFiles && uploadedFiles.length > 0;
        const jobType = hasFiles ? JobType.DOCUMENT_PROCESSING : JobType.STRUCTURE_ANALYSIS;
        const priority = TIER_PRIORITY[tier] || 1;

        logger.info({ requestId, courseId, hasFiles, jobType, uploadedFilesCount: uploadedFiles?.length || 0 }, 'Determined job type');

        // T016: Build job data array for Transactional Outbox
        let jobs: Array<{
          queue: string;
          data: Record<string, unknown>;
          options?: Record<string, unknown>;
        }>;
        let initialState: string;

        if (hasFiles) {
          // Path 1: Document processing (hasFiles=true, start at Stage 2)
          jobs = uploadedFiles.map((file) => {
            // Convert relative storage_path to absolute path
            // storage_path is relative to project root (e.g., "uploads/org-id/course-id/filename")
            // Use DOCLING_UPLOADS_BASE_PATH for Docker container compatibility
            const absoluteFilePath = path.join(process.env.DOCLING_UPLOADS_BASE_PATH || process.cwd(), file.storage_path);

            return {
              queue: JobType.DOCUMENT_PROCESSING, // 'document_processing'
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
              },
              options: { priority },
            };
          });
          initialState = 'stage_2_init';

          logger.info({
            requestId,
            courseId,
            fileCount: uploadedFiles.length,
          }, 'Course generation path: document processing (Stage 2)');
        } else {
          // Path 2: Analysis-only (hasFiles=false, skip to Stage 4)
          jobs = [{
            queue: JobType.STRUCTURE_ANALYSIS, // 'structure_analysis'
            data: {
              jobType: JobType.STRUCTURE_ANALYSIS,
              organizationId: currentUser.organizationId,
              courseId,
              userId,
              createdAt: new Date().toISOString(),
              webhookUrl: webhookUrl || null,
              // Include basic course data for worker context
              title: course.title,
              settings: course.settings,
            },
            options: { priority },
          }];
          initialState = 'stage_4_init';

          logger.info({
            requestId,
            courseId,
          }, 'Course generation path: analysis-only (Stage 4, no documents)');
        }

        // T017: Execute command (atomic FSM init + outbox creation)
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
            fileCount: hasFiles ? uploadedFiles.length : 0,
            hasFiles,
          },
          jobs,
        });

        // T018: Generate human-readable code for debugging
        const generationCode = generateGenerationCode();

        // Save generation code to course
        const { error: updateError } = await supabase
          .from('courses')
          .update({
            generation_code: generationCode,
            generation_started_at: new Date().toISOString()
          })
          .eq('id', courseId);

        if (updateError) {
          logger.warn({ requestId, courseId, error: updateError }, 'Failed to save generation code');
        }

        // T019: Success response
        logger.info({
          requestId,
          courseId,
          generationCode,
          jobCount: result.outboxEntries.length,
          fromCache: result.fromCache,
          initialState,
        }, 'Course generation initiated via transactional outbox');

        return {
          success: true,
          jobId: result.outboxEntries[0]?.outbox_id,
          message: 'Генерация курса инициализирована',
          courseId,
          generationCode,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error({
          requestId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Unexpected error in generation.initiate');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        });
      }
    }),

  /**
   * Generate course structure (Stage 5)
   *
   * Purpose: Initiates Stage 5 structure generation after Stage 4 analysis completes.
   * Requires analysis_result to be present. Creates BullMQ job for async processing.
   *
   * Authorization: Requires instructor or admin role
   *
   * Input:
   * - courseId: UUID of the course to generate structure for
   *
   * Output:
   * - jobId: ID of the created generation job
   * - status: 'queued' status indicator
   * - estimatedDuration: Estimated completion time in milliseconds
   *
   * Validation:
   * - Course must exist and belong to the user
   * - Course must have completed Stage 4 analysis (analysis_result required)
   * - Generation must not already be in progress
   * - Concurrency limits must not be exceeded
   * - Rate limit: 10 requests per minute
   *
   * @example
   * ```typescript
   * const result = await trpc.generation.lifecycle.generate.mutate({
   *   courseId: '123e4567-e89b-12d3-a456-426614174000',
   * });
   * // { jobId: '...', status: 'queued', estimatedDuration: 150000 }
   * ```
   */
  generate: instructorProcedure
    .use(createRateLimiter({ requests: 10, window: 60 })) // 10 generations per minute
    .input(z.object({ courseId: z.string().uuid('Invalid course ID') }))
    .mutation(async ({ ctx, input }) => {
      const { courseId } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();

      // Defensive check (should never happen due to instructorProcedure middleware)
      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const currentUser = ctx.user;
      const userId = currentUser.id;

      try {
        // Step 1: Verify course ownership and get organization tier
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('*, organization:organizations(tier)')
          .eq('id', courseId)
          .single();

        if (courseError || !course) {
          logger.warn({ requestId, userId, courseId, error: courseError }, 'Course not found');
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
        }

        if (course.user_id !== userId) {
          logger.warn({
            requestId,
            userId,
            courseId,
            courseOwnerId: course.user_id,
          }, 'Course ownership violation');
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this course',
          });
        }

        // Extract tier from organization
        const courseWithOrg = course as unknown as Course & { organization: Organization | null };
        const dbTier = (courseWithOrg.organization?.tier || 'free') as string;
        const tierMap: Record<string, 'FREE' | 'BASIC' | 'STANDARD' | 'TRIAL' | 'PREMIUM'> = {
          'trial': 'TRIAL',
          'free': 'FREE',
          'basic': 'BASIC',
          'standard': 'STANDARD',
          'premium': 'PREMIUM',
        };
        const tier = tierMap[dbTier] || 'FREE';

        logger.info({
          requestId,
          userId,
          tier,
          courseId,
        }, 'Generation request');

        // Step 2: Validate generation status (allow retry if failed)
        // Note: Using type assertion since generation_status enum values
        // 'queued'/'generating' aren't in current generated types yet
        const generationStatus = course.generation_status as string;

        // Check for any "in progress" generation status
        // Valid values: stage 2-5 states (init, processing, analyzing, generating, complete)
        const inProgressStatuses = [
          'generating', 'queued',
          'stage_2_init', 'stage_2_processing', 'stage_2_complete',
          'stage_3_init', 'stage_3_summarizing', 'stage_3_complete',
          'stage_4_init', 'stage_4_analyzing', 'stage_4_complete',
          'stage_5_init', 'stage_5_generating', 'stage_5_complete',
          'finalizing'
        ];
        if (inProgressStatuses.includes(generationStatus)) {
          logger.warn({ requestId, courseId, status: generationStatus }, 'Generation already in progress');
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Course generation already in progress',
          });
        }

        // Step 3: Check concurrency limits using ConcurrencyTracker
        const concurrencyTracker = new ConcurrencyTracker();
        let concurrencyCheck: ConcurrencyCheckResult;

        try {
          concurrencyCheck = await concurrencyTracker.checkAndReserve(userId, tier);
        } catch (concurrencyError) {
          logger.error({
            requestId,
            userId,
            tier,
            error: concurrencyError,
          }, 'Concurrency check failed');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to check concurrency limits',
          });
        }

        if (!concurrencyCheck.allowed) {
          logger.warn({
            requestId,
            userId,
            tier,
            concurrencyCheck,
          }, 'Concurrency limit hit');

          // Write to system_metrics
          await supabase.from('system_metrics').insert({
            event_type: 'concurrency_limit_hit',
            severity: 'warn',
            user_id: userId,
            metadata: {
              tier,
              ...concurrencyCheck,
              rejected_course_id: courseId,
              request_id: requestId,
            },
          });

          const errorMessage =
            concurrencyCheck?.reason === 'user_limit'
              ? `Too many concurrent jobs. ${tier} tier allows ${concurrencyCheck.user_limit} concurrent generation.`
              : 'System at capacity. Please try again in a few minutes.';

          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: errorMessage,
          });
        }

        // Step 4: Fetch analysis_result and document summaries from database
        const analysisResult = course.analysis_result;

        // Validate analysis_result exists (required for generation)
        // Title-only generation is not currently supported - analysis must complete first
        if (!analysisResult) {
          logger.warn({ requestId, courseId }, 'Cannot generate: analysis_result is missing');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Course analysis must be completed before generating structure. Please complete Stage 4 analysis first.',
          });
        }

        // Check if course has vectorized documents
        const { data: vectorizedFiles, error: filesError } = await supabase
          .from('file_catalog')
          .select('id, filename, processed_content, mime_type')
          .eq('course_id', courseId)
          .eq('vector_status', 'indexed' as unknown as Database['public']['Enums']['vector_status']); // Use 'indexed' instead of 'completed'

        // If file_catalog query fails (e.g., in tests without file_catalog table),
        // treat as having no documents rather than throwing error
        if (filesError) {
          logger.warn({ requestId, courseId, error: filesError }, 'Failed to check vectorized files, assuming no documents');
        }

        const hasVectorizedDocs = !filesError && vectorizedFiles && vectorizedFiles.length > 0;

        // Build document summaries for RAG context
        const documentSummaries = hasVectorizedDocs
          ? (vectorizedFiles as Array<{
              id: string;
              filename: string;
              processed_content: string | null;
              mime_type: string;
            }>).map((file) => ({
              file_id: file.id,
              file_name: file.filename,
              summary: file.processed_content || '',
              key_topics: [], // Will be extracted by Stage 5 worker
            }))
          : [];

        // Step 5: Build GenerationJobInput
        const jobInput = {
          course_id: courseId,
          organization_id: course.organization_id,
          user_id: userId,
          analysis_result: analysisResult, // May be null for title-only
          frontend_parameters: {
            course_title: course.title, // ONLY guaranteed field
            language: course.language,
            style: course.style,
            target_audience: (course.settings as unknown as CourseSettings)?.target_audience,
            desired_lessons_count: (course.settings as unknown as CourseSettings)?.desired_lessons_count,
            desired_modules_count: (course.settings as unknown as CourseSettings)?.desired_modules_count,
            lesson_duration_minutes: (course.settings as unknown as CourseSettings)?.lesson_duration_minutes,
            learning_outcomes: (course.settings as unknown as CourseSettings)?.learning_outcomes,
          },
          vectorized_documents: hasVectorizedDocs,
          document_summaries: documentSummaries,
        };

        // Step 6: Create BullMQ job
        const priority = TIER_PRIORITY[tier] || 1;
        const jobType = JobType.STRUCTURE_GENERATION;

        const job = await addJob(jobType, jobInput as unknown as JobData, { priority });
        const jobId = job.id as string;

        logger.info({
          requestId,
          jobId,
          courseId,
          priority,
          hasVectorizedDocs,
          documentCount: documentSummaries.length,
        }, 'Generation job created');

        // Step 7: Update course status
        // Note: Using type assertion since generation_status='queued' not yet in generated types
        await supabase
          .from('courses')
          .update({
            generation_status: 'queued' as unknown as Database['public']['Enums']['generation_status'],
            updated_at: new Date().toISOString(),
          })
          .eq('id', courseId);

        // Step 8: Success response
        logger.info({
          requestId,
          jobId,
          courseId,
        }, 'Course generation initiated successfully');

        return {
          jobId,
          status: 'queued' as const,
          estimatedDuration: 150000, // 150 seconds (2.5 minutes)
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error({
          requestId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Unexpected error in generation.generate');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        });
      }
    }),

  /**
   * Restart generation from a specific stage
   *
   * Purpose: Allows restarting the generation pipeline from a specific stage (2-6).
   * Useful for error recovery or regeneration after editing content.
   *
   * Authorization: Requires instructor or admin role
   *
   * Input:
   * - courseId: UUID of the course to restart
   * - stageNumber: Stage to restart from (2-6)
   *
   * Output:
   * - success: Boolean indicating successful restart
   * - jobId: ID of the created restart job
   * - previousStatus: Previous generation status
   * - newStatus: New generation status after restart
   * - stageNumber: Stage that was restarted
   *
   * Stage mapping:
   * - Stage 2: Document processing (re-process all files)
   * - Stage 3: Document classification
   * - Stage 4: Structure analysis
   * - Stage 5: Structure generation
   * - Stage 6: Triggered automatically after Stage 5
   *
   * Validation:
   * - Course must exist and belong to the user
   * - Stage number must be valid (2-6)
   * - Rate limit: 5 requests per minute
   *
   * @example
   * ```typescript
   * const result = await trpc.generation.lifecycle.restartStage.mutate({
   *   courseId: '123e4567-e89b-12d3-a456-426614174000',
   *   stageNumber: 4,
   * });
   * // { success: true, jobId: '...', previousStatus: '...', newStatus: '...', stageNumber: 4 }
   * ```
   */
  restartStage: instructorProcedure
    .use(createRateLimiter({ requests: 5, window: 60 })) // 5 restarts per minute
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

      // Defensive check
      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const userId = ctx.user.id;

      try {
        logger.info({
          requestId,
          courseId,
          stageNumber,
          userId,
        }, 'Restart stage request received');

        // Step 1: Call RPC to reset status (handles ownership check internally)
        // Note: restart_from_stage RPC is defined in migration 20251207000000
        // Using raw SQL call since generated types may not include new RPC yet
        const { data: rpcResult, error: rpcError } = await supabase
          .rpc('restart_from_stage' as unknown as never, {
            p_course_id: courseId,
            p_stage_number: stageNumber,
            p_user_id: userId,
          } as unknown as never);

        if (rpcError) {
          logger.error({
            requestId,
            courseId,
            stageNumber,
            error: rpcError,
          }, 'RPC restart_from_stage failed');

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to restart stage',
          });
        }

        // Type assertion for RPC result
        const result = (rpcResult as unknown) as {
          success: boolean;
          error?: string;
          code?: string;
          courseId?: string;
          previousStatus?: string;
          newStatus?: string;
          organizationId?: string;
        };

        if (!result.success) {
          logger.warn({
            requestId,
            courseId,
            stageNumber,
            rpcResult: result,
          }, 'Restart stage rejected by RPC');

          const codeMap: Record<string, 'NOT_FOUND' | 'FORBIDDEN' | 'BAD_REQUEST'> = {
            'NOT_FOUND': 'NOT_FOUND',
            'FORBIDDEN': 'FORBIDDEN',
            'INVALID_STAGE': 'BAD_REQUEST',
            'INVALID_STATE': 'BAD_REQUEST',
          };

          throw new TRPCError({
            code: codeMap[result.code || ''] || 'BAD_REQUEST',
            message: result.error || 'Failed to restart stage',
          });
        }

        // Step 2: Clean up existing jobs for this course
        // This removes any pending/active jobs that might interfere with the restart
        try {
          const cleanupResult = await removeJobsByCourseId(courseId);
          if (cleanupResult.removed > 0) {
            logger.info({
              requestId,
              courseId,
              stageNumber,
              removedJobs: cleanupResult.removed,
              errors: cleanupResult.errors,
            }, 'Cleaned up existing jobs before restart');
          }
        } catch (cleanupError) {
          // Log but don't fail - job cleanup is best-effort
          logger.warn({
            requestId,
            courseId,
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          }, 'Failed to clean up existing jobs, continuing with restart');
        }

        // Step 3: Queue the appropriate job based on stage
        let jobId: string | undefined;
        const organizationId = result.organizationId || ctx.user.organizationId;

        // Get course data for job payload
        const { data: course } = await supabase
          .from('courses')
          .select('title, settings')
          .eq('id', courseId)
          .single();

        const baseJobData = {
          organizationId,
          courseId,
          userId,
          createdAt: new Date().toISOString(),
        };

        // Map stage number to job type and data
        if (stageNumber === 2) {
          // Stage 2: Re-process documents
          // Get pending files to process
          const { data: files } = await supabase
            .from('file_catalog')
            .select('id, storage_path, mime_type')
            .eq('course_id', courseId);

          if (files && files.length > 0) {
            // Clean up existing vectors in Qdrant before re-processing
            logger.info({ requestId, courseId, fileCount: files.length }, 'Deleting vectors for all course documents before Stage 2 restart');
            for (const file of files) {
              await deleteVectorsForDocument(file.id, courseId);
            }

            // Reset file statuses
            await supabase
              .from('file_catalog')
              .update({ vector_status: 'pending' })
              .eq('course_id', courseId);

            // Queue jobs for each file
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
          } as JobData);
          jobId = job.id;
        } else if (stageNumber === 5) {
          // Stage 5: Structure Generation - requires full job input with analysis_result
          // Fetch full course data for job payload
          const { data: fullCourse, error: fullCourseError } = await supabase
            .from('courses')
            .select('title, settings, language, style, analysis_result, organization_id')
            .eq('id', courseId)
            .single();

          if (fullCourseError || !fullCourse) {
            logger.error({ requestId, courseId, error: fullCourseError }, 'Failed to fetch course for Stage 5 restart');
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to fetch course data',
            });
          }

          // Validate analysis_result exists
          if (!fullCourse.analysis_result) {
            logger.warn({ requestId, courseId }, 'Cannot restart Stage 5: analysis_result is missing');
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Course analysis must be completed before generating structure. Please complete Stage 4 analysis first.',
            });
          }

          // Check if course has vectorized documents
          const { data: vectorizedFiles, error: filesError } = await supabase
            .from('file_catalog')
            .select('id, filename, processed_content, mime_type')
            .eq('course_id', courseId)
            .eq('vector_status', 'indexed' as unknown as Database['public']['Enums']['vector_status']);

          const hasVectorizedDocs = !filesError && vectorizedFiles && vectorizedFiles.length > 0;

          // Build document summaries for RAG context
          const documentSummaries = hasVectorizedDocs
            ? (vectorizedFiles as Array<{
                id: string;
                filename: string;
                processed_content: string | null;
                mime_type: string;
              }>).map((file) => ({
                file_id: file.id,
                file_name: file.filename,
                summary: file.processed_content || '',
                key_topics: [],
              }))
            : [];

          // Build full GenerationJobInput (same structure as generate endpoint)
          const stage5JobInput = {
            course_id: courseId,
            organization_id: fullCourse.organization_id,
            user_id: userId,
            analysis_result: fullCourse.analysis_result,
            frontend_parameters: {
              course_title: fullCourse.title,
              language: fullCourse.language,
              style: fullCourse.style,
              target_audience: (fullCourse.settings as unknown as CourseSettings)?.target_audience,
              desired_lessons_count: (fullCourse.settings as unknown as CourseSettings)?.desired_lessons_count,
              desired_modules_count: (fullCourse.settings as unknown as CourseSettings)?.desired_modules_count,
              lesson_duration_minutes: (fullCourse.settings as unknown as CourseSettings)?.lesson_duration_minutes,
              learning_outcomes: (fullCourse.settings as unknown as CourseSettings)?.learning_outcomes,
            },
            vectorized_documents: hasVectorizedDocs,
            document_summaries: documentSummaries,
          };

          const job = await addJob(JobType.STRUCTURE_GENERATION, stage5JobInput as unknown as JobData);
          jobId = job.id;
        }
        // Stage 6: Triggered automatically when Stage 5 completes

        logger.info({
          requestId,
          courseId,
          stageNumber,
          previousStatus: result.previousStatus,
          newStatus: result.newStatus,
          jobId,
        }, 'Stage restart initiated successfully');

        return {
          success: true,
          jobId,
          previousStatus: result.previousStatus,
          newStatus: result.newStatus,
          stageNumber,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error({
          requestId,
          courseId,
          stageNumber,
          error: error instanceof Error ? error.message : String(error),
        }, 'Unexpected error in restartStage');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to restart stage',
        });
      }
    }),
});

/**
 * Type export for router type inference
 */
export type LifecycleRouter = typeof lifecycleRouter;
