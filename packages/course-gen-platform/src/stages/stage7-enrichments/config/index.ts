/**
 * Stage 7 Enrichments Configuration
 * @module stages/stage7-enrichments/config
 *
 * Configuration constants for the Stage 7 BullMQ worker infrastructure.
 * Handles lesson enrichment generation (quiz, audio, presentation, video, document).
 */

/**
 * Stage 7 worker and queue configuration
 */
export const STAGE7_CONFIG = {
  /** Queue name for Stage 7 enrichment jobs */
  QUEUE_NAME: 'stage7-enrichments',

  /** Number of concurrent workers (lower than Stage 6 due to heavier I/O operations) */
  CONCURRENCY: 5,

  /** Lock duration in milliseconds (5 minutes for enrichment generation) */
  LOCK_DURATION_MS: 300_000,

  /** Lock renewal time in milliseconds (renew every 1 minute) */
  LOCK_RENEW_TIME_MS: 60_000,

  /** Stalled job check interval in milliseconds */
  STALLED_INTERVAL_MS: 30_000,

  /** Maximum stalled count before job is marked failed */
  MAX_STALLED_COUNT: 3,

  /** Maximum retry attempts per job */
  MAX_RETRIES: 3,

  /** Base retry delay in milliseconds (exponential backoff) */
  RETRY_DELAY_MS: 5_000,
} as const;

/**
 * Default job timeout in milliseconds (10 minutes for enrichment generation)
 * Enrichments like video/audio may take longer than lesson content
 */
export const DEFAULT_JOB_TIMEOUT_MS = 600_000;

/**
 * Model configuration for LLM-based enrichments (quiz, presentation)
 */
export const MODEL_CONFIG = {
  /** Primary model for quiz generation */
  quiz: {
    primary: 'anthropic/claude-sonnet-4-20250514',
    fallback: 'openai/gpt-4o-mini',
  },
  /** Primary model for presentation generation */
  presentation: {
    primary: 'anthropic/claude-sonnet-4-20250514',
    fallback: 'openai/gpt-4o-mini',
  },
  /** Max attempts before switching to fallback model */
  maxPrimaryAttempts: 2,
} as const;

/**
 * Storage configuration for enrichment assets
 */
export const STORAGE_CONFIG = {
  /** Supabase Storage bucket for enrichment files */
  BUCKET_NAME: 'course-enrichments',

  /** Signed URL expiration time in seconds (1 hour) */
  SIGNED_URL_EXPIRES_IN: 3600,

  /** Maximum file size in bytes (100MB for video) */
  MAX_FILE_SIZE_BYTES: 100 * 1024 * 1024,
} as const;

/**
 * Audio generation configuration
 */
export const AUDIO_CONFIG = {
  /** OpenAI TTS API endpoint */
  TTS_MODEL: 'tts-1-hd',

  /** Default voice for audio narration */
  DEFAULT_VOICE: 'nova',

  /** Default audio format */
  DEFAULT_FORMAT: 'mp3',

  /** Maximum script length in characters */
  MAX_SCRIPT_LENGTH: 50_000,
} as const;
