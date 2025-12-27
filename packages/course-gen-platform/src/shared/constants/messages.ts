/**
 * Worker Messages Constants
 *
 * Centralized message strings for worker status and errors.
 * Single source of truth for user-facing and log messages.
 *
 * @module shared/constants/messages
 */

/**
 * Pre-flight check names (used in results)
 */
export const CHECK_NAMES = {
  UPLOADS_DIRECTORY: 'uploads_directory',
  DISK_SPACE: 'disk_space',
  REDIS_CONNECTION: 'redis_connection',
} as const;

/**
 * Worker readiness messages
 */
export const WORKER_MESSAGES = {
  // Success messages
  WORKER_READY: 'Worker ready',
  WORKER_NOT_READY: 'Worker not ready',
  ALL_CHECKS_PASSED: 'All pre-flight checks passed - worker is ready',

  // Pre-flight check messages
  PRE_FLIGHT_STARTING: 'Starting pre-flight checks...',
  PRE_FLIGHT_ALREADY_RUNNING: 'Pre-flight checks already in progress, returning cached status',
  PRE_FLIGHT_FAILED: 'Pre-flight checks failed - worker NOT ready',

  // Uploads directory
  UPLOADS_CHECKING: 'Pre-flight: Checking uploads directory...',
  UPLOADS_ACCESSIBLE: 'Pre-flight: Uploads directory accessible',
  UPLOADS_NOT_READY: 'Pre-flight: Uploads directory not ready, retrying...',
  UPLOADS_FAILED: 'Pre-flight: Uploads directory check FAILED',

  // Redis
  REDIS_CHECKING: 'Pre-flight: Checking Redis connection...',
  REDIS_HEALTHY: 'Pre-flight: Redis connection healthy',
  REDIS_FAILED: 'Pre-flight: Redis connection FAILED',

  // Disk space
  DISK_CHECKING: 'Pre-flight: Checking disk space...',
  DISK_ADEQUATE: 'Pre-flight: Disk space adequate',
  DISK_LOW: 'Pre-flight: Disk space LOW',
  DISK_FAILED: 'Pre-flight: Disk space check FAILED',
} as const;

/**
 * Error messages for API responses
 */
export const ERROR_MESSAGES = {
  QUEUE_UNHEALTHY: 'Queue system unhealthy',
  READINESS_CHECK_FAILED: 'Worker readiness check failed',
  TOO_MANY_REQUESTS: 'Too many requests',
  INTERNAL_ERROR: 'Internal server error',
} as const;

/**
 * Union type of all check name values
 * @example 'uploads_directory' | 'disk_space' | 'redis_connection'
 */
export type CheckName = (typeof CHECK_NAMES)[keyof typeof CHECK_NAMES];

/**
 * Union type of all worker message values
 */
export type WorkerMessage = (typeof WORKER_MESSAGES)[keyof typeof WORKER_MESSAGES];

/**
 * Union type of all error message values
 */
export type ErrorMessage = (typeof ERROR_MESSAGES)[keyof typeof ERROR_MESSAGES];
