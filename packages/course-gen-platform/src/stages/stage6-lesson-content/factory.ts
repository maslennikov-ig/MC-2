import { Worker, Queue, type Job } from 'bullmq';
import { getRedisClient } from '@/shared/cache/redis';
import { logger } from '@/shared/logger';
import {
  createJobStatus,
  markJobCompleted,
  markJobFailed,
} from '@/orchestrator/job-status-tracker';
import type { JobData } from '@megacampus/shared-types';
import { HANDLER_CONFIG } from './config';
import { Stage6JobInput, Stage6JobResult, ProgressUpdate } from './types';
import { processStage6Job } from './services/job-processor';
import {
  type Stage6BatchCoordinatorInput,
  type Stage6BatchProcessorResult,
} from './batch/batch-processor';
import { createProductionStage6BatchProcessor } from './batch/production';

type Stage6QueueJobInput = Stage6JobInput | Stage6BatchCoordinatorInput;
const batchLookupQueues = new WeakMap<
  Worker<Stage6QueueJobInput, Stage6JobResult>,
  Queue<Stage6QueueJobInput, Stage6JobResult>
>();

function batchResult(courseId: string, result: Stage6BatchProcessorResult): Stage6JobResult {
  return {
    lessonId: `batch:${courseId}`,
    success: true,
    lessonContent: null,
    errors: [],
    metrics: {
      tokensUsed: 0,
      durationMs: 0,
      modelUsed: null,
      selectedModel: null,
      fallbackModel: null,
      selectedModelTier: null,
      selectedModelTierReason: `Released ${result.releasedLessons} lessons (${result.syncFallbacks} sync fallbacks)`,
      selectedModelPhase: 'stage_6_batch_coordinator',
      selectedModelSource: 'openrouter_live_catalog',
      qualityScore: 0,
      regenerateCount: 0,
      truncationCount: 0,
      rejectedTokens: 0,
      regenerationMode: null,
      attemptLadder: [],
    },
  };
}

/**
 * Create and configure the Stage 6 BullMQ worker
 */
export function createStage6Worker(
  redisUrl?: string
): Worker<Stage6QueueJobInput, Stage6JobResult> {
  const connection = redisUrl ? { url: redisUrl } : getRedisClient();
  const lookupQueue = createStage6Queue(redisUrl) as unknown as Queue<
    Stage6QueueJobInput,
    Stage6JobResult
  >;
  const processBatch = createProductionStage6BatchProcessor(lookupQueue);

  const worker = new Worker<Stage6QueueJobInput, Stage6JobResult>(
    HANDLER_CONFIG.QUEUE_NAME,
    async (job, token) => {
      if ('kind' in job.data && job.data.kind === 'stage6_batch_coordinator') {
        return batchResult(job.data.courseId, await processBatch(job as never, token));
      }
      return processStage6Job(job as Job<Stage6JobInput, Stage6JobResult>, token);
    },
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
  batchLookupQueues.set(worker, lookupQueue);

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
    // Track in job_status table for frontend polling
    if (job && !('kind' in job.data && job.data.kind === 'stage6_batch_coordinator')) {
      markJobCompleted(job as unknown as import('bullmq').Job<JobData>).catch(err => {
        logger.warn({ jobId: job.id, error: err }, 'Failed to mark job completed in job_status');
      });
    }
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
    // Track in job_status table for frontend polling
    if (job && !('kind' in job.data && job.data.kind === 'stage6_batch_coordinator')) {
      markJobFailed(job as unknown as import('bullmq').Job<JobData>, error).catch(err => {
        logger.warn({ jobId: job.id, error: err }, 'Failed to mark job failed in job_status');
      });
    }
  });

  worker.on('active', job => {
    // Track in job_status table for frontend polling
    if (job && 'organizationId' in job.data && job.data.organizationId) {
      createJobStatus(job as unknown as import('bullmq').Job<JobData>).catch(err => {
        logger.warn({ jobId: job.id, error: err }, 'Failed to create job status');
      });
    }
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

  worker.on('stalled', jobId => {
    logger.warn(
      {
        jobId,
      },
      'Stage 6 job stalled'
    );
  });

  worker.on('error', error => {
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
  const connection = redisUrl ? { url: redisUrl } : getRedisClient();

  const queue = new Queue<Stage6JobInput, Stage6JobResult>(HANDLER_CONFIG.QUEUE_NAME, {
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
  });

  queue.on('error', error => {
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
  worker: Worker<Stage6QueueJobInput, Stage6JobResult>
): Promise<void> {
  logger.info('Shutting down Stage 6 worker gracefully...');

  try {
    await worker.close();
    const lookupQueue = batchLookupQueues.get(worker);
    if (lookupQueue) {
      await lookupQueue.close();
      batchLookupQueues.delete(worker);
    }
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
