/**
 * Vector Lifecycle Management with Content Deduplication
 *
 * Implements reference counting to prevent duplicate vector generation when identical
 * content is uploaded multiple times across courses or organizations.
 *
 * Key Features:
 * - SHA-256 hash-based deduplication
 * - Reference counting with cascade delete
 * - Vector duplication for cross-course content sharing
 * - Storage quota management per organization
 * - Atomic operations with proper error handling
 *
 * Cost Savings:
 * - Prevents duplicate Docling processing (saves API time)
 * - Prevents duplicate Jina embedding costs (~$0.02/M tokens)
 * - Prevents duplicate Qdrant vector storage
 *
 * @module shared/qdrant/lifecycle
 */

import { createClient } from '@supabase/supabase-js';
import { qdrantClient } from './client';
import { COLLECTION_CONFIG } from './create-collection';
import { logger } from '../logger/index.js';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import type {
  FileCatalogRow,
  OrganizationRow,
  OrganizationDeduplicationStats,
  DuplicateFileResult,
  QdrantVectorPayload,
} from '../types/database-queries';

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
 * File upload metadata
 */
export interface FileUploadMetadata {
  filename: string;
  organization_id: string;
  course_id: string;
  mime_type: string;
  user_id?: string;
}

/**
 * File upload result
 */
export interface FileUploadResult {
  /** Created file_catalog record ID */
  file_id: string;
  /** Whether file was deduplicated (reused existing content) */
  deduplicated: boolean;
  /** Original file ID if deduplicated */
  original_file_id?: string;
  /** Vector indexing status */
  vector_status: 'pending' | 'indexing' | 'indexed' | 'failed';
  /** Number of vectors duplicated (if deduplicated) */
  vectors_duplicated?: number;
}

/**
 * File delete result
 */
export interface FileDeleteResult {
  /** Whether physical file was deleted */
  physical_file_deleted: boolean;
  /** Remaining reference count (0 if physical file deleted) */
  remaining_references: number;
  /** Number of vectors deleted */
  vectors_deleted: number;
  /** Storage bytes freed */
  storage_freed_bytes: number;
}

/**
 * Creates a Supabase client for database operations
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  }

  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Calculates SHA-256 hash of file buffer
 *
 * @param buffer - File buffer
 * @returns Hex-encoded SHA-256 hash
 */
export function calculateFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Extracts file extension from filename
 *
 * @param filename - File name
 * @returns File extension (e.g., 'pdf', 'docx')
 */
function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * Generates numeric ID from string (for Qdrant point IDs)
 *
 * @param str - Input string
 * @returns Numeric ID
 */
