/**
 * Helper Functions for Vector Lifecycle Management
 * @module shared/qdrant/lifecycle-helpers
 *
 * Extracted helper functions to reduce complexity and line count in lifecycle.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../logger/index.js';
import type { FileCatalogRow, DuplicateFileResult } from '../types/database-queries';
import { duplicateVectorsForNewCourse, updateStorageQuota } from './lifecycle';
import * as fs from 'fs/promises';

/**
 * File upload metadata (re-export from lifecycle for internal use)
 */
export interface FileUploadMetadata {
  filename: string;
  organization_id: string;
  course_id: string;
  mime_type: string;
  user_id?: string;
}

/**
 * Extracts file extension from filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * Finds duplicate file by hash
 */
export async function findDuplicateFile(
  supabase: SupabaseClient,
  hash: string
): Promise<DuplicateFileResult | null> {
  const duplicateResult = await supabase.rpc('find_duplicate_file', {
    p_hash: hash,
  });

  if (duplicateResult.error) {
    logger.error(
      {
        err: duplicateResult.error.message,
        hash,
      },
      'Error searching for duplicate'
    );
    return null;
  }

  // If existingFile is an array, take the first result
  const duplicateFile = (
    Array.isArray(duplicateResult.data) ? duplicateResult.data[0] : duplicateResult.data
  ) as DuplicateFileResult | null | undefined;

  return duplicateFile || null;
}

/**
 * Creates a reference file record for deduplicated content
 */
export async function createReferenceFileRecord(
  supabase: SupabaseClient,
  metadata: FileUploadMetadata,
  fileBuffer: Buffer,
  hash: string,
  duplicateFile: DuplicateFileResult
): Promise<FileCatalogRow> {
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

  return insertResult.data as FileCatalogRow;
}

/**
 * Increments reference count on original file
 */
export async function incrementReferenceCount(
  supabase: SupabaseClient,
  fileId: string
): Promise<void> {
  const refCountResult = await supabase.rpc('increment_file_reference_count', {
    p_file_id: fileId,
  });

  if (refCountResult.error) {
    logger.warn(
      {
        err: refCountResult.error.message,
        fileId,
      },
      'Failed to increment reference count'
    );
  }
}

/**
 * Processes deduplicated file upload
 */
export async function processDeduplicatedUpload(
  supabase: SupabaseClient,
  fileBuffer: Buffer,
  metadata: FileUploadMetadata,
  hash: string,
  duplicateFile: DuplicateFileResult
): Promise<{ file_id: string; vectors_duplicated: number }> {
  // Create reference record in file_catalog
  const fileRecord = await createReferenceFileRecord(
    supabase,
    metadata,
    fileBuffer,
    hash,
    duplicateFile
  );

  // Increment reference_count on original file
  await incrementReferenceCount(supabase, duplicateFile.file_id);

  // Duplicate vectors for new course
  const vectorsDuplicated = await duplicateVectorsForNewCourse(
    duplicateFile.file_id,
    fileRecord.id,
    metadata.course_id,
    metadata.organization_id
  );

  // Update storage quota (BOTH organizations pay for their reference)
  await updateStorageQuota(metadata.organization_id, fileBuffer.length, 'increment');

  logger.info(
    {
      newFileId: fileRecord.id,
      vectorsDuplicated,
      originalFileId: duplicateFile.file_id,
    },
    'Deduplication complete'
  );

  return {
    file_id: fileRecord.id,
    vectors_duplicated: vectorsDuplicated,
  };
}

/**
 * Saves file to disk
 */
export async function saveFileToDisk(
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

  logger.info(
    {
      storagePath: fullPath,
      organizationId: metadata.organization_id,
      courseId: metadata.course_id,
    },
    'Saved file to disk'
  );

  return fullPath;
}

/**
 * Creates a new file record for unique content
 */
export async function createNewFileRecord(
  supabase: SupabaseClient,
  metadata: FileUploadMetadata,
  fileBuffer: Buffer,
  hash: string,
  storagePath: string
): Promise<FileCatalogRow> {
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

  return insertResult.data as FileCatalogRow;
}

/**
 * Decrements reference count and returns remaining count
 */
export async function decrementReferenceCount(
  supabase: SupabaseClient,
  fileId: string
): Promise<number> {
  const refCountResult = await supabase.rpc('decrement_file_reference_count', {
    p_file_id: fileId,
  });

  if (refCountResult.error) {
    logger.warn(
      {
        err: refCountResult.error.message,
        fileId,
      },
      'Failed to decrement reference count'
    );
  }

  return (refCountResult.data as number | null) || 0;
}

/**
 * Deletes physical file from disk
 */
export async function deletePhysicalFile(storagePath: string): Promise<boolean> {
  try {
    await fs.unlink(storagePath);
    logger.info({ storagePath }, 'Deleted physical file');
    return true;
  } catch (error) {
    logger.warn(
      {
        err: error instanceof Error ? error.message : String(error),
        storagePath,
      },
      'Failed to delete physical file'
    );
    return false;
  }
}

/**
 * Deletes file catalog record
 */
export async function deleteFileCatalogRecord(
  supabase: SupabaseClient,
  fileId: string
): Promise<void> {
  const { error: deleteRecordError } = await supabase
    .from('file_catalog')
    .delete()
    .eq('id', fileId);

  if (deleteRecordError) {
    logger.warn(
      {
        err: deleteRecordError.message,
        fileId,
      },
      'Failed to delete file record'
    );
  }
}
