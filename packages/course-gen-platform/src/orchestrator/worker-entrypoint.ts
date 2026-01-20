/**
 * BullMQ Worker Entrypoint
 *
 * Standalone worker process for processing BullMQ jobs.
 * This runs separately from the API server for better resource isolation.
 *
 * Usage:
 * ```bash
 * # Development
 * pnpm dev:worker
 *
 * # Production
 * pnpm build
 * pnpm start:worker
 * ```
 *
 * @module orchestrator/worker-entrypoint
 */

import 'dotenv/config';
import { setMaxListeners } from 'events';
import { startWorker } from './worker';
import logger from '../shared/logger';
import {
  createStage6Worker,
  gracefulShutdown as gracefulShutdownStage6,
} from '../stages/stage6-lesson-content/factory';

// Increase max listeners globally to prevent MaxListenersExceededWarning
// during parallel LLM requests with AbortSignal timeouts
// Default is 10, we set to 30 to accommodate concurrent batch operations
setMaxListeners(30);
import { validateEnvironment } from '../shared/config/env-validator';
import {
  initializeModelConfigBunker,
  getModelConfigBunker,
} from '../shared/llm/model-config-bunker';
import { TIMEOUTS } from '../shared/constants/timeouts';
import { refreshReadinessHeartbeat } from './worker-readiness';

// Validate environment
validateEnvironment();

/**
 * Memory monitoring thresholds (in MB)
 */
const MEMORY_THRESHOLDS = {
  /** Log warning */
  warning: 512,
  /** Log error, worker should consider pausing */
  critical: 768,
  /** Force GC if available, alert */
  emergency: 900,
} as const;

/**
 * Memory monitoring interval (milliseconds)
 * 2 seconds for faster detection of memory issues
 */
const MEMORY_CHECK_INTERVAL_MS = 2000;

/**
 * Debug log throttle: log every Nth check when memory is normal
 * With 2s interval: 15 checks = 30 seconds between debug logs
 */
const DEBUG_LOG_EVERY_N_CHECKS = 15;

/**
 * Peak memory tracking
 */
let peakHeapUsed = 0;
let memoryMonitorInterval: NodeJS.Timeout | null = null;
let memoryCheckCount = 0;

/**
 * Readiness heartbeat interval (in ms)
 * Refreshes Redis TTL every 60 seconds to indicate worker is alive
 * TTL is 5 minutes, so we have ~4 missed heartbeats before expiry
 */
const READINESS_HEARTBEAT_INTERVAL_MS = 60000;
let readinessHeartbeatInterval: NodeJS.Timeout | null = null;

/**
 * Start memory monitoring with threshold-based alerts
 */
function startMemoryMonitoring(): void {
  memoryMonitorInterval = setInterval(() => {
    memoryCheckCount++;
    const mem = process.memoryUsage();
    const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
    const rssMB = Math.round(mem.rss / 1024 / 1024);

    // Track peak
    if (mem.heapUsed > peakHeapUsed) {
      peakHeapUsed = mem.heapUsed;
    }
    const peakMB = Math.round(peakHeapUsed / 1024 / 1024);

    // Threshold-based logging - always log warnings/errors immediately
    if (heapMB >= MEMORY_THRESHOLDS.emergency) {
      logger.error(
        { heapMB, rssMB, peakMB, threshold: 'emergency' },
        'EMERGENCY: Memory critical, forcing GC'
      );
      // Force garbage collection if available (requires --expose-gc flag)
      if (typeof global.gc === 'function') {
        global.gc();
      }
    } else if (heapMB >= MEMORY_THRESHOLDS.critical) {
      logger.error(
        { heapMB, rssMB, peakMB, threshold: 'critical' },
        'CRITICAL: Memory pressure detected'
      );
    } else if (heapMB >= MEMORY_THRESHOLDS.warning) {
      logger.warn(
        { heapMB, rssMB, peakMB, threshold: 'warning' },
        'WARNING: Elevated memory usage'
      );
    } else if (memoryCheckCount % DEBUG_LOG_EVERY_N_CHECKS === 0) {
      // Only log debug every Nth check (30 seconds) to reduce log volume
      logger.debug({ heapMB, rssMB, peakMB }, 'Memory status');
    }
  }, MEMORY_CHECK_INTERVAL_MS);
}

/**
 * Stop memory monitoring
 */
function stopMemoryMonitoring(): void {
  if (memoryMonitorInterval) {
    clearInterval(memoryMonitorInterval);
    memoryMonitorInterval = null;
  }
}

/**
 * Start readiness heartbeat
 *
 * Periodically refreshes the readiness status TTL in Redis.
 * This allows API server to detect if worker crashes (TTL expires).
 */
function startReadinessHeartbeat(): void {
  if (readinessHeartbeatInterval) return;

  readinessHeartbeatInterval = setInterval(() => {
    refreshReadinessHeartbeat()
      .then(success => {
        if (!success) {
          logger.warn('Failed to refresh readiness heartbeat');
        }
      })
      .catch((error: unknown) => {
        logger.error({ error }, 'Error in readiness heartbeat');
      });
  }, READINESS_HEARTBEAT_INTERVAL_MS);

  logger.info(
    {
      intervalMs: READINESS_HEARTBEAT_INTERVAL_MS,
    },
    'Readiness heartbeat started'
  );
}

