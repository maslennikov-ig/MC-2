/**
 * BullMQ Worker Configuration
 *
 * This module initializes and manages the BullMQ worker for processing course
 * generation jobs. It handles job routing, error handling, and graceful shutdown.
 *
 * Uses sandboxed processor mode (useWorkerThreads: true) to prevent job stalling
 * issues when processing long-running LLM operations. Each job runs in a separate
 * worker thread, providing better isolation and preventing lock timeout issues.
 *
 * @see https://docs.bullmq.io/guide/workers/sandboxed-processors
 * @module orchestrator/worker
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */

/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/require-await */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Worker, Job } from 'bullmq';
import { getRedisClient, REDIS_UNAVAILABLE_EVENT } from '../shared/cache/redis';
import { JobData, JobType, type Json } from '@megacampus/shared-types';
import logger from '../shared/logger';
import { logger as baseLogger } from '@megacampus/shared-logger';
import { QUEUE_NAME } from './queue';
import { handleJobFailure } from './handlers/error-handler';
import type { JobResult } from './handlers/base-handler';
import { JOB_TYPE_TO_STEP } from './handlers/base-handler';
import { getSupabaseAdmin } from '../shared/supabase/admin';
import { getTranslator, type Locale } from '../shared/i18n';
import {
  createJobStatus,
  markJobActive,
  markJobCompleted,
  markJobFailed,
  markJobCancelled,
} from './job-status-tracker';
import { JobCancelledError } from '../server/errors/typed-errors';
import { costTracker } from '../shared/metrics/cost-tracker';
import { stageMetricsCollector } from '../shared/metrics/stage-metrics';

/**
 * Get the processor file path for sandboxed processing
 *
 * In ES modules, __dirname is not available, so we derive it from import.meta.url
 * The processor file is compiled to .js in the dist directory
 *
 * In dev mode (tsx), __dirname points to src/, but processor.js is in dist/
 * We detect this and adjust the path accordingly
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolve processor.js path for both dev (tsx) and production modes
 * - Dev mode: __dirname is src/orchestrator, processor.js is in dist/orchestrator
 * - Prod mode: __dirname is dist/orchestrator, processor.js is in same directory
 */
function resolveProcessorPath(): string {
  // First try same directory (production mode - running from dist/)
  const sameDirPath = path.join(__dirname, 'processor.js');
  if (fs.existsSync(sameDirPath)) {
    return sameDirPath;
  }

  // Dev mode: tsx runs from src/, but processor.js is in dist/
  // More robust: calculate from project root instead of string replacement
  const projectRoot = path.resolve(__dirname, '../..');
  const distProcessorPath = path.join(projectRoot, 'dist/orchestrator/processor.js');
  if (fs.existsSync(distProcessorPath)) {
    return distProcessorPath;
  }

  // Log warning for debugging - path resolution failed
  logger.warn(
    { __dirname, sameDirPath, distProcessorPath },
    'Processor not found at expected paths, using fallback'
  );

  // Fallback to original path (will fail with helpful error message later)
  return sameDirPath;
}

const processorFile = resolveProcessorPath();

/**
 * Circuit breaker configuration for memory-based worker control
 *
 * Thresholds tuned for 1GB container (typical Docker/K8s pod):
 * - Pause at 768 MB (75% of 1GB) to leave headroom for GC
 * - Resume at 512 MB (50% of 1GB) to avoid thrashing (pause/resume cycles)
 * - 256 MB hysteresis gap prevents rapid pause/resume toggling
 *
 * Check interval of 2s balances responsiveness vs overhead.
 *
 * For different container sizes, adjust proportionally:
 * - 2GB container: pauseThresholdMB = 1536, resumeThresholdMB = 1024
 * - 512MB container: pauseThresholdMB = 384, resumeThresholdMB = 256
 *
 * Override via environment variables:
 * - WORKER_PAUSE_THRESHOLD_MB
 * - WORKER_RESUME_THRESHOLD_MB
 * - WORKER_MEMORY_CHECK_INTERVAL_MS
 */
const CIRCUIT_BREAKER = {
  /** Pause worker when heap exceeds this threshold (MB) */
  pauseThresholdMB: parseInt(process.env.WORKER_PAUSE_THRESHOLD_MB || '768'),
  /** Resume worker when heap drops below this threshold (MB) */
  resumeThresholdMB: parseInt(process.env.WORKER_RESUME_THRESHOLD_MB || '512'),
  /** Check interval (ms) */
  checkIntervalMs: parseInt(process.env.WORKER_MEMORY_CHECK_INTERVAL_MS || '2000'),
} as const;

