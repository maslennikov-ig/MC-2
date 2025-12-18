/**
 * Stage Barrier Service
 *
 * Implements strict barrier validation for multi-stage workflow transitions.
 * Validates completion criteria before allowing next stage to start.
 *
 * Stage 3 → Stage 4 Barrier (T049):
 * - ALL documents must have processed_content (not null)
 * - NO failed documents (check error logs or failed processing)
 * - If blocked: update_course_progress with failed status
 * - Throws descriptive error with Russian message for manual intervention
 *
 * @module orchestrator/services/stage-barrier
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import logger from '../../shared/logger';

/**
 * Stage 4 barrier validation result
 */
export interface Stage4BarrierResult {
  canProceed: boolean;
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  errorMessage?: string;
}

/**
 * Validates Stage 3 → Stage 4 transition barrier
 *
 * Barrier Criteria:
 * - ALL documents must have processed_content (not null)
 * - NO documents can have upload_status = 'failed' or processing errors
 * - 100% completion required (strict barrier)
 *
 * If barrier not met:
 * - Calls update_course_progress with 'failed' status
 * - Throws descriptive error for manual intervention
 *
 * @param courseId - Course UUID
 * @param supabaseClient - Supabase client instance
 * @returns Barrier validation result
 * @throws Error if Stage 4 should be blocked
 */
export async function validateStage4Barrier(
  courseId: string,
  supabaseClient: SupabaseClient
): Promise<Stage4BarrierResult> {
  logger.info(
    {
      courseId,
    },
    'Validating Stage 3 → Stage 4 barrier'
  );

  // Use RPC function for atomic barrier check (Phase 9 optimization)
  // Replaces client-side filtering with database-side counting
  const { data, error: rpcError } = await supabaseClient.rpc('check_stage4_barrier', {
    p_course_id: courseId,
  });

  if (rpcError) {
    logger.error(
      {
        courseId,
        error: rpcError,
      },
      'Failed to execute check_stage4_barrier RPC'
    );
    throw new Error(`Stage 4 barrier check failed: ${rpcError.message}`);
  }

  if (!data || data.length === 0) {
    logger.error(
      {
        courseId,
      },
      'check_stage4_barrier returned no data'
    );
    throw new Error('Stage 4 barrier check failed: No data returned');
  }

  const { total_count, completed_count } = data[0];
  const total = Number(total_count);
  const completed = Number(completed_count);

  // Count failed files (either explicitly failed status OR missing processed_content)
  const failed = total - completed;

  logger.info(
    {
      courseId,
      totalFiles: total,
      completedFiles: completed,
      failedFiles: failed,
    },
    'Stage 4 barrier check metrics'
  );

  // Strict barrier: ALL documents must be complete (0/0 allowed for "from scratch" courses)
  const canProceed = completed === total && failed === 0 && total >= 0;

  const result: Stage4BarrierResult = {
    canProceed,
    totalFiles: total,
    completedFiles: completed,
    failedFiles: failed,
  };

  if (!canProceed) {
    // Build Russian error message
    const errorMessage = `${completed}/${total} документов завершено, ${failed} не удалось - требуется ручное вмешательство`;
    result.errorMessage = errorMessage;

    // Update progress status to failed (step 3 failed)
    const { error: rpcError } = await supabaseClient.rpc('update_course_progress', {
      p_course_id: courseId,
      p_step_id: 3,
      p_status: 'failed',
      p_message: errorMessage,
    });

    if (rpcError) {
      logger.error(
        {
          courseId,
          error: rpcError,
        },
        'Failed to update course progress to failed status (non-fatal)'
      );
    }

    logger.error(
      {
        courseId,
        completed,
        total,
        failed,
        errorMessage,
      },
      'Stage 4 BLOCKED: Not all documents summarized successfully'
    );

    throw new Error(
      `STAGE_4_BLOCKED: Not all documents summarized successfully (${completed}/${total} complete, ${failed} failed)`
    );
  }

  logger.info(
    {
      courseId,
      totalFiles: total,
      completedFiles: completed,
    },
    'Stage 4 barrier passed: All documents summarized successfully'
  );

  return result;
}

/**
 * Check if Stage 4 should be triggered
 *
 * Should trigger Stage 4 when:
 * - All documents are completed (processed_content not null)
 * - No failed documents
 * - Stage 3 is complete
 *
 * @param courseId - Course UUID
 * @param supabaseClient - Supabase client instance
 * @returns True if Stage 4 should be triggered
 */
export async function shouldTriggerStage4(
  courseId: string,
  supabaseClient: SupabaseClient
): Promise<boolean> {
  try {
    const result = await validateStage4Barrier(courseId, supabaseClient);
    return result.canProceed;
  } catch (error) {
    // Barrier blocked
    return false;
  }
}
