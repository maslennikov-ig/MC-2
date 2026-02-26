/**
 * Edit History Router
 * @module server/routers/generation/editing/edit-history
 *
 * Provides access to course edit history for the regeneration diff view (#16).
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { instructorProcedure } from '../../../procedures';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';
import { throwOnSupabaseError } from '../../../utils/supabase-query-guard';

/**
 * Type for course edit records returned from the database
 */
export interface CourseEdit {
  id: string;
  course_id: string;
  edited_by: string | null;
  stage: string;
  field_path: string;
  previous_value: unknown;
  new_value: unknown;
  semantic_diff: {
    changeType: string;
    alignmentScore: number;
    conceptsAdded: string[];
    conceptsRemoved: string[];
    bloomLevelPreserved?: boolean;
    changeDescription?: string;
  } | null;
  user_instruction: string | null;
  created_at: string;
}

export const editHistoryRouter = {
  /**
   * Get edit history for a course
   * Returns the most recent 50 edits, ordered by creation date descending
   */
  getEditHistory: instructorProcedure
    .input(
      z.object({
        courseId: z.string().uuid('Invalid course ID'),
        limit: z.number().min(1).max(100).optional().default(50),
      })
    )
    .query(async ({ ctx, input }): Promise<CourseEdit[]> => {
      const { courseId, limit } = input;
      const supabase = getSupabaseAdmin();

      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      // Verify user has access to this course
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .select('id, user_id')
        .eq('id', courseId)
        .single();

      throwOnSupabaseError(courseError, 'Course', { courseId });
      if (!course) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Course not found',
        });
      }

      // Check ownership (or admin role could be added here)
      if (course.user_id !== ctx.user.id && ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this course',
        });
      }

      const { data, error } = await supabase
        .from('course_edits')
        .select('*')
        .eq('course_id', courseId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error(
          {
            courseId,
            error,
          },
          'Failed to fetch edit history'
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message,
        });
      }

      // Transform database rows to CourseEdit type
      return (data || []).map(row => ({
        id: row.id,
        course_id: row.course_id,
        edited_by: row.edited_by,
        stage: row.stage,
        field_path: row.field_path,
        previous_value: row.previous_value,
        new_value: row.new_value,
        semantic_diff: row.semantic_diff as CourseEdit['semantic_diff'],
        user_instruction: row.user_instruction,
        created_at: row.created_at,
      }));
    }),
};
