/**
 * Handler configuration constants
 */
export const HANDLER_CONFIG = {
  /** Queue name for Stage 6 jobs (supports dev/prod isolation via env) */
  QUEUE_NAME: process.env.BULLMQ_STAGE6_QUEUE_NAME || 'stage6-lesson-content',

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

  /**
   * Legacy global regeneration cap.
   * Kept only as a compatibility fallback until the quality ladder helper is wired in.
   */
  MAX_REGENERATION_RETRIES: 2,

  /**
   * Maximum truncation continuation attempts before fail-open review_required.
   * Truncation-only retries use cheap continuation instead of full regenerate.
   */
  MAX_TRUNCATION_CONTINUATION_ATTEMPTS: 2,

  /** Maximum number of sections allowed for section-level regeneration. */
  MAX_SECTIONS_TO_REGENERATE: 3,
} as const;

/**
 * Default job timeout in milliseconds (5 minutes per lesson)
 * Used as fallback when database config is unavailable
 */
export const DEFAULT_JOB_TIMEOUT_MS = 1_800_000; // 30 min — budget models via OpenRouter need generous timeouts

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
  /** Provider fallback model for every language. Phase defaults own primary model selection. */
  fallback: 'qwen/qwen3.7-plus',
  /** Max attempts before switching to fallback model */
  maxPrimaryAttempts: 2,
} as const;

export * from './quality-ladder';