/** Circuit breaker state */
let isWorkerPaused = false;
let circuitBreakerInterval: NodeJS.Timeout | null = null;

/**
 * Registered job types for status reporting
 * The actual handlers are defined in processor.ts (sandboxed processor)
 */
const registeredJobTypes = [
  JobType.TEST_JOB,
  JobType.DOCUMENT_PROCESSING,
  JobType.DOCUMENT_CLASSIFICATION,
  JobType.STRUCTURE_ANALYSIS,
  JobType.STRUCTURE_GENERATION,
  JobType.LESSON_CONTENT,
  JobType.CAREER_PLAYBOOK,
  JobType.BLOCK_REGENERATION,
];

/**
 * Extract error message from failed job, recovering from BullMQ sandbox serialization loss.
 *
 * When BullMQ serializes errors across the sandbox boundary (worker thread → parent),
 * Error properties that aren't enumerable (like .message) can be lost, resulting in
 * empty error messages. This function recovers the real error from multiple sources:
 *
 * 1. BullMQ error.message (if present and non-empty)
 * 2. _sandboxError stashed in job.data by our processor.ts error sandwich
 * 3. First line of stack trace
 * 4. Descriptive fallback
 */
function extractErrorMessage(job: Job<JobData>, error: Error): string {
  // 1. Try BullMQ error message
  if (error?.message && error.message !== 'Error' && error.message.trim() !== '') {
    return error.message;
  }

  // 2. Try sandbox error stashed in job data by processor.ts captureUncaughtError.
  // No race condition: BullMQ's job.updateData() sets this.data synchronously
  // before the async Redis write. Our prependListener ensures the Update message
  // arrives before Failed, so job.data._sandboxError is set when this runs.
  const sandboxError = (job.data as Record<string, unknown>)?._sandboxError as
    | {
        message?: string;
        name?: string;
        stack?: string;
        type?: string;
      }
    | undefined;

  if (sandboxError?.message) {
    return sandboxError.message;
  }

  // 3. Try first line of stack trace
  if (error?.stack) {
    const firstLine = error.stack.split('\n')[0]?.trim();
    if (firstLine && firstLine !== 'Error') {
      return firstLine;
    }
  }

  // 4. Fallback
  return 'Worker thread crashed (error details lost in sandbox serialization)';
}

/**
 * BullMQ Worker instance
 */
let worker: Worker<JobData, JobResult> | null = null;

/**
 * Start memory-based circuit breaker
 * Monitors heap usage and pauses/resumes worker accordingly
 * @param workerInstance - The BullMQ worker to control
 */
function startCircuitBreaker(workerInstance: Worker<JobData, JobResult>): void {
  circuitBreakerInterval = setInterval(async () => {
    const heapMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    if (!isWorkerPaused && heapMB >= CIRCUIT_BREAKER.pauseThresholdMB) {
      logger.info(
        { heapMB, threshold: CIRCUIT_BREAKER.pauseThresholdMB },
        'Circuit breaker: Pausing worker due to memory pressure'
      );

      try {
        await workerInstance.pause();
        isWorkerPaused = true;

        // Force GC if available
        if (typeof global.gc === 'function') {
          global.gc();
        }
      } catch (error) {
        logger.error({ error }, 'Circuit breaker: Failed to pause worker');
      }
    } else if (isWorkerPaused && heapMB < CIRCUIT_BREAKER.resumeThresholdMB) {
      logger.info(
        { heapMB, threshold: CIRCUIT_BREAKER.resumeThresholdMB },
        'Circuit breaker: Resuming worker, memory recovered'
      );

      try {
        workerInstance.resume();
        isWorkerPaused = false;
      } catch (error) {
        logger.error({ error }, 'Circuit breaker: Failed to resume worker');
      }
    }
  }, CIRCUIT_BREAKER.checkIntervalMs);
}

/**
 * Stop circuit breaker monitoring
 */
function stopCircuitBreaker(): void {
  if (circuitBreakerInterval) {
    clearInterval(circuitBreakerInterval);
    circuitBreakerInterval = null;
  }
  isWorkerPaused = false;
}

/**
 * Get or create the BullMQ worker instance
 *
 * The worker is configured with:
 * - Sandboxed processor mode (useWorkerThreads: true) for process isolation
 * - Redis connection from REDIS_URL environment variable
 * - Exponential backoff retry strategy: 2^attempt * 1000ms
 * - Job cancellation support
 * - Structured logging with job context
 * - Concurrent job processing (default: 5)
 *
 * Benefits of sandboxed processing:
 * - Jobs run in separate worker threads, preventing main process blocking
 * - Stalled jobs are significantly reduced for long-running LLM operations
 * - Better isolation - if a job crashes, it doesn't affect other jobs
 * - Independent memory management per job
 *
 * @param {number} [concurrency=5] - Number of jobs to process concurrently
 * @returns {Worker<JobData, JobResult>} The BullMQ worker instance
 */
