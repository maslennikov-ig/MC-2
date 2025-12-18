/**
 * Qdrant Batch Upload with Hybrid Vectors
 *
 * Implements batch upload of chunks to Qdrant with:
 * - Dense vectors (768D Jina-v3 embeddings)
 * - Sparse vectors (Production BM25 with IDF for lexical search)
 * - Comprehensive metadata payload
 * - Efficient batching (100-500 vectors per request)
 * - Automatic database status updates (file_catalog.vector_status)
 *
 * Supports hybrid search (semantic + lexical) using Reciprocal Rank Fusion (RRF).
 *
 * @module shared/qdrant/upload
 */

import { qdrantClient } from './client';
import { COLLECTION_CONFIG } from './create-collection';
import type { EmbeddingResult } from '../embeddings/generate';
import { createClient } from '@supabase/supabase-js';
import type { UploadOptions, UploadResult } from './upload-types';
import {
  buildCorpusStatistics,
  toQdrantPoint,
  toUpsertPoints,
  getUniqueDocumentIds,
} from './upload-helpers';
import { logger } from '../logger/index.js';

/**
 * Default upload options
 */
const DEFAULT_UPLOAD_OPTIONS: Required<UploadOptions> = {
  batch_size: 100,
  collection_name: COLLECTION_CONFIG.name,
  wait: true,
  enable_sparse: false,
};

/**
 * Cached Supabase client instance
 */
let supabaseClient: ReturnType<typeof createClient> | null = null;

/**
 * Creates or returns cached Supabase client for database operations
 */
function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return supabaseClient;
}

/**
 * Updates vector_status in file_catalog table
 */
export async function updateVectorStatus(
  documentId: string,
  status: 'indexed' | 'failed' | 'pending' | 'indexing',
  errorMessage?: string,
  chunkCount?: number
): Promise<void> {
  try {
    const supabase = getSupabaseClient();

    // Build update data as a plain object to avoid type conflicts with Supabase
    const updateData: Record<string, unknown> = {
      vector_status: status,
      updated_at: new Date().toISOString(),
    };

    // Add chunk_count if provided
    if (chunkCount !== undefined) {
      updateData.chunk_count = chunkCount;
    }

    // Add error_message if status is failed
    if (status === 'failed' && errorMessage) {
      updateData.error_message = errorMessage;
      logger.error({ documentId, errorMessage }, 'Vector indexing failed for document');
    } else if (status === 'indexed') {
      // Clear error_message on successful indexing
      updateData.error_message = null;
    }

    // Use type assertion to work around Supabase type inference issues
    // The Supabase client is being inferred as having a never type for updates
    const { error } = await (supabase as any).from('file_catalog').update(updateData).eq('id', documentId);

    if (error) {
      logger.error({ documentId, err: error.message }, 'Failed to update vector_status in database');
      throw error;
    }

    logger.info({
      status,
      documentId,
      chunk_count: chunkCount
    }, 'Updated vector_status');
  } catch (error) {
    logger.error({
      err: error instanceof Error ? error.message : String(error)
    }, 'Error updating vector_status');
    throw error;
  }
}

/**
 * Uploads chunks to Qdrant in batches
 *
 * @example
 * ```typescript
 * const uploadResult = await uploadChunksToQdrant(
 *   embeddingResults,
 *   {
 *     batch_size: 100,
 *     enable_sparse: true,
 *   }
 * );
 * ```
 */
