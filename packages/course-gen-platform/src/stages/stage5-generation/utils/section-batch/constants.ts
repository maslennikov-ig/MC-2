/**
 * OpenRouter API base URL
 */
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Model configurations for tiered routing (Updated 2025-11-19)
 * Based on quality testing results (DEEPSEEK-V31-TERMINUS-QUALITY-REPORT.md)
 *
 * Using regular model (not -thinking variant) for performance (INV-2025-11-19-003)
 * Regular: 15-29s, Thinking: 30-110s (test), 521s (production context)
 * Both achieve 100% success rate, no quality difference for structured generation
 */
export const MODELS = {
  tier1_oss120b: 'openai/gpt-oss-120b',          // Baseline model (unchanged)

  // RU Lessons: Qwen3 235B A22B-2507 (9.2/10 - Gold!)
  // NOTE: Using regular model (not -thinking) for 17-35x performance improvement
  ru_lessons_primary: 'qwen/qwen3-235b-a22b-2507',

  // EN Lessons: DeepSeek v3.1 Terminus (8.8/10 - Silver, 100% stability)
  en_lessons_primary: 'deepseek/deepseek-v3.1-terminus',

  // Fallback for all languages: Kimi K2-0905 (8.7 RU / 8.8 EN)
  lessons_fallback: 'moonshotai/kimi-k2-0905',

  tier3_gemini: 'google/gemini-2.5-flash',       // Overflow (unchanged)
} as const;

/**
 * Token budget constants (RT-003)
 * Note: RAG_MAX_TOKENS is now fetched dynamically from database via getRagTokenBudget()
 */
export const TOKEN_BUDGET = {
  INPUT_BUDGET_MAX: 90000,      // 90K input tokens per batch
  RAG_MAX_TOKENS: 40000,        // Fallback 40K max for RAG context (if DB fetch fails)
  GEMINI_TRIGGER_INPUT: 108000, // 108K tokens triggers Gemini
  BASE_PROMPT: 5000,            // ~5K for base prompt
  STYLE_PROMPT: 1000,           // ~1K for style integration
  SECTION_CONTEXT: 3000,        // ~3K per section context
} as const;

/**
 * Quality thresholds for tiered routing (RT-001)
 */
export const QUALITY_THRESHOLDS = {
  tier1_similarity: 0.75,  // OSS 120B must achieve ≥0.75 similarity
  tier2_similarity: 0.80,  // qwen3-max target ≥0.80 similarity
  complexity: 0.75,        // Pre-route to qwen3-max if complexity ≥0.75
  criticality: 0.80,       // Pre-route to qwen3-max if criticality ≥0.80
} as const;

/**
 * Per-batch architecture (FR-016)
 */
export const SECTIONS_PER_BATCH = 1; // Fixed: 1 section per batch