export function getWorker(concurrency: number = 5): Worker<JobData, JobResult> {
  if (!worker) {
    const redisClient = getRedisClient();

    // Validate processor file exists before creating worker (fail-fast)
    // This prevents cryptic "Cannot find module" errors at runtime
    if (!fs.existsSync(processorFile)) {
      const error = `Sandboxed processor file not found: ${processorFile}. This indicates a build issue - run 'pnpm build' first.`;
      logger.error(
        {
          processorFile,
          dirname: __dirname,
          cwd: process.cwd(),
        },
        'BullMQ worker initialization failed: processor file missing'
      );
      throw new Error(error);
    }

    logger.info(
      {
        processorFile,
        concurrency,
        useWorkerThreads: !process.env.VITEST,
      },
      'Creating BullMQ worker with sandboxed processor'
    );

    // Use sandboxed processor - jobs run in separate worker threads
    // This prevents stalled jobs when processing long-running LLM operations
    worker = new Worker<JobData, JobResult>(
      QUEUE_NAME,
      processorFile, // Path to compiled processor.js file
      {
        connection: redisClient,
        concurrency,
        // Enable worker threads for better performance (vs spawning processes)
        // Worker threads share memory with main process but execute independently
        // Disabled in test: BullMQ 5.x main-worker.js has extensionless ESM import
        // that fails under Node 22 strict resolution (ERR_MODULE_NOT_FOUND: main-base)
        useWorkerThreads: !process.env.VITEST,
        // Lock duration for long-running jobs (document processing can take several minutes)
        // Default is 30s, but we need more for PDF processing, embedding generation, etc.
        // With sandboxed processors, lock renewal is handled automatically by the thread
        lockDuration: 2700000, // 45 minutes - must match PROCESSOR_MAX_TTL_MS
        // Stall detection: when a worker process crashes (OOM, segfault, deploy),
        // the restarted worker detects stalled jobs and moves them to failed/retry.
        // Does not interrupt running jobs — only promotes expired-lock jobs back to wait queue.
        stalledInterval: 60000, // 60 seconds (default 30s) — keeps detection latency low
        maxStalledCount: 2, // Fail job after 2 stall detections (default: 1)
        // Exponential backoff: 2^attempt * 1000ms
        // Attempt 1: 2s, Attempt 2: 4s, Attempt 3: 8s, etc.
        settings: {
          backoffStrategy: (attemptsMade: number) => {
            return Math.pow(2, attemptsMade) * 1000;
          },
        },
      }
    );

    // Event: Job completed successfully
    worker.on('completed', async (job: Job<JobData, JobResult>, result: JobResult) => {
      try {
        logger.info(
          {
            jobId: job.id,
            jobType: job.name,
            success: result.success,
          },
          'Job completed'
        );

        // For test jobs and initialize jobs, await to ensure DB write completes before test checks status
        // This prevents race conditions in tests where we check DB before write finishes
        // For production jobs, use fire-and-forget for better performance
        const isTestEnvironment = job.name === 'test_job' || job.name === 'initialize';

        if (isTestEnvironment) {
          // Await for test/init jobs to ensure DB consistency
          await markJobCompleted(job);
        } else {
          // Fire-and-forget for production jobs (non-blocking)
          markJobCompleted(job).catch(err => {
            logger.error(
              {
                jobId: job.id,
                err: err.message,
              },
              'Failed to mark job as completed (non-fatal)'
            );
          });
        }

        // Clean up in-memory metrics for completed course
        const courseId = job.data?.courseId;
        if (courseId) {
          costTracker.clearCourse(courseId);
          stageMetricsCollector.clearCourse(courseId);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ jobId: job.id, err: errorMessage }, 'Error in completed handler');
      }
    });

    // Event: Job failed
    worker.on('failed', async (job: Job<JobData> | undefined, error: Error) => {
      try {
        if (!job) {
          logger.error({ err: error }, 'Job failed without job context');
          return;
        }

        // For test jobs and initialize jobs, await to ensure DB write completes before test checks status
        // This prevents race conditions in tests where we check DB before write finishes
        // For production jobs, use fire-and-forget for better performance
        const isTestEnvironment = job.name === 'test_job' || job.name === 'initialize';

        // Check if this is a cancellation
        if (
          error instanceof JobCancelledError ||
          error.name === 'JobCancelledError' ||
          error.message?.includes('cancelled')
        ) {
          logger.info(
            {
              jobId: job.id,
              cancelledBy: (error as JobCancelledError).cancelledBy,
            },
            'Job was cancelled'
          );

          if (isTestEnvironment) {
            // Await for test/init jobs
            await markJobCancelled(job.id!, (error as JobCancelledError).cancelledBy);
          } else {
            // Fire-and-forget for production jobs
            markJobCancelled(job.id!, (error as JobCancelledError).cancelledBy).catch(err => {
              logger.error(
                {
                  jobId: job.id,
                  err: err.message,
                },
                'Failed to mark job as cancelled (non-fatal)'
              );
            });
          }

          // Clean up in-memory metrics for cancelled course
          const cancelledCourseId = job.data?.courseId;
          if (cancelledCourseId) {
            costTracker.clearCourse(cancelledCourseId);
            stageMetricsCollector.clearCourse(cancelledCourseId);
          }

          return; // Don't call handleJobFailure for cancelled jobs
        }

        // Enrich error with recovered message before passing to handleJobFailure
        // This ensures handleJobFailure gets a useful error message even when
        // BullMQ sandbox serialization strips it
        const recoveredMsg = extractErrorMessage(job, error);
        let enrichedError = error;
        if (!error?.message || error.message === 'Error' || error.message.trim() === '') {
          enrichedError = new Error(recoveredMsg);
          enrichedError.stack = error?.stack;
        }

        // Regular failure handling
        handleJobFailure(job, enrichedError);

        // Safety net: update course generation_status when sandbox crashes.
        // BaseJobHandler.process() runs in child thread — if it crashes,
        // generation_status is never updated. This catches that gap.
        const courseId = job.data?.courseId;
        const jobType = job.name as JobType;
        const stepId = JOB_TYPE_TO_STEP[jobType];

        if (courseId && stepId && stepId > 1) {
          try {
            const supabase = getSupabaseAdmin();
            const locale = ((job.data as Record<string, unknown>)?.locale as string) || 'ru';
            const t = getTranslator(locale as Locale);
            const message = t(`steps.${stepId}.failed`);

            const safetyNetErrorMsg = extractErrorMessage(job, error);
            await supabase.rpc('update_course_progress', {
              p_course_id: courseId,
              p_step_id: stepId,
              p_status: 'failed',
              p_message: message,
              p_error_message: safetyNetErrorMsg,
              p_error_details: { stack: error?.stack, name: error?.name } as Json,
              p_metadata: {
                job_id: job.id,
                worker_type: jobType,
                safety_net: true,
              } as Json,
            });

            logger.info(
              { courseId, stepId, jobType },
              'Safety net: updated course progress after sandbox failure'
            );

            // Also update file_catalog for document processing jobs
            const fileId = (job.data as Record<string, unknown>)?.fileId as string;
            if (fileId && jobType === JobType.DOCUMENT_PROCESSING) {
              await supabase
                .from('file_catalog')
                .update({
                  vector_status: 'failed',
                  error_message: safetyNetErrorMsg.substring(0, 1000),
                })
                .eq('id', fileId);
            }
          } catch (progressError) {
            const errMsg =
              progressError instanceof Error ? progressError.message : String(progressError);
            logger.error(
              { courseId, error: errMsg },
              'Safety net: failed to update course progress'
            );
          }
        }

        if (isTestEnvironment) {
          // Await for test/init jobs
          await markJobFailed(job, enrichedError);
        } else {
          // Fire-and-forget for production jobs
          markJobFailed(job, enrichedError).catch(err => {
            logger.error(
              {
                jobId: job.id,
                err: err.message,
              },
              'Failed to mark job as failed (non-fatal)'
            );
          });
        }

        // Clean up in-memory metrics for failed course
        if (courseId) {
          costTracker.clearCourse(courseId);
          stageMetricsCollector.clearCourse(courseId);
        }
      } catch (dbError) {
        const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);
        logger.error(
          {
            jobId: job?.id,
            err: errorMessage,
          },
          'Error in failed handler'
        );
      }
    });

    // Event: Job stalled (worker crashed or timed out)
    worker.on('stalled', (jobId: string) => {
      baseLogger.info(
        {
          jobId,
          queueName: QUEUE_NAME,
        },
        'Job stalled'
      );
      // Stalled handling is logged here; recovery handled by BullMQ retry mechanism
    });

    // Event: Worker active (started processing jobs)
    worker.on('active', async (job: Job<JobData>) => {
      try {
        logger.info(
          {
            jobId: job.id,
            jobType: job.name,
            // organizationId may not exist for all job types (e.g., LESSON_CONTENT)
            organizationId: 'organizationId' in job.data ? job.data.organizationId : undefined,
            courseId: job.data.courseId,
          },
          'Worker picked up job'
        );

        // Create job status on first attempt, mark active on retries
        const attemptsMade = job.attemptsMade;
        if (attemptsMade === 0) {
          // For test jobs and initialize jobs, await to ensure DB write completes before test checks status
          // This prevents race conditions in tests where we check DB before write finishes
          // For production jobs, use fire-and-forget for better performance
          const isTestEnvironment = job.name === 'test_job' || job.name === 'initialize';

          if (isTestEnvironment) {
            // Await for test/init jobs to ensure DB consistency
            await createJobStatus(job);
            logger.debug(
              {
                jobId: job.id,
                jobType: job.name,
              },
              'Job status created (awaited for test job)'
            );
          } else {
            // Fire-and-forget for production jobs (non-blocking)
            createJobStatus(job).catch(err => {
              logger.error(
                {
                  jobId: job.id,
                  err: err.message,
                },
                'Failed to create job status (non-fatal)'
              );
            });
          }
        }

        // Fire-and-forget: Mark job as active in database
        // Note: markJobActive has delay logic to prevent timestamp constraint violations
        markJobActive(job).catch(err => {
          logger.error(
            {
              jobId: job.id,
              err: err.message,
            },
            'Failed to update job active state in database (non-fatal)'
          );
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(
          {
            jobId: job.id,
            err: errorMessage,
          },
          'Error in active handler'
        );
      }
    });

    // Event: Worker error
    worker.on('error', (error: Error) => {
      logger.error({ err: error }, 'Worker error');
    });

    logger.info(
      {
        queueName: QUEUE_NAME,
        concurrency,
        useWorkerThreads: !process.env.VITEST,
        processorFile,
        registeredHandlers: registeredJobTypes,
      },
      'BullMQ worker initialized with sandboxed processor'
    );

    // Start circuit breaker after worker is created
    startCircuitBreaker(worker);
  }

  return worker;
}

