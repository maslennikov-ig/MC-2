/**
 * Is the Batch API actually cheaper than what we would otherwise pay?
 *
 * The 24h window buys a discount, and the discount is only worth taking against
 * the price of the synchronous call we are choosing not to make. Measured live
 * on 2026-08-25, `openai/gpt-5.6-luna` costs $/1M:
 *
 * | route          | in   | out  |
 * | -------------- | ---- | ---- |
 * | sync default   | 0.20 | 1.20 |
 * | sync flex      | 0.10 | 0.60 |  ← every background phase, since mc2-a9w19
 * | batch default  | 0.10 | 0.60 |  ← what a batch is billed, whatever it asks
 * | batch flex     | 0.05 | 0.30 |  ← a catalogue artefact; see below
 *
 * `/models` reports the default tariff for both ids, so comparing those two
 * numbers says "half price" and means it about a synchronous call we stopped
 * making.
 *
 * The batch leg is priced at the **default** tariff on purpose, even though
 * `/endpoints` advertises `openai/gpt-5.6-luna:batch` at `openai/flex` for
 * $0.05/$0.30. That row does not exist at the origin, and cannot: OpenAI's own
 * documentation defines flex as *"Tokens are priced at Batch API rates, with
 * additional discounts from prompt caching."* Its price table lists luna at
 * Standard $0.20/$1.20, Flex $0.10/$0.60, Batch $0.10/$0.60 — flex and batch are
 * one discount reached two ways, not two multipliers. There is nothing to stack.
 *
 * OpenRouter derives tier endpoints by applying its 0.5x multiplier to a model
 * entry, so applying it to an already-batch-priced `:batch` entry produces a
 * $0.05/$0.30 row that nothing can bill. Three paid probes on 2026-08-25, same
 * 13+5 tokens, all billed $0.0000043 = 13×0.10 + 5×0.60 per million:
 *
 * - `luna` + `service_tier: 'flex'`
 * - `luna` + `provider: {only: ['openai/flex'], allow_fallbacks: false}`
 * - `luna:batch` + `service_tier: 'flex'`
 *
 * None reported a `service_tier` in the generation record. So a batched call
 * costs what batch costs, and for luna that is precisely what we already pay
 * synchronously at flex. Pricing the batch leg from that catalogue row would
 * approve a 24h window in exchange for nothing.
 *
 * It is tempting to conclude that batch still earns its keep on a model with no
 * flex endpoint. Checked against all seven models in `config-seed.json` on
 * 2026-08-25, cheapest healthy synchronous endpoint against the `:batch` entry,
 * $/1M in/out — **it does not pay anywhere**:
 *
 * | model                         | cheapest sync                    | `:batch`    |
 * | ----------------------------- | -------------------------------- | ----------- |
 * | `deepseek-v4-flash-0731`      | 0.035/0.100 open-inference/fp4   | none        |
 * | `gemini-2.5-flash-image`      | 0.150/1.250 google-ai-studio/flex| none        |
 * | `gemini-3.7-flash`            | 0.188/0.938 google-vertex/…/flex | 0.188/0.938 |
 * | `minimax-m3`                  | 0.230/0.960 coreweave/fp4        | 0.300/1.200 |
 * | `gpt-5-image-mini`            | 2.500/2.000 openai               | none        |
 * | `gpt-5.6-luna`                | 0.100/0.600 openai/flex          | 0.100/0.600 |
 * | `glm-5.2`                     | 0.500/3.150 sail-research/fp8    | 1.400/4.400 |
 *
 * The reason is the same one that makes the flex row a mirage: a batch rate is a
 * discount off the model's **base** price, and we do not pay the base price — we
 * pay the cheapest endpoint, which is often far below it. `glm-5.2` has no flex
 * endpoint and batch is still 2.8x its cheapest provider.
 *
 * @module shared/llm/openrouter-batch-eligibility
 */

import { cheapestEndpointAtTier, listModelEndpoints } from './openrouter-endpoints';
import { OpenRouterCatalogue, type OpenRouterCatalogModel } from './openrouter-catalogue';
import type { ServiceTier } from './service-tier';

export type { OpenRouterCatalogModel };

export interface BatchCompatibilityRequirements {
  /** Estimated prompt tokens, excluding the requested completion budget. */
  requiredContextTokens: number;
  requiredOutputTokens: number;
  /** Optional request controls whose semantics must survive batching. */
  requiredParameters: string[];
  /**
   * The tier the synchronous call would have used, which is the price the batch
   * discount has to beat. Defaults to `flex`, because a phase that can wait a
   * day is by definition not latency-sensitive and is already routed there.
   */
  serviceTier?: ServiceTier;
}

/** What one route really costs per million tokens. */
export interface EffectiveRates {
  prompt: number;
  completion: number;
}

/** The two prices the decision is made on, once tiers are taken into account. */
export interface TieredRates {
  /** The synchronous route, at the tier this phase would have used. */
  sync: EffectiveRates | null;
  /** The batch route, always at its default tariff — see the module comment. */
  batch: EffectiveRates | null;
}

