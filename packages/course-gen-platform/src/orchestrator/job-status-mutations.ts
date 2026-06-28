/**
 * Job Status Mutations
 * @module orchestrator/job-status-mutations
 *
 * State transition functions for BullMQ job status tracking.
 * Extracted from job-status-tracker.ts to comply with max-lines rule.
 */

/* eslint-disable complexity */

import { Job } from 'bullmq';
import { getSupabaseAdmin } from '../shared/supabase/admin';
import logger from '../shared/logger';
import type { JobData, Database } from '@megacampus/shared-types';
import { JobStatus, updateJobStatus } from './job-status-tracker';

/**
 * Job status update interface for updateJobStatus function
 * Accepts Date objects which are converted to ISO strings before database write
 */
interface JobStatusUpdate {
  status?: JobStatus | 'failed';
  attempts?: number;
  started_at?: Date;
  completed_at?: Date;
  failed_at?: Date;
  cancelled?: boolean;
  cancelled_at?: string;
  cancelled_by?: string;
  error_message?: string | null;
  error_stack?: string | null;
  progress?: Record<string, unknown>;
  updated_at?: string;
}

/**
 * Job status database update type for direct Supabase writes
 */
type JobStatusDbUpdate = Database['public']['Tables']['job_status']['Update'];

/**
 * Mark job as active (processing started)
 *
 * @param {Job<JobData>} job - BullMQ job instance
 * @returns {Promise<void>}
 */
