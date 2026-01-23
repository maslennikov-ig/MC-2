/**
 * Local Storage Service for Enrichment Assets
 * @module stages/stage7-enrichments/services/local-storage-service
 *
 * File-based storage for enrichment assets (covers, cards).
 * Replaces Supabase Storage to eliminate egress traffic limits.
 *
 * Files are stored locally and served by nginx via /storage/enrichments/
 *
 * Security features:
 * - UUID validation to prevent path traversal
 * - Path resolution check to ensure files stay within STORAGE_BASE
 * - Atomic writes via temp file + rename to prevent race conditions
 * - Disk space validation before writes
 *
 * @see nginx-megacampus.conf - location /storage/enrichments/
 * @see docker-compose.production.yml - enrichments volume
 */

import fs from 'fs/promises';
import { statfs } from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';
import { logger } from '@/shared/logger';

// ============================================================================
// CONFIGURATION
// ============================================================================

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
 * Minimum free disk space required before writes (500MB)
 */
const MIN_FREE_SPACE_BYTES = 500 * 1024 * 1024;

/**
 * Allowed file extensions (whitelist)
 */
const ALLOWED_EXTENSIONS = ['webp', 'png', 'jpg', 'jpeg'] as const;

/**
 * UUID v4 regex for validation
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================================
// SECURITY HELPERS
// ============================================================================

/**
 * Validate path component to prevent path traversal attacks
 *
 * Checks for:
 * - Path traversal characters (.., /, \)
 * - Hidden files (starting with .)
 * - Null bytes
 * - Valid UUID format (for IDs)
 *
 * @param component - Path component to validate
 * @param name - Name of the component for error messages
 * @param requireUuid - If true, validates UUID format
 * @throws Error if component is invalid
 */
function validatePathComponent(component: string, name: string, requireUuid = true): void {
  // Check for path traversal attempts
  if (component.includes('..') || component.includes('/') || component.includes('\\')) {
    throw new Error(`Invalid ${name}: contains path traversal or directory separators`);
  }

  // Check for hidden files/directories
  if (component.startsWith('.')) {
    throw new Error(`Invalid ${name}: cannot start with dot`);
  }

  // Check for null bytes (could truncate paths)
  if (component.includes('\0')) {
    throw new Error(`Invalid ${name}: contains null byte`);
  }

  // Validate UUID format if required
  if (requireUuid && !UUID_REGEX.test(component)) {
    throw new Error(`Invalid ${name}: must be a valid UUID`);
  }
}

/**
 * Validate file extension against whitelist
 *
 * @param extension - File extension to validate (without dot)
 * @throws Error if extension not allowed
 */
