/**
 * File System Cleanup Utility for Course Deletion
 *
 * Removes uploaded files associated with a deleted course.
 * Handles the entire course directory recursively.
 *
 * @module shared/cleanup/files-cleanup
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '@/shared/logger';
import { env } from '@/shared/config/env-validator';

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
 * Result of file system cleanup operation
 */
export interface FilesCleanupResult {
  /** Whether cleanup succeeded */
  success: boolean;
  /** Number of files deleted */
  filesDeleted: number;
  /** Bytes freed (approximate) */
  bytesFreed: number;
  /** Path that was deleted */
  deletedPath?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Get total size of a directory recursively
 *
 * @param dirPath - Directory path
 * @returns Total size in bytes
 */
async function getDirectorySize(dirPath: string): Promise<{ size: number; fileCount: number }> {
  let totalSize = 0;
  let fileCount = 0;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const subResult = await getDirectorySize(fullPath);
        totalSize += subResult.size;
        fileCount += subResult.fileCount;
      } else {
        const stat = await fs.stat(fullPath);
        totalSize += stat.size;
        fileCount++;
      }
    }
  } catch (error) {
    // Directory doesn't exist or not accessible - this is expected for missing dirs
    logger.debug({
      dirPath,
      error: error instanceof Error ? error.message : String(error),
    }, '[Files Cleanup] Directory size calculation skipped (expected if dir does not exist)');
  }

  return { size: totalSize, fileCount };
}

/**
 * Delete uploaded files for a course
 *
 * Removes the entire course upload directory:
 * `{UPLOADS_DIR}/{organizationId}/{courseId}/`
 *
 * @param organizationId - Organization UUID
 * @param courseId - Course UUID
 * @returns Cleanup result with count of deleted files and bytes freed
 *
 * @example
 * ```typescript
 * const result = await deleteUploadedFiles(
 *   '9b98a7d5-27ea-4441-81dc-de79d488e5db',
 *   '5c245b51-75d3-425a-b2bc-9a29016633ba'
 * );
 * console.log(`Deleted ${result.filesDeleted} files, freed ${result.bytesFreed} bytes`);
 * ```
 */
export async function deleteUploadedFiles(
  organizationId: string,
  courseId: string
): Promise<FilesCleanupResult> {
  // H1: Validate UUIDs to prevent path traversal
  if (!isValidUUID(organizationId) || !isValidUUID(courseId)) {
    logger.error({
      organizationId,
      courseId,
    }, '[Files Cleanup] Invalid UUID format - rejecting to prevent path traversal');

    return {
      success: false,
      filesDeleted: 0,
      bytesFreed: 0,
      error: 'Invalid UUID format',
    };
  }

  // Use centralized config for consistent default across codebase
  const uploadsDir = env.uploadsDir;
  const courseDir = path.join(uploadsDir, organizationId, courseId);

  // H2: Additional safety - normalize and verify path is within uploads
  const normalizedPath = path.normalize(courseDir);
  const uploadsBasePath = path.normalize(uploadsDir);

  if (!normalizedPath.startsWith(uploadsBasePath)) {
    logger.error({
      normalizedPath,
      uploadsBasePath,
    }, '[Files Cleanup] Path traversal attempt detected');

    return {
      success: false,
      filesDeleted: 0,
      bytesFreed: 0,
      error: 'Invalid path: outside uploads directory',
    };
  }

  logger.info({
    organizationId,
    courseId,
    courseDir,
  }, '[Files Cleanup] Starting course files cleanup');

  try {
    // Check if directory exists
    try {
      await fs.access(courseDir);
    } catch {
      // Directory doesn't exist - nothing to delete
      logger.debug({
        courseDir,
      }, '[Files Cleanup] Course directory does not exist, skipping');

      return {
        success: true,
        filesDeleted: 0,
        bytesFreed: 0,
      };
    }

    // Get size before deletion for reporting
    const { size, fileCount } = await getDirectorySize(courseDir);

    // Delete the directory recursively
    await fs.rm(courseDir, { recursive: true, force: true });

    logger.info({
      organizationId,
      courseId,
      filesDeleted: fileCount,
      bytesFreed: size,
      courseDir,
    }, '[Files Cleanup] Course files deleted successfully');

    return {
      success: true,
      filesDeleted: fileCount,
      bytesFreed: size,
      deletedPath: courseDir,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error({
      organizationId,
      courseId,
      courseDir,
      error: errorMessage,
    }, '[Files Cleanup] Failed to delete course files');

    return {
      success: false,
      filesDeleted: 0,
      bytesFreed: 0,
      error: errorMessage,
    };
  }
}

/**
 * Check if course has uploaded files
 *
 * @param organizationId - Organization UUID
 * @param courseId - Course UUID
 * @returns True if files exist, false if no files or invalid UUIDs
 */
export async function hasUploadedFiles(
  organizationId: string,
  courseId: string
): Promise<boolean> {
  // Validate UUIDs to prevent path traversal
  if (!isValidUUID(organizationId) || !isValidUUID(courseId)) {
    logger.warn({
      organizationId,
      courseId,
    }, '[Files Cleanup] Invalid UUID format in hasUploadedFiles check');
    return false;
  }

  // Use centralized config for consistent default across codebase
  const uploadsDir = env.uploadsDir;
  const courseDir = path.join(uploadsDir, organizationId, courseId);

  // Additional safety - normalize and verify path is within uploads
  const normalizedPath = path.normalize(courseDir);
  const uploadsBasePath = path.normalize(uploadsDir);

  if (!normalizedPath.startsWith(uploadsBasePath)) {
    logger.warn({
      normalizedPath,
      uploadsBasePath,
    }, '[Files Cleanup] Path traversal attempt in hasUploadedFiles');
    return false;
  }

  try {
    await fs.access(courseDir);
    const entries = await fs.readdir(courseDir);
    return entries.length > 0;
  } catch {
    return false;
  }
}
