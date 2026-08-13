/**
 * Redis Cleanup Utility for Course Deletion
 *
 * Cleans up Redis keys associated with a deleted course.
 * Uses SCAN for production-safe key iteration (no KEYS blocking).
 *
 * @module shared/cleanup/redis-cleanup
 */

import { getRedisClient } from '../cache/redis';
import { logger } from '../logger/index.js';

/**
 * Result of Redis cleanup operation
 */
export interface RedisCleanupResult {
  /** Whether cleanup succeeded */
  success: boolean;
  /** Number of keys deleted */
  keysDeleted: number;
  /** Patterns that were cleaned */
  patternsProcessed: string[];
  /** Error message if failed */
  error?: string;
}

/**
 * Scan and delete keys matching a pattern using SCAN (production-safe)
 *
 * @param pattern - Redis key pattern (e.g., "prefix:*")
 * @returns Number of keys deleted
 */
async function scanAndDelete(pattern: string): Promise<number> {
  const redis = getRedisClient();
  let cursor = '0';
  let totalDeleted = 0;

  do {
    // SCAN returns [cursor: string, keys: string[]]
    const [nextCursor, keys]: [string, string[]] = await redis.scan(
      cursor,
      'MATCH',
      pattern,
      'COUNT',
      100
    );
    cursor = nextCursor;

    if (keys.length > 0) {
      await redis.del(...keys);
      totalDeleted += keys.length;
    }
  } while (cursor !== '0');

  return totalDeleted;
}

/**
 * Clean up all Redis keys associated with a course
 *
 * Patterns cleaned:
 * - idempotency:*{courseId}* (every idempotency key naming the course)
 * - rag:{courseId}:* (RAG context cache)
 * - doc_class:v*:{courseId}:* (document classification cache)
 * - file_cache:{courseId}:*, lesson_md:{courseId}:*
 * - phase1_cache:{courseId} (Stage 4 phase-1 result)
 *
 * @param courseId - Course UUID to clean up
 * @returns Cleanup result with count of deleted keys
 *
 * @example
 * ```typescript
 * const result = await cleanupRedisForCourse('123e4567-e89b-12d3-a456-426614174000');
 * console.log(`Deleted ${result.keysDeleted} Redis keys`);
 * ```
 */
export async function cleanupRedisForCourse(courseId: string): Promise<RedisCleanupResult> {
  const patterns = [
    // The course id sits in the middle of most idempotency keys, not after a
    // fixed `generation-` prefix: Stage 4 writes
    // `idempotency:worker-fallback-stage4-auto-{courseId}-stage4` and Stage 6
    // writes `idempotency:auto-{courseId}-stage6-lesson-{lessonId}`. Anchoring
    // on that prefix left both behind on a deleted course.
    `idempotency:*${courseId}*`,
    `rag:${courseId}:*`,
    `doc_class:v*:${courseId}:*`,
    `file_cache:${courseId}:*`,
    `lesson_md:${courseId}:*`,
    `phase1_cache:${courseId}`,
  ];

  logger.info(
    {
      courseId,
      patterns,
    },
    '[Redis Cleanup] Starting course cleanup'
  );

  let totalDeleted = 0;
  const processedPatterns: string[] = [];

  try {
    for (const pattern of patterns) {
      const deleted = await scanAndDelete(pattern);
      totalDeleted += deleted;
      processedPatterns.push(pattern);

      if (deleted > 0) {
        logger.debug(
          {
            pattern,
            deleted,
          },
          '[Redis Cleanup] Pattern cleaned'
        );
      }
    }

    logger.info(
      {
        courseId,
        totalDeleted,
      },
      '[Redis Cleanup] Course cleanup complete'
    );

    return {
      success: true,
      keysDeleted: totalDeleted,
      patternsProcessed: processedPatterns,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        courseId,
        error: errorMessage,
        processedPatterns,
        totalDeleted,
      },
      '[Redis Cleanup] Course cleanup failed'
    );

    return {
      success: false,
      keysDeleted: totalDeleted,
      patternsProcessed: processedPatterns,
      error: errorMessage,
    };
  }
}
