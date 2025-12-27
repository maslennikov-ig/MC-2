/**
 * Timeout Constants
 *
 * Centralized timeout and retry configuration values.
 * Single source of truth for all timing-related constants.
 *
 * @module shared/constants/timeouts
 */

export const TIMEOUTS = {
  // Pre-flight check timeouts (ms)
  /** Total time for all pre-flight checks */
  PRE_FLIGHT_TOTAL: 90000,
  /** Bunker initialization */
  BUNKER_INIT: 30000,
  /** Waiting for uploads directory */
  UPLOADS_DIRECTORY: 60000,

  // API request timeouts (ms)
  /** Readiness check timeout */
  READINESS_CHECK: 5000,
  /** Health check timeout */
  HEALTH_CHECK: 5000,
  /** Default API request timeout */
  DEFAULT_API: 10000,

  // Retry intervals (ms)
  /** Initial delay for file access retries */
  FILE_ACCESS_INITIAL: 2000,
  /** Maximum delay for file access retries */
  FILE_ACCESS_MAX: 15000,
  /** Interval between pre-flight retry attempts */
  PRE_FLIGHT_RETRY: 2000,
} as const;

export const RETRY_CONFIG = {
  /** Maximum retry attempts for file access */
  FILE_ACCESS_MAX_RETRIES: 5,
  /** Backoff multiplier for file access retries */
  FILE_ACCESS_BACKOFF_MULTIPLIER: 1.5,
  /** Maximum retries for each pre-flight check */
  PRE_FLIGHT_MAX_RETRIES: 30,
} as const;

/**
 * Union type of all timeout constant keys
 * @example 'PRE_FLIGHT_TOTAL' | 'BUNKER_INIT' | ...
 */
export type TimeoutKey = keyof typeof TIMEOUTS;

/**
 * Union type of all retry configuration keys
 * @example 'FILE_ACCESS_MAX_RETRIES' | 'FILE_ACCESS_BACKOFF_MULTIPLIER' | ...
 */
export type RetryConfigKey = keyof typeof RETRY_CONFIG;
