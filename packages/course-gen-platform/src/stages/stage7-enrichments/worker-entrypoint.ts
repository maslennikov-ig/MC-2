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
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '@/shared/logger';
import { cache, REDIS_UNAVAILABLE_EVENT } from '@/shared/cache/redis';
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
 * Enrichments directory check result
 */
interface EnrichmentsDirectoryCheck {
  exists: boolean;
  writable: boolean;
  path: string;
  error?: string;
}

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
  enrichmentsDirectory?: EnrichmentsDirectoryCheck;
}

/**
 * Get unique worker ID for this process
 */
function getWorkerId(): string {
  return `worker-stage7-${process.pid}-${Date.now()}`;
}

/**
 * Get enrichments directory path from environment
 */
function getEnrichmentsPath(): string {
  return process.env.ENRICHMENTS_LOCAL_PATH || '/app/data/enrichments';
}

/**
 * Check if enrichments directory exists and is writable
 *
 * This is critical for Stage 7 worker to function - without a writable
 * enrichments directory, generated cover images, audio, video, quiz,
 * and presentation files cannot be saved.
 */
async function checkEnrichmentsDirectory(): Promise<EnrichmentsDirectoryCheck> {
  const enrichmentsPath = getEnrichmentsPath();

  // Skip check if not using local storage
  if (process.env.USE_LOCAL_STORAGE !== 'true') {
    return {
      exists: true,
      writable: true,
      path: enrichmentsPath,
    };
  }

  try {
    // Check if directory exists
    await fs.access(enrichmentsPath);

    // Try to write a test file to verify write permissions
    const testFile = path.join(enrichmentsPath, '.write-test');
    try {
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);

      logger.info({ path: enrichmentsPath }, 'Enrichments directory is writable');

      return {
        exists: true,
        writable: true,
        path: enrichmentsPath,
      };
    } catch (writeError) {
      logger.error(
        {
          path: enrichmentsPath,
          errorDetails: { message: (writeError as Error).message },
        },
        'Enrichments directory is not writable'
      );
      logger.error(
        { path: enrichmentsPath },
        `EACCES FIX: Run on host: sudo chown -R 1001:1001 ${enrichmentsPath} && sudo chmod -R 755 ${enrichmentsPath}`
      );

      return {
        exists: true,
        writable: false,
        path: enrichmentsPath,
        error: `Directory not writable: ${(writeError as Error).message}`,
      };
    }
  } catch (accessError) {
    // Directory doesn't exist - try to create it
    try {
      await fs.mkdir(enrichmentsPath, { recursive: true });
      logger.info({ path: enrichmentsPath }, 'Created enrichments directory');

      return {
        exists: true,
        writable: true,
        path: enrichmentsPath,
      };
    } catch (mkdirError) {
      logger.error(
        { path: enrichmentsPath, error: (mkdirError as Error).message },
        'Failed to create enrichments directory'
      );

      return {
        exists: false,
        writable: false,
        path: enrichmentsPath,
        error: `Cannot create directory: ${(mkdirError as Error).message}`,
      };
    }
  }
}

/**
 * Save readiness status to Redis
 */
async function saveReadinessToRedis(
  ready: boolean,
  enrichmentsCheck?: EnrichmentsDirectoryCheck
): Promise<boolean> {
  try {
    const status: Stage7ReadinessStatus = {
      ready,
      startedAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      workerId: getWorkerId(),
      queueName: STAGE7_CONFIG.QUEUE_NAME,
      concurrency: STAGE7_CONFIG.CONCURRENCY,
      enrichmentsDirectory: enrichmentsCheck,
    };

    const success = await cache.set(REDIS_READINESS_KEY, status, {
      ttl: REDIS_READINESS_TTL,
    });

    if (success) {
      logger.info(
        { ready, enrichmentsWritable: enrichmentsCheck?.writable },
        'Stage 7 worker: Saved readiness status to Redis'
      );
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
 * Refresh readiness heartbeat with enrichments directory check
 */
async function refreshReadinessHeartbeat(): Promise<void> {
  try {
    const enrichmentsCheck = await checkEnrichmentsDirectory();
    const isReady = enrichmentsCheck.writable;

    if (!isReady) {
      logger.warn({ enrichmentsCheck }, 'Stage 7 worker: Enrichments directory not writable');
    }

    await saveReadinessToRedis(isReady, enrichmentsCheck);
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
    void refreshReadinessHeartbeat();
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

    // Pre-flight check: Verify enrichments directory is writable
    const enrichmentsCheck = await checkEnrichmentsDirectory();
    if (!enrichmentsCheck.writable) {
      logger.error(
        {
          path: enrichmentsCheck.path,
          error: enrichmentsCheck.error,
        },
        'CRITICAL: Enrichments directory is not writable - worker will fail at runtime'
      );
      // Don't exit - continue but report degraded status
    }

    // Create and start the worker
    worker = createStage7Worker();

    // Register shutdown handlers
    process.on('SIGINT', () => void handleShutdown('SIGINT'));
    process.on('SIGTERM', () => void handleShutdown('SIGTERM'));
    // Handle Redis unavailable - graceful shutdown before forced exit
    process.on(REDIS_UNAVAILABLE_EVENT, () => void handleShutdown('REDIS_UNAVAILABLE'));

    // Save initial readiness status (include enrichments check) and start heartbeat
    const isReady = enrichmentsCheck.writable;
    await saveReadinessToRedis(isReady, enrichmentsCheck);
    startReadinessHeartbeat();

    logger.info(
      {
        queueName: STAGE7_CONFIG.QUEUE_NAME,
        concurrency: STAGE7_CONFIG.CONCURRENCY,
        lockDuration: STAGE7_CONFIG.LOCK_DURATION_MS,
        maxRetries: STAGE7_CONFIG.MAX_RETRIES,
        enrichmentsPath: enrichmentsCheck.path,
        enrichmentsWritable: enrichmentsCheck.writable,
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
