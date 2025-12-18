/**
 * Qdrant upload type definitions
 *
 * @module shared/qdrant/upload-types
 */

import type { SparseVector } from '../embeddings/bm25';

/**
 * Point structure for Qdrant upload with named vectors
 */
export interface QdrantUploadPoint {
  /** Unique point ID (chunk_id hash) */
  id: string | number;
  /** Named vectors for hybrid search */
  vector: {
    /** Dense semantic vector (Jina-v3) */
    dense: number[];
    /** Sparse BM25 vector (optional) */
    sparse?: SparseVector;
  };
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
 * Qdrant named vector for upload
 */
export interface QdrantNamedVector {
  dense: number[];
  sparse?: SparseVector;
}

/**
 * Qdrant upload point with named vectors
 */
export interface QdrantUpsertPoint {
  id: string | number;
  vector: QdrantNamedVector;
  payload: Record<string, unknown>;
}
