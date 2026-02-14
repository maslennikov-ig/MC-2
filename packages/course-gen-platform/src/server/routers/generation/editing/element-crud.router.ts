import { TRPCError } from '@trpc/server';
import { instructorProcedure } from '../../../procedures';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';
import { nanoid } from 'nanoid';
import {
  deleteElementInputSchema,
  addElementInputSchema,
} from '@megacampus/shared-types/regeneration-types';
import type {
  DeleteElementResponse,
  AddElementResponse,
} from '@megacampus/shared-types/regeneration-types';
import { assertCourseAccess, buildAuthContext } from '../../../helpers/course-authorization';
import { resolveStructure } from '../../../../shared/course-nodes/structure-resolver';
import {
  handleDeleteElement,
  handleAddElement,
  fetchAndValidateCourse,
  validateNotGenerating,
  validateElementPaths,
} from './element-crud-helpers';

export const elementCrudRouter = {
  deleteElement: instructorProcedure
    .input(deleteElementInputSchema)
    .mutation(async ({ ctx, input }): Promise<DeleteElementResponse> => {
      const { courseId, elementPath, confirm } = input;
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
        const course = await fetchAndValidateCourse(supabase, courseId, userId, requestId);

        // Check authorization: superadmin/admin/owner can delete
        assertCourseAccess(buildAuthContext(ctx.user), course, 'delete element');

        const courseStructure = await resolveStructure(courseId, course.course_structure, supabase);
        if (!courseStructure) {
          logger.warn({ requestId, courseId }, 'Course structure is null');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Course structure not found',
          });
        }

        const generationStatus = course.generation_status as string;
        validateNotGenerating(generationStatus, courseId, requestId);

        return await handleDeleteElement(
          supabase,
          courseId,
          elementPath,
          confirm,
          userId,
          requestId,
          courseStructure
        );
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error(
          {
            requestId,
            courseId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in deleteElement'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        });
      }
    }),

  addElement: instructorProcedure
    .input(addElementInputSchema)
    .mutation(async ({ ctx, input }): Promise<AddElementResponse> => {
      const { courseId, elementType, parentPath, position, userInstruction } = input;
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
        const course = await fetchAndValidateCourse(supabase, courseId, userId, requestId);

        // Check authorization: superadmin/admin/owner can add
        assertCourseAccess(buildAuthContext(ctx.user), course, 'add element');

        const courseStructure = await resolveStructure(courseId, course.course_structure, supabase);
        if (!courseStructure) {
          logger.warn({ requestId, courseId }, 'Course structure is null');
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Course structure not found',
          });
        }

        const generationStatus = course.generation_status as string;
        validateNotGenerating(generationStatus, courseId, requestId);
        validateElementPaths(elementType, parentPath);

        return await handleAddElement(
          supabase,
          courseId,
          elementType,
          parentPath,
          position,
          userInstruction,
          userId,
          requestId,
          course
        );
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error(
          {
            requestId,
            courseId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in addElement'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        });
      }
    }),
};
