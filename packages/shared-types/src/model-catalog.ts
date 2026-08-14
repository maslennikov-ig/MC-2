/**
 * Single catalogue of every model the platform can route to or has ever billed.
 *
 * Before 2026-08-12 this lived in four places that disagreed: two live pricing
 * tables (`shared/llm/cost-calculator.ts`, `shared/metrics/cost-tracker.ts`), a
 * local copy inside Stage 4 observability, and a dead `shared/llm/model-pricing.ts`
 * still quoting GPT-4 Turbo. Four of the seven models actually in production were
 * absent from every one of them, so their cost silently resolved to a $1/$3
 * default and reported a plausible wrong number.
 *
 * Prices are the current OpenRouter /models base per-token list prices at the
 * verification date below, not historical snapshots. Provider threshold
 * overrides are not representable by this flat catalogue and require a
 * model-specific routing guard (see Qwen 3 Max in cost-calculator.ts). A call is
 * priced once and the USD amount is persisted in generation_trace, so changing
 * this catalogue does not reprice old reports. Retired-but-still-listed models
 * stay current so re-enabling one cannot silently revive an obsolete tariff. A
 * `delisted` model has no current price; its last observed rate is retained only
 * as an explicitly marked fallback.
 *
 * Pricing verified against https://openrouter.ai/api/v1/models on 2026-08-14.
 * Keep it that way: a hand-typed price is indistinguishable from a correct one
 * until an invoice disagrees.
 *
 * Refs mc2-a2j1x, mc2-0a47t
 */

export interface ModelCapabilities {
  /** USD per 1M input tokens */
  inputPricePerMillion: number;
  /** USD per 1M output tokens */
  outputPricePerMillion: number;
  /** Total context window, or null when the provider does not publish one */
  contextLength: number | null;
  /** Provider ceiling on a single completion, or null when unpublished */
  maxOutputTokens: number | null;
  /**
   * Whether the provider honours `temperature`. OpenAI's GPT-5.6 series does
   * not — it exposes reasoning controls instead — and sending it anyway makes
   * the configured value a lie rather than an error.
   */
  supportsTemperature: boolean;
  /** Whether the provider accepts the OpenRouter `reasoning` parameter */
  supportsReasoning: boolean;
  /** Unified rate for models that charge the same for input and output */
  combinedPricePerMillion?: number;
  /**
   * Billed per generated image upstream. Token-based cost maths is structurally
   * wrong for these and only approximates the real charge.
   */
  billedPerImage?: boolean;
  /** No longer offered by OpenRouter; retained so old cost reports still resolve */
  delisted?: true;
}

