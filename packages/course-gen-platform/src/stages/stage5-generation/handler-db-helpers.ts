/**
 * Stage 5 Generation Handler - Database Helper Functions
 *
 * Extracted from handler-helpers.ts to reduce file size.
 * Contains:
 * - Worker validation and FSM fallback
 * - Section/lesson materialization
 * - Database status updates
 * - Token tracking
 *
 * @module orchestrator/handlers/stage5-generation/db-helpers
 */

import type pino from 'pino';
import type { Database } from '@megacampus/shared-types';
import logger from '@/shared/logger';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import type { GenerationErrorCode } from './handler-helpers';

// ============================================================================
// TYPES
// ============================================================================

interface CourseStatusRow {
  generation_status: string;
  pause_at_stage_5: boolean;
}

/** Sanitized structure type for materialization */
export interface SanitizedStructureForMaterialization {
  sections: Array<{
    section_title: string;
    section_number?: number;
    lessons: Array<{
      lesson_title: string;
      lesson_number?: number;
      estimated_duration_minutes?: number;
      lesson_objectives?: string[];
    }>;
  }>;
}

/** Section payload for batch insert */
interface SectionPayload {
  course_id: string;
  title: string;
  order_index: number;
}

/** Lesson payload for batch insert */
interface LessonPayload {
  section_id: string;
  title: string;
  order_index: number;
  lesson_type: 'text';
  duration_minutes: number;
  objectives: string[];
}

// ============================================================================
// WORKER VALIDATION & FSM FALLBACK
// ============================================================================

/**
 * Perform Layer 3 worker validation and fallback initialization for Stage 5.
 * Checks current course status and initializes FSM if needed.
 *
 * @param courseId - Course UUID
 * @param userId - User ID for FSM initialization
 * @param organizationId - Organization ID for FSM initialization
 * @param jobId - Job ID for logging and idempotency
 * @returns CourseStatusRow from database
 * @throws Error if course not found or in failed state
 */
export async function validateAndInitializeStage5(
  courseId: string,
  userId: string | undefined,
  organizationId: string | undefined,
  jobId: string | undefined
): Promise<CourseStatusRow> {
  const supabaseForValidation = getSupabaseAdmin();
  const { data } = await supabaseForValidation
    .from('courses')
    .select('generation_status, pause_at_stage_5')
    .eq('id', courseId)
    .single();

  const course = data as unknown as CourseStatusRow;

  if (!course) {
    logger.error({ courseId, jobId }, 'Worker validation: Course not found');
    throw new Error('Course not found');
  }

  // Check if Stage 5 is initialized (valid states)
  const validStage5States = ['stage_5_init', 'stage_5_generating', 'stage_5_awaiting_approval'];
  if (!validStage5States.includes(course.generation_status)) {
    await handleInvalidStage5State(
      course.generation_status,
      courseId,
      userId,
      organizationId,
      jobId
    );
  }

  return course;
}

/**
 * Handle case when course is not in a valid Stage 5 state.
 * Either throws (if failed) or attempts FSM fallback initialization.
 */
