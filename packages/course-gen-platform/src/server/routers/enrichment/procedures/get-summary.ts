/**
 * Get Enrichment Summary By Course Procedure
 * @module server/routers/enrichment/procedures/get-summary
 *
 * Retrieves lightweight enrichment summaries for all lessons in a course.
 * Used for React Flow node display.
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { getSummaryByCourseInputSchema } from '../schemas';
import { verifyCourseAccess } from '../helpers';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';
import type { EnrichmentSummary, EnrichmentType, EnrichmentStatus } from '@megacampus/shared-types';

/**
 * Get enrichment summary for all lessons in a course
 *
 * Purpose: Retrieves lightweight summary data for React Flow node display.
 * Groups enrichments by lesson_id for efficient client-side rendering.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - courseId: UUID of the course
 *
 * Output:
 * - Record keyed by lessonId, each containing array of EnrichmentSummary
 *
 * @example
 * ```typescript
 * const summary = await trpc.enrichment.getSummaryByCourse.query({
 *   courseId: 'course-uuid',
 * });
 * // {
 * //   'lesson-1-uuid': [{ type: 'audio', status: 'completed', hasError: false }],
 * //   'lesson-2-uuid': [{ type: 'quiz', status: 'pending', hasError: false }],
 * // }
 * ```
 */
export const getSummaryByCourse = protectedProcedure
  .input(getSummaryByCourseInputSchema)
  .query(async ({ ctx, input }) => {
    const { courseId } = input;
    const requestId = nanoid();
    const currentUser = ctx.user;

    logger.debug({
      requestId,
      courseId,
      userId: currentUser.id,
    }, 'Get enrichment summary by course request');

    try {
      // Step 1: Verify course access
      await verifyCourseAccess(
        courseId,
        currentUser.id,
        currentUser.organizationId,
        requestId
      );

      // Step 2: Query enrichments with minimal fields for summary
      const supabase = getSupabaseAdmin();
      const { data: enrichments, error } = await supabase
        .from('lesson_enrichments')
        .select('lesson_id, enrichment_type, status, error_message, title')
        .eq('course_id', courseId)
        .order('lesson_id', { ascending: true })
        .order('order_index', { ascending: true });

      if (error) {
        logger.error({
          requestId,
          courseId,
          error: error.message,
        }, 'Failed to fetch enrichment summary');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch enrichment summary',
        });
      }

      // Step 3: Group by lesson_id
      const summaryByLesson: Record<string, EnrichmentSummary[]> = {};

      for (const enrichment of enrichments || []) {
        const lessonId = enrichment.lesson_id;
        if (!summaryByLesson[lessonId]) {
          summaryByLesson[lessonId] = [];
        }

        summaryByLesson[lessonId].push({
          type: enrichment.enrichment_type as EnrichmentType,
          status: enrichment.status as EnrichmentStatus,
          hasError: !!enrichment.error_message,
          title: enrichment.title || undefined,
        });
      }

      logger.debug({
        requestId,
        courseId,
        lessonCount: Object.keys(summaryByLesson).length,
        totalEnrichments: enrichments?.length || 0,
      }, 'Enrichment summary fetched');

      return summaryByLesson;
    } catch (error) {
      // Re-throw tRPC errors as-is
      if (error instanceof TRPCError) {
        throw error;
      }

      // Log and wrap unexpected errors
      logger.error({
        requestId,
        courseId,
        error: error instanceof Error ? error.message : String(error),
      }, 'Get enrichment summary failed');

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get enrichment summary',
      });
    }
  });
