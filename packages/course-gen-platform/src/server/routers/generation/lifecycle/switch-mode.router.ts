/**
 * Switch Mode Router
 * @module server/routers/generation/lifecycle/switch-mode
 *
 * Switches course from automatic to manual (semi-automatic) generation mode.
 * Allows users to take manual control when the course is paused in automatic mode.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { instructorProcedure } from '../../../procedures';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';
import { nanoid } from 'nanoid';
import { createRateLimiter } from '../../../middleware/rate-limit.js';
import type { Database } from '@megacampus/shared-types';
import { assertCourseAccess, buildAuthContext } from '../../../helpers/course-authorization';

export const switchModeRouter = {
  switchToManualMode: instructorProcedure
    .use(createRateLimiter({ requests: 10, window: 60 }))
    .input(z.object({ courseId: z.string().uuid('Invalid course ID') }))
    .mutation(async ({ ctx, input }) => {
      const { courseId } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();
      const userId = ctx.user!.id;

      try {
        // Step 1: Fetch course and verify ownership
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select(
            'id, user_id, organization_id, generation_mode, generation_paused_at, generation_status'
          )
          .eq('id', courseId)
          .single();

        // Type assertion for generation_mode (column not yet in generated types)
        type CourseWithGenerationMode = {
          id: string;
          user_id: string | null;
          organization_id: string;
          generation_mode: string | null;
          generation_paused_at: string | null;
          generation_status: string | null;
        };
        const typedCourse = course as unknown as CourseWithGenerationMode | null;

        if (courseError || !typedCourse) {
          logger.warn({ requestId, userId, courseId, error: courseError }, 'Course not found');
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
        }

        // Step 2: Verify ownership (no-owner courses cannot switch modes)
        if (typedCourse.user_id === null) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot switch generation mode for courses without an owner',
          });
        }

        assertCourseAccess(
          buildAuthContext(ctx.user!),
          { user_id: typedCourse.user_id, organization_id: typedCourse.organization_id },
          'switch generation mode'
        );

        // Step 3: Verify automatic mode
        if (typedCourse.generation_mode !== 'automatic') {
          logger.warn(
            { requestId, courseId, currentMode: typedCourse.generation_mode },
            'Cannot switch to manual: not in automatic mode'
          );
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Course is not in automatic generation mode',
          });
        }

        // Step 4: Verify course is paused
        if (!typedCourse.generation_paused_at) {
          logger.warn(
            { requestId, courseId, status: typedCourse.generation_status },
            'Cannot switch to manual: course not paused'
          );
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Course must be paused before switching to manual mode. Please pause the generation first.',
          });
        }

        // Step 5: Update mode and clear pause
        const { error: updateError } = await supabase
          .from('courses')
          .update({
            generation_mode: 'semi_automatic',
            generation_paused_at: null,
            updated_at: new Date().toISOString(),
          } as unknown as Database['public']['Tables']['courses']['Update'])
          .eq('id', courseId);

        if (updateError) {
          logger.error(
            { requestId, courseId, error: updateError },
            'Failed to switch to manual mode'
          );
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to switch generation mode',
          });
        }

        logger.info(
          {
            requestId,
            courseId,
            userId,
            previousMode: 'automatic',
            newMode: 'semi_automatic',
            currentStatus: typedCourse.generation_status,
          },
          'Switched to manual generation mode'
        );

        return {
          success: true,
          message:
            'Переключено в ручной режим. Вы можете просматривать и изменять результаты каждого этапа.',
          previousMode: 'automatic' as const,
          newMode: 'semi_automatic' as const,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error(
          {
            requestId,
            courseId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in switchToManualMode'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to switch generation mode',
        });
      }
    }),
};
