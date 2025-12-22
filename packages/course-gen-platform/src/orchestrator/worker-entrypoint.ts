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
import { startWorker } from './worker';
import logger from '../shared/logger';
import { validateEnvironment } from '../shared/config/env-validator';
import { initializeModelConfigBunker, getModelConfigBunker } from '../shared/llm/model-config-bunker';

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
      logger.error({ heapMB, rssMB, peakMB, threshold: 'emergency' },
        'EMERGENCY: Memory critical, forcing GC');
      // Force garbage collection if available (requires --expose-gc flag)
      if (typeof global.gc === 'function') {
        global.gc();
      }
    } else if (heapMB >= MEMORY_THRESHOLDS.critical) {
      logger.error({ heapMB, rssMB, peakMB, threshold: 'critical' },
        'CRITICAL: Memory pressure detected');
    } else if (heapMB >= MEMORY_THRESHOLDS.warning) {
      logger.warn({ heapMB, rssMB, peakMB, threshold: 'warning' },
        'WARNING: Elevated memory usage');
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

// Start monitoring immediately
startMemoryMonitoring();

// Cleanup on exit
process.on('SIGINT', () => {
  stopMemoryMonitoring();
  // Shutdown bunker (stops background sync timer)
  const bunker = getModelConfigBunker();
  if (bunker.isInitialized()) {
    bunker.shutdown();
  }
});
process.on('SIGTERM', () => {
  stopMemoryMonitoring();
  // Shutdown bunker (stops background sync timer)
  const bunker = getModelConfigBunker();
  if (bunker.isInitialized()) {
    bunker.shutdown();
  }
});

/**
 * Start the worker
 */
async function main() {
  try {
    logger.info('Starting BullMQ worker...');

    // Initialize ModelConfigBunker BEFORE accepting jobs
    // This loads configs from disk/Redis/DB with graceful fallbacks
    logger.info('Initializing ModelConfigBunker...');
    const bunker = await initializeModelConfigBunker();
    const health = bunker.getHealth();
    logger.info({
      configCount: health.configCount,
      cacheAge: health.cacheAge,
      source: health.source,
    }, 'ModelConfigBunker initialized');

    // Start worker with default concurrency (5)
    // Adjust concurrency based on server resources:
    // - Development: 2-5 concurrent jobs
    // - Production: 10-20 concurrent jobs (monitor CPU/memory)
    const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);

    await startWorker(concurrency);

    logger.info({
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
    }, 'Worker started successfully');
  } catch (error) {
    logger.error({ err: error }, 'Failed to start worker');
    process.exit(1);
  }
}

// Start the worker
main().catch((error) => {
  logger.error({ err: error }, 'Fatal error in worker entrypoint');
  process.exit(1);
});
