export interface OpenRouterCatalogModel {
  id: string;
  context_length: number | null;
  pricing: {
    prompt: string;
    completion: string;
  };
  supported_parameters?: string[];
  top_provider?: {
    max_completion_tokens?: number | null;
  };
}

export interface BatchCompatibilityRequirements {
  /** Estimated prompt tokens, excluding the requested completion budget. */
  requiredContextTokens: number;
  requiredOutputTokens: number;
  /** Optional request controls whose semantics must survive batching. */
  requiredParameters: string[];
}

export type BatchIneligibilityReason =
  | 'catalog_unavailable'
  | 'base_model_missing'
  | 'batch_model_missing'
  | 'invalid_pricing'
  | 'not_cheaper'
  | 'no_discount'
  | 'insufficient_context'
  | 'insufficient_output_limit'
  | 'unsupported_parameters';

export type BatchEligibilityDecision =
  | {
      eligible: true;
      baseModelId: string;
      batchModelId: string;
      inputDiscountRatio: number;
      outputDiscountRatio: number;
      supportedParameters: ReadonlySet<string>;
    }
  | {
      eligible: false;
      baseModelId: string;
      batchModelId: string | null;
      reason: BatchIneligibilityReason;
    };

function invalidDecision(
  baseModelId: string,
  batchModelId: string | null,
  reason: BatchIneligibilityReason
): BatchEligibilityDecision {
  return { eligible: false, baseModelId, batchModelId, reason };
}

function parseRate(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Select the exact `:batch` sibling advertised by OpenRouter.
 *
 * A suffix alone is never enough. The live catalogue must prove that the
 * sibling exists, can satisfy the request, and is no more expensive on either
 * token leg while being strictly cheaper on at least one.
 */
export function selectDiscountedBatchVariant(
  baseModelId: string,
  models: readonly OpenRouterCatalogModel[],
  requirements: BatchCompatibilityRequirements
): BatchEligibilityDecision {
  const base = models.find(model => model.id === baseModelId);
  if (!base) return invalidDecision(baseModelId, null, 'base_model_missing');

  const batchModelId = `${baseModelId}:batch`;
  const batch = models.find(model => model.id === batchModelId);
  if (!batch) return invalidDecision(baseModelId, batchModelId, 'batch_model_missing');

  const baseInput = parseRate(base.pricing.prompt);
  const baseOutput = parseRate(base.pricing.completion);
  const batchInput = parseRate(batch.pricing.prompt);
  const batchOutput = parseRate(batch.pricing.completion);
  if (
    baseInput === null ||
    baseOutput === null ||
    batchInput === null ||
    batchOutput === null ||
    baseInput === 0 ||
    baseOutput === 0
  ) {
    return invalidDecision(baseModelId, batchModelId, 'invalid_pricing');
  }

  if (batchInput > baseInput || batchOutput > baseOutput) {
    return invalidDecision(baseModelId, batchModelId, 'not_cheaper');
  }
  if (batchInput === baseInput && batchOutput === baseOutput) {
    return invalidDecision(baseModelId, batchModelId, 'no_discount');
  }

  const totalRequiredTokens =
    Math.max(0, requirements.requiredContextTokens) +
    Math.max(0, requirements.requiredOutputTokens);
  if (batch.context_length === null || batch.context_length < totalRequiredTokens) {
    return invalidDecision(baseModelId, batchModelId, 'insufficient_context');
  }

  const maxCompletionTokens = batch.top_provider?.max_completion_tokens;
  if (
    typeof maxCompletionTokens === 'number' &&
    maxCompletionTokens < requirements.requiredOutputTokens
  ) {
    return invalidDecision(baseModelId, batchModelId, 'insufficient_output_limit');
  }

  const supportedParameters = new Set(batch.supported_parameters ?? []);
  if (requirements.requiredParameters.some(parameter => !supportedParameters.has(parameter))) {
    return invalidDecision(baseModelId, batchModelId, 'unsupported_parameters');
  }

  return {
    eligible: true,
    baseModelId,
    batchModelId,
    inputDiscountRatio: batchInput / baseInput,
    outputDiscountRatio: batchOutput / baseOutput,
    supportedParameters,
  };
}

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const DEFAULT_CATALOG_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CATALOG_TIMEOUT_MS = 5_000;

export interface OpenRouterBatchEligibilityResolverOptions {
  fetch?: typeof fetch;
  cacheTtlMs?: number;
  timeoutMs?: number;
  now?: () => number;
}

function isCatalogModel(value: unknown): value is OpenRouterCatalogModel {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<OpenRouterCatalogModel>;
  return (
    typeof candidate.id === 'string' &&
    (typeof candidate.context_length === 'number' || candidate.context_length === null) &&
    !!candidate.pricing &&
    typeof candidate.pricing.prompt === 'string' &&
    typeof candidate.pricing.completion === 'string'
  );
}

/**
 * Runtime source of truth for automatic Batch API selection.
 *
 * A short cache avoids turning every lesson into a catalogue request. Failures
 * never reuse guessed eligibility: callers receive `catalog_unavailable` and
 * continue through the synchronous path.
 */
export class OpenRouterBatchEligibilityResolver {
  private readonly fetchImpl: typeof fetch;
  private readonly cacheTtlMs: number;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private cached: { models: OpenRouterCatalogModel[]; expiresAt: number } | null = null;

  constructor(options: OpenRouterBatchEligibilityResolverOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CATALOG_TTL_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_CATALOG_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
  }

  async resolve(
    baseModelId: string,
    requirements: BatchCompatibilityRequirements
  ): Promise<BatchEligibilityDecision> {
    try {
      const models = await this.getModels();
      return selectDiscountedBatchVariant(baseModelId, models, requirements);
    } catch {
      return invalidDecision(baseModelId, `${baseModelId}:batch`, 'catalog_unavailable');
    }
  }

  clearCache(): void {
    this.cached = null;
  }

  private async getModels(): Promise<OpenRouterCatalogModel[]> {
    if (this.cached && this.cached.expiresAt > this.now()) return this.cached.models;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(OPENROUTER_MODELS_URL, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`OpenRouter model catalogue returned ${response.status}`);

      const payload = (await response.json()) as { data?: unknown };
      if (!Array.isArray(payload.data)) throw new Error('OpenRouter model catalogue is malformed');
      const models = payload.data.filter(isCatalogModel);
      if (models.length === 0) throw new Error('OpenRouter model catalogue is empty');

      this.cached = { models, expiresAt: this.now() + this.cacheTtlMs };
      return models;
    } finally {
      clearTimeout(timeout);
    }
  }
}
