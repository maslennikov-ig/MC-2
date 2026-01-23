/**
 * Unified Storage Service for Enrichment Assets
 * @module stages/stage7-enrichments/services/unified-storage-service
 *
 * Facade that automatically switches between storage backends:
 * - Local development (localhost): Supabase Storage
 * - Server environments (dev/staging/prod): Local filesystem + nginx
 *
 * Backend selection is controlled by USE_LOCAL_STORAGE environment variable:
 * - USE_LOCAL_STORAGE=true → local storage (servers)
 * - USE_LOCAL_STORAGE not set or false → Supabase Storage (local dev)
 *
 * This allows seamless local development with Supabase while production
 * uses local storage to avoid egress traffic limits.
 */

import { logger } from '@/shared/logger';

// Local storage imports
import {
  uploadEnrichmentAssetLocal,
  uploadCourseCardLocal,
  buildPublicUrl as buildPublicUrlLocal,
  deleteEnrichmentAssetLocal,
  assetExistsLocal,
  getAssetMetadataLocal,
  verifyStoragePermissions as verifyLocalStoragePermissions,
} from './local-storage-service';

// Supabase storage imports
import {
  uploadEnrichmentAsset as uploadEnrichmentAssetSupabase,
  deleteEnrichmentAsset as deleteEnrichmentAssetSupabase,
  assetExists as assetExistsSupabase,
  getAssetMetadata as getAssetMetadataSupabase,
} from './storage-service';

import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { STORAGE_CONFIG } from '../config';

// ============================================================================
// BACKEND DETECTION
// ============================================================================

/**
 * Check if local storage backend should be used
 *
 * Returns true for server environments (dev/staging/prod) where:
 * - USE_LOCAL_STORAGE=true is set in environment
 *
 * Returns false for local development where:
 * - USE_LOCAL_STORAGE is not set or is 'false'
 */
export function useLocalStorage(): boolean {
  const envValue = process.env.USE_LOCAL_STORAGE;
  return envValue === 'true' || envValue === '1';
}

/**
 * Get current storage backend name for logging
 */
export function getStorageBackendName(): 'local' | 'supabase' {
  return useLocalStorage() ? 'local' : 'supabase';
}

// ============================================================================
// UNIFIED API
// ============================================================================

/**
 * Upload enrichment asset (cover, card, etc.)
 *
 * Automatically routes to correct backend based on environment.
 *
 * @param courseId - Course UUID
 * @param lessonId - Lesson UUID
 * @param enrichmentId - Enrichment UUID
 * @param buffer - File content
 * @param extension - File extension (default: 'webp')
 * @returns Storage path (relative for local, full path for Supabase)
 */
export async function uploadEnrichmentAsset(
  courseId: string,
  lessonId: string,
  enrichmentId: string,
  buffer: Buffer,
  extension = 'webp'
): Promise<string> {
  const backend = getStorageBackendName();

  logger.debug(
    { courseId, lessonId, enrichmentId, extension, backend },
    'Unified storage: uploading enrichment asset'
  );

  if (useLocalStorage()) {
    return uploadEnrichmentAssetLocal(courseId, lessonId, enrichmentId, buffer, extension);
  }

  // Supabase requires mimeType
  const mimeTypes: Record<string, string> = {
    webp: 'image/webp',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
  };
  const mimeType = mimeTypes[extension] || 'application/octet-stream';

  return uploadEnrichmentAssetSupabase(
    courseId,
    lessonId,
    enrichmentId,
    buffer,
    mimeType,
    extension
  );
}

/**
 * Upload course-level card (no lessonId)
 *
 * For local storage: {courseId}/card.webp
 * For Supabase: {courseId}/course-card/card.webp
 *
 * @param courseId - Course UUID
 * @param buffer - File content
 * @param extension - File extension (default: 'webp')
 * @returns Storage path
 */
