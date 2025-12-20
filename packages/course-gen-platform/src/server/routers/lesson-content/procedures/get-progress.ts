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

/**
 * Get progress for all lessons in a course
 *
 * Purpose: Retrieves progress information for all lessons in a course.
 * Returns counts for completed, failed, and in-progress lessons along
 * with individual lesson status.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - courseId: UUID of the course to get progress for
 *
 * Output:
 * - total: Total number of lessons
 * - completed: Number of completed lessons
 * - failed: Number of failed lessons
 * - inProgress: Number of lessons currently processing
 * - progressPercent: Overall completion percentage (0-100)
 * - lessons: Array of lesson status objects
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
      // Note: Using lessons table until lesson_contents table is available
      // Join through sections to filter by course_id (lessons -> sections -> course)
      const supabase = getSupabaseAdmin();

      const { data: lessons, error } = await supabase
        .from('lessons')
        .select('id, content, updated_at, sections!inner(course_id)')
        .eq('sections.course_id', courseId);

      if (error) {
        logger.error({
          requestId,
          courseId,
          error: error.message,
        }, 'Failed to fetch lesson progress');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch lesson progress',
        });
      }

      // Step 3: Calculate progress metrics
      // For now, a lesson is "completed" if it has content
      const lessonsWithStatus = (lessons || []).map((lesson) => ({
        lesson_id: lesson.id,
        status: lesson.content ? 'completed' : 'pending',
        generated_at: lesson.content ? lesson.updated_at : null,
      }));

      const total = lessonsWithStatus.length;
      const completed = lessonsWithStatus.filter((l) => l.status === 'completed').length;
      const failed = 0; // Will be tracked separately when lesson_contents table is available
      const inProgress = total - completed - failed;

      logger.debug({
        requestId,
        courseId,
        total,
        completed,
        failed,
        inProgress,
      }, 'Retrieved lesson progress');

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
      logger.error({
        requestId,
        courseId,
        error: error instanceof Error ? error.message : String(error),
      }, 'Failed to get Stage 6 progress');

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get lesson progress',
      });
    }
  });
