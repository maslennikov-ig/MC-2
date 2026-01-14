/**
 * Regenerate Auto Card Procedure
 * @module server/routers/enrichment/procedures/regenerate-auto-card
 *
 * Regenerates automatically generated card enrichments for courses and lessons.
 * Updates the card status to 'pending', increments generation_attempt,
 * and re-triggers the card generation via auto-card-trigger service.
 *
 * Card Types:
 * - Course card: title = 'course-card', settings.isCourseCard = true
 * - Lesson card: enrichment_type = 'card', title != 'course-card'
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { verifyCourseAccess, verifyLessonAccess } from '../helpers';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { createStage7Queue, addEnrichmentJob } from '../../../../stages/stage7-enrichments/factory';
import type { Stage7JobInput } from '../../../../stages/stage7-enrichments/types';
import { logger } from '../../../../shared/logger/index.js';
import { wrapTRPCError } from '../../../shared/errors';

// ============================================================================
// INPUT/OUTPUT SCHEMAS
// ============================================================================

/**
 * Input schema for regenerateAutoCard procedure
 */
export const regenerateAutoCardInputSchema = z
  .object({
    /** Course UUID */
    courseId: z.string().uuid('Invalid course ID'),
    /** Lesson UUID (required for lesson cards) */
    lessonId: z.string().uuid('Invalid lesson ID').optional(),
    /** Type of card to regenerate */
    cardType: z.enum(['course', 'lesson']),
  })
  .refine(
    data => {
      // For lesson cards, lessonId is required
      if (data.cardType === 'lesson' && !data.lessonId) {
        return false;
      }
      return true;
    },
    {
      message: 'lessonId is required when cardType is "lesson"',
      path: ['lessonId'],
    }
  );

/**
 * Output schema for regenerateAutoCard procedure
 */
