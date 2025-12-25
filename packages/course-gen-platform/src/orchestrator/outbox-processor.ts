/**
 * Background Outbox Processor
 *
 * Polls the `job_outbox` table and creates BullMQ jobs asynchronously.
 * Ensures eventual consistency between FSM state transitions and job creation.
 *
 * Architecture:
 * - Adaptive polling: 1s when busy, backs off to 30s when idle
 * - Batch processing: 100 jobs per batch, processed in parallel groups of 10
 * - Retry logic: Max 5 retries with exponential backoff on connection errors
 * - Graceful shutdown: SIGTERM/SIGINT handlers wait for current batch
 * - Health checks: Monitors queue depth, poll interval, last activity time
 *
 * @module orchestrator/outbox-processor
 */

import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { getQueue } from './queue';
import logger from '@/shared/logger';
import type { JobOutboxEntry } from '@megacampus/shared-types/transactional-outbox';
import type { JobData } from '@megacampus/shared-types';
import { metricsStore } from './metrics';

/**
 * Health status for monitoring and debugging
 */
export interface OutboxProcessorHealth {
  /** Whether processor is currently running and responsive */
  alive: boolean;
  /** Timestamp of last successful or attempted processing */
  lastProcessed: Date;
  /** Number of pending jobs in current batch */
  queueDepth: number;
  /** Current polling interval in milliseconds */
  pollInterval: number;
}

/**
 * Background processor for transactional outbox pattern
 *
 * Continuously polls the job_outbox table and creates BullMQ jobs.
 * Implements adaptive backoff, batch processing, and automatic retry logic.
 */
export class OutboxProcessor {
  private get supabase() {
    return getSupabaseAdmin();
  }
  private queue = getQueue();

  /** Current polling interval (starts at 1s, backs off to 30s when idle) */
  private pollInterval = 1000;

  /** Whether processor is currently running */
  private isRunning = false;

  /** Maximum polling interval (30 seconds) */
  private readonly maxPollInterval = 30000;

  /** Minimum polling interval (1 second) */
  private readonly minPollInterval = 1000;

  /** Backoff multiplier for adaptive polling */
  private readonly backoffMultiplier = 1.5;

  /** Timestamp of last processing activity */
  private lastProcessedAt: Date = new Date();

  /** Current number of pending jobs */
  private currentQueueDepth: number = 0;

  /** Maximum jobs to fetch per batch */
  private readonly batchSize = 100;

  /** Number of jobs to process in parallel */
  private readonly parallelSize = 10;

  /** Maximum retries per job */
  private readonly maxRetries = 5;

  /**
   * Start the processor polling loop
   *
   * Runs continuously in the background, polling the outbox table
   * and creating BullMQ jobs. Implements adaptive backoff and graceful
   * shutdown via SIGTERM/SIGINT signals.
   *
   * @returns Promise that resolves when processor is shut down
   */
  async start(): Promise<void> {
    this.isRunning = true;
    logger.info('Outbox processor started');

    while (this.isRunning) {
      try {
        const processed = await this.processBatch();
        this.lastProcessedAt = new Date();

        // Adaptive polling: back off when idle, reset when jobs found
        if (processed === 0) {
          this.pollInterval = Math.min(
            this.pollInterval * this.backoffMultiplier,
            this.maxPollInterval
          );
          // Use trace level to reduce dev log noise (only visible with LOG_LEVEL=trace)
          logger.trace(
            { nextPollInterval: this.pollInterval },
            'No jobs processed, increasing poll interval'
          );
        } else {
          this.pollInterval = this.minPollInterval;
          logger.trace(
            { jobsProcessed: processed },
            'Jobs processed, reset to min poll interval'
          );
        }

        await this.sleep(this.pollInterval);
      } catch (error) {
        logger.error(
          { error, pollInterval: this.pollInterval },
          'Outbox processor error, retrying in 5s'
        );
        await this.sleep(5000);
      }
    }

    logger.info('Outbox processor stopped');
  }

