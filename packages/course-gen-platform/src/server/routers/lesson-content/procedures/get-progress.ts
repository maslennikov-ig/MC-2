/**
 * Get Progress Procedure
 * @module server/routers/lesson-content/procedures/get-progress
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { getProgressInputSchema } from '../schemas';
import { verifyCourseAccess } from '../helpers';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';
import { getLessonProgressSemantics, type LessonProgressStatus } from './status-semantics';

/**
 * Get progress for all lessons in a course
 *
 * Purpose: Retrieves progress information for all lessons in a course.
 * Returns counts for ready, failed, and in-progress lessons along
 * with individual lesson status and raw review-aware content status.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - courseId: UUID of the course to get progress for
 *
 * Output:
 * - total: Total number of lessons
 * - completed: Number of lessons effectively ready (completed, approved, or review_required)
 * - failed: Number of failed lessons
 * - inProgress: Number of lessons currently processing
 * - progressPercent: Overall completion percentage (0-100)
 * - lessons: Array of lesson status objects with raw content status and review flags
 *
 * Error Handling:
 * - Course not found -> 404 NOT_FOUND
 * - Access denied -> 403 FORBIDDEN
 *
 * @example
 * ```typescript
 * const progress = await trpc.lessonContent.getProgress.query({
 *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
 * });
 * // { total: 10, completed: 7, failed: 1, inProgress: 2, progressPercent: 70, lessons: [...] }
 * ```
 */
export const getProgress = protectedProcedure
  .use(createRateLimiter({ requests: 30, window: 60 })) // 30 progress checks per minute
  .input(getProgressInputSchema)
  .query(async ({ ctx, input }) => {
    const { courseId } = input;
    const requestId = nanoid();

    // ctx.user is guaranteed non-null by protectedProcedure middleware
    const currentUser = ctx.user;

    try {
      // Step 1: Verify course access
      await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

      // Step 2: Query lesson status from database
      // Join lessons through sections and left join to lesson_contents for status
      const supabase = getSupabaseAdmin();

      // Get all lessons for the course
      const { data: lessons, error: lessonsError } = await supabase
        .from('lessons')
        .select('id, updated_at, sections!inner(course_id)')
        .eq('sections.course_id', courseId);

      if (lessonsError) {
        logger.error(
          {
            requestId,
            courseId,
            error: lessonsError.message,
          },
          'Failed to fetch lessons'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch lesson progress',
        });
      }

      // Get content status from lesson_contents table
      const { data: contents, error: contentsError } = await supabase
        .from('lesson_contents')
        .select('lesson_id, status, created_at')
        .eq('course_id', courseId)
        .order('created_at', { ascending: false });

      if (contentsError) {
        logger.error(
          {
            requestId,
            courseId,
            error: contentsError.message,
          },
          'Failed to fetch lesson contents'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch lesson progress',
        });
      }

      // Build a map of lesson_id -> latest content status
      const contentStatusMap = new Map<string, { status: string; created_at: string }>();
      for (const content of contents || []) {
        // Only keep the first (most recent) entry for each lesson
        if (!contentStatusMap.has(content.lesson_id)) {
          contentStatusMap.set(content.lesson_id, {
            status: content.status,
            created_at: content.created_at,
          });
        }
      }

      // Step 3: Calculate progress metrics based on lesson_contents status
      const lessonsWithStatus = (lessons || []).map(lesson => {
        const contentInfo = contentStatusMap.get(lesson.id);
        const progress = getLessonProgressSemantics(contentInfo?.status);
        const status: LessonProgressStatus = progress.status;

        return {
          lesson_id: lesson.id,
          status,
          content_status: progress.contentStatus,
          needsReview: progress.needsReview,
          generated_at: contentInfo?.created_at ?? null,
        };
      });

      const total = lessonsWithStatus.length;
      const completed = lessonsWithStatus.filter(
        l => l.status === 'completed' || l.status === 'approved'
      ).length;
      const failed = lessonsWithStatus.filter(l => l.status === 'failed').length;
      const inProgress = lessonsWithStatus.filter(l => l.status === 'generating').length;
      const reviewRequired = lessonsWithStatus.filter(l => l.needsReview).length;
      const approved = lessonsWithStatus.filter(l => l.status === 'approved').length;

      logger.debug(
        {
          requestId,
          courseId,
          total,
          completed,
          approved,
          reviewRequired,
          failed,
          inProgress,
        },
        'Retrieved lesson progress'
      );

      return {
        total,
        completed,
        failed,
        inProgress,
        progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
        lessons: lessonsWithStatus,
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
          courseId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to get Stage 6 progress'
      );

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get lesson progress',
      });
    }
  });