function generateNumericId(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Updates storage quota for an organization
 *
 * @param organizationId - Organization ID
 * @param fileSize - File size in bytes
 * @param operation - 'increment' or 'decrement'
 * @throws Error if quota exceeded
 */
export async function updateStorageQuota(
  organizationId: string,
  fileSize: number,
  operation: 'increment' | 'decrement'
): Promise<void> {
  const supabase = getSupabaseClient();
  const delta = operation === 'increment' ? fileSize : -fileSize;

  // Update storage_used_bytes atomically
  const { error: updateError } = await supabase.rpc('update_organization_storage', {
    p_organization_id: organizationId,
    p_delta_bytes: delta,
  });

  if (updateError) {
    // If RPC doesn't exist, fall back to direct SQL update
    logger.warn({
      organizationId,
      err: updateError.message,
    }, 'RPC update_organization_storage not available, using direct update');
    const { error } = await supabase
      .from('organizations')
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq('id', organizationId);

    if (error) {
      throw new Error(`Failed to update storage quota: ${error.message}`);
    }

    // Manually update storage_used_bytes via SQL (no direct .raw() support in client)
    // In production, ensure the RPC function exists
    logger.warn({
      organizationId,
    }, 'Storage quota update may be inaccurate without RPC function');
  }

  // Check if quota exceeded (only on increment)
  if (operation === 'increment') {
    const { data: org, error } = await supabase
      .from('organizations')
      .select('storage_used_bytes, storage_quota_bytes')
      .eq('id', organizationId)
      .single();

    if (error || !org) {
      throw new Error(`Failed to check storage quota: ${error?.message || 'No data'}`);
    }

    const typedOrg = org as Pick<OrganizationRow, 'storage_used_bytes' | 'storage_quota_bytes'>;

    if (typedOrg.storage_used_bytes > typedOrg.storage_quota_bytes) {
      // Rollback the increment
      await updateStorageQuota(organizationId, fileSize, 'decrement');

      throw new Error(
        `Storage quota exceeded: ${typedOrg.storage_used_bytes} / ${typedOrg.storage_quota_bytes} bytes`
      );
    }
  }
}

/**
 * Duplicates vectors for a new course (when reusing content)
 *
 * This creates new Qdrant points with SAME embeddings but DIFFERENT metadata
 * (different document_id, course_id, organization_id) to maintain isolation.
 *
 * @param originalFileId - Original file ID with existing vectors
 * @param newFileId - New file ID (reference) to associate vectors with
 * @param newCourseId - New course ID
 * @param newOrganizationId - New organization ID
 * @returns Number of vectors duplicated
 */
export async function duplicateVectorsForNewCourse(
  originalFileId: string,
  newFileId: string,
  newCourseId: string,
  newOrganizationId: string
): Promise<number> {
  logger.info({
    originalFileId,
    newFileId,
    newCourseId,
    newOrganizationId,
  }, 'Duplicating vectors for new course');

  try {
    // 1. Get all vectors for original file from Qdrant
    const scrollResult = await qdrantClient.scroll(COLLECTION_CONFIG.name, {
      filter: {
        must: [{ key: 'document_id', match: { value: originalFileId } }],
      },
      limit: 10000, // Adjust based on expected max chunks per document
      with_payload: true,
      with_vector: true,
    });

    const originalPoints = scrollResult.points || [];

    if (originalPoints.length === 0) {
      throw new Error(`No vectors found for original file ${originalFileId}`);
    }

    logger.info({
      vectorCount: originalPoints.length,
      originalFileId,
    }, 'Found vectors to duplicate');

    // 2. Create new points with SAME vectors but DIFFERENT metadata
    const newPoints = originalPoints.map(point => {
      const payload = (point.payload as QdrantVectorPayload) || {};

      // Generate new unique point ID - use chunk_id if available, otherwise timestamp
      const chunkIdStr = payload.chunk_id ? String(payload.chunk_id) : String(Date.now());
      const newPointId = generateNumericId(`${newFileId}-${chunkIdStr}`);

      // Extract vector (handle both named and unnamed vectors)
      const vectorData = point.vector;

      return {
        id: newPointId,
        vector: vectorData as number[] | Record<string, number[]>,
        payload: {
          ...payload,
          // Update multi-tenancy fields (CRITICAL for isolation)
          document_id: newFileId,
          course_id: newCourseId,
          organization_id: newOrganizationId,
          // Keep all other metadata the same (content, chunk_id, page_number, etc.)
          indexed_at: new Date().toISOString(),
          last_updated: new Date().toISOString(),
        },
      };
    });

    // 3. Upload to Qdrant in batches
    const BATCH_SIZE = 100;
    let uploadedCount = 0;

    for (let i = 0; i < newPoints.length; i += BATCH_SIZE) {
      const batch = newPoints.slice(i, i + BATCH_SIZE);

      logger.info({
        batchNumber: Math.floor(i / BATCH_SIZE) + 1,
        batchSize: batch.length,
        newCourseId,
      }, 'Uploading vector duplication batch');

      await qdrantClient.upsert(COLLECTION_CONFIG.name, {
        wait: true,
        points: batch,
      });

      uploadedCount += batch.length;
    }

    logger.info({
      duplicatedCount: uploadedCount,
      newCourseId,
    }, 'Vector duplication complete');
    return uploadedCount;
  } catch (error) {
    logger.error({
      err: error instanceof Error ? error.message : String(error),
      originalFileId,
      newFileId,
      newCourseId,
    }, 'Failed to duplicate vectors');
    throw new Error(
      `Vector duplication failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Handles file upload with automatic deduplication
 *
 * Process:
 * 1. Calculate SHA-256 hash
 * 2. Check for existing file with same hash (cross-organization)
 * 3. If exists: Create reference, duplicate vectors, skip processing
 * 4. If new: Create original record, save file, queue for processing
 *
 * @param fileBuffer - File buffer
 * @param metadata - Upload metadata
 * @returns Upload result
 */
export async function handleFileUpload(
  fileBuffer: Buffer,
  metadata: FileUploadMetadata
): Promise<FileUploadResult> {
  const supabase = getSupabaseClient();

  // 1. Calculate SHA-256 hash
  const hash = calculateFileHash(fileBuffer);
  logger.info({
    filename: metadata.filename,
    hashPrefix: hash.substring(0, 16),
    organizationId: metadata.organization_id,
    courseId: metadata.course_id,
  }, 'Calculated file hash');

  // 2. Check for existing file with same hash (using database function)
  const duplicateResult = await supabase.rpc('find_duplicate_file', {
    p_hash: hash,
  });

  if (duplicateResult.error) {
    logger.error({
      err: duplicateResult.error.message,
      hash,
    }, 'Error searching for duplicate');
    // Continue with normal upload on search error
  }

  // If existingFile is an array, take the first result
  const duplicateFile = (Array.isArray(duplicateResult.data)
    ? duplicateResult.data[0]
    : duplicateResult.data) as DuplicateFileResult | null | undefined;

  if (duplicateFile && duplicateFile.file_id) {
    // ============================================
    // DEDUPLICATION PATH: File already exists
    // ============================================
    logger.info({
      existingFileId: duplicateFile.file_id,
      hashPrefix: hash.substring(0, 16),
      filename: metadata.filename,
    }, 'Content deduplication detected');

    try {
      // 3a. Create reference record in file_catalog
      const insertResult = await supabase
        .from('file_catalog')
        .insert({
          organization_id: metadata.organization_id,
          course_id: metadata.course_id,
          filename: metadata.filename,
          file_type: getFileExtension(metadata.filename),
          file_size: fileBuffer.length,
          storage_path: duplicateFile.storage_path, // SAME storage path
          hash: hash, // SAME hash
          mime_type: metadata.mime_type,
          vector_status: 'indexed' as const, // Already indexed!
          original_file_id: duplicateFile.file_id, // Reference to original
          reference_count: 1, // This reference counts as 1
          parsed_content: duplicateFile.parsed_content, // Reuse parsed content
          markdown_content: duplicateFile.markdown_content, // Reuse markdown
        })
        .select()
        .single();

      if (insertResult.error || !insertResult.data) {
        throw new Error(
          `Failed to create reference record: ${insertResult.error?.message || 'No data returned'}`
        );
      }

      const typedFileRecord = insertResult.data as FileCatalogRow;

      // 3b. Increment reference_count on original file (using database function)
      const refCountResult = await supabase.rpc('increment_file_reference_count', {
        p_file_id: duplicateFile.file_id,
      });

      if (refCountResult.error) {
        logger.warn({
          err: refCountResult.error.message,
          fileId: duplicateFile.file_id,
        }, 'Failed to increment reference count');
        // Continue anyway - reference was created
      }

      // 3c. Duplicate vectors for new course
      const vectorsDuplicated = await duplicateVectorsForNewCourse(
        duplicateFile.file_id,
        typedFileRecord.id,
        metadata.course_id,
        metadata.organization_id
      );

      // 3d. Update storage quota (BOTH organizations pay for their reference)
      await updateStorageQuota(metadata.organization_id, fileBuffer.length, 'increment');

      logger.info({
        newFileId: typedFileRecord.id,
        vectorsDuplicated,
        originalFileId: duplicateFile.file_id,
      }, 'Deduplication complete');

      return {
        file_id: typedFileRecord.id,
        deduplicated: true,
        original_file_id: duplicateFile.file_id,
        vector_status: 'indexed',
        vectors_duplicated: vectorsDuplicated,
      };
    } catch (error) {
      logger.error({
        err: error instanceof Error ? error.message : String(error),
        filename: metadata.filename,
      }, 'Deduplication failed, falling back to normal upload');
      // Fall through to normal upload path
    }
  }

  // ============================================
  // NORMAL PATH: New unique file
  // ============================================
  logger.info({
    hashPrefix: hash.substring(0, 16),
    filename: metadata.filename,
    organizationId: metadata.organization_id,
  }, 'No deduplication: Processing new file');

  // Save file to disk
  const storagePath = await saveFileToDisk(fileBuffer, metadata);

  // Create file_catalog record
  const insertResult = await supabase
    .from('file_catalog')
    .insert({
      organization_id: metadata.organization_id,
      course_id: metadata.course_id,
      filename: metadata.filename,
      file_type: getFileExtension(metadata.filename),
      file_size: fileBuffer.length,
      storage_path: storagePath,
      hash: hash,
      mime_type: metadata.mime_type,
      vector_status: 'pending' as const,
      original_file_id: null, // This IS the original
      reference_count: 1, // First reference
    })
    .select()
    .single();

  if (insertResult.error || !insertResult.data) {
    throw new Error(
      `Failed to create file record: ${insertResult.error?.message || 'No data returned'}`
    );
  }

  const typedFileRecord = insertResult.data as FileCatalogRow;

  // Update storage quota
  await updateStorageQuota(metadata.organization_id, fileBuffer.length, 'increment');

  logger.info({
    fileId: typedFileRecord.id,
    filename: metadata.filename,
    vectorStatus: 'pending',
  }, 'Created new file record');

  return {
    file_id: typedFileRecord.id,
    deduplicated: false,
    vector_status: 'pending',
  };
}

/**
 * Saves file to disk
 *
 * @param fileBuffer - File buffer
 * @param metadata - Upload metadata
 * @returns Storage path
 */
async function saveFileToDisk(
  fileBuffer: Buffer,
  metadata: FileUploadMetadata
): Promise<string> {
  // Generate storage path: uploads/{organization_id}/{course_id}/{timestamp}-{filename}
  const timestamp = Date.now();
  const sanitizedFilename = metadata.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const relativePath = `${metadata.organization_id}/${metadata.course_id}/${timestamp}-${sanitizedFilename}`;

  const uploadsDir = process.env.UPLOADS_DIR || '/tmp/megacampus/uploads';
  const fullDir = `${uploadsDir}/${metadata.organization_id}/${metadata.course_id}`;
  const fullPath = `${uploadsDir}/${relativePath}`;

  // Create directory if it doesn't exist
  await fs.mkdir(fullDir, { recursive: true });

  // Write file
  await fs.writeFile(fullPath, fileBuffer);

  logger.info({
    storagePath: fullPath,
    organizationId: metadata.organization_id,
    courseId: metadata.course_id,
  }, 'Saved file to disk');

  return fullPath;
}

/**
 * Handles file deletion with reference counting
 *
 * Process:
 * 1. Get file record
 * 2. Delete vectors for this course_id only
 * 3. Decrement reference_count on original
 * 4. Delete file_catalog record for this reference
 * 5. If reference_count = 0, delete physical file and all remaining vectors
 *
 * @param fileId - File ID to delete
 * @returns Delete result
 */
export async function handleFileDelete(fileId: string): Promise<FileDeleteResult> {
  const supabase = getSupabaseClient();

  // 1. Get file record
  const result = await supabase.from('file_catalog').select('*').eq('id', fileId).single();

  if (result.error || !result.data) {
    throw new Error(
      `File ${fileId} not found: ${result.error?.message || 'No record'}`
    );
  }

  const typedFileRecord = result.data as FileCatalogRow;

  logger.info({
    fileId,
    filename: typedFileRecord.filename,
    organizationId: typedFileRecord.organization_id,
    courseId: typedFileRecord.course_id,
  }, 'Deleting file');

  // 2. Determine if this is original or reference
  const isOriginal = typedFileRecord.original_file_id === null;
  const targetFileId = isOriginal ? fileId : (typedFileRecord.original_file_id as string);

  logger.info({
    fileId,
    isOriginal,
    targetFileId,
  }, 'File deletion metadata');

  // 3. Delete vectors from Qdrant (only for THIS document_id and course_id)
  logger.info({
    documentId: fileId,
    courseId: typedFileRecord.course_id,
  }, 'Deleting vectors');

  // Delete operation is fire-and-forget, result not needed
  await qdrantClient.delete(COLLECTION_CONFIG.name, {
    filter: {
      must: [
        { key: 'document_id', match: { value: fileId } },
        { key: 'course_id', match: { value: typedFileRecord.course_id } },
      ],
    },
    wait: true,
  });

  logger.info({
    courseId: typedFileRecord.course_id,
    documentId: fileId,
  }, 'Deleted vectors for course');

  // 4. Decrement reference_count on original (or self if original)
  const refCountResult = await supabase.rpc('decrement_file_reference_count', {
    p_file_id: targetFileId,
  });

  if (refCountResult.error) {
    logger.warn({
      err: refCountResult.error.message,
      targetFileId,
    }, 'Failed to decrement reference count');
  }

  const remainingReferences = (refCountResult.data as number | null) || 0;
  logger.info({
    remainingReferences,
    targetFileId,
  }, 'Reference count after decrement');

  // 5. Delete file_catalog record for THIS reference
  const { error: deleteRecordError } = await supabase
    .from('file_catalog')
    .delete()
    .eq('id', fileId);

  if (deleteRecordError) {
    logger.warn({
      err: deleteRecordError.message,
      fileId,
    }, 'Failed to delete file record');
  }

  // 6. Update storage quota
  await updateStorageQuota(
    typedFileRecord.organization_id,
    typedFileRecord.file_size,
    'decrement'
  );

  let physicalFileDeleted = false;

  // 7. If reference_count reached 0, delete physical file and all vectors
  if (remainingReferences === 0) {
    logger.info({
      targetFileId,
      storagePath: typedFileRecord.storage_path,
    }, 'Reference count reached zero, deleting physical file');

    try {
      // Delete physical file from disk
      await fs.unlink(typedFileRecord.storage_path);
      physicalFileDeleted = true;
      logger.info({
        storagePath: typedFileRecord.storage_path,
      }, 'Deleted physical file');
    } catch (error) {
      logger.warn({
        err: error instanceof Error ? error.message : String(error),
        storagePath: typedFileRecord.storage_path,
      }, 'Failed to delete physical file');
    }

    // Delete ALL remaining vectors for this document (cleanup)
    try {
      await qdrantClient.delete(COLLECTION_CONFIG.name, {
        filter: {
          must: [{ key: 'document_id', match: { value: targetFileId } }],
        },
        wait: true,
      });
      logger.info({
        targetFileId,
      }, 'Deleted all remaining vectors');
    } catch (error) {
      logger.warn({
        err: error instanceof Error ? error.message : String(error),
        targetFileId,
      }, 'Failed to delete remaining vectors');
    }

    // Delete file_catalog record for original (if different from current)
    if (!isOriginal) {
      try {
        await supabase.from('file_catalog').delete().eq('id', targetFileId);
        logger.info({
          targetFileId,
        }, 'Deleted original file record');
      } catch (error) {
        logger.warn({
          err: error instanceof Error ? error.message : String(error),
          targetFileId,
        }, 'Failed to delete original record');
      }
    }
  }

  return {
    physical_file_deleted: physicalFileDeleted,
    remaining_references: remainingReferences,
    vectors_deleted: 1, // Approximate
    storage_freed_bytes: typedFileRecord.file_size,
  };
}

/**
 * Deletes all vectors for a specific document from Qdrant
 *
 * Used when retrying document processing to clean up stale vectors
 * before re-indexing. This prevents orphaned vectors from accumulating
 * when document processing is retried.
 *
 * @param documentId - Document/File UUID
 * @param courseId - Course UUID (for additional filtering)
 * @returns Number of vectors deleted (approximate, Qdrant doesn't return exact count)
 */
export async function deleteVectorsForDocument(
  documentId: string,
  courseId: string
): Promise<{ deleted: boolean }> {
  logger.info({
    documentId,
    courseId,
  }, 'Deleting vectors for document before retry');

  try {
    await qdrantClient.delete(COLLECTION_CONFIG.name, {
      filter: {
        must: [
          { key: 'document_id', match: { value: documentId } },
          { key: 'course_id', match: { value: courseId } },
        ],
      },
      wait: true,
    });

    logger.info({
      documentId,
      courseId,
    }, 'Vectors deleted successfully for document');

    return { deleted: true };
  } catch (error) {
    // Log but don't fail - vector cleanup is best-effort
    // The upsert during re-processing will overwrite matching vectors anyway
    logger.warn({
      documentId,
      courseId,
      error: error instanceof Error ? error.message : String(error),
    }, 'Failed to delete vectors for document (non-fatal, will be overwritten on upsert)');

    return { deleted: false };
  }
}

/**
 * Deletes ALL vectors for a course from Qdrant
 *
 * Used when deleting a course to clean up all associated vectors.
 * This prevents orphaned vectors from accumulating in Qdrant.
 *
 * @param courseId - Course UUID
 * @returns Object with deleted status and approximate count
 */
export async function deleteVectorsForCourse(
  courseId: string
): Promise<{ deleted: boolean; approximateCount: number }> {
  // Validate UUID to prevent invalid queries
  if (!isValidUUID(courseId)) {
    logger.error({ courseId }, 'Invalid course UUID format');
    return { deleted: false, approximateCount: 0 };
  }

  logger.info({
    courseId,
  }, 'Deleting all vectors for course');

  try {
    // Count vectors to be deleted (approximate for performance)
    //
    // Using approximate count (exact: false) because:
    // - Qdrant approximate counts are ~99% accurate for most datasets
    // - Exact counts can be 10-100x slower on large collections
    // - For cleanup operations, approximate counts are sufficient for logging/metrics
    // - We're deleting all matching vectors regardless of the count
    const countResult = await qdrantClient.count(COLLECTION_CONFIG.name, {
      filter: {
        must: [{ key: 'course_id', match: { value: courseId } }],
      },
      exact: false,
    });

    const approximateCount = countResult.count;

    if (approximateCount === 0) {
      logger.info({ courseId }, 'No vectors found for course');
      return { deleted: true, approximateCount: 0 };
    }

    // Delete all vectors for this course
    await qdrantClient.delete(COLLECTION_CONFIG.name, {
      filter: {
        must: [{ key: 'course_id', match: { value: courseId } }],
      },
      wait: true,
    });

    logger.info({
      courseId,
      approximateCount,
    }, 'Vectors deleted successfully for course');

    return { deleted: true, approximateCount };
  } catch (error) {
    logger.error({
      courseId,
      error: error instanceof Error ? error.message : String(error),
    }, 'Failed to delete vectors for course');

    return { deleted: false, approximateCount: 0 };
  }
}

/**
 * Gets deduplication statistics for an organization
 *
 * @param organizationId - Organization ID
 * @returns Deduplication statistics
 */
export async function getDeduplicationStats(organizationId: string): Promise<{
  original_files: number;
  reference_files: number;
  storage_saved_bytes: number;
  total_storage_bytes: number;
}> {
  const supabase = getSupabaseClient();

  const result = await supabase
    .from('organization_deduplication_stats')
    .select('*')
    .eq('organization_id', organizationId)
    .single();

  if (result.error || !result.data) {
    throw new Error(
      `Failed to get deduplication stats: ${result.error?.message || 'No data'}`
    );
  }

  const typedData = result.data as OrganizationDeduplicationStats;

  return {
    original_files: typedData.original_files_count || 0,
    reference_files: typedData.reference_files_count || 0,
    storage_saved_bytes: typedData.storage_saved_bytes || 0,
    total_storage_bytes: typedData.total_storage_used_bytes || 0,
  };
}
