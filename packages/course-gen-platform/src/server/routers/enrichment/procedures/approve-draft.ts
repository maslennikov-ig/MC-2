/**
 * Approve Draft Procedure
 * @module server/routers/enrichment/procedures/approve-draft
 *
 * Approves the draft and triggers final generation for two-stage enrichments.
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { approveDraftInputSchema } from '../schemas';
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
 * Approve draft and trigger final generation
 *
 * Purpose: Transitions a two-stage enrichment from 'draft_ready' to 'generating'
 * and enqueues a BullMQ job for the final generation phase (phase 2).
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - enrichmentId: UUID of the enrichment
 *
 * Output:
 * - success: Boolean success flag
 * - enrichmentId: UUID of the enrichment
 * - jobId: BullMQ job ID for tracking
 *
 * Rate Limit: 10 approvals per minute
 *
 * @example
 * ```typescript
 * const result = await trpc.enrichment.approveDraft.mutate({
 *   enrichmentId: 'enrichment-uuid',
 * });
 * // { success: true, enrichmentId: 'uuid', jobId: 'job-id' }
 * ```
 */
export const approveDraft = protectedProcedure
  .use(createRateLimiter({ requests: 10, window: 60 })) // 10 approvals per minute
  .input(approveDraftInputSchema)
  .mutation(async ({ ctx, input }) => {
    const { enrichmentId } = input;
    const requestId = nanoid();
    const currentUser = ctx.user;

    logger.info({
      requestId,
      enrichmentId,
      userId: currentUser.id,
    }, 'Approve draft request');

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
        }, 'Approve draft not applicable for this enrichment type');

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Approve draft is only applicable to video and presentation enrichments, not '${enrichment.enrichment_type}'.`,
        });
      }

      // Step 3: Check if enrichment is in draft_ready status
      if (enrichment.status !== 'draft_ready') {
        logger.warn({
          requestId,
          enrichmentId,
          currentStatus: enrichment.status,
        }, 'Cannot approve draft with current status');

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot approve draft with status '${enrichment.status}'. Enrichment must be in 'draft_ready' status.`,
        });
      }

      // Step 3.5: Validate that draft content exists
      const draftContent = (enrichment.content as Record<string, unknown> | null)?.draft;
      if (!draftContent) {
        logger.error({
          requestId,
          enrichmentId,
          content: enrichment.content,
        }, 'Draft content missing for approval');

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Draft content is missing. Please regenerate the draft.',
        });
      }

      // Step 4: Update enrichment status to 'generating'
      const supabase = getSupabaseAdmin();
      const { error: updateError } = await supabase
        .from('lesson_enrichments')
        .update({
          status: 'generating',
          updated_at: new Date().toISOString(),
        })
        .eq('id', enrichmentId);

      if (updateError) {
        logger.error({
          requestId,
          enrichmentId,
          error: updateError.message,
        }, 'Failed to update enrichment status to generating');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to approve draft',
        });
      }

      // Step 5: Enqueue BullMQ job for phase 2 (final generation)
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
        retryAttempt: enrichment.generation_attempt,
        isDraftPhase: false, // Phase 2 - final generation
      };

      const job = await addEnrichmentJob(queue, jobInput, {
        jobId: `enrich-final-${enrichmentId}-${Date.now()}`,
      });

      logger.info({
        requestId,
        enrichmentId,
        jobId: job.id,
        enrichmentType,
      }, 'Draft approved, final generation enqueued');

      return {
        success: true,
        enrichmentId,
        jobId: job.id,
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
      }, 'Approve draft failed');

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to approve draft',
      });
    }
  });
