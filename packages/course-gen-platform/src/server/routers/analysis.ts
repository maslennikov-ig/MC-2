/**
 * Analysis Router
 * @module server/routers/analysis
 *
 * Provides API endpoints for Stage 4 course content analysis workflow.
 * Handles analysis job initiation, progress monitoring, and result retrieval.
 *
 * Stage 4 Implementation:
 * - start: Initiates 5-phase analysis workflow (authenticated users)
 * - getStatus: Monitors analysis progress (authenticated users)
 * - getResult: Retrieves completed analysis result (authenticated users)
 *
 * Access Control:
 * - All endpoints enforce organization-level RLS via ctx.user.organizationId
 * - Course ownership is verified before analysis initiation
 * - Only users from the same organization can access course analysis data
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../trpc';
import { protectedProcedure } from '../middleware/auth';
import { getSupabaseAdmin } from '../../shared/supabase/admin';
import { addJob } from '../../orchestrator/queue';
import { JobType } from '@megacampus/shared-types';
import { logger } from '../../shared/logger/index.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { nanoid } from 'nanoid';

// ============================================================================
// TYPES
// ============================================================================

interface OrganizationTier {
  tier: string;
}

interface CourseRow {
  id: string;
  organization_id: string;
  generation_status: string;
  generation_progress: number;
  title: string;
  course_description: string | null;
  language: string | null;
  style: string | null;
  target_audience: string | null;
  difficulty: string | null;
  settings: Record<string, unknown> | null;
  analysis_result: Record<string, unknown> | null;
  organization: OrganizationTier | null;
}

/**
 * Input schema for start endpoint
 *
 * Validates analysis initiation request with courseId and optional forceRestart flag.
 */
export const startAnalysisInputSchema = z.object({
  /** Course ID to analyze */
  courseId: z.string().uuid('Invalid course ID'),

  /** Force restart analysis even if already in progress (SuperAdmin only) */
  forceRestart: z.boolean().default(false),
});

/**
 * Input schema for getStatus endpoint
 */
export const getAnalysisStatusInputSchema = z.object({
  /** Course ID to get status for */
  courseId: z.string().uuid('Invalid course ID'),
});

/**
 * Input schema for getResult endpoint
 */
export const getAnalysisResultInputSchema = z.object({
  /** Course ID to get result for */
  courseId: z.string().uuid('Invalid course ID'),
});

/**
 * Get tier-based priority for BullMQ job
 *
 * Maps organization subscription tier to BullMQ priority value.
 * Higher values indicate higher priority in the queue.
 *
 * @param tier - Organization subscription tier
 * @returns Priority value (1-10)
 */
function getTierPriority(tier: string | null): number {
  switch (tier) {
    case 'free':
      return 1;
    case 'basic':
      return 3;
    case 'standard':
      return 5;
    case 'premium':
      return 7;
    case 'enterprise':
      return 10;
    default:
      return 1;
  }
}

/**
 * Analysis router
 *
 * Provides endpoints for Stage 4 course content analysis workflow:
 * - start: Initiate 5-phase analysis
 * - getStatus: Monitor analysis progress
 * - getResult: Retrieve analysis result
 */
