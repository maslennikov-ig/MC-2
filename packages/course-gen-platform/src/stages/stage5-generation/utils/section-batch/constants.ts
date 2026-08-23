import {
  DEFAULT_FALLBACK_MODEL_ID,
  DEFAULT_MODEL_ID,
  LARGE_CONTEXT_MODEL_ID,
} from '@megacampus/shared-types';

/**
 * LAST-RESORT FALLBACK MODELS (3-tier routing)
 *
 * Primary model selection uses getModelForPhase() from database via:
 * - stage_5_simple: Cheap model for trivial (importance=simple) sections
 * - stage_5_normal: Main workhorse for standard (importance=normal) sections
 * - stage_5_complex: Premium model for complex sections + first section of every course
 *
 * These constants are ONLY used when database is completely unavailable.
 * To change models, update llm_model_config table via admin panel.
 *
 * Named roles, not literal ids (mc2-p6u8k). The 2026-08-12 cut left seven live
 * routing models and this block did not notice: it still named
 * `kimi-k2-thinking` and `qwen3.7-plus`, so the path that runs precisely when
 * the database is unreachable led to models the team had deliberately stopped
 * choosing. None was delisted, so nothing broke — which is why it survived four
 * months. Roles cannot drift that way: they follow whatever `model-defaults.ts`
 * declares, and `model-ids-live-in-one-place.test.ts` holds that.
 *
 * The ids below are the ones `llm_model_config` really carries for these three
 * phases, read from the live table on 2026-08-23. No quality claim is being
 * re-made here: DEEPSEEK-V31-TERMINUS-QUALITY-REPORT.md judged models, and a
 * role is about which seat, not which model fills it.
 */
export const MODELS = {
  /** Simple tier: fast cheap model for trivial sections */
  simple: DEFAULT_MODEL_ID,
  /** Normal tier: the careful model, as `stage_5_normal` carries in the database */
  normal: DEFAULT_FALLBACK_MODEL_ID,
  /** Complex tier: the careful model, for the hardest sections and the first one */
  complex: DEFAULT_FALLBACK_MODEL_ID,
  /** Context overflow: large context model */
  tier3_gemini: LARGE_CONTEXT_MODEL_ID,
} as const;

/**
 * Token budget constants (RT-003)
 * Note: RAG_MAX_TOKENS is now fetched dynamically from database via getRagTokenBudget()
 */
export const TOKEN_BUDGET = {
  INPUT_BUDGET_MAX: 90000, // 90K input tokens per batch
  RAG_MAX_TOKENS: 40000, // Fallback 40K max for RAG context (if DB fetch fails)
  GEMINI_TRIGGER_INPUT: 108000, // 108K tokens triggers Gemini
  BASE_PROMPT: 5000, // ~5K for base prompt
  STYLE_PROMPT: 1000, // ~1K for style integration
  SECTION_CONTEXT: 3000, // ~3K per section context
} as const;

/**
 * @deprecated Quality thresholds no longer drive tier routing (now based on importance field).
 * Kept for potential analytics use.
 */
export const QUALITY_THRESHOLDS = {
  tier1_similarity: 0.75,
  tier2_similarity: 0.8,
  complexity: 0.75,
  criticality: 0.8,
} as const;

/**
 * Per-batch architecture (FR-016)
 */
export const SECTIONS_PER_BATCH = 1; // Fixed: 1 section per batch
