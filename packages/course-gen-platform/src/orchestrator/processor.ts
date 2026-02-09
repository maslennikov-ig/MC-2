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

import { SandboxedJob, Job, UnrecoverableError } from 'bullmq';
import { JobData, JobType, JobStatus } from '@megacampus/shared-types';
/**
 * Logger is thread-safe (Pino writes to stdout/stderr atomically)
 * Safe to use in sandboxed processor (worker thread context)
 */
import logger from '../shared/logger/index.js';
import { logPermanentFailure } from '../shared/logger/error-service.js';
import { captureError } from '../shared/sentry/init.js';
import { testJobHandler } from './handlers/test-handler.js';
import { initializeJobHandler } from './handlers/initialize.js';
import { documentProcessingHandler } from '../stages/stage2-document-processing/handler.js';
import { stage3ClassificationHandler } from '../stages/stage3-classification/handler.js';
import { stage4AnalysisHandler } from '../stages/stage4-analysis/handler.js';
import { stage5GenerationHandler } from '../stages/stage5-generation/handler.js';
import { processStage6JobAsJobResult } from '../stages/stage6-lesson-content/handler.js';
import type { Stage6JobInput } from '../stages/stage6-lesson-content/types';
import { blockRegenerationHandler } from './handlers/block-regeneration-handler.js';
import type { JobResult } from './handlers/base-handler.js';

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
  process: (job: SandboxedJob<JobData>, token?: string) => Promise<JobResult>;
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
function adaptHandler<T = unknown>(handler: {
  process: (job: Job<T>, token?: string) => Promise<unknown>;
}): JobHandler {
  return {
    process: async (job: SandboxedJob<JobData>, token?: string) => {
      // Single documented cast: SandboxedJob is structurally compatible with Job
      // for the methods our handlers actually use (data, id, name, updateProgress)
      // Token now received as parameter from BullMQ sandboxed processor
      // No need to extract from job object
      if (!token) {
        logger.warn(
          { jobId: job.id, jobName: job.name },
          'Job token missing - pause/delay functionality disabled for this job'
        );
      }

      const result = await handler.process(job as unknown as Job<T>, token);
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
  [JobType.LESSON_CONTENT]: adaptHandler<Stage6JobInput>({
    process: async (job: Job<Stage6JobInput>, token?: string) => {
      return processStage6JobAsJobResult(job, token);
    },
  }),
  [JobType.BLOCK_REGENERATION]: adaptHandler(blockRegenerationHandler),
};

/**
 * Health check for processor environment
 * Validates that all dependencies are available in worker thread context
 * and that workspace packages are bundled correctly.
 *
 * @returns Health check result with any validation errors
 */
export function healthCheck(): { healthy: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate logger works in worker thread context
  try {
    logger.debug({ check: 'processor_health' }, 'Processor health check: logger OK');
  } catch (err) {
    errors.push(`Logger not available: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Validate all handlers are loadable and callable
  for (const [jobType, handler] of Object.entries(jobHandlers)) {
    if (!handler) {
      errors.push(`Handler for ${jobType} is null/undefined`);
    } else if (typeof handler.process !== 'function') {
      errors.push(`Handler for ${jobType} has invalid process method`);
    }
  }

  // ============================================================================
  // Bundle Integrity Validation
  // Validates that workspace packages are bundled correctly via tsup
  // ============================================================================

  // Validate @megacampus/shared-types is bundled correctly
  try {
    // Check JobType enum is available and has expected values
    if (!JobType) {
      errors.push('JobType enum not available from @megacampus/shared-types');
    } else if (Object.keys(JobType).length === 0) {
      errors.push('JobType enum is empty - workspace package may not be bundled correctly');
    } else {
      // Verify at least one known enum value exists
      if (!JobType.TEST_JOB || !JobType.INITIALIZE) {
        errors.push('JobType enum missing expected values (TEST_JOB, INITIALIZE)');
      }
    }

    // Check JobStatus enum is available and has expected values
    if (!JobStatus) {
      errors.push('JobStatus enum not available from @megacampus/shared-types');
    } else if (Object.keys(JobStatus).length === 0) {
      errors.push('JobStatus enum is empty - workspace package may not be bundled correctly');
    } else {
      // Verify at least one known enum value exists
      if (!JobStatus.PENDING || !JobStatus.COMPLETED) {
        errors.push('JobStatus enum missing expected values (PENDING, COMPLETED)');
      }
    }

    // Verify that handler registry uses correct JobType values
    // This catches issues where enums are bundled but with different values
    const registeredTypes = Object.keys(jobHandlers);
    if (!registeredTypes.includes(JobType.TEST_JOB)) {
      errors.push(`JobType.TEST_JOB value "${JobType.TEST_JOB}" not found in handler registry`);
    }
  } catch (err) {
    errors.push(
      `@megacampus/shared-types bundle validation failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Validate @megacampus/shared-logger is bundled correctly
  try {
    // Check logger object has required methods
    if (!logger || typeof logger.info !== 'function') {
      errors.push('Logger not available from @megacampus/shared-logger');
    }
    if (!logger || typeof logger.error !== 'function') {
      errors.push('Logger missing error method');
    }
    if (!logger || typeof logger.debug !== 'function') {
      errors.push('Logger missing debug method');
    }

    // Validate logPermanentFailure function is available
    // This is critical for error logging in sandboxed context
    if (typeof logPermanentFailure !== 'function') {
      errors.push('logPermanentFailure not available from shared-logger/error-service');
    }
  } catch (err) {
    errors.push(
      `@megacampus/shared-logger bundle validation failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return {
    healthy: errors.length === 0,
    errors,
  };
}

// Run health check on processor load (startup validation)
// Skip in test environment to avoid side effects
if (process.env.NODE_ENV !== 'test') {
  try {
    const result = healthCheck();
    if (!result.healthy) {
      logger.error({ errors: result.errors }, 'Processor health check failed - exiting');
      process.exit(1);
    }
    logger.info(
      { handlersCount: Object.keys(jobHandlers).length },
      'Processor health check passed'
    );
  } catch (err) {
    logger.error({ error: err }, 'Processor health check threw exception - exiting');
    process.exit(1);
  }
}

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
async function processJob(job: SandboxedJob<JobData>, token?: string): Promise<JobResult> {
  const jobType = job.name;

  // Validate job has a name - this can happen with corrupted jobs
  if (!jobType) {
    const errorType = jobType === undefined ? 'undefined' : 'empty string';
    const error = `Job has ${errorType} name - likely corrupted or created without proper job type`;
    logger.error(
      {
        jobId: job.id,
        jobName: jobType,
        jobData: job.data,
        availableHandlers: Object.keys(jobHandlers),
      },
      `Sandboxed processor: Invalid job name (${errorType})`
    );
    // Use UnrecoverableError to skip retries — corrupted job won't fix itself on retry
    throw new UnrecoverableError(error);
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
    // Use UnrecoverableError to skip retries — unknown job type won't become valid on retry
    throw new UnrecoverableError(error);
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
    // Process the job using the handler, passing token for pause/delay
    const result = await handler.process(job, token);
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Log error in processor context (worker thread) for better debugging
    // Error is then re-thrown so BullMQ can handle retry logic
    logger.error(
      {
        jobId: job.id,
        jobType,
        error: errorMessage,
        stack: errorStack,
        attemptsMade: job.attemptsMade,
        durationMs,
        // Include job data for debugging (courseId, organizationId, etc.)
        courseId: job.data?.courseId,
        organizationId: job.data?.organizationId,
        userId: job.data?.userId,
      },
      'Sandboxed processor: Job processing failed'
    );

    // Report to Sentry for alerting and aggregation
    captureError(error, {
      tags: { component: 'processor', jobType, jobId: job.id || 'unknown' },
      extra: {
        courseId: job.data?.courseId,
        attemptsMade: job.attemptsMade,
        durationMs,
      },
      level: 'error',
    });

    // CRITICAL: Log to error_logs table INSIDE sandbox while we have full stack trace
    // BullMQ sandbox strips stack trace when passing error to main process
    // This ensures we always have complete error details in the database
    try {
      await logPermanentFailure({
        organization_id: job.data?.organizationId,
        user_id: job.data?.userId,
        problem_id: job.id,
        error_message: `[Sandbox] ${errorMessage}`,
        stack_trace: errorStack,
        severity: 'ERROR',
        job_id: job.id,
        job_type: jobType,
        metadata: {
          courseId: job.data?.courseId,
          attemptsMade: job.attemptsMade,
          durationMs,
          source: 'sandbox_processor',
          // Include input data keys for debugging (not full data to avoid PII)
          inputDataKeys: job.data ? Object.keys(job.data) : [],
        },
      });
    } catch (logError) {
      // Don't fail the job if logging fails - just warn
      logger.warn(
        { err: logError, jobId: job.id },
        'Sandboxed processor: Failed to log error to database'
      );
    }

    // Re-throw so BullMQ marks job as failed and handles retries
    throw error;
  }
}

/**
 * Processor TTL configuration
 *
 * Max time a job can run before being forcefully killed.
 * This prevents runaway jobs from blocking the worker thread forever.
 *
 * Default: 600000ms (10 minutes) - same as lockDuration in worker.ts
 * Configure via PROCESSOR_MAX_TTL_MS environment variable.
 *
 * Exit code 10 signals TTL timeout to parent process for metrics/logging.
 */
const PROCESSOR_MAX_TTL_MS = parseInt(process.env.PROCESSOR_MAX_TTL_MS || '600000');
const TTL_EXIT_CODE = 10;

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
 * TTL mechanism: If the job doesn't complete within PROCESSOR_MAX_TTL_MS,
 * the process is forcefully killed. This prevents infinite loops or hanging
 * operations from blocking worker threads forever.
 *
 * Important notes for sandboxed processors:
 * 1. Each job runs in a separate process/thread
 * 2. State is not shared between jobs
 * 3. All imports must be resolvable from this file
 * 4. Process exit codes have special meaning (TTL_EXIT_CODE = 10 for timeout)
 */
export default async function (job: SandboxedJob<JobData>, token?: string): Promise<JobResult> {
  let hasCompleted = false;

  // Hard kill timeout - exits process if job doesn't complete
  // This catches infinite loops that block the event loop
  const hardKillTimeout = setTimeout(() => {
    if (!hasCompleted) {
      logger.error(
        {
          jobId: job.id,
          jobType: job.name,
          ttlMs: PROCESSOR_MAX_TTL_MS,
        },
        'Processor TTL exceeded - force killing worker thread'
      );
      process.exit(TTL_EXIT_CODE);
    }
  }, PROCESSOR_MAX_TTL_MS);

  try {
    const result = await processJob(job, token);
    hasCompleted = true;
    return result;
  } finally {
    // Always clear timeout - allows process reuse for next job
    clearTimeout(hardKillTimeout);
  }
}
