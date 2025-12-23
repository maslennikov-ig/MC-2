/**
 * Stage 6 BullMQ Job Handler
 * @module stages/stage6-lesson-content/handler
 *
 * BullMQ worker that processes Stage 6 jobs for lesson content generation
 * with 30 concurrent workers and streaming progress updates.
 *
 * Reference:
 * - BullMQ v5.x documentation (Context7)
 * - specs/010-stages-456-pipeline/data-model.md
 */

// Re-export core types
export * from './types';

// Re-export configuration
export * from './config';

// Re-export factory functions (main entry points)
export { createStage6Worker, createStage6Queue, gracefulShutdown } from './factory';

// Re-export internal functions for testing and direct usage if needed
export {
  processStage6Job,
  updateJobProgress,
  processWithFallback,
} from './services/job-processor';

export {
  saveLessonContent,
  handlePartialSuccess,
  markForReview,
} from './services/database-service';

export {
  detectLanguage,
  getJobTimeout,
} from './services/model-service';

// Re-export Stage6Output for backward compatibility
export type { Stage6Output } from './orchestrator';