  /**
   * Stop the processor gracefully
   *
   * Signals the polling loop to stop after current batch completes.
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    logger.info('Stopping outbox processor');
  }

  /**
   * Get current health status
   *
   * Used for monitoring dashboards and health checks.
   *
   * @returns Health status object
   */
  getHealth(): OutboxProcessorHealth {
    const timeSinceLastProcess = Date.now() - this.lastProcessedAt.getTime();
    const isAlive = this.isRunning && timeSinceLastProcess < 60000;

    return {
      alive: isAlive,
      lastProcessed: this.lastProcessedAt,
      queueDepth: this.currentQueueDepth,
      pollInterval: this.pollInterval,
    };
  }

  /**
   * Process a single batch of pending jobs
   *
   * Fetches up to `batchSize` pending jobs from the outbox table and
   * creates BullMQ jobs in parallel groups. Updates the `processed_at`
   * timestamp after successful job creation.
   *
   * @returns Number of jobs successfully processed
   */
  private async processBatch(): Promise<number> {
    const startTime = Date.now();

    try {
      // Fetch pending jobs (processed_at IS NULL)
      // Note: job_outbox table may not be in generated types yet, using 'any' cast for table name
      const { data, error } = await this.supabase
        .from('job_outbox' as any)
        .select('*')
        .is('processed_at', null)
        .order('created_at', { ascending: true })
        .limit(this.batchSize);

      if (error) {
        logger.error(
          { error: error.message, code: error.code },
          'Failed to fetch pending jobs from outbox'
        );
        metricsStore.recordOutboxError(error.code || 'DatabaseError');
        throw error;
      }

      const pendingJobs = data as unknown as JobOutboxEntry[] | null;

      if (!pendingJobs || pendingJobs.length === 0) {
        this.currentQueueDepth = 0;
        return 0;
      }

      this.currentQueueDepth = pendingJobs.length;
      logger.info(
        { count: pendingJobs.length, batchSize: this.batchSize },
        'Processing outbox batch'
      );

      // Process in parallel groups of `parallelSize`
      let successCount = 0;
      let failureCount = 0;

      for (let i = 0; i < pendingJobs.length; i += this.parallelSize) {
        const batch = pendingJobs.slice(i, i + this.parallelSize);
        const results = await Promise.allSettled(
          batch.map(job => this.processJob(job))
        );

        // Count successes and failures
        successCount += results.filter(r => r.status === 'fulfilled').length;
        const batchFailures = results.filter(r => r.status === 'rejected');
        failureCount += batchFailures.length;

        // Log any failures
        if (batchFailures.length > 0) {
          logger.warn(
            { failureCount: batchFailures.length },
            'Some jobs in batch failed processing'
          );
        }
      }

      const duration = Date.now() - startTime;

      // Track metrics
      metricsStore.recordOutboxBatch(successCount, failureCount, duration, this.currentQueueDepth);

      return successCount;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorType = error instanceof Error ? error.name : 'UnknownError';

      metricsStore.recordOutboxError(errorType);

      logger.error({ error, duration }, 'Batch processing failed');
      throw error;
    }
  }

