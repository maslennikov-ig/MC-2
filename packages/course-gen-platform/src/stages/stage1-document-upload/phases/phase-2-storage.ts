/**
 * Phase 2: File Storage
 *
 * Handles file storage operations:
 * 1. Reserve storage quota atomically (prevents race conditions)
 * 2. Generate file ID and storage path
 * 3. Decode base64 content and verify size
 * 4. Create directory structure
 * 5. Write file to disk
 * 6. Calculate SHA256 hash
 * 7. Insert metadata into file_catalog
 *
 * Includes comprehensive rollback on any failure.
 *
 * Model: None (no LLM invocation - filesystem and database operations)
 * Output: File ID, storage path, and hash
 *
 * @module stages/stage1-document-upload/phases/phase-2-storage
 */

import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs/promises';

import { getSupabaseAdmin } from '../../../shared/supabase/admin';
import { incrementQuota, decrementQuota } from '../../../shared/validation/quota-enforcer';
import { logger } from '../../../shared/logger/index.js';
import { duplicateVectorsForNewCourse } from '../../../shared/qdrant/lifecycle';
import type { Stage1Input, Phase2StorageOutput, RollbackContext } from '../types';
import type { DuplicateFileResult } from '../../../shared/types/database-queries';
import type { Json } from '@megacampus/shared-types';

/**
 * UUID validation regex (RFC 4122)
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Hash prefix length for consistent logging (M5)
 */
const HASH_PREFIX_LENGTH = 16;

/**
 * Size difference tolerance for base64 decoding variations (L2)
 * Allows up to 100 bytes difference to account for:
 * - Base64 padding variations
 * - Line ending differences (CRLF vs LF)
 * - Character encoding edge cases
 */
const SIZE_TOLERANCE_BYTES = 100;

/**
 * Validate UUID string format
 * @param uuid - String to validate
 * @returns true if valid UUID format
 */
function isValidUUID(uuid: string): boolean {
  return UUID_REGEX.test(uuid);
}

/**
 * Storage error code type
 */
export type StorageErrorCode = 'BAD_REQUEST' | 'INTERNAL_SERVER_ERROR';

/**
 * Storage error with rollback context
 * Extends Error for proper throw/catch semantics
 */
export class StorageError extends Error {
  /** Error code for programmatic handling */
  readonly code: StorageErrorCode;
  /** Rollback context for cleanup */
  readonly rollback: RollbackContext;

  constructor(code: StorageErrorCode, message: string, rollback: RollbackContext) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.rollback = rollback;
  }
}

/**
 * Phase 2: Store uploaded file
 *
 * Performs atomic file storage with comprehensive rollback:
 * - Reserves quota before any file operations
 * - Validates path to prevent directory traversal
 * - Decodes base64 and verifies file size
 * - Creates directory structure
 * - Writes file to disk
 * - Calculates hash for deduplication
 * - Inserts database record
 *
 * On any failure, all resources are cleaned up.
 *
 * @param input - Stage 1 upload input
 * @returns Storage output with file ID and path
 * @throws StorageError if storage fails (includes rollback context)
 *
 * @example
 * ```typescript
 * try {
 *   const result = await runPhase2Storage(input);
 *   console.log(`File stored: ${result.fileId}`);
 * } catch (error) {
 *   if (isStorageError(error)) {
 *     await performRollback(error.rollback);
 *   }
 * }
 * ```
 */
