import { TRPCError } from '@trpc/server';
import { instructorProcedure } from '../../../procedures';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';
import { nanoid } from 'nanoid';
import {
  updateFieldInputSchema,
  STAGE4_EDITABLE_FIELDS,
  STAGE5_EDITABLE_FIELDS,
} from '@megacampus/shared-types/regeneration-types';
import type { CourseStructure } from '@megacampus/shared-types';
import { applyFieldUpdate } from '../../../../stages/stage5-generation/utils/course-structure-editor';
import {
  setNestedValue,
  normalizePathForValidation,
} from '../_shared/helpers';

export const fieldUpdateRouter = {
  updateField: instructorProcedure
    .input(updateFieldInputSchema)
    .mutation(async ({ ctx, input }: { ctx: any, input: any }) => {
      const { courseId, stageId, fieldPath, value } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();

      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const userId = ctx.user.id;

      try {
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('id, user_id, analysis_result, course_structure')
          .eq('id', courseId)
          .single();

        if (courseError || !course) {
          logger.warn({ requestId, userId, courseId, error: courseError }, 'Course not found');
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Course not found',
          });
        }

        if (course.user_id !== userId) {
          logger.warn({
            requestId,
            userId,
            courseId,
            courseOwnerId: course.user_id,
          }, 'Course ownership violation in updateField');
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have access to this course',
          });
        }

        const allowedFields = stageId === 'stage_4'
          ? STAGE4_EDITABLE_FIELDS
          : STAGE5_EDITABLE_FIELDS;

        const normalizedFieldPath = stageId === 'stage_5'
          ? normalizePathForValidation(fieldPath)
          : fieldPath;

        if (!allowedFields.includes(normalizedFieldPath)) {
          logger.warn({
            requestId,
            courseId,
            stageId,
            fieldPath,
            normalizedFieldPath,
            allowedFields,
          }, 'Field path not in whitelist');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Field "${fieldPath}" is not editable`,
          });
        }

        const currentData = stageId === 'stage_4'
          ? course.analysis_result
          : course.course_structure;

        if (!currentData) {
          logger.warn({ requestId, courseId, stageId }, 'Target data is null or undefined');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Cannot update field: ${stageId === 'stage_4' ? 'analysis_result' : 'course_structure'} is empty`,
          });
        }

        let updatedData: unknown;
        let recalculated: { sectionDuration?: number; courseDuration?: number } | undefined;

        try {
          if (stageId === 'stage_5') {
            const result = applyFieldUpdate(
              currentData as CourseStructure,
              fieldPath,
              value
            );
            updatedData = result.updatedStructure;
            recalculated = result.recalculated;
          } else {
            updatedData = structuredClone(currentData);
            setNestedValue(updatedData, fieldPath, value);
          }
        } catch (error) {
          logger.warn({
            requestId,
            courseId,
            fieldPath,
            error: error instanceof Error ? error.message : String(error),
          }, 'Invalid field path');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid field path: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }

        const updateColumn = stageId === 'stage_4' ? 'analysis_result' : 'course_structure';
        const now = new Date().toISOString();

        const { error: updateError } = await supabase
          .from('courses')
          .update({
            [updateColumn]: updatedData,
            updated_at: now,
          })
          .eq('id', courseId);

        if (updateError) {
          logger.error({
            requestId,
            courseId,
            stageId,
            fieldPath,
            error: updateError,
          }, 'Database update failed in updateField');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update field',
          });
        }

        logger.info({
          requestId,
          courseId,
          stageId,
          fieldPath,
          recalculated,
        }, 'Field updated successfully');

        return {
          success: true,
          fieldPath,
          updatedAt: now,
          ...(recalculated && { recalculated }),
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error({
          requestId,
          courseId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Unexpected error in updateField');

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        });
      }
    }),
};