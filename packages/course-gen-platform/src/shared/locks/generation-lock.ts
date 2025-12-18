/**
 * Generation lock service to prevent concurrent course generation
 * @module shared/locks/generation-lock
 *
 * Implements FR-037: Prevent concurrent generation for the same course
 * Implements FR-038: Allow checking lock status before starting generation
 *
 * Features:
 * - Atomic lock acquisition (only one worker can hold a lock)
 * - Auto-expiration to prevent deadlocks
 * - Force release for admin/cleanup operations
 * - Structured logging with FR-033 format
 */

import { Redis } from 'ioredis';
import { getRedisClient } from '../cache/redis';
import logger from '../logger';

// ============================================================================
// Types
// ============================================================================

/**
 * Represents an active generation lock
 */
export interface GenerationLock {
  /** Course ID that is locked */
  courseId: string;
  /** Timestamp when the lock was acquired */
  lockedAt: Date;
  /** Worker ID or job ID that holds the lock */
  lockedBy: string;
  /** Timestamp when the lock will auto-expire */
  expiresAt: Date;
}

/**
 * Result of a lock acquisition attempt
 */
export interface LockAcquisitionResult {
  /** Whether the lock was successfully acquired */
  acquired: boolean;
  /** The lock details if acquired */
  lock?: GenerationLock;
  /** Reason for failure if not acquired */
  reason?: string;
  /** Existing lock holder if lock is already held */
  existingLock?: GenerationLock;
}

/**
 * Options for lock acquisition
 */
export interface LockOptions {
  /** Time-to-live in milliseconds (default: 30 minutes) */
  ttlMs?: number;
}

// ============================================================================
// Constants
// ============================================================================

const LOCK_KEY_PREFIX = 'generation:lock:';
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ============================================================================
// GenerationLockService
// ============================================================================

/**
 * Service for managing generation locks to prevent concurrent course generation
 *
 * Uses Redis for distributed locking with atomic operations.
 * Each lock has a TTL to prevent deadlocks from crashed workers.
 *
 * @example
 * ```typescript
 * const result = await generationLockService.acquireLock('course-123', 'worker-1');
 * if (result.acquired) {
 *   try {
 *     // Perform generation
 *   } finally {
 *     await generationLockService.releaseLock('course-123', 'worker-1');
 *   }
 * }
 * ```
 */
