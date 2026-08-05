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
 * - Docling cache is path-based (SHA-256 of canonical conversion input), so it only helps
 *   when retrying the SAME file path (not cross-course deduplication,
 *   which uses SHA-256 content hashes in file_catalog)
 * - After 7 days, cache files are considered stale and safe to delete
 */
export const DEFAULT_DOCLING_TTL_HOURS = 168;

function pythonJsonString(value: string): string {
  // Python json.dumps defaults to ensure_ascii=True. Work at UTF-16 code-unit
  // level so astral characters become the same pair of \uXXXX surrogates.
  return JSON.stringify(value).replace(
    /[\u0080-\uFFFF]/g,
    character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
}

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

  logger.info(
    {
      cacheDir,
      ttlHours,
      threshold: new Date(thresholdTime).toISOString(),
    },
    'Starting Docling cache cleanup'
  );

  const result: DoclingCleanupResult = {
    deletedCount: 0,
    keptCount: 0,
    errorCount: 0,
    totalSizeFreed: 0,
  };

  try {
    // Check if directory exists
    try {
      await fs.access(cacheDir);
    } catch {
      logger.warn(
        { cacheDir },
        'Cache directory does not exist or is not accessible. Nothing to clean.'
      );
      return result;
    }

    const files = await fs.readdir(cacheDir);

    for (const file of files) {
      // JSON is the anchor; its Markdown sibling has the same key and lifetime.
      if (!file.endsWith('.json')) {
        continue;
      }

      const filePath = path.join(cacheDir, file);

      try {
        const stats = await fs.stat(filePath);

        if (stats.mtimeMs < thresholdTime) {
          for (const extension of ['json', 'md']) {
            const pairedPath = path.join(cacheDir, `${path.basename(file, '.json')}.${extension}`);
            try {
              const pairedStats = await fs.stat(pairedPath);
              await fs.unlink(pairedPath);
              result.deletedCount++;
              result.totalSizeFreed += pairedStats.size;
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            }
          }
          logger.debug({ file, mtime: stats.mtime }, 'Deleted old cache pair');
        } else {
          result.keptCount++;
        }
      } catch (err) {
        result.errorCount++;
        logger.error({ err, file }, 'Failed to process/delete file');
      }
    }

    logger.info(
      {
        ...result,
        totalSizeFreedMB: (result.totalSizeFreed / 1024 / 1024).toFixed(2),
      },
      'Docling cache cleanup completed'
    );

    return result;
  } catch (err) {
    logger.error({ err }, 'Fatal error during cache cleanup');
    throw err;
  }
}

/**
 * Generates the Docling MCP 3 cache key for the default conversion request.
 *
 * @param filePath - The absolute file path
 * @returns First 32 hexadecimal characters of the SHA-256 digest
 */
export function generateCacheKey(filePath: string): string {
  // Python's json.dumps(sort_keys=True) uses this exact key order and spacing.
  const canonicalRequest = `{"enable_ocr": false, "ocr_language": [], "source": ${pythonJsonString(filePath)}}`;
  return crypto.createHash('sha256').update(canonicalRequest).digest('hex').slice(0, 32);
}

function generateLegacyCacheKey(filePath: string): string {
  return crypto.createHash('md5').update(filePath).digest('hex');
}

function getCachePathCandidates(filePath: string): string[] {
  const candidates = new Set([filePath]);
  const uploadsBasePath = process.env.DOCLING_UPLOADS_BASE_PATH;
  const containerUploadsPath = process.env.DOCLING_CONTAINER_UPLOADS_PATH || '/app/uploads';
  const marker = '/uploads/';

  if (uploadsBasePath && filePath.startsWith(uploadsBasePath)) {
    const uploadsIndex = filePath.indexOf(marker, uploadsBasePath.length);
    if (uploadsIndex !== -1) {
      candidates.add(`${containerUploadsPath}/${filePath.slice(uploadsIndex + marker.length)}`);
    }
  }

  return [...candidates];
}

/**
 * Cleans up Docling cache files for a specific course.
 *
 * Called during course deletion to remove cached document parsing results.
 * Docling MCP 3 uses SHA-256 over a canonical request. The prior MC2 image
 * used MD5, so both key families are removed during the compatibility window.
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

  logger.info(
    {
      cacheDir,
      fileCount: filePaths.length,
    },
    '[Docling Cleanup] Starting course-specific cache cleanup'
  );

  // Check if directory exists
  try {
    await fs.access(cacheDir);
  } catch {
    logger.warn(
      { cacheDir },
      '[Docling Cleanup] Cache directory does not exist. Nothing to clean.'
    );
    return result;
  }

  // Generate cache keys for each file path
  const cacheKeys = filePaths.flatMap(filePath =>
    getCachePathCandidates(filePath).flatMap(candidatePath =>
      [generateCacheKey(candidatePath), generateLegacyCacheKey(candidatePath)].map(cacheKey => ({
        filePath,
        candidatePath,
        cacheKey,
      }))
    )
  );

  // Delete cache files
  for (const { filePath, candidatePath, cacheKey } of cacheKeys) {
    let foundForKey = false;
    for (const extension of ['json', 'md']) {
      const cacheFilePath = path.join(cacheDir, `${cacheKey}.${extension}`);
      try {
        const stats = await fs.stat(cacheFilePath);
        await fs.unlink(cacheFilePath);
        foundForKey = true;
        result.deletedCount++;
        result.totalSizeFreed += stats.size;
        logger.debug(
          {
            cacheKey,
            extension,
            originalPath: filePath,
            cachePathSource: candidatePath,
            sizeMB: (stats.size / 1024 / 1024).toFixed(2),
          },
          '[Docling Cleanup] Deleted cache artifact for document'
        );
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          result.errorCount++;
          logger.error(
            { err, cacheKey, extension, originalPath: filePath, cachePathSource: candidatePath },
            '[Docling Cleanup] Failed to delete cache artifact'
          );
        }
      }
    }
    if (!foundForKey) {
      result.keptCount++;
    }
  }

  logger.info(
    {
      deletedCount: result.deletedCount,
      notFoundCount: result.keptCount,
      errorCount: result.errorCount,
      totalSizeFreedMB: (result.totalSizeFreed / 1024 / 1024).toFixed(2),
      filePathsProcessed: filePaths.length,
    },
    '[Docling Cleanup] Course-specific cache cleanup completed'
  );

  return result;
}
