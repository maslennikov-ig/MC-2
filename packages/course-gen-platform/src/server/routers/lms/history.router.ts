/**
 * LMS History Router
 * @module server/routers/lms/history
 *
 * Handles import job history queries.
 * Provides endpoints for:
 * - Listing import job history with filtering and pagination
 * - Getting detailed job information
 *
 * Authorization: All endpoints require authentication (protectedProcedure)
 * - list: Returns user's own jobs by default
 *   - If course_id provided: user must own the course
 *   - If organization_id provided: user must be org admin
 * - get: User must own the course associated with the job
 *
 * @example
 * ```typescript
 * // List import history
 * const history = await trpc.lms.history.list.query({
 *   limit: 20,
 *   offset: 0,
 * });
 * // { items: [...], total: 50, has_more: true }
 *
 * // List by course
 * const courseHistory = await trpc.lms.history.list.query({
 *   course_id: '123e4567-e89b-12d3-a456-426614174000',
 * });
 *
 * // Get job details
 * const job = await trpc.lms.history.get.query({
 *   job_id: 'abc123...',
 * });
 * ```
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { protectedProcedure } from '../../middleware/auth';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { lmsLogger } from '../../../integrations/lms/logger';
import { LmsImportStatusSchema } from '@megacampus/shared-types/lms';
import { nanoid } from 'nanoid';
import { verifyOrganizationAccess } from './helpers';

/**
 * Calculate job duration in milliseconds
 *
 * @param startedAt - Job start timestamp (ISO 8601)
 * @param completedAt - Job completion timestamp (ISO 8601)
 * @returns Duration in milliseconds, or null if job not completed
 */
function calculateJobDuration(
  startedAt: string | null,
  completedAt: string | null
): number | null {
  if (!startedAt || !completedAt) return null;
  return new Date(completedAt).getTime() - new Date(startedAt).getTime();
}

/**
 * History Router
 *
 * Handles import job history queries with filtering and pagination.
 */