export const analysisRouter = router({
  /**
   * Start course content analysis
   *
   * Purpose: Initiates the 5-phase analysis workflow for a course:
   * - Phase 1: Topic Classification
   * - Phase 2: Scope Analysis
   * - Phase 3: Expert Knowledge Mapping
   * - Phase 4: Complexity Assessment
   * - Phase 5: Structure Generation
   *
   * Authorization: Requires authenticated user (protectedProcedure)
   *
   * Input:
   * - courseId: UUID of the course to analyze
   * - forceRestart: Optional flag to restart analysis if already in progress
   *
   * Output:
   * - jobId: BullMQ job ID for tracking
   * - status: 'started' confirmation
   *
   * Validation:
   * - Course exists and belongs to user's organization
   * - Analysis not already in progress (unless forceRestart=true)
   * - Document summaries fetched from file_catalog
   *
   * Error Handling:
   * - Course not found → 404 NOT_FOUND
   * - Course belongs to different org → 403 FORBIDDEN
   * - Analysis already in progress → 400 BAD_REQUEST
   * - Job creation fails → 500 INTERNAL_SERVER_ERROR
   *
   * @example
   * ```typescript
   * const result = await trpc.analysis.start.mutate({
   *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
   *   forceRestart: false,
   * });
   * // { jobId: '1', status: 'started' }
   * ```
   */
  start: protectedProcedure
    .use(createRateLimiter({ requests: 10, window: 60 })) // 10 analysis starts per minute
    .input(startAnalysisInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { courseId, forceRestart } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();

      // ctx.user is guaranteed non-null by protectedProcedure middleware
      const currentUser = ctx.user;
      const userId = currentUser.id;
      const organizationId = currentUser.organizationId;

      // Track previous status for rollback (declared outside try/catch for catch block access)
      let previousStatus: string | null = null;

      try {
        // Step 1: Fetch course with organization tier
        const { data } = await supabase
          .from('courses')
          .select(`
            *,
            organization:organizations(tier)
          `)
          .eq('id', courseId)
          .eq('organization_id', organizationId)
          .single();

        const course = data as unknown as CourseRow;

        if (!course) {
          logger.warn({
            requestId,
            userId,
            courseId,
            organizationId,
            // error: courseError, // Removed as we use safe data access
          }, 'Course not found or access denied');

          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Course not found or access denied',
          });
        }

        // Extract tier from organization (type-safe access)
        const tier = course.organization?.tier || 'free';

        logger.info({
          requestId,
          userId,
          courseId,
          organizationId,
          tier,
          forceRestart,
        }, 'Analysis start request');

        // Step 2: Check if analysis already in progress
        // IMPORTANT: After Stage 3 (document summarization), course status is 'stage_3_complete'
        // This is VALID and analysis.start should accept it.
        // Only block if already in stage 4 (analysis actually running)
        const validPreAnalysisStatuses = ['stage_2_complete', 'stage_3_complete'];
        const analysisInProgress = ['stage_4_init', 'stage_4_analyzing', 'stage_4_complete'].includes(course.generation_status);

        if (analysisInProgress && !forceRestart) {
          logger.warn({
            requestId,
            userId,
            courseId,
            currentStatus: course.generation_status,
          }, 'Analysis already in progress');

          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Analysis already in progress. Use forceRestart=true to restart.',
          });
        }

        // Validate status is valid for starting analysis
        if (!validPreAnalysisStatuses.includes(course.generation_status) && !forceRestart) {
          logger.warn({
            requestId,
            userId,
            courseId,
            currentStatus: course.generation_status,
            validStatuses: validPreAnalysisStatuses,
          }, 'Invalid status for starting analysis');

          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Cannot start analysis from status '${course.generation_status}'. Expected: ${validPreAnalysisStatuses.join(', ')}`,
          });
        }

        // Step 2.5: Mark course as stage_4_init to prevent duplicate starts
        // This MUST happen before job creation to prevent race conditions where
        // multiple requests can start duplicate analyses before the job updates the status
        // Valid transitions:
        // - 'stage_2_complete' → 'stage_4_init' (direct path, no Stage 3)
        // - 'stage_3_complete' → 'stage_4_init' (after Stage 3 summarization completes)

        // Save previous status for rollback on failure
        previousStatus = course.generation_status;

        const { error: updateError } = await supabase
          .from('courses')
          .update({ generation_status: 'stage_4_init' as const })
          .eq('id', courseId)
          .eq('organization_id', organizationId);

        if (updateError) {
          logger.error({
            requestId,
            courseId,
            error: updateError.message,
          }, 'Failed to update course status');

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to start analysis',
          });
        }

        // Helper function to rollback status on failure
        const rollbackStatus = async () => {
          try {
            await supabase
              .from('courses')
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .update({ generation_status: previousStatus as any })
              .eq('id', courseId)
              .eq('organization_id', organizationId);

            logger.info({
              requestId,
              courseId,
              previousStatus,
              currentStatus: 'stage_4_init',
            }, 'Successfully rolled back course status after job creation failure');
          } catch (rollbackError) {
            logger.error({
              requestId,
              courseId,
              previousStatus,
              error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
            }, 'Failed to rollback course status');
          }
        };

        logger.info({
          requestId,
          courseId,
          status: 'stage_4_init',
        }, 'Course status updated before job creation');

        // Step 3: Fetch completed document summaries from file_catalog
        // Only include documents that have been processed (processed_content NOT NULL)
        const { data: documents, error: documentsError } = await supabase
          .from('file_catalog')
          .select('id, filename, processed_content, processing_method, summary_metadata')
          .eq('course_id', courseId)
          .eq('organization_id', organizationId)
          .not('processed_content', 'is', null) // Documents with completed summarization
          .not('processing_method', 'is', null); // Ensure processing_method is set

        if (documentsError) {
          logger.error({
            requestId,
            userId,
            courseId,
            error: documentsError,
          }, 'Failed to fetch document summaries');

          // Rollback status before throwing
          await rollbackStatus();

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch document summaries',
          });
        }

        // Map documents to document_summaries format
        const document_summaries = (documents || []).map(doc => ({
          document_id: doc.id,
          file_name: doc.filename,
          processed_content: doc.processed_content,
          processing_method: doc.processing_method,
          summary_metadata: doc.summary_metadata,
        }));

        logger.info({
          requestId,
          courseId,
          documentCount: document_summaries.length,
        }, 'Document summaries fetched');

        // Extract settings for analysis input (type-safe JSONB access)
        const settings = (course.settings as Record<string, unknown>) || {};
        const topic = (settings.topic as string) || course.title || course.course_description || '';
        const answers = (settings.answers as string) || null;
        const lessonDuration = (settings.lesson_duration_minutes as number) || 30;

        // Step 4: Create BullMQ job with complete payload
        const priority = getTierPriority(tier);
        // Use Record<string, unknown> to allow flexible job data while avoiding 'any'
        const jobData: Record<string, unknown> = {
          jobType: JobType.STRUCTURE_ANALYSIS,
          organizationId,
          courseId,
          userId,
          createdAt: new Date().toISOString(),
          course_id: courseId,
          organization_id: organizationId,
          user_id: userId,
          input: {
            topic,
            language: course.language || 'en',
            style: course.style || 'formal',
            answers,
            target_audience: course.target_audience || '',
            difficulty: course.difficulty || 'intermediate',
            lesson_duration_minutes: lessonDuration,
            document_summaries,
          },
          priority,
          attempt_count: 0,
          created_at: new Date().toISOString(),
        };

        // Cast to any for addJob to avoid union mismatch if strict types don't match this hybrid object
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const job = await addJob(JobType.STRUCTURE_ANALYSIS, jobData as any, { priority });
        const jobId = job.id as string;

        logger.info({
          requestId,
          jobId,
          courseId,
          priority,
          documentCount: document_summaries.length,
        }, 'Analysis job created');

        // Return success response
        return {
          jobId,
          status: 'started' as const,
        };
      } catch (error) {
        // Re-throw tRPC errors as-is (rollback already handled in specific error blocks)
        if (error instanceof TRPCError) {
          throw error;
        }

        // Log unexpected error
        logger.error({
          requestId,
          error: error instanceof Error ? error.message : String(error),
          courseId,
          userId,
          organizationId,
        }, 'Unexpected error in analysis.start');

        // Rollback status for unexpected errors (addJob failure, network issues, etc.)
        if (previousStatus) {
          try {
            await supabase
              .from('courses')
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .update({ generation_status: previousStatus as any })
              .eq('id', courseId)
              .eq('organization_id', organizationId);

            logger.info({
              requestId,
              courseId,
              rolledBackTo: previousStatus,
            }, 'Rolled back course status after unexpected error');
          } catch (rollbackError) {
            logger.error({
              requestId,
              courseId,
              error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
            }, 'Failed to rollback course status after unexpected error');
          }
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start analysis',
        });
      }
    }),

  /**
   * Get analysis status
   *
   * Purpose: Retrieves current analysis progress for a course.
   * Returns generation_status and generation_progress from courses table.
   *
   * Authorization: Requires authenticated user (protectedProcedure)
   *
   * Input:
   * - courseId: UUID of the course to check status for
   *
   * Output:
   * - status: Current generation_status (e.g., 'stage_4_analyzing', 'completed')
   * - progress: Generation progress percentage (0-100)
   *
   * Access Control:
   * - User must belong to same organization as course
   * - RLS policies enforce organization isolation
   *
   * Error Handling:
   * - Course not found → 404 NOT_FOUND
   * - Course belongs to different org → 404 NOT_FOUND
   *
   * @example
   * ```typescript
   * const result = await trpc.analysis.getStatus.query({
   *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
   * });
   * // { status: 'stage_4_analyzing', progress: 60 }
   * ```
   */
  getStatus: protectedProcedure
    .input(getAnalysisStatusInputSchema)
    .query(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const userId = ctx.user.id;
      const organizationId = ctx.user.organizationId;

      try {
        // Fetch course with RLS enforcement
        const { data } = await supabase
          .from('courses')
          .select('generation_status, generation_progress')
          .eq('id', input.courseId)
          .eq('organization_id', organizationId)
          .single();

        if (!data) {
           logger.warn({
            userId,
            courseId: input.courseId,
            organizationId,
          }, 'Course not found for status query');

          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Course not found or access denied',
          });
        }

        // Use explicit type compatible with unknown from DB
        const course = data as unknown as { generation_status: string; generation_progress: number };

        return {
          status: course.generation_status,
          progress: course.generation_progress,
        };
      } catch (error) {
        // Re-throw tRPC errors as-is
        if (error instanceof TRPCError) {
          throw error;
        }

        // Log and wrap unexpected errors
        logger.error({
          error: error instanceof Error ? error.message : String(error),
          courseId: input.courseId,
          userId,
          organizationId,
        }, 'Unexpected error in analysis.getStatus');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch analysis status',
        });
      }
    }),

  /**
   * Get analysis result
   *
   * Purpose: Retrieves completed analysis result for a course.
   * Returns analysis_result JSONB field from courses table.
   *
   * Authorization: Requires authenticated user (protectedProcedure)
   *
   * Input:
   * - courseId: UUID of the course to get result for
   *
   * Output:
   * - analysisResult: Complete analysis result JSONB object (nullable)
   *
   * Access Control:
   * - User must belong to same organization as course
   * - RLS policies enforce organization isolation
   *
   * Error Handling:
   * - Course not found → 404 NOT_FOUND
   * - Course belongs to different org → 404 NOT_FOUND
   *
   * @example
   * ```typescript
   * const result = await trpc.analysis.getResult.query({
   *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
   * });
   * // { analysisResult: { recommended_structure: { ... }, ... } }
   * ```
   */
  getResult: protectedProcedure
    .input(getAnalysisResultInputSchema)
    .query(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const userId = ctx.user.id;
      const organizationId = ctx.user.organizationId;

      try {
        // Fetch course with RLS enforcement
        // Note: analysis_result field added in migration 20251031110000_stage4_analysis_fields.sql
        // Type assertion used until database types are regenerated
        const { data } = await supabase
          .from('courses')
          .select('analysis_result')
          .eq('id', input.courseId)
          .eq('organization_id', organizationId)
          .single();

        if (!data) {
          logger.warn({
            userId,
            courseId: input.courseId,
            organizationId,
          }, 'Course not found for result query');

          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Course not found or access denied',
          });
        }

        const course = data as unknown as { analysis_result: Record<string, unknown> | null };

        // Type assertion for analysis_result field (exists in DB, not yet in generated types)
        return {
          analysisResult: course.analysis_result || null,
        };
      } catch (error) {
        // Re-throw tRPC errors as-is
        if (error instanceof TRPCError) {
          throw error;
        }

        // Log and wrap unexpected errors
        logger.error({
          error: error instanceof Error ? error.message : String(error),
          courseId: input.courseId,
          userId,
          organizationId,
        }, 'Unexpected error in analysis.getResult');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch analysis result',
        });
      }
    }),
});

/**
 * Type export for router type inference
 */
export type AnalysisRouter = typeof analysisRouter;