/**
 * Stop readiness heartbeat
 */
function stopReadinessHeartbeat(): void {
  if (readinessHeartbeatInterval) {
    clearInterval(readinessHeartbeatInterval);
    readinessHeartbeatInterval = null;
    logger.info('Readiness heartbeat stopped');
  }
}

// Start monitoring immediately
startMemoryMonitoring();

// Cleanup on exit
process.on('SIGINT', () => {
  stopMemoryMonitoring();
  stopReadinessHeartbeat();
  // Shutdown bunker (stops background sync timer)
  const bunker = getModelConfigBunker();
  if (bunker.isInitialized()) {
    bunker.shutdown();
  }
});
process.on('SIGTERM', () => {
  stopMemoryMonitoring();
  stopReadinessHeartbeat();
  // Shutdown bunker (stops background sync timer)
  const bunker = getModelConfigBunker();
  if (bunker.isInitialized()) {
    bunker.shutdown();
  }
});

/**
 * Wrapper for executing async function with timeout
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeoutMs)),
  ]);
}

/**
 * Start the worker
 */
async function main() {
  try {
    logger.info('Starting BullMQ worker...');

    // Run pre-flight checks BEFORE accepting any jobs
    // This ensures uploads directory is mounted and accessible
    logger.info('Running pre-flight checks...');
    const { runPreFlightChecks } = await import('./worker-readiness');
    const preFlightResults = await withTimeout(
      runPreFlightChecks(true),
      TIMEOUTS.PRE_FLIGHT_TOTAL,
      `Pre-flight checks timed out after ${TIMEOUTS.PRE_FLIGHT_TOTAL / 1000} seconds`
    );

    const failedChecks = preFlightResults.filter(r => !r.passed);
    if (failedChecks.length > 0) {
      logger.error(
        { failedChecks: failedChecks.map(c => c.name) },
        'Pre-flight checks failed, aborting worker startup'
      );
      process.exit(1);
    }

    // Initialize ModelConfigBunker BEFORE accepting jobs
    // This loads configs from disk/Redis/DB with graceful fallbacks
    logger.info('Initializing ModelConfigBunker...');
    const bunker = await withTimeout(
      initializeModelConfigBunker(),
      TIMEOUTS.BUNKER_INIT,
      `ModelConfigBunker initialization timed out after ${TIMEOUTS.BUNKER_INIT / 1000} seconds`
    );
    const health = bunker.getHealth();
    logger.info(
      {
        configCount: health.configCount,
        cacheAge: health.cacheAge,
        source: health.source,
      },
      'ModelConfigBunker initialized'
    );

    // Check if this is a dedicated Stage 6 worker
    // Stage 6 has its own queue with 30 concurrent workers for I/O-bound LLM operations
    // @see docs/plans/sprightly-wondering-widget.md
    if (process.env.STAGE6_WORKER === 'true') {
      logger.info('Starting dedicated Stage 6 worker (30 concurrent)...');

      const stage6Worker = createStage6Worker();

      // Handle graceful shutdown for Stage 6 worker
      const shutdownStage6 = () => {
        logger.info('Received shutdown signal for Stage 6 worker');
        stopMemoryMonitoring();
        stopReadinessHeartbeat();
        const bunker = getModelConfigBunker();
        if (bunker.isInitialized()) {
          bunker.shutdown();
        }
        gracefulShutdownStage6(stage6Worker)
          .then(() => process.exit(0))
          .catch(err => {
            logger.error({ err }, 'Error during Stage 6 worker shutdown');
            process.exit(1);
          });
      };

      process.on('SIGINT', shutdownStage6);
      process.on('SIGTERM', shutdownStage6);

      // Start readiness heartbeat for Stage 6 worker
      startReadinessHeartbeat();

      logger.info(
        {
          queueName: 'stage6-lesson-content',
          concurrency: 30,
          mode: 'dedicated',
        },
        'Stage 6 worker started successfully'
      );

      // Keep process running
      return;
    }

    // Start general worker with default concurrency (5)
    // Adjust concurrency based on server resources:
    // - Development: 2-5 concurrent jobs
    // - Production: 10-20 concurrent jobs (monitor CPU/memory)
    const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);

    await startWorker(concurrency);

    // Start readiness heartbeat to keep Redis TTL fresh
    // This allows API server to detect if worker crashes
    startReadinessHeartbeat();

    logger.info(
      {
        concurrency,
        queueName: 'course-generation',
        registeredHandlers: [
          'TEST_JOB',
          'INITIALIZE',
          'DOCUMENT_PROCESSING',
          'DOCUMENT_CLASSIFICATION',
          'STRUCTURE_ANALYSIS',
          'STRUCTURE_GENERATION',
          'LESSON_CONTENT',
        ],
      },
      'Worker started successfully'
    );
  } catch (error) {
    logger.error({ err: error }, 'Failed to start worker');
    process.exit(1);
  }
}

// Start the worker
main().catch(error => {
  logger.error({ err: error }, 'Fatal error in worker entrypoint');
  process.exit(1);
});
