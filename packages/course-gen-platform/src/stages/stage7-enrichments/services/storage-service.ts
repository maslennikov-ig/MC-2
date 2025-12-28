/**
 * Stage 7 Storage Service
 * @module stages/stage7-enrichments/services/storage-service
 *
 * Supabase Storage operations for enrichment assets (audio, video files).
 * Handles file upload, signed URL generation, and cleanup.
 */

import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { logger } from '@/shared/logger';
import { STORAGE_CONFIG } from '../config';

/**
 * Upload enrichment asset to Supabase Storage
 *
 * @param courseId - Course UUID (for path organization)
 * @param lessonId - Lesson UUID (for path organization)
 * @param enrichmentId - Enrichment UUID (for unique filename)
 * @param buffer - File content as Buffer
 * @param mimeType - MIME type of the file (e.g., 'audio/mpeg')
 * @param extension - File extension (e.g., 'mp3')
 * @returns Storage path of uploaded file
 */
export async function uploadEnrichmentAsset(
  courseId: string,
  lessonId: string,
  enrichmentId: string,
  buffer: Buffer,
  mimeType: string,
  extension: string
): Promise<string> {
  const supabaseAdmin = getSupabaseAdmin();

  // Construct storage path: {courseId}/{lessonId}/{enrichmentId}.{ext}
  const storagePath = `${courseId}/${lessonId}/${enrichmentId}.${extension}`;

  try {
    // Validate file size
    if (buffer.length > STORAGE_CONFIG.MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `File size ${buffer.length} exceeds maximum ${STORAGE_CONFIG.MAX_FILE_SIZE_BYTES} bytes`
      );
    }

    // Upload to Supabase Storage
    const { data, error } = await supabaseAdmin.storage
      .from(STORAGE_CONFIG.BUCKET_NAME)
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: true, // Allow overwriting on regeneration
      });

    if (error) {
      logger.error(
        {
          storagePath,
          mimeType,
          fileSize: buffer.length,
          error: error.message,
        },
        'Failed to upload enrichment asset'
      );
      throw error;
    }

    logger.info(
      {
        storagePath,
        mimeType,
        fileSize: buffer.length,
        path: data.path,
      },
      'Enrichment asset uploaded successfully'
    );

    return data.path;
  } catch (error) {
    logger.error(
      {
        storagePath,
        error: error instanceof Error ? error.message : String(error),
      },
      'Error uploading enrichment asset'
    );
    throw error;
  }
}

/**
 * Get signed URL for asset playback
 *
 * @param assetPath - Storage path of the asset
 * @param expiresIn - Expiration time in seconds (default: 1 hour)
 * @returns Signed URL for playback
 */
export async function getSignedUrl(
  assetPath: string,
  expiresIn: number = STORAGE_CONFIG.SIGNED_URL_EXPIRES_IN
): Promise<string> {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { data, error } = await supabaseAdmin.storage
      .from(STORAGE_CONFIG.BUCKET_NAME)
      .createSignedUrl(assetPath, expiresIn);

    if (error) {
      logger.error(
        {
          assetPath,
          expiresIn,
          error: error.message,
        },
        'Failed to create signed URL'
      );
      throw error;
    }

    logger.debug(
      {
        assetPath,
        expiresIn,
      },
      'Signed URL created'
    );

    return data.signedUrl;
  } catch (error) {
    logger.error(
      {
        assetPath,
        error: error instanceof Error ? error.message : String(error),
      },
      'Error creating signed URL'
    );
    throw error;
  }
}

/**
 * Delete enrichment asset from storage
 *
 * @param assetPath - Storage path of the asset to delete
 */
export async function deleteEnrichmentAsset(assetPath: string): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { error } = await supabaseAdmin.storage
      .from(STORAGE_CONFIG.BUCKET_NAME)
      .remove([assetPath]);

    if (error) {
      logger.error(
        {
          assetPath,
          error: error.message,
        },
        'Failed to delete enrichment asset'
      );
      throw error;
    }

    logger.info({ assetPath }, 'Enrichment asset deleted');
  } catch (error) {
    logger.error(
      {
        assetPath,
        error: error instanceof Error ? error.message : String(error),
      },
      'Error deleting enrichment asset'
    );
    throw error;
  }
}

/**
 * Check if asset exists in storage
 *
 * @param assetPath - Storage path to check
 * @returns True if asset exists
 */
export async function assetExists(assetPath: string): Promise<boolean> {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    // Parse path into folder and filename
    const pathParts = assetPath.split('/');
    const fileName = pathParts.pop() || '';
    const folderPath = pathParts.join('/');

    const { data, error } = await supabaseAdmin.storage
      .from(STORAGE_CONFIG.BUCKET_NAME)
      .list(folderPath, {
        search: fileName,
      });

    if (error) {
      logger.warn(
        {
          assetPath,
          error: error.message,
        },
        'Error checking asset existence'
      );
      return false;
    }

    return data.some((file) => file.name === fileName);
  } catch (error) {
    logger.error(
      {
        assetPath,
        error: error instanceof Error ? error.message : String(error),
      },
      'Error checking asset existence'
    );
    return false;
  }
}

/**
 * Get asset metadata (size, MIME type, etc.)
 *
 * @param assetPath - Storage path of the asset
 * @returns Asset metadata or null if not found
 */
export async function getAssetMetadata(
  assetPath: string
): Promise<{
  size: number;
  mimeType: string;
  lastModified: string;
} | null> {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    // Parse path into folder and filename
    const pathParts = assetPath.split('/');
    const fileName = pathParts.pop() || '';
    const folderPath = pathParts.join('/');

    const { data, error } = await supabaseAdmin.storage
      .from(STORAGE_CONFIG.BUCKET_NAME)
      .list(folderPath, {
        search: fileName,
      });

    if (error || !data || data.length === 0) {
      return null;
    }

    const file = data.find((f) => f.name === fileName);
    if (!file) {
      return null;
    }

    return {
      size: file.metadata?.size || 0,
      mimeType: file.metadata?.mimetype || 'application/octet-stream',
      lastModified: file.updated_at || file.created_at || new Date().toISOString(),
    };
  } catch (error) {
    logger.error(
      {
        assetPath,
        error: error instanceof Error ? error.message : String(error),
      },
      'Error getting asset metadata'
    );
    return null;
  }
}

/**
 * Build storage path from components
 *
 * @param courseId - Course UUID
 * @param lessonId - Lesson UUID
 * @param enrichmentId - Enrichment UUID
 * @param extension - File extension
 * @returns Storage path string
 */
export function buildAssetPath(
  courseId: string,
  lessonId: string,
  enrichmentId: string,
  extension: string
): string {
  return `${courseId}/${lessonId}/${enrichmentId}.${extension}`;
}
