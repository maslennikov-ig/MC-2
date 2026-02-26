/**
 * LMS Publish Router
 * @module server/routers/lms/publish
 *
 * Handles course publishing operations to LMS platforms.
 * Provides endpoints for:
 * - Starting course publish operations
 * - Canceling in-progress publish jobs
 *
 * Authorization: All endpoints require authentication (protectedProcedure)
 * Organization isolation: Enforced via RLS and ownership checks
 *
 * @example
 * ```typescript
 * // Start publish
 * const result = await trpc.lms.publish.start.mutate({
 *   courseId: '123e4567-e89b-12d3-a456-426614174000',
 *   lmsConfigId: '987fcdeb-51a2-43d7-89ab-456789abcdef',
 * });
 * // { jobId: 'abc123...', message: 'Publishing started' }
 *
 * // Cancel publish
 * await trpc.lms.publish.cancel.mutate({
 *   jobId: 'abc123...',
 * });
 * ```
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { protectedProcedure } from '../../middleware/auth';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { lmsLogger } from '../../../integrations/lms/logger';
import { nanoid } from 'nanoid';
import { handlePublishCourse } from './publish-helpers';
import { throwOnSupabaseError } from '../../utils/supabase-query-guard';

/**
 * Publish Router
 *
 * Handles course publishing to LMS platforms (Open edX, Moodle, Canvas).
 */
