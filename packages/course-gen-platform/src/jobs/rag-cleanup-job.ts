/**
 * RAG Context Cleanup Job
 *
 * Scheduled job to cleanup expired RAG contexts per FR-035, FR-036.
 * Runs periodically (default: every hour) to clean up contexts that
 * are older than 1 hour after course_completed_at.
 *
 * @module jobs/rag-cleanup-job
 * @see specs/010-stages-456-pipeline/data-model.md
 */

import { logger } from '@/shared/logger';
import {
  cleanupExpiredRagContexts,
  deleteExpiredEntriesDirect,
  type BulkCleanupResult,
} from '@/shared/rag/rag-cleanup';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for the RAG cleanup job
 */
export interface RagCleanupJobConfig {
  /** Hours after which RAG context expires (default: 1) */
  expirationHours?: number;
  /** Interval between cleanup runs in milliseconds (default: 3600000 = 1 hour) */
  runIntervalMs?: number;
  /** Use direct deletion (faster, less detailed) vs per-course (default: false) */
  useDirectDeletion?: boolean;
  /** Dry run mode - log what would be deleted without deleting (default: false) */
  dryRun?: boolean;
  /** Enable verbose logging (default: false) */
  verbose?: boolean;
}

/**
 * Result of executing the cleanup job
 */
export interface RagCleanupJobResult {
  /** Total number of entries cleaned */
  totalCleaned: number;
  /** Number of courses processed (0 if direct deletion used) */
  coursesProcessed: number;
  /** Errors encountered during cleanup */
  errors: string[];
  /** Duration in milliseconds */
  durationMs: number;
  /** Timestamp when job ran */
  timestamp: Date;
  /** Whether job succeeded */
  success: boolean;
}

/**
 * Cleanup job state for the scheduler
 */
