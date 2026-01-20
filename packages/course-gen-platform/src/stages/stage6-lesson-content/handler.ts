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
export { processStage6Job, updateJobProgress, processWithFallback } from './services/job-processor';

export {
  saveLessonContent,
  handlePartialSuccess,
  markForReview,
} from './services/database-service';

export { detectLanguage, getJobTimeout } from './services/model-service';

// Re-export Stage6Output for backward compatibility
export type { Stage6Output } from './orchestrator';

// Wrapper for orchestrator integration
import type { JobResult } from '../../orchestrator/handlers/base-handler';
import type { Job } from 'bullmq';
import type { Stage6JobInput, Stage6JobResult } from './types';
import { processStage6Job } from './services/job-processor';

/**
 * Process Stage 6 job and return standard JobResult
 *
 * This wrapper converts Stage6JobResult to JobResult for compatibility
 * with the orchestrator's adaptHandler pattern. The full Stage6JobResult
 * is preserved in the `data` field for downstream access to metrics and
 * lessonContent.
 *
 * @param job - BullMQ job with Stage6JobInput data
 * @param token - Optional job token for lock management (required for pause/delay)
 * @returns Standard JobResult with Stage6JobResult in data field
 */
export async function processStage6JobAsJobResult(
  job: Job<Stage6JobInput>,
  token?: string
): Promise<JobResult> {
  const result: Stage6JobResult = await processStage6Job(job, token);

  return {
    success: result.success,
    message: result.success
      ? `Lesson ${result.lessonId} generated (quality: ${(result.metrics.qualityScore * 100).toFixed(0)}%)`
      : result.errors.join(', '),
    data: result, // Full Stage6JobResult preserved for metrics, lessonContent access
    error: result.errors.length > 0 ? result.errors[0] : undefined,
  };
}
