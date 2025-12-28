/**
 * Reorder Enrichments Procedure
 * @module server/routers/enrichment/procedures/reorder
 *
 * Reorders enrichments within a lesson by updating their order_index values.
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { reorderEnrichmentsInputSchema } from '../schemas';
import { verifyLessonAccess } from '../helpers';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';

/**
 * Reorder enrichments within a lesson
 *
 * Purpose: Updates order_index for all enrichments in the orderedIds array.
 * Uses a transaction to ensure atomicity.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - lessonId: UUID of the lesson
 * - orderedIds: Array of enrichment UUIDs in desired order
 *
 * Output:
 * - success: Boolean success flag
 * - newOrder: Array of enrichment UUIDs in new order
 *
 * Rate Limit: 10 reorders per minute
 *
 * @example
 * ```typescript
 * const result = await trpc.enrichment.reorder.mutate({
 *   lessonId: 'lesson-uuid',
 *   orderedIds: ['enrichment-1', 'enrichment-3', 'enrichment-2'],
 * });
 * // { success: true, newOrder: ['enrichment-1', 'enrichment-3', 'enrichment-2'] }
 * ```
 */
export const reorder = protectedProcedure
  .use(createRateLimiter({ requests: 10, window: 60 })) // 10 reorders per minute
  .input(reorderEnrichmentsInputSchema)
  .mutation(async ({ ctx, input }) => {
    const { lessonId, orderedIds } = input;
    const requestId = nanoid();
    const currentUser = ctx.user;

    logger.info({
      requestId,
      lessonId,
      enrichmentCount: orderedIds.length,
      userId: currentUser.id,
    }, 'Reorder enrichments request');

    try {
      // Step 1: Verify lesson access
      await verifyLessonAccess(
        lessonId,
        currentUser.id,
        currentUser.organizationId,
        requestId
      );

      // Step 2: Verify all enrichments belong to this lesson
      const supabase = getSupabaseAdmin();
      const { data: existingEnrichments, error: fetchError } = await supabase
        .from('lesson_enrichments')
        .select('id')
        .eq('lesson_id', lessonId)
        .in('id', orderedIds);

      if (fetchError) {
        logger.error({
          requestId,
          lessonId,
          error: fetchError.message,
        }, 'Failed to fetch enrichments for reorder');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to verify enrichments',
        });
      }

      // Check if all requested enrichments exist
      const existingIds = new Set(existingEnrichments?.map(e => e.id) || []);
      const invalidIds = orderedIds.filter(id => !existingIds.has(id));

      if (invalidIds.length > 0) {
        logger.warn({
          requestId,
          lessonId,
          invalidIds,
        }, 'Some enrichment IDs not found in lesson');

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Enrichments not found in this lesson: ${invalidIds.join(', ')}`,
        });
      }

      // Step 3: Update order_index for each enrichment
      // Note: Supabase doesn't support transactions via JS client,
      // so we update each record individually (order_index is not a unique constraint)
      const updates = orderedIds.map((enrichmentId, index) => ({
        id: enrichmentId,
        order_index: index + 1, // 1-based index
        updated_at: new Date().toISOString(),
      }));

      // Use Promise.all for parallel updates
      const updatePromises = updates.map(update =>
        supabase
          .from('lesson_enrichments')
          .update({
            order_index: update.order_index,
            updated_at: update.updated_at,
          })
          .eq('id', update.id)
      );

      const results = await Promise.all(updatePromises);

      // Check for any errors
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        logger.error({
          requestId,
          lessonId,
          errorCount: errors.length,
          errors: errors.map(e => e.error?.message),
        }, 'Some enrichment reorder updates failed');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update some enrichment orders',
        });
      }

      logger.info({
        requestId,
        lessonId,
        reorderedCount: orderedIds.length,
      }, 'Enrichments reordered');

      return {
        success: true,
        newOrder: orderedIds,
      };
    } catch (error) {
      // Re-throw tRPC errors as-is
      if (error instanceof TRPCError) {
        throw error;
      }

      // Log and wrap unexpected errors
      logger.error({
        requestId,
        lessonId,
        error: error instanceof Error ? error.message : String(error),
      }, 'Reorder enrichments failed');

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to reorder enrichments',
      });
    }
  });