export async function markJobActive(job: Job<JobData>): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();

    // ⭐ FIX: Check if job already in terminal state BEFORE any delays
    // This prevents trying to set started_at after completed_at/failed_at is already set
    // For fast-completing jobs, terminal state may be reached during the delay below
    const { data: quickCheck } = await supabase
      .from('job_status')
      .select('completed_at, failed_at, cancelled, status')
      .eq('job_id', job.id!)
      .maybeSingle();

    if (quickCheck?.completed_at || quickCheck?.failed_at || quickCheck?.cancelled) {
      logger.debug(
        {
          jobId: job.id,
          completedAt: quickCheck.completed_at,
          failedAt: quickCheck.failed_at,
          cancelled: quickCheck.cancelled,
          status: quickCheck.status,
        },
        'Skipping markJobActive - job already in terminal state'
      );
      return;
    }

    // Also check status field for terminal states
    if (quickCheck?.status === 'completed' || quickCheck?.status === 'failed') {
      logger.debug(
        {
          jobId: job.id,
          status: quickCheck.status,
        },
        'Skipping markJobActive - job status is terminal'
      );
      return;
    }

    // Delay MUST be significantly greater than markJobCompleted delay (300ms) to ensure completed jobs
    // are detected before we try to set started_at
    // This prevents started_at > completed_at constraint violations in fast-completing jobs
    // Increased to 500ms to provide sufficient buffer for concurrent job processing
    await new Promise(resolve => setTimeout(resolve, 500));

    // ⭐ CRITICAL: Check AGAIN after delay to catch jobs that completed during the delay
    // This is essential for very fast jobs like TEST_JOB that may complete in < 100ms
    const { data: postDelayCheck } = await supabase
      .from('job_status')
      .select('completed_at, failed_at, cancelled, status')
      .eq('job_id', job.id!)
      .maybeSingle();

    // Skip started_at update if job reached any terminal state during delay
    if (postDelayCheck?.completed_at || postDelayCheck?.failed_at || postDelayCheck?.cancelled) {
      logger.debug(
        {
          jobId: job.id,
          completedAt: postDelayCheck.completed_at,
          failedAt: postDelayCheck.failed_at,
          cancelled: postDelayCheck.cancelled,
          status: postDelayCheck.status,
        },
        'Skipping markJobActive - job reached terminal state during delay'
      );
      return;
    }

    // Also skip if status indicates terminal state
    if (postDelayCheck?.status === 'completed' || postDelayCheck?.status === 'failed') {
      logger.debug(
        {
          jobId: job.id,
          status: postDelayCheck.status,
        },
        'Skipping markJobActive - job status is terminal'
      );
      return;
    }

    // Check if job status already exists and get its current state
    const { data: existingStatus, error: fetchError } = await supabase
      .from('job_status')
      .select('started_at, created_at, completed_at, status, attempts')
      .eq('job_id', job.id!)
      .maybeSingle();

    if (fetchError) {
      logger.error(
        {
          jobId: job.id,
          err: fetchError,
        },
        'Database error fetching job status in markJobActive'
      );
      return; // Exit early on real database errors
    }

    if (!existingStatus) {
      logger.debug({ jobId: job.id }, 'Job status not yet created in markJobActive');
      return; // Skip update - status record doesn't exist yet
    }

    // Don't update to 'active' if job has already reached a terminal state
    // This prevents race conditions where the 'active' event handler runs after 'completed'
    if (existingStatus?.status === 'completed' || existingStatus?.status === 'failed') {
      logger.debug(
        {
          jobId: job.id,
          currentStatus: existingStatus.status,
        },
        'Skipping markJobActive - job already in terminal state'
      );
      return;
    }

    // CRITICAL: Don't update if completed_at is already set (job completed before active event fired)
    // This prevents started_at > completed_at constraint violations
    if (existingStatus?.completed_at) {
      logger.debug(
        {
          jobId: job.id,
          completedAt: existingStatus.completed_at,
        },
        'Skipping markJobActive - job already has completed_at timestamp'
      );
      return;
    }

    const currentAttempt = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts || 3;

    // GUARD: Don't record attempts that exceed max_attempts (database constraint)
    // This can happen if BullMQ fires 'active' event after job should have stopped
    if (currentAttempt > maxAttempts) {
      logger.warn(
        {
          jobId: job.id,
          currentAttempt,
          maxAttempts,
        },
        'Skipping markJobActive - attempt exceeds max_attempts (constraint guard)'
      );
      return;
    }

    // If this is a retry (attempt > 1) and we're still active from previous attempt,
    // we need to be extra careful with timestamps to avoid constraint violations
    const isRetry = currentAttempt > 1;
    if (isRetry && existingStatus?.status === 'active') {
      logger.debug(
        {
          jobId: job.id,
          currentAttempt,
          existingAttempts: existingStatus.attempts,
        },
        'Skipping markJobActive - job already active from previous attempt'
      );
      // Just update the attempt count without changing started_at
      await updateJobStatus(job.id!, {
        attempts: currentAttempt,
        error_message: null,
        error_stack: null,
      });
      return;
    }

    const updates: JobStatusUpdate = {
      status: JobStatus.ACTIVE,
      attempts: currentAttempt,
      error_message: null,
      error_stack: null,
    };

    // Only set started_at if it hasn't been set yet
    // For retries, keep the original started_at (when the job first started)
    // This prevents overwriting started_at after markJobCompleted sets it for fast jobs
    const shouldSetStartedAt = !existingStatus?.started_at;

    if (shouldSetStartedAt) {
      // Ensure started_at is strictly after created_at to satisfy database constraint
      const now = new Date();
      let startedAt = now;

      if (existingStatus?.created_at) {
        const createdAt = new Date(existingStatus.created_at);
        // If current time is before or equal to created_at, set started_at to created_at + appropriate offset
        // For retries, add more offset to avoid collisions
        const offsetMs = isRetry ? currentAttempt * 10 : 1;
        if (now <= createdAt) {
          startedAt = new Date(createdAt.getTime() + offsetMs);
        } else if (isRetry) {
          // Even if now > created_at, add a small offset for retries to ensure separation
          startedAt = new Date(now.getTime() + offsetMs);
        }
      }

      // ⭐ SAFETY CHECK T044.14: Re-check completed_at right before setting started_at
      // If completed_at was set by markJobCompleted while we were delayed, don't overwrite started_at
      const { data: finalCheck, error: finalCheckError } = await supabase
        .from('job_status')
        .select('completed_at')
        .eq('job_id', job.id!)
        .maybeSingle();

      if (finalCheckError) {
        logger.error(
          {
            jobId: job.id,
            err: finalCheckError,
          },
          'Database error in final check for markJobActive'
        );
        return; // Exit early on real database errors
      }

      if (!finalCheck) {
        logger.debug({ jobId: job.id }, 'Job status removed during final check in markJobActive');
        return; // Skip update - status record no longer exists
      }

      if (finalCheck?.completed_at) {
        const completedAt = new Date(finalCheck.completed_at);
        if (startedAt >= completedAt) {
          logger.warn(
            {
              jobId: job.id,
              attemptsMade: job.attemptsMade,
              currentAttempt,
              startedAt: startedAt.toISOString(),
              completedAt: completedAt.toISOString(),
            },
            'Skipping started_at - would violate constraint (completed_at already set)'
          );
          return;
        }
      }

      updates.started_at = startedAt;

      logger.debug(
        {
          jobId: job.id,
          attemptsMade: job.attemptsMade,
          currentAttempt,
          isRetry,
          startedAt: updates.started_at.toISOString(),
          createdAt: existingStatus?.created_at,
        },
        'Setting started_at for job'
      );
    } else {
      logger.debug(
        {
          jobId: job.id,
          attemptsMade: job.attemptsMade,
          existingStartedAt: existingStatus.started_at,
        },
        'Skipping started_at for job (already set)'
      );
    }

    // Use atomic database-level check to prevent overwriting completed jobs
    // The onlyIfNotCompleted option adds "WHERE completed_at IS NULL" to the UPDATE query
    // This ensures we never set started_at after completed_at has been set
    await updateJobStatus(job.id!, updates, { onlyIfNotCompleted: true });
  } catch (error) {
    logger.error(
      {
        jobId: job.id,
        err: error,
      },
      'Exception in markJobActive'
    );
  }
}

