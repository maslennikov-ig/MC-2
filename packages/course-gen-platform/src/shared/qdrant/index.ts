/**
 * Qdrant Vector Database Module
 *
 * This module provides access to the Qdrant vector database client and related utilities.
 * It exports a singleton client instance configured via environment variables.
 *
 * @module shared/qdrant
 */

export { qdrantClient, type QdrantClient } from './client';
export {
  createCourseEmbeddingsCollection,
  COLLECTION_CONFIG,
  PAYLOAD_INDEXES,
} from './create-collection';

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
