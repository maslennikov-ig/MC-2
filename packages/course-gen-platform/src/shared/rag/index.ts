/**
 * RAG (Retrieval-Augmented Generation) Services
 *
 * Provides RAG context management including:
 * - Context cleanup after course completion
 * - Scheduled cleanup for expired contexts
 *
 * @module shared/rag
 */

// Re-export cleanup service
export {
  cleanupCourseRagContext,
  cleanupExpiredRagContexts,
  hasRagContext,
  getRagContextCount,
  deleteExpiredEntriesDirect,
  type CleanupResult,
  type BulkCleanupResult,
  type CleanupOptions,
} from './rag-cleanup';
