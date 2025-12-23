import { Worker, Queue } from 'bullmq';
import { getRedisClient } from '@/shared/cache/redis';
import { logger } from '@/shared/logger';
import { HANDLER_CONFIG } from './config';
import { Stage6JobInput, Stage6JobResult, ProgressUpdate } from './types';
import { processStage6Job } from './services/job-processor';

/**
 * Create and configure the Stage 6 BullMQ worker
 */
export function createStage6Worker(redisUrl?: string): Worker<Stage6JobInput, Stage6JobResult> {
  const connection = redisUrl
    ? { url: redisUrl }
    : getRedisClient();

  const worker = new Worker<Stage6JobInput, Stage6JobResult>(
    HANDLER_CONFIG.QUEUE_NAME,
    processStage6Job,
    {
      connection,
      concurrency: HANDLER_CONFIG.CONCURRENCY,
      limiter: {
        max: HANDLER_CONFIG.CONCURRENCY,
        duration: 1000,
      },
      lockDuration: HANDLER_CONFIG.LOCK_DURATION_MS,
      lockRenewTime: HANDLER_CONFIG.LOCK_RENEW_TIME_MS,
      stalledInterval: HANDLER_CONFIG.STALLED_INTERVAL_MS,
      maxStalledCount: HANDLER_CONFIG.MAX_STALLED_COUNT,
    }
  );

  worker.on('completed', (job, result) => {
    logger.info(
      {
        jobId: job?.id,
        lessonId: result.lessonId,
        success: result.success,
        durationMs: result.metrics.durationMs,
      },
      'Stage 6 job completed'
    );
  });

  worker.on('failed', (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        error: error.message,
        attemptsMade: job?.attemptsMade,
      },
      'Stage 6 job failed'
    );
  });

  worker.on('progress', (job, progress) => {
    const progressData = progress as ProgressUpdate;
    logger.debug(
      {
        jobId: job.id,
        phase: progressData.phase,
        progress: progressData.progress,
      },
      'Stage 6 job progress'
    );
  });

  worker.on('stalled', (jobId) => {
    logger.warn(
      {
        jobId,
      },
      'Stage 6 job stalled'
    );
  });

  worker.on('error', (error) => {
    logger.error(
      {
        error: error.message,
      },
      'Stage 6 worker error'
    );
  });

  logger.info(
    {
      queueName: HANDLER_CONFIG.QUEUE_NAME,
      concurrency: HANDLER_CONFIG.CONCURRENCY,
    },
    'Stage 6 worker initialized'
  );

  return worker;
}

/**
 * Create Stage 6 queue for job submission
 */
export function createStage6Queue(redisUrl?: string): Queue<Stage6JobInput, Stage6JobResult> {
  const connection = redisUrl
    ? { url: redisUrl }
    : getRedisClient();

  const queue = new Queue<Stage6JobInput, Stage6JobResult>(
    HANDLER_CONFIG.QUEUE_NAME,
    {
      connection,
      defaultJobOptions: {
        attempts: HANDLER_CONFIG.MAX_RETRIES,
        backoff: {
          type: 'exponential',
          delay: HANDLER_CONFIG.RETRY_DELAY_MS,
        },
        removeOnComplete: {
          count: 1000,
          age: 24 * 60 * 60,
        },
        removeOnFail: {
          count: 5000,
          age: 7 * 24 * 60 * 60,
        },
      },
    }
  );

  queue.on('error', (error) => {
    logger.error(
      {
        error: error.message,
        queueName: HANDLER_CONFIG.QUEUE_NAME,
      },
      'Stage 6 queue error'
    );
  });

  return queue;
}

/**
 * Graceful shutdown handler for Stage 6 worker
 */
export async function gracefulShutdown(
  worker: Worker<Stage6JobInput, Stage6JobResult>
): Promise<void> {
  logger.info('Shutting down Stage 6 worker gracefully...');

  try {
    await worker.close();
    logger.info('Stage 6 worker closed successfully');
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error during Stage 6 worker shutdown'
    );
  }
}
