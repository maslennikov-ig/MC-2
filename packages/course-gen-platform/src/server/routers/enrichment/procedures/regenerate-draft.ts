/**
 * Regenerate Draft Procedure
 * @module server/routers/enrichment/procedures/regenerate-draft
 *
 * Regenerates the draft phase for two-stage enrichments (video/presentation).
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { regenerateDraftInputSchema } from '../schemas';
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
 * Regenerate draft for two-stage enrichments
 *
 * Purpose: Resets a two-stage enrichment (video/presentation) to regenerate
 * the draft phase. Only applicable to enrichment types that use the
 * draft -> final generation flow.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - enrichmentId: UUID of the enrichment to regenerate draft
 *
 * Output:
 * - success: Boolean success flag
 * - enrichmentId: UUID of the enrichment
 * - newJobId: New BullMQ job ID for tracking
 *
 * Rate Limit: 5 regenerates per minute
 *
 * Applicable statuses: draft_ready, failed (for two-stage types only)
 *
 * @example
 * ```typescript
 * const result = await trpc.enrichment.regenerateDraft.mutate({
 *   enrichmentId: 'enrichment-uuid',
 * });
 * // { success: true, enrichmentId: 'uuid', newJobId: 'job-id' }
 * ```
 */
export const regenerateDraft = protectedProcedure
  .use(createRateLimiter({ requests: 5, window: 60 })) // 5 draft regenerates per minute
  .input(regenerateDraftInputSchema)
  .mutation(async ({ ctx, input }) => {
    const { enrichmentId } = input;
    const requestId = nanoid();
    const currentUser = ctx.user;

    logger.info({
      requestId,
      enrichmentId,
      userId: currentUser.id,
    }, 'Regenerate draft request');

    try {
      // Step 1: Verify enrichment access and get current data
      const enrichment = await verifyEnrichmentAccess(
        enrichmentId,
        currentUser.id,
        currentUser.organizationId,
        requestId
      );

      // Step 2: Verify this is a two-stage enrichment type
      if (!isTwoStageType(enrichment.enrichment_type)) {
        logger.warn({
          requestId,
          enrichmentId,
          enrichmentType: enrichment.enrichment_type,
        }, 'Regenerate draft not applicable for this enrichment type');

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Regenerate draft is only applicable to video and presentation enrichments, not '${enrichment.enrichment_type}'.`,
        });
      }

      // Step 3: Check if enrichment is in a valid state for draft regeneration
      const validStatuses = ['draft_ready', 'failed', 'cancelled'];
      if (!validStatuses.includes(enrichment.status)) {
        logger.warn({
          requestId,
          enrichmentId,
          currentStatus: enrichment.status,
        }, 'Cannot regenerate draft with current status');

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot regenerate draft with status '${enrichment.status}'. Valid statuses: ${validStatuses.join(', ')}.`,
        });
      }

      // Step 4: Update enrichment record
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
        }, 'Failed to update enrichment for draft regeneration');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to reset enrichment for draft regeneration',
        });
      }

      // Step 5: Enqueue new BullMQ job for draft phase
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
        isDraftPhase: true, // Explicitly request draft phase
      };

      const job = await addEnrichmentJob(queue, jobInput, {
        jobId: `enrich-draft-${enrichmentId}-${newAttempt}`,
      });

      logger.info({
        requestId,
        enrichmentId,
        newAttempt,
        jobId: job.id,
      }, 'Draft regeneration enqueued');

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
      }, 'Regenerate draft failed');

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to regenerate draft',
      });
    }
  });