/**
 * Start the worker
 *
 * @param {number} [concurrency=5] - Number of jobs to process concurrently
 * @returns {Promise<Worker<JobData, JobResult>>} The started worker instance
 */
export async function startWorker(concurrency?: number): Promise<Worker<JobData, JobResult>> {
  const workerInstance = getWorker(concurrency);
  logger.info('Worker started and ready to process jobs');
  return workerInstance;
}

/**
 * Stop the worker gracefully
 *
 * Waits for active jobs to complete before shutting down.
 *
 * @param {boolean} [force=false] - Force immediate shutdown without waiting for jobs
 * @returns {Promise<void>}
 */
export async function stopWorker(force: boolean = false): Promise<void> {
  // Stop circuit breaker first
  stopCircuitBreaker();

  if (worker) {
    logger.info({ force }, 'Stopping worker');

    if (force) {
      await worker.close(true); // Force close immediately
    } else {
      await worker.close(); // Graceful shutdown
    }

    worker = null;
    logger.info('Worker stopped');
  }
}

/**
 * Check if worker is running
 *
 * @returns {boolean} True if worker is running
 */
export function isWorkerRunning(): boolean {
  return worker !== null && !worker.closing;
}

/**
 * Get worker status
 *
 * @returns {object | null} Worker status information or null if not running
 */
export function getWorkerStatus(): object | null {
  if (!worker) {
    return null;
  }

  return {
    isRunning: isWorkerRunning(),
    isPaused: isWorkerPaused,
    queueName: QUEUE_NAME,
    useWorkerThreads: !process.env.VITEST,
    registeredHandlers: registeredJobTypes,
  };
}

/**
 * Common graceful shutdown handler
 */
async function handleGracefulShutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Graceful shutdown initiated');
  const { generationLockService } = await import('../shared/locks');
  await generationLockService.releaseAllLocks();
  await stopWorker(false);
  process.exit(0);
}

// Graceful shutdown on process termination
process.on('SIGTERM', () => void handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void handleGracefulShutdown('SIGINT'));
// Handle Redis unavailable - graceful shutdown before forced exit
process.on(REDIS_UNAVAILABLE_EVENT, () => void handleGracefulShutdown('REDIS_UNAVAILABLE'));

export default {
  getWorker,
  startWorker,
  stopWorker,
  isWorkerRunning,
  getWorkerStatus,
};