interface CleanupJobState {
  /** Timer reference for scheduled runs */
  timer: ReturnType<typeof setInterval> | null;
  /** Whether job is currently running */
  isRunning: boolean;
  /** Last execution result */
  lastResult: RagCleanupJobResult | null;
  /** Configuration used */
  config: Required<RagCleanupJobConfig>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG: Required<RagCleanupJobConfig> = {
  expirationHours: 1,
  runIntervalMs: 60 * 60 * 1000, // 1 hour
  useDirectDeletion: false,
  dryRun: false,
  verbose: false,
};

// ============================================================================
// JOB STATE
// ============================================================================

/**
 * Global state for the scheduled cleanup job
 */
const jobState: CleanupJobState = {
  timer: null,
  isRunning: false,
  lastResult: null,
  config: { ...DEFAULT_CONFIG },
};

// ============================================================================
// MAIN JOB FUNCTIONS
// ============================================================================

/**
 * Execute RAG cleanup job
 *
 * Runs the cleanup operation once. Use for manual execution or
 * integration with external job schedulers (e.g., cron, BullMQ).
 *
 * @param config - Job configuration options
 * @returns Result of the cleanup operation
 *
 * @example
 * ```typescript
 * // Manual execution
 * const result = await executeRagCleanupJob({ expirationHours: 1 });
 * console.log(`Cleaned ${result.totalCleaned} entries`);
 *
 * // With BullMQ
 * worker.on('completed', async (job) => {
 *   if (job.name === 'rag-cleanup') {
 *     const result = await executeRagCleanupJob(job.data);
 *     console.log(result);
 *   }
 * });
 * ```
 */
export async function executeRagCleanupJob(
  config?: RagCleanupJobConfig
): Promise<RagCleanupJobResult> {
  const resolvedConfig: Required<RagCleanupJobConfig> = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const startTime = Date.now();
  const timestamp = new Date();

  logger.info({
    expirationHours: resolvedConfig.expirationHours,
    useDirectDeletion: resolvedConfig.useDirectDeletion,
    dryRun: resolvedConfig.dryRun,
  }, '[RAG Cleanup Job] Starting execution');

  try {
    let result: RagCleanupJobResult;

    if (resolvedConfig.useDirectDeletion) {
      // Fast path: delete all expired entries at once
      const directResult = await deleteExpiredEntriesDirect(
        resolvedConfig.expirationHours,
        resolvedConfig.dryRun
      );

      result = {
        totalCleaned: directResult.deleted,
        coursesProcessed: 0,
        errors: directResult.error ? [directResult.error] : [],
        durationMs: Date.now() - startTime,
        timestamp,
        success: directResult.success,
      };
    } else {
      // Detailed path: process per course for detailed results
      const bulkResult: BulkCleanupResult = await cleanupExpiredRagContexts(
        resolvedConfig.expirationHours,
        { dryRun: resolvedConfig.dryRun }
      );

      result = {
        totalCleaned: bulkResult.totalDeleted,
        coursesProcessed: bulkResult.coursesProcessed,
        errors: bulkResult.errors,
        durationMs: Date.now() - startTime,
        timestamp,
        success: bulkResult.errors.length === 0,
      };
    }

    // Store last result
    jobState.lastResult = result;

    if (resolvedConfig.verbose || result.totalCleaned > 0) {
      logger.info({
        totalCleaned: result.totalCleaned,
        coursesProcessed: result.coursesProcessed,
        durationMs: result.durationMs,
        errorsCount: result.errors.length,
        dryRun: resolvedConfig.dryRun,
      }, '[RAG Cleanup Job] Execution complete');
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error({
      err: errorMessage,
    }, '[RAG Cleanup Job] Execution failed');

    const failedResult: RagCleanupJobResult = {
      totalCleaned: 0,
      coursesProcessed: 0,
      errors: [errorMessage],
      durationMs: Date.now() - startTime,
      timestamp,
      success: false,
    };

    jobState.lastResult = failedResult;
    return failedResult;
  }
}

/**
 * Start scheduled RAG cleanup
 *
 * Runs cleanup at the specified interval. Only one scheduler can be
 * active at a time - calling this again will restart with new config.
 *
 * @param config - Job configuration options
 * @returns Timer reference (can be passed to clearInterval)
 *
 * @example
 * ```typescript
 * // Start hourly cleanup
 * startScheduledCleanup({ runIntervalMs: 60 * 60 * 1000 });
 *
 * // Start with custom config
 * startScheduledCleanup({
 *   expirationHours: 2,
 *   runIntervalMs: 30 * 60 * 1000, // Every 30 minutes
 *   verbose: true,
 * });
 * ```
 */
export function startScheduledCleanup(
  config?: RagCleanupJobConfig
): ReturnType<typeof setInterval> {
  const resolvedConfig: Required<RagCleanupJobConfig> = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // Stop existing scheduler if running
  if (jobState.timer) {
    logger.debug('[RAG Cleanup Job] Stopping existing scheduler');
    clearInterval(jobState.timer);
    jobState.timer = null;
  }

  jobState.config = resolvedConfig;

  logger.info({
    intervalMs: resolvedConfig.runIntervalMs,
    intervalHours: (resolvedConfig.runIntervalMs / (60 * 60 * 1000)).toFixed(2),
    expirationHours: resolvedConfig.expirationHours,
  }, '[RAG Cleanup Job] Starting scheduled cleanup');

  // Run immediately on start
  void runScheduledCleanup(resolvedConfig).catch(err => logger.error({ err }, '[RAG Cleanup Job] Initial run failed'));

  // Schedule recurring runs
  jobState.timer = setInterval(() => {
    void runScheduledCleanup(resolvedConfig).catch(err => logger.error({ err }, '[RAG Cleanup Job] Scheduled run failed'));
  }, resolvedConfig.runIntervalMs);

  return jobState.timer;
}

/**
 * Stop scheduled cleanup
 *
 * Stops the background cleanup scheduler if running.
 *
 * @example
 * ```typescript
 * // Stop cleanup on shutdown
 * process.on('SIGTERM', () => {
 *   stopScheduledCleanup();
 *   process.exit(0);
 * });
 * ```
 */
export function stopScheduledCleanup(): void {
  if (jobState.timer) {
    clearInterval(jobState.timer);
    jobState.timer = null;
    logger.info('[RAG Cleanup Job] Scheduled cleanup stopped');
  }
}

/**
 * Check if scheduled cleanup is running
 *
 * @returns True if scheduler is active
 */
export function isScheduledCleanupRunning(): boolean {
  return jobState.timer !== null;
}

/**
 * Get last cleanup job result
 *
 * @returns Last execution result or null if never run
 */
export function getLastCleanupResult(): RagCleanupJobResult | null {
  return jobState.lastResult;
}

/**
 * Get current job configuration
 *
 * @returns Current configuration
 */
export function getJobConfig(): Required<RagCleanupJobConfig> {
  return { ...jobState.config };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Internal function to run scheduled cleanup with mutex
 *
 * Prevents overlapping runs if previous run takes longer than interval.
 */
async function runScheduledCleanup(
  config: Required<RagCleanupJobConfig>
): Promise<void> {
  // Prevent overlapping runs
  if (jobState.isRunning) {
    logger.debug('[RAG Cleanup Job] Skipping run - previous run still in progress');
    return;
  }

  jobState.isRunning = true;

  try {
    await executeRagCleanupJob(config);
  } finally {
    jobState.isRunning = false;
  }
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

/**
 * Handle process shutdown signals
 *
 * Automatically stops scheduler on SIGTERM/SIGINT.
 */
function handleShutdown(signal: string): void {
  logger.debug({
    signal,
  }, '[RAG Cleanup Job] Received shutdown signal');

  stopScheduledCleanup();
}

// Register shutdown handlers (only in Node.js environment)
if (typeof process !== 'undefined' && process.on) {
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}
