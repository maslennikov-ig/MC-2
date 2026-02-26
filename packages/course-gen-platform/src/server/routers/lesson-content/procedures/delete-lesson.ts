/**
 * Delete Lesson Procedure
 * @module server/routers/lesson-content/procedures/delete-lesson
 */

import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { protectedProcedure } from '../../../middleware/auth';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { deleteLessonInputSchema } from '../schemas';
import { verifyCourseAccess } from '../helpers';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';
import { throwOnSupabaseError } from '../../../utils/supabase-query-guard';

/**
 * Delete a lesson and all related data
 *
 * Purpose: Permanently deletes a lesson and all associated data including:
 * - lesson_contents (generated content)
 * - lesson_enrichments (quizzes, videos, audio, etc.)
 * - assets (uploaded files)
 * - generation_trace (execution logs)
 * - rag_context_cache (cached RAG context)
 *
 * All related records are deleted via CASCADE DELETE on foreign keys.
 * Files in Supabase Storage are also removed.
 *
 * Authorization: Requires authenticated user with course access
 *
 * Input:
 * - courseId: UUID of the course
 * - lessonId: ID of the lesson (format: "section.lesson" e.g., "1.2" or UUID)
 *
 * Output:
 * - success: Boolean success flag
 * - deletedLessonId: UUID of the deleted lesson
 * - deletedAssetsCount: Number of storage files deleted
 *
 * Error Handling:
 * - Course not found -> 404 NOT_FOUND
 * - Access denied -> 403 FORBIDDEN
 * - Lesson not found -> 404 NOT_FOUND
 * - Database error -> 500 INTERNAL_SERVER_ERROR
 *
 * @example
 * ```typescript
 * const result = await trpc.lessonContent.deleteLesson.mutate({
 *   courseId: '3f8e1cd4-0c6e-43cf-8264-57c470a6c102',
 *   lessonId: '1.2',
 * });
 * // { success: true, deletedLessonId: '...', deletedAssetsCount: 3 }
 * ```
 */
export const deleteLesson = protectedProcedure
  .use(createRateLimiter({ requests: 10, window: 60 })) // 10 deletes per minute
  .input(deleteLessonInputSchema)
  .mutation(async ({ ctx, input }) => {
    const { courseId, lessonId } = input;
    const requestId = nanoid();

    // ctx.user is guaranteed non-null by protectedProcedure middleware
    const currentUser = ctx.user;

    logger.info(
      {
        requestId,
        courseId,
        lessonId,
        userId: currentUser.id,
      },
      'Delete lesson request'
    );

    try {
      // Step 1: Verify course access
      await verifyCourseAccess(courseId, currentUser.id, currentUser.organizationId, requestId);

      const supabase = getSupabaseAdmin();

      // Step 2: Resolve lesson UUID from lessonId
      // Check if lessonId is in "section.lesson" format (e.g., "1.2")
      const sectionLessonMatch = lessonId.match(/^(\d+)\.(\d+)$/);
      let lessonUuid: string;

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

        throwOnSupabaseError(lessonError, 'Lesson', {
          requestId,
          courseId,
          lessonId,
          sectionNum,
          lessonNum,
        });
        if (!lessonData) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Lesson ${lessonId} not found`,
          });
        }

        lessonUuid = lessonData.id;
      } else {
        // Assume it's already a UUID - verify it exists
        const { data: lessonData, error: lessonError } = await supabase
          .from('lessons')
          .select('id, sections!inner(course_id)')
          .eq('id', lessonId)
          .eq('sections.course_id', courseId)
          .single();

        throwOnSupabaseError(lessonError, 'Lesson', { requestId, courseId, lessonId });
        if (!lessonData) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Lesson ${lessonId} not found`,
          });
        }

        lessonUuid = lessonData.id;
      }

      // Step 3: Get assets for storage cleanup before deletion
      // (CASCADE will delete the asset records, but we need file paths for storage)
      const { data: assets } = await supabase
        .from('assets')
        .select('id, file_path')
        .eq('lesson_id', lessonUuid);

      const assetFilePaths =
        assets?.map(a => ({
          bucket: 'course-assets', // Default bucket for course assets
          path: a.file_path,
        })) || [];

      logger.debug(
        {
          requestId,
          lessonUuid,
          assetsCount: assetFilePaths.length,
        },
        'Found assets for cleanup'
      );

      // Step 4: Delete the lesson (CASCADE will handle related records)
      const { error: deleteError } = await supabase.from('lessons').delete().eq('id', lessonUuid);

      if (deleteError) {
        logger.error(
          {
            requestId,
            lessonUuid,
            error: deleteError.message,
          },
          'Failed to delete lesson'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete lesson',
        });
      }

      // Step 5: Clean up storage files (best effort - don't fail if storage cleanup fails)
      let deletedAssetsCount = 0;

      for (const asset of assetFilePaths) {
        if (!asset.path) continue;

        try {
          const { error: storageError } = await supabase.storage
            .from(asset.bucket)
            .remove([asset.path]);

          if (!storageError) {
            deletedAssetsCount++;
          } else {
            logger.warn(
              {
                requestId,
                bucket: asset.bucket,
                path: asset.path,
                error: storageError.message,
              },
              'Failed to delete storage file (continuing)'
            );
          }
        } catch (storageErr) {
          logger.warn(
            {
              requestId,
              bucket: asset.bucket,
              path: asset.path,
              error: storageErr instanceof Error ? storageErr.message : String(storageErr),
            },
            'Storage cleanup error (continuing)'
          );
        }
      }

      logger.info(
        {
          requestId,
          courseId,
          lessonId,
          lessonUuid,
          deletedAssetsCount,
          totalAssets: assetFilePaths.length,
        },
        'Lesson deleted successfully'
      );

      return {
        success: true,
        deletedLessonId: lessonUuid,
        deletedAssetsCount,
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
          lessonId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to delete lesson'
      );

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete lesson',
      });
    }
  });