export const publishRouter = router({
  /**
   * Start course publish operation
   *
   * Purpose: Initiates course publishing to LMS. This endpoint:
   * 1. Verifies course ownership
   * 2. Validates LMS configuration access
   * 3. Maps course to LMS-agnostic CourseInput
   * 4. Publishes to LMS via adapter
   * 5. Creates import job record for tracking
   *
   * Authorization: Requires authenticated user and course ownership
   *
   * Input:
   * - courseId: UUID of course to publish
   * - lmsConfigId: UUID of LMS configuration to use
   *
   * Output:
   * - jobId: Import job UUID for tracking
   * - lmsCourseId: LMS-specific course identifier (e.g., "course-v1:Org+Course+Run")
   * - lmsUrl: Student view URL in LMS
   * - studioUrl: Studio/authoring URL (optional)
   * - message: Human-readable status message
   *
   * Validation:
   * - Course must exist and belong to authenticated user
   * - LMS config must exist and belong to user's organization
   * - LMS config must be active
   * - Course must have content (course_structure with sections)
   *
   * @throws {TRPCError} NOT_FOUND if course or config not found
   * @throws {TRPCError} FORBIDDEN if user doesn't own course or config
   * @throws {TRPCError} BAD_REQUEST if LMS config is inactive
   * @throws {TRPCError} INTERNAL_SERVER_ERROR if publish operation fails
   *
   * @example
   * ```typescript
   * const result = await trpc.lms.publish.start.mutate({
   *   courseId: '123e4567-e89b-12d3-a456-426614174000',
   *   lmsConfigId: '987fcdeb-51a2-43d7-89ab-456789abcdef',
   * });
   *
   * // Returns:
   * // {
   * //   jobId: 'abc123...',
   * //   lmsCourseId: 'course-v1:MegaCampus+AI101+self_paced',
   * //   lmsUrl: 'https://lms.example.com/courses/course-v1:MegaCampus+AI101+self_paced',
   * //   studioUrl: 'https://studio.example.com/course/course-v1:MegaCampus+AI101+self_paced',
   * //   message: 'Course published successfully',
   * // }
   * ```
   */
  start: protectedProcedure
    .input(
      z.object({
        courseId: z.string().uuid('Invalid course ID'),
        lmsConfigId: z.string().uuid('Invalid LMS configuration ID'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();

      try {
        return await handlePublishCourse(
          supabase,
          input,
          ctx.user.id,
          ctx.user.organizationId,
          requestId
        );
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        lmsLogger.error(
          {
            requestId,
            courseId: input.courseId,
            lmsConfigId: input.lmsConfigId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in publish.start'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred while publishing course',
        });
      }
    }),

  /**
   * Get course publish status
   *
   * Purpose: Retrieves the current status of a course publish operation.
   * This endpoint provides real-time status updates, progress indicators,
   * and error details for ongoing or completed import jobs.
   *
   * Authorization: Requires authenticated user. User must either:
   * - Own the course (be the course creator)
   * - Be an admin in the course's organization
   *
   * Input:
   * - job_id: UUID of import job to query
   *
   * Output:
   * - id: Job ID
   * - status: Current job status (pending, uploading, processing, succeeded, failed)
   * - progress_percent: Progress indicator (0-100)
   * - started_at: When job started (ISO 8601 timestamp)
   * - completed_at: When job completed (ISO 8601 timestamp)
   * - duration_ms: Total duration in milliseconds
   * - error_code: Standardized error code if failed
   * - error_message: User-friendly error message if failed
   * - course_url: Student view URL in LMS
   * - studio_url: Studio/authoring URL in LMS
   *
   * Validation:
   * - Job must exist
   * - User must have access to the course
   *
   * @throws {TRPCError} NOT_FOUND if job not found
   * @throws {TRPCError} FORBIDDEN if user doesn't have access
   * @throws {TRPCError} INTERNAL_SERVER_ERROR on database error
   *
   * @example
   * ```typescript
   * const status = await trpc.lms.publish.status.query({
   *   job_id: 'abc123...',
   * });
   * // {
   * //   id: 'abc123...',
   * //   status: 'processing',
   * //   progress_percent: 50,
   * //   started_at: '2024-12-11T10:00:00Z',
   * //   completed_at: null,
   * //   duration_ms: null,
   * //   error_code: null,
   * //   error_message: null,
   * //   course_url: null,
   * //   studio_url: null,
   * // }
   * ```
   */
  status: protectedProcedure
    .input(
      z.object({
        job_id: z.string().uuid('Invalid job ID'),
      })
    )
    .query(async ({ ctx, input }) => {
      const { job_id } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();
      const userId = ctx.user.id;
      const organizationId = ctx.user.organizationId;
      const userRole = ctx.user.role;

      lmsLogger.info({ requestId, userId, jobId: job_id }, 'Fetching job status');

      try {
        // Step 1: Fetch job with course information for authorization
        const { data: job, error: jobError } = await supabase
          .from('lms_import_jobs')
          .select(
            `
            id,
            status,
            progress_percent,
            started_at,
            completed_at,
            error_code,
            error_message,
            course_url,
            studio_url,
            course_id,
            user_id,
            courses!inner(
              id,
              user_id,
              organization_id
            )
          `
          )
          .eq('id', job_id)
          .single();

        throwOnSupabaseError(jobError, 'Import job', { requestId, jobId: job_id });
        if (!job) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Import job not found',
          });
        }

        // Step 2: Verify user has access to this job
        // User must either:
        // - Own the course (be the course creator)
        // - Be an admin in the course's organization
        const rawJob = job as unknown as {
          courses:
            | { id: string; user_id: string; organization_id: string }
            | { id: string; user_id: string; organization_id: string }[];
        };
        const course = Array.isArray(rawJob.courses) ? rawJob.courses[0] : rawJob.courses;

        if (!course) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Course associated with import job not found',
          });
        }

        const isOwner = course.user_id === userId;
        const isOrgAdmin = userRole === 'admin' && course.organization_id === organizationId;

        if (!isOwner && !isOrgAdmin) {
          lmsLogger.warn(
            {
              requestId,
              userId,
              jobId: job_id,
              courseOwnerId: course.user_id,
              courseOrgId: course.organization_id,
            },
            'User does not have access to this job'
          );
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this import job',
          });
        }

        // Step 3: Calculate duration if completed
        const duration_ms =
          job.started_at && job.completed_at
            ? new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()
            : null;

        lmsLogger.debug(
          { requestId, jobId: job_id, status: job.status, progress: job.progress_percent },
          'Job status retrieved'
        );

        // Step 4: Return structured response
        return {
          id: job.id,
          status: job.status,
          progress_percent: job.progress_percent,
          started_at: job.started_at,
          completed_at: job.completed_at,
          duration_ms,
          error_code: job.error_code,
          error_message: job.error_message,
          course_url: job.course_url,
          studio_url: job.studio_url,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        lmsLogger.error(
          {
            requestId,
            jobId: job_id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in publish.status'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred while fetching job status',
        });
      }
    }),

  /**
   * Cancel course publish operation
   *
   * Purpose: Cancels an in-progress course publish operation.
   * Since Open edX doesn't support canceling imports via API,
   * this only updates our local job status to 'failed' with
   * a cancellation message.
   *
   * Note: The actual LMS import may continue running on the LMS side.
   *
   * Authorization: Requires authenticated user
   *
   * Input:
   * - jobId: UUID of import job to cancel
   *
   * Output:
   * - success: Boolean indicating cancellation success
   * - message: Human-readable status message
   *
   * Validation:
   * - Job must exist
   * - Job must not already be completed or failed
   *
   * @throws {TRPCError} NOT_FOUND if job not found
   * @throws {TRPCError} BAD_REQUEST if job already completed
   * @throws {TRPCError} INTERNAL_SERVER_ERROR on database error
   *
   * @example
   * ```typescript
   * const result = await trpc.lms.publish.cancel.mutate({
   *   jobId: 'abc123...',
   * });
   * // { success: true, message: 'Job cancelled successfully' }
   * ```
   */
  cancel: protectedProcedure
    .input(
      z.object({
        jobId: z.string().uuid('Invalid job ID'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { jobId } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();
      const userId = ctx.user.id;

      lmsLogger.info({ requestId, userId, jobId }, 'Canceling import job');

      try {
        // Step 1: Fetch job
        const { data: job, error: jobError } = await supabase
          .from('lms_import_jobs')
          .select('id, status, course_id')
          .eq('id', jobId)
          .single();

        throwOnSupabaseError(jobError, 'Import job', { requestId, jobId });
        if (!job) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Import job not found',
          });
        }

        // Step 2: Validate job can be cancelled
        if (job.status === 'succeeded' || job.status === 'failed') {
          lmsLogger.warn({ requestId, jobId, status: job.status }, 'Job already completed');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Cannot cancel job that is already ${job.status}`,
          });
        }

        // Step 3: Update job status to failed with cancellation message
        lmsLogger.info(
          { requestId, jobId, previousStatus: job.status, newStatus: 'failed' },
          'Status transition: Canceling job'
        );

        const { error: updateError } = await supabase
          .from('lms_import_jobs')
          .update({
            status: 'failed',
            error_code: 'CANCELLED',
            error_message: 'Job cancelled by user',
            completed_at: new Date().toISOString(),
          })
          .eq('id', jobId);

        if (updateError) {
          lmsLogger.error({ requestId, jobId, error: updateError }, 'Failed to update job');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to cancel import job',
          });
        }

        lmsLogger.info(
          {
            requestId,
            jobId,
            previousStatus: job.status,
            newStatus: 'failed',
            errorCode: 'CANCELLED',
          },
          'Status transition: Job cancelled successfully'
        );

        return {
          success: true,
          message: 'Import job cancelled successfully',
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        lmsLogger.error(
          {
            requestId,
            jobId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in publish.cancel'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred while canceling job',
        });
      }
    }),
});

/**
 * Type export for router type inference
 */
export type PublishRouter = typeof publishRouter;