  /**
   * Process a single outbox entry with retry logic
   *
   * Attempts to create a BullMQ job with exponential backoff retry.
   * Marks the job as processed on success or records error on permanent failure.
   *
   * Retry strategy:
   * - Connection errors (ECONNREFUSED, ENOTFOUND, timeout): Retry up to 5 times
   * - Other errors: Permanent failure after first attempt
   * - Backoff: 1s, 2s, 4s, 8s, 16s
   *
   * @param job The outbox entry to process
   */
  private async processJob(job: JobOutboxEntry): Promise<void> {
    let attempt = 0;

    while (attempt < this.maxRetries) {
      try {
        // Create job in BullMQ
        const bullJob = await this.queue.add(
          job.queue_name,
          job.job_data as unknown as JobData, // Job data is JSONB, cast to JobData union
          {
            ...(job.job_options as Record<string, unknown> || {}),
            jobId: job.outbox_id, // Idempotency: use outbox ID as job ID
          }
        );

        // Mark as processed
        const { error: updateError } = await this.supabase
          .from('job_outbox' as any)
          .update({ processed_at: new Date().toISOString() })
          .eq('outbox_id', job.outbox_id);

        if (updateError) {
          throw updateError;
        }

        logger.info(
          {
            outboxId: job.outbox_id,
            queue: job.queue_name,
            bullJobId: bullJob.id,
            entityId: job.entity_id,
          },
          'Outbox job successfully processed and marked'
        );
        return;
      } catch (error) {
        attempt++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isConnectionError =
          errorMessage.includes('ECONNREFUSED') ||
          errorMessage.includes('ENOTFOUND') ||
          errorMessage.includes('timeout') ||
          errorMessage.includes('ETIMEDOUT');

        // Permanent failure: not a connection error or max retries exceeded
        if (!isConnectionError || attempt >= this.maxRetries) {
          const { error: updateError } = await this.supabase
            .from('job_outbox' as any)
            .update({
              attempts: job.attempts + attempt,
              last_error: errorMessage,
              last_attempt_at: new Date().toISOString(),
            })
            .eq('outbox_id', job.outbox_id);

          if (updateError) {
            logger.error(
              { error: updateError, outboxId: job.outbox_id },
              'Failed to update outbox entry with error'
            );
          }

          logger.error(
            {
              error,
              outboxId: job.outbox_id,
              attempts: attempt,
              queue: job.queue_name,
              isConnectionError,
              entityId: job.entity_id,
            },
            'Outbox job failed permanently'
          );
          return;
        }

        // Retry with exponential backoff
        const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 30000);

        // Track retry metrics
        metricsStore.recordOutboxRetry(job.outbox_id, attempt);

        logger.warn(
          {
            error,
            outboxId: job.outbox_id,
            attempt,
            maxRetries: this.maxRetries,
            backoffMs: backoff,
            queue: job.queue_name,
            entityId: job.entity_id,
          },
          'Connection error, retrying with exponential backoff'
        );

        await this.sleep(backoff);
      }
    }
  }

  /**
   * Sleep for specified milliseconds
   *
   * @param ms Milliseconds to sleep
   * @returns Promise that resolves after delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Singleton instance of the outbox processor
 */
export const outboxProcessor = new OutboxProcessor();

/**
 * Auto-start processor on application startup
 *
 * Runs in background with graceful shutdown handlers for SIGTERM and SIGINT.
 * Skipped in test environment to avoid interfering with tests.
 */
if (process.env.NODE_ENV !== 'test') {
  // Start processor in background
  const processorPromise = outboxProcessor.start().catch(error => {
    logger.error({ error }, 'Outbox processor crashed');
    process.exit(1);
  });

  /**
   * Handle SIGTERM (orchestration shutdown)
   * Gracefully stop the processor and exit
   */
  process.on('SIGTERM', () => {
    void (async () => {
      logger.info('SIGTERM received, gracefully stopping outbox processor');
      await outboxProcessor.stop();

      // Wait for current batch to complete (max 30s)
      const shutdownTimeout = setTimeout(() => {
        logger.warn('Processor shutdown timeout exceeded, forcing exit');
        process.exit(1);
      }, 30000);

      await processorPromise.finally(() => {
        clearTimeout(shutdownTimeout);
        process.exit(0);
      });
    })();
  });

  /**
   * Handle SIGINT (Ctrl+C in development)
   * Gracefully stop the processor and exit
   */
  process.on('SIGINT', () => {
    void (async () => {
      logger.info('SIGINT received, gracefully stopping outbox processor');
      await outboxProcessor.stop();

      // Wait for current batch to complete (max 30s)
      const shutdownTimeout = setTimeout(() => {
        logger.warn('Processor shutdown timeout exceeded, forcing exit');
        process.exit(1);
      }, 30000);

      await processorPromise.finally(() => {
        clearTimeout(shutdownTimeout);
        process.exit(0);
      });
    })();
  });
}

export default outboxProcessor;
