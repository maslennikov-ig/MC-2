/**
 * Delete Enrichment Procedure
 * @module server/routers/enrichment/procedures/delete
 *
 * Deletes an enrichment and its associated storage asset if exists.
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { deleteEnrichmentInputSchema } from '../schemas';
import { verifyEnrichmentAccess, buildAssetPath } from '../helpers';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { deleteEnrichmentAsset } from '../../../../stages/stage7-enrichments/services/storage-service';
import { logger } from '../../../../shared/logger/index.js';

/**
 * Delete an enrichment
 *
 * Purpose: Deletes an enrichment record from the database and removes
 * any associated asset from Supabase Storage.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - enrichmentId: UUID of the enrichment to delete
 *
 * Output:
 * - success: Boolean success flag
 * - deleted: Boolean indicating if deletion was successful
 *
 * Rate Limit: 10 deletes per minute
 *
 * @example
 * ```typescript
 * const result = await trpc.enrichment.delete.mutate({
 *   enrichmentId: 'enrichment-uuid',
 * });
 * // { success: true, deleted: true }
 * ```
 */
export const deleteEnrichment = protectedProcedure
  .use(createRateLimiter({ requests: 10, window: 60 })) // 10 deletes per minute
  .input(deleteEnrichmentInputSchema)
  .mutation(async ({ ctx, input }) => {
    const { enrichmentId } = input;
    const requestId = nanoid();
    const currentUser = ctx.user;

    logger.info({
      requestId,
      enrichmentId,
      userId: currentUser.id,
    }, 'Delete enrichment request');

    try {
      // Step 1: Verify enrichment access and get current data
      const enrichment = await verifyEnrichmentAccess(
        enrichmentId,
        currentUser.id,
        currentUser.organizationId,
        requestId
      );

      // Step 2: Delete asset from storage if exists
      if (enrichment.asset_id) {
        try {
          // Determine file extension based on enrichment type
          const extension = enrichment.enrichment_type === 'audio' ? 'mp3' : 'mp4';
          const assetPath = buildAssetPath(
            enrichment.course_id,
            enrichment.lesson_id,
            enrichmentId,
            extension
          );

          await deleteEnrichmentAsset(assetPath);

          logger.info({
            requestId,
            enrichmentId,
            assetPath,
          }, 'Enrichment asset deleted from storage');
        } catch (storageError) {
          // Log but don't fail - continue with database deletion
          logger.warn({
            requestId,
            enrichmentId,
            assetId: enrichment.asset_id,
            error: storageError instanceof Error ? storageError.message : String(storageError),
          }, 'Failed to delete enrichment asset from storage (continuing with db delete)');
        }
      }

      // Step 3: Delete enrichment record from database
      const supabase = getSupabaseAdmin();
      const { error: deleteError } = await supabase
        .from('lesson_enrichments')
        .delete()
        .eq('id', enrichmentId);

      if (deleteError) {
        logger.error({
          requestId,
          enrichmentId,
          error: deleteError.message,
        }, 'Failed to delete enrichment from database');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete enrichment',
        });
      }

      logger.info({
        requestId,
        enrichmentId,
        lessonId: enrichment.lesson_id,
        enrichmentType: enrichment.enrichment_type,
      }, 'Enrichment deleted');

      return {
        success: true,
        deleted: true,
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
      }, 'Delete enrichment failed');

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete enrichment',
      });
    }
  });
