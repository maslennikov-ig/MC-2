/**
 * Get Playback URL Procedure
 * @module server/routers/enrichment/procedures/get-playback-url
 *
 * Retrieves a signed playback URL for audio/video enrichment assets.
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { getPlaybackUrlInputSchema } from '../schemas';
import { verifyEnrichmentAccess, buildAssetPath } from '../helpers';
import { getSignedUrl } from '../../../../stages/stage7-enrichments/services/storage-service';
import { STORAGE_CONFIG } from '../../../../stages/stage7-enrichments/config';
import { logger } from '../../../../shared/logger/index.js';

/**
 * Get signed playback URL for media enrichment
 *
 * Purpose: Generates a signed URL for accessing audio/video assets
 * from Supabase Storage. URLs expire after 1 hour.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - enrichmentId: UUID of the enrichment
 *
 * Output:
 * - url: Signed URL for playback (null if no asset)
 * - expiresAt: ISO timestamp when URL expires (null if no asset)
 *
 * @example
 * ```typescript
 * const result = await trpc.enrichment.getPlaybackUrl.query({
 *   enrichmentId: 'enrichment-uuid',
 * });
 * // { url: 'https://...', expiresAt: '2024-01-01T12:00:00Z' }
 * // or
 * // { url: null, expiresAt: null }
 * ```
 */
export const getPlaybackUrl = protectedProcedure
  .input(getPlaybackUrlInputSchema)
  .query(async ({ ctx, input }) => {
    const { enrichmentId } = input;
    const requestId = nanoid();
    const currentUser = ctx.user;

    logger.debug({
      requestId,
      enrichmentId,
      userId: currentUser.id,
    }, 'Get playback URL request');

    try {
      // Step 1: Verify enrichment access and get current data
      const enrichment = await verifyEnrichmentAccess(
        enrichmentId,
        currentUser.id,
        currentUser.organizationId,
        requestId
      );

      // Step 2: Check if enrichment has an asset
      if (!enrichment.asset_id) {
        logger.debug({
          requestId,
          enrichmentId,
          enrichmentType: enrichment.enrichment_type,
          status: enrichment.status,
        }, 'Enrichment has no asset');

        return {
          url: null,
          expiresAt: null,
        };
      }

      // Step 3: Check if enrichment type supports playback
      const playbackTypes = ['audio', 'video'];
      if (!playbackTypes.includes(enrichment.enrichment_type)) {
        logger.debug({
          requestId,
          enrichmentId,
          enrichmentType: enrichment.enrichment_type,
        }, 'Enrichment type does not support playback');

        return {
          url: null,
          expiresAt: null,
        };
      }

      // Step 4: Determine file extension and build asset path
      const extension = enrichment.enrichment_type === 'audio' ? 'mp3' : 'mp4';
      const assetPath = buildAssetPath(
        enrichment.course_id,
        enrichment.lesson_id,
        enrichmentId,
        extension
      );

      // Step 5: Generate signed URL
      const signedUrl = await getSignedUrl(assetPath, STORAGE_CONFIG.SIGNED_URL_EXPIRES_IN);

      // Calculate expiration time
      const expiresAt = new Date(Date.now() + STORAGE_CONFIG.SIGNED_URL_EXPIRES_IN * 1000).toISOString();

      logger.debug({
        requestId,
        enrichmentId,
        assetPath,
        expiresIn: STORAGE_CONFIG.SIGNED_URL_EXPIRES_IN,
      }, 'Signed playback URL generated');

      return {
        url: signedUrl,
        expiresAt,
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
      }, 'Get playback URL failed');

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get playback URL',
      });
    }
  });
