/**
 * Qdrant Vector Database Module
 *
 * This module provides access to the Qdrant vector database client and related utilities.
 * It exports a singleton client instance configured via environment variables.
 *
 * @module shared/qdrant
 */

export { qdrantClient, type QdrantClient } from './client';
export { createCourseEmbeddingsCollection, COLLECTION_CONFIG } from './create-collection';
export {
  ensureCourseEmbeddingsCollection,
  verifyCourseEmbeddingsCollection,
  type EnsureCollectionOptions,
  type SchemaVerificationResult,
} from './collection-manager';
export { COLLECTION_CREATE_PARAMS, PAYLOAD_INDEXES } from './collection-schema';

// Upload utilities
export {
  uploadChunksToQdrant,
  deleteChunksByDocumentId,
  deleteChunksByCourseId,
  getCollectionStats,
  type QdrantUploadPoint,
  type UploadResult,
  type UploadOptions,
} from './upload';

// Search utilities
export {
  searchChunks,
  getParentChunk,
  getSiblingChunks,
  type SearchResult,
  type SearchFilters,
  type SearchOptions,
  type ResolvedSearchOptions,
  type SearchMetadata,
  type SearchResponse,
} from './search';

// Lifecycle management with deduplication
export {
  handleFileUpload,
  handleFileDelete,
  duplicateVectorsForNewCourse,
  updateStorageQuota,
  calculateFileHash,
  getDeduplicationStats,
  type FileUploadMetadata,
  type FileUploadResult,
  type FileDeleteResult,
} from './lifecycle';
