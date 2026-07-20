/**
 * Qdrant upload type definitions
 *
 * @module shared/qdrant/upload-types
 */

import type { Schemas } from '@qdrant/js-client-rest';

export type QdrantBm25Document = Schemas['Document'];

/**
 * Qdrant named vectors accepted by the pinned REST client.
 */
export interface QdrantNamedVector {
  [name: string]: Schemas['Vector'] | undefined;
  dense: number[];
  sparse?: QdrantBm25Document;
}

/**
 * Point structure for Qdrant upload with named vectors
 */
export interface QdrantUploadPoint {
  /** Unique deterministic document-scoped UUID */
  id: string;
  /** Named vectors for hybrid search */
  vector: QdrantNamedVector;
  /** Chunk metadata payload */
  payload: Record<string, unknown>;
}

/**
 * Upload result statistics
 */
export interface UploadResult {
  /** Number of points uploaded */
  points_uploaded: number;
  /** Number of batches processed */
  batch_count: number;
  /** Upload duration in milliseconds */
  duration_ms: number;
  /** Success status */
  success: boolean;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Batch upload options
 */
export interface UploadOptions {
  /** Batch size (default: 100, max: 500) */
  batch_size?: number;
  /** Collection name (default: 'course_embeddings') */
  collection_name?: string;
  /** Wait for indexing to complete (default: true) */
  wait?: boolean;
  /** Generate sparse vectors (BM25) for hybrid search (default: false) */
  enable_sparse?: boolean;
}

/**
 * Supabase update data for vector status
 */
export interface VectorStatusUpdate {
  vector_status: 'indexed' | 'failed' | 'pending' | 'indexing';
  updated_at: string;
  chunk_count?: number;
  error_message?: string | null;
}

/**
 * Qdrant upload point with named vectors
 */
export interface QdrantUpsertPoint {
  id: string;
  vector: QdrantNamedVector;
  payload: Record<string, unknown>;
}
