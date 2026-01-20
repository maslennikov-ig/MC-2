/**
 * Generate Batch Covers Procedure
 * @module server/routers/enrichment/procedures/generate-batch-covers
 *
 * Generates cover images for multiple lessons in a course.
 * Covers are 16:9 hero banners displayed at the top of lesson pages.
 *
 * This procedure:
 * 1. Validates course access via organization membership
 * 2. Uses existing batch trigger logic from auto-card-trigger service
 * 3. Optionally skips lessons that already have cover enrichments
 * 4. Queues BullMQ jobs for each lesson cover generation
 * 5. Returns batch result with succeeded/skipped/failed counts
 *
 * Rate Limit: 2 batch requests per minute (covers are expensive image generations)
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { onDemandImageSettingsSchema } from '@megacampus/shared-types';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { triggerAllLessonCovers } from '../../../../stages/stage7-enrichments/services/auto-card-trigger';
import { logger } from '../../../../shared/logger/index.js';

/**
 * Generate cover images for all lessons in a course
 *
 * Purpose: Batch generation of lesson cover images (16:9 hero banners).
 * Useful for on-demand generation or backfilling covers on existing courses.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - courseId: UUID of the target course
 * - settings: Optional image style settings (style, colorScheme)
 * - skipExisting: Skip lessons that already have covers (default: true)
 *
 * Output:
 * - triggered: Number of cover jobs successfully queued
 * - skipped: Number of lessons skipped (already have covers)
 * - failed: Number of lessons that failed to queue
 * - details: Full breakdown with lesson IDs
 *
 * Rate Limit: 2 batch requests per minute
 *
 * @example
 * ```typescript
 * const result = await trpc.enrichment.generateBatchCovers.mutate({
 *   courseId: 'course-uuid',
 *   settings: { style: 'dramatic', colorScheme: 'warm' },
 *   skipExisting: true,
 * });
 * // { triggered: 15, skipped: 3, failed: 0, details: {...} }
 * ```
 */
export const generateBatchCovers = protectedProcedure
  .use(createRateLimiter({ requests: 2, window: 60 })) // 2 batch requests per minute
  .input(
    z.object({
      /** Course UUID to generate covers for */
      courseId: z.string().uuid('Invalid course ID'),

      /** Optional image style settings */
      settings: onDemandImageSettingsSchema.optional(),

      /** Skip lessons that already have cover enrichments */
      skipExisting: z.boolean().default(true),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const { courseId } = input;
    const currentUser = ctx.user;

    logger.info(
      { courseId, userId: currentUser.id, organizationId: currentUser.organizationId },
      'Batch cover generation request'
    );

    try {
      // Verify course access (organization membership check)
      const supabase = getSupabaseAdmin();
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .select('id, organization_id')
        .eq('id', courseId)
        .eq('organization_id', currentUser.organizationId)
        .single();

      if (courseError || !course) {
        logger.warn(
          {
            courseId,
            userId: currentUser.id,
            organizationId: currentUser.organizationId,
            error: courseError?.message,
          },
          'Course not found or access denied for batch cover generation'
        );

        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Course not found or access denied',
        });
      }

      // Use existing batch trigger logic
      const result = await triggerAllLessonCovers({
        courseId,
        userId: currentUser.id,
        organizationId: currentUser.organizationId,
      });

      logger.info(
        {
          courseId,
          userId: currentUser.id,
          triggered: result.succeeded.length,
          skipped: result.skipped.length,
          failed: result.failed.length,
        },
        'Batch cover generation completed'
      );

      return {
        triggered: result.succeeded.length,
        skipped: result.skipped.length,
        failed: result.failed.length,
        details: {
          succeededIds: result.succeeded,
          skippedIds: result.skipped,
          failedLessons: result.failed,
        },
      };
    } catch (error) {
      // Re-throw tRPC errors as-is
      if (error instanceof TRPCError) {
        throw error;
      }

      // Log and wrap unexpected errors
      logger.error(
        {
          courseId,
          userId: currentUser.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Batch cover generation failed'
      );

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unable to generate covers. Please try again later.',
      });
    }
  });
