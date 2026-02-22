/**
 * Get Playback URL Procedure
 * @module server/routers/enrichment/procedures/get-playback-url
 *
 * Retrieves a playback URL for audio/video enrichment assets.
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { getPlaybackUrlInputSchema } from '../schemas';
import { verifyEnrichmentAccess } from '../helpers';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { getSignedUrl } from '../../../../stages/stage7-enrichments/services/storage-service';
import {
  buildPublicUrl,
  useLocalStorage,
} from '../../../../stages/stage7-enrichments/services/unified-storage-service';
import { STORAGE_CONFIG } from '../../../../stages/stage7-enrichments/config';
import { logger } from '../../../../shared/logger/index.js';

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Get playback URL for media enrichment
 *
 * Purpose: Generates a playback URL for accessing audio/video assets.
 * - Supabase mode: signed URL (expires after 1 hour)
 * - Local storage mode: public URL
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - enrichmentId: UUID of the enrichment
 *
 * Output:
 * - url: Playback URL (null if no asset)
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

    logger.debug(
      {
        requestId,
        enrichmentId,
        userId: currentUser.id,
      },
      'Get playback URL request'
    );

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
        logger.debug(
          {
            requestId,
            enrichmentId,
            enrichmentType: enrichment.enrichment_type,
            status: enrichment.status,
          },
          'Enrichment has no asset'
        );

        return {
          url: null,
          expiresAt: null,
        };
      }

      // Step 3: Check if enrichment type supports playback
      const playbackTypes = ['audio', 'video', 'nlm_audio', 'nlm_video'];
      if (!playbackTypes.includes(enrichment.enrichment_type)) {
        logger.debug(
          {
            requestId,
            enrichmentId,
            enrichmentType: enrichment.enrichment_type,
          },
          'Enrichment type does not support playback'
        );

        return {
          url: null,
          expiresAt: null,
        };
      }

      // Step 4: Resolve storage path from assets table
      const supabase = getSupabaseAdmin();
      const { data: asset, error: assetError } = await supabase
        .from('assets')
        .select('file_path')
        .eq('id', enrichment.asset_id)
        .single();

      if (assetError || !asset?.file_path) {
        logger.warn(
          {
            requestId,
            enrichmentId,
            assetId: enrichment.asset_id,
            error: assetError?.message,
          },
          'Enrichment asset file path not found'
        );

        return {
          url: null,
          expiresAt: null,
        };
      }

      const assetPath = asset.file_path;

      // Step 5: Generate playback URL based on storage backend
      const isLocalStorage = useLocalStorage();
      const url = isLocalStorage
        ? isAbsoluteHttpUrl(assetPath)
          ? assetPath
          : buildPublicUrl(assetPath)
        : await getSignedUrl(assetPath, STORAGE_CONFIG.SIGNED_URL_EXPIRES_IN);

      const expiresAt = new Date(
        Date.now() + STORAGE_CONFIG.SIGNED_URL_EXPIRES_IN * 1000
      ).toISOString();

      logger.debug(
        {
          requestId,
          enrichmentId,
          assetPath,
          storageBackend: isLocalStorage ? 'local' : 'supabase',
          expiresIn: STORAGE_CONFIG.SIGNED_URL_EXPIRES_IN,
        },
        'Playback URL generated'
      );

      return {
        url,
        expiresAt,
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
        'Get playback URL failed'
      );

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get playback URL',
      });
    }
  });
