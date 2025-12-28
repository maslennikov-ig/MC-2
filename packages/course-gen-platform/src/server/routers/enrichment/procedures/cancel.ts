/**
 * Cancel Enrichment Procedure
 * @module server/routers/enrichment/procedures/cancel
 *
 * Cancels an in-progress enrichment generation.
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { cancelEnrichmentInputSchema } from '../schemas';
import { verifyEnrichmentAccess, isCancellableStatus } from '../helpers';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { createStage7Queue } from '../../../../stages/stage7-enrichments/factory';
import { logger } from '../../../../shared/logger/index.js';

// Create queue instance (singleton)
let stage7Queue: ReturnType<typeof createStage7Queue> | null = null;

function getQueue() {
  if (!stage7Queue) {
    stage7Queue = createStage7Queue();
  }
  return stage7Queue;
}

/**
 * Cancel an in-progress enrichment generation
 *
 * Purpose: Cancels an enrichment by updating its status to 'cancelled'
 * and attempting to remove the job from the BullMQ queue.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - enrichmentId: UUID of the enrichment to cancel
 *
 * Output:
 * - success: Boolean success flag
 * - cancelled: Boolean indicating if cancellation was successful
 *
 * Rate Limit: 10 cancels per minute
 *
 * Cancellable statuses: pending, draft_generating, generating
 *
 * @example
 * ```typescript
 * const result = await trpc.enrichment.cancel.mutate({
 *   enrichmentId: 'enrichment-uuid',
 * });
 * // { success: true, cancelled: true }
 * ```
 */
export const cancel = protectedProcedure
  .use(createRateLimiter({ requests: 10, window: 60 })) // 10 cancels per minute
  .input(cancelEnrichmentInputSchema)
  .mutation(async ({ ctx, input }) => {
    const { enrichmentId } = input;
    const requestId = nanoid();
    const currentUser = ctx.user;

    logger.info({
      requestId,
      enrichmentId,
      userId: currentUser.id,
    }, 'Cancel enrichment request');

    try {
      // Step 1: Verify enrichment access and get current data
      const enrichment = await verifyEnrichmentAccess(
        enrichmentId,
        currentUser.id,
        currentUser.organizationId,
        requestId
      );

      // Step 2: Check if enrichment can be cancelled
      if (!isCancellableStatus(enrichment.status)) {
        logger.warn({
          requestId,
          enrichmentId,
          currentStatus: enrichment.status,
        }, 'Cannot cancel enrichment with current status');

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot cancel enrichment with status '${enrichment.status}'. Only 'pending', 'draft_generating', or 'generating' enrichments can be cancelled.`,
        });
      }

      // Step 3: Update enrichment status to 'cancelled'
      const supabase = getSupabaseAdmin();
      const { error: updateError } = await supabase
        .from('lesson_enrichments')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', enrichmentId);

      if (updateError) {
        logger.error({
          requestId,
          enrichmentId,
          error: updateError.message,
        }, 'Failed to update enrichment status to cancelled');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to cancel enrichment',
        });
      }

      // Step 4: Attempt to remove job from BullMQ queue
      try {
        const queue = getQueue();
        const jobId = `enrich-${enrichmentId}`;

        // Try to get and remove the job
        const job = await queue.getJob(jobId);
        if (job) {
          const state = await job.getState();
          if (state === 'waiting' || state === 'delayed') {
            await job.remove();
            logger.info({
              requestId,
              enrichmentId,
              jobId,
              state,
            }, 'Removed enrichment job from queue');
          } else {
            logger.info({
              requestId,
              enrichmentId,
              jobId,
              state,
            }, 'Job already active, cannot remove from queue');
          }
        } else {
          // Also try with retry attempt suffix
          const jobs = await queue.getJobs(['waiting', 'delayed']);
          const matchingJob = jobs.find(j => j.id?.startsWith(`enrich-${enrichmentId}`));
          if (matchingJob) {
            await matchingJob.remove();
            logger.info({
              requestId,
              enrichmentId,
              jobId: matchingJob.id,
            }, 'Removed enrichment job from queue (found by prefix)');
          }
        }
      } catch (queueError) {
        // Log but don't fail - database update is the primary operation
        logger.warn({
          requestId,
          enrichmentId,
          error: queueError instanceof Error ? queueError.message : String(queueError),
        }, 'Failed to remove job from queue (non-critical)');
      }

      logger.info({
        requestId,
        enrichmentId,
        previousStatus: enrichment.status,
      }, 'Enrichment cancelled');

      return {
        success: true,
        cancelled: true,
      };
    } catch (error) {
      // Re-throw tRPC errors as-is
      if (error instanceof TRPCError) {
        throw error;
      }

      // Log and wrap unexpected errors
      logger.error({
        requestId,
        enrichmentId,
        error: error instanceof Error ? error.message : String(error),
      }, 'Cancel enrichment failed');

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to cancel enrichment',
      });
    }
  });