/**
 * Mark job as completed
 *
 * @param {Job<JobData>} job - BullMQ job instance
 * @returns {Promise<void>}
 */
export async function markJobCompleted(job: Job<JobData>): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();

    // Small delay to ensure any pending database writes (like markJobActive) complete first
    // This prevents race conditions where completed_at is set before started_at is written
    // Increased to 300ms to give markJobActive (50ms delay) enough time to complete
    await new Promise(resolve => setTimeout(resolve, 300));

    // Fetch existing started_at to ensure completed_at is after it
    const { data: existingStatus, error: fetchError } = await supabase
      .from('job_status')
      .select('started_at, created_at')
      .eq('job_id', job.id!)
      .maybeSingle();

    if (fetchError) {
      logger.error(
        {
          jobId: job.id,
          err: fetchError,
        },
        'Database error fetching job status in markJobCompleted'
      );
      return; // Exit early on real database errors
    }

    if (!existingStatus) {
      logger.debug({ jobId: job.id }, 'Job status not yet created in markJobCompleted');
      return; // Skip update - status record doesn't exist yet
    }

    // ⭐ FIX T044.14: If started_at not set, set it WITHOUT changing status to prevent race condition
    // Then set completed_at. This ensures the job goes through proper state transitions.
    if (!existingStatus?.started_at) {
      // Fast job - started_at not set yet
      const createdAt = new Date(existingStatus?.created_at || Date.now());
      const calculatedStartedAt = new Date(createdAt.getTime() + 1);

      logger.debug(
        {
          jobId: job.id,
          createdAt: createdAt.toISOString(),
          calculatedStartedAt: calculatedStartedAt.toISOString(),
        },
        'Setting started_at before completed_at (fast job)'
      );

      // Write started_at WITHOUT changing status
      // This allows markJobActive to see started_at is set and skip overwriting it
      await updateJobStatus(job.id!, {
        started_at: calculatedStartedAt,
      });

      // Update existingStatus to reflect the change
      if (existingStatus) {
        existingStatus.started_at = calculatedStartedAt.toISOString();
      }
    }

    const now = new Date();
    let completedAt = now;

    // Ensure completed_at is after started_at
    if (existingStatus?.started_at) {
      const startedAt = new Date(existingStatus.started_at);
      const minCompletedAt = new Date(startedAt.getTime() + 1);

      if (completedAt < minCompletedAt) {
        completedAt = minCompletedAt;
        logger.debug(
          {
            jobId: job.id,
            startedAt: startedAt.toISOString(),
            originalCompletedAt: now.toISOString(),
            adjustedCompletedAt: completedAt.toISOString(),
          },
          'Adjusted completed_at to be after started_at'
        );
      }
    }

    // Now set completed_at and status
    await updateJobStatus(job.id!, {
      status: JobStatus.COMPLETED,
      completed_at: completedAt,
      progress: { status: 'completed', percent: 100 },
    });
  } catch (error) {
    logger.error(
      {
        jobId: job.id,
        err: error,
      },
      'Exception in markJobCompleted'
    );
  }
}

