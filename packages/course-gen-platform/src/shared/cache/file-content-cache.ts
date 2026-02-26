/**
 * File Content Cache - Redis cache-aside for file/lesson content
 *
 * Write-side caching: Stage 2 caches file markdown/processed content,
 * Stage 6 caches lesson markdown. Stage 7 reads from cache first.
 *
 * All operations are fire-and-forget on write (never throw),
 * return null on cache miss/error for reads.
 *
 * @module shared/cache/file-content-cache
 */

import { getRedisClient } from './redis';
import { logger } from '../logger/index.js';

/** Cache TTL: 4 hours in seconds */
const CACHE_TTL_SECONDS = 4 * 60 * 60;

// ============================================================================
// KEY BUILDERS
// ============================================================================

function fileMarkdownKey(courseId: string, fileId: string): string {
  return `file_cache:${courseId}:${fileId}:markdown`;
}

function fileProcessedKey(courseId: string, fileId: string): string {
  return `file_cache:${courseId}:${fileId}:processed`;
}

function lessonMarkdownKey(courseId: string, lessonId: string): string {
  return `lesson_md:${courseId}:${lessonId}`;
}

// ============================================================================
// WRITE (fire-and-forget, never throw)
// ============================================================================

/**
 * Cache file markdown content (Stage 2 write)
 */
export async function cacheFileMarkdown(
  courseId: string,
  fileId: string,
  content: string
): Promise<void> {
  if (!content) return;
  try {
    const redis = getRedisClient();
    await redis.setex(fileMarkdownKey(courseId, fileId), CACHE_TTL_SECONDS, content);
  } catch (error) {
    logger.debug(
      { courseId, fileId, error: error instanceof Error ? error.message : String(error) },
      '[FileContentCache] Failed to cache file markdown (non-fatal)'
    );
  }
}

/**
 * Cache file processed content / summary (Stage 2 Phase 6 write)
 */
export async function cacheFileProcessedContent(
  courseId: string,
  fileId: string,
  content: string
): Promise<void> {
  if (!content) return;
  try {
    const redis = getRedisClient();
    await redis.setex(fileProcessedKey(courseId, fileId), CACHE_TTL_SECONDS, content);
  } catch (error) {
    logger.debug(
      { courseId, fileId, error: error instanceof Error ? error.message : String(error) },
      '[FileContentCache] Failed to cache file processed content (non-fatal)'
    );
  }
}

/**
 * Cache lesson markdown content (Stage 6 write)
 */
export async function cacheLessonMarkdown(
  courseId: string,
  lessonId: string,
  content: string
): Promise<void> {
  if (!content) return;
  try {
    const redis = getRedisClient();
    await redis.setex(lessonMarkdownKey(courseId, lessonId), CACHE_TTL_SECONDS, content);
  } catch (error) {
    logger.debug(
      { courseId, lessonId, error: error instanceof Error ? error.message : String(error) },
      '[FileContentCache] Failed to cache lesson markdown (non-fatal)'
    );
  }
}

// ============================================================================
// READ (return null on miss/error)
// ============================================================================

/**
 * Get cached file markdown content
 */
export async function getCachedFileMarkdown(
  courseId: string,
  fileId: string
): Promise<string | null> {
  try {
    const redis = getRedisClient();
    return await redis.get(fileMarkdownKey(courseId, fileId));
  } catch (error) {
    logger.debug(
      { courseId, fileId, error: error instanceof Error ? error.message : String(error) },
      '[FileContentCache] Failed to read cached file markdown (non-fatal)'
    );
    return null;
  }
}

/**
 * Get cached file processed content (Stage 3/4 read)
 */
export async function getCachedFileProcessedContent(
  courseId: string,
  fileId: string
): Promise<string | null> {
  try {
    const redis = getRedisClient();
    return await redis.get(fileProcessedKey(courseId, fileId));
  } catch (error) {
    logger.debug(
      { courseId, fileId, error: error instanceof Error ? error.message : String(error) },
      '[FileContentCache] Failed to read cached file processed content (non-fatal)'
    );
    return null;
  }
}

/**
 * Get cached lesson markdown content (Stage 7 read)
 */
export async function getCachedLessonMarkdown(
  courseId: string,
  lessonId: string
): Promise<string | null> {
  try {
    const redis = getRedisClient();
    return await redis.get(lessonMarkdownKey(courseId, lessonId));
  } catch (error) {
    logger.debug(
      { courseId, lessonId, error: error instanceof Error ? error.message : String(error) },
      '[FileContentCache] Failed to read cached lesson markdown (non-fatal)'
    );
    return null;
  }
}
