/**
 * LMS Course Router
 * @module server/routers/lms/course
 *
 * Handles course-related LMS operations.
 * Provides endpoints for:
 * - Checking course publish status
 * - Deleting courses from LMS (soft delete)
 *
 * Authorization: All endpoints require authentication (protectedProcedure)
 * Organization isolation: Enforced via RLS and ownership checks
 *
 * @example
 * ```typescript
 * // Get course status
 * const status = await trpc.lms.course.status.query({
 *   courseId: '123e4567-e89b-12d3-a456-426614174000',
 * });
 * // { jobId: 'abc...', status: 'succeeded', lmsUrl: '...', studioUrl: '...' }
 *
 * // Delete course
 * const result = await trpc.lms.course.delete.mutate({
 *   courseId: '123e4567-e89b-12d3-a456-426614174000',
 *   lmsConfigId: '987fcdeb-51a2-43d7-89ab-456789abcdef',
 * });
 * // { success: true, message: 'Course marked as deleted' }
 * ```
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { protectedProcedure } from '../../middleware/auth';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { lmsLogger } from '../../../integrations/lms/logger';
import { nanoid } from 'nanoid';

/**
 * Course Router
 *
 * Handles course-level LMS operations (status, deletion).
 */
export const courseRouter = router({
  /**
   * Get course publish status
   *
   * Purpose: Retrieves the latest import job status for a course.
   * Returns information about the most recent publish operation,
   * including success/failure status and LMS URLs.
   *
   * Authorization: Requires authenticated user and course ownership
   *
   * Input:
   * - courseId: UUID of course to check status for
   *
   * Output:
   * - jobId: Import job UUID (null if never published)
   * - status: Import status (pending, uploading, processing, succeeded, failed)
   * - lmsCourseId: LMS-specific course identifier (e.g., "course-v1:Org+Course+Run")
   * - lmsUrl: Student view URL in LMS (null if not published)
   * - studioUrl: Studio/authoring URL (null if not published)
   * - errorMessage: Error details (null if no error)
   * - createdAt: Job creation timestamp
   * - completedAt: Job completion timestamp (null if in progress)
   *
   * Validation:
   * - Course must exist and belong to authenticated user
   *
   * @throws {TRPCError} NOT_FOUND if course not found
   * @throws {TRPCError} FORBIDDEN if user doesn't own course
   * @throws {TRPCError} INTERNAL_SERVER_ERROR on database error
   *
   * @example
   * ```typescript
   * const status = await trpc.lms.course.status.query({
   *   courseId: '123e4567-e89b-12d3-a456-426614174000',
   * });
   *
   * // Returns (if published):
   * // {
   * //   jobId: 'abc123...',
   * //   status: 'succeeded',
   * //   lmsCourseId: 'course-v1:MegaCampus+AI101+self_paced',
   * //   lmsUrl: 'https://lms.example.com/courses/...',
   * //   studioUrl: 'https://studio.example.com/course/...',
   * //   errorMessage: null,
   * //   createdAt: '2025-12-11T10:00:00Z',
   * //   completedAt: '2025-12-11T10:05:30Z',
   * // }
   *
   * // Returns (if never published):
   * // {
   * //   jobId: null,
   * //   status: null,
   * //   lmsCourseId: null,
   * //   lmsUrl: null,
   * //   studioUrl: null,
   * //   errorMessage: null,
   * //   createdAt: null,
   * //   completedAt: null,
   * // }
   * ```
   */
  status: protectedProcedure
    .input(
      z.object({
        courseId: z.string().uuid('Invalid course ID'),
      })
    )
    .query(async ({ ctx, input }) => {
      const { courseId } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();
      const userId = ctx.user.id;

      lmsLogger.info({ requestId, userId, courseId }, 'Getting course publish status');

      try {
        // Step 1: Verify course ownership
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('id, user_id')
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

        // Step 2: Fetch latest import job for this course
        const { data: job, error: jobError } = await supabase
          .from('lms_import_jobs')
          .select(
            'id, status, edx_course_key, course_url, studio_url, error_message, created_at, completed_at'
          )
          .eq('course_id', courseId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (jobError) {
          lmsLogger.error({ requestId, courseId, error: jobError }, 'Failed to fetch job status');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch publish status',
          });
        }

        // Step 3: Return job status (or null if never published)
        if (!job) {
          lmsLogger.debug({ requestId, courseId }, 'Course has never been published');
          return {
            jobId: null,
            status: null,
            lmsCourseId: null,
            lmsUrl: null,
            studioUrl: null,
            errorMessage: null,
            createdAt: null,
            completedAt: null,
          };
        }

        lmsLogger.info({ requestId, courseId, jobId: job.id, status: job.status }, 'Job status retrieved');

        return {
          jobId: job.id,
          status: job.status,
          lmsCourseId: job.edx_course_key,
          lmsUrl: job.course_url,
          studioUrl: job.studio_url,
          errorMessage: job.error_message,
          createdAt: job.created_at,
          completedAt: job.completed_at,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        lmsLogger.error(
          {
            requestId,
            courseId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in course.status'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred while fetching status',
        });
      }
    }),

  /**
   * Delete course from LMS
   *
   * Purpose: Marks a course as deleted in our database.
   *
   * IMPORTANT: Open edX does not provide a public API for deleting courses.
   * This endpoint only updates our local database to mark the course as deleted.
   * The course will remain in the LMS and must be manually deleted by an admin
   * in the Open edX Studio interface if needed.
   *
   * This is a soft delete that:
   * 1. Creates a new job record with status='failed' and error_code='DELETED'
   * 2. Preserves historical job records for audit purposes
   *
   * Authorization: Requires authenticated user and course ownership
   *
   * Input:
   * - courseId: UUID of course to delete
   * - lmsConfigId: UUID of LMS configuration (for audit trail)
   *
   * Output:
   * - success: Boolean indicating operation success
   * - message: Human-readable status message
   * - note: Reminder that manual LMS deletion may be required
   *
   * Validation:
   * - Course must exist and belong to authenticated user
   * - LMS configuration must belong to user's organization
   *
   * @throws {TRPCError} NOT_FOUND if course or config not found
   * @throws {TRPCError} FORBIDDEN if user doesn't own course or config
   * @throws {TRPCError} INTERNAL_SERVER_ERROR on database error
   *
   * @example
   * ```typescript
   * const result = await trpc.lms.course.delete.mutate({
   *   courseId: '123e4567-e89b-12d3-a456-426614174000',
   *   lmsConfigId: '987fcdeb-51a2-43d7-89ab-456789abcdef',
   * });
   *
   * // Returns:
   * // {
   * //   success: true,
   * //   message: 'Course marked as deleted in local database',
   * //   note: 'Course must be manually deleted in LMS Studio',
   * // }
   * ```
   */
  delete: protectedProcedure
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

      lmsLogger.info({ requestId, userId, courseId, lmsConfigId }, 'Deleting course from LMS');

      try {
        // Step 1: Verify course ownership
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('id, user_id, title')
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

        // Step 2: Verify LMS configuration access
        const { data: config, error: configError } = await supabase
          .from('lms_configurations')
          .select('id')
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

        // Step 3: Create deletion record (soft delete)
        // This creates a job record with status='failed' and error_code='DELETED'
        // to mark the course as deleted without actually removing data
        const jobId = nanoid();
        const now = new Date().toISOString();

        // Fetch the last successful import job to get the edx_course_key
        const { data: lastJob } = await supabase
          .from('lms_import_jobs')
          .select('edx_course_key')
          .eq('course_id', courseId)
          .eq('status', 'succeeded')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastJob?.edx_course_key) {
          lmsLogger.debug(
            { requestId, courseId, edx_course_key: lastJob.edx_course_key },
            'Found edx_course_key from last successful import'
          );
        } else {
          lmsLogger.debug(
            { requestId, courseId },
            'No successful import found, using UNKNOWN for edx_course_key'
          );
        }

        const { error: jobError } = await supabase.from('lms_import_jobs').insert({
          id: jobId,
          course_id: courseId,
          lms_config_id: lmsConfigId,
          user_id: userId,
          edx_course_key: lastJob?.edx_course_key || 'UNKNOWN',
          edx_task_id: null,
          status: 'failed',
          progress_percent: 0,
          started_at: now,
          completed_at: now,
          error_code: 'DELETED',
          error_message: `Course marked as deleted by user. Title: ${course.title}`,
          course_url: null,
          studio_url: null,
        });

        if (jobError) {
          lmsLogger.error({ requestId, jobId, error: jobError }, 'Failed to create deletion record');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to mark course as deleted',
          });
        }

        lmsLogger.info({ requestId, courseId, jobId }, 'Course marked as deleted');

        return {
          success: true,
          message: 'Course marked as deleted in local database',
          note: 'The course still exists in the LMS. To fully remove it, manually delete it in the LMS Studio interface.',
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
          'Unexpected error in course.delete'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred while deleting course',
        });
      }
    }),
});

/**
 * Type export for router type inference
 */
export type CourseRouter = typeof courseRouter;
