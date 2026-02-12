/**
 * Chat Apply Proposal Helpers
 * @module server/routers/generation/editing/chat-apply-helpers
 *
 * Helper functions for the applyProposal mutation, extracted from chat.router.ts
 * to reduce file size and cyclomatic complexity. Handles:
 * - Applying field_updates proposals (Stage 4/5)
 * - Applying lesson_patch proposals (Stage 6)
 * - Applying structural_operation proposals (surgical editing)
 */

import { TRPCError } from '@trpc/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../../../../shared/logger/index.js';
import type {
  FieldUpdatesProposal,
  StructuralOperationProposal,
} from '@megacampus/shared-types/chat-types';
import {
  STAGE4_EDITABLE_FIELDS,
  STAGE5_EDITABLE_FIELDS,
} from '@megacampus/shared-types/regeneration-types';
import { applyFieldUpdate } from '../../../../stages/stage5-generation/utils/course-structure-editor';
import type { CourseStructure, Json, Database } from '@megacampus/shared-types';
import { setNestedValue, normalizePathForValidation } from '../_shared/helpers';
import { resolveLessonIdOrUuid } from '../../../../shared/database/lesson-resolver';
import { assertCourseAccess, buildAuthContext } from '../../../helpers/course-authorization';
import { applySurgicalOperations } from './surgical-operations';

// ============================================================================
// Types
// ============================================================================

/** Result from applying a proposal */
export interface ApplyProposalResult {
  success: boolean;
  appliedUpdates?: number;
  lessonId?: string;
  sectionId?: string;
  updatedAt: string;
}

/** Course data needed for field updates */
interface CourseDataForFieldUpdates {
  id: string;
  analysis_result: Json | null;
  course_structure: Json | null;
}

/** User context for authorization */
interface UserCtx {
  id: string;
  role: Database['public']['Enums']['role'];
  organizationId: string;
}

// ============================================================================
// Field Updates (Stage 4/5)
// ============================================================================

/**
 * Deep clone data with fallback to JSON parse/stringify.
 * Handles cases where structuredClone fails on certain object types.
 */
function deepCloneData(data: unknown, requestId: string, courseId: string): unknown {
  try {
    return structuredClone(data);
  } catch (cloneError) {
    logger.warn(
      { requestId, courseId, error: cloneError },
      'structuredClone failed, using JSON fallback'
    );
    try {
      return JSON.parse(JSON.stringify(data));
    } catch {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Cannot process data structure',
      });
    }
  }
}

/**
 * Apply individual field updates to cloned data.
 * Validates each update against the allowed fields whitelist.
 */
function applyFieldUpdatesToData(
  updatedData: unknown,
  proposal: FieldUpdatesProposal,
  requestId: string,
  courseId: string
): unknown {
  const { stageId, updates } = proposal;
  const allowedFields = stageId === 'stage_4' ? STAGE4_EDITABLE_FIELDS : STAGE5_EDITABLE_FIELDS;

  let result = updatedData;

  for (const update of updates) {
    const normalizedPath =
      stageId === 'stage_5' ? normalizePathForValidation(update.path) : update.path;

    // Validate path is in whitelist
    if (!allowedFields.includes(normalizedPath)) {
      logger.warn(
        { requestId, courseId, path: update.path, normalizedPath },
        'applyProposal: Field path not in whitelist, skipping'
      );
      continue;
    }

    try {
      if (stageId === 'stage_5') {
        const applyResult = applyFieldUpdate(
          result as CourseStructure,
          update.path,
          update.newValue
        );
        result = applyResult.updatedStructure;
      } else {
        setNestedValue(result, update.path, update.newValue);
      }

      logger.info(
        { requestId, courseId, path: update.path },
        'applyProposal: Applied field update'
      );
    } catch (error) {
      logger.warn(
        {
          requestId,
          courseId,
          path: update.path,
          error: error instanceof Error ? error.message : String(error),
        },
        'applyProposal: Failed to apply field update, skipping'
      );
    }
  }

  return result;
}

/**
 * Apply field_updates proposal to Stage 4 or Stage 5 data.
 * Clones the current data, applies all field updates, and persists to database.
 */
