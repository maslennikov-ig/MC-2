/**
 * Get Lesson Content Procedure
 * @module server/routers/lesson-content/procedures/get-lesson-content
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { getLessonContentInputSchema } from '../schemas';
import { verifyCourseAccess } from '../helpers';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';

/**
 * Get lesson content
 *
 * Purpose: Retrieves the generated content for a specific lesson.
 * Returns the full lesson content including sections, examples, and exercises.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - courseId: UUID of the course
 * - lessonId: ID of the lesson to retrieve
 *
 * Output:
 * - Lesson content object or null if not generated
 *
 * Error Handling:
 * - Course not found -> 404 NOT_FOUND
 * - Access denied -> 403 FORBIDDEN
 * - Lesson not found -> returns null
 *
 * @example
 * ```typescript
 * const content = await trpc.lessonContent.getLessonContent.query({
 *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
 *   lessonId: '1.1',
 * });
 * // { id: '...', content: '...', ... }
 * ```
 */
export const getLessonContent = protectedProcedure
  .use(createRateLimiter({ requests: 60, window: 60 })) // 60 content fetches per minute
  .input(getLessonContentInputSchema)
  .query(async ({ ctx, input }) => {
    const { courseId, lessonId } = input;
    const requestId = nanoid();

    // ctx.user is guaranteed non-null by protectedProcedure middleware
    const currentUser = ctx.user;

    try {
      // Step 1: Verify course access
      await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

      const supabase = getSupabaseAdmin();

      // Step 2: Resolve lesson UUID from lessonId
      // Check if lessonId is in "section.lesson" format (e.g., "1.2")
      const sectionLessonMatch = lessonId.match(/^(\d+)\.(\d+)$/);
      let lessonUuid: string | null = null;

      if (sectionLessonMatch) {
        // Format: "section.lesson" - resolve to UUID via sections/lessons tables
        const sectionNum = parseInt(sectionLessonMatch[1], 10);
        const lessonNum = parseInt(sectionLessonMatch[2], 10);

        const { data: lessonData, error: lessonError } = await supabase
          .from('lessons')
          .select('id, sections!inner(course_id, order_index)')
          .eq('sections.course_id', courseId)
          .eq('sections.order_index', sectionNum)
          .eq('order_index', lessonNum)
          .single();

        if (lessonError || !lessonData) {
          logger.debug({
            requestId,
            courseId,
            lessonId,
            sectionNum,
            lessonNum,
          }, 'Lesson not found by section.lesson format');
          return null;
        }

        lessonUuid = lessonData.id;
      } else {
        // Assume it's already a UUID
        lessonUuid = lessonId;
      }

      // Step 3: Query lesson_contents for the latest version
      // Get the most recent content for this lesson (highest created_at)
      const { data, error } = await supabase
        .from('lesson_contents')
        .select('*')
        .eq('course_id', courseId)
        .eq('lesson_id', lessonUuid)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        logger.error({
          requestId,
          courseId,
          lessonId,
          lessonUuid,
          error: error.message,
        }, 'Failed to fetch lesson content from lesson_contents');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch lesson content',
        });
      }

      logger.debug({
        requestId,
        courseId,
        lessonId,
        lessonUuid,
        found: !!data,
        contentLength: data?.content ? JSON.stringify(data.content).length : 0,
      }, 'Retrieved lesson content from lesson_contents');

      return data;
    } catch (error) {
      // Re-throw tRPC errors as-is
      if (error instanceof TRPCError) {
        throw error;
      }

      // Log and wrap unexpected errors
      logger.error({
        requestId,
        courseId,
        lessonId,
        error: error instanceof Error ? error.message : String(error),
      }, 'Failed to get lesson content');

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get lesson content',
      });
    }
  });