export const regenerateAutoCardOutputSchema = z.object({
  /** Success flag */
  success: z.boolean(),
  /** Enrichment UUID */
  enrichmentId: z.string().uuid(),
  /** New BullMQ job ID for tracking */
  newJobId: z.string().optional(),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type RegenerateAutoCardInput = z.infer<typeof regenerateAutoCardInputSchema>;
export type RegenerateAutoCardOutput = z.infer<typeof regenerateAutoCardOutputSchema>;

// ============================================================================
// QUEUE SINGLETON WITH CLEANUP
// ============================================================================

// Create queue instance (singleton)
let stage7Queue: ReturnType<typeof createStage7Queue> | null = null;
let cleanupRegistered = false;

/**
 * Get or create queue instance with automatic cleanup registration
 */
function getQueue() {
  if (!stage7Queue) {
    stage7Queue = createStage7Queue();

    // Register cleanup handler once
    if (!cleanupRegistered) {
      cleanupRegistered = true;

      // Cleanup on process exit
      const cleanup = async () => {
        if (stage7Queue) {
          try {
            await stage7Queue.close();
            logger.info('Stage7 queue closed on process exit');
          } catch (error) {
            logger.error({ error }, 'Failed to close Stage7 queue');
          }
          stage7Queue = null;
        }
      };

      process.on('SIGTERM', () => void cleanup());
      process.on('SIGINT', () => void cleanup());

      // Handle uncaught exceptions gracefully
      process.on('beforeExit', () => void cleanup());
    }
  }
  return stage7Queue;
}

// ============================================================================
// PROCEDURE
// ============================================================================

/**
 * Regenerate automatically generated card for a course or lesson
 *
 * Purpose: Resets card enrichment to 'pending' status, increments generation_attempt,
 * clears error fields, and enqueues a new BullMQ job for regeneration.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - courseId: UUID of the course
 * - lessonId: UUID of the lesson (required for lesson cards)
 * - cardType: 'course' or 'lesson'
 *
 * Output:
 * - success: Boolean success flag
 * - enrichmentId: UUID of the card enrichment
 * - newJobId: New BullMQ job ID for tracking
 *
 * Rate Limit: 5 regenerates per minute
 *
 * @example
 * ```typescript
 * // Regenerate course card
 * const result = await trpc.enrichment.regenerateAutoCard.mutate({
 *   courseId: 'course-uuid',
 *   cardType: 'course',
 * });
 *
 * // Regenerate lesson card
 * const result = await trpc.enrichment.regenerateAutoCard.mutate({
 *   courseId: 'course-uuid',
 *   lessonId: 'lesson-uuid',
 *   cardType: 'lesson',
 * });
 * ```
 */
export const regenerateAutoCard = protectedProcedure
  .use(createRateLimiter({ requests: 5, window: 60 })) // 5 regenerates per minute
  .input(regenerateAutoCardInputSchema)
  .mutation(async ({ ctx, input }) => {
    const { courseId, lessonId, cardType } = input;
    const requestId = nanoid();
    const currentUser = ctx.user;

    logger.info(
      {
        requestId,
        courseId,
        lessonId,
        cardType,
        userId: currentUser.id,
      },
      'Regenerate auto card request'
    );

    try {
      // Step 1: Verify access based on card type
      let actualLessonId: string;

      if (cardType === 'lesson') {
        // For lesson cards, verify lesson access
        const lesson = await verifyLessonAccess(
          lessonId!,
          currentUser.id,
          currentUser.organizationId,
          requestId
        );
        actualLessonId = lesson.id;
      } else {
        // For course cards, verify course access
        await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);
        // Course cards are attached to the first lesson, we'll get it from the enrichment
        actualLessonId = ''; // Will be set from enrichment lookup
      }

      // Step 2: Find the existing card enrichment
      const supabase = getSupabaseAdmin();

      let query = supabase
        .from('lesson_enrichments')
        .select('id, lesson_id, status, generation_attempt')
        .eq('course_id', courseId)
        .eq('enrichment_type', 'card');

      if (cardType === 'course') {
        query = query.eq('title', 'course-card');
      } else {
        query = query.eq('lesson_id', lessonId!).neq('title', 'course-card');
      }

      const { data: card, error: cardError } = await query.maybeSingle();

      if (cardError) {
        logger.error(
          {
            requestId,
            courseId,
            lessonId,
            cardType,
            error: cardError.message,
          },
          'Failed to fetch card for regeneration'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch card for regeneration',
        });
      }

      if (!card) {
        logger.warn(
          {
            requestId,
            courseId,
            lessonId,
            cardType,
          },
          'Card not found for regeneration'
        );

        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `${cardType === 'course' ? 'Course' : 'Lesson'} card not found`,
        });
      }

      // For course cards, get the lesson_id from the enrichment
      if (cardType === 'course') {
        actualLessonId = card.lesson_id;
      }

      // Step 3: Update enrichment record for regeneration
      const newAttempt = (card.generation_attempt ?? 0) + 1;
      const { error: updateError } = await supabase
        .from('lesson_enrichments')
        .update({
          status: 'pending',
          generation_attempt: newAttempt,
          error_message: null,
          error_details: null,
          content: null, // Clear previous content
          updated_at: new Date().toISOString(),
        })
        .eq('id', card.id);

      if (updateError) {
        logger.error(
          {
            requestId,
            enrichmentId: card.id,
            error: updateError.message,
          },
          'Failed to update card for regeneration'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to reset card for regeneration',
        });
      }

      // Step 4: Enqueue new BullMQ job
      const queue = getQueue();
      const isCourseCard = cardType === 'course';
      const settings = isCourseCard ? { isCourseCard: true } : {};

      const jobInput: Stage7JobInput = {
        enrichmentId: card.id,
        enrichmentType: 'card',
        lessonId: actualLessonId,
        courseId,
        userId: currentUser.id,
        organizationId: currentUser.organizationId,
        settings,
        retryAttempt: newAttempt,
      };

      // Use deterministic job ID for deduplication
      const jobIdPrefix = isCourseCard ? `card-course-${courseId}` : `card-lesson-${lessonId}`;
      const job = await addEnrichmentJob(queue, jobInput, {
        priority: 1, // High priority for cards
        jobId: `${jobIdPrefix}-regen-${newAttempt}`,
      });

      logger.info(
        {
          requestId,
          enrichmentId: card.id,
          newAttempt,
          jobId: job.id,
          cardType,
        },
        'Auto card regeneration enqueued'
      );

      return {
        success: true,
        enrichmentId: card.id,
        newJobId: job.id,
      };
    } catch (error) {
      wrapTRPCError(error, {
        operation: 'Regenerate auto card',
        requestId,
        details: { courseId, lessonId, cardType },
      });
    }
  });