export async function applyFieldUpdatesProposal(
  supabase: SupabaseClient<Database>,
  courseId: string,
  course: CourseDataForFieldUpdates,
  proposal: FieldUpdatesProposal,
  requestId: string
): Promise<ApplyProposalResult> {
  const { stageId, updates } = proposal;

  const currentData = stageId === 'stage_4' ? course.analysis_result : course.course_structure;

  if (!currentData) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Cannot apply updates: ${stageId === 'stage_4' ? 'analysis_result' : 'course_structure'} is empty`,
    });
  }

  // Deep clone and apply updates
  const clonedData = deepCloneData(currentData, requestId, courseId);
  const updatedData = applyFieldUpdatesToData(clonedData, proposal, requestId, courseId);

  // Save updated data to database
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
    logger.error(
      { requestId, courseId, stageId, error: updateError },
      'applyProposal: Database update failed'
    );
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to apply proposal',
    });
  }

  logger.info(
    { requestId, courseId, stageId, updateCount: updates.length },
    'applyProposal: Field updates applied successfully'
  );

  return {
    success: true,
    appliedUpdates: updates.length,
    updatedAt: now,
  };
}

// ============================================================================
// Lesson Patch (Stage 6)
// ============================================================================

/**
 * Apply lesson_patch proposal to Stage 6 lesson content.
 * Finds the target section within a lesson and updates its content.
 */
export async function applyLessonPatchProposal(
  supabase: SupabaseClient<Database>,
  courseId: string,
  proposal: { lessonId: string; sectionId: string; patchedContent: string },
  conversationId: string,
  requestId: string,
  user: UserCtx
): Promise<ApplyProposalResult> {
  const { lessonId, patchedContent, sectionId } = proposal;

  // Fetch course for authorization check
  const { data: lessonCourse, error: lessonCourseError } = await supabase
    .from('courses')
    .select('id, user_id, organization_id')
    .eq('id', courseId)
    .single();

  if (lessonCourseError || !lessonCourse) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
  }

  assertCourseAccess(buildAuthContext(user), lessonCourse, 'apply proposal');

  // Resolve lesson UUID
  const lessonUuid = await resolveLessonIdOrUuid(courseId, lessonId);
  if (!lessonUuid) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Lesson ${lessonId} not found`,
    });
  }

  // Fetch current lesson content
  const { data: currentLesson, error: fetchError } = await supabase
    .from('lesson_contents')
    .select('content, metadata')
    .eq('course_id', courseId)
    .eq('lesson_id', lessonUuid)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    logger.error({ requestId, error: fetchError.message }, 'Failed to fetch lesson');
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to fetch lesson content',
    });
  }

  // Build updated content by patching the specific section
  const lessonContent = (currentLesson?.content as {
    sections?: Array<{ title: string; content: string }>;
  }) || { sections: [] };
  const sections = lessonContent.sections || [];

  // Find and update the target section
  const sectionIndex = sections.findIndex(
    (s: { title: string }) =>
      s.title === sectionId || s.title.toLowerCase() === sectionId.toLowerCase()
  );

  let updatedContent: unknown;
  if (sectionIndex >= 0) {
    // Update existing section
    const updatedSections = [...sections];
    updatedSections[sectionIndex] = {
      ...updatedSections[sectionIndex],
      content: patchedContent,
    };
    updatedContent = { ...lessonContent, sections: updatedSections };
  } else {
    // Section not found - append as new section
    updatedContent = {
      ...lessonContent,
      sections: [...sections, { title: sectionId, content: patchedContent }],
    };
  }

  // Update lesson content
  const now = new Date().toISOString();
  const updatedMetadata = {
    ...((currentLesson?.metadata as Record<string, unknown>) || {}),
    updated_by: user.id,
    updated_at: now,
    patch_applied: {
      sectionId,
      conversationId,
      appliedAt: now,
    },
  };

  const { error: updateError } = await supabase
    .from('lesson_contents')
    .update({
      content: updatedContent as Json, // JSONB in database
      updated_at: now,
      metadata: updatedMetadata as Json, // JSONB in database
    })
    .eq('course_id', courseId)
    .eq('lesson_id', lessonUuid);

  if (updateError) {
    logger.error(
      { requestId, courseId, lessonId, error: updateError },
      'applyProposal: Failed to update lesson content'
    );
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to apply lesson patch',
    });
  }

  logger.info(
    { requestId, courseId, lessonId, sectionId },
    'applyProposal: Lesson patch applied successfully'
  );

  return {
    success: true,
    lessonId,
    sectionId,
    updatedAt: now,
  };
}

// ============================================================================
// Structural Operation (Surgical Editing)
// ============================================================================

/**
 * Apply structural_operation proposal to course structure.
 * Uses the surgical operations sequencer for atomic batch application.
 */
export async function applyStructuralOperationProposal(
  supabase: SupabaseClient<Database>,
  courseId: string,
  courseStructure: CourseStructure,
  proposal: StructuralOperationProposal,
  requestId: string
): Promise<ApplyProposalResult & { tempIdMap?: Record<string, string> }> {
  const { operations, summary } = proposal;

  if (!operations || operations.length === 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Structural operation proposal has no operations',
    });
  }

  // Apply operations atomically
  const result = applySurgicalOperations(operations, courseStructure);

  // Save updated structure to database
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('courses')
    .update({
      course_structure: result.updatedStructure as unknown as Json,
      updated_at: now,
    })
    .eq('id', courseId);

  if (updateError) {
    logger.error(
      { requestId, courseId, error: updateError },
      'applyProposal: Failed to save structural operation result'
    );
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to apply structural operation',
    });
  }

  logger.info(
    {
      requestId,
      courseId,
      appliedCount: result.appliedCount,
      tempIdMappings: Object.keys(result.tempIdMap).length,
      summary,
    },
    'applyProposal: Structural operation applied successfully'
  );

  return {
    success: true,
    appliedUpdates: result.appliedCount,
    tempIdMap: result.tempIdMap,
    updatedAt: now,
  };
}
