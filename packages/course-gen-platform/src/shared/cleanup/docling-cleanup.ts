import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../logger/index.js';

/**
 * Default TTL for Docling cache files (7 days = 168 hours)
 *
 * Why 7 days:
 * - Covers long-running pipelines that may span multiple days
 * - Allows for retry scenarios after weekend/holiday breaks
 * - Docling cache is path-based (MD5 of file path), so it only helps
 *   when retrying the SAME file path (not cross-course deduplication,
 *   which uses SHA-256 content hashes in file_catalog)
 * - After 7 days, cache files are considered stale and safe to delete
 */
export const DEFAULT_DOCLING_TTL_HOURS = 168;

/**
 * Result of Docling cache cleanup operation
 */
export interface DoclingCleanupResult {
  deletedCount: number;
  keptCount: number;
  errorCount: number;
  totalSizeFreed: number;
}

/**
 * Cleans up old files from the Docling cache directory
 * 
 * @param cacheDir - Directory path to clean
 * @param ttlHours - Time to live in hours (default: 24)
 * @returns Cleanup statistics
 */
export async function cleanupDoclingCache(
  cacheDir: string, 
  ttlHours: number = DEFAULT_DOCLING_TTL_HOURS
): Promise<DoclingCleanupResult> {
  const retentionMs = ttlHours * 60 * 60 * 1000;
  const now = Date.now();
  const thresholdTime = now - retentionMs;

  logger.info({ 
    cacheDir, 
    ttlHours, 
    threshold: new Date(thresholdTime).toISOString() 
  }, 'Starting Docling cache cleanup');

  const result: DoclingCleanupResult = {
    deletedCount: 0,
    keptCount: 0,
    errorCount: 0,
    totalSizeFreed: 0
  };

  try {
    // Check if directory exists
    try {
      await fs.access(cacheDir);
    } catch {
      logger.warn({ cacheDir }, 'Cache directory does not exist or is not accessible. Nothing to clean.');
      return result;
    }

    const files = await fs.readdir(cacheDir);

    for (const file of files) {
      // Only process .json files to be safe
      if (!file.endsWith('.json')) {
        continue;
      }

      const filePath = path.join(cacheDir, file);
      
      try {
        const stats = await fs.stat(filePath);
        
        if (stats.mtimeMs < thresholdTime) {
          await fs.unlink(filePath);
          result.deletedCount++;
          result.totalSizeFreed += stats.size;
          logger.debug({ file, mtime: stats.mtime }, 'Deleted old cache file');
        } else {
          result.keptCount++;
        }
      } catch (err) {
        result.errorCount++;
        logger.error({ err, file }, 'Failed to process/delete file');
      }
    }

    logger.info({
      ...result,
      totalSizeFreedMB: (result.totalSizeFreed / 1024 / 1024).toFixed(2)
    }, 'Docling cache cleanup completed');

    return result;

  } catch (err) {
    logger.error({ err }, 'Fatal error during cache cleanup');
    throw err;
  }
}

/**
 * Generates MD5 hash cache key for a file path.
 * This matches Docling's internal cache key format.
 *
 * @param filePath - The absolute file path
 * @returns MD5 hex string (32 characters)
 */
export function generateCacheKey(filePath: string): string {
  return crypto.createHash('md5').update(filePath).digest('hex');
}

/**
 * Cleans up Docling cache files for a specific course.
 *
 * Called during course deletion to remove cached document parsing results.
 * Docling uses MD5 hash of the file path as the cache key, so we need to
 * generate the same hash from the original file paths.
 *
 * Note: This only cleans up cache for documents that were processed via
 * the SAME file paths. If files were re-uploaded with different paths,
 * those cache entries will be cleaned up by TTL-based cleanup instead.
 *
 * @param cacheDir - Docling cache directory path
 * @param filePaths - Array of absolute file paths that were processed
 * @returns Cleanup statistics
 *
 * @example
 * ```typescript
 * // Get file paths from file_catalog before course deletion
 * const filePaths = files.map(f => path.join(baseDir, f.storage_path));
 *
 * // Clean up Docling cache
 * const result = await cleanupDoclingCacheForCourse(cacheDir, filePaths);
 * console.log(`Deleted ${result.deletedCount} cache files`);
 * ```
 */
export async function cleanupDoclingCacheForCourse(
  cacheDir: string,
  filePaths: string[]
): Promise<DoclingCleanupResult> {
  const result: DoclingCleanupResult = {
    deletedCount: 0,
    keptCount: 0,
    errorCount: 0,
    totalSizeFreed: 0,
  };

  if (filePaths.length === 0) {
    logger.debug({ cacheDir }, '[Docling Cleanup] No file paths provided, nothing to clean');
    return result;
  }

  logger.info({
    cacheDir,
    fileCount: filePaths.length,
  }, '[Docling Cleanup] Starting course-specific cache cleanup');

  // Check if directory exists
  try {
    await fs.access(cacheDir);
  } catch {
    logger.warn({ cacheDir }, '[Docling Cleanup] Cache directory does not exist. Nothing to clean.');
    return result;
  }

  // Generate cache keys for each file path
  const cacheKeys = filePaths.map((filePath) => ({
    filePath,
    cacheKey: generateCacheKey(filePath),
  }));

  // Delete cache files
  for (const { filePath, cacheKey } of cacheKeys) {
    const cacheFilePath = path.join(cacheDir, `${cacheKey}.json`);

    try {
      const stats = await fs.stat(cacheFilePath);
      await fs.unlink(cacheFilePath);
      result.deletedCount++;
      result.totalSizeFreed += stats.size;
      logger.debug({
        cacheKey,
        originalPath: filePath,
        sizeMB: (stats.size / 1024 / 1024).toFixed(2),
      }, '[Docling Cleanup] Deleted cache file for document');
    } catch (err) {
      // File might not exist (document was never processed, or was processed with different path)
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        result.keptCount++; // Not an error, just not found
        logger.debug({
          cacheKey,
          originalPath: filePath,
        }, '[Docling Cleanup] Cache file not found (already deleted or never created)');
      } else {
        result.errorCount++;
        logger.error({
          err,
          cacheKey,
          originalPath: filePath,
        }, '[Docling Cleanup] Failed to delete cache file');
      }
    }
  }

  logger.info({
    deletedCount: result.deletedCount,
    notFoundCount: result.keptCount,
    errorCount: result.errorCount,
    totalSizeFreedMB: (result.totalSizeFreed / 1024 / 1024).toFixed(2),
    filePathsProcessed: filePaths.length,
  }, '[Docling Cleanup] Course-specific cache cleanup completed');

  return result;
}
