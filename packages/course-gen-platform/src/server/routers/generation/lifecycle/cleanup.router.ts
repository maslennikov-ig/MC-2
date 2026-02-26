/**
 * Cleanup Router
 * @module server/routers/generation/lifecycle/cleanup
 *
 * Cleans up all external resources (Qdrant vectors, Redis, RAG context, files)
 * associated with a course. Should be called BEFORE deleting the course from DB.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { instructorProcedure } from '../../../procedures';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';
import { nanoid } from 'nanoid';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import { cleanupCourseResources } from '../../../../shared/cleanup';
import { throwOnSupabaseError } from '../../../utils/supabase-query-guard';

export const cleanupRouter = {
  cleanupCourse: instructorProcedure
    .use(createRateLimiter({ requests: 10, window: 60 }))
    .input(z.object({ courseId: z.string().uuid('Invalid course ID') }))
    .mutation(async ({ ctx, input }) => {
      const { courseId } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();
      const userId = ctx.user!.id;
      const userRole = ctx.user!.role;

      try {
        // Step 1: Verify course exists and get organization_id
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('id, user_id, organization_id')
          .eq('id', courseId)
          .single();

        throwOnSupabaseError(courseError, 'Course', { requestId, userId, courseId });
        if (!course) throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });

        // Step 2: Check permissions (owner, org admin, superadmin, or no-owner course)
        // Note: Custom authorization required because cleanup allows no-owner courses
        // (system cleanup) which assertCourseAccess doesn't handle (requires non-null user_id)
        const isSuperAdmin = userRole === 'superadmin';
        const isOwner = course.user_id === userId;
        const isNoOwnerCourse = course.user_id === null;

        if (!isSuperAdmin && !isOwner && !isNoOwnerCourse) {
          logger.warn(
            {
              requestId,
              userId,
              courseId,
              courseOwnerId: course.user_id,
            },
            'Unauthorized cleanup attempt'
          );
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have permission to cleanup this course',
          });
        }

        logger.info(
          {
            requestId,
            userId,
            courseId,
            organizationId: course.organization_id,
          },
          'Starting course cleanup'
        );

        // Step 3: Execute cleanup
        const cleanupResult = await cleanupCourseResources(courseId, course.organization_id);

        logger.info(
          {
            requestId,
            userId,
            courseId,
            success: cleanupResult.success,
            durationMs: cleanupResult.durationMs,
            errorCount: cleanupResult.errors.length,
          },
          'Course cleanup completed'
        );

        return cleanupResult;
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error(
          {
            requestId,
            courseId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in cleanupCourse'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to cleanup course resources',
        });
      }
    }),
};