export async function uploadCourseCard(
  courseId: string,
  buffer: Buffer,
  extension = 'webp'
): Promise<string> {
  const backend = getStorageBackendName();

  logger.debug({ courseId, extension, backend }, 'Unified storage: uploading course card');

  if (useLocalStorage()) {
    return uploadCourseCardLocal(courseId, buffer, extension);
  }

  // Supabase: use a pseudo-lessonId for course cards
  const mimeTypes: Record<string, string> = {
    webp: 'image/webp',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
  };
  const mimeType = mimeTypes[extension] || 'application/octet-stream';

  return uploadEnrichmentAssetSupabase(
    courseId,
    'course-card',
    'card',
    buffer,
    mimeType,
    extension
  );
}

/**
 * Build public URL for asset
 *
 * For local storage: https://ai.megacampus.ru/storage/enrichments/{path}
 * For Supabase: https://xxx.supabase.co/storage/v1/object/public/{bucket}/{path}
 *
 * @param storagePath - Path returned from upload function
 * @returns Full public URL
 */
export function buildPublicUrl(storagePath: string): string {
  if (useLocalStorage()) {
    return buildPublicUrlLocal(storagePath);
  }

  // Supabase public URL
  const supabase = getSupabaseAdmin();
  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_CONFIG.BUCKET_NAME).getPublicUrl(storagePath);

  return publicUrl;
}

/**
 * Delete enrichment asset
 *
 * @param storagePath - Path returned from upload function
 */
export async function deleteEnrichmentAsset(storagePath: string): Promise<void> {
  const backend = getStorageBackendName();

  logger.debug({ storagePath, backend }, 'Unified storage: deleting asset');

  if (useLocalStorage()) {
    return deleteEnrichmentAssetLocal(storagePath);
  }

  return deleteEnrichmentAssetSupabase(storagePath);
}

/**
 * Check if asset exists
 *
 * @param storagePath - Path to check
 * @returns True if asset exists
 */
export async function assetExists(storagePath: string): Promise<boolean> {
  if (useLocalStorage()) {
    return assetExistsLocal(storagePath);
  }

  return assetExistsSupabase(storagePath);
}

/**
 * Get asset metadata
 *
 * @param storagePath - Path to check
 * @returns Metadata or null if not found
 */
export async function getAssetMetadata(
  storagePath: string
): Promise<{ size: number; mimeType: string; lastModified: string } | null> {
  if (useLocalStorage()) {
    return getAssetMetadataLocal(storagePath);
  }

  return getAssetMetadataSupabase(storagePath);
}

/**
 * Verify storage permissions on startup
 *
 * For local storage: checks write access to storage directory
 * For Supabase: no verification needed (always accessible)
 */
export async function verifyStoragePermissions(): Promise<void> {
  const backend = getStorageBackendName();

  logger.info({ backend }, 'Unified storage: verifying permissions');

  if (useLocalStorage()) {
    await verifyLocalStoragePermissions();
  }

  // Supabase doesn't need verification
  logger.info({ backend }, 'Unified storage: permissions verified');
}

/**
 * Log current storage configuration
 *
 * Call during worker/service startup to confirm which backend is active.
 */
export function logStorageConfig(): void {
  const backend = getStorageBackendName();
  const localPath = process.env.ENRICHMENTS_LOCAL_PATH || '/app/data/enrichments';
  const publicUrl = process.env.ENRICHMENTS_PUBLIC_URL || '/storage/enrichments';

  if (useLocalStorage()) {
    logger.info(
      {
        backend,
        localPath,
        publicUrl,
        useLocalStorage: process.env.USE_LOCAL_STORAGE,
      },
      'Storage backend: LOCAL FILESYSTEM'
    );
  } else {
    logger.info(
      {
        backend,
        bucket: STORAGE_CONFIG.BUCKET_NAME,
        useLocalStorage: process.env.USE_LOCAL_STORAGE || 'not set',
      },
      'Storage backend: SUPABASE STORAGE'
    );
  }
}