async function handleInvalidStage5State(
  currentStatus: string,
  courseId: string,
  userId: string | undefined,
  organizationId: string | undefined,
  jobId: string | undefined
): Promise<void> {
  // If status is 'failed', do NOT reinitialize
  if (currentStatus === 'failed') {
    logger.error(
      { courseId, jobId, currentStatus },
      'Worker validation: Course is in failed state, refusing to retry'
    );
    throw new Error(`Course ${courseId} is in failed state, cannot retry automatically`);
  }

  logger.warn(
    { courseId, jobId, currentStatus },
    'Worker validation: Stage 5 not initialized, initializing as fallback'
  );

  try {
    const { InitializeFSMCommandHandler } = await import(
      '@/shared/fsm/fsm-initialization-command-handler'
    );
    const { metricsStore } = await import('@/orchestrator/metrics');

    const commandHandler = new InitializeFSMCommandHandler();
    await commandHandler.handle({
      entityId: courseId,
      userId: userId || 'system',
      organizationId: organizationId || 'unknown',
      idempotencyKey: `worker-fallback-stage5-${jobId}`,
      initiatedBy: 'WORKER',
      initialState: 'stage_5_init',
      data: { trigger: 'worker_fallback_stage5' },
      jobs: [],
    });

    metricsStore.recordLayer3Activation(true, courseId);
    logger.info({ courseId, jobId }, 'Worker fallback: Stage 5 initialized successfully');
  } catch (error) {
    const { metricsStore } = await import('@/orchestrator/metrics');
    metricsStore.recordLayer3Activation(false, courseId);

    logger.warn(
      {
        courseId,
        jobId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Worker fallback initialization failed (continuing processing)'
    );
  }
}

// ============================================================================
// MATERIALIZATION
// ============================================================================

/**
 * Materialize sections and lessons from course_structure JSONB to database tables.
 * Required for Stage 6, Stage 7 (covers), and other features.
 * Uses batch inserts (2 queries) with fallback to individual inserts.
 *
 * @param courseId - Course UUID
 * @param sanitizedStructure - Sanitized course structure with sections and lessons
 * @param jobLogger - Logger instance with job context
 */
export async function materializeSectionsAndLessons(
  courseId: string,
  sanitizedStructure: SanitizedStructureForMaterialization,
  jobLogger: pino.Logger
): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  let materializedSections = 0;
  let materializedLessons = 0;

  // Build section insert payloads
  const sectionPayloads: SectionPayload[] = sanitizedStructure.sections.map(
    (section, sectionIndex) => ({
      course_id: courseId,
      title: section.section_title,
      order_index: section.section_number ?? sectionIndex + 1,
    })
  );

  // Batch insert all sections in one query
  const { data: insertedSections, error: sectionBatchError } = await supabaseAdmin
    .from('sections')
    .insert(sectionPayloads)
    .select('id, order_index');

  if (sectionBatchError || !insertedSections) {
    jobLogger.warn(
      { courseId, error: sectionBatchError?.message },
      'Batch section insert failed, falling back to individual inserts'
    );

    const result = await materializeSectionsIndividually(
      supabaseAdmin,
      courseId,
      sanitizedStructure,
      jobLogger
    );
    materializedSections = result.sections;
    materializedLessons = result.lessons;
  } else {
    materializedSections = insertedSections.length;
    materializedLessons = await materializeLessonsBatch(
      supabaseAdmin,
      courseId,
      sanitizedStructure,
      insertedSections,
      jobLogger
    );
  }

  jobLogger.info(
    { courseId, materializedSections, materializedLessons },
    'Sections and lessons materialized successfully'
  );
}

/**
 * Fallback: insert sections and lessons one by one
 */
async function materializeSectionsIndividually(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  courseId: string,
  sanitizedStructure: SanitizedStructureForMaterialization,
  jobLogger: pino.Logger
): Promise<{ sections: number; lessons: number }> {
  let materializedSections = 0;
  let materializedLessons = 0;

  for (const [sectionIndex, section] of sanitizedStructure.sections.entries()) {
    const sectionNumber = section.section_number ?? sectionIndex + 1;

    const { data: newSection, error: sectionInsertError } = await supabaseAdmin
      .from('sections')
      .insert({
        course_id: courseId,
        title: section.section_title,
        order_index: sectionNumber,
      })
      .select('id')
      .single();

    if (sectionInsertError || !newSection) {
      jobLogger.warn(
        { courseId, sectionNumber, error: sectionInsertError?.message },
        'Failed to create section record (may already exist)'
      );
      continue;
    }

    materializedSections++;

    for (const [lessonIndex, lesson] of section.lessons.entries()) {
      const lessonNumber = lesson.lesson_number ?? lessonIndex + 1;

      const { error: lessonInsertError } = await supabaseAdmin.from('lessons').insert({
        section_id: newSection.id,
        title: lesson.lesson_title,
        order_index: lessonNumber,
        lesson_type: 'text',
        duration_minutes: lesson.estimated_duration_minutes || 15,
        objectives: lesson.lesson_objectives || [],
      });

      if (lessonInsertError) {
        jobLogger.warn(
          { courseId, sectionNumber, lessonNumber, error: lessonInsertError.message },
          'Failed to create lesson record'
        );
      } else {
        materializedLessons++;
      }
    }
  }

  return { sections: materializedSections, lessons: materializedLessons };
}

/**
 * Batch insert lessons using section IDs from batch section insert
 */
