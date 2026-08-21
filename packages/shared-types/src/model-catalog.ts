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
  /**
   * Whether the provider refuses to switch deliberation off. Accepting
   * `reasoning` and allowing `reasoning: {enabled: false}` are different
   * questions, and OpenRouter's `supported_parameters` only answers the first:
   * it lists `reasoning` for every model below, and five of them answer
   * `400 Reasoning is mandatory for this endpoint and cannot be disabled`.
   *
   * Measured against the live API on 2026-08-15 for the whole catalogue.
   */
  requiresReasoning?: true;
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
    requiresReasoning: true,
  },
  /** Async Batch API tariff; never substitute this ID into the synchronous endpoint. */
  'google/gemini-3.7-flash:batch': {
    inputPricePerMillion: 0.1875,
    outputPricePerMillion: 0.9375,
    contextLength: 1048576,
    maxOutputTokens: 65536,
    supportsTemperature: false,
    supportsReasoning: true,
    requiresReasoning: true,
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
  /**
   * Re-read from `/api/v1/models` on 2026-08-21: $0.20/$1.20. The entry had
   * carried $0.10/$0.60 — exactly the Batch tariff below, so the synchronous
   * rate had been recorded at half its real value. Every luna call in the
   * 2026-08-20 run was therefore under-counted by half, and because luna is the
   * primary for the Career Playbook's spec and proofreading phases, that
   * mispricing was the single largest catalogue contribution to the $0.066839
   * gap against the invoice (mc2-v1pn2).
   */
  'openai/gpt-5.6-luna': {
    inputPricePerMillion: 0.2,
    outputPricePerMillion: 1.2,
    contextLength: 1050000,
    maxOutputTokens: 128000,
    supportsTemperature: false,
    supportsReasoning: true,
  },
  /** Async Batch API tariff: half the synchronous rate above, confirmed 2026-08-21. */
  'openai/gpt-5.6-luna:batch': {
    inputPricePerMillion: 0.1,
    outputPricePerMillion: 0.6,
    contextLength: 1050000,
    maxOutputTokens: 128000,
    supportsTemperature: false,
    supportsReasoning: true,
  },
  /**
   * The `/models` base rate, re-read 2026-08-21: $0.966/$3.036. The entry had
   * carried $1.19/$3.74, which is 1.23x too dear — an overstatement, and
   * therefore one that hid the luna understatement above rather than adding to
   * it, which is why the invoice gap looked smaller than its causes (mc2-156kg).
   *
   * This model is served by many providers and they disagree widely — the
   * endpoint list has run from $0.49/$1.54 to $1.40/$4.40 — so the base rate is
   * the catalogue default, not a guarantee of what a call is charged. Since
   * 2026-08-21 the charge itself is read back from `/api/v1/generation`, and
   * this figure is what a price ceiling and a budget estimate are built from.
   */
  'z-ai/glm-5.2': {
    inputPricePerMillion: 0.966,
    outputPricePerMillion: 3.036,
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
  /**
   * Re-read 2026-08-21: $0.065/$0.140. The entry had carried $0.08/$0.252, over
   * by 1.23x on input and 1.80x on output (mc2-156kg).
   *
   * A `~` alias is a redirect, not a model: it follows its family to whatever
   * snapshot is current, and on 2026-08-17 07:03 it followed DeepSeek V4 Flash
   * to `-20260731`, taking median latency from 8.7s to 102s without a single
   * configuration change on our side. Its price can move the same way, which is
   * the reason nothing downstream treats this number as the charge.
   */
  '~deepseek/deepseek-v4-flash-latest': {
    inputPricePerMillion: 0.065,
    outputPricePerMillion: 0.14,
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
    requiresReasoning: true,
  },
  'minimax/minimax-m2.1': {
    inputPricePerMillion: 0.3,
    outputPricePerMillion: 1.2,
    contextLength: 204800,
    maxOutputTokens: 131072,
    supportsTemperature: true,
    supportsReasoning: true,
    requiresReasoning: true,
  },
  'moonshotai/kimi-k2-thinking': {
    inputPricePerMillion: 0.6,
    outputPricePerMillion: 2.5,
    contextLength: 262144,
    maxOutputTokens: 100352,
    supportsTemperature: true,
    supportsReasoning: true,
    requiresReasoning: true,
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
    requiresReasoning: true,
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

/**
 * The catalogue key a served model id belongs to.
 *
 * A price follows the model the provider actually served, and that is not always
 * what was asked for: OpenRouter answers `deepseek/deepseek-v4-flash` with
 * `deepseek/deepseek-v4-flash-0731`, and a router alias arrives as
 * `~vendor/model-latest`. Neither is a catalogue key, so the call was traced
 * with no price at all (mc2-b7olk.6).
 *
 * Only shapes that are certainly the same model are stripped: a leading `~`
 * router marker, a trailing `-latest`, a trailing `:batch` suffix, and a
 * trailing date. Anything else is left alone — a differently named model is a
 * different model, not a spelling of this one.
 */
export function normalizeModelId(modelId: string): string {
  return modelId
    .replace(/^~/u, '')
    .replace(/:batch$/u, '')
    .replace(/-latest$/u, '')
    .replace(/-\d{4,8}$/u, '');
}

/**
 * What is known about a model, by exact id or by the id it is a variant of.
 *
 * A variant's tariff can differ from its base — the 0731 snapshot costs 1.7× the
 * alias — so the base entry is a floor, not the truth. It is still better than
 * no price: an unpriced row disappears from the course total silently.
 */
export function getModelCapabilities(modelId: string): ModelCapabilities | null {
  // Callers reach here from accounting paths where the served model can be
  // missing entirely - the Batch API omits it on some result bodies - and a
  // lookup that throws would fail the generation it was only counting.
  if (!modelId) return null;
  const exact = MODEL_CATALOG[modelId];
  if (exact) return exact;
  return MODEL_CATALOG[normalizeModelId(modelId)] ?? null;
}

/** Whether the price for this id is its own, rather than its base model's. */
export function hasExactModelPricing(modelId: string): boolean {
  return modelId in MODEL_CATALOG;
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

/**
 * True when the provider rejects `reasoning: {enabled: false}` outright.
 *
 * Callers that do not want deliberation must ask such a model for the least of
 * it rather than for none, or every call is a 400.
 */
export function modelRequiresReasoning(modelId: string): boolean {
  return getModelCapabilities(modelId)?.requiresReasoning ?? false;
}

/**
 * Extra answer budget given to a model that cannot stop deliberating.
 *
 * OpenRouter bills reasoning tokens against `max_tokens`, so a mandatory
 * thinker spends the answer's budget on thinking and the reply is truncated.
 * The ceiling costs nothing unless it is used; `effort: 'low'` is what bounds
 * the real spend. Measured on 2026-08-15 with a short prompt at that effort:
 * gemini-3.7-flash 0, gpt-oss-20b 14, minimax-m2.1 296, minimax-m2 1241,
 * kimi-k2-thinking 2428 reasoning tokens.
 */
export const MANDATORY_REASONING_RESERVE_TOKENS = 4096;
