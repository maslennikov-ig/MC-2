/**
 * Cancel Stage 6 Procedure
 * @module server/routers/lesson-content/procedures/cancel
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { cancelStage6InputSchema } from '../schemas';
import { verifyCourseAccess } from '../helpers';
import { getQueue } from '../../../../orchestrator/queue';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { JobType } from '@megacampus/shared-types';
import type { LessonContentJobData } from '@megacampus/shared-types';
import { logger } from '../../../../shared/logger/index.js';

/**
 * Cancel all pending jobs for a course
 *
 * Purpose: Cancels all pending Stage 6 jobs for a course.
 * Already completed or in-progress jobs are not affected.
 * Jobs that have transitioned to active state between fetching and removal
 * will be reported in failedJobIds but won't fail the operation.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - courseId: UUID of the course to cancel jobs for
 *
 * Output:
 * - success: Boolean success flag
 * - cancelledJobsCount: Number of jobs successfully cancelled
 * - failedJobIds: Array of job IDs that couldn't be cancelled (optional, only if any failed)
 *
 * Error Handling:
 * - Course not found -> 404 NOT_FOUND
 * - Access denied -> 403 FORBIDDEN
 *
 * @example
 * ```typescript
 * const result = await trpc.lessonContent.cancelStage6.mutate({
 *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
 * });
 * // { success: true, cancelledJobsCount: 5 }
 * ```
 */
export const cancelStage6 = protectedProcedure
  .use(createRateLimiter({ requests: 5, window: 60 })) // 5 cancels per minute
  .input(cancelStage6InputSchema)
  .mutation(async ({ ctx, input }) => {
    const { courseId } = input;
    const requestId = nanoid();

    // ctx.user is guaranteed non-null by protectedProcedure middleware
    const currentUser = ctx.user;

    logger.info({
      requestId,
      courseId,
      userId: currentUser.id,
    }, 'Stage 6 cancel request');

    try {
      // Step 1: Verify course access
      await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

      // Step 2: Get the main course-generation queue and find jobs for this course
      const queue = getQueue();

      // Get all pending jobs (waiting and delayed states)
      const pendingJobs = await queue.getJobs(['waiting', 'delayed']);

      // Filter jobs by courseId
      const courseJobs = pendingJobs.filter(job => job.data?.courseId === courseId);

      logger.info({
        requestId,
        courseId,
        totalPendingJobs: pendingJobs.length,
        courseJobsFound: courseJobs.length,
      }, 'Found pending jobs to cancel');

      // Step 3: Remove each matching job
      let cancelledCount = 0;
      const failedJobIds: string[] = [];

      for (const job of courseJobs) {
        try {
          await job.remove();
          cancelledCount++;
          const lessonId = job.data?.jobType === JobType.LESSON_CONTENT
            ? (job.data as LessonContentJobData).lessonSpec?.lesson_id
            : undefined;
          logger.debug({
            requestId,
            jobId: job.id,
            lessonId,
          }, 'Cancelled job');
        } catch (jobError) {
          // Job might have moved to active state between getJobs and remove
          const jobId = job.id ?? 'unknown';
          failedJobIds.push(jobId);
          logger.warn({
            requestId,
            jobId,
            error: jobError instanceof Error ? jobError.message : String(jobError),
          }, 'Failed to remove job (may have started processing)');
        }
      }

      // Step 4: Update lesson_contents status if table exists
      // Note: This is optional - only update if records exist
      const supabaseAdmin = getSupabaseAdmin();
      let dbUpdatedCount = 0;

      try {
        const { data } = await supabaseAdmin
          .from('lessons')
          .update({
            updated_at: new Date().toISOString(),
          })
          .eq('course_id', courseId)
          .is('content', null) // Only update lessons without content (still pending)
          .select('id');

        dbUpdatedCount = data?.length ?? 0;
      } catch (dbError) {
        // Non-critical - log and continue
        logger.warn({
          requestId,
          courseId,
          error: dbError instanceof Error ? dbError.message : String(dbError),
        }, 'Failed to update lesson records (non-critical)');
      }

      logger.info({
        requestId,
        courseId,
        cancelledCount,
        failedCount: failedJobIds.length,
        dbUpdatedCount,
      }, 'Stage 6 cancellation completed');

      return {
        success: true,
        cancelledJobsCount: cancelledCount,
        failedJobIds: failedJobIds.length > 0 ? failedJobIds : undefined,
      };
    } catch (error) {
      // Re-throw tRPC errors as-is
      if (error instanceof TRPCError) {
        throw error;
      }

      // Log and wrap unexpected errors
      logger.error({
        requestId,
        courseId,
        error: error instanceof Error ? error.message : String(error),
      }, 'Stage 6 cancel failed');

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to cancel Stage 6 generation',
      });
    }
  });
