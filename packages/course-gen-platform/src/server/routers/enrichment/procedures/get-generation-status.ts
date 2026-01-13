/**
 * Get Generation Status Procedure
 * @module server/routers/enrichment/procedures/get-generation-status
 *
 * Returns the current status and progress of an enrichment generation.
 * Called by the UI to poll for progress updates.
 *
 * This procedure:
 * 1. Validates the enrichment ID
 * 2. Fetches enrichment from database
 * 3. Verifies user has access via organization membership
 * 4. Maps status to progress percentage and step
 * 5. Returns GenerationStatusResponse for UI display
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import {
  getGenerationStatusInputSchema,
  statusToProgress,
  statusToStep,
  type EnrichmentStatus,
} from '@megacampus/shared-types';
import { verifyEnrichmentAccess } from '../helpers';
import { logger } from '../../../../shared/logger/index.js';

/**
 * Get enrichment generation status
 *
 * Purpose: Returns current status and progress for UI polling.
 * Maps database status to user-friendly progress indicators.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - enrichmentId: UUID of the enrichment to check
 *
 * Output:
 * - status: Current enrichment status
 * - progress: Progress percentage (0-100)
 * - currentStep: Current generation step for UI display
 * - estimatedTimeRemaining: Optional time estimate in seconds
 * - error: Error message if status is 'failed'
 *
 * Status to Progress Mapping:
 * - pending: 0%
 * - draft_generating: 25%
 * - draft_ready: 50%
 * - generating: 75%
 * - completed: 100%
 * - failed/cancelled: 0%
 *
 * @example
 * ```typescript
 * const status = await trpc.enrichment.getGenerationStatus.query({
 *   enrichmentId: 'uuid',
 * });
 * // { status: 'generating', progress: 75, currentStep: 'generating' }
 * ```
 */
export const getGenerationStatus = protectedProcedure
  .input(getGenerationStatusInputSchema)
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
      'Get generation status request'
    );

    try {
      // Step 1: Verify enrichment access and get enrichment data
      const enrichment = await verifyEnrichmentAccess(
        enrichmentId,
        currentUser.id,
        currentUser.organizationId,
        requestId
      );

      const status = enrichment.status;

      // Step 2: Map status to progress and step
      const progress = statusToProgress(status);
      const currentStep = statusToStep(status);

      // Step 3: Get error message if failed
      let error: string | undefined;
      if (status === 'failed') {
        // Fetch error message from database
        const { data: errorData } = await import('../../../../shared/supabase/admin')
          .then(m => m.getSupabaseAdmin())
          .then(supabase =>
            supabase
              .from('lesson_enrichments')
              .select('error_message')
              .eq('id', enrichmentId)
              .single()
          );

        error = errorData?.error_message || 'Generation failed';
      }

      // Step 4: Estimate time remaining based on status and type
      // This is a rough estimate - actual times vary by enrichment type
      let estimatedTimeRemaining: number | undefined;
      if (status === 'pending') {
        estimatedTimeRemaining = 30; // 30 seconds estimate for queued jobs
      } else if (status === 'draft_generating') {
        estimatedTimeRemaining = 20;
      } else if (status === 'generating') {
        estimatedTimeRemaining = 10;
      }

      logger.debug(
        {
          requestId,
          enrichmentId,
          status,
          progress,
          currentStep,
        },
        'Generation status retrieved'
      );

      return {
        status,
        progress,
        currentStep,
        estimatedTimeRemaining,
        error,
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
        'Get generation status failed'
      );

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get generation status',
      });
    }
  });