export async function runPhase2Storage(
  input: Stage1Input
): Promise<Phase2StorageOutput> {
  const startTime = Date.now();
  const supabase = getSupabaseAdmin();

  // H7: Validate UUIDs to prevent path traversal and SQL issues
  if (!isValidUUID(input.organizationId)) {
    throw new Error(`Invalid organization ID format: ${input.organizationId}`);
  }
  if (!isValidUUID(input.courseId)) {
    throw new Error(`Invalid course ID format: ${input.courseId}`);
  }
  if (!isValidUUID(input.userId)) {
    throw new Error(`Invalid user ID format: ${input.userId}`);
  }

  // Initialize rollback context
  const rollback: RollbackContext = {
    quotaReserved: false,
    quotaAmount: 0,
    organizationId: input.organizationId,
  };

  logger.debug(
    {
      courseId: input.courseId,
      filename: input.filename,
      fileSize: input.fileSize,
    },
    '[Phase 2] Starting file storage'
  );

  try {
    // Step 1: Atomically reserve storage quota BEFORE upload
    // This prevents race conditions where multiple concurrent uploads could exceed quota
    // NOTE (M1): incrementQuota/decrementQuota use database row locking for atomicity
    await incrementQuota(input.organizationId, input.fileSize);
    rollback.quotaReserved = true;
    rollback.quotaAmount = input.fileSize;

    logger.debug(
      { organizationId: input.organizationId, fileSize: input.fileSize },
      '[Phase 2] Quota reserved'
    );

    // Step 2: Generate file ID and determine storage path
    const fileId = crypto.randomUUID();

    // H6: Sanitize file extension to prevent path traversal
    const rawExtension = path.extname(input.filename).toLowerCase();
    // Allow only alphanumeric and dots, max 10 chars
    const fileExtension = rawExtension.replace(/[^a-z0-9.]/gi, '').substring(0, 10) || '.bin';

    const uploadDir = path.join(process.cwd(), 'uploads', input.organizationId, input.courseId);
    const storagePath = path.join(uploadDir, `${fileId}${fileExtension}`);

    // Validate path to prevent directory traversal attacks
    const normalizedPath = path.normalize(storagePath);
    if (!normalizedPath.startsWith(path.join(process.cwd(), 'uploads'))) {
      throw createStorageError('BAD_REQUEST', 'Invalid file path', rollback);
    }

    // Step 3: Decode base64 content
    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(input.fileContent, 'base64');
    } catch {
      throw createStorageError('BAD_REQUEST', 'Invalid base64 content', rollback);
    }

    // Step 4: Verify decoded file size matches declared size
    const actualSize = fileBuffer.length;
    const sizeDifference = Math.abs(actualSize - input.fileSize);
    if (sizeDifference > SIZE_TOLERANCE_BYTES) {
      throw createStorageError(
        'BAD_REQUEST',
        `File size mismatch: declared ${input.fileSize} bytes, actual ${actualSize} bytes (tolerance: ${SIZE_TOLERANCE_BYTES} bytes)`,
        rollback
      );
    }

    // H5: Adjust quota if actual size differs from declared size
    if (actualSize !== input.fileSize) {
      const quotaDelta = actualSize - input.fileSize;
      if (quotaDelta > 0) {
        // Need more quota
        await incrementQuota(input.organizationId, quotaDelta);
        logger.debug(
          { declared: input.fileSize, actual: actualSize, delta: quotaDelta },
          '[Phase 2] Reserved additional quota'
        );
      } else {
        // Release excess quota
        await decrementQuota(input.organizationId, -quotaDelta);
        logger.debug(
          { declared: input.fileSize, actual: actualSize, delta: quotaDelta },
          '[Phase 2] Released excess quota'
        );
      }
    }

    // Update rollback context with actual size
    rollback.quotaAmount = actualSize;

    // Step 5: Create directory structure
    try {
      await fs.mkdir(uploadDir, { recursive: true });
    } catch (error) {
      throw createStorageError(
        'INTERNAL_SERVER_ERROR',
        `Failed to create upload directory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        rollback
      );
    }

    // Step 6: Write file to disk
    try {
      await fs.writeFile(storagePath, fileBuffer);
      rollback.filePath = storagePath;
    } catch (error) {
      throw createStorageError(
        'INTERNAL_SERVER_ERROR',
        `Failed to save file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        rollback
      );
    }

    logger.debug(
      { fileId, storagePath },
      '[Phase 2] File written to disk'
    );

    // Step 7: Calculate SHA256 hash for deduplication
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const hashPrefix = fileHash.substring(0, HASH_PREFIX_LENGTH) + '...';

    logger.debug(
      { fileId, hashPrefix },
      '[Phase 2] File hash calculated, checking for duplicates'
    );

    // Step 7.5: Check for duplicate file (cross-organization deduplication)
    const duplicateResult = await supabase.rpc('find_duplicate_file', {
      p_hash: fileHash,
    });

    // M2: Add transient error detection for duplicate search failures
    if (duplicateResult.error) {
      const errorMsg = duplicateResult.error.message.toLowerCase();
      const isTransient = errorMsg.includes('timeout') ||
                          errorMsg.includes('connection') ||
                          errorMsg.includes('network');

      if (isTransient) {
        throw createStorageError(
          'INTERNAL_SERVER_ERROR',
          `Deduplication check failed (transient): ${duplicateResult.error.message}`,
          rollback
        );
      }

      // Non-transient: log and continue with normal upload
      logger.warn({
        err: duplicateResult.error.message,
        hashPrefix,
      }, '[Phase 2] Deduplication check failed (non-transient), continuing with normal upload');
    }

    // M3: Simplified array handling (RPC always returns array)
    const duplicateFile = (duplicateResult.data?.[0] ?? null) as DuplicateFileResult | null;

    if (duplicateFile && duplicateFile.file_id && !duplicateResult.error) {
      // ============================================
      // DEDUPLICATION PATH: File already exists
      // ============================================
      logger.info({
        existingFileId: duplicateFile.file_id,
        hashPrefix,
        filename: input.filename,
        courseId: input.courseId,
      }, '[Phase 2] Content deduplication detected');

      // Track if reference count was incremented for cleanup purposes
      let refCountIncremented = false;

      try {
        // C1: Reorder operations - delete file AFTER database operations succeed

        // Step 1: Create reference record in file_catalog
        const relativeStoragePath = path.relative(process.cwd(), storagePath);
        const { error: insertError } = await supabase
          .from('file_catalog')
          .insert({
            id: fileId,
            organization_id: input.organizationId,
            course_id: input.courseId,
            filename: input.filename,
            file_type: fileExtension.replace('.', ''),
            file_size: actualSize,
            storage_path: duplicateFile.storage_path, // SAME storage path as original
            hash: fileHash, // SAME hash
            mime_type: input.mimeType,
            vector_status: 'indexed', // Already indexed!
            original_file_id: duplicateFile.file_id, // Reference to original
            reference_count: 1, // This reference counts as 1
            parsed_content: duplicateFile.parsed_content, // Reuse parsed content
            markdown_content: duplicateFile.markdown_content, // Reuse markdown
            processed_content: duplicateFile.processed_content,
            processing_method: duplicateFile.processing_method,
            summary_metadata: duplicateFile.summary_metadata as Json | null,
            chunk_count: duplicateFile.chunk_count,
            original_name: duplicateFile.original_name ?? input.filename,
          });

        if (insertError) {
          rollback.fileId = fileId;
          throw createStorageError(
            'INTERNAL_SERVER_ERROR',
            `Failed to create reference record: ${insertError.message}`,
            rollback
          );
        }

        // Step 2: Increment reference_count on original file
        // NOTE: This will be automatic with database trigger (C3) once deployed
        // For now, keep manual increment with graceful degradation
        const refCountResult = await supabase.rpc('increment_file_reference_count', {
          p_file_id: duplicateFile.file_id,
        });

        if (refCountResult.error) {
          // M4: Make reference count blocking (non-atomic without trigger)
          logger.error({
            err: refCountResult.error.message,
            fileId: duplicateFile.file_id,
          }, '[Phase 2] Failed to increment reference count - rolling back');

          // Delete the reference record we just created
          await supabase.from('file_catalog').delete().eq('id', fileId);

          throw createStorageError(
            'INTERNAL_SERVER_ERROR',
            `Failed to increment reference count: ${refCountResult.error.message}`,
            rollback
          );
        }

        refCountIncremented = true;

        // Step 3: Duplicate vectors for new course (H3: make blocking)
        let vectorsDuplicated = 0;
        try {
          vectorsDuplicated = await duplicateVectorsForNewCourse(
            duplicateFile.file_id,
            fileId,
            input.courseId,
            input.organizationId
          );

          if (vectorsDuplicated === 0) {
            throw new Error('No vectors found to duplicate');
          }
        } catch (vectorError) {
          logger.error({
            err: vectorError instanceof Error ? vectorError.message : String(vectorError),
            originalFileId: duplicateFile.file_id,
            newFileId: fileId,
          }, '[Phase 2] Vector duplication failed - rolling back deduplication');

          // H3: Clean up and fall back to normal upload
          throw vectorError;
        }

        // Step 4: Delete redundant file from disk (ONLY after all DB operations succeed)
        try {
          await fs.unlink(storagePath);
          rollback.filePath = undefined; // H1: Clear so rollback won't try to delete
          logger.debug({ storagePath }, '[Phase 2] Deleted redundant file from disk');
        } catch (unlinkError) {
          logger.warn({
            err: unlinkError instanceof Error ? unlinkError.message : String(unlinkError),
            storagePath,
          }, '[Phase 2] Failed to delete redundant file (non-fatal - file still exists but database is consistent)');
          // Non-fatal - file still exists but database is consistent
        }

        const durationMs = Date.now() - startTime;

        logger.info({
          fileId,
          vectorsDuplicated,
          originalFileId: duplicateFile.file_id,
          durationMs,
        }, '[Phase 2] Deduplication complete');

        // Note: Quota is still reserved for deduplication path (user pays for reference)
        return {
          fileId,
          storagePath: relativeStoragePath,
          fileHash,
          actualSize,
          durationMs,
          deduplicated: true,
          originalFileId: duplicateFile.file_id,
          vectorsDuplicated,
        };
      } catch (error) {
        logger.error({
          err: error instanceof Error ? error.message : String(error),
          filename: input.filename,
        }, '[Phase 2] Deduplication failed, falling back to normal upload path');

        // C2: CRITICAL - Clean up reference record and decrement count before fallback
        try {
          await supabase.from('file_catalog').delete().eq('id', fileId);
          logger.debug({ fileId }, '[Phase 2] Cleaned up reference record before fallback');
        } catch (cleanupError) {
          logger.warn({
            err: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
            fileId,
          }, '[Phase 2] Failed to clean up reference record (non-fatal)');
        }

        // C2: CRITICAL - Decrement reference count if it was incremented
        if (refCountIncremented) {
          try {
            await supabase.rpc('decrement_file_reference_count', {
              p_file_id: duplicateFile.file_id,
            });
            logger.debug({ fileId: duplicateFile.file_id }, '[Phase 2] Decremented reference count after deduplication failure');
          } catch (cleanupError) {
            logger.warn({
              err: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
              fileId: duplicateFile.file_id,
            }, '[Phase 2] Failed to decrement reference count (non-fatal)');
          }
        }

        // Re-write file to disk if needed (file may have been deleted already)
        if (rollback.filePath === undefined) {
          try {
            await fs.writeFile(storagePath, fileBuffer);
            rollback.filePath = storagePath;
            logger.debug({ storagePath }, '[Phase 2] Re-wrote file to disk after deduplication failure');
          } catch (rewriteError) {
            throw createStorageError(
              'INTERNAL_SERVER_ERROR',
              `Failed to recover after deduplication failure: ${rewriteError instanceof Error ? rewriteError.message : 'Unknown error'}`,
              rollback
            );
          }
        }
        // Fall through to normal upload path
      }
    }

    // ============================================
    // NORMAL PATH: New unique file
    // ============================================
    logger.info({
      hashPrefix,
      filename: input.filename,
      organizationId: input.organizationId,
    }, '[Phase 2] No deduplication: Processing new file');

    // Step 8: Insert file metadata into database
    const relativeStoragePath = path.relative(process.cwd(), storagePath);
    const { error: insertError } = await supabase
      .from('file_catalog')
      .insert({
        id: fileId,
        organization_id: input.organizationId,
        course_id: input.courseId,
        filename: input.filename,
        file_type: fileExtension.replace('.', ''),
        file_size: actualSize,
        storage_path: relativeStoragePath,
        hash: fileHash,
        mime_type: input.mimeType,
        vector_status: 'pending',
      });

    if (insertError) {
      rollback.fileId = fileId;
      throw createStorageError(
        'INTERNAL_SERVER_ERROR',
        `Failed to save file metadata: ${insertError.message}`,
        rollback
      );
    }

    const durationMs = Date.now() - startTime;

    logger.info(
      {
        fileId,
        storagePath: relativeStoragePath,
        actualSize,
        hashPrefix,
        durationMs,
      },
      '[Phase 2] File stored successfully'
    );

    return {
      fileId,
      storagePath: relativeStoragePath,
      fileHash,
      actualSize,
      durationMs,
      deduplicated: false,
    };
  } catch (error) {
    // Perform rollback for any error
    await performRollback(rollback);
    throw error;
  }
}

