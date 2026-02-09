/**
 * Stage 2 Document Processing Progress Helpers
 *
 * Functions for managing course progress updates, document counting,
 * and stage completion handling.
 *
 * @module stages/stage2-document-processing/orchestrator-progress-helpers
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@megacampus/shared-types';
import { getSupabaseAdmin } from '../../shared/supabase/admin';
import { logger } from '../../shared/logger/index.js';
import { handleStageCompletion } from '../../shared/auto-approval';
import { notifyStageComplete, notifyCourseError } from '../../shared/notifications';

/**
 * Update course progress - simplified version for terminal states
 */
export async function updateDocumentProcessingProgress(
  courseId: string,
  supabaseAdmin: SupabaseClient<Database>
): Promise<void> {
  try {
    const { data: course, error: courseError } = await supabaseAdmin
      .from('courses')
      .select('generation_status, generation_mode')
      .eq('id', courseId)
      .single();

    if (courseError || !course) {
      logger.warn(
        { courseId, error: courseError },
        'Failed to fetch course status for progress update (non-fatal)'
      );
      return;
    }

    const currentStatus = course.generation_status as string;
    const generationMode = course.generation_mode as string;

    // Check terminal states
    const terminalStage2States = ['stage_2_complete', 'stage_2_awaiting_approval'];
    if (terminalStage2States.includes(currentStatus)) {
      await handleTerminalState(courseId, currentStatus, generationMode, supabaseAdmin);
      return;
    }

    // Check updatable states
    const updatableStates = ['stage_2_init', 'stage_2_processing'];
    if (!updatableStates.includes(currentStatus)) {
      logger.info(
        { courseId, currentStatus },
        'Course already past Stage 2, skipping progress update'
      );
      return;
    }

    // Count documents
    const { completedCount, totalCount } = await countDocuments(courseId, supabaseAdmin);

    if (completedCount < totalCount) {
      await updateInProgress(courseId, completedCount, totalCount, supabaseAdmin);
    } else {
      await updateComplete(courseId, totalCount, generationMode, supabaseAdmin);
    }
  } catch (err) {
    logger.error({ courseId, error: err }, 'Exception while updating course progress (non-fatal)');
  }
}

/**
 * Handle terminal state processing
 */
async function handleTerminalState(
  courseId: string,
  currentStatus: string,
  generationMode: string,
  _supabaseAdmin: SupabaseClient<Database>
): Promise<void> {
  logger.info({ courseId, currentStatus }, 'Course already in terminal Stage 2 state');

  if (currentStatus === 'stage_2_awaiting_approval' && generationMode === 'automatic') {
    try {
      const { autoApproved } = await handleStageCompletion(courseId, 2);
      if (autoApproved) {
        logger.info({ courseId }, 'Stage 2 auto-approved from awaiting_approval state');
      }
    } catch (err) {
      logger.warn({ courseId, error: err }, 'Failed to auto-approve from awaiting_approval');
    }
  }
}

/**
 * Count completed and total documents
 */
async function countDocuments(
  courseId: string,
  supabaseAdmin: SupabaseClient<Database>
): Promise<{ completedCount: number; totalCount: number }> {
  const { count: completedCount, error: completedError } = await supabaseAdmin
    .from('file_catalog')
    .select('*', { count: 'exact', head: true })
    .eq('course_id', courseId)
    .eq('vector_status', 'indexed');

  if (completedError) {
    logger.error({ courseId, error: completedError }, 'Failed to count completed documents');
    return { completedCount: 0, totalCount: 0 };
  }

  const { count: totalCount, error: totalError } = await supabaseAdmin
    .from('file_catalog')
    .select('*', { count: 'exact', head: true })
    .eq('course_id', courseId);

  if (totalError) {
    logger.error({ courseId, error: totalError }, 'Failed to count total documents');
    return { completedCount: completedCount || 0, totalCount: 0 };
  }

  return { completedCount: completedCount || 0, totalCount: totalCount || 0 };
}

/**
 * Update course to in_progress state
 */
async function updateInProgress(
  courseId: string,
  completed: number,
  total: number,
  supabaseAdmin: SupabaseClient<Database>
): Promise<void> {
  const { error: rpcError } = await supabaseAdmin.rpc('update_course_progress', {
    p_course_id: courseId,
    p_step_id: 2,
    p_status: 'in_progress',
    p_message: `Обработка документов... (${completed}/${total})`,
  });

  if (rpcError) {
    logger.error({ courseId, error: rpcError }, 'Failed to update course progress');
  } else {
    logger.info(
      { courseId, completedCount: completed, totalCount: total },
      'Course progress updated'
    );
  }
}

/**
 * Update course to complete state with auto-approval
 */
async function updateComplete(
  courseId: string,
  total: number,
  _generationMode: string,
  supabaseAdmin: SupabaseClient<Database>
): Promise<void> {
  const { error: rpcError } = await supabaseAdmin.rpc('update_course_progress', {
    p_course_id: courseId,
    p_step_id: 2,
    p_status: 'completed',
    p_message: 'Документы обработаны',
  });

  if (rpcError) {
    const errorMessage = rpcError.message || '';
    if (errorMessage.includes('Invalid generation status transition')) {
      logger.info({ courseId }, 'Stage 2 completion blocked by FSM (race condition)');
    } else {
      logger.error({ courseId, error: rpcError }, 'Failed to update course to complete');
    }
  } else {
    logger.info({ courseId, totalCount: total }, 'All documents complete');

    try {
      const { autoApproved } = await handleStageCompletion(courseId, 2);
      if (autoApproved) {
        logger.info({ courseId }, 'Stage 2 auto-approved');
      }

      await notifyStageComplete(courseId, 2);
    } catch (stageError) {
      logger.error({ courseId, error: stageError }, 'Failed to handle stage completion');
      try {
        await notifyCourseError(courseId, 2, 'Auto-approval failed');
      } catch {
        logger.warn({ courseId }, 'Failed to send error notification');
      }
      throw stageError;
    }
  }
}

/**
 * Update course progress in database for real-time UI updates
 */
export async function updateCourseProgressInDB(
  courseId: string,
  message: string,
  completed?: number,
  total?: number
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();

    const displayMessage =
      completed !== undefined && total !== undefined
        ? `${message} (${completed}/${total})`
        : message;

    const { error: rpcError } = await supabase.rpc('update_course_progress', {
      p_course_id: courseId,
      p_step_id: 2,
      p_status: 'in_progress',
      p_message: displayMessage,
    });

    if (rpcError) {
      logger.warn({ courseId, error: rpcError.message }, 'Failed to update course progress in DB');
    } else {
      logger.debug({ courseId, message: displayMessage }, 'Course progress updated in DB');
    }
  } catch (err) {
    logger.warn(
      { courseId, error: err instanceof Error ? err.message : String(err) },
      'Exception while updating course progress'
    );
  }
}
