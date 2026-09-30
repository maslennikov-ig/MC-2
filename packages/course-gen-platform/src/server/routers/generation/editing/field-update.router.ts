import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { instructorProcedure } from '../../../procedures';
import { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';
import { nanoid } from 'nanoid';
import {
  updateFieldInputSchema,
  type UpdateFieldResponse,
} from '@megacampus/shared-types/regeneration-types';
import type { CourseStructure } from '@megacampus/shared-types';
import { assertCourseAccess, buildAuthContext } from '../../../helpers/course-authorization';
import { isDualWriteEnabled } from '../../../../shared/course-nodes/feature-flags';
import { throwOnSupabaseError } from '../../../utils/supabase-query-guard';
import { writeCourseNodes } from '../../../../shared/course-nodes/writer';
import { isKnowledgeSyncContractV2Enabled } from '../../../../integrations/helixa/scheduler';
import { prepareCourseFieldUpdate } from './field-update-preparation';

// Schema for checking downstream stages
const checkDownstreamStagesInputSchema = z.object({
  courseId: z.string().uuid(),
});

// Schema for deleting downstream stages
const deleteDownstreamStagesInputSchema = z.object({
  courseId: z.string().uuid(),
  fromStage: z.union([z.literal(4), z.literal(5)]),
  pendingEdit: updateFieldInputSchema.pick({ fieldPath: true, value: true }).optional(),
});

const cascadeDeleteResultSchema = z.object({
  deletedLessonsCount: z.number().int().nonnegative(),
  deletedSectionsCount: z.number().int().nonnegative(),
  deletedStructure: z.boolean(),
  fieldApplied: z.literal(true).optional(),
});

interface DeleteDownstreamStagesResponse {
  success: true;
  deletedLessonsCount: number;
  deletedSectionsCount: number;
  deletedStructure: boolean;
  fieldApplied?: boolean;
  recalculated?: UpdateFieldResponse['recalculated'];
}

/** Narrow adapter for the additive RPC until generated Supabase types include it. */
function atomicCascadeRpc(supabase: ReturnType<typeof getSupabaseAdmin>) {
  return supabase.rpc.bind(supabase) as unknown as (
    name: 'delete_helixa_course_downstream_v2',
    args: {
      p_course_id: string;
      p_organization_id: string;
      p_from_stage: 4 | 5;
      p_course_patch?: Record<string, unknown>;
      p_expected_course_state?: {
        updated_at: string;
        analysis_result: unknown;
        course_structure: unknown;
        generation_metadata: unknown;
      };
    }
  ) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

export const fieldUpdateRouter = {
  updateField: instructorProcedure
    .input(updateFieldInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { courseId, stageId, fieldPath } = input;
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
          .select('id, user_id, organization_id, analysis_result, course_structure')
          .eq('id', courseId)
          .single();

        throwOnSupabaseError(courseError, 'Course', { requestId, userId, courseId });
        if (!course) throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });

        // Check authorization: superadmin/admin/owner can update
        assertCourseAccess(buildAuthContext(ctx.user), course, 'update field');

        const { dataToPersist, updatePayload, now, recalculated } = await prepareCourseFieldUpdate(
          supabase,
          course,
          input,
          requestId
        );

        const { error: updateError } = await supabase
          .from('courses')
          .update(updatePayload)
          .eq('id', courseId);

        if (updateError) {
          logger.error(
            {
              requestId,
              courseId,
              stageId,
              fieldPath,
              error: updateError,
            },
            'Database update failed in updateField'
          );
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update field',
          });
        }

        // Phase 4: Dual-write to course_nodes (non-blocking, non-fatal)
        if (stageId === 'stage_5') {
          const structureForNodes = dataToPersist as CourseStructure;
          await writeCourseNodes(courseId, structureForNodes, supabase, logger).catch(err =>
            logger.warn(
              { courseId, error: err instanceof Error ? err.message : String(err) },
              'course_nodes dual-write failed (non-fatal)'
            )
          );
        }

        logger.info(
          {
            requestId,
            courseId,
            stageId,
            fieldPath,
            recalculated,
          },
          'Field updated successfully'
        );

        return {
          success: true,
          fieldPath,
          updatedAt: now,
          ...(recalculated && { recalculated }),
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error(
          {
            requestId,
            courseId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in updateField'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        });
      }
    }),

  /**
   * Check if downstream stages exist for a course
   * Stage 5 exists if courses.course_structure IS NOT NULL
   * Stage 6 exists if there are lessons linked to the course via sections
   */
  checkDownstreamStages: instructorProcedure
    .input(checkDownstreamStagesInputSchema)
    .query(async ({ ctx, input }) => {
      const { courseId } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();

      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        // Get course with course_structure
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select('id, user_id, organization_id, course_structure')
          .eq('id', courseId)
          .single();

        throwOnSupabaseError(courseError, 'Course', { requestId, courseId });
        if (!course) throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });

        // Check authorization
        assertCourseAccess(buildAuthContext(ctx.user), course, 'check downstream stages');

        // Check Stage 5: course_structure exists
        const hasStage5 = course.course_structure !== null;

        // Check Stage 6: count lessons via sections
        // lessons -> sections -> courses (lessons.section_id -> sections.course_id)
        const { count: lessonsCount, error: lessonsError } = await supabase
          .from('lessons')
          .select('id, sections!inner(course_id)', { count: 'exact', head: true })
          .eq('sections.course_id', courseId);

        if (lessonsError) {
          logger.warn({ requestId, courseId, error: lessonsError }, 'Failed to count lessons');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to check lessons',
          });
        }

        const stage6LessonsCount = lessonsCount || 0;
        const hasStage6 = stage6LessonsCount > 0;

        logger.info(
          { requestId, courseId, hasStage5, hasStage6, stage6LessonsCount },
          'Checked downstream stages'
        );

        return {
          hasStage5,
          hasStage6,
          stage6LessonsCount,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error(
          {
            requestId,
            courseId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in checkDownstreamStages'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        });
      }
    }),

  /**
   * Delete downstream stages data
   * fromStage=4: DELETE course_structure (set to null), DELETE lessons and related data
   * fromStage=5: DELETE lessons only
   */
  deleteDownstreamStages: instructorProcedure
    .input(deleteDownstreamStagesInputSchema)
    .mutation(async ({ ctx, input }): Promise<DeleteDownstreamStagesResponse> => {
      const { courseId, fromStage, pendingEdit } = input;
      const supabase = getSupabaseAdmin();
      const requestId = nanoid();
      const useAtomicCascade = isKnowledgeSyncContractV2Enabled();

      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      try {
        // Get course for authorization
        const { data: course, error: courseError } = await supabase
          .from('courses')
          .select(
            useAtomicCascade
              ? 'id, user_id, organization_id, analysis_result, course_structure, generation_metadata, updated_at'
              : 'id, user_id, organization_id'
          )
          .eq('id', courseId)
          .single();

        throwOnSupabaseError(courseError, 'Course', { requestId, courseId });
        if (!course) throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });

        // Check authorization
        assertCourseAccess(buildAuthContext(ctx.user), course, 'delete downstream stages');

        if (useAtomicCascade) {
          const snapshot = course as typeof course & {
            updated_at: string;
            analysis_result: unknown;
            course_structure: unknown;
            generation_metadata: unknown;
          };
          // Validate the entire final edit before any downstream data is removed.
          const prepared = pendingEdit
            ? await prepareCourseFieldUpdate(
                supabase,
                snapshot,
                {
                  courseId,
                  stageId: fromStage === 4 ? 'stage_4' : 'stage_5',
                  fieldPath: pendingEdit.fieldPath,
                  value: pendingEdit.value,
                },
                requestId
              )
            : undefined;
          const patch = prepared
            ? Object.fromEntries(
                Object.entries(prepared.updatePayload).filter(([key]) => key !== 'updated_at')
              )
            : undefined;

          // The scoped row lock, optimistic check, cascades and final patch share
          // one transaction, so v2 captures only the final answerable package.
          const { data, error } = await atomicCascadeRpc(supabase)(
            'delete_helixa_course_downstream_v2',
            {
              p_course_id: courseId,
              p_organization_id: course.organization_id,
              p_from_stage: fromStage,
              ...(patch && {
                p_course_patch: patch,
                p_expected_course_state: {
                  updated_at: snapshot.updated_at,
                  analysis_result: snapshot.analysis_result,
                  course_structure: snapshot.course_structure,
                  generation_metadata: snapshot.generation_metadata,
                },
              }),
            }
          );

          if (error) {
            logger.error({ requestId, courseId, fromStage, error }, 'Atomic cascade edit failed');
            throw new TRPCError({
              code: error.code === '40001' ? 'CONFLICT' : 'INTERNAL_SERVER_ERROR',
              message:
                error.code === '40001'
                  ? 'Course changed while editing. Refresh and try again.'
                  : 'Failed to delete downstream stages',
            });
          }

          const result = cascadeDeleteResultSchema.parse(data);
          if (pendingEdit && !result.fieldApplied) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Atomic cascade edit did not confirm the field update',
            });
          }

          if (fromStage === 5 && prepared) {
            await writeCourseNodes(
              courseId,
              prepared.dataToPersist as CourseStructure,
              supabase,
              logger
            ).catch(err =>
              logger.warn(
                { courseId, error: err instanceof Error ? err.message : String(err) },
                'course_nodes dual-write failed (non-fatal)'
              )
            );
          } else if (fromStage === 4 && isDualWriteEnabled()) {
            const { error: nodesError } = await supabase
              .from('course_nodes')
              .delete()
              .eq('course_id', courseId);
            if (nodesError) {
              logger.warn(
                { courseId, error: nodesError.message },
                'course_nodes cleanup failed (non-fatal)'
              );
            }
          }

          return {
            success: true,
            ...result,
            ...(prepared?.recalculated && { recalculated: prepared.recalculated }),
          };
        }

        const now = new Date().toISOString();
        let deletedLessonsCount = 0;
        let deletedStructure = false;

        // Get section IDs for this course (needed to delete lessons)
        const { data: sections, error: sectionsError } = await supabase
          .from('sections')
          .select('id')
          .eq('course_id', courseId);

        if (sectionsError) {
          logger.warn({ requestId, courseId, error: sectionsError }, 'Failed to get sections');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get sections',
          });
        }

        // Validate section IDs are valid UUIDs (defense-in-depth)
        const sectionIds = (sections ?? [])
          .map(s => s.id)
          .filter(id => {
            const isValid = z.string().uuid().safeParse(id).success;
            if (!isValid) {
              logger.warn(
                { requestId, courseId, invalidId: id },
                'Invalid section ID found, skipping'
              );
            }
            return isValid;
          });

        // Delete lessons if we have valid sections (Stage 6 data)
        if (sectionIds.length > 0) {
          // First get lesson IDs to delete related data
          const { data: lessons, error: lessonsQueryError } = await supabase
            .from('lessons')
            .select('id')
            .in('section_id', sectionIds);

          if (lessonsQueryError) {
            logger.error(
              { requestId, courseId, error: lessonsQueryError },
              'Failed to get lessons'
            );
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to fetch lessons for deletion',
            });
          }

          // Validate lesson IDs are valid UUIDs (defense-in-depth)
          const lessonIds = (lessons ?? [])
            .map(l => l.id)
            .filter(id => {
              const isValid = z.string().uuid().safeParse(id).success;
              if (!isValid) {
                logger.warn(
                  { requestId, courseId, invalidId: id },
                  'Invalid lesson ID found, skipping'
                );
              }
              return isValid;
            });

          // Delete lesson_contents if there are valid lessons
          if (lessonIds.length > 0) {
            const { error: contentsError } = await supabase
              .from('lesson_contents')
              .delete()
              .in('lesson_id', lessonIds);

            if (contentsError) {
              // NOTE: This is acceptable because:
              // 1. lesson_contents has ON DELETE CASCADE FK to lessons
              // 2. If we fail here, deleting lessons will still cascade-delete contents
              // 3. This is a best-effort cleanup to avoid FK constraint issues
              logger.warn(
                { requestId, courseId, error: contentsError },
                'Failed to delete lesson_contents - will rely on CASCADE'
              );
            }
          }

          // Delete lessons
          const { data: deletedLessons, error: lessonsError } = await supabase
            .from('lessons')
            .delete()
            .in('section_id', sectionIds)
            .select('id');

          if (lessonsError) {
            logger.error({ requestId, courseId, error: lessonsError }, 'Failed to delete lessons');
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to delete lessons',
            });
          }

          deletedLessonsCount = deletedLessons?.length || 0;
        }

        // If fromStage is 4, also delete sections and course_structure
        if (fromStage === 4) {
          // Delete sections
          if (sectionIds.length > 0) {
            const { error: deleteSectionsError } = await supabase
              .from('sections')
              .delete()
              .eq('course_id', courseId);

            if (deleteSectionsError) {
              logger.error(
                { requestId, courseId, error: deleteSectionsError },
                'Failed to delete sections'
              );
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to delete sections',
              });
            }
          }

          // Set course_structure to null
          const { error: updateError } = await supabase
            .from('courses')
            .update({
              course_structure: null,
              updated_at: now,
            })
            .eq('id', courseId);

          if (updateError) {
            logger.error(
              { requestId, courseId, error: updateError },
              'Failed to clear course_structure'
            );
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to clear course structure',
            });
          }

          deletedStructure = true;

          // Phase 4: Clean up course_nodes when structure is cleared (non-blocking, non-fatal)
          if (isDualWriteEnabled()) {
            await supabase
              .from('course_nodes')
              .delete()
              .eq('course_id', courseId)
              .then(({ error: nodesError }) => {
                if (nodesError) {
                  logger.warn(
                    { courseId, error: nodesError.message },
                    'course_nodes cleanup failed (non-fatal)'
                  );
                }
              });
          }
        }

        logger.info(
          {
            requestId,
            courseId,
            fromStage,
            deletedLessonsCount,
            deletedStructure,
            deletedSectionsCount: fromStage === 4 ? sectionIds.length : 0,
          },
          'Deleted downstream stages'
        );

        return {
          success: true,
          deletedLessonsCount,
          deletedStructure,
          deletedSectionsCount: fromStage === 4 ? sectionIds.length : 0,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        logger.error(
          {
            requestId,
            courseId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Unexpected error in deleteDownstreamStages'
        );

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        });
      }
    }),
};
