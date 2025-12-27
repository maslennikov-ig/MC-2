/**
 * Worker Readiness State
 *
 * Tracks pre-flight checks and worker readiness status.
 * Exposed via health endpoint for UI integration.
 *
 * @module orchestrator/worker-readiness
 */

import { access, constants, stat, statfs } from 'fs/promises';
import path from 'path';
import logger from '../shared/logger';
import { CHECK_NAMES, WORKER_MESSAGES } from '../shared/constants/messages';

/**
 * Pre-flight check result
 */
export interface PreFlightCheckResult {
  name: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

/**
 * Worker readiness status
 */
export interface WorkerReadinessStatus {
  ready: boolean;
  checks: PreFlightCheckResult[];
  startedAt: Date | null;
  readyAt: Date | null;
  lastCheckAt: Date;
}

/**
 * Minimum required disk space in bytes (1GB)
 */
const MIN_DISK_SPACE_BYTES = 1024 * 1024 * 1024;

/**
 * Pre-flight check configuration
 */
const PRE_FLIGHT_CONFIG = {
  /** Maximum time to wait for uploads directory (ms) */
  uploadsTimeout: 60000,
  /** Interval between retry attempts (ms) */
  retryInterval: 2000,
  /** Maximum retries for each check */
  maxRetries: 30,
} as const;

/**
 * Singleton state for worker readiness
 *
 * Thread-safe: Uses _checkInProgress flag to prevent concurrent
 * pre-flight check runs from corrupting state.
 */
class WorkerReadinessState {
  private _ready = false;
  private _checks: PreFlightCheckResult[] = [];
  private _startedAt: Date | null = null;
  private _readyAt: Date | null = null;
  private _lastCheckAt: Date = new Date();
  private _checkInProgress = false;

  /**
   * Get current readiness status (immutable snapshot)
   * Returns copies of all mutable objects to prevent external mutation
   */
  getStatus(): WorkerReadinessStatus {
    return {
      ready: this._ready,
      checks: [...this._checks],
      startedAt: this._startedAt ? new Date(this._startedAt) : null,
      readyAt: this._readyAt ? new Date(this._readyAt) : null,
      lastCheckAt: new Date(this._lastCheckAt),
    };
  }

  /**
   * Check if pre-flight checks are currently running
   */
  isCheckInProgress(): boolean {
    return this._checkInProgress;
  }

  /**
   * Try to start pre-flight checks (thread-safe)
   * Returns false if checks are already running
   */
  tryMarkStarting(): boolean {
    if (this._checkInProgress) {
      return false;
    }
    this._checkInProgress = true;
    this._startedAt = new Date();
    this._ready = false;
    this._checks = [];
    return true;
  }

  /**
   * Mark pre-flight checks as completed
   * MUST be called in finally block after tryMarkStarting()
   */
  markCompleted(): void {
    this._checkInProgress = false;
  }

  /**
   * Mark worker as starting
   * @deprecated Use tryMarkStarting() for thread-safe operation
   */
  markStarting(): void {
    this._startedAt = new Date();
    this._ready = false;
    this._checks = [];
  }

  /**
   * Add a check result
   */
  addCheck(check: PreFlightCheckResult): void {
    this._checks.push(check);
    this._lastCheckAt = new Date();
  }

  /**
   * Mark worker as ready
   */
  markReady(): void {
    this._ready = true;
    this._readyAt = new Date();
    this._lastCheckAt = new Date();
  }

  /**
   * Mark worker as not ready (failed pre-flight)
   */
  markNotReady(): void {
    this._ready = false;
    this._lastCheckAt = new Date();
  }