/**
 * Mark job as cancelled (user-initiated)
 *
 * @param {string} jobId - Job ID
 * @param {string} [cancelledBy] - User ID who cancelled the job
 * @returns {Promise<void>}
 */
export async function markJobCancelled(jobId: string, cancelledBy?: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();

    // Small delay to ensure any pending database writes complete first
    // Reduced from 300ms to 50ms to avoid blocking the worker
    await new Promise(resolve => setTimeout(resolve, 50));

    // Fetch existing started_at to ensure failed_at is after it
    const { data: existingStatus, error: fetchError } = await supabase
      .from('job_status')
      .select('started_at, created_at')
      .eq('job_id', jobId)
      .maybeSingle();

    if (fetchError) {
      logger.error(
        {
          jobId,
          err: fetchError,
        },
        'Database error fetching job status in markJobCancelled'
      );
      return; // Exit early on real database errors
    }

    if (!existingStatus) {
      logger.debug({ jobId }, 'Job status not yet created in markJobCancelled');
      return; // Skip update - status record doesn't exist yet
    }

    const now = new Date();
    let failedAt = now;

    // CRITICAL: Always ensure failed_at is after started_at to satisfy database constraint
    if (existingStatus?.started_at) {
      const startedAt = new Date(existingStatus.started_at);
      // Add 1ms to started_at to ensure failed_at is strictly after
      const minFailedAt = new Date(startedAt.getTime() + 1);

      if (now < minFailedAt) {
        failedAt = minFailedAt;
        logger.debug(
          {
            jobId,
            startedAt: startedAt.toISOString(),
            originalFailedAt: now.toISOString(),
            adjustedFailedAt: failedAt.toISOString(),
          },
          'Adjusted failed_at to be after started_at for cancelled job'
        );
      }
    } else if (existingStatus?.created_at) {
      // If started_at is not set yet, ensure failed_at is after created_at
      const createdAt = new Date(existingStatus.created_at);
      if (now <= createdAt) {
        failedAt = new Date(createdAt.getTime() + 2); // created_at + 2ms to leave room for started_at
        logger.debug(
          {
            jobId,
            createdAt: createdAt.toISOString(),
            originalFailedAt: now.toISOString(),
            adjustedFailedAt: failedAt.toISOString(),
          },
          'Adjusted failed_at to be after created_at for cancelled job (no started_at yet)'
        );
      }
    }

    const updates: JobStatusDbUpdate = {
      status: 'failed', // Use 'failed' status but with cancelled flag
      cancelled: true,
      error_message: 'Job cancelled by user request',
      failed_at: failedAt.toISOString(),
      cancelled_at: failedAt.toISOString(), // Set cancelled_at to the same time as failed_at
      updated_at: new Date().toISOString(),
    };

    // Only set cancelled_by if it was provided
    if (cancelledBy) {
      updates.cancelled_by = cancelledBy;
    }

    const { error } = await supabase.from('job_status').update(updates).eq('job_id', jobId);

    if (error) {
      logger.error(
        {
          jobId,
          cancelledBy,
          err: error.message,
        },
        'Failed to mark job as cancelled'
      );
      return;
    }

    logger.info(
      {
        jobId,
        cancelledBy,
      },
      'Job marked as cancelled in database'
    );
  } catch (error) {
    logger.error(
      {
        jobId,
        cancelledBy,
        err: error,
      },
      'Exception marking job as cancelled'
    );
  }
}

