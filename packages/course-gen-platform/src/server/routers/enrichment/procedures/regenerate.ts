/**
 * Regenerate Enrichment Procedure
 * @module server/routers/enrichment/procedures/regenerate
 *
 * Regenerates an enrichment by resetting status and re-enqueuing a job.
 * Works for failed, cancelled, and completed enrichments.
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { regenerateEnrichmentInputSchema } from '../schemas';
import { verifyEnrichmentAccess, isTwoStageType, buildAssetPath } from '../helpers';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { createStage7Queue, addEnrichmentJob } from '../../../../stages/stage7-enrichments/factory';
import { deleteEnrichmentAsset } from '../../../../stages/stage7-enrichments/services/storage-service';
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

// Extension map for storage cleanup
const EXTENSION_MAP: Record<string, string> = {
  audio: 'mp3',
  video: 'mp4',
  cover: 'webp',
  banner: 'webp',
  card: 'webp',
  presentation: 'pptx',
  document: 'pdf',
};

/**
 * Regenerate an enrichment
 *
 * Purpose: Resets an enrichment to 'pending' status, increments generation_attempt,
 * clears error fields and content, and enqueues a new BullMQ job.
 * Works for failed, cancelled, and completed enrichments.
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

    logger.info(
      {
        requestId,
        enrichmentId,
        userId: currentUser.id,
      },
      'Regenerate enrichment request'
    );

    try {
      // Step 1: Verify enrichment access and get current data
      const enrichment = await verifyEnrichmentAccess(
        enrichmentId,
        currentUser.id,
        currentUser.organizationId,
        requestId
      );

      // Step 2: Check if enrichment can be regenerated
      const allowedStatuses = ['failed', 'cancelled', 'completed', 'generating'];
      if (!allowedStatuses.includes(enrichment.status)) {
        logger.warn(
          {
            requestId,
            enrichmentId,
            currentStatus: enrichment.status,
          },
          'Cannot regenerate enrichment with current status'
        );

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot regenerate enrichment with status '${enrichment.status}'. Only failed, cancelled, completed, or stuck generating enrichments can be regenerated.`,
        });
      }

      // Step 2.1: For generating enrichments, require a minimum stuck time (10 min)
      if (enrichment.status === 'generating') {
        const updatedAt = new Date(enrichment.updated_at);
        if (isNaN(updatedAt.getTime())) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Invalid enrichment timestamp',
          });
        }
        const stuckThresholdMs = 10 * 60 * 1000;
        if (Date.now() - updatedAt.getTime() < stuckThresholdMs) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Enrichment is still generating. Wait at least 10 minutes before regenerating.',
          });
        }
      }

      // Step 2.5: For completed enrichments, clean up existing assets
      if (enrichment.status === 'completed') {
        const extension = EXTENSION_MAP[enrichment.enrichment_type];
        if (extension) {
          try {
            const assetPath = buildAssetPath(
              enrichment.course_id,
              enrichment.lesson_id,
              enrichmentId,
              extension
            );
            await deleteEnrichmentAsset(assetPath);
            logger.info(
              {
                requestId,
                enrichmentId,
                assetPath,
              },
              'Deleted existing asset for regeneration'
            );
          } catch (storageError) {
            // Log but don't fail - file may not exist
            logger.warn(
              {
                requestId,
                enrichmentId,
                error: storageError instanceof Error ? storageError.message : String(storageError),
              },
              'Failed to delete existing asset (continuing with regeneration)'
            );
          }
        }
      }

      // Step 3: Update enrichment record (clear content for completed enrichments)
      const supabase = getSupabaseAdmin();
      const newAttempt = enrichment.generation_attempt + 1;
      const updateData: Record<string, unknown> = {
        status: 'pending',
        generation_attempt: newAttempt,
        error_message: null,
        error_details: null,
        updated_at: new Date().toISOString(),
      };

      // Clear content and draft_content when regenerating completed enrichments
      if (enrichment.status === 'completed') {
        updateData.content = null;
        updateData.draft_content = null;
      }

      const { error: updateError } = await supabase
        .from('lesson_enrichments')
        .update(updateData)
        .eq('id', enrichmentId);

      if (updateError) {
        logger.error(
          {
            requestId,
            enrichmentId,
            error: updateError.message,
          },
          'Failed to update enrichment for regeneration'
        );

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
        isDraftPhase: isTwoStageType(enrichmentType),
      };

      const job = await addEnrichmentJob(queue, jobInput, {
        jobId: `enrich-${enrichmentId}-${newAttempt}`,
      });

      logger.info(
        {
          requestId,
          enrichmentId,
          newAttempt,
          jobId: job.id,
        },
        'Enrichment regeneration enqueued'
      );

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
      logger.error(
        {
          requestId,
          enrichmentId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Regenerate enrichment failed'
      );

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to regenerate enrichment',
      });
    }
  });
