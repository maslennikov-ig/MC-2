/**
 * Handler configuration constants
 */
export const HANDLER_CONFIG = {
  /** Queue name for Stage 6 jobs */
  QUEUE_NAME: 'stage6-lesson-content',

  /** Number of concurrent workers (30 for I/O-bound LLM operations) */
  CONCURRENCY: 30,

  /** Maximum retry attempts per job */
  MAX_RETRIES: 3,

  /** Retry delay in milliseconds */
  RETRY_DELAY_MS: 5000,

  /** Lock duration in milliseconds (10 minutes for long-running LLM operations) */
  LOCK_DURATION_MS: 600_000,

  /** Lock renewal time in milliseconds (renew every 2.5 minutes) */
  LOCK_RENEW_TIME_MS: 150_000,

  /** Stalled job check interval in milliseconds */
  STALLED_INTERVAL_MS: 60_000,

  /** Maximum stalled count before job is marked failed */
  MAX_STALLED_COUNT: 3,

  /** Quality threshold for lesson acceptance */
  QUALITY_THRESHOLD: 0.75,

  /** Maximum regeneration attempts before giving up (prevents infinite loops) */
  MAX_REGENERATION_RETRIES: 2,
} as const;

/**
 * Default job timeout in milliseconds (5 minutes per lesson)
 * Used as fallback when database config is unavailable
 */
export const DEFAULT_JOB_TIMEOUT_MS = 300_000;

/**
 * Model fallback configuration for retry strategy (FALLBACK ONLY)
 *
 * IMPORTANT: This is kept as a safety net only. Primary model selection
 * is now handled by ModelConfigService (database-driven).
 *
 * These hardcoded values are used ONLY when:
 * - Database lookup fails
 * - ModelConfigService is unavailable
 */
export const MODEL_FALLBACK = {
  /** Primary models by language (FALLBACK ONLY) */
  primary: {
    ru: 'qwen/qwen3-235b-a22b-2507',
    en: 'deepseek/deepseek-v3.1-terminus',
  },
  /** Fallback model for all languages */
  fallback: 'moonshotai/kimi-k2-0905',
  /** Max attempts before switching to fallback model */
  maxPrimaryAttempts: 2,
} as const;
