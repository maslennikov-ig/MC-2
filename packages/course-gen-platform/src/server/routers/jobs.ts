/**
 * Jobs Router
 * @module server/routers/jobs
 *
 * Handles job management operations including cancellation, status queries, and monitoring.
 */

 

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../trpc';
import { protectedProcedure } from '../middleware/auth';
import { getSupabaseAdmin } from '../../shared/supabase/admin';

/**
 * Jobs router
 *
 * Provides endpoints for:
 * - Job cancellation (jobs.cancel)
 * - Job status queries (jobs.getStatus)
 * - Job list (jobs.list)
 */
export const jobsRouter = router({
  /**
   * Cancel a job
   *
   * Authorization:
   * - Job owner (user_id matches) can cancel their own jobs
   * - Admin role can cancel any job in their organization
   *
   * Behavior:
   * - Sets cancelled=true, cancelled_at=NOW(), cancelled_by=current_user
   * - Job handler will detect cancellation via checkCancellation() and throw JobCancelledError
   * - Cannot cancel already completed/failed jobs
   * - Returns success message
   *
   * Error handling:
   * - Job not found → 404 NOT_FOUND
   * - Not authorized (neither owner nor admin) → 403 FORBIDDEN
   * - Already completed/failed → 400 BAD_REQUEST
   */
  cancel: protectedProcedure
    .input(
      z.object({
        jobId: z.string().min(1, 'Job ID is required'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { jobId } = input;
      const currentUser = ctx.user;

      // Query job status to verify job exists and get ownership info
      const { data: jobStatus, error: queryError } = await supabase
        .from('job_status')
        .select('id, job_id, user_id, organization_id, status, cancelled')
        .eq('job_id', jobId)
        .single();

      // Job not found
      if (queryError || !jobStatus) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Job ${jobId} not found`,
        });
      }

      // Check if job is already cancelled
      if (jobStatus.cancelled) {
        return {
          success: true,
          message: `Job ${jobId} is already cancelled`,
          jobId: jobStatus.job_id,
        };
      }

      // Check if job is already completed or failed
      if (jobStatus.status === 'completed' || jobStatus.status === 'failed') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot cancel job ${jobId} because it is already ${jobStatus.status}`,
        });
      }

      // Authorization: Check if user is owner OR admin/superadmin in the same organization
      const isOwner = jobStatus.user_id === currentUser.id;
      const isAdmin =
        (currentUser.role === 'admin' || currentUser.role === 'superadmin') &&
        currentUser.organizationId === jobStatus.organization_id;

      if (!isOwner && !isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to cancel this job',
        });
      }

      // Update job status to mark as cancelled
      const { error: updateError } = await supabase
        .from('job_status')
        .update({
          cancelled: true,
          cancelled_at: new Date().toISOString(),
          cancelled_by: currentUser.id,
          updated_at: new Date().toISOString(),
        })
        .eq('job_id', jobId);

      if (updateError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to cancel job: ${updateError.message}`,
        });
      }

      return {
        success: true,
        message: `Job ${jobId} has been cancelled`,
        jobId: jobStatus.job_id,
        cancelledBy: currentUser.id,
        cancelledAt: new Date().toISOString(),
      };
    }),

  /**
   * Get job status
   *
   * Authorization:
   * - Job owner can view their own jobs
   * - Admin can view all jobs in their organization
   * - Instructors can view all jobs in their organization (read-only)
   * - Students can view their own jobs
   *
   * Returns:
   * - Full job status including cancellation info
   */
  getStatus: protectedProcedure
    .input(
      z.object({
        jobId: z.string().min(1, 'Job ID is required'),
      })
    )
    .query(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { jobId } = input;
      const currentUser = ctx.user;

      // Query job status
      const { data: jobStatus, error } = await supabase
        .from('job_status')
        .select('*')
        .eq('job_id', jobId)
        .single();

      // Job not found
      if (error || !jobStatus) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Job ${jobId} not found`,
        });
      }

      // Authorization: Check if user has access
      const isOwner = jobStatus.user_id === currentUser.id;
      const isSameOrg = currentUser.organizationId === jobStatus.organization_id;
      const isAdmin = (currentUser.role === 'admin' || currentUser.role === 'superadmin') && isSameOrg;
      const isInstructor = currentUser.role === 'instructor' && isSameOrg;

      if (!isOwner && !isAdmin && !isInstructor) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view this job',
        });
      }

      return jobStatus;
    }),

  /**
   * List jobs
   *
   * Authorization:
   * - Admin can list all jobs in their organization
   * - Instructor can list all jobs in their organization
   * - Student can list only their own jobs
   *
   * Filters:
   * - status: Filter by job status
   * - cancelled: Filter by cancellation status
   * - limit: Number of results (default: 50, max: 100)
   * - offset: Pagination offset
   */
  list: protectedProcedure
    .input(
      z.object({
        status: z
          .enum(['pending', 'waiting', 'active', 'completed', 'failed', 'delayed'])
          .optional(),
        cancelled: z.boolean().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const currentUser = ctx.user;
      const { status, cancelled, limit, offset } = input;

      // Build query based on user role
      let query = supabase
        .from('job_status')
        .select('*', { count: 'exact' })
        .eq('organization_id', currentUser.organizationId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      // Students can only see their own jobs
      if (currentUser.role === 'student') {
        query = query.eq('user_id', currentUser.id);
      }

      // Apply filters
      if (status) {
        query = query.eq('status', status);
      }

      if (cancelled !== undefined) {
        query = query.eq('cancelled', cancelled);
      }

      const { data, error, count } = await query;

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to list jobs: ${error.message}`,
        });
      }

      return {
        jobs: data || [],
        total: count || 0,
        limit,
        offset,
      };
    }),
});

export type JobsRouter = typeof jobsRouter;
