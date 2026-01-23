import { generationLockService } from './generation-lock';
import type { Logger } from 'pino';

const MAX_HEARTBEAT_FAILURES = 3;
const HEARTBEAT_INTERVAL_MS = 120000; // 2 minutes

export interface LockGuard {
  heartbeatInterval: NodeJS.Timeout;
  lockId: string;
  release: () => Promise<void>;
}

/**
 * Acquire generation lock with automatic heartbeat and failure tracking
 *
 * This utility combines lock acquisition, heartbeat maintenance, and cleanup
 * into a single interface. It tracks heartbeat failures and logs warnings
 * when the lock may expire before job completion.
 *
 * @param courseId - Course being processed
 * @param lockId - Unique lock identifier (e.g., `stage-4-${job.id}`)
 * @param logger - Pino logger instance
 * @returns LockGuard with interval handle and release function
 * @throws Error if lock acquisition fails
 *
 * @example
 * ```typescript
 * const guard = await acquireGenerationLock(courseId, `stage-4-${job.id}`, logger);
 * try {
 *   // ... do work ...
 *   clearInterval(guard.heartbeatInterval);
 * } finally {
 *   await guard.release();
 * }
 * ```
 */
export async function acquireGenerationLock(
  courseId: string,
  lockId: string,
  logger: Logger
): Promise<LockGuard> {
  const lockResult = await generationLockService.acquireLock(courseId, lockId);
  if (!lockResult.acquired) {
    logger.warn({ courseId, reason: lockResult.reason }, 'Failed to acquire generation lock');
    throw new Error(`Course ${courseId} is already being processed: ${lockResult.reason}`);
  }

  let heartbeatFailures = 0;

  const heartbeatInterval = setInterval(() => {
    void (async () => {
      try {
        const extended = await generationLockService.extendLock(courseId, lockId);
        if (!extended) {
          heartbeatFailures++;
          logger.warn(
            { courseId, lockId, failureCount: heartbeatFailures },
            'Heartbeat: lock extension failed'
          );

          if (heartbeatFailures >= MAX_HEARTBEAT_FAILURES) {
            logger.error(
              { courseId, lockId, failureCount: heartbeatFailures },
              'Heartbeat: max failures reached - lock may expire before job completes'
            );
          }
        } else {
          heartbeatFailures = 0; // Reset on success
          logger.debug({ courseId, lockId }, 'Heartbeat: lock extended');
        }
      } catch (err) {
        heartbeatFailures++;
        logger.error(
          { courseId, lockId, error: err, failureCount: heartbeatFailures },
          'Heartbeat error'
        );

        if (heartbeatFailures >= MAX_HEARTBEAT_FAILURES) {
          logger.error(
            { courseId, lockId, failureCount: heartbeatFailures },
            'Heartbeat: max errors reached - lock may expire before job completes'
          );
        }
      }
    })();
  }, HEARTBEAT_INTERVAL_MS);

  return {
    heartbeatInterval,
    lockId,
    release: async () => {
      clearInterval(heartbeatInterval);
      await generationLockService.releaseLock(courseId, lockId);
    },
  };
}
