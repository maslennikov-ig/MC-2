/**
 * Course Generation Pause Check Utility
 *
 * Shared utility for checking and handling pause state across all stages.
 * This module provides functions to check if a course is paused and delay
 * BullMQ jobs accordingly.
 *
 * @module shared/pause-check
 */

import { Job, DelayedError } from 'bullmq';
import { logger } from './logger';
import { getSupabaseAdmin } from './supabase/admin';

/** How long to delay a job when paused (default 30 seconds, configurable via env) */
export const PAUSE_DELAY_MS = parseInt(process.env.PAUSE_DELAY_MS || '30000', 10);

/**
 * Check if course generation is paused by querying the generation_paused_at column.
 * Returns true if the course is currently paused, false otherwise.
 *
 * Note: This is a non-locking read. There is a small theoretical race window
 * where a pause could be set between this check and job processing.
 * This is acceptable: jobs that start during pause will complete normally,
 * and subsequent jobs will be delayed. The pause RPC uses FOR UPDATE for
 * atomic state changes.
 *
 * @param courseId - The course ID to check pause status for
 * @returns true if paused, false otherwise
 */
export async function isCoursePaused(courseId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    // Query the generation_paused_at column to check pause status
    const { data, error } = await supabase
      .from('courses')
      .select('generation_paused_at')
      .eq('id', courseId)
      .single();

    if (error) {
      logger.warn({ courseId, error: error.message }, 'Failed to check pause status');
      return false;
    }

    // Course is paused if generation_paused_at is not null
    return data?.generation_paused_at !== null;
  } catch (err) {
    logger.warn(
      { courseId, error: err instanceof Error ? err.message : String(err) },
      'Exception checking pause status'
    );
    return false;
  }
}

/**
 * Check if course is paused and delay the job if so.
 *
 * NOTE: This check only happens at the START of job processing.
 * If a job is already running when the user pauses, it will continue
 * to completion. New jobs will be delayed until the course is resumed.
 *
 * @param job - The BullMQ job to delay
 * @param courseId - The course ID to check pause status for
 * @param token - Job token for lock management (required for moveToDelayed, validated at runtime)
 * @throws DelayedError if the job was moved to delayed state
 * @throws Error if token is missing when pause is needed
 */
export async function checkPauseAndDelay(
  job: Job,
  courseId: string,
  token?: string
): Promise<void> {
  const isPaused = await isCoursePaused(courseId);

  if (isPaused) {
    // Token is required for moveToDelayed
    // BullMQ types say token is optional, but it's required for proper lock management
    if (!token) {
      logger.error({ jobId: job.id, courseId }, 'Cannot delay job: token is missing');
      throw new Error('Job token is required for pause/delay operations');
    }

    logger.info(
      { jobId: job.id, courseId, jobType: job.name },
      'Course generation is paused, delaying job'
    );

    // Move job to delayed state - it will be picked up again after PAUSE_DELAY_MS
    await job.moveToDelayed(Date.now() + PAUSE_DELAY_MS, token);

    // Throw DelayedError to signal the worker that the job was delayed
    throw new DelayedError();
  }
}
