/**
 * Stage 7 Worker Factory
 * @module stages/stage7-enrichments/factory
 *
 * Creates and configures BullMQ worker and queue for enrichment generation.
 * Follows Stage 6 patterns for consistency.
 */

import { Worker, Queue } from 'bullmq';
import { getRedisClient } from '@/shared/cache/redis';
import { logger } from '@/shared/logger';
import { STAGE7_CONFIG } from './config';
import type { Stage7JobInput, Stage7JobResult, Stage7ProgressUpdate } from './types';
import { processStage7Job } from './services/job-processor';

/**
 * Create and configure the Stage 7 BullMQ worker
 *
 * @param redisUrl - Optional Redis URL (uses default if not provided)
 * @returns Configured BullMQ worker
 */
export function createStage7Worker(
  redisUrl?: string
): Worker<Stage7JobInput, Stage7JobResult> {
  const connection = redisUrl ? { url: redisUrl } : getRedisClient();

  const worker = new Worker<Stage7JobInput, Stage7JobResult>(
    STAGE7_CONFIG.QUEUE_NAME,
    processStage7Job,
    {
      connection,
      concurrency: STAGE7_CONFIG.CONCURRENCY,
      limiter: {
        max: STAGE7_CONFIG.CONCURRENCY,
        duration: 1000,
      },
      lockDuration: STAGE7_CONFIG.LOCK_DURATION_MS,
      lockRenewTime: STAGE7_CONFIG.LOCK_RENEW_TIME_MS,
      stalledInterval: STAGE7_CONFIG.STALLED_INTERVAL_MS,
      maxStalledCount: STAGE7_CONFIG.MAX_STALLED_COUNT,
    }
  );

  // Event handlers
  worker.on('completed', (job, result) => {
    logger.info(
      {
        jobId: job?.id,
        enrichmentId: result.enrichmentId,
        success: result.success,
        status: result.status,
        durationMs: result.metrics.durationMs,
        tokensUsed: result.metrics.tokensUsed,
        costUsd: result.metrics.costUsd,
      },
      'Stage 7 job completed'
    );
  });

  worker.on('failed', (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        enrichmentId: job?.data.enrichmentId,
        enrichmentType: job?.data.enrichmentType,
        error: error.message,
        attemptsMade: job?.attemptsMade,
      },
      'Stage 7 job failed'
    );
  });

  worker.on('progress', (job, progress) => {
    const progressData = progress as Stage7ProgressUpdate;
    logger.debug(
      {
        jobId: job.id,
        enrichmentId: job.data.enrichmentId,
        phase: progressData.phase,
        progress: progressData.progress,
        message: progressData.message,
      },
      'Stage 7 job progress'
    );
  });

  worker.on('stalled', (jobId) => {
    logger.warn(
      {
        jobId,
      },
      'Stage 7 job stalled'
    );
  });

  worker.on('error', (error) => {
    logger.error(
      {
        error: error.message,
      },
      'Stage 7 worker error'
    );
  });

  logger.info(
    {
      queueName: STAGE7_CONFIG.QUEUE_NAME,
      concurrency: STAGE7_CONFIG.CONCURRENCY,
      lockDuration: STAGE7_CONFIG.LOCK_DURATION_MS,
    },
    'Stage 7 worker initialized'
  );

  return worker;
}

/**
 * Create Stage 7 queue for job submission
 *
 * @param redisUrl - Optional Redis URL (uses default if not provided)
 * @returns Configured BullMQ queue
 */
export function createStage7Queue(
  redisUrl?: string
): Queue<Stage7JobInput, Stage7JobResult> {
  const connection = redisUrl ? { url: redisUrl } : getRedisClient();

  const queue = new Queue<Stage7JobInput, Stage7JobResult>(
    STAGE7_CONFIG.QUEUE_NAME,
    {
      connection,
      defaultJobOptions: {
        attempts: STAGE7_CONFIG.MAX_RETRIES,
        backoff: {
          type: 'exponential',
          delay: STAGE7_CONFIG.RETRY_DELAY_MS,
        },
        removeOnComplete: {
          count: 1000,
          age: 24 * 60 * 60, // 24 hours
        },
        removeOnFail: {
          count: 5000,
          age: 7 * 24 * 60 * 60, // 7 days
        },
      },
    }
  );

  queue.on('error', (error) => {
    logger.error(
      {
        error: error.message,
        queueName: STAGE7_CONFIG.QUEUE_NAME,
      },
      'Stage 7 queue error'
    );
  });

  logger.info(
    {
      queueName: STAGE7_CONFIG.QUEUE_NAME,
      maxRetries: STAGE7_CONFIG.MAX_RETRIES,
      retryDelay: STAGE7_CONFIG.RETRY_DELAY_MS,
    },
    'Stage 7 queue initialized'
  );

  return queue;
}

/**
 * Graceful shutdown handler for Stage 7 worker
 *
 * @param worker - Worker instance to shut down
 */
export async function gracefulShutdown(
  worker: Worker<Stage7JobInput, Stage7JobResult>
): Promise<void> {
  logger.info('Shutting down Stage 7 worker gracefully...');

  try {
    await worker.close();
    logger.info('Stage 7 worker closed successfully');
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error during Stage 7 worker shutdown'
    );
  }
}

/**
 * Add a job to the Stage 7 queue
 *
 * @param queue - Queue instance
 * @param input - Job input data
 * @param options - Optional job options
 * @returns Added job
 */
export async function addEnrichmentJob(
  queue: Queue<Stage7JobInput, Stage7JobResult>,
  input: Stage7JobInput,
  options?: {
    priority?: number;
    delay?: number;
    jobId?: string;
  }
) {
  const jobName = `${input.enrichmentType}-${input.enrichmentId}`;

  const job = await queue.add(jobName, input, {
    priority: options?.priority,
    delay: options?.delay,
    jobId: options?.jobId || `enrich-${input.enrichmentId}-${Date.now()}`,
  });

  logger.debug(
    {
      jobId: job.id,
      enrichmentId: input.enrichmentId,
      enrichmentType: input.enrichmentType,
      lessonId: input.lessonId,
    },
    'Enrichment job added to queue'
  );

  return job;
}

/**
 * Get queue statistics
 *
 * @param queue - Queue instance
 * @returns Queue statistics
 */
export async function getQueueStats(
  queue: Queue<Stage7JobInput, Stage7JobResult>
) {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + delayed,
  };
}