/** The tier a batched request is served at, whatever it asks for. Measured. */
const BATCH_SERVED_TIER: ServiceTier = 'default';

export type BatchIneligibilityReason =
  | 'catalog_unavailable'
  | 'base_model_missing'
  | 'batch_model_missing'
  | 'invalid_pricing'
  | 'not_cheaper'
  | 'no_discount'
  /** The batch model has no endpoint at the tier the synchronous call uses. */
  | 'tier_unavailable'
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
      /** The synchronous tier this discount was measured against. */
      comparedAgainstTier: ServiceTier;
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
 *
 * `tieredRates` is how the price comparison stops being a lie. Pass it and the
 * decision is made on what each route would really be billed; omit it and the
 * `/models` figures are used, which are both default-tariff and therefore
 * describe a synchronous call this pipeline no longer makes. See the module
 * comment for the measured table.
 */
export function selectDiscountedBatchVariant(
  baseModelId: string,
  models: readonly OpenRouterCatalogModel[],
  requirements: BatchCompatibilityRequirements,
  tieredRates?: TieredRates
): BatchEligibilityDecision {
  const serviceTier = requirements.serviceTier ?? 'flex';

  const base = models.find(model => model.id === baseModelId);
  if (!base) return invalidDecision(baseModelId, null, 'base_model_missing');

  const batchModelId = `${baseModelId}:batch`;
  const batch = models.find(model => model.id === batchModelId);
  if (!batch) return invalidDecision(baseModelId, batchModelId, 'batch_model_missing');

  // A batch route that cannot be served at the tier we would otherwise have
  // used is priced at its default tariff — which for luna is exactly what we
  // pay synchronously today. Not cheaper, and a day slower.
  if (tieredRates && (!tieredRates.sync || !tieredRates.batch)) {
    return invalidDecision(baseModelId, batchModelId, 'tier_unavailable');
  }

  const baseInput = tieredRates?.sync?.prompt ?? parseRate(base.pricing.prompt);
  const baseOutput = tieredRates?.sync?.completion ?? parseRate(base.pricing.completion);
  const batchInput = tieredRates?.batch?.prompt ?? parseRate(batch.pricing.prompt);
  const batchOutput = tieredRates?.batch?.completion ?? parseRate(batch.pricing.completion);
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
    comparedAgainstTier: serviceTier,
  };
}

export interface OpenRouterBatchEligibilityResolverOptions {
  fetch?: typeof fetch;
  cacheTtlMs?: number;
  timeoutMs?: number;
  now?: () => number;
  /**
   * What each route costs at a given tier. Injectable so the decision can be
   * tested without a network, and defaulted to the same `/endpoints` lookup the
   * synchronous path pins its attempts with.
   */
  resolveTieredRates?: (
    baseModelId: string,
    batchModelId: string,
    syncTier: ServiceTier
  ) => Promise<TieredRates>;
}

async function readTieredRatesFromEndpoints(
  baseModelId: string,
  batchModelId: string,
  syncTier: ServiceTier
): Promise<TieredRates> {
  const [baseEndpoints, batchEndpoints] = await Promise.all([
    listModelEndpoints(baseModelId),
    listModelEndpoints(batchModelId),
  ]);

  const asRates = (endpoint: ReturnType<typeof cheapestEndpointAtTier>): EffectiveRates | null =>
    endpoint
      ? { prompt: endpoint.promptPricePerMillion, completion: endpoint.completionPricePerMillion }
      : null;

  return {
    sync: asRates(cheapestEndpointAtTier(baseEndpoints, syncTier)),
    batch: asRates(cheapestEndpointAtTier(batchEndpoints, BATCH_SERVED_TIER)),
  };
}

/**
 * Runtime source of truth for automatic Batch API selection.
 *
 * A short cache avoids turning every lesson into a catalogue request. Failures
 * never reuse guessed eligibility: callers receive `catalog_unavailable` and
 * continue through the synchronous path.
 */
export class OpenRouterBatchEligibilityResolver {
  private readonly catalogue: OpenRouterCatalogue;
  private readonly resolveTieredRates: NonNullable<
    OpenRouterBatchEligibilityResolverOptions['resolveTieredRates']
  >;

  constructor(options: OpenRouterBatchEligibilityResolverOptions = {}) {
    this.catalogue = new OpenRouterCatalogue(options);
    this.resolveTieredRates = options.resolveTieredRates ?? readTieredRatesFromEndpoints;
  }

  async resolve(
    baseModelId: string,
    requirements: BatchCompatibilityRequirements
  ): Promise<BatchEligibilityDecision> {
    try {
      const models = await this.catalogue.list();
      const batchModelId = `${baseModelId}:batch`;
      const tieredRates = await this.resolveTieredRates(
        baseModelId,
        batchModelId,
        requirements.serviceTier ?? 'flex'
      );
      return selectDiscountedBatchVariant(baseModelId, models, requirements, tieredRates);
    } catch {
      return invalidDecision(baseModelId, `${baseModelId}:batch`, 'catalog_unavailable');
    }
  }

  clearCache(): void {
    this.catalogue.clearCache();
  }
}
