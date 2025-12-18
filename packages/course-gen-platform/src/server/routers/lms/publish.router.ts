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
import { createLMSAdapter } from '../../../integrations/lms';
import { mapCourseToInput } from '../../../integrations/lms/course-mapper';
import { nanoid } from 'nanoid';
import {
  type OpenEdXConfig,
  LMSTimeoutError,
  isLMSError,
  LMS_ERROR_CODES,
} from '@megacampus/shared-types/lms';

/**
 * Get user-friendly error message based on LMS error type
 *
 * Provides contextual guidance for different error scenarios,
 * helping users understand what went wrong and how to fix it.
 *
 * @param error - LMS error instance
 * @returns User-friendly error message with guidance
 */
function getUserFriendlyErrorMessage(error: unknown): string {
  if (!isLMSError(error)) {
    return error instanceof Error ? error.message : 'An unexpected error occurred';
  }

  switch (error.code) {
    case LMS_ERROR_CODES.NETWORK_CONNECTION_LOST:
      return 'Upload failed due to network connection loss. Please check your internet connection and try again.';

    case LMS_ERROR_CODES.LMS_UNREACHABLE:
      return 'Cannot connect to the LMS. Please verify the LMS configuration and network connectivity.';

    case LMS_ERROR_CODES.TIMEOUT_ERROR:
    case LMS_ERROR_CODES.UPLOAD_TIMEOUT:
    case LMS_ERROR_CODES.LMS_TIMEOUT:
      if (error instanceof LMSTimeoutError) {
        return `Operation timed out after ${Math.round(error.duration / 1000)}s. The course may be too large or the LMS may be slow to respond. Try again later.`;
      }
      return 'Operation timed out. The course may be too large or the LMS may be slow to respond. Try again later.';

    case LMS_ERROR_CODES.NETWORK_ERROR:
    case LMS_ERROR_CODES.CONNECTION_REFUSED:
    case LMS_ERROR_CODES.DNS_ERROR:
      return 'Network error occurred. Please check your connection and LMS configuration.';

    case LMS_ERROR_CODES.AUTH_ERROR:
    case LMS_ERROR_CODES.TOKEN_EXPIRED:
    case LMS_ERROR_CODES.INVALID_CREDENTIALS:
      return 'Authentication failed. Please verify LMS credentials in configuration settings.';

    case LMS_ERROR_CODES.PERMISSION_ERROR:
    case LMS_ERROR_CODES.INSUFFICIENT_ROLE:
      return 'Insufficient permissions. Please verify your LMS account has course creation privileges.';

    default:
      return error.message;
  }
}

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
      const { courseId, lmsConfigId } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();
      const userId = ctx.user.id;
      const organizationId = ctx.user.organizationId;

      lmsLogger.info(
        { requestId, userId, courseId, lmsConfigId },
        'Starting course publish operation'
      );

      try {
        // Step 1: Verify course ownership
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('id, title, user_id, organization_id')
          .eq('id', courseId)
          .single();

        if (courseError || !course) {
          lmsLogger.warn({ requestId, courseId, error: courseError }, 'Course not found');
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Course not found',
          });
        }

        if (course.user_id !== userId) {
          lmsLogger.warn(
            { requestId, userId, courseId, courseOwnerId: course.user_id },
            'Course ownership violation'
          );
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this course',
          });
        }

        // Step 2: Fetch LMS configuration (must belong to user's organization)
        const { data: config, error: configError } = await supabase
          .from('lms_configurations')
          .select('*')
          .eq('id', lmsConfigId)
          .eq('organization_id', organizationId)
          .single();

        if (configError || !config) {
          lmsLogger.warn(
            { requestId, lmsConfigId, organizationId, error: configError },
            'LMS configuration not found'
          );
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'LMS configuration not found or access denied',
          });
        }

        // Step 3: Validate LMS configuration is active
        if (!config.is_active) {
          lmsLogger.warn({ requestId, lmsConfigId }, 'LMS configuration is inactive');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'LMS configuration is inactive. Please activate it before publishing.',
          });
        }

        lmsLogger.debug(
          { requestId, courseId, lmsConfigId, lmsName: config.name },
          'Course and config validated'
        );

        // Step 4: Check for active import job (job locking)
        const { data: activeJob, error: activeJobError } = await supabase
          .from('lms_import_jobs')
          .select('id, status, created_at')
          .eq('course_id', courseId)
          .in('status', ['pending', 'uploading', 'processing'])
          .maybeSingle();

        if (activeJobError) {
          lmsLogger.error(
            { requestId, courseId, error: activeJobError },
            'Failed to check for active jobs'
          );
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to check for existing import jobs',
          });
        }

        if (activeJob) {
          lmsLogger.warn(
            { requestId, courseId, activeJobId: activeJob.id, activeJobStatus: activeJob.status },
            'Course already has an active import job'
          );
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Course already has an active import job (status: ${activeJob.status}, job ID: ${activeJob.id}). Please wait for it to complete or cancel it first.`,
          });
        }

        lmsLogger.debug({ requestId, courseId }, 'No active import jobs found, proceeding');

        // Step 5: Map course to CourseInput
        let courseInput;
        try {
          courseInput = await mapCourseToInput(courseId, supabase);
        } catch (mapError) {
          lmsLogger.error({ requestId, courseId, error: mapError }, 'Failed to map course');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message:
              mapError instanceof Error
                ? mapError.message
                : 'Failed to prepare course for publishing',
          });
        }

        // Step 6: Create LMS adapter from configuration
        // Note: studio_url can be null in DB, but CMS URL is required for Open edX adapter
        if (!config.studio_url || config.studio_url.trim().length === 0) {
          lmsLogger.error({ requestId, lmsConfigId }, 'LMS configuration missing Studio URL');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'LMS configuration is missing Studio URL. Please update the configuration.',
          });
        }

        // Validate URL format
        try {
          new URL(config.studio_url);
        } catch {
          lmsLogger.warn(
            { requestId, lmsConfigId, studioUrl: config.studio_url },
            'Invalid Studio URL format'
          );
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'LMS configuration has invalid Studio URL format. Please enter a valid URL starting with https://',
          });
        }

        const adapterConfig: OpenEdXConfig = {
          instanceId: config.id,
          name: config.name,
          type: 'openedx' as const,
          organization: config.default_org,
          lmsUrl: config.lms_url,
          cmsUrl: config.studio_url,
          clientId: config.client_id,
          clientSecret: config.client_secret,
          timeout: config.import_timeout_seconds * 1000,
          maxRetries: config.max_retries,
          pollInterval: config.poll_interval_seconds * 1000,
          enabled: config.is_active,
          autoCreateCourse: true,
        };

        const adapter = createLMSAdapter('openedx', adapterConfig);

        // Step 7: Create import job record (pending status)
        const jobId = nanoid();
        const startedAt = new Date().toISOString();

        lmsLogger.info(
          { requestId, courseId, jobId, status: 'pending', progress: 0 },
          'Status transition: Creating job record with pending status'
        );

        // Type assertion: default_run exists in DB but not yet in generated types
        const configWithRun = config as typeof config & { default_run?: string };

        const { error: createJobError } = await supabase.from('lms_import_jobs').insert({
          id: jobId,
          course_id: courseId,
          lms_config_id: lmsConfigId,
          user_id: userId,
          edx_course_key: `course-v1:${config.default_org}+${courseInput.courseId}+${courseInput.run || configWithRun.default_run || 'self_paced'}`,
          edx_task_id: null,
          status: 'pending',
          progress_percent: 0,
          started_at: startedAt,
          completed_at: null,
          course_url: null,
          studio_url: null,
          error_code: null,
          error_message: null,
        });

        if (createJobError) {
          lmsLogger.error({ requestId, jobId, error: createJobError }, 'Failed to create job record');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create import job record',
          });
        }

        lmsLogger.info(
          { requestId, courseId, jobId, status: 'pending' },
          'Job record created with pending status'
        );

        // Step 8: Publish course to LMS
        let publishResult;
        try {
          lmsLogger.info(
            { requestId, courseId, lmsConfigId, courseTitle: courseInput.title },
            'Publishing course to LMS'
          );

          // Update status to uploading
          lmsLogger.info(
            { requestId, jobId, previousStatus: 'pending', newStatus: 'uploading' },
            'Status transition: pending -> uploading'
          );

          await supabase
            .from('lms_import_jobs')
            .update({ status: 'uploading', progress_percent: 25 })
            .eq('id', jobId);

          publishResult = await adapter.publishCourse(courseInput);

          if (!publishResult.success) {
            lmsLogger.error(
              { requestId, courseId, error: publishResult.error },
              'LMS publish failed'
            );

            // Update job to failed status
            lmsLogger.info(
              { requestId, jobId, previousStatus: 'uploading', newStatus: 'failed' },
              'Status transition: uploading -> failed'
            );

            await supabase
              .from('lms_import_jobs')
              .update({
                status: 'failed',
                error_code: 'LMS_IMPORT_FAILED',
                error_message: publishResult.error || 'Failed to publish course to LMS',
                completed_at: new Date().toISOString(),
              })
              .eq('id', jobId);

            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: publishResult.error || 'Failed to publish course to LMS',
            });
          }

          lmsLogger.info(
            {
              requestId,
              courseId,
              lmsCourseId: publishResult.lmsCourseId,
              duration: publishResult.duration,
            },
            'Course published successfully'
          );

          // Step 9: Update job record to succeeded status
          const completedAt = new Date().toISOString();

          lmsLogger.info(
            { requestId, jobId, previousStatus: 'uploading', newStatus: 'succeeded' },
            'Status transition: uploading -> succeeded'
          );

          const { error: updateJobError } = await supabase
            .from('lms_import_jobs')
            .update({
              edx_task_id: publishResult.taskId || null,
              status: 'succeeded',
              progress_percent: 100,
              completed_at: completedAt,
              course_url: publishResult.lmsUrl,
              studio_url: publishResult.studioUrl || null,
            })
            .eq('id', jobId);

          if (updateJobError) {
            lmsLogger.error({ requestId, jobId, error: updateJobError }, 'Failed to update job record');
            // Don't throw - publish succeeded, just log the error
          } else {
            lmsLogger.info(
              { requestId, courseId, jobId, status: 'succeeded', lmsUrl: publishResult.lmsUrl },
              'Job record updated with succeeded status'
            );
          }
        } catch (error) {
          // Determine error code and message based on error type
          let errorCode: string;
          let errorMessage: string;
          let userMessage: string;

          if (isLMSError(error)) {
            // LMS-specific errors (network, timeout, etc.)
            errorCode = error.code;
            errorMessage = error.message;
            userMessage = getUserFriendlyErrorMessage(error);

            lmsLogger.error(
              {
                requestId,
                jobId,
                errorCode,
                errorMessage,
                lmsType: error.lmsType,
                metadata: error.metadata,
                cause: error.cause?.message,
              },
              'LMS error during publish operation'
            );
          } else if (error instanceof TRPCError) {
            // tRPC errors (validation, authorization, etc.)
            errorCode = error.code;
            errorMessage = error.message;
            userMessage = error.message;

            lmsLogger.error(
              { requestId, jobId, errorCode, errorMessage, trpcCode: error.code },
              'tRPC error during publish operation'
            );
          } else {
            // Unknown errors
            errorCode = 'INTERNAL_SERVER_ERROR';
            errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during publish';
            userMessage = 'An unexpected error occurred while publishing course. Please try again later.';

            lmsLogger.error(
              { requestId, jobId, error, errorMessage },
              'Unknown error during publish operation'
            );
          }

          // Update job to failed status with proper error categorization
          lmsLogger.info(
            { requestId, jobId, errorCode, newStatus: 'failed' },
            'Status transition: Updating job to failed due to error'
          );

          await supabase
            .from('lms_import_jobs')
            .update({
              status: 'failed',
              error_code: errorCode,
              error_message: userMessage, // Use user-friendly message
              completed_at: new Date().toISOString(),
            })
            .eq('id', jobId);

          throw error;
        }

        // Step 10: Return success response
        return {
          jobId,
          lmsCourseId: publishResult.lmsCourseId,
          lmsUrl: publishResult.lmsUrl,
          studioUrl: publishResult.studioUrl,
          message: 'Course published successfully to LMS',
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        lmsLogger.error(
          {
            requestId,
            courseId,
            lmsConfigId,
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

        if (jobError || !job) {
          lmsLogger.warn({ requestId, jobId: job_id, error: jobError }, 'Job not found');
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Import job not found',
          });
        }

        // Step 2: Verify user has access to this job
        // User must either:
        // - Own the course (be the course creator)
        // - Be an admin in the course's organization
        const course = Array.isArray(job.courses) ? job.courses[0] : job.courses;
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

        if (jobError || !job) {
          lmsLogger.warn({ requestId, jobId, error: jobError }, 'Job not found');
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
          { requestId, jobId, previousStatus: job.status, newStatus: 'failed', errorCode: 'CANCELLED' },
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
