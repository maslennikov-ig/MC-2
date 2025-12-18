/**
 * Background Jobs
 *
 * Scheduled and on-demand jobs for the course generation platform.
 *
 * @module jobs
 */

// Re-export RAG cleanup job
export {
  executeRagCleanupJob,
  startScheduledCleanup,
  stopScheduledCleanup,
  isScheduledCleanupRunning,
  getLastCleanupResult,
  getJobConfig,
  type RagCleanupJobConfig,
  type RagCleanupJobResult,
} from './rag-cleanup-job';
