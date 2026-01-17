/**
 * BullMQ Sandboxed Processor
 *
 * This module is executed in a separate Node.js process/worker thread
 * by BullMQ when using sandboxed processing mode. Running in a separate
 * process prevents job stalling issues when the main process is blocked.
 *
 * Benefits of sandboxed processing:
 * - Process isolation: crashes don't affect the main worker
 * - No stalled jobs from blocking code
 * - Better CPU utilization on multi-core systems
 * - Independent memory management per job
 *
 * @see https://docs.bullmq.io/guide/workers/sandboxed-processors
 * @module orchestrator/processor
 */

import { SandboxedJob, Job } from 'bullmq';
import { JobData, JobType } from '@megacampus/shared-types';
/**
 * Logger is thread-safe (Pino writes to stdout/stderr atomically)
 * Safe to use in sandboxed processor (worker thread context)
 */
import logger from '../shared/logger';
import { testJobHandler } from './handlers/test-handler';
import { initializeJobHandler } from './handlers/initialize';
import { documentProcessingHandler } from '../stages/stage2-document-processing/handler';
import { stage3ClassificationHandler } from '../stages/stage3-classification/handler';
import { stage4AnalysisHandler } from '../stages/stage4-analysis/handler';
import { stage5GenerationHandler } from '../stages/stage5-generation/handler';
import { processStage6Job } from '../stages/stage6-lesson-content/handler';
import type { JobResult } from './handlers/base-handler';

/**
 * Type for handler that can process either Job or SandboxedJob
 *
 * SandboxedJob has a subset of Job's properties and methods:
 * - data, id, name, opts, attemptsMade, timestamp, returnvalue
 * - updateProgress(), log(), updateData()
 *
 * Our handlers use the BaseJobHandler pattern which expects Job<T>,
 * but SandboxedJob is structurally compatible for the methods we use.
 */
type JobHandler = {
  process: (job: SandboxedJob<JobData>) => Promise<JobResult>;
};

/**
 * Adapts a BaseJobHandler to work with SandboxedJob
 *
 * SandboxedJob and Job are structurally compatible for the methods our handlers use:
 * - data, id, name, opts, attemptsMade (all readonly properties)
 * - updateProgress(), log() (methods with identical signatures)
 *
 * This adapter provides a single, documented type assertion instead of multiple
 * unsafe casts scattered throughout the handler registry. The cast is safe because:
 *
 * 1. Both types share the same core interface for job metadata
 * 2. BaseJobHandler only uses the common subset of methods
 * 3. BullMQ guarantees SandboxedJob provides all required functionality
 * 4. The structural compatibility is verified at runtime by BullMQ's worker
 *
 * By centralizing the cast here, we maintain type safety while acknowledging
 * the intentional API overlap between Job and SandboxedJob.
 *
 * The handler parameter uses `any` for the Job type to accommodate different
 * job data types (e.g., GenerationJobData, StructureAnalysisJobData). At runtime,
 * job routing ensures the correct handler receives the correct job data type.
 *
 * The return type is intentionally widened to JobResult to accommodate handlers
 * that return extended result types (e.g., StructureAnalysisJobResult).
 * All handler result types extend the base JobResult interface.
 *
 * @param handler - A handler with a process method that accepts Job<T>
 * @returns A JobHandler that accepts SandboxedJob<JobData>
 */
function adaptHandler(handler: { process: (job: any) => Promise<unknown> }): JobHandler {
  return {
    process: async (job: SandboxedJob<JobData>) => {
      // Single documented cast: SandboxedJob is structurally compatible with Job
      // for the methods our handlers actually use (data, id, name, updateProgress)
      const result = await handler.process(job as unknown as Job<any>);
      // Result is guaranteed to have at least the JobResult interface
      // (all handler results extend JobResult with { success, message?, data?, error? })
      return result as JobResult;
    },
  };
}

/**
 * Job handler registry
 *
 * Maps job types to their corresponding handlers.
 * Handlers are adapted to work with SandboxedJob via adaptHandler().
 *
 * Note: In sandboxed mode, the Job type is replaced with SandboxedJob
 * which has a similar but reduced API. Our handlers are designed to
 * work with both types since they primarily use:
 * - job.data (available in both)
 * - job.id (available in both)
 * - job.name (available in both)
 * - job.updateProgress() (available in both)
 * - job.attemptsMade (available in both)
 * - job.opts (available in both)
 */
