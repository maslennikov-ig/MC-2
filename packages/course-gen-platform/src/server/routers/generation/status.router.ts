/**
 * Status Router
 * @module server/routers/generation/status
 *
 * Handles course generation status operations:
 * - getStatus: Poll generation progress and phase
 * - approveStage: Approve stage and continue to next
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router } from '../../trpc';
import { instructorProcedure } from '../../procedures';
import { protectedProcedure } from '../../middleware/auth';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { logger } from '../../../shared/logger/index.js';
import type { Database } from '@megacampus/shared-types';
import { assertCourseAccess, buildAuthContext } from '../../helpers/course-authorization';
import { handleGetStatus, handleApproveStage } from './status-helpers';

export const statusRouter = router({
  /**
   * Get current generation status and progress
   * Returns detailed progress information including:
   * - Current phase (validate_input, generate_metadata, etc.)
   * - Progress percentage
   * - Estimated time remaining
   * - Error information if failed
   */
  getStatus: protectedProcedure
    .use(createRateLimiter({ requests: 30, window: 60 })) // 30 status checks per minute
    .input(z.object({ courseId: z.string().uuid('Invalid course ID') }))
    .query(async ({ ctx, input }) => {
      const { courseId } = input;
      const supabase = getSupabaseAdmin();

      // Defensive check
      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const currentUser = ctx.user;
      const organizationId = currentUser.organizationId;

      try {
        return await handleGetStatus(supabase, courseId, organizationId);
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error(
          {
            courseId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in generation.getStatus'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        });
      }
    }),

  /**
   * Approve stage and continue to next
   * Handles stage transitions:
   * - Stage 2 -> Stage 3 (Classification)
   * - Stage 3 -> Stage 4 (Structure Analysis)
   * - Stage 4 -> Stage 5 (Structure Generation)
   * - Stage 5 -> Stage 5 Complete (Ready for Manual Stage 6)
   */
  approveStage: instructorProcedure
    .input(
      z.object({
        courseId: z.string().uuid(),
        currentStage: z.number().int().min(2).max(5),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { courseId, currentStage } = input;
      const supabase = getSupabaseAdmin();
      const userId = ctx.user!.id;

      // Verify ownership
      const { data: course, error } = await supabase
        .from('courses')
        .select('*, organization:organizations(tier)')
        .eq('id', courseId)
        .single();

      if (error || !course) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
      }

      // Check authorization: superadmin/admin/owner can approve
      assertCourseAccess(buildAuthContext(ctx.user!), course, 'approve stage');

      const currentStatus = course.generation_status as string;
      const expectedStatus = `stage_${currentStage}_awaiting_approval`;

      if (
        currentStatus !== expectedStatus &&
        currentStatus !== 'failed' &&
        currentStatus !== 'cancelled'
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid status for approval. Expected ${expectedStatus}, got ${currentStatus}`,
        });
      }

      type Course = Database['public']['Tables']['courses']['Row'];
      type Organization = Database['public']['Tables']['organizations']['Row'];
      const courseWithOrg = course as unknown as Course & { organization: Organization | null };

      return handleApproveStage(supabase, courseId, currentStage, courseWithOrg, userId);
    }),
});
