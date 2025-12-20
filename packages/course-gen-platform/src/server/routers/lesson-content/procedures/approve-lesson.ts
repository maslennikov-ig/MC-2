/**
 * Approve Lesson Procedure
 * @module server/routers/lesson-content/procedures/approve-lesson
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { approveLessonInputSchema } from '../schemas';
import { verifyCourseAccess } from '../helpers';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { resolveLessonIdOrUuid } from '../../../../shared/database/lesson-resolver';
import { logger } from '../../../../shared/logger/index.js';

/**
 * Approve a lesson after review
 *
 * Purpose: Marks a lesson as approved after user review. Updates lesson_contents
 * status to 'approved' and records approval metadata.
 *
 * Authorization: Requires authenticated user (protectedProcedure)
 *
 * Input:
 * - courseId: UUID of the course
 * - lessonId: ID of the lesson to approve (format: "section.lesson" or UUID)
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
 * const result = await trpc.lessonContent.approveLesson.mutate({
 *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
 *   lessonId: '1.2',
 * });
 * // { success: true }
 * ```
 */
export const approveLesson = protectedProcedure
  .use(createRateLimiter({ requests: 30, window: 60 })) // 30 approvals per minute
  .input(approveLessonInputSchema)
  .mutation(async ({ ctx, input }) => {
    const { courseId, lessonId } = input;
    const requestId = nanoid();
    const currentUser = ctx.user;

    logger.info({ requestId, courseId, lessonId, userId: currentUser.id }, 'Approve lesson request');

    try {
      // Step 1: Verify course access
      await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

      // Step 2: Resolve lesson UUID
      const lessonUuid = await resolveLessonIdOrUuid(courseId, lessonId);
      if (!lessonUuid) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Lesson not found' });
      }

      // Step 3: Fetch current lesson content to preserve metadata
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

      // Step 4: Update lesson_contents status to approved
      const updatedMetadata = {
        ...(currentLesson?.metadata as object || {}),
        approved_at: new Date().toISOString(),
        approved_by: currentUser.id,
      };

      const { error } = await supabase
        .from('lesson_contents')
        .update({
          status: 'approved',
          updated_at: new Date().toISOString(),
          metadata: updatedMetadata,
        })
        .eq('course_id', courseId)
        .eq('lesson_id', lessonUuid);

      if (error) {
        logger.error({ requestId, error: error.message }, 'Failed to approve lesson');
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to approve lesson' });
      }

      logger.info({ requestId, courseId, lessonId }, 'Lesson approved successfully');
      return { success: true };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      logger.error({ requestId, error: error instanceof Error ? error.message : String(error) }, 'Approve lesson failed');
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to approve lesson' });
    }
  });
