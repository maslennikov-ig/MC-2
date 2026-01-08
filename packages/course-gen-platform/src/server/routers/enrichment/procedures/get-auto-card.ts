/**
 * Get Auto Card Procedure
 * @module server/routers/enrichment/procedures/get-auto-card
 *
 * Retrieves automatically generated card enrichments for courses and lessons.
 * These cards are created automatically after Stage 5 (course structure) and
 * Stage 6 (lesson content) completion.
 *
 * Card Types:
 * - Course card: title = 'course-card', settings.isCourseCard = true
 * - Lesson card: enrichment_type = 'card', title != 'course-card'
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { enrichmentStatusSchema } from '@megacampus/shared-types/lesson-enrichment';
import { protectedProcedure } from '../../../middleware/auth';
import { verifyCourseAccess, verifyLessonAccess } from '../helpers';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';
import { wrapTRPCError } from '../../../shared/errors';

// ============================================================================
// INPUT/OUTPUT SCHEMAS
// ============================================================================

/**
 * Input schema for getAutoCard procedure
 */
export const getAutoCardInputSchema = z.object({
  /** Course UUID */
  courseId: z.string().uuid('Invalid course ID'),
  /** Lesson UUID (required for lesson cards) */
  lessonId: z.string().uuid('Invalid lesson ID').optional(),
  /** Type of card to retrieve */
  cardType: z.enum(['course', 'lesson']),
}).refine(
  (data) => {
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
 * Database response schema for runtime validation
 * Validates data from Supabase before type casting
 */
const dbCardResponseSchema = z.object({
  id: z.string().uuid(),
  status: enrichmentStatusSchema,
  content: z.record(z.unknown()).nullable(),
  metadata: z.record(z.unknown()).nullable(),
  updated_at: z.string(),
  generation_attempt: z.number().nullable(),
  error_message: z.string().nullable(),
});

/**
 * Card data schema (non-nullable version)
 */
export const autoCardDataSchema = z.object({
  /** Enrichment UUID */
  id: z.string().uuid(),
  /** Current generation status */
  status: enrichmentStatusSchema,
  /** Card content (image URL, etc.) */
  content: z.record(z.unknown()).nullable(),
  /** Card metadata */
  metadata: z.record(z.unknown()).nullable(),
  /** Last update timestamp */
  updatedAt: z.string().datetime(),
  /** Generation attempt number */
  generationAttempt: z.number(),
  /** Error message if failed */
  errorMessage: z.string().nullable(),
});

/**
 * Output schema for getAutoCard procedure (nullable - returns null if not found)
 */
export const getAutoCardOutputSchema = autoCardDataSchema.nullable();

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type GetAutoCardInput = z.infer<typeof getAutoCardInputSchema>;
export type AutoCardData = z.infer<typeof autoCardDataSchema>;
export type GetAutoCardOutput = z.infer<typeof getAutoCardOutputSchema>;

// ============================================================================
// PROCEDURE
// ============================================================================

/**
 * Get automatically generated card for a course or lesson
 *
 * Purpose: Retrieves card enrichment data for display in Stage 5/6 panels.
 * Requires authentication to verify user has access to the course/lesson.
 *
 * Authorization: Protected procedure - verifies course/lesson access
 *
 * Input:
 * - courseId: UUID of the course
 * - lessonId: UUID of the lesson (required for lesson cards)
 * - cardType: 'course' or 'lesson'
 *
 * Output:
 * - Card data or null if not found
 *
 * @example
 * ```typescript
 * // Get course card
 * const courseCard = await trpc.enrichment.getAutoCard.query({
 *   courseId: 'course-uuid',
 *   cardType: 'course',
 * });
 *
 * // Get lesson card
 * const lessonCard = await trpc.enrichment.getAutoCard.query({
 *   courseId: 'course-uuid',
 *   lessonId: 'lesson-uuid',
 *   cardType: 'lesson',
 * });
 * ```
 */
export const getAutoCard = protectedProcedure
  .input(getAutoCardInputSchema)
  .query(async ({ ctx, input }) => {
    const { courseId, lessonId, cardType } = input;
    const requestId = nanoid();
    const currentUser = ctx.user;

    logger.debug({
      requestId,
      courseId,
      lessonId,
      cardType,
      userId: currentUser.id,
    }, 'Get auto card request');

    try {
      // Verify user has access to the course/lesson
      if (cardType === 'lesson' && lessonId) {
        await verifyLessonAccess(
          lessonId,
          currentUser.id,
          currentUser.organizationId,
          requestId
        );
      } else {
        await verifyCourseAccess(
          courseId,
          currentUser.id,
          currentUser.organizationId,
          requestId
        );
      }

      const supabase = getSupabaseAdmin();

      // Build query based on card type
      let query = supabase
        .from('lesson_enrichments')
        .select('id, status, content, metadata, updated_at, generation_attempt, error_message')
        .eq('course_id', courseId)
        .eq('enrichment_type', 'card');

      if (cardType === 'course') {
        // Course card: identified by title = 'course-card'
        query = query.eq('title', 'course-card');
      } else {
        // Lesson card: for specific lesson, NOT a course card
        // Note: .neq() doesn't match NULL values in PostgreSQL, so we use .or()
        // to include records where title IS NULL or title != 'course-card'
        query = query
          .eq('lesson_id', lessonId!)
          .or('title.neq.course-card,title.is.null');
      }

      const { data: card, error } = await query.maybeSingle();

      if (error) {
        logger.error({
          requestId,
          courseId,
          lessonId,
          cardType,
          error: error.message,
        }, 'Failed to fetch auto card');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch auto card',
        });
      }

      // Return null if no card found
      if (!card) {
        logger.debug({
          requestId,
          courseId,
          lessonId,
          cardType,
        }, 'Auto card not found');

        return null;
      }

      // Validate database response with Zod (runtime type safety)
      const validatedCard = dbCardResponseSchema.safeParse(card);

      if (!validatedCard.success) {
        logger.error({
          requestId,
          cardId: card.id,
          error: validatedCard.error.message,
        }, 'Invalid card data from database');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Card data validation failed',
        });
      }

      logger.debug({
        requestId,
        cardId: validatedCard.data.id,
        status: validatedCard.data.status,
      }, 'Auto card fetched');

      return {
        id: validatedCard.data.id,
        status: validatedCard.data.status,
        content: validatedCard.data.content,
        metadata: validatedCard.data.metadata,
        updatedAt: validatedCard.data.updated_at,
        generationAttempt: validatedCard.data.generation_attempt ?? 0,
        errorMessage: validatedCard.data.error_message,
      };
    } catch (error) {
      wrapTRPCError(error, {
        operation: 'Get auto card',
        requestId,
        details: { courseId, lessonId, cardType },
      });
    }
  });