/**
 * Mark job as failed
 *
 * @param {Job<JobData>} job - BullMQ job instance
 * @param {Error} error - Error that caused failure
 * @returns {Promise<void>}
 */
export async function markJobFailed(job: Job<JobData>, error: Error): Promise<void> {
  try {
    // BullMQ fires 'failed' event after incrementing attemptsMade
    // So job.attemptsMade is the number of attempts that have been made (including this one)
    // If attemptsMade >= opts.attempts, this is the final failure (no more retries)
    const maxAttempts = job.opts.attempts || 3;
    const isFinalFailure = job.attemptsMade >= maxAttempts;

    // GUARD: Clamp attempts to max_attempts to satisfy database constraint
    // This handles edge cases where BullMQ might report more attempts than expected
    const clampedAttempts = Math.min(job.attemptsMade, maxAttempts);

    // Extract error message with proper fallback chain
    let errorMessage = 'Unknown error';
    if (error && typeof error === 'object') {
      if (error.message) {
        errorMessage = error.message;
      } else if (
        error.cause &&
        typeof error.cause === 'object' &&
        'message' in error.cause &&
        typeof (error.cause as { message: unknown }).message === 'string'
      ) {
        errorMessage = (error.cause as { message: string }).message;
      } else if (error.toString && error.toString() !== '[object Object]') {
        errorMessage = error.toString();
      }
    } else if (error) {
      errorMessage = String(error);
    }

    const updates: JobStatusUpdate = {
      status: isFinalFailure ? JobStatus.FAILED : JobStatus.DELAYED,
      error_message: errorMessage,
      error_stack: error.stack || undefined,
      attempts: clampedAttempts,
    };

    if (isFinalFailure) {
      const supabase = getSupabaseAdmin();

      // Small delay to ensure any pending database writes complete first
      // Increased to 300ms to give markJobActive (50ms delay) enough time to complete
      await new Promise(resolve => setTimeout(resolve, 300));

      // Fetch existing started_at to ensure failed_at is after it
      const { data: existingStatus, error: fetchError } = await supabase
        .from('job_status')
        .select('started_at, created_at')
        .eq('job_id', job.id!)
        .maybeSingle();

      if (fetchError) {
        logger.error(
          {
            jobId: job.id,
            err: fetchError,
          },
          'Database error fetching job status in markJobFailed'
        );
        return; // Exit early on real database errors
      }

      if (!existingStatus) {
        logger.debug({ jobId: job.id }, 'Job status not yet created in markJobFailed');
        return; // Skip update - status record doesn't exist yet
      }

      const now = new Date();
      let failedAt = now;

      // CRITICAL: Always ensure failed_at is after started_at to satisfy database constraint
      if (existingStatus?.started_at) {
        const startedAt = new Date(existingStatus.started_at);
        // Add 1ms to started_at to ensure failed_at is strictly after
        const minFailedAt = new Date(startedAt.getTime() + 1);

        if (now < minFailedAt) {
          failedAt = minFailedAt;
          logger.debug(
            {
              jobId: job.id,
              startedAt: startedAt.toISOString(),
              originalFailedAt: now.toISOString(),
              adjustedFailedAt: failedAt.toISOString(),
            },
            'Adjusted failed_at to be after started_at'
          );
        }
      } else if (existingStatus?.created_at) {
        // If started_at is not set yet, ensure failed_at is after created_at
        const createdAt = new Date(existingStatus.created_at);
        if (now <= createdAt) {
          failedAt = new Date(createdAt.getTime() + 2); // created_at + 2ms to leave room for started_at
          logger.debug(
            {
              jobId: job.id,
              createdAt: createdAt.toISOString(),
              originalFailedAt: now.toISOString(),
              adjustedFailedAt: failedAt.toISOString(),
            },
            'Adjusted failed_at to be after created_at (no started_at yet)'
          );
        }
      }

      updates.failed_at = failedAt;
    }

    await updateJobStatus(job.id!, updates);
  } catch (error: unknown) {
    logger.error(
      {
        jobId: job.id,
        err: error,
      },
      'Exception in markJobFailed'
    );
  }
}