  /**
   * Check if worker is ready
   */
  isReady(): boolean {
    return this._ready;
  }
}

/**
 * Singleton instance
 */
export const workerReadiness = new WorkerReadinessState();

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get uploads directory path
 */
export function getUploadsPath(): string {
  return path.join(process.cwd(), 'uploads');
}

/**
 * Check if uploads directory is accessible
 *
 * Waits for the Docker volume mount to be ready before proceeding.
 * This prevents race conditions where worker starts processing jobs
 * before files are available.
 *
 * @returns PreFlightCheckResult
 */
export async function checkUploadsDirectory(): Promise<PreFlightCheckResult> {
  const uploadsPath = getUploadsPath();
  const startTime = Date.now();
  let lastError: Error | null = null;
  let attempts = 0;

  logger.info({ path: uploadsPath }, WORKER_MESSAGES.UPLOADS_CHECKING);

  while (attempts < PRE_FLIGHT_CONFIG.maxRetries) {
    attempts++;

    try {
      // Check if directory exists and is readable
      await access(uploadsPath, constants.R_OK);

      // Verify it's actually a directory
      const stats = await stat(uploadsPath);
      if (!stats.isDirectory()) {
        throw new Error('Path exists but is not a directory');
      }

      const durationMs = Date.now() - startTime;
      logger.info(
        { path: uploadsPath, attempts, durationMs },
        WORKER_MESSAGES.UPLOADS_ACCESSIBLE
      );

      return {
        name: CHECK_NAMES.UPLOADS_DIRECTORY,
        passed: true,
        message: `Uploads directory accessible at ${uploadsPath}`,
        durationMs,
      };
    } catch (error) {
      lastError = error as Error;

      // Check if we've exceeded timeout
      if (Date.now() - startTime >= PRE_FLIGHT_CONFIG.uploadsTimeout) {
        break;
      }

      logger.warn(
        {
          path: uploadsPath,
          attempt: attempts,
          maxRetries: PRE_FLIGHT_CONFIG.maxRetries,
          error: lastError.message,
        },
        WORKER_MESSAGES.UPLOADS_NOT_READY
      );

      await sleep(PRE_FLIGHT_CONFIG.retryInterval);
    }
  }

  const durationMs = Date.now() - startTime;
  logger.error(
    { path: uploadsPath, attempts, durationMs, error: lastError?.message },
    WORKER_MESSAGES.UPLOADS_FAILED
  );

  return {
    name: CHECK_NAMES.UPLOADS_DIRECTORY,
    passed: false,
    message: `Uploads directory not accessible after ${attempts} attempts: ${lastError?.message}`,
    durationMs,
  };
}

/**
 * Check if there's enough disk space for uploads
 */
export async function checkDiskSpace(): Promise<PreFlightCheckResult> {
  const uploadsPath = getUploadsPath();
  const startTime = Date.now();

  logger.info({ path: uploadsPath }, WORKER_MESSAGES.DISK_CHECKING);

  try {
    const stats = await statfs(uploadsPath);
    const availableBytes = stats.bfree * stats.bsize;
    const availableGB = (availableBytes / (1024 * 1024 * 1024)).toFixed(2);

    const durationMs = Date.now() - startTime;

    if (availableBytes < MIN_DISK_SPACE_BYTES) {
      logger.warn(
        { path: uploadsPath, availableGB, requiredGB: 1, durationMs },
        WORKER_MESSAGES.DISK_LOW
      );
      return {
        name: CHECK_NAMES.DISK_SPACE,
        passed: false,
        message: `Low disk space: ${availableGB}GB available (need at least 1GB)`,
        durationMs,
      };
    }

    logger.info(
      { path: uploadsPath, availableGB, durationMs },
      WORKER_MESSAGES.DISK_ADEQUATE
    );

    return {
      name: CHECK_NAMES.DISK_SPACE,
      passed: true,
      message: `Disk space available: ${availableGB}GB`,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error(
      { path: uploadsPath, error: (error as Error).message, durationMs },
      WORKER_MESSAGES.DISK_FAILED
    );
    return {
      name: CHECK_NAMES.DISK_SPACE,
      passed: false,
      message: `Failed to check disk space: ${(error as Error).message}`,
      durationMs,
    };
  }
}

/**
 * Check Redis connectivity via BullMQ queue
 */
export async function checkRedisConnection(): Promise<PreFlightCheckResult> {
  const startTime = Date.now();

  logger.info(WORKER_MESSAGES.REDIS_CHECKING);

  try {
    const { getQueue } = await import('./queue');
    const queue = getQueue();

    // Try to get job counts to verify connection
    await queue.getJobCounts();

    const durationMs = Date.now() - startTime;
    logger.info({ durationMs }, WORKER_MESSAGES.REDIS_HEALTHY);

    return {
      name: CHECK_NAMES.REDIS_CONNECTION,
      passed: true,
      message: 'Redis connection established',
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error(
      { durationMs, error: (error as Error).message },
      WORKER_MESSAGES.REDIS_FAILED
    );

    return {
      name: CHECK_NAMES.REDIS_CONNECTION,
      passed: false,
      message: `Redis connection failed: ${(error as Error).message}`,
      durationMs,
    };
  }
}

/**
 * Run all pre-flight checks (thread-safe)
 *
 * Uses tryMarkStarting() to prevent concurrent runs.
 * If checks are already in progress, returns cached results.
 *
 * @param failFast - If true, stop on first failure
 * @returns Array of check results
 */
export async function runPreFlightChecks(
  failFast = true
): Promise<PreFlightCheckResult[]> {
  // Thread-safe: prevent concurrent runs
  if (!workerReadiness.tryMarkStarting()) {
    logger.warn(WORKER_MESSAGES.PRE_FLIGHT_ALREADY_RUNNING);
    return workerReadiness.getStatus().checks;
  }

  const results: PreFlightCheckResult[] = [];

  try {
    logger.info(WORKER_MESSAGES.PRE_FLIGHT_STARTING);

    // Check 1: Uploads directory
    const uploadsCheck = await checkUploadsDirectory();
    results.push(uploadsCheck);
    workerReadiness.addCheck(uploadsCheck);

    if (!uploadsCheck.passed && failFast) {
      workerReadiness.markNotReady();
      return results;
    }

    // Check 2: Disk space (only if uploads dir is accessible)
    const diskCheck = await checkDiskSpace();
    results.push(diskCheck);
    workerReadiness.addCheck(diskCheck);

    if (!diskCheck.passed && failFast) {
      workerReadiness.markNotReady();
      return results;
    }

    // Check 3: Redis connectivity
    const redisCheck = await checkRedisConnection();
    results.push(redisCheck);
    workerReadiness.addCheck(redisCheck);

    if (!redisCheck.passed && failFast) {
      workerReadiness.markNotReady();
      return results;
    }

    // Add more checks here as needed:
    // - Supabase connectivity (checked by handlers)
    // - Docling MCP availability (checked by handlers)

    // All checks passed
    const allPassed = results.every((r) => r.passed);
    if (allPassed) {
      workerReadiness.markReady();
      logger.info(
        { checks: results.map((r) => ({ name: r.name, passed: r.passed })) },
        WORKER_MESSAGES.ALL_CHECKS_PASSED
      );
    } else {
      workerReadiness.markNotReady();
      logger.error(
        { checks: results.map((r) => ({ name: r.name, passed: r.passed })) },
        WORKER_MESSAGES.PRE_FLIGHT_FAILED
      );
    }

    return results;
  } finally {
    // ALWAYS mark completed to release lock
    workerReadiness.markCompleted();
  }
}