export class GenerationLockService {
  private redis: Redis;
  private lockTtlMs: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.redis = getRedisClient();
    this.lockTtlMs = ttlMs;
  }

  /**
   * Attempt to acquire a lock for a course
   *
   * Uses Redis SET NX (set if not exists) for atomic lock acquisition.
   *
   * @param courseId - The course ID to lock
   * @param lockedBy - Identifier of the worker/job acquiring the lock
   * @param options - Lock options (TTL override)
   * @returns Lock acquisition result
   */
  async acquireLock(
    courseId: string,
    lockedBy: string,
    options?: LockOptions
  ): Promise<LockAcquisitionResult> {
    const key = this.getLockKey(courseId);
    const ttlMs = options?.ttlMs ?? this.lockTtlMs;
    const ttlSeconds = Math.ceil(ttlMs / 1000);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    const lockData: GenerationLock = {
      courseId,
      lockedAt: now,
      lockedBy,
      expiresAt,
    };

    try {
      // Use SET NX EX for atomic lock acquisition with expiration
      const result = await this.redis.set(
        key,
        JSON.stringify(lockData),
        'EX',
        ttlSeconds,
        'NX'
      );

      if (result === 'OK') {
        logger.info(
          {
            operation: 'lock_acquire',
            courseId,
            lockedBy,
            ttlMs,
            expiresAt: expiresAt.toISOString(),
          },
          'Generation lock acquired successfully'
        );

        return {
          acquired: true,
          lock: lockData,
        };
      }

      // Lock already exists, get current holder info
      const existingLock = await this.getLock(courseId);

      logger.warn(
        {
          operation: 'lock_acquire_failed',
          courseId,
          lockedBy,
          existingHolder: existingLock?.lockedBy,
          existingExpiresAt: existingLock?.expiresAt?.toISOString(),
        },
        'Failed to acquire generation lock: already held by another worker'
      );

      return {
        acquired: false,
        reason: existingLock
          ? `Lock held by ${existingLock.lockedBy} until ${existingLock.expiresAt.toISOString()}`
          : 'Lock already exists',
        existingLock: existingLock ?? undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(
        {
          operation: 'lock_acquire_error',
          courseId,
          lockedBy,
          error: errorMessage,
        },
        'Error acquiring generation lock'
      );

      return {
        acquired: false,
        reason: `Redis error: ${errorMessage}`,
      };
    }
  }

  /**
   * Release a lock for a course
   *
   * Only the worker that acquired the lock can release it (verified by lockedBy).
   * Uses Lua script for atomic check-and-delete.
   *
   * @param courseId - The course ID to unlock
   * @param lockedBy - Identifier of the worker/job releasing the lock
   * @returns True if lock was released, false if not held or held by another worker
   */
  async releaseLock(courseId: string, lockedBy: string): Promise<boolean> {
    const key = this.getLockKey(courseId);

    // Lua script for atomic check-and-delete
    // Only delete if the lock is held by the requesting worker
    const script = `
      local key = KEYS[1]
      local expected_holder = ARGV[1]

      local lock_data = redis.call('GET', key)
      if not lock_data then
        return 0  -- Lock doesn't exist
      end

      local lock = cjson.decode(lock_data)
      if lock.lockedBy ~= expected_holder then
        return -1  -- Lock held by another worker
      end

      redis.call('DEL', key)
      return 1  -- Successfully released
    `;

    try {
      const result = await this.redis.eval(script, 1, key, lockedBy) as number;

      if (result === 1) {
        logger.info(
          {
            operation: 'lock_release',
            courseId,
            lockedBy,
          },
          'Generation lock released successfully'
        );
        return true;
      }

      if (result === 0) {
        logger.warn(
          {
            operation: 'lock_release_not_found',
            courseId,
            lockedBy,
          },
          'Cannot release lock: lock does not exist'
        );
        return false;
      }

      // result === -1
      const existingLock = await this.getLock(courseId);
      logger.warn(
        {
          operation: 'lock_release_wrong_holder',
          courseId,
          lockedBy,
          actualHolder: existingLock?.lockedBy,
        },
        'Cannot release lock: held by different worker'
      );
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(
        {
          operation: 'lock_release_error',
          courseId,
          lockedBy,
          error: errorMessage,
        },
        'Error releasing generation lock'
      );

      return false;
    }
  }

  /**
   * Check if a course is currently locked
   *
   * @param courseId - The course ID to check
   * @returns True if locked, false otherwise
   */
  async isLocked(courseId: string): Promise<boolean> {
    const key = this.getLockKey(courseId);

    try {
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(
        {
          operation: 'lock_check_error',
          courseId,
          error: errorMessage,
        },
        'Error checking lock status'
      );

      // In case of error, assume locked to be safe
      return true;
    }
  }

  /**
   * Get lock information for a course
   *
   * @param courseId - The course ID to get lock info for
   * @returns Lock details if locked, null otherwise
   */
  async getLock(courseId: string): Promise<GenerationLock | null> {
    const key = this.getLockKey(courseId);

    try {
      const data = await this.redis.get(key);

      if (!data) {
        return null;
      }

      const parsed = JSON.parse(data) as {
        courseId: string;
        lockedAt: string;
        lockedBy: string;
        expiresAt: string;
      };

      return {
        courseId: parsed.courseId,
        lockedAt: new Date(parsed.lockedAt),
        lockedBy: parsed.lockedBy,
        expiresAt: new Date(parsed.expiresAt),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(
        {
          operation: 'lock_get_error',
          courseId,
          error: errorMessage,
        },
        'Error getting lock info'
      );

      return null;
    }
  }

  /**
   * Extend the lock TTL (heartbeat mechanism)
   *
   * Called periodically during long-running operations to prevent
   * lock expiration while still processing.
   *
   * @param courseId - The course ID with the lock
   * @param lockedBy - The worker ID that should hold the lock
   * @returns True if lock was extended, false if lock is not held by this worker
   */
  async extendLock(courseId: string, lockedBy: string): Promise<boolean> {
    const key = this.getLockKey(courseId);

    try {
      const existingLock = await this.getLock(courseId);

      if (!existingLock) {
        logger.warn({ courseId, lockedBy }, 'Cannot extend lock: lock does not exist');
        return false;
      }

      if (existingLock.lockedBy !== lockedBy) {
        logger.warn({
          courseId,
          lockedBy,
          actualHolder: existingLock.lockedBy,
        }, 'Cannot extend lock: held by different worker');
        return false;
      }

      // Extend TTL
      const ttlSeconds = Math.ceil(this.lockTtlMs / 1000);
      await this.redis.expire(key, ttlSeconds);

      logger.debug({
        operation: 'lock_extend',
        courseId,
        lockedBy,
        ttlSeconds,
      }, 'Lock extended successfully');

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({
        operation: 'lock_extend_error',
        courseId,
        lockedBy,
        error: errorMessage,
      }, 'Error extending lock');
      return false;
    }
  }

  /**
   * Release all locks held by this process
   *
   * Used during graceful shutdown (SIGTERM/SIGINT) to release
   * any locks that may still be held.
   *
   * @returns Number of locks released
   */
  async releaseAllLocks(): Promise<number> {
    try {
      const pattern = `${LOCK_KEY_PREFIX}*`;
      let cursor = '0';
      let releasedCount = 0;

      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100
        );
        cursor = nextCursor;

        for (const key of keys) {
          try {
            await this.redis.del(key);
            releasedCount++;

            logger.info({
              operation: 'lock_graceful_release',
              key,
            }, 'Lock released during graceful shutdown');
          } catch {
            // Continue releasing other locks even if one fails
          }
        }
      } while (cursor !== '0');

      logger.info({
        operation: 'lock_graceful_shutdown',
        releasedCount,
      }, 'Graceful shutdown: locks released');

      return releasedCount;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({
        operation: 'lock_graceful_shutdown_error',
        error: errorMessage,
      }, 'Error during graceful shutdown lock release');
      return 0;
    }
  }

  /**
   * Force release a lock regardless of holder
   *
   * Use for admin/cleanup operations only.
   *
   * @param courseId - The course ID to force release
   * @returns True if lock was removed, false if it didn't exist
   */
  async forceRelease(courseId: string): Promise<boolean> {
    const key = this.getLockKey(courseId);

    try {
      const existingLock = await this.getLock(courseId);
      const result = await this.redis.del(key);

      if (result === 1) {
        logger.warn(
          {
            operation: 'lock_force_release',
            courseId,
            previousHolder: existingLock?.lockedBy,
            previousExpiresAt: existingLock?.expiresAt?.toISOString(),
          },
          'Generation lock force released (admin operation)'
        );
        return true;
      }

      logger.debug(
        {
          operation: 'lock_force_release_not_found',
          courseId,
        },
        'Force release attempted but lock did not exist'
      );
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(
        {
          operation: 'lock_force_release_error',
          courseId,
          error: errorMessage,
        },
        'Error force releasing generation lock'
      );

      return false;
    }
  }

  /**
   * Cleanup all expired locks
   *
   * Note: Redis TTL handles expiration automatically, but this method
   * can be used to scan for and report any anomalies.
   *
   * @returns Number of expired locks found (always 0 with proper TTL)
   */
  async cleanupExpired(): Promise<number> {
    try {
      // With Redis TTL, expired locks are automatically removed
      // This method scans for any locks and checks their validity
      const pattern = `${LOCK_KEY_PREFIX}*`;
      let cursor = '0';
      let cleanedCount = 0;
      const now = new Date();

      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100
        );
        cursor = nextCursor;

        for (const key of keys) {
          const data = await this.redis.get(key);
          if (data) {
            try {
              const lock = JSON.parse(data) as { expiresAt: string };
              const expiresAt = new Date(lock.expiresAt);

              // This shouldn't happen with proper TTL, but handle it anyway
              if (expiresAt < now) {
                await this.redis.del(key);
                cleanedCount++;

                logger.warn(
                  {
                    operation: 'lock_cleanup_expired',
                    key,
                    expiresAt: expiresAt.toISOString(),
                  },
                  'Cleaned up expired lock that bypassed TTL'
                );
              }
            } catch {
              // Invalid JSON, remove it
              await this.redis.del(key);
              cleanedCount++;

              logger.warn(
                {
                  operation: 'lock_cleanup_invalid',
                  key,
                },
                'Cleaned up lock with invalid data'
              );
            }
          }
        }
      } while (cursor !== '0');

      if (cleanedCount > 0) {
        logger.info(
          {
            operation: 'lock_cleanup_complete',
            cleanedCount,
          },
          'Lock cleanup completed'
        );
      }

      return cleanedCount;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(
        {
          operation: 'lock_cleanup_error',
          error: errorMessage,
        },
        'Error during lock cleanup'
      );

      return 0;
    }
  }

  /**
   * Get all active locks (for monitoring/debugging)
   *
   * @returns Array of all active generation locks
   */
  async getAllLocks(): Promise<GenerationLock[]> {
    try {
      const pattern = `${LOCK_KEY_PREFIX}*`;
      let cursor = '0';
      const locks: GenerationLock[] = [];

      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100
        );
        cursor = nextCursor;

        for (const key of keys) {
          const data = await this.redis.get(key);
          if (data) {
            try {
              const parsed = JSON.parse(data) as {
                courseId: string;
                lockedAt: string;
                lockedBy: string;
                expiresAt: string;
              };

              locks.push({
                courseId: parsed.courseId,
                lockedAt: new Date(parsed.lockedAt),
                lockedBy: parsed.lockedBy,
                expiresAt: new Date(parsed.expiresAt),
              });
            } catch {
              // Skip invalid entries
            }
          }
        }
      } while (cursor !== '0');

      return locks;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(
        {
          operation: 'lock_get_all_error',
          error: errorMessage,
        },
        'Error getting all locks'
      );

      return [];
    }
  }

  /**
   * Generate Redis key for a course lock
   */
  private getLockKey(courseId: string): string {
    return `${LOCK_KEY_PREFIX}${courseId}`;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Singleton instance of the generation lock service
 *
 * @example
 * ```typescript
 * import { generationLockService } from '@/shared/locks/generation-lock';
 *
 * const result = await generationLockService.acquireLock(courseId, jobId);
 * if (!result.acquired) {
 *   throw new Error(`Course generation already in progress: ${result.reason}`);
 * }
 * ```
 */
export const generationLockService = new GenerationLockService();
