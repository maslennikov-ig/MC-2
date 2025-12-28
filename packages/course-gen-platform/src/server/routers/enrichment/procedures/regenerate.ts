/**
 * Regenerate Enrichment Procedure
 * @module server/routers/enrichment/procedures/regenerate
 *
 * Regenerates a failed enrichment by resetting status and re-enqueuing a job.
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { regenerateEnrichmentInputSchema } from '../schemas';
import { verifyEnrichmentAccess, isTwoStageType } from '../helpers';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { createStage7Queue, addEnrichmentJob } from '../../../../stages/stage7-enrichments/factory';
import type { Stage7JobInput } from '../../../../stages/stage7-enrichments/types';
import type { EnrichmentType } from '@megacampus/shared-types';
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
 * Regenerate a failed enrichment
 *
 * Purpose: Resets an enrichment to 'pending' status, increments generation_attempt,
 * clears error fields, and enqueues a new BullMQ job.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - enrichmentId: UUID of the enrichment to regenerate
 *
 * Output:
 * - success: Boolean success flag
 * - enrichmentId: UUID of the enrichment
 * - newJobId: New BullMQ job ID for tracking
 *
 * Rate Limit: 10 regenerates per minute
 *
 * @example
 * ```typescript
 * const result = await trpc.enrichment.regenerate.mutate({
 *   enrichmentId: 'enrichment-uuid',
 * });
 * // { success: true, enrichmentId: 'uuid', newJobId: 'job-id' }
 * ```
 */
export const regenerate = protectedProcedure
  .use(createRateLimiter({ requests: 10, window: 60 })) // 10 regenerates per minute
  .input(regenerateEnrichmentInputSchema)
  .mutation(async ({ ctx, input }) => {
    const { enrichmentId } = input;
    const requestId = nanoid();
    const currentUser = ctx.user;

    logger.info({
      requestId,
      enrichmentId,
      userId: currentUser.id,
    }, 'Regenerate enrichment request');

    try {
      // Step 1: Verify enrichment access and get current data
      const enrichment = await verifyEnrichmentAccess(
        enrichmentId,
        currentUser.id,
        currentUser.organizationId,
        requestId
      );

      // Step 2: Check if enrichment can be regenerated
      if (enrichment.status !== 'failed' && enrichment.status !== 'cancelled') {
        logger.warn({
          requestId,
          enrichmentId,
          currentStatus: enrichment.status,
        }, 'Cannot regenerate enrichment with current status');

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot regenerate enrichment with status '${enrichment.status}'. Only 'failed' or 'cancelled' enrichments can be regenerated.`,
        });
      }

      // Step 3: Update enrichment record
      const supabase = getSupabaseAdmin();
      const newAttempt = enrichment.generation_attempt + 1;
      const { error: updateError } = await supabase
        .from('lesson_enrichments')
        .update({
          status: 'pending',
          generation_attempt: newAttempt,
          error_message: null,
          error_details: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', enrichmentId);

      if (updateError) {
        logger.error({
          requestId,
          enrichmentId,
          error: updateError.message,
        }, 'Failed to update enrichment for regeneration');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to reset enrichment for regeneration',
        });
      }

      // Step 4: Enqueue new BullMQ job
      const queue = getQueue();
      const enrichmentType = enrichment.enrichment_type as EnrichmentType;
      const jobInput: Stage7JobInput = {
        enrichmentId,
        enrichmentType,
        lessonId: enrichment.lesson_id,
        courseId: enrichment.course_id,
        userId: currentUser.id,
        organizationId: currentUser.organizationId,
        settings: {},
        retryAttempt: newAttempt,
        isDraftPhase: isTwoStageType(enrichmentType),
      };

      const job = await addEnrichmentJob(queue, jobInput, {
        jobId: `enrich-${enrichmentId}-${newAttempt}`,
      });

      logger.info({
        requestId,
        enrichmentId,
        newAttempt,
        jobId: job.id,
      }, 'Enrichment regeneration enqueued');

      return {
        success: true,
        enrichmentId,
        newJobId: job.id,
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
      }, 'Regenerate enrichment failed');

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to regenerate enrichment',
      });
    }
  });
