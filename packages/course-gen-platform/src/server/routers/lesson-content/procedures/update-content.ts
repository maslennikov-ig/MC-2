/**
 * Update Lesson Content Procedure
 * @module server/routers/lesson-content/procedures/update-content
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { updateLessonContentInputSchema } from '../schemas';
import { verifyCourseAccess } from '../helpers';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { resolveLessonIdOrUuid } from '../../../../shared/database/lesson-resolver';
import { logger } from '../../../../shared/logger/index.js';

/**
 * Update lesson content (manual edits)
 *
 * Purpose: Allows users to save manual edits to lesson content. Updates the
 * content field in lesson_contents table and records update metadata.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - courseId: UUID of the course
 * - lessonId: ID of the lesson to update (format: "section.lesson" or UUID)
 * - content: The updated lesson content object
 *
 * Output:
 * - success: Boolean success flag
 *
 * Error Handling:
 * - Course not found -> 404 NOT_FOUND
 * - Access denied -> 403 FORBIDDEN
 * - Lesson not found -> 404 NOT_FOUND
 *
 * @example
 * ```typescript
 * const result = await trpc.lessonContent.updateLessonContent.mutate({
 *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
 *   lessonId: '1.2',
 *   content: { title: 'Updated Title', sections: [...] },
 * });
 * // { success: true }
 * ```
 */
export const updateLessonContent = protectedProcedure
  .use(createRateLimiter({ requests: 20, window: 60 })) // 20 updates per minute
  .input(updateLessonContentInputSchema)
  .mutation(async ({ ctx, input }) => {
    const { courseId, lessonId, content } = input;
    const requestId = nanoid();
    const currentUser = ctx.user;

    logger.info({ requestId, courseId, lessonId, userId: currentUser.id }, 'Update lesson content request');

    try {
      // Step 1: Verify course access
      await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

      // Step 2: Resolve lesson UUID
      const lessonUuid = await resolveLessonIdOrUuid(courseId, lessonId);
      if (!lessonUuid) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Lesson not found' });
      }

      // Step 3: Fetch current lesson to preserve metadata
      const supabase = getSupabaseAdmin();
      const { data: currentLesson, error: fetchError } = await supabase
        .from('lesson_contents')
        .select('metadata')
        .eq('course_id', courseId)
        .eq('lesson_id', lessonUuid)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        logger.error({ requestId, error: fetchError.message }, 'Failed to fetch current lesson');
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch lesson' });
      }

      // Step 4: Update lesson content with updated metadata
      const updatedMetadata = {
        ...(currentLesson?.metadata as object || {}),
        updated_by: currentUser.id,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('lesson_contents')
        .update({
          content: content as any, // Content is JSONB in database
          updated_at: new Date().toISOString(),
          metadata: updatedMetadata as any, // Metadata is JSONB in database
        })
        .eq('course_id', courseId)
        .eq('lesson_id', lessonUuid);

      if (error) {
        logger.error({ requestId, error: error.message }, 'Failed to update lesson content');
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update lesson content' });
      }

      logger.info({ requestId, courseId, lessonId }, 'Lesson content updated successfully');
      return { success: true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error({ requestId, error: error instanceof Error ? error.message : String(error) }, 'Update lesson failed');
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update lesson content' });
    }
  });
