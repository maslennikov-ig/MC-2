import fs from 'fs/promises';
import path from 'path';
import { logger } from '../logger/index.js';

/**
 * Default TTL for Docling cache files (24 hours)
 */
export const DEFAULT_DOCLING_TTL_HOURS = 24;

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
