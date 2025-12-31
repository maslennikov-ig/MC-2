/**
 * Stage 7 Enrichment Worker Entrypoint
 * @module stages/stage7-enrichments/worker-entrypoint
 *
 * Standalone worker process for processing enrichment BullMQ jobs.
 * This runs separately from the main API server and course generation worker.
 *
 * Usage:
 * ```bash
 * # Development
 * pnpm dev:worker:stage7
 *
 * # Production
 * pnpm build
 * pnpm start:worker:stage7
 * ```
 */

import 'dotenv/config';
import { logger } from '@/shared/logger';
import { createStage7Worker, gracefulShutdown, STAGE7_CONFIG } from './index';
import type { Worker } from 'bullmq';
import type { Stage7JobInput, Stage7JobResult } from './types';

let worker: Worker<Stage7JobInput, Stage7JobResult> | null = null;

/**
 * Graceful shutdown handler
 */
async function handleShutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Received shutdown signal, closing Stage 7 worker...');

  if (worker) {
    await gracefulShutdown(worker);
    worker = null;
  }

  logger.info('Stage 7 worker shutdown complete');
  process.exit(0);
}

/**
 * Start the Stage 7 enrichment worker
 */
async function main(): Promise<void> {
  try {
    logger.info('Starting Stage 7 Enrichment Worker...');

    // Create and start the worker
    worker = createStage7Worker();

    // Register shutdown handlers
    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));

    logger.info(
      {
        queueName: STAGE7_CONFIG.QUEUE_NAME,
        concurrency: STAGE7_CONFIG.CONCURRENCY,
        lockDuration: STAGE7_CONFIG.LOCK_DURATION_MS,
        maxRetries: STAGE7_CONFIG.MAX_RETRIES,
      },
      'Stage 7 Enrichment Worker started successfully'
    );
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to start Stage 7 worker'
    );
    process.exit(1);
  }
}

// Start the worker
main().catch((error) => {
  logger.error(
    {
      error: error instanceof Error ? error.message : String(error),
    },
    'Fatal error in Stage 7 worker entrypoint'
  );
  process.exit(1);
});
