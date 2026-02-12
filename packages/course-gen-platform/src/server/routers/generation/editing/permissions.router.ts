import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { instructorProcedure } from '../../../procedures';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { canUserEditCourse } from '../_shared/helpers';

export const permissionsRouter = {
  getEditPermissions: instructorProcedure
    .input(z.object({ courseId: z.string().uuid('Invalid course ID') }))
    .query(async ({ ctx, input }) => {
      const { courseId } = input;
      const supabase = getSupabaseAdmin();

      const user = ctx.user;
      if (!user) {
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
        { id: user.id, role: user.role }
      );

      return {
        canEdit,
        isOwner: course.user_id === user.id,
        role: user.role,
      };
    }),
};
