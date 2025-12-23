import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { instructorProcedure } from '../../../procedures';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import {
  canUserEditCourse,
} from '../_shared/helpers';

export const permissionsRouter = {
  getEditPermissions: instructorProcedure
    .input(z.object({ courseId: z.string().uuid('Invalid course ID') }))
    .query(async ({ ctx, input }: { ctx: any, input: any }) => {
      const { courseId } = input;
      const supabase = getSupabaseAdmin();

      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const { data: course, error } = await supabase
        .from('courses')
        .select('id, user_id, organization_id')
        .eq('id', courseId)
        .single();

      if (error || !course) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Course not found',
        });
      }

      const canEdit = canUserEditCourse(
        { user_id: course.user_id, organization_id: course.organization_id },
        { id: ctx.user.id, role: ctx.user.role }
      );

      return {
        canEdit,
        isOwner: course.user_id === ctx.user.id,
        role: ctx.user.role,
      };
    }),
};