/**
 * Token Estimate Router
 * @module server/routers/generation/editing/token-estimate
 *
 * Provides token cost estimates for chat operations (refine vs regenerate).
 * Used by UI to help users understand the relative cost of different operations.
 */

import { z } from 'zod';
import { instructorProcedure } from '../../../procedures';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Base token estimates for chat operations.
 * These are approximations based on typical usage patterns.
 */
const TOKEN_ESTIMATES = {
  /** Refine: conversation context + response (~2500 tokens) */
  REFINE_BASE: 2500,
  /** Regenerate: base cost for full regeneration */
  REGENERATE_BASE: 20000,
  /** Additional tokens per course document */
  REGENERATE_PER_DOCUMENT: 5000,
} as const;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Token formatting constants.
 * Values < threshold shown as-is, larger values shown in K format.
 */
const TOKEN_FORMAT = {
  /** Threshold for switching to K format */
  THRESHOLD: 1000,
  /** Decimal places for K format */
  DECIMALS: 1,
} as const;

/**
 * Format token count for display.
 * Values < 1000 shown as-is (e.g., "500"), larger values shown in K format (e.g., "~2.5K").
 *
 * @param tokens - Raw token count
 * @returns Formatted string
 */
function formatTokens(tokens: number): string {
  if (tokens < TOKEN_FORMAT.THRESHOLD) {
    return `${tokens}`;
  }
  return `~${(tokens / TOKEN_FORMAT.THRESHOLD).toFixed(TOKEN_FORMAT.DECIMALS)}K`;
}

// ============================================================================
// Token Estimate Router
// ============================================================================

export const tokenEstimateRouter = {
  /**
   * Get token estimates for chat operations.
   *
   * Returns estimated token costs for:
   * - refine: Fixed ~2500 tokens (conversation context + response)
   * - regenerate: Dynamic based on course documents (20K base + 5K per doc)
   */
  getChatTokenEstimates: instructorProcedure
    .input(
      z.object({
        courseId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const { courseId } = input;
      const supabase = getSupabaseAdmin();

      // Refine is always a fixed estimate
      const refineTokens = TOKEN_ESTIMATES.REFINE_BASE;

      // Regenerate depends on document count
      let documentCount = 0;

      try {
        const { count, error } = await supabase
          .from('file_catalog')
          .select('*', { count: 'exact', head: true })
          .eq('course_id', courseId);

        if (error) {
          logger.warn(
            { courseId, error },
            'Failed to count course documents for token estimate'
          );
          // Continue with 0 documents - will show base estimate
        } else {
          documentCount = count || 0;
        }
      } catch (err) {
        logger.warn(
          { courseId, error: err instanceof Error ? err.message : String(err) },
          'Error counting course documents'
        );
        // Continue with 0 documents
      }

      const regenerateTokens =
        TOKEN_ESTIMATES.REGENERATE_BASE +
        documentCount * TOKEN_ESTIMATES.REGENERATE_PER_DOCUMENT;

      logger.debug(
        { courseId, documentCount, refineTokens, regenerateTokens },
        'Token estimates calculated'
      );

      return {
        refine: {
          tokens: refineTokens,
          formatted: formatTokens(refineTokens),
        },
        regenerate: {
          tokens: regenerateTokens,
          formatted: formatTokens(regenerateTokens),
        },
      };
    }),
};
