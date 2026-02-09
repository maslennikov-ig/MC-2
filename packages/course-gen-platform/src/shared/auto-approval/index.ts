/**
 * Auto-Approval Service for Automatic Generation Mode
 *
 * Handles automatic stage transitions when generation_mode = 'automatic'.
 * Instead of waiting for user approval, automatically proceeds to next stage.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../supabase/admin';
import { logger } from '../logger/index.js';
import { captureError } from '../sentry/init.js';
import type { Database } from '@megacampus/shared-types';
import {
  type CourseForAutoApproval,
  buildBaseJobContext,
  queueStage3Job,
  queueStage4Job,
  queueStage5Job,
  queueStage6Jobs,
} from './helpers';

type GenerationStatus = Database['public']['Enums']['generation_status'];

// ============================================================================
// STAGE STATUS TRANSITION
// ============================================================================

/**
 * Perform the FSM status transition for auto-approval.
 *
 * Handles two paths:
 * - From awaiting_approval: direct transition to next stage init
 * - From processing/init: two-step (complete -> next_init)
 *
 * @returns true if transition succeeded, false if race condition detected
 */
async function performStatusTransition(
  db: SupabaseClient,
  courseId: string,
  currentStage: number,
  actualStatus: GenerationStatus,
  completeStatus: GenerationStatus,
  nextStatus: GenerationStatus
): Promise<boolean> {
  const awaitingApprovalStatus = `stage_${currentStage}_awaiting_approval` as GenerationStatus;
  const expectedCurrentStatus = getExpectedProcessingStatus(currentStage);
  const initStatus = `stage_${currentStage}_init` as GenerationStatus;

  if (actualStatus === awaitingApprovalStatus) {
    // Direct transition from awaiting_approval to next stage init
    const { data: updateResult, error: updateError } = await db
      .from('courses')
      .update({
        generation_status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', courseId)
      .eq('generation_status', awaitingApprovalStatus)
      .select('id');

    if (updateError || !updateResult || updateResult.length === 0) {
      logger.warn(
        { courseId, error: updateError, rowsUpdated: updateResult?.length ?? 0 },
        'Failed to update status from awaiting_approval (race condition)'
      );
      return false;
    }

    logger.debug(
      { courseId, fromStatus: awaitingApprovalStatus, toStatus: nextStatus },
      'Direct transition from awaiting_approval to next stage'
    );
    return true;
  }

  // Two-step transition: processing/init -> complete -> next_init
  const { data: updateResult, error: updateError } = await db
    .from('courses')
    .update({
      generation_status: completeStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', courseId)
    .in('generation_status', [expectedCurrentStatus, initStatus])
    .select('id');

  if (updateError || !updateResult || updateResult.length === 0) {
    logger.warn(
      { courseId, error: updateError, rowsUpdated: updateResult?.length ?? 0 },
      'Failed to update status (race condition or status changed)'
    );
    return false;
  }

  logger.debug({ courseId, status: completeStatus }, 'Stage marked complete');

  // Second step: Transition to next stage init
  await db
    .from('courses')
    .update({
      generation_status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', courseId);

  return true;
}

/**
 * Get expected processing status suffix for a given stage
 */
function getExpectedProcessingStatus(currentStage: number): GenerationStatus {
  const statusSuffixMap: Record<number, string> = {
    2: 'processing',
    3: 'summarizing',
    4: 'analyzing',
    5: 'generating',
    6: 'generating',
  };
  const statusSuffix = statusSuffixMap[currentStage] || 'generating';
  return `stage_${currentStage}_${statusSuffix}` as GenerationStatus;
}

/**
 * Validate that the course is in an expected state for auto-approval.
 *
 * @returns The actual status if valid, or null if already transitioned / invalid state
 */
async function validateCourseStatusForTransition(
  db: SupabaseClient,
  courseId: string,
  currentStage: number,
  completeStatus: GenerationStatus,
  nextStatus: GenerationStatus
): Promise<
  { actualStatus: GenerationStatus } | { skip: true; autoApproved: boolean; nextStage?: number }
> {
  const { data: currentCourse, error: statusError } = await db
    .from('courses')
    .select('generation_status')
    .eq('id', courseId)
    .single();

  if (statusError || !currentCourse) {
    logger.warn({ courseId, error: statusError }, 'Failed to check course status for idempotency');
    // Return a sentinel that lets caller continue (best-effort)
    return { actualStatus: getExpectedProcessingStatus(currentStage) };
  }

  const currentStatus = currentCourse.generation_status as GenerationStatus;
  const nextStage = currentStage + 1;

  // Already processed - skip duplicate processing
  if (currentStatus === nextStatus || currentStatus === completeStatus) {
    logger.info(
      { courseId, currentStage, currentStatus },
      'Stage already transitioned (idempotent skip)'
    );
    return { skip: true, autoApproved: true, nextStage };
  }

  // Accept processing, init, and awaiting_approval statuses
  const expectedCurrentStatus = getExpectedProcessingStatus(currentStage);
  const initStatus = `stage_${currentStage}_init` as GenerationStatus;
  const awaitingApprovalStatus = `stage_${currentStage}_awaiting_approval` as GenerationStatus;
  const validStatuses = [expectedCurrentStatus, initStatus, awaitingApprovalStatus];

  if (!validStatuses.includes(currentStatus)) {
    logger.warn(
      { courseId, currentStage, expectedStatuses: validStatuses, actualStatus: currentStatus },
      'Course not in expected state for auto-approval, skipping'
    );
    return { skip: true, autoApproved: false };
  }

  return { actualStatus: currentStatus };
}

// ============================================================================
// MAIN EXPORTED FUNCTION
// ============================================================================

/**
 * Handle stage completion with automatic mode support
 *
 * If generation_mode = 'automatic':
 *   - Auto-approve and transition to next stage
 *   - Queue next stage job
 *
 * If generation_mode = 'semi_automatic':
 *   - Set status to awaiting_approval (current behavior)
 */
export async function handleStageCompletion(
  courseId: string,
  currentStage: number,
  supabase?: SupabaseClient
): Promise<{ autoApproved: boolean; nextStage?: number }> {
  const db = supabase || getSupabaseAdmin();

  // Fetch course with generation mode
  const { data: course, error } = await db
    .from('courses')
    .select(
      'generation_mode, user_id, organization_id, title, settings, language, style, target_audience, difficulty, course_description, course_size, analysis_result, organization:organizations(tier)'
    )
    .eq('id', courseId)
    .single();

  if (error || !course) {
    logger.error({ courseId, error }, 'Failed to fetch course for auto-approval');
    captureError(error instanceof Error ? error : new Error(`Course not found: ${courseId}`), {
      tags: { component: 'auto-approval', courseId },
      level: 'error',
    });
    throw new Error(`Course not found: ${courseId}`);
  }

  // Check if automatic mode
  if (course.generation_mode !== 'automatic') {
    return handleSemiAutomaticMode(db, courseId, currentStage);
  }

  // Automatic mode: proceed to next stage
  logger.info({ courseId, currentStage }, 'Auto-approving stage (automatic mode)');

  const nextStage = currentStage + 1;
  const completeStatus = `stage_${currentStage}_complete` as GenerationStatus;
  const nextStatus = `stage_${nextStage}_init` as GenerationStatus;

  // IDEMPOTENCY CHECK
  const validationResult = await validateCourseStatusForTransition(
    db,
    courseId,
    currentStage,
    completeStatus,
    nextStatus
  );
  if ('skip' in validationResult) {
    return { autoApproved: validationResult.autoApproved, nextStage: validationResult.nextStage };
  }

  // FSM transition
  const transitioned = await performStatusTransition(
    db,
    courseId,
    currentStage,
    validationResult.actualStatus,
    completeStatus,
    nextStatus
  );
  if (!transitioned) {
    return { autoApproved: false };
  }

  // Queue next stage job
  try {
    await queueNextStageJob(courseId, nextStage, course);
  } catch (queueError) {
    await rollbackOnQueueFailure(db, courseId, currentStage, nextStage, queueError);
  }

  logger.info({ courseId, currentStage, nextStage }, 'Stage auto-approved, next stage queued');
  return { autoApproved: true, nextStage };
}

// ============================================================================
// HELPER FUNCTIONS (PRIVATE)
// ============================================================================

/**
 * Handle semi-automatic mode: set status to awaiting_approval
 */
async function handleSemiAutomaticMode(
  db: SupabaseClient,
  courseId: string,
  currentStage: number
): Promise<{ autoApproved: boolean }> {
  const awaitingStatus = `stage_${currentStage}_awaiting_approval` as GenerationStatus;
  await db
    .from('courses')
    .update({
      generation_status: awaitingStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', courseId);

  logger.info(
    { courseId, currentStage, status: awaitingStatus },
    'Stage awaiting approval (semi-automatic)'
  );
  return { autoApproved: false };
}

/**
 * Rollback status and throw on queue failure
 */
async function rollbackOnQueueFailure(
  db: SupabaseClient,
  courseId: string,
  currentStage: number,
  nextStage: number,
  queueError: unknown
): Promise<never> {
  const rollbackStatus = `stage_${currentStage}_complete` as GenerationStatus;
  logger.error(
    {
      courseId,
      nextStage,
      error: queueError instanceof Error ? queueError.message : String(queueError),
    },
    'Failed to queue next stage job, rolling back status'
  );
  captureError(queueError, {
    tags: { component: 'auto-approval', stage: String(nextStage), courseId },
    extra: { currentStage, nextStage },
    level: 'error',
  });

  await db
    .from('courses')
    .update({
      generation_status: rollbackStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', courseId);

  throw new Error(
    `Failed to queue stage ${nextStage}: ${queueError instanceof Error ? queueError.message : String(queueError)}`
  );
}

/**
 * Queue the appropriate job for the next stage.
 * Delegates to stage-specific queueing functions in helpers.ts.
 */
async function queueNextStageJob(
  courseId: string,
  nextStage: number,
  course: CourseForAutoApproval
): Promise<void> {
  const { userId, organizationId, priority, baseJobData } = buildBaseJobContext(course, courseId);
  const idempotentJobId = `auto-${courseId}-stage${nextStage}`;

  switch (nextStage) {
    case 3:
      await queueStage3Job(courseId, baseJobData, priority, idempotentJobId);
      break;
    case 4:
      await queueStage4Job(courseId, course, baseJobData, priority, idempotentJobId);
      break;
    case 5:
      await queueStage5Job(courseId, course, userId, organizationId, priority, idempotentJobId);
      break;
    case 6:
      await queueStage6Jobs(courseId, priority);
      break;
    default:
      logger.warn({ courseId, nextStage }, 'Unknown next stage for auto-queue');
  }
}

export { handleStageCompletion as default };
