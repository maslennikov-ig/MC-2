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
import { cache } from '@/shared/cache/redis';
import { createStage7Worker, gracefulShutdown, STAGE7_CONFIG } from './index';
import type { Worker } from 'bullmq';
import type { Stage7JobInput, Stage7JobResult } from './types';

let worker: Worker<Stage7JobInput, Stage7JobResult> | null = null;

/**
 * Redis key for Stage 7 worker readiness status
 */
const REDIS_READINESS_KEY = 'worker-stage7:readiness:status';

/**
 * TTL for readiness status in Redis (seconds)
 * Status expires after 5 minutes to detect worker crashes
 */
const REDIS_READINESS_TTL = 300;

/**
 * Readiness heartbeat interval (in ms)
 */
const READINESS_HEARTBEAT_INTERVAL_MS = 60000;

let readinessHeartbeatInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Readiness status for Stage 7 worker
 */
interface Stage7ReadinessStatus {
  ready: boolean;
  startedAt: string;
  lastHeartbeat: string;
  workerId: string;
  queueName: string;
  concurrency: number;
}

/**
 * Get unique worker ID for this process
 */
function getWorkerId(): string {
  return `worker-stage7-${process.pid}-${Date.now()}`;
}

/**
 * Save readiness status to Redis
 */
async function saveReadinessToRedis(ready: boolean): Promise<boolean> {
  try {
    const status: Stage7ReadinessStatus = {
      ready,
      startedAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      workerId: getWorkerId(),
      queueName: STAGE7_CONFIG.QUEUE_NAME,
      concurrency: STAGE7_CONFIG.CONCURRENCY,
    };

    const success = await cache.set(REDIS_READINESS_KEY, status, {
      ttl: REDIS_READINESS_TTL,
    });

    if (success) {
      logger.info({ ready }, 'Stage 7 worker: Saved readiness status to Redis');
    }

    return success;
  } catch (error) {
    logger.error(
      { error: (error as Error).message },
      'Stage 7 worker: Error saving readiness to Redis'
    );
    return false;
  }
}

/**
 * Refresh readiness heartbeat
 */
async function refreshReadinessHeartbeat(): Promise<void> {
  try {
    await saveReadinessToRedis(true);
  } catch (error) {
    logger.warn(
      { error: (error as Error).message },
      'Stage 7 worker: Failed to refresh readiness heartbeat'
    );
  }
}

/**
 * Start readiness heartbeat
 */
function startReadinessHeartbeat(): void {
  if (readinessHeartbeatInterval) return;

  readinessHeartbeatInterval = setInterval(() => {
    refreshReadinessHeartbeat();
  }, READINESS_HEARTBEAT_INTERVAL_MS);

  logger.info(
    { intervalMs: READINESS_HEARTBEAT_INTERVAL_MS },
    'Stage 7 worker: Readiness heartbeat started'
  );
}

/**
 * Stop readiness heartbeat
 */
function stopReadinessHeartbeat(): void {
  if (readinessHeartbeatInterval) {
    clearInterval(readinessHeartbeatInterval);
    readinessHeartbeatInterval = null;
    logger.info('Stage 7 worker: Readiness heartbeat stopped');
  }
}

/**
 * Graceful shutdown handler
 */
async function handleShutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Received shutdown signal, closing Stage 7 worker...');

  stopReadinessHeartbeat();

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
    process.on('SIGINT', () => void handleShutdown('SIGINT'));
    process.on('SIGTERM', () => void handleShutdown('SIGTERM'));

    // Save initial readiness status and start heartbeat
    await saveReadinessToRedis(true);
    startReadinessHeartbeat();

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
main().catch(error => {
  logger.error(
    {
      error: error instanceof Error ? error.message : String(error),
    },
    'Fatal error in Stage 7 worker entrypoint'
  );
  process.exit(1);
});