export const MODEL_CATALOG: Record<string, ModelCapabilities> = {
  // --- On the live routing path ---
  'google/gemini-2.5-flash-image': {
    inputPricePerMillion: 0.3,
    outputPricePerMillion: 2.5,
    contextLength: 32768,
    maxOutputTokens: 8192,
    supportsTemperature: true,
    supportsReasoning: false,
    billedPerImage: true,
  },
  'google/gemini-3.7-flash': {
    inputPricePerMillion: 0.375,
    outputPricePerMillion: 1.875,
    contextLength: 1048576,
    maxOutputTokens: 65536,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  /** Async Batch API tariff; never substitute this ID into the synchronous endpoint. */
  'google/gemini-3.7-flash:batch': {
    inputPricePerMillion: 0.1875,
    outputPricePerMillion: 0.9375,
    contextLength: 1048576,
    maxOutputTokens: 65536,
    supportsTemperature: false,
    supportsReasoning: true,
  },
  'minimax/minimax-m3': {
    inputPricePerMillion: 0.3,
    outputPricePerMillion: 1.2,
    contextLength: 1048576,
    maxOutputTokens: 512000,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  /** Async Batch API tariff; currently half the base token rates. */
  'minimax/minimax-m3:batch': {
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.6,
    contextLength: 524288,
    maxOutputTokens: null,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  'openai/gpt-5-image-mini': {
    inputPricePerMillion: 2.5,
    outputPricePerMillion: 2,
    contextLength: 400000,
    maxOutputTokens: 128000,
    supportsTemperature: true,
    supportsReasoning: true,
    billedPerImage: true,
  },
  'openai/gpt-5.6-luna': {
    inputPricePerMillion: 0.1,
    outputPricePerMillion: 0.6,
    contextLength: 1050000,
    maxOutputTokens: 128000,
    supportsTemperature: false,
    supportsReasoning: true,
  },
  /** Available through Batch API, but currently has no token-price discount. */
  'openai/gpt-5.6-luna:batch': {
    inputPricePerMillion: 0.1,
    outputPricePerMillion: 0.6,
    contextLength: 1050000,
    maxOutputTokens: 128000,
    supportsTemperature: false,
    supportsReasoning: true,
  },
  /**
   * The `/models` base rate, re-read 2026-08-14. An earlier entry recorded
   * $0.63/$1.98, which is one provider's rate (DigitalOcean), not the base one.
   * This model is served by many providers and they disagree widely — on that
   * date the endpoint list ran from $0.49/$1.54 to $1.40/$4.40 — so the base
   * rate is the catalogue default, not a guarantee of what a call is charged.
   */
  'z-ai/glm-5.2': {
    inputPricePerMillion: 1.19,
    outputPricePerMillion: 3.74,
    contextLength: 1048576,
    maxOutputTokens: 262144,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  /**
   * Async Batch API tariff: exactly half the first-party Z.AI rate ($1.40/$4.40),
   * which is above the base rate above. Cheaper than the base on both legs, but
   * with half the context window, so a long request stays synchronous.
   */
  'z-ai/glm-5.2:batch': {
    inputPricePerMillion: 0.7,
    outputPricePerMillion: 2.2,
    contextLength: 512000,
    maxOutputTokens: null,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  '~deepseek/deepseek-v4-flash-latest': {
    inputPricePerMillion: 0.08,
    outputPricePerMillion: 0.252,
    contextLength: 1048576,
    maxOutputTokens: null,
    supportsTemperature: true,
    supportsReasoning: true,
  },

  // --- Retired from routing; kept so historical cost reports still resolve ---
  'anthropic/claude-3.5-sonnet': {
    inputPricePerMillion: 3,
    outputPricePerMillion: 15,
    contextLength: null,
    maxOutputTokens: null,
    supportsTemperature: true,
    supportsReasoning: false,
    delisted: true,
  },
  'anthropic/claude-sonnet-4-20250514': {
    inputPricePerMillion: 3,
    outputPricePerMillion: 15,
    contextLength: null,
    maxOutputTokens: null,
    supportsTemperature: true,
    supportsReasoning: false,
    delisted: true,
  },
  'deepseek/deepseek-v3.1-terminus': {
    inputPricePerMillion: 0.27,
    outputPricePerMillion: 0.95,
    contextLength: 163840,
    maxOutputTokens: 32768,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  'deepseek/deepseek-v4-flash': {
    inputPricePerMillion: 0.14,
    outputPricePerMillion: 0.28,
    contextLength: 1048576,
    maxOutputTokens: 393216,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  'deepseek/deepseek-v4-pro': {
    inputPricePerMillion: 1.168,
    outputPricePerMillion: 2.336,
    contextLength: 1048576,
    maxOutputTokens: 393216,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  'google/gemini-2.0-flash-001': {
    inputPricePerMillion: 0.1,
    outputPricePerMillion: 0.4,
    contextLength: null,
    maxOutputTokens: null,
    supportsTemperature: true,
    supportsReasoning: false,
    delisted: true,
  },
  'google/gemini-2.5-flash': {
    inputPricePerMillion: 0.3,
    outputPricePerMillion: 2.5,
    contextLength: 1048576,
    maxOutputTokens: 65535,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  'google/gemini-2.5-flash-preview': {
    inputPricePerMillion: 0.1,
    outputPricePerMillion: 0.4,
    contextLength: null,
    maxOutputTokens: null,
    supportsTemperature: true,
    supportsReasoning: false,
    delisted: true,
  },
  /**
   * Superseded by `google/gemini-3.7-flash` on 2026-08-14: same context window
   * and output ceiling, less money. Kept so cost reports written while this was
   * routed still resolve to a price.
   */
  'google/gemini-3-flash-preview': {
    inputPricePerMillion: 0.5,
    outputPricePerMillion: 3,
    contextLength: 1048576,
    maxOutputTokens: 65536,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  'minimax/minimax-m2': {
    inputPricePerMillion: 0.255,
    outputPricePerMillion: 1.02,
    contextLength: 204800,
    maxOutputTokens: 131072,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  'minimax/minimax-m2.1': {
    inputPricePerMillion: 0.3,
    outputPricePerMillion: 1.2,
    contextLength: 204800,
    maxOutputTokens: 131072,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  'moonshotai/kimi-k2-thinking': {
    inputPricePerMillion: 0.6,
    outputPricePerMillion: 2.5,
    contextLength: 262144,
    maxOutputTokens: 100352,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  'openai/gpt-4-turbo': {
    inputPricePerMillion: 10,
    outputPricePerMillion: 30,
    contextLength: 128000,
    maxOutputTokens: 4096,
    supportsTemperature: true,
    supportsReasoning: false,
  },
  'openai/gpt-oss-20b': {
    inputPricePerMillion: 0.03,
    outputPricePerMillion: 0.13,
    contextLength: 131072,
    maxOutputTokens: 131072,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  'openrouter/kimi-k2-instruct': {
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.6,
    contextLength: null,
    maxOutputTokens: null,
    supportsTemperature: true,
    supportsReasoning: false,
    delisted: true,
  },
  'qwen/qwen3-235b-a22b-2507': {
    inputPricePerMillion: 0.09,
    outputPricePerMillion: 0.55,
    contextLength: 262144,
    maxOutputTokens: 16384,
    supportsTemperature: true,
    supportsReasoning: false,
  },
  'qwen/qwen3-max': {
    inputPricePerMillion: 0.78,
    outputPricePerMillion: 3.9,
    contextLength: 262144,
    maxOutputTokens: 65536,
    supportsTemperature: true,
    supportsReasoning: false,
  },
  'qwen/qwen3.7-plus': {
    inputPricePerMillion: 0.32,
    outputPricePerMillion: 1.28,
    contextLength: 1000000,
    maxOutputTokens: 131072,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  'z-ai/glm-4.6': {
    inputPricePerMillion: 0.5,
    outputPricePerMillion: 2,
    contextLength: 204800,
    maxOutputTokens: 131072,
    supportsTemperature: true,
    supportsReasoning: true,
  },
  'z-ai/glm-5': {
    inputPricePerMillion: 0.95,
    outputPricePerMillion: 2.55,
    contextLength: 204800,
    maxOutputTokens: 131072,
    supportsTemperature: true,
    supportsReasoning: true,
  },
};

/** Price fallback for a model absent from the catalogue. Deliberately pessimistic. */
export const UNKNOWN_MODEL_PRICING: ModelCapabilities = {
  inputPricePerMillion: 1.0,
  outputPricePerMillion: 3.0,
  contextLength: null,
  maxOutputTokens: null,
  supportsTemperature: true,
  supportsReasoning: false,
};

export function getModelCapabilities(modelId: string): ModelCapabilities | null {
  return MODEL_CATALOG[modelId] ?? null;
}

export function isModelInCatalog(modelId: string): boolean {
  return modelId in MODEL_CATALOG;
}

/**
 * Models routed today. A model missing from here is not necessarily wrong — it
 * may simply be legacy — but a routing row naming one is.
 */
export const LIVE_ROUTING_MODEL_IDS = [
  '~deepseek/deepseek-v4-flash-latest',
  'openai/gpt-5.6-luna',
  'z-ai/glm-5.2',
  'minimax/minimax-m3',
  'google/gemini-3.7-flash',
  'openai/gpt-5-image-mini',
  'google/gemini-2.5-flash-image',
] as const;

/** True when the provider honours `temperature`; unknown models are assumed to. */
export function modelSupportsTemperature(modelId: string): boolean {
  return getModelCapabilities(modelId)?.supportsTemperature ?? true;
}

/** True when the provider accepts the OpenRouter `reasoning` parameter. */
export function modelSupportsReasoning(modelId: string): boolean {
  return getModelCapabilities(modelId)?.supportsReasoning ?? false;
}
