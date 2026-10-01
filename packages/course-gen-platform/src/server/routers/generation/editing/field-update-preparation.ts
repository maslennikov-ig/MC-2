import { TRPCError } from '@trpc/server';
import {
  STAGE4_EDITABLE_FIELDS,
  STAGE5_EDITABLE_FIELDS,
  type UpdateFieldInput,
} from '@megacampus/shared-types/regeneration-types';
import type { CourseStructure } from '@megacampus/shared-types';
import type { getSupabaseAdmin } from '../../../../shared/supabase/admin';
import { logger } from '../../../../shared/logger/index.js';
import {
  applyFieldUpdate,
  ensureStableIdsAndSchemaVersionInMemory,
} from '../../../../stages/stage5-generation/utils/course-structure-editor';
import { setNestedValue, normalizePathForValidation } from '../_shared/helpers';
import { assertStableIds } from '../../../../shared/course-nodes/feature-flags';
import { resolveStructure } from '../../../../shared/course-nodes/structure-resolver';
import { buildStage5StructuralQualityMetadataUpdate } from './structural-quality-metadata';

/** Prepare the same validated field patch for a standalone save or an atomic cascade edit. */
export async function prepareCourseFieldUpdate(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  course: { analysis_result: unknown; course_structure: unknown },
  input: UpdateFieldInput,
  requestId: string
) {
  const { courseId, stageId, fieldPath, value } = input;
  const allowedFields = stageId === 'stage_4' ? STAGE4_EDITABLE_FIELDS : STAGE5_EDITABLE_FIELDS;
  const normalizedFieldPath =
    stageId === 'stage_5' ? normalizePathForValidation(fieldPath) : fieldPath;

  if (!allowedFields.includes(normalizedFieldPath)) {
    logger.warn(
      { requestId, courseId, stageId, fieldPath, normalizedFieldPath, allowedFields },
      'Field path not in whitelist'
    );
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Field "${fieldPath}" is not editable` });
  }

  const currentData =
    stageId === 'stage_4'
      ? course.analysis_result
      : await resolveStructure(courseId, course.course_structure, supabase);

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
      const result = applyFieldUpdate(currentData as CourseStructure, fieldPath, value);
      updatedData = result.updatedStructure;
      recalculated = result.recalculated;
    } else {
      updatedData = structuredClone(currentData);
      setNestedValue(updatedData, fieldPath, value);
    }
  } catch (error) {
    logger.warn(
      {
        requestId,
        courseId,
        fieldPath,
        error: error instanceof Error ? error.message : String(error),
      },
      'Invalid field path'
    );
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Invalid field path: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }

  let dataToPersist: unknown = updatedData;
  if (stageId === 'stage_5') {
    const normalizedStructure = ensureStableIdsAndSchemaVersionInMemory(
      updatedData as CourseStructure
    );
    assertStableIds(normalizedStructure);
    dataToPersist = normalizedStructure;
  }

  const updateColumn = stageId === 'stage_4' ? 'analysis_result' : 'course_structure';
  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = { [updateColumn]: dataToPersist, updated_at: now };
  if (stageId === 'stage_5') {
    updatePayload.generation_metadata = await buildStage5StructuralQualityMetadataUpdate(
      supabase,
      courseId,
      dataToPersist as CourseStructure,
      requestId
    );
  }
  return { dataToPersist, updatePayload, now, recalculated };
}
