/**
 * BullMQ Orchestration System
 *
 * Main entry point for the course generation job orchestration system.
 * Exports all queue, worker, and monitoring functionality.
 *
 * @module orchestrator
 */

// Queue
export { getQueue, addJob, closeQueue, removeJobsByCourseId, QUEUE_NAME } from './queue';

// QueueEvents Backup Layer (Layer 2 Defense-in-Depth)
// Import for side effects - auto-initializes on module load
import './queue-events-backup';

// Worker
export { getWorker, startWorker, stopWorker, isWorkerRunning, getWorkerStatus } from './worker';

// Metrics
export { metricsStore, exportMetrics } from './metrics';

// UI
export { setupBullBoardUI, createMetricsRouter } from './ui';

// Handlers
export { BaseJobHandler, JobResult } from './handlers/base-handler';
export { testJobHandler } from './handlers/test-handler';
export { initializeJobHandler } from './handlers/initialize';
export {
  classifyError,
  shouldRetryJob,
  handleJobFailure,
  handleJobStalled,
  handleJobTimeout,
  ErrorType,
} from './handlers/error-handler';
