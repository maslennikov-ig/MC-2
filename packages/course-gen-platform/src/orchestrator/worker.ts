/**
 * BullMQ Worker Configuration
 *
 * This module initializes and manages the BullMQ worker for processing course
 * generation jobs. It handles job routing, error handling, and graceful shutdown.
 *
 * @module orchestrator/worker
 */

 
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
 
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/require-await */

import { Worker, Job } from 'bullmq';
import { getRedisClient } from '../shared/cache/redis';
import { JobData, JobType } from '@megacampus/shared-types';
import logger from '../shared/logger';
import { QUEUE_NAME } from './queue';
import { testJobHandler } from './handlers/test-handler';
import { initializeJobHandler } from './handlers/initialize';
import { documentProcessingHandler } from '../stages/stage2-document-processing/handler';
import { stage3ClassificationHandler } from '../stages/stage3-classification/handler';
import { stage4AnalysisHandler } from '../stages/stage4-analysis/handler';
import { stage5GenerationHandler } from '../stages/stage5-generation/handler';
import { processStage6Job } from '../stages/stage6-lesson-content/handler';
import { handleJobFailure } from './handlers/error-handler';
import { BaseJobHandler, JobResult } from './handlers/base-handler';
import {
  createJobStatus,
  markJobActive,
  markJobCompleted,
  markJobFailed,
  markJobCancelled,
} from './job-status-tracker';
import { JobCancelledError } from '../server/errors/typed-errors';

/**
 * Circuit breaker configuration for memory-based worker control
 */
const CIRCUIT_BREAKER = {
  /** Pause worker when heap exceeds this threshold (MB) */
  pauseThresholdMB: 768,
  /** Resume worker when heap drops below this threshold (MB) */
  resumeThresholdMB: 512,
  /** Check interval (ms) */
  checkIntervalMs: 2000,
} as const;

/** Circuit breaker state */
let isWorkerPaused = false;
let circuitBreakerInterval: NodeJS.Timeout | null = null;

/**
 * Job handler registry
 *
 * Maps job types to their corresponding handlers.
 * New handlers should be registered here as they are implemented.
 */
const jobHandlers: Record<string, BaseJobHandler<JobData> | { process: (job: Job<any>) => Promise<any> }> = {
  [JobType.TEST_JOB]: testJobHandler,
  [JobType.INITIALIZE]: initializeJobHandler,
  [JobType.DOCUMENT_PROCESSING]: documentProcessingHandler,
  [JobType.DOCUMENT_CLASSIFICATION]: stage3ClassificationHandler,
  [JobType.STRUCTURE_ANALYSIS]: stage4AnalysisHandler,
  [JobType.STRUCTURE_GENERATION]: stage5GenerationHandler,
  [JobType.LESSON_CONTENT]: { process: processStage6Job },
  // TODO (Stage 1+): Register additional handlers
  // [JobType.SUMMARY_GENERATION]: summaryGenerationHandler,
  // [JobType.TEXT_GENERATION]: textGenerationHandler,
  // [JobType.FINALIZATION]: finalizationHandler,
};

/**
 * Process a job by routing it to the appropriate handler
 *
 * @param {Job<JobData>} job - The BullMQ job to process
 * @returns {Promise<JobResult>} The job execution result
 * @throws {Error} If no handler is found for the job type
 */