export const historyRouter = router({
  /**
   * List import job history
   *
   * Purpose: Retrieves import job history with filtering and pagination.
   * Supports filtering by course, organization, and status.
   *
   * Authorization: Requires authenticated user
   * - If course_id provided: user must own the course
   * - If organization_id provided: user must be org admin
   * - If neither: returns user's own course jobs
   *
   * Input:
   * - course_id: (optional) Filter by course UUID
   * - organization_id: (optional) Filter by organization UUID
   * - status: (optional) Filter by job status
   * - limit: Number of items per page (1-100, default 20)
   * - offset: Number of items to skip (default 0)
   *
   * Output:
   * - items: Array of import job summaries with course and LMS info
   * - total: Total number of matching jobs
   * - has_more: Whether more items exist beyond current page
   *
   * Validation:
   * - At most one of course_id or organization_id can be specified
   * - If course_id: user must own the course
   * - If organization_id: user must be admin in that organization
   *
   * @throws {TRPCError} BAD_REQUEST if both course_id and organization_id specified
   * @throws {TRPCError} NOT_FOUND if course not found
   * @throws {TRPCError} FORBIDDEN if user doesn't have access
   * @throws {TRPCError} INTERNAL_SERVER_ERROR on database error
   *
   * @example
   * ```typescript
   * // List all user's import jobs
   * const history = await trpc.lms.history.list.query({
   *   limit: 20,
   *   offset: 0,
   * });
   *
   * // List by course
   * const courseHistory = await trpc.lms.history.list.query({
   *   course_id: 'course-uuid',
   *   status: 'succeeded',
   * });
   *
   * // List by organization (admin only)
   * const orgHistory = await trpc.lms.history.list.query({
   *   organization_id: 'org-uuid',
   *   limit: 50,
   * });
   *
   * // Returns:
   * // {
   * //   items: [
   * //     {
   * //       id: 'job-uuid',
   * //       course_id: 'course-uuid',
   * //       course_title: 'Introduction to AI',
   * //       lms_name: 'Production LMS',
   * //       edx_course_key: 'course-v1:MegaCampus+AI101+self_paced',
   * //       status: 'succeeded',
   * //       created_at: '2024-12-11T10:00:00Z',
   * //       completed_at: '2024-12-11T10:05:30Z',
   * //       duration_ms: 330000,
   * //     },
   * //     ...
   * //   ],
   * //   total: 50,
   * //   has_more: true,
   * // }
   * ```
   */
  list: protectedProcedure
    .input(
      z.object({
        course_id: z.string().uuid('Invalid course ID').optional(),
        organization_id: z.string().uuid('Invalid organization ID').optional(),
        status: LmsImportStatusSchema.optional(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { course_id, organization_id, status, limit, offset } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();
      const userId = ctx.user.id;
      const userOrgId = ctx.user.organizationId;
      const userRole = ctx.user.role;

      lmsLogger.info(
        {
          requestId,
          userId,
          courseId: course_id,
          organizationId: organization_id,
          status,
          limit,
          offset,
        },
        'Listing import job history'
      );

      try {
        /**
         * Filtering modes:
         *
         * 1. course_id only: Returns jobs for specific course
         *    - Authorization: User must own the course
         *    - Use case: Instructor viewing one course's history
         *
         * 2. organization_id only: Returns jobs for entire organization
         *    - Authorization: User must be organization admin
         *    - Use case: Admin viewing all org imports
         *
         * 3. Neither (default): Returns jobs for user's own courses
         *    - Authorization: Authenticated user
         *    - Use case: Instructor viewing personal history
         *
         * 4. Both (invalid): Not allowed - ambiguous query
         */
        if (course_id && organization_id) {
          lmsLogger.warn(
            { requestId, courseId: course_id, organizationId: organization_id },
            'Both course_id and organization_id specified'
          );
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot filter by both course_id and organization_id. Use course_id to filter by course, or organization_id (admin only) for organization-wide history.',
          });
        }

        // Step 1: Build base query
        let query = supabase
          .from('lms_import_jobs')
          .select(
            `
            id,
            course_id,
            edx_course_key,
            status,
            started_at,
            completed_at,
            created_at,
            courses!inner(id, title, user_id, organization_id),
            lms_configurations!inner(id, name)
          `,
            { count: 'exact' }
          );

        // Step 2: Apply filters based on input
        // TODO: Consider using RLS (Row Level Security) policies to handle
        // authorization at database level, reducing round-trips.
        // Current pattern: 1) verify ownership, 2) filter jobs
        // Optimized pattern: Single query with RLS policy check
        if (course_id) {
          // Step 1: Verify course ownership
          const { data: course, error: courseError } = await supabase
            .from('courses')
            .select('id, user_id')
            .eq('id', course_id)
            .single();

          if (courseError || !course) {
            lmsLogger.warn({ requestId, courseId: course_id, error: courseError }, 'Course not found');
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Course not found',
            });
          }

          if (course.user_id !== userId) {
            lmsLogger.warn(
              { requestId, userId, courseId: course_id, courseOwnerId: course.user_id },
              'Course ownership violation'
            );
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'You do not have access to this course',
            });
          }

          query = query.eq('course_id', course_id);
        } else if (organization_id) {
          // Filter by organization - verify admin role
          if (userRole !== 'admin') {
            lmsLogger.warn(
              { requestId, userId, organizationId: organization_id, userRole },
              'Non-admin user attempting to list organization jobs'
            );
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Only organization admins can view organization-wide history',
            });
          }

          verifyOrganizationAccess(organization_id, userOrgId, requestId, userId, 'list organization jobs');

          query = query.eq('courses.organization_id', organization_id);
        } else {
          // No filter specified - return user's own course jobs
          query = query.eq('courses.user_id', userId);
        }

        // Step 3: Apply status filter if provided
        if (status) {
          query = query.eq('status', status);
        }

        // Step 4: Apply ordering and pagination
        query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

        // Step 5: Execute query
        const { data: jobs, error: jobsError, count } = await query;

        if (jobsError) {
          lmsLogger.error({ requestId, error: jobsError }, 'Failed to fetch import jobs');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch import job history',
          });
        }

        if (!jobs) {
          lmsLogger.warn({ requestId }, 'No jobs found');
          return {
            items: [],
            total: 0,
            has_more: false,
          };
        }

        // Step 6: Transform jobs to response format
        const items = jobs.map((job) => {
          const course = Array.isArray(job.courses) ? job.courses[0] : job.courses;
          const lmsConfig = Array.isArray(job.lms_configurations)
            ? job.lms_configurations[0]
            : job.lms_configurations;

          const duration_ms = calculateJobDuration(job.started_at, job.completed_at);

          return {
            id: job.id,
            course_id: job.course_id,
            course_title: course.title,
            lms_name: lmsConfig.name,
            edx_course_key: job.edx_course_key,
            status: job.status,
            created_at: job.created_at,
            completed_at: job.completed_at,
            duration_ms,
          };
        });

        const total = count || 0;
        const has_more = offset + limit < total;

        lmsLogger.debug(
          { requestId, itemsCount: items.length, total, hasMore: has_more },
          'Import job history retrieved'
        );

        return {
          items,
          total,
          has_more,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        lmsLogger.error(
          {
            requestId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in history.list'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred while fetching import job history',
        });
      }
    }),

  /**
   * Get detailed import job information
   *
   * Purpose: Retrieves full details of a specific import job,
   * including all status fields, error information, and URLs.
   *
   * Authorization: Requires authenticated user who owns the job's course
   *
   * Input:
   * - job_id: UUID of import job to retrieve
   *
   * Output: Full job details with extended fields
   * - id: Job UUID
   * - course_id: Course UUID
   * - course_title: Course title
   * - lms_name: LMS configuration name
   * - lms_config_id: LMS configuration UUID
   * - edx_course_key: Open edX course key
   * - edx_task_id: LMS async task ID (nullable)
   * - status: Current job status
   * - progress_percent: Progress indicator (0-100)
   * - started_at: Job start timestamp (nullable)
   * - completed_at: Job completion timestamp (nullable)
   * - duration_ms: Total duration in milliseconds (nullable)
   * - error_code: Error code if failed (nullable)
   * - error_message: Error message if failed (nullable)
   * - course_url: LMS student view URL (nullable)
   * - studio_url: LMS studio URL (nullable)
   * - created_at: Job creation timestamp
   *
   * Validation:
   * - Job must exist
   * - User must own the job's course
   *
   * @throws {TRPCError} NOT_FOUND if job not found
   * @throws {TRPCError} FORBIDDEN if user doesn't own course
   * @throws {TRPCError} INTERNAL_SERVER_ERROR on database error
   *
   * @example
   * ```typescript
   * const job = await trpc.lms.history.get.query({
   *   job_id: 'job-uuid',
   * });
   *
   * // Returns:
   * // {
   * //   id: 'job-uuid',
   * //   course_id: 'course-uuid',
   * //   course_title: 'Introduction to AI',
   * //   lms_name: 'Production LMS',
   * //   lms_config_id: 'config-uuid',
   * //   edx_course_key: 'course-v1:MegaCampus+AI101+self_paced',
   * //   edx_task_id: 'abc123',
   * //   status: 'succeeded',
   * //   progress_percent: 100,
   * //   started_at: '2024-12-11T10:00:00Z',
   * //   completed_at: '2024-12-11T10:05:30Z',
   * //   duration_ms: 330000,
   * //   error_code: null,
   * //   error_message: null,
   * //   course_url: 'https://lms.example.com/courses/course-v1:MegaCampus+AI101+self_paced',
   * //   studio_url: 'https://studio.example.com/course/course-v1:MegaCampus+AI101+self_paced',
   * //   created_at: '2024-12-11T09:59:00Z',
   * // }
   * ```
   */
  get: protectedProcedure
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

      lmsLogger.info({ requestId, userId, jobId: job_id }, 'Fetching import job details');

      try {
        // Step 1: Fetch job with course and LMS config information
        const { data: job, error: jobError } = await supabase
          .from('lms_import_jobs')
          .select(
            `
            id,
            course_id,
            lms_config_id,
            edx_course_key,
            edx_task_id,
            status,
            progress_percent,
            started_at,
            completed_at,
            error_code,
            error_message,
            course_url,
            studio_url,
            created_at,
            courses!inner(id, title, user_id),
            lms_configurations!inner(id, name)
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
        const course = Array.isArray(job.courses) ? job.courses[0] : job.courses;

        if (course.user_id !== userId) {
          lmsLogger.warn(
            {
              requestId,
              userId,
              jobId: job_id,
              courseOwnerId: course.user_id,
            },
            'User does not have access to this job'
          );
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this import job',
          });
        }

        // Step 3: Calculate duration if completed
        const duration_ms = calculateJobDuration(job.started_at, job.completed_at);

        // Step 4: Transform to response format
        const lmsConfig = Array.isArray(job.lms_configurations)
          ? job.lms_configurations[0]
          : job.lms_configurations;

        lmsLogger.debug({ requestId, jobId: job_id, status: job.status }, 'Job details retrieved');

        return {
          id: job.id,
          course_id: job.course_id,
          course_title: course.title,
          lms_name: lmsConfig.name,
          lms_config_id: job.lms_config_id,
          edx_course_key: job.edx_course_key,
          edx_task_id: job.edx_task_id,
          status: job.status,
          progress_percent: job.progress_percent,
          started_at: job.started_at,
          completed_at: job.completed_at,
          duration_ms,
          error_code: job.error_code,
          error_message: job.error_message,
          course_url: job.course_url,
          studio_url: job.studio_url,
          created_at: job.created_at,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        lmsLogger.error(
          {
            requestId,
            jobId: job_id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in history.get'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred while fetching import job details',
        });
      }
    }),
});

/**
 * Type export for router type inference
 */
export type HistoryRouter = typeof historyRouter;