const jobHandlers: Record<string, JobHandler> = {
  [JobType.TEST_JOB]: adaptHandler(testJobHandler),
  [JobType.INITIALIZE]: adaptHandler(initializeJobHandler),
  [JobType.DOCUMENT_PROCESSING]: adaptHandler(documentProcessingHandler),
  [JobType.DOCUMENT_CLASSIFICATION]: adaptHandler(stage3ClassificationHandler),
  [JobType.STRUCTURE_ANALYSIS]: adaptHandler(stage4AnalysisHandler),
  [JobType.STRUCTURE_GENERATION]: adaptHandler(stage5GenerationHandler),
  [JobType.LESSON_CONTENT]: {
    process: async (job: SandboxedJob<JobData>) => {
      // Stage 6 handler expects token for pause/delay functionality (job.moveToDelayed)
      // In sandboxed mode, BullMQ passes token via job.token property for lock management.
      // If token is undefined, pause/delay operations will throw - this is expected
      // behavior documented in job-processor.ts:checkPauseAndDelay()
      const token = (job as SandboxedJob<JobData> & { token?: string }).token;
      const result = await processStage6Job(job as any, token);
      return {
        success: result.success,
        message: result.success ? 'Lesson content generated' : result.errors.join(', '),
        data: result,
        error: result.errors.length > 0 ? result.errors[0] : undefined,
      };
    },
  },
};

/**
 * Process a job by routing it to the appropriate handler
 *
 * This function is the entry point for the sandboxed processor.
 * It routes jobs to the correct handler based on job.name (JobType).
 *
 * @param job - The SandboxedJob instance passed by BullMQ
 * @returns The job execution result
 * @throws Error if no handler is found for the job type
 */
async function processJob(job: SandboxedJob<JobData>): Promise<JobResult> {
  const jobType = job.name;

  // Validate job has a name - this can happen with corrupted jobs
  if (!jobType) {
    const error = 'Job has undefined name - likely corrupted or created without proper job type';
    logger.error(
      {
        jobId: job.id,
        jobData: job.data,
        availableHandlers: Object.keys(jobHandlers),
      },
      'Sandboxed processor: Job handler not found - job.name is undefined'
    );
    throw new Error(error);
  }

  const handler = jobHandlers[jobType];

  if (!handler) {
    const error = `No handler registered for job type: ${jobType}`;
    logger.error(
      {
        jobId: job.id,
        jobType,
        availableHandlers: Object.keys(jobHandlers),
      },
      'Sandboxed processor: Job handler not found'
    );
    throw new Error(error);
  }

  const startTime = Date.now();

  logger.debug(
    {
      jobId: job.id,
      jobType,
      attemptsMade: job.attemptsMade,
    },
    'Sandboxed processor: Starting job processing'
  );

  try {
    // Process the job using the handler
    const result = await handler.process(job);
    const durationMs = Date.now() - startTime;

    logger.debug(
      {
        jobId: job.id,
        jobType,
        success: result.success,
        durationMs,
      },
      'Sandboxed processor: Job processing completed'
    );

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;

    // Log error in processor context (worker thread) for better debugging
    // Error is then re-thrown so BullMQ can handle retry logic
    logger.error(
      {
        jobId: job.id,
        jobType,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        attemptsMade: job.attemptsMade,
        durationMs,
      },
      'Sandboxed processor: Job processing failed'
    );

    // Re-throw so BullMQ marks job as failed and handles retries
    throw error;
  }
}

/**
 * Sandboxed processor entry point
 *
 * This is the default export that BullMQ will call for each job.
 * The function receives a SandboxedJob and must return the job result.
 *
 * Note: BullMQ documentation shows `module.exports` (CommonJS) pattern, but we use
 * ES module `export default` because this codebase uses ES modules throughout.
 * Both patterns are supported by BullMQ's worker thread loader.
 *
 * Important notes for sandboxed processors:
 * 1. Each job runs in a separate process/thread
 * 2. State is not shared between jobs
 * 3. All imports must be resolvable from this file
 * 4. Process exit codes have special meaning (use sparingly)
 */
export default async function (job: SandboxedJob<JobData>): Promise<JobResult> {
  return processJob(job);
}
