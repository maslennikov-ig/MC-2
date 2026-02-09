/**
 * Cancel Generation Router
 * @module server/routers/generation/lifecycle/cancel
 *
 * Cancels an in-progress course generation by updating status,
 * removing pending/active BullMQ jobs, and cleaning up resources.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { instructorProcedure } from '../../../procedures';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';
import { nanoid } from 'nanoid';
import { removeJobsByCourseId } from '../../../../orchestrator/queue';
import { assertCourseAccess, buildAuthContext } from '../../../helpers/course-authorization';

export const cancelRouter = {
  cancelGeneration: instructorProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { courseId } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();
      const userId = ctx.user!.id;

      try {
        // Verify course exists and user has ownership
        const { data: course, error: fetchError } = await supabase
          .from('courses')
          .select('id, user_id, generation_status, organization_id')
          .eq('id', courseId)
          .single();

        if (fetchError || !course) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
        }

        assertCourseAccess(buildAuthContext(ctx.user!), course, 'cancel generation');

        // Check if course is already in terminal state
        const terminalStatuses = ['completed', 'failed', 'cancelled'];
        if (terminalStatuses.includes(course.generation_status as string)) {
          return {
            success: true,
            message: 'Generation already in terminal state',
            removedJobs: 0,
          };
        }

        // Update course status to cancelled
        const { error: updateError } = await supabase
          .from('courses')
          .update({
            generation_status: 'cancelled',
            updated_at: new Date().toISOString(),
          })
          .eq('id', courseId);

        if (updateError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update course status',
          });
        }

        // Remove all pending/active jobs from BullMQ queue
        let removedJobsCount = 0;
        try {
          const result = await removeJobsByCourseId(courseId);
          removedJobsCount = result.removed;

          logger.info(
            {
              requestId,
              courseId,
              userId,
              removedJobs: result.removed,
              errors: result.errors,
              orphanedCleaned: result.orphanedCleaned,
            },
            'Cleaned up BullMQ jobs for cancelled course'
          );
        } catch (queueError) {
          logger.error(
            {
              requestId,
              courseId,
              error: queueError instanceof Error ? queueError.message : String(queueError),
            },
            'Failed to clean up BullMQ jobs (non-fatal)'
          );
        }

        logger.info(
          {
            requestId,
            courseId,
            userId,
            previousStatus: course.generation_status,
          },
          'Course generation cancelled'
        );

        return {
          success: true,
          message: 'Generation cancelled successfully',
          removedJobs: removedJobsCount,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error(
          {
            requestId,
            courseId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in cancelGeneration'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to cancel generation',
        });
      }
    }),
};
