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
 *
 * The `~...-latest` alias, by the owner's decision of 2026-08-22, and the one
 * thing that has to be true for that to be safe is now true.
 *
 * The history is real: on 2026-08-17 07:03 the alias followed its family to the
 * `-0731` snapshot with no change on our side, median latency went from 8.7s to
 * 102s, and the courses of 12-20 August failed on timeouts nobody had
 * configured. It was pinned on 2026-08-21 (mc2-qch4w).
 *
 * What made the alias newly dangerous, and what was fixed to allow it back:
 * `/models/{alias}/endpoints` answers 200 with an **empty list**, which this
 * codebase reads as "could not find out" — so routing on an alias silently
 * disabled the per-attempt endpoint pin, the thing that on 2026-08-22 moved two
 * hung 238s calls onto a working provider. `listModelEndpoints` now follows
 * OpenRouter's own `alias_target.slug` to the snapshot, so the family is
 * followed and the pin, the price ceiling and the receipt all still work.
 *
 * What is still true of an alias: it can move without telling us. The log line
 * "[Routing] Alias resolved to the snapshot it serves today" is where a move
 * shows up, and a new member already exists in the family —
 * `deepseek-v4-flash-vision-exp`, experimental, at 5.5x the input price.
 *
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
