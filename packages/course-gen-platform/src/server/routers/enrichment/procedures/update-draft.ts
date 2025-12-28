/**
 * Update Draft Procedure
 * @module server/routers/enrichment/procedures/update-draft
 *
 * Updates the draft content for two-stage enrichments before final generation.
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { updateDraftInputSchema } from '../schemas';
import { verifyEnrichmentAccess, isTwoStageType } from '../helpers';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';

/**
 * Update draft content for two-stage enrichments
 *
 * Purpose: Allows users to modify the draft content (script, outline, etc.)
 * before triggering final generation. Only applicable to enrichments in
 * 'draft_ready' status.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - enrichmentId: UUID of the enrichment
 * - draftContent: Updated draft content object
 *
 * Output:
 * - success: Boolean success flag
 *
 * Rate Limit: 20 updates per minute
 *
 * @example
 * ```typescript
 * const result = await trpc.enrichment.updateDraft.mutate({
 *   enrichmentId: 'enrichment-uuid',
 *   draftContent: {
 *     script: 'Updated narration script...',
 *     scenes: [...],
 *   },
 * });
 * // { success: true }
 * ```
 */
export const updateDraft = protectedProcedure
  .use(createRateLimiter({ requests: 20, window: 60 })) // 20 updates per minute
  .input(updateDraftInputSchema)
  .mutation(async ({ ctx, input }) => {
    const { enrichmentId, draftContent } = input;
    const requestId = nanoid();
    const currentUser = ctx.user;

    logger.info({
      requestId,
      enrichmentId,
      userId: currentUser.id,
    }, 'Update draft request');

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
        }, 'Update draft not applicable for this enrichment type');

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Update draft is only applicable to video and presentation enrichments, not '${enrichment.enrichment_type}'.`,
        });
      }

      // Step 3: Check if enrichment is in draft_ready status
      if (enrichment.status !== 'draft_ready') {
        logger.warn({
          requestId,
          enrichmentId,
          currentStatus: enrichment.status,
        }, 'Cannot update draft with current status');

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot update draft with status '${enrichment.status}'. Enrichment must be in 'draft_ready' status.`,
        });
      }

      // Step 3.5: Validate draft content structure
      if (!draftContent || typeof draftContent !== 'object') {
        logger.error({
          requestId,
          enrichmentId,
          draftContent,
        }, 'Invalid draft content structure');

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Draft content must be a valid object',
        });
      }

      // Step 4: Update the content field with new draft
      const supabase = getSupabaseAdmin();

      // Merge new draft content with existing content (preserving other fields)
      // Cast to a serializable type that satisfies Json
      const existingContent = enrichment.content ?? {};
      const updatedContent = JSON.parse(JSON.stringify({
        ...existingContent,
        draft: draftContent,
        draft_updated_at: new Date().toISOString(),
        draft_updated_by: currentUser.id,
      }));

      const { error: updateError } = await supabase
        .from('lesson_enrichments')
        .update({
          content: updatedContent,
          updated_at: new Date().toISOString(),
        })
        .eq('id', enrichmentId);

      if (updateError) {
        logger.error({
          requestId,
          enrichmentId,
          error: updateError.message,
        }, 'Failed to update draft content');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update draft content',
        });
      }

      logger.info({
        requestId,
        enrichmentId,
        enrichmentType: enrichment.enrichment_type,
      }, 'Draft content updated');

      return {
        success: true,
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
      }, 'Update draft failed');

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update draft',
      });
    }
  });
