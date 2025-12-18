/**
 * Open edX Import Status Poller
 * @module integrations/lms/openedx/api/poller
 *
 * Poll import status until terminal state (SUCCESS or FAILURE).
 * Supports progress callbacks and configurable timeout.
 */

import { OpenEdXImportError, LMSTimeoutError } from '@megacampus/shared-types/lms/errors';
import { lmsLogger } from '../../logger';
import type { OpenEdXClient } from './client';
import type { ImportStatus, ImportResult } from './types';

/**
 * Polling configuration options
 */
export interface PollOptions {
  /**
   * Maximum polling attempts before timeout
   * @default 60
   */
  maxAttempts?: number;

  /**
   * Interval between poll requests in milliseconds
   * @default 5000
   */
  intervalMs?: number;

  /**
   * Progress callback invoked after each status check
   * Receives current import status
   */
  onProgress?: (status: ImportStatus) => void;

  /**
   * Course ID for URL construction
   */
  courseId?: string;
}

/**
 * Terminal states that end polling
 */
const TERMINAL_STATES = new Set(['SUCCESS', 'FAILURE']);

/**
 * Poll import status until completion or failure
 *
 * Polls Open edX import status endpoint at regular intervals until:
 * - Import completes successfully (state: SUCCESS)
 * - Import fails (state: FAILURE)
 * - Maximum attempts reached (timeout)
 *
 * Invokes progress callback after each status check if provided.
 *
 * @param client - Open edX API client instance
 * @param taskId - Import task ID from importCourse()
 * @param options - Polling configuration
 * @returns Final import result
 * @throws {OpenEdXImportError} If import fails
 * @throws {LMSTimeoutError} If polling exceeds maxAttempts
 *
 * @example
 * ```typescript
 * const result = await pollImportStatus(client, taskId, {
 *   maxAttempts: 60,
 *   intervalMs: 5000,
 *   onProgress: (status) => {
 *     console.log(`Progress: ${status.progress_percent}%`);
 *   }
 * });
 *
 * if (result.success) {
 *   console.log(`Course imported: ${result.courseUrl}`);
 * }
 * ```
 */
export async function pollImportStatus(
  client: OpenEdXClient,
  taskId: string,
  options: PollOptions = {}
): Promise<ImportResult> {
  const {
    maxAttempts = 60,
    intervalMs = 5000,
    onProgress,
  } = options;

  lmsLogger.info(
    { taskId, maxAttempts, intervalMs },
    'Starting import status polling'
  );

  const startTime = Date.now();
  let attempt = 0;
  let lastStatus: ImportStatus | null = null;

  while (attempt < maxAttempts) {
    attempt++;

    try {
      // Query current status
      const status = await client.getImportStatus(taskId);
      lastStatus = status;

      lmsLogger.debug(
        {
          taskId,
          attempt,
          state: status.state,
          progress: status.progress_percent,
          message: status.message,
        },
        'Import status poll result'
      );

      // Invoke progress callback
      if (onProgress) {
        try {
          onProgress(status);
        } catch (error) {
          lmsLogger.warn(
            { error, taskId },
            'Progress callback threw error (ignored)'
          );
        }
      }

      // Check for terminal state
      if (TERMINAL_STATES.has(status.state)) {
        const duration = Date.now() - startTime;

        if (status.state === 'SUCCESS') {
          const courseKey = status.course_key;
          const courseUrl = courseKey ? client.getCourseUrl(courseKey) : null;

          lmsLogger.info(
            { taskId, courseKey, durationMs: duration, attempts: attempt },
            'Import completed successfully'
          );

          return {
            success: true,
            courseKey,
            courseUrl,
            error: null,
            state: status.state,
            taskId,
          };
        }

        // FAILURE state
        const errorMessage = status.error_message || status.message || 'Import failed';

        lmsLogger.error(
          { taskId, errorMessage, durationMs: duration, attempts: attempt },
          'Import failed'
        );

        throw new OpenEdXImportError(
          `Course import failed: ${errorMessage}`,
          taskId,
          status.state
        );
      }

      // Not terminal - wait before next poll
      if (attempt < maxAttempts) {
        await sleep(intervalMs);
      }
    } catch (error) {
      // Re-throw LMS errors
      if (
        error instanceof OpenEdXImportError ||
        error instanceof LMSTimeoutError
      ) {
        throw error;
      }

      // Log and continue polling for transient errors
      lmsLogger.warn(
        { error, taskId, attempt },
        'Status poll request failed, will retry'
      );

      // Wait before retry
      if (attempt < maxAttempts) {
        await sleep(intervalMs);
      }
    }
  }

  // Timeout - max attempts exceeded
  const duration = Date.now() - startTime;

  lmsLogger.error(
    {
      taskId,
      maxAttempts,
      durationMs: duration,
      lastState: lastStatus?.state,
      lastProgress: lastStatus?.progress_percent,
    },
    'Import status polling timeout'
  );

  throw new LMSTimeoutError(
    `Import status polling timed out after ${maxAttempts} attempts (${duration}ms)`,
    'openedx',
    duration,
    'poll'
  );
}

/**
 * Sleep utility for polling intervals
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Estimate remaining time based on progress
 *
 * Provides rough ETA for import completion.
 *
 * @param status - Current import status
 * @param elapsedMs - Elapsed time since import start
 * @returns Estimated remaining time in milliseconds, or null if unknown
 */
export function estimateRemainingTime(
  status: ImportStatus,
  elapsedMs: number
): number | null {
  if (!status.progress_percent || status.progress_percent <= 0) {
    return null;
  }

  const progressFraction = status.progress_percent / 100;
  const totalEstimatedMs = elapsedMs / progressFraction;
  const remainingMs = totalEstimatedMs - elapsedMs;

  return Math.max(0, Math.round(remainingMs));
}

/**
 * Format duration for human-readable display
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string (e.g., "2m 30s")
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${seconds}s`;
}
