/**
 * Local Storage Service for Enrichment Assets
 * @module stages/stage7-enrichments/services/local-storage-service
 *
 * File-based storage for enrichment assets (covers, cards).
 * Replaces Supabase Storage to eliminate egress traffic limits.
 *
 * Files are stored locally and served by nginx via /storage/enrichments/
 *
 * @see nginx-megacampus.conf - location /storage/enrichments/
 * @see docker-compose.production.yml - enrichments volume
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from '@/shared/logger';

/**
 * Base path for local enrichment storage
 * In Docker: /app/data/enrichments (mounted from ./data/enrichments)
 * In development: can be overridden via env
 */
const STORAGE_BASE = process.env.ENRICHMENTS_LOCAL_PATH || '/app/data/enrichments';

/**
 * Public URL path prefix (nginx serves from this location)
 * Full URL is built as: {SITE_URL}{PUBLIC_URL}/{storagePath}
 */
const PUBLIC_URL = process.env.ENRICHMENTS_PUBLIC_URL || '/storage/enrichments';

/**
 * Maximum file size in bytes (50MB for images - should be plenty)
 */
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/**
 * Upload enrichment asset to local filesystem
 *
 * Creates directory structure if needed: {STORAGE_BASE}/{courseId}/{lessonId}/
 *
 * @param courseId - Course UUID (for path organization)
 * @param lessonId - Lesson UUID (for path organization)
 * @param enrichmentId - Enrichment UUID (for unique filename)
 * @param buffer - File content as Buffer
 * @param extension - File extension (default: 'webp')
 * @returns Storage path relative to STORAGE_BASE (e.g., "courseId/lessonId/enrichmentId.webp")
 * @throws Error if file too large or write fails
 */
export async function uploadEnrichmentAssetLocal(
  courseId: string,
  lessonId: string,
  enrichmentId: string,
  buffer: Buffer,
  extension = 'webp'
): Promise<string> {
  // Validate file size
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File size ${buffer.length} exceeds maximum ${MAX_FILE_SIZE_BYTES} bytes`);
  }

  // Build paths
  const dirPath = path.join(STORAGE_BASE, courseId, lessonId);
  const fileName = `${enrichmentId}.${extension}`;
  const filePath = path.join(dirPath, fileName);
  const storagePath = `${courseId}/${lessonId}/${fileName}`;

  try {
    // Ensure directory exists
    await fs.mkdir(dirPath, { recursive: true });

    // Write file
    await fs.writeFile(filePath, buffer);

    logger.info(
      {
        storagePath,
        fileSize: buffer.length,
        filePath,
      },
      'Local enrichment asset uploaded'
    );

    return storagePath;
  } catch (error) {
    logger.error(
      {
        storagePath,
        filePath,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to upload local enrichment asset'
    );
    throw error;
  }
}

/**
 * Upload course-level card (no lessonId in path)
 *
 * @param courseId - Course UUID
 * @param buffer - File content as Buffer
 * @param extension - File extension (default: 'webp')
 * @returns Storage path (e.g., "courseId/card.webp")
 */
export async function uploadCourseCardLocal(
  courseId: string,
  buffer: Buffer,
  extension = 'webp'
): Promise<string> {
  // Validate file size
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File size ${buffer.length} exceeds maximum ${MAX_FILE_SIZE_BYTES} bytes`);
  }

  // Build paths
  const dirPath = path.join(STORAGE_BASE, courseId);
  const fileName = `card.${extension}`;
  const filePath = path.join(dirPath, fileName);
  const storagePath = `${courseId}/${fileName}`;

  try {
    // Ensure directory exists
    await fs.mkdir(dirPath, { recursive: true });

    // Write file
    await fs.writeFile(filePath, buffer);

    logger.info(
      {
        storagePath,
        fileSize: buffer.length,
        filePath,
      },
      'Local course card uploaded'
    );

    return storagePath;
  } catch (error) {
    logger.error(
      {
        storagePath,
        filePath,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to upload local course card'
    );
    throw error;
  }
}

/**
 * Build full public URL for enrichment asset
 *
 * @param storagePath - Relative path (e.g., "courseId/lessonId/enrichmentId.webp")
 * @returns Full public URL (e.g., "https://ai.megacampus.ru/storage/enrichments/courseId/lessonId/enrichmentId.webp")
 */
export function buildPublicUrl(storagePath: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ai.megacampus.ru';
  return `${baseUrl}${PUBLIC_URL}/${storagePath}`;
}

/**
 * Delete enrichment asset from local storage
 *
 * Silently succeeds if file doesn't exist (idempotent).
 *
 * @param storagePath - Relative path (e.g., "courseId/lessonId/enrichmentId.webp")
 */
export async function deleteEnrichmentAssetLocal(storagePath: string): Promise<void> {
  const filePath = path.join(STORAGE_BASE, storagePath);

  try {
    await fs.unlink(filePath);
    logger.info({ storagePath, filePath }, 'Local enrichment asset deleted');
  } catch (error) {
    // Ignore ENOENT (file not found) - idempotent delete
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.error(
        {
          storagePath,
          filePath,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to delete local enrichment asset'
      );
      throw error;
    }
  }
}

/**
 * Check if asset exists in local storage
 *
 * @param storagePath - Relative path
 * @returns True if file exists
 */
export async function assetExistsLocal(storagePath: string): Promise<boolean> {
  const filePath = path.join(STORAGE_BASE, storagePath);

  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get asset metadata from local storage
 *
 * @param storagePath - Relative path
 * @returns File metadata or null if not found
 */
export async function getAssetMetadataLocal(storagePath: string): Promise<{
  size: number;
  mimeType: string;
  lastModified: string;
} | null> {
  const filePath = path.join(STORAGE_BASE, storagePath);

  try {
    const stats = await fs.stat(filePath);

    // Determine MIME type from extension
    const ext = path.extname(storagePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.webp': 'image/webp',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
    };

    return {
      size: stats.size,
      mimeType: mimeTypes[ext] || 'application/octet-stream',
      lastModified: stats.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}
