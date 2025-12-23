/**
 * Unified Course Cleanup Service
 *
 * Orchestrates cleanup of all resources associated with a course:
 * - Qdrant vectors
 * - Redis keys
 * - RAG context cache
 * - Physical files
 *
 * Used when deleting a course to ensure no orphaned resources remain.
 *
 * @module shared/cleanup/course-cleanup
 */

import path from 'path';
import { logger } from '../logger/index.js';
import { deleteVectorsForCourse } from '../qdrant/lifecycle';
import { cleanupCourseRagContext } from '../rag/rag-cleanup';
import { getSupabaseAdmin } from '../supabase/admin';
import { cleanupRedisForCourse, type RedisCleanupResult } from './redis-cleanup';
import { deleteUploadedFiles, type FilesCleanupResult } from './files-cleanup';
import { cleanupDoclingCacheForCourse } from './docling-cleanup';

/**
 * UUID validation regex pattern
 * Matches standard UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates that a string is a valid UUID format
 *
 * @param uuid - String to validate
 * @returns True if valid UUID format
 */
function isValidUUID(uuid: string): boolean {
  return UUID_REGEX.test(uuid);
}

/**
 * Result of complete course cleanup operation
 */
export interface CourseCleanupResult {
  /** Course ID that was cleaned */
  courseId: string;
  /** Organization ID */
  organizationId: string;
  /** Overall success (all operations succeeded) */
  success: boolean;
  /** Qdrant cleanup result */
  qdrant: {
    deleted: boolean;
    vectorsDeleted: number;
  };
  /** Redis cleanup result */
  redis: RedisCleanupResult;
  /** RAG context cleanup result */
  ragContext: {
    success: boolean;
    entriesDeleted: number;
  };
  /** Files cleanup result */
  files: FilesCleanupResult;
  /** Docling cache cleanup result */
  doclingCache: {
    success: boolean;
    filesDeleted: number;
    bytesFreed: number;
  };
  /** Total duration in milliseconds */
  durationMs: number;
  /** Any errors encountered (non-fatal) */
  errors: string[];
}

/**
 * Clean up all resources associated with a course
 *
 * This function should be called BEFORE deleting the course from the database.
 * It cleans up:
 * 1. Qdrant vectors (all vectors with matching course_id)
 * 2. Redis keys (idempotency, RAG cache)
 * 3. RAG context cache (Supabase table)
 * 4. Physical files (uploads directory)
 *
 * **IMPORTANT: Best-Effort Cleanup**
 *
 * This function performs best-effort cleanup. If some operations fail,
 * successful operations are NOT rolled back. This is intentional because:
 * - Partial cleanup is better than no cleanup
 * - Retrying cleanup can recover from transient failures
 * - Rolling back vector deletions is complex and may not be desirable
 * - The function continues even if some operations fail
 *
 * The function collects all errors and returns them in the result for
 * monitoring and retry logic. Callers should check `result.errors` array
 * and log warnings for any partial failures.
 *
 * @param courseId - Course UUID to clean up
 * @param organizationId - Organization UUID (for file path)
 * @returns Comprehensive cleanup result with all errors collected
 *
 * @example
 * ```typescript
 * // Before deleting course from database
 * const cleanupResult = await cleanupCourseResources(courseId, organizationId);
 *
 * if (!cleanupResult.success) {
 *   logger.warn({ errors: cleanupResult.errors }, 'Some cleanup operations failed');
 *   // Still proceed with deletion - cleanup is best-effort
 * }
 *
 * // Proceed with database deletion
 * await supabase.from('courses').delete().eq('id', courseId);
 * ```
 */