async function materializeLessonsBatch(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  courseId: string,
  sanitizedStructure: SanitizedStructureForMaterialization,
  insertedSections: Array<{ id: string; order_index: number }>,
  jobLogger: pino.Logger
): Promise<number> {
  let materializedLessons = 0;

  const sectionIdByOrderIndex = new Map(insertedSections.map(s => [s.order_index, s.id]));
  const lessonPayloads: LessonPayload[] = [];

  for (const [sectionIndex, section] of sanitizedStructure.sections.entries()) {
    const sectionNumber = section.section_number ?? sectionIndex + 1;
    const sectionId = sectionIdByOrderIndex.get(sectionNumber);

    if (!sectionId) {
      jobLogger.warn(
        { courseId, sectionNumber },
        'Could not find section ID for order_index after batch insert'
      );
      continue;
    }

    for (const [lessonIndex, lesson] of section.lessons.entries()) {
      const lessonNumber = lesson.lesson_number ?? lessonIndex + 1;
      lessonPayloads.push({
        section_id: sectionId,
        title: lesson.lesson_title,
        order_index: lessonNumber,
        lesson_type: 'text',
        duration_minutes: lesson.estimated_duration_minutes || 15,
        objectives: lesson.lesson_objectives || [],
      });
    }
  }

  if (lessonPayloads.length > 0) {
    const { error: lessonBatchError } = await supabaseAdmin.from('lessons').insert(lessonPayloads);

    if (lessonBatchError) {
      jobLogger.warn(
        { courseId, error: lessonBatchError.message },
        'Batch lesson insert failed, falling back to individual inserts'
      );

      for (const payload of lessonPayloads) {
        const { error: lessonInsertError } = await supabaseAdmin.from('lessons').insert(payload);

        if (lessonInsertError) {
          jobLogger.warn(
            {
              courseId,
              sectionId: payload.section_id,
              lessonTitle: payload.title,
              error: lessonInsertError.message,
            },
            'Failed to create lesson record'
          );
        } else {
          materializedLessons++;
        }
      }
    } else {
      materializedLessons = lessonPayloads.length;
    }
  }

  return materializedLessons;
}

// ============================================================================
// ERROR HANDLING UTILITIES
// ============================================================================

/**
 * Update course status to 'failed' in the database (FR-024)
 */
export async function markCourseAsFailed(
  courseId: string,
  errorCode: GenerationErrorCode,
  jobLogger: pino.Logger
): Promise<void> {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { error: statusUpdateError } = await supabaseAdmin
      .from('courses')
      .update({
        generation_status: 'failed',
        failed_at_stage: 5,
        error_code: errorCode as unknown as Database['public']['Enums']['stage_error_code'],
        updated_at: new Date().toISOString(),
      })
      .eq('id', courseId);

    if (statusUpdateError) {
      jobLogger.error(
        { error: statusUpdateError, courseId },
        'Failed to update generation_status to failed'
      );
    } else {
      jobLogger.info({ courseId }, 'Generation status updated to failed');
    }
  } catch (statusError) {
    jobLogger.error(
      {
        error: statusError instanceof Error ? statusError.message : String(statusError),
        courseId,
      },
      'Exception while updating course status'
    );
  }
}

/**
 * Update status transitions for generation start
 * Sets stage_5_init -> stage_5_generating unless already generating (retry scenario)
 */
export async function updateStatusForGenerationStart(
  courseId: string,
  jobLogger: pino.Logger
): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: currentCourse } = await supabaseAdmin
    .from('courses')
    .select('generation_status')
    .eq('id', courseId)
    .single();

  const currentStatus = currentCourse?.generation_status;

  if (currentStatus !== 'stage_5_generating') {
    jobLogger.info('Setting course status to stage_5_init');
    const { error: statusError } = await supabaseAdmin
      .from('courses')
      .update({ generation_status: 'stage_5_init' as const })
      .eq('id', courseId);

    if (statusError) {
      throw new Error(`Failed to update status to stage_5_init: ${statusError.message}`);
    }

    jobLogger.info('Setting course status to stage_5_generating');
    const { error: generatingError } = await supabaseAdmin
      .from('courses')
      .update({ generation_status: 'stage_5_generating' as const })
      .eq('id', courseId);

    if (generatingError) {
      throw new Error(`Failed to update status to stage_5_generating: ${generatingError.message}`);
    }
  } else {
    jobLogger.info(
      { currentStatus },
      'Skipping status updates - already in stage_5_generating (retry scenario)'
    );
  }
}

/**
 * Track stage 5 token usage in generation_progress
 */
export async function trackStage5Tokens(
  courseId: string,
  tokens: number,
  jobLogger: pino.Logger
): Promise<void> {
  if (tokens && tokens > 0) {
    const supabaseAdmin = getSupabaseAdmin();
    const { error: tokenError } = await supabaseAdmin.rpc('upsert_stage_tokens', {
      p_course_id: courseId,
      p_stage_key: 'stage_5',
      p_tokens: tokens,
    });
    if (tokenError) {
      jobLogger.warn(
        { courseId, tokens, error: tokenError.message },
        'Failed to upsert stage tokens (non-fatal)'
      );
    }
  }
}