function validateExtension(extension: string): void {
  if (!ALLOWED_EXTENSIONS.includes(extension as (typeof ALLOWED_EXTENSIONS)[number])) {
    throw new Error(`Invalid extension: ${extension}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
  }
}

/**
 * Assert that resolved path is within STORAGE_BASE
 *
 * Final defense against path traversal after all components joined.
 *
 * @param filePath - Full file path to check
 * @throws Error if path escapes STORAGE_BASE
 */
function assertPathWithinBase(filePath: string): void {
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(STORAGE_BASE);

  if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
    logger.error(
      { filePath, resolvedPath, resolvedBase },
      'SECURITY: Path traversal attempt detected'
    );
    throw new Error('Path traversal attempt detected');
  }
}

/**
 * Check available disk space before writing
 *
 * @param dirPath - Directory to check (uses STORAGE_BASE filesystem)
 * @throws Error if disk space below minimum threshold
 */
async function checkDiskSpace(dirPath: string): Promise<void> {
  try {
    const stats = await statfs(dirPath);
    const freeSpace = stats.bavail * stats.bsize;

    if (freeSpace < MIN_FREE_SPACE_BYTES) {
      const freeSpaceMB = Math.round(freeSpace / 1024 / 1024);
      const minSpaceMB = Math.round(MIN_FREE_SPACE_BYTES / 1024 / 1024);
      throw new Error(
        `Insufficient disk space: ${freeSpaceMB}MB free, minimum ${minSpaceMB}MB required`
      );
    }
  } catch (error) {
    // If we can't check (e.g., directory doesn't exist yet), proceed with warning
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.debug({ dirPath }, 'Directory does not exist yet, skipping disk space check');
      return;
    }
    // Re-throw disk space errors
    if (error instanceof Error && error.message.includes('Insufficient disk space')) {
      throw error;
    }
    // Log but don't fail on other errors
    logger.warn({ dirPath, error }, 'Could not check disk space, proceeding anyway');
  }
}

/**
 * Write file atomically using temp file + rename pattern
 *
 * Prevents race conditions and partial writes:
 * 1. Write to temporary file with random suffix
 * 2. Atomically rename to final path (overwrites if exists)
 * 3. Clean up temp file on error
 *
 * @param filePath - Final destination path
 * @param buffer - File content to write
 */
async function atomicWriteFile(filePath: string, buffer: Buffer): Promise<void> {
  const dirPath = path.dirname(filePath);
  const tempFileName = `${path.basename(filePath)}.${randomBytes(8).toString('hex')}.tmp`;
  const tempFilePath = path.join(dirPath, tempFileName);

  try {
    // Ensure directory exists
    await fs.mkdir(dirPath, { recursive: true });

    // Write to temporary file
    await fs.writeFile(tempFilePath, buffer);

    // Atomic rename (overwrites existing file)
    await fs.rename(tempFilePath, filePath);
  } catch (error) {
    // Clean up temp file on error
    try {
      await fs.unlink(tempFilePath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Upload enrichment asset to local filesystem
 *
 * Creates directory structure: {STORAGE_BASE}/{courseId}/{lessonId}/
 *
 * Security features:
 * - Validates all path components as UUIDs
 * - Validates extension against whitelist
 * - Checks resolved path stays within STORAGE_BASE
 * - Uses atomic writes to prevent race conditions
 * - Checks disk space before writing
 *
 * @param courseId - Course UUID (for path organization)
 * @param lessonId - Lesson UUID (for path organization)
 * @param enrichmentId - Enrichment UUID (for unique filename)
 * @param buffer - File content as Buffer
 * @param extension - File extension (default: 'webp')
 * @returns Storage path relative to STORAGE_BASE (e.g., "courseId/lessonId/enrichmentId.webp")
 * @throws Error if validation fails, file too large, disk full, or write fails
 *
 * @example
 * ```typescript
 * const storagePath = await uploadEnrichmentAssetLocal(
 *   'abc-123-def',
 *   'ghi-456-jkl',
 *   'mno-789-pqr',
 *   imageBuffer,
 *   'webp'
 * );
 * // Returns: "abc-123-def/ghi-456-jkl/mno-789-pqr.webp"
 * ```
 */
export async function uploadEnrichmentAssetLocal(
  courseId: string,
  lessonId: string,
  enrichmentId: string,
  buffer: Buffer,
  extension = 'webp'
): Promise<string> {
  // Validate all inputs
  validatePathComponent(courseId, 'courseId');
  validatePathComponent(lessonId, 'lessonId');
  validatePathComponent(enrichmentId, 'enrichmentId');
  validateExtension(extension);

  // Validate file size
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File size ${buffer.length} exceeds maximum ${MAX_FILE_SIZE_BYTES} bytes`);
  }

  // Build paths
  const dirPath = path.join(STORAGE_BASE, courseId, lessonId);
  const fileName = `${enrichmentId}.${extension}`;
  const filePath = path.join(dirPath, fileName);
  const storagePath = `${courseId}/${lessonId}/${fileName}`;

  // Final security check: ensure path stays within STORAGE_BASE
  assertPathWithinBase(filePath);

  // Check disk space
  await checkDiskSpace(STORAGE_BASE);

  try {
    // Atomic write (prevents race conditions)
    await atomicWriteFile(filePath, buffer);

    logger.info(
      {
        storagePath,
        fileSize: buffer.length,
      },
      'Local enrichment asset uploaded'
    );

    return storagePath;
  } catch (error) {
    logger.error(
      {
        storagePath,
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
 * @throws Error if validation fails, file too large, disk full, or write fails
 */
export async function uploadCourseCardLocal(
  courseId: string,
  buffer: Buffer,
  extension = 'webp'
): Promise<string> {
  // Validate inputs
  validatePathComponent(courseId, 'courseId');
  validateExtension(extension);

  // Validate file size
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File size ${buffer.length} exceeds maximum ${MAX_FILE_SIZE_BYTES} bytes`);
  }

  // Build paths
  const dirPath = path.join(STORAGE_BASE, courseId);
  const fileName = `card.${extension}`;
  const filePath = path.join(dirPath, fileName);
  const storagePath = `${courseId}/${fileName}`;

  // Final security check
  assertPathWithinBase(filePath);

  // Check disk space
  await checkDiskSpace(STORAGE_BASE);

  try {
    // Atomic write
    await atomicWriteFile(filePath, buffer);

    logger.info(
      {
        storagePath,
        fileSize: buffer.length,
      },
      'Local course card uploaded'
    );

    return storagePath;
  } catch (error) {
    logger.error(
      {
        storagePath,
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
 * Constructs the complete URL that clients use to access assets served by nginx.
 *
 * @param storagePath - Relative path returned from upload function
 * @returns Full public URL accessible by clients
 *
 * @example
 * ```typescript
 * const url = buildPublicUrl('abc-123/def-456/xyz-789.webp');
 * // Returns: "https://ai.megacampus.ru/storage/enrichments/abc-123/def-456/xyz-789.webp"
 * ```
 */
export function buildPublicUrl(storagePath: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ai.megacampus.ru';
  return `${baseUrl}${PUBLIC_URL}/${storagePath}`;
}

/**
 * Delete enrichment asset from local storage
 *
 * Idempotent: succeeds silently if file doesn't exist.
 * Also attempts to clean up empty parent directories.
 *
 * @param storagePath - Relative path (e.g., "courseId/lessonId/enrichmentId.webp")
 * @throws Error if delete fails (except for file not found)
 */
export async function deleteEnrichmentAssetLocal(storagePath: string): Promise<void> {
  // Basic validation (storagePath could be courseId/lessonId/file.webp)
  if (storagePath.includes('..') || storagePath.startsWith('/')) {
    throw new Error('Invalid storagePath: contains path traversal');
  }

  const filePath = path.join(STORAGE_BASE, storagePath);

  // Security check
  assertPathWithinBase(filePath);

  try {
    await fs.unlink(filePath);
    logger.info({ storagePath }, 'Local enrichment asset deleted');

    // Try to clean up empty parent directory
    const dirPath = path.dirname(filePath);
    try {
      await fs.rmdir(dirPath); // Only succeeds if empty
      logger.debug({ dirPath }, 'Removed empty directory');
    } catch {
      // Directory not empty or doesn't exist - ignore
    }
  } catch (error) {
    // Ignore ENOENT (file not found) - idempotent delete
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.error(
        {
          storagePath,
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
  // Basic validation
  if (storagePath.includes('..') || storagePath.startsWith('/')) {
    return false;
  }

  const filePath = path.join(STORAGE_BASE, storagePath);

  try {
    assertPathWithinBase(filePath);
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
  // Basic validation
  if (storagePath.includes('..') || storagePath.startsWith('/')) {
    return null;
  }

  const filePath = path.join(STORAGE_BASE, storagePath);

  try {
    assertPathWithinBase(filePath);
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

/**
 * Verify storage permissions on startup
 *
 * Creates a test file and deletes it to verify write access.
 * Should be called during worker initialization.
 *
 * @throws Error if cannot write to storage directory
 */
export async function verifyStoragePermissions(): Promise<void> {
  const testPath = path.join(STORAGE_BASE, '.permission-test');

  try {
    // Ensure base directory exists
    await fs.mkdir(STORAGE_BASE, { recursive: true });

    // Write test file
    await fs.writeFile(testPath, 'test');
    await fs.unlink(testPath);

    logger.info({ STORAGE_BASE }, 'Storage permissions verified');
  } catch (error) {
    logger.error({ STORAGE_BASE, error }, 'FATAL: Cannot write to enrichments storage directory');
    throw new Error(
      `Cannot write to enrichments storage: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