export async function cleanupCourseResources(
  courseId: string,
  organizationId: string
): Promise<CourseCleanupResult> {
  const startTime = Date.now();

  // Validate UUIDs early
  if (!isValidUUID(courseId) || !isValidUUID(organizationId)) {
    logger.error({
      courseId,
      organizationId,
    }, '[Course Cleanup] Invalid UUID format');

    return {
      courseId,
      organizationId,
      success: false,
      qdrant: { deleted: false, vectorsDeleted: 0 },
      redis: { success: false, keysDeleted: 0, patternsProcessed: [], error: 'Invalid UUID' },
      ragContext: { success: false, entriesDeleted: 0 },
      files: { success: false, filesDeleted: 0, bytesFreed: 0, error: 'Invalid UUID' },
      doclingCache: { success: false, filesDeleted: 0, bytesFreed: 0 },
      durationMs: Date.now() - startTime,
      errors: ['Invalid UUID format'],
    };
  }

  const errors: string[] = [];

  logger.info({
    courseId,
    organizationId,
  }, '[Course Cleanup] Starting comprehensive course cleanup');

  // 1. Clean Qdrant vectors
  let qdrantResult = { deleted: false, vectorsDeleted: 0 };
  try {
    const result = await deleteVectorsForCourse(courseId);
    qdrantResult = {
      deleted: result.deleted,
      vectorsDeleted: result.approximateCount,
    };
  } catch (error) {
    const errorMsg = `Qdrant cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
    errors.push(errorMsg);
    logger.error({ courseId, error: errorMsg }, '[Course Cleanup] Qdrant cleanup error');
  }

  // 2. Clean Redis keys
  let redisResult: RedisCleanupResult = {
    success: false,
    keysDeleted: 0,
    patternsProcessed: [],
    error: 'Not executed',
  };
  try {
    redisResult = await cleanupRedisForCourse(courseId);
    if (!redisResult.success && redisResult.error) {
      errors.push(`Redis cleanup: ${redisResult.error}`);
    }
  } catch (error) {
    const errorMsg = `Redis cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
    errors.push(errorMsg);
    logger.error({ courseId, error: errorMsg }, '[Course Cleanup] Redis cleanup error');
  }

  // 3. Clean RAG context cache
  let ragResult = { success: false, entriesDeleted: 0 };
  try {
    const result = await cleanupCourseRagContext(courseId);
    ragResult = {
      success: result.success,
      entriesDeleted: result.entriesDeleted,
    };
    if (!result.success && result.error) {
      errors.push(`RAG cleanup: ${result.error}`);
    }
  } catch (error) {
    const errorMsg = `RAG cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
    errors.push(errorMsg);
    logger.error({ courseId, error: errorMsg }, '[Course Cleanup] RAG cleanup error');
  }

  // 4. Clean physical files
  let filesResult: FilesCleanupResult = {
    success: false,
    filesDeleted: 0,
    bytesFreed: 0,
    error: 'Not executed',
  };
  try {
    filesResult = await deleteUploadedFiles(organizationId, courseId);
    if (!filesResult.success && filesResult.error) {
      errors.push(`Files cleanup: ${filesResult.error}`);
    }
  } catch (error) {
    const errorMsg = `Files cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
    errors.push(errorMsg);
    logger.error({ courseId, error: errorMsg }, '[Course Cleanup] Files cleanup error');
  }

  // 5. Clean Docling cache
  // Get file paths from file_catalog before cleaning up cache
  let doclingCacheResult = { success: true, filesDeleted: 0, bytesFreed: 0 };
  try {
    const supabase = getSupabaseAdmin();
    const { data: files, error: filesError } = await supabase
      .from('file_catalog')
      .select('storage_path')
      .eq('course_id', courseId);

    if (filesError) {
      logger.warn({ courseId, error: filesError }, '[Course Cleanup] Failed to fetch file paths for Docling cache cleanup');
      // Don't add to errors - this is non-critical
    } else if (files && files.length > 0) {
      // Generate absolute paths (matching how they were processed in document pipeline)
      const basePath = process.env.DOCLING_UPLOADS_BASE_PATH || process.cwd();
      const filePaths = files.map((f) => path.join(basePath, f.storage_path));

      // Get cache directory
      const cacheDir = process.env.DOCLING_CACHE_PATH || path.resolve(process.cwd(), '../../.tmp/docling-cache');

      const doclingResult = await cleanupDoclingCacheForCourse(cacheDir, filePaths);
      doclingCacheResult = {
        success: doclingResult.errorCount === 0,
        filesDeleted: doclingResult.deletedCount,
        bytesFreed: doclingResult.totalSizeFreed,
      };

      if (doclingResult.errorCount > 0) {
        errors.push(`Docling cache cleanup: ${doclingResult.errorCount} errors`);
      }
    }
  } catch (error) {
    const errorMsg = `Docling cache cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
    errors.push(errorMsg);
    logger.error({ courseId, error: errorMsg }, '[Course Cleanup] Docling cache cleanup error');
    doclingCacheResult.success = false;
  }

  const durationMs = Date.now() - startTime;
  // Note: Docling cache cleanup is best-effort and does not affect overall success
  // It's a performance optimization, not a data integrity requirement
  const overallSuccess = qdrantResult.deleted &&
                         redisResult.success &&
                         ragResult.success &&
                         filesResult.success;

  const result: CourseCleanupResult = {
    courseId,
    organizationId,
    success: overallSuccess,
    qdrant: qdrantResult,
    redis: redisResult,
    ragContext: ragResult,
    files: filesResult,
    doclingCache: doclingCacheResult,
    durationMs,
    errors,
  };

  logger.info({
    courseId,
    organizationId,
    success: overallSuccess,
    vectorsDeleted: qdrantResult.vectorsDeleted,
    redisKeysDeleted: redisResult.keysDeleted,
    ragEntriesDeleted: ragResult.entriesDeleted,
    filesDeleted: filesResult.filesDeleted,
    bytesFreed: filesResult.bytesFreed,
    doclingCacheDeleted: doclingCacheResult.filesDeleted,
    doclingCacheBytesFreed: doclingCacheResult.bytesFreed,
    durationMs,
    errorCount: errors.length,
  }, '[Course Cleanup] Cleanup complete');

  return result;
}

// Re-export individual utilities for direct use
export { cleanupRedisForCourse } from './redis-cleanup';
export { deleteUploadedFiles, hasUploadedFiles } from './files-cleanup';
export type { RedisCleanupResult } from './redis-cleanup';
export type { FilesCleanupResult } from './files-cleanup';
