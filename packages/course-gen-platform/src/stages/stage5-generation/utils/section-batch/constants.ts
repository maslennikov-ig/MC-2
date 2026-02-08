/**
 * OpenRouter API base URL
 */
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

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
 */
export const MODELS = {
  /** Simple tier: cheap model for trivial sections */
  simple: 'openai/gpt-oss-120b',
  /** Normal tier: main workhorse (309B MoE) for most sections */
  normal: 'xiaomi/mimo-v2-flash',
  /** Complex tier: premium model for hardest sections + first section */
  complex: 'moonshotai/kimi-k2-0905',
  /** Context overflow: large context model */
  tier3_gemini: 'google/gemini-2.5-flash',
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
