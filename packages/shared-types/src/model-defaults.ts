/**
 * Default Model Configuration
 *
 * These are LAST RESORT fallbacks when:
 * 1. Database is unavailable
 * 2. No config found for the phase
 * 3. global_default config is missing
 *
 * Primary source of truth is the database (llm_model_config table).
 * Admin can configure global_default via admin panel.
 *
 * Hierarchy:
 * 1. DB config for specific phase → primary
 * 2. DB global_default config → admin-configurable fallback
 * 3. These constants → hardcoded last resort
 */

/**
 * Default primary model (used when DB is unavailable)
 * DeepSeek V4 Flash - default fast runtime model for course generation.
 * The leading `~` is part of the OpenRouter id: it is an alias that always
 * resolves to the newest model in the V4 Flash family.
 * @see llm_model_config.model_id
 */
export const DEFAULT_MODEL_ID = '~deepseek/deepseek-v4-flash-latest';

/**
 * Default fallback model (used when primary fails and DB is unavailable).
 * Deliberately a different vendor from DEFAULT_MODEL_ID so one provider
 * outage cannot take out both the primary and its fallback.
 * @see llm_model_config.fallback_model_id
 */
export const DEFAULT_FALLBACK_MODEL_ID = 'openai/gpt-5.6-luna';

// ============================================================================
// CHAT MODEL IDS (Single Source of Truth)
// ============================================================================

/** Primary chat model — used for chat_node_refinement, chat_global_guidance, etc. */
export const CHAT_PRIMARY_MODEL_ID = 'openai/gpt-5.6-luna';

/** Fallback chat model — different vendor from the primary, see DEFAULT_FALLBACK_MODEL_ID */
export const CHAT_FALLBACK_MODEL_ID = DEFAULT_MODEL_ID;

/** Stage 6 chat primary model — used for chat_stage_6_refinement */
export const CHAT_STAGE6_PRIMARY_MODEL_ID = DEFAULT_MODEL_ID;

/** Stage 6 chat fallback model — same as DEFAULT_FALLBACK_MODEL_ID */
export const CHAT_STAGE6_FALLBACK_MODEL_ID = DEFAULT_FALLBACK_MODEL_ID;

// ============================================================================
// LEGACY
// ============================================================================

/**
 * Legacy model aliases mapped to current replacement IDs.
 * @deprecated These should not be used in new code
 */
export const LEGACY_MODEL_IDS = {
  OSS_20B: 'openai/gpt-oss-20b',
  OSS_120B: DEFAULT_MODEL_ID,
} as const;

/**
 * Phase name for global default configuration in database
 */
export const GLOBAL_DEFAULT_PHASE = 'global_default';

/**
 * Model configuration defaults
 */
export const MODEL_DEFAULTS = {
  temperature: 0.3,
  maxTokens: 16384,
  maxRetries: 3,
  timeoutMs: 120000,
} as const;