export async function uploadChunksToQdrant(
  embeddingResults: EmbeddingResult[],
  options: UploadOptions = {}
): Promise<UploadResult> {
  const config = { ...DEFAULT_UPLOAD_OPTIONS, ...options };
  const startTime = Date.now();

  try {
    // Validate inputs
    if (embeddingResults.length === 0) {
      return {
        points_uploaded: 0,
        batch_count: 0,
        duration_ms: 0,
        success: true,
      };
    }

    // Build corpus statistics if sparse vectors are enabled
    if (config.enable_sparse) {
      buildCorpusStatistics(embeddingResults);
    }

    // Convert to Qdrant points
    const points = embeddingResults.map((result) => toQdrantPoint(result, config.enable_sparse));

    let uploadedCount = 0;
    let batchCount = 0;

    // Upload in batches
    for (let i = 0; i < points.length; i += config.batch_size) {
      const batch = points.slice(i, i + config.batch_size);

      logger.info({
        batchNumber: batchCount + 1,
        batchSize: batch.length,
        range: `${i + 1}-${Math.min(i + batch.length, points.length)}`,
        totalPoints: points.length
      }, 'Uploading batch to Qdrant');

      // Convert to upsert points with named vectors
      const uploadPoints = toUpsertPoints(batch, config.enable_sparse);

      try {
        // Safe: Cast through unknown since QdrantNamedVector structure is compatible with SDK
        // but TypeScript can't verify the index signature match
        await qdrantClient.upsert(config.collection_name, {
          wait: config.wait,
          points: uploadPoints as unknown as {
            id: string | number;
            vector: Record<string, number[]>;
            payload?: Record<string, unknown>;
          }[],
        });

        uploadedCount += batch.length;
        batchCount++;

        logger.info({ batchNumber: batchCount }, 'Batch uploaded successfully');
      } catch (uploadError: unknown) {
        // Type-safe error handling
        const errorData = uploadError as {
          status?: string;
          message?: string;
          data?: unknown;
        };

        logger.error({
          status: errorData.status,
          message: errorData.message,
          data: errorData.data
        }, 'Qdrant upload error');
        throw uploadError;
      }
    }

    const duration = Date.now() - startTime;

    logger.info({
      pointsUploaded: uploadedCount,
      batchCount,
      durationMs: duration
    }, 'Upload complete');

    // Update vector_status to 'indexed' for all documents
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      const uniqueDocumentIds = getUniqueDocumentIds(embeddingResults);

      logger.info({
        documentCount: uniqueDocumentIds.length
      }, 'Updating vector_status for documents');

      for (const documentId of uniqueDocumentIds) {
        try {
          // Count chunks for this document
          const chunkCount = embeddingResults.filter(
            result => result.chunk.document_id === documentId
          ).length;

          await updateVectorStatus(documentId, 'indexed', undefined, chunkCount);
        } catch (error) {
          logger.error({
            documentId,
            err: error instanceof Error ? error.message : String(error)
          }, 'Failed to update status for document');
        }
      }
    } else {
      logger.warn({ reason: 'Supabase not configured' }, 'Skipping vector_status update');
    }

    return {
      points_uploaded: uploadedCount,
      batch_count: batchCount,
      duration_ms: duration,
      success: true,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error({ err: errorMessage }, 'Upload failed');

    // Update vector_status to 'failed' for all documents
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      const uniqueDocumentIds = getUniqueDocumentIds(embeddingResults);

      logger.info({
        documentCount: uniqueDocumentIds.length
      }, 'Updating vector_status to failed for documents');

      for (const documentId of uniqueDocumentIds) {
        try {
          // Count chunks for this document
          const chunkCount = embeddingResults.filter(
            result => result.chunk.document_id === documentId
          ).length;

          await updateVectorStatus(documentId, 'failed', errorMessage, chunkCount);
        } catch (updateError) {
          logger.error({
            documentId,
            err: updateError instanceof Error ? updateError.message : String(updateError)
          }, 'Failed to update status for document');
        }
      }
    } else {
      logger.warn({ reason: 'Supabase not configured' }, 'Skipping vector_status update');
    }

    return {
      points_uploaded: 0,
      batch_count: 0,
      duration_ms: duration,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Deletes chunks from Qdrant by document ID
 */
export async function deleteChunksByDocumentId(
  documentId: string,
  collectionName: string = COLLECTION_CONFIG.name
): Promise<number> {
  try {
    const result = await qdrantClient.delete(collectionName, {
      filter: {
        must: [
          {
            key: 'document_id',
            match: { value: documentId },
          },
        ],
      },
      wait: true,
    });

    logger.info({ documentId, collectionName }, 'Deleted points for document');
    return typeof result === 'object' && 'operation_id' in result ? 1 : 0;
  } catch (error) {
    throw new Error(
      `Failed to delete chunks for document ${documentId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Deletes chunks from Qdrant by course ID
 */
export async function deleteChunksByCourseId(
  courseId: string,
  collectionName: string = COLLECTION_CONFIG.name
): Promise<number> {
  try {
    const result = await qdrantClient.delete(collectionName, {
      filter: {
        must: [
          {
            key: 'course_id',
            match: { value: courseId },
          },
        ],
      },
      wait: true,
    });

    logger.info({ courseId, collectionName }, 'Deleted points for course');
    return typeof result === 'object' && 'operation_id' in result ? 1 : 0;
  } catch (error) {
    throw new Error(
      `Failed to delete chunks for course ${courseId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Gets collection statistics
 */
export async function getCollectionStats(
  collectionName: string = COLLECTION_CONFIG.name
): Promise<{
  points_count: number;
  indexed_vectors_count: number;
  segments_count: number;
}> {
  try {
    const collection = await qdrantClient.getCollection(collectionName);

    return {
      points_count: collection.points_count || 0,
      indexed_vectors_count: collection.indexed_vectors_count || 0,
      segments_count: collection.segments_count || 0,
    };
  } catch (error) {
    throw new Error(
      `Failed to get collection stats: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Re-export types for convenience
export type {
  UploadOptions,
  UploadResult,
  QdrantUploadPoint,
  QdrantNamedVector,
  QdrantUpsertPoint,
} from './upload-types';