/**
 * Perform rollback of storage operations
 *
 * Cleans up resources in reverse order:
 * 1. Delete file from disk (if written)
 * 2. Release quota reservation
 */
export async function performRollback(rollback: RollbackContext): Promise<void> {
  logger.warn(
    {
      quotaReserved: rollback.quotaReserved,
      quotaAmount: rollback.quotaAmount,
      filePath: rollback.filePath,
    },
    '[Phase 2] Performing rollback'
  );

  // Step 1: Delete file from disk if written
  if (rollback.filePath) {
    try {
      await fs.unlink(rollback.filePath);
      logger.debug({ filePath: rollback.filePath }, '[Phase 2] Rollback: File deleted');
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          filePath: rollback.filePath,
        },
        '[Phase 2] Rollback: Failed to delete file'
      );
    }
  }

  // Step 2: Release quota reservation
  if (rollback.quotaReserved && rollback.quotaAmount > 0) {
    try {
      await decrementQuota(rollback.organizationId, rollback.quotaAmount);
      logger.debug(
        { organizationId: rollback.organizationId, amount: rollback.quotaAmount },
        '[Phase 2] Rollback: Quota released'
      );
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          organizationId: rollback.organizationId,
          quotaAmount: rollback.quotaAmount,
        },
        '[Phase 2] Rollback: Failed to release quota'
      );
    }
  }
}

/**
 * Create a storage error with rollback context
 */
function createStorageError(
  code: StorageErrorCode,
  message: string,
  rollback: RollbackContext
): StorageError {
  return new StorageError(code, message, rollback);
}

/**
 * Type guard to check if error is a StorageError
 */
export function isStorageError(error: unknown): error is StorageError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'rollback' in error
  );
}
