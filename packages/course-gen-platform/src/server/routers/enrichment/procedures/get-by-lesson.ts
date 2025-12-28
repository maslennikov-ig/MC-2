/**
 * Get Enrichments By Lesson Procedure
 * @module server/routers/enrichment/procedures/get-by-lesson
 *
 * Retrieves all enrichments for a specific lesson.
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { getByLessonInputSchema } from '../schemas';
import { verifyLessonAccess } from '../helpers';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';

/**
 * Get all enrichments for a specific lesson
 *
 * Purpose: Retrieves full enrichment records for a lesson, ordered by order_index.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - lessonId: UUID of the lesson
 *
 * Output:
 * - Array of enrichment records with all fields
 *
 * @example
 * ```typescript
 * const enrichments = await trpc.enrichment.getByLesson.query({
 *   lessonId: 'lesson-uuid',
 * });
 * // [{ id: 'uuid', lesson_id: 'uuid', enrichment_type: 'audio', ... }, ...]
 * ```
 */
export const getByLesson = protectedProcedure
  .input(getByLessonInputSchema)
  .query(async ({ ctx, input }) => {
    const { lessonId } = input;
    const requestId = nanoid();
    const currentUser = ctx.user;

    logger.debug({
      requestId,
      lessonId,
      userId: currentUser.id,
    }, 'Get enrichments by lesson request');

    try {
      // Step 1: Verify lesson access
      await verifyLessonAccess(
        lessonId,
        currentUser.id,
        currentUser.organizationId,
        requestId
      );

      // Step 2: Query enrichments
      const supabase = getSupabaseAdmin();
      const { data: enrichments, error } = await supabase
        .from('lesson_enrichments')
        .select('*')
        .eq('lesson_id', lessonId)
        .order('order_index', { ascending: true });

      if (error) {
        logger.error({
          requestId,
          lessonId,
          error: error.message,
        }, 'Failed to fetch enrichments');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch enrichments',
        });
      }

      logger.debug({
        requestId,
        lessonId,
        count: enrichments?.length || 0,
      }, 'Enrichments fetched');

      return enrichments || [];
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
      }, 'Get enrichments by lesson failed');

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get enrichments',
      });
    }
  });
