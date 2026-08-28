/**
 * The two token thresholds Stage 4 routes on.
 *
 * All that survives of `shared/llm/model-selector.ts`, which was a registry of
 * eleven models, four selection functions, a `MODEL_TIERS` table and a
 * `FALLBACK_MAP`. Outside the barrel that re-exported it, production imported
 * exactly these two numbers; every model in it was reachable only through
 * `getModelByKey` and `getModelsWithCapability`, which nothing called.
 *
 * It was not harmless. `collectRoutableModelSources` read that registry, so the
 * price gate and the routing guards treated `anthropic/claude-sonnet-4-20250514`,
 * `openai/gpt-oss-20b`, `moonshotai/kimi-linear-48b-a3b-instruct` and
 * `qwen/qwen-plus-2025-07-28` as live routes, and one of them was the entry
 * `model-catalog-coverage.test.ts` had to grandfather as unpriced. A dead
 * registry that a gate believes is worse than no registry (mc2-u8kwx).
 *
 * @module shared/llm/context-thresholds
 */

/**
 * Hard token limit even for 1M context models.
 * We never process more than 700K tokens.
 */
export const STAGE4_HARD_TOKEN_LIMIT = 700_000;

/**
 * Threshold for switching Stage 4 from the standard to the extended tier.
 */
export const STAGE4_CONTEXT_THRESHOLD = 260_000;