async function processJob(job: Job<JobData>): Promise<JobResult> {
  const jobType = job.name;
  const handler = jobHandlers[jobType];

  if (!handler) {
    const error = `No handler registered for job type: ${jobType}`;
    logger.error({
      jobId: job.id,
      jobType,
      availableHandlers: Object.keys(jobHandlers),
    }, 'Job handler not found');
    throw new Error(error);
  }

  // Process the job using the handler
  return await handler.process(job);
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
      logger.warn({ heapMB, threshold: CIRCUIT_BREAKER.pauseThresholdMB },
        'Circuit breaker: Pausing worker due to memory pressure');

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
      logger.info({ heapMB, threshold: CIRCUIT_BREAKER.resumeThresholdMB },
        'Circuit breaker: Resuming worker, memory recovered');

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
 * - Redis connection from REDIS_URL environment variable
 * - Exponential backoff retry strategy: 2^attempt * 1000ms
 * - Job cancellation support
 * - Structured logging with job context
 * - Concurrent job processing (default: 5)
 *
 * @param {number} [concurrency=5] - Number of jobs to process concurrently
 * @returns {Worker<JobData, JobResult>} The BullMQ worker instance
 */
export function getWorker(concurrency: number = 5): Worker<JobData, JobResult> {
  if (!worker) {
    const redisClient = getRedisClient();

    worker = new Worker<JobData, JobResult>(
      QUEUE_NAME,
      async (job: Job<JobData>) => {
        // Process the job - if cancelled, handler will throw JobCancelledError
        // which will be caught by BullMQ's 'failed' event
        return await processJob(job);
      },
      {
        connection: redisClient,
        concurrency,
        // Lock duration for long-running jobs (document processing can take several minutes)
        // Default is 30s, but we need more for PDF processing, embedding generation, etc.
        lockDuration: 600000, // 10 minutes (same as Stage 3 summarization worker)
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
        logger.info({
          jobId: job.id,
          jobType: job.name,
          success: result.success,
        }, 'Job completed');

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
            logger.error({
              jobId: job.id,
              err: err.message,
            }, 'Failed to mark job as completed (non-fatal)');
          });
        }
      } catch (error: any) {
        logger.error({ jobId: job.id, err: error.message }, 'Error in completed handler');
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
          logger.info({
            jobId: job.id,
            cancelledBy: (error as JobCancelledError).cancelledBy,
          }, 'Job was cancelled');

          if (isTestEnvironment) {
            // Await for test/init jobs
            await markJobCancelled(job.id!, (error as JobCancelledError).cancelledBy);
          } else {
            // Fire-and-forget for production jobs
            markJobCancelled(job.id!, (error as JobCancelledError).cancelledBy).catch(err => {
              logger.error({
                jobId: job.id,
                err: err.message,
              }, 'Failed to mark job as cancelled (non-fatal)');
            });
          }

          return; // Don't call handleJobFailure for cancelled jobs
        }

        // Regular failure handling
        handleJobFailure(job, error);

        if (isTestEnvironment) {
          // Await for test/init jobs
          await markJobFailed(job, error);
        } else {
          // Fire-and-forget for production jobs
          markJobFailed(job, error).catch(err => {
            logger.error({
              jobId: job.id,
              err: err.message,
            }, 'Failed to mark job as failed (non-fatal)');
          });
        }
      } catch (dbError: any) {
        logger.error({
          jobId: job?.id,
          err: dbError.message,
        }, 'Error in failed handler');
      }
    });

    // Event: Job stalled (worker crashed or timed out)
    worker.on('stalled', (jobId: string) => {
      logger.warn({
        jobId,
        queueName: QUEUE_NAME,
      }, 'Job stalled');
      // Note: We don't know the job type here, so we can't call handleJobStalled with JobType
      // This could be enhanced by fetching the job from Redis
    });

    // Event: Worker active (started processing jobs)
    worker.on('active', async (job: Job<JobData>) => {
      try {
        logger.info({
          jobId: job.id,
          jobType: job.name,
          // organizationId may not exist for all job types (e.g., LESSON_CONTENT)
          organizationId: 'organizationId' in job.data ? job.data.organizationId : undefined,
          courseId: job.data.courseId,
        }, 'Worker picked up job');

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
            logger.debug({
              jobId: job.id,
              jobType: job.name,
            }, 'Job status created (awaited for test job)');
          } else {
            // Fire-and-forget for production jobs (non-blocking)
            createJobStatus(job).catch(err => {
              logger.error({
                jobId: job.id,
                err: err.message,
              }, 'Failed to create job status (non-fatal)');
            });
          }
        }

        // Fire-and-forget: Mark job as active in database
        // Note: markJobActive has delay logic to prevent timestamp constraint violations
        markJobActive(job).catch(err => {
          logger.error({
            jobId: job.id,
            err: err.message,
          }, 'Failed to update job active state in database (non-fatal)');
        });
      } catch (error: any) {
        logger.error({
          jobId: job.id,
          err: error.message,
        }, 'Error in active handler');
      }
    });

    // Event: Worker error
    worker.on('error', (error: Error) => {
      logger.error({ err: error }, 'Worker error');
    });

    logger.info({
      queueName: QUEUE_NAME,
      concurrency,
      registeredHandlers: Object.keys(jobHandlers),
    }, 'BullMQ worker initialized');

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
    registeredHandlers: Object.keys(jobHandlers),
  };
}

// Graceful shutdown on process termination
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down worker gracefully');
  const { generationLockService } = await import('../shared/locks');
  await generationLockService.releaseAllLocks();
  await stopWorker(false);
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down worker gracefully');
  const { generationLockService } = await import('../shared/locks');
  await generationLockService.releaseAllLocks();
  await stopWorker(false);
  process.exit(0);
});

export default {
  getWorker,
  startWorker,
  stopWorker,
  isWorkerRunning,
  getWorkerStatus,
};
