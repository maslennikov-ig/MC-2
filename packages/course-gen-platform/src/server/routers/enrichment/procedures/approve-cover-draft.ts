/**
 * Approve Cover Draft Procedure
 * @module server/routers/enrichment/procedures/approve-cover-draft
 *
 * Approves cover draft with selected variant and triggers final image generation.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { verifyEnrichmentAccess } from '../helpers';
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
 * Input schema for approve cover draft
 */
export const approveCoverDraftInputSchema = z.object({
  /** Enrichment UUID */
  enrichmentId: z.string().uuid('Invalid enrichment ID'),
  /** Selected variant ID (1, 2, or 3) */
  selectedVariantId: z.number().int().min(1).max(3),
});

/**
 * Approve cover draft with selected variant and trigger final generation
 *
 * Purpose: Updates cover draft with selected variant and enqueues final image generation.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - enrichmentId: UUID of the cover enrichment
 * - selectedVariantId: The variant ID (1, 2, or 3) selected by the user
 *
 * Output:
 * - success: Boolean success flag
 * - enrichmentId: UUID of the enrichment
 * - jobId: BullMQ job ID for tracking
 *
 * Rate Limit: 10 approvals per minute
 */
export const approveCoverDraft = protectedProcedure
  .use(createRateLimiter({ requests: 10, window: 60 }))
  .input(approveCoverDraftInputSchema)
  .mutation(async ({ ctx, input }) => {
    const { enrichmentId, selectedVariantId } = input;
    const requestId = nanoid();
    const currentUser = ctx.user;

    logger.info({
      requestId,
      enrichmentId,
      selectedVariantId,
      userId: currentUser.id,
    }, 'Approve cover draft request');

    try {
      // Step 1: Verify enrichment access and get current data
      const enrichment = await verifyEnrichmentAccess(
        enrichmentId,
        currentUser.id,
        currentUser.organizationId,
        requestId
      );

      // Step 2: Verify this is a cover enrichment
      if (enrichment.enrichment_type !== 'cover') {
        logger.warn({
          requestId,
          enrichmentId,
          enrichmentType: enrichment.enrichment_type,
        }, 'Approve cover draft not applicable for this enrichment type');

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `This operation is only applicable to cover enrichments, not '${enrichment.enrichment_type}'.`,
        });
      }

      // Step 3: Check if enrichment is in draft_ready status
      if (enrichment.status !== 'draft_ready') {
        logger.warn({
          requestId,
          enrichmentId,
          currentStatus: enrichment.status,
        }, 'Cannot approve cover draft with current status');

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot approve draft with status '${enrichment.status}'. Enrichment must be in 'draft_ready' status.`,
        });
      }

      // Step 4: Validate draft content exists and has variants
      const content = enrichment.content;
      if (!content || content.type !== 'cover_draft' || !Array.isArray(content.variants)) {
        logger.error({
          requestId,
          enrichmentId,
          content,
        }, 'Cover draft content missing or invalid');

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cover draft content is missing or invalid. Please regenerate the draft.',
        });
      }

      // Step 5: Validate selected variant exists
      const variants = content.variants as Array<{ id: number; prompt_en: string; description_localized: string }>;
      const selectedVariant = variants.find(v => v.id === selectedVariantId);

      if (!selectedVariant) {
        logger.warn({
          requestId,
          enrichmentId,
          selectedVariantId,
          availableIds: variants.map(v => v.id),
        }, 'Selected variant not found in draft');

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Variant ${selectedVariantId} not found in draft. Available variants: ${variants.map(v => v.id).join(', ')}`,
        });
      }

      // Step 6: Update draft content with selected variant
      const updatedContent = {
        ...content,
        selected_variant: selectedVariantId,
      };

      const supabase = getSupabaseAdmin();
      const { error: updateError } = await supabase
        .from('lesson_enrichments')
        .update({
          content: updatedContent,
          status: 'generating',
          updated_at: new Date().toISOString(),
        })
        .eq('id', enrichmentId);

      if (updateError) {
        logger.error({
          requestId,
          enrichmentId,
          error: updateError.message,
        }, 'Failed to update cover draft with selected variant');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to approve cover draft',
        });
      }

      // Step 7: Enqueue BullMQ job for final generation (phase 2)
      const queue = getQueue();
      const jobInput: Stage7JobInput = {
        enrichmentId,
        enrichmentType: 'cover' as EnrichmentType,
        lessonId: enrichment.lesson_id,
        courseId: enrichment.course_id,
        userId: currentUser.id,
        organizationId: currentUser.organizationId,
        settings: {},
        retryAttempt: enrichment.generation_attempt,
        isDraftPhase: false, // Phase 2 - final generation
      };

      const job = await addEnrichmentJob(queue, jobInput, {
        jobId: `enrich-cover-final-${enrichmentId}-${Date.now()}`,
      });

      logger.info({
        requestId,
        enrichmentId,
        jobId: job.id,
        selectedVariantId,
      }, 'Cover draft approved, final generation enqueued');

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
      }, 'Approve cover draft failed');

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to approve cover draft',
      });
    }
  });
