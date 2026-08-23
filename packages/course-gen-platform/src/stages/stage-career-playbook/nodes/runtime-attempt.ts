/**
 * What one attempt of a Career Playbook LLM call does, and what it leaves behind.
 *
 * Split out of `runtime.ts`, which drives the attempts: this file is the body of
 * a single try, including the two things that were missing before 2026-08-21 —
 * which model it runs on, and the receipt it leaves whether it succeeds or not.
 */

import { estimateCost, estimateTokenCount } from '@/shared/llm/cost-calculator';
import { fetchGenerationFact, resolveProviderSlug } from '@/shared/llm/openrouter-generation';
import { logger } from '@/shared/logger';
import type { CareerPlaybookNodeCost } from '@megacampus/shared-types';

import type {
  CareerPlaybookAbortedAttempt,
  CareerPlaybookLLMCallOptions,
  CareerPlaybookLLMResult,
  CareerPlaybookModelInvocation,
} from './runtime';

/**
 * The attempt at which a call gives up on its primary model.
 *
 * Attempt 0 and attempt 1 both run on the phase's primary; only from attempt 2
 * does the fallback take over. Before 2026-08-21 the switch happened at attempt
 * 1, which spent three of `stage_career_playbook_spec`'s four attempts on its
 * fallback — the `~deepseek/...-latest` alias, median 102s that week — against a
 * 120s budget. All four timed out and the playbook failed (mc2-64n8i).
 *
 * A second run at the primary is worth having now in a way it was not before:
 * the failed provider is excluded from it, so it reaches a different endpoint
 * rather than repeating the same one. The fallback still exists, and still
 * catches a model that cannot produce the shape at all — it is simply no longer
 * the first thing tried after a single slow provider.
 */
export const FALLBACK_FROM_ATTEMPT = 2;

/**
 * Which model this attempt runs on.
 *
 * A caller that explicitly asked for the fallback — a repair after the primary
 * has already failed, or an input too large for the primary's window — gets it
 * from attempt 0. Those are decisions the call site has made with information
 * this function does not have.
 */
export function selectAttemptModel(
  phaseConfig: { modelId: string; fallbackModelId?: string },
  options: CareerPlaybookLLMCallOptions,
  attempt: number,
  startOnFallbackForLargeInput: boolean
): string {
  const useFallback =
    Boolean(options.preferFallbackModel) ||
    startOnFallbackForLargeInput ||
    attempt >= FALLBACK_FROM_ATTEMPT;

  return useFallback && phaseConfig.fallbackModelId
    ? phaseConfig.fallbackModelId
    : phaseConfig.modelId;
}

/**
 * Turn a successful invocation into a result, priced from the provider where it
 * will say and from the catalogue where it will not.
 *
 * The catalogue is the fallback now rather than the source: it was wrong for
 * three of the models this pipeline routes to on 2026-08-20, by factors from
 * 0.5x to 1.8x, which is why a $0.077338 ledger could not be reconciled against
 * a $0.144177 invoice (mc2-jukal).
 */
export function settleSuccessfulAttempt(params: {
  invocation: CareerPlaybookModelInvocation;
  options: CareerPlaybookLLMCallOptions;
  modelId: string;
  attempt: number;
  promptTokens: number;
  generationId: string | undefined;
  attemptStartedAt: number;
  callStartedAt: number;
  abortedAttempts: CareerPlaybookAbortedAttempt[];
}): CareerPlaybookLLMResult {
  const { invocation, options, modelId, attempt, generationId } = params;

  // Prefer real OpenRouter usage (requested via usage.include); fall back to the
  // already-computed length/4 estimate when the provider/structured-output path
  // omits it.
  const inputTokens = invocation.usage?.input_tokens ?? params.promptTokens;
  const outputTokens = invocation.usage?.output_tokens ?? estimateTokenCount(invocation.content);
  // The catalogue estimate stands until the receipt arrives, and the receipt is
  // not collected here. A generation record takes about ten seconds to become
  // readable; waiting for one per node would add minutes to a run for a number
  // nobody reads until it is persisted. `settleCareerPlaybookNodeCosts` collects
  // them all at once, when the run is over and every record is long since ready.
  const costUsd = estimateCost(modelId, inputTokens + outputTokens, inputTokens);
  const totalDurationMs = Date.now() - params.callStartedAt;

  logger.info(
    {
      phaseName: options.phaseName,
      node: options.node,
      promptKey: options.promptKey,
      modelId,
      attempt,
      durationMs: Date.now() - params.attemptStartedAt,
      totalDurationMs,
      inputTokens,
      outputTokens,
      estimatedCostUsd: costUsd,
      generationId,
    },
    'Career Playbook LLM call succeeded'
  );

  return {
    content: invocation.content,
    model: modelId,
    inputTokens,
    outputTokens,
    costUsd,
    durationMs: totalDurationMs,
    attemptCount: attempt + 1,
    abortedAttempts: params.abortedAttempts,
    ...(generationId ? { generationId } : {}),
  };
}

/**
 * Record what a failed attempt cost and who to route around next time.
 *
 * One lookup answers both questions. The wait is seconds against a timeout that
 * has already cost minutes, and before this existed those attempts left nothing
 * at all: four of them, 120s each, were most of the 46% gap on 2026-08-20
 * (mc2-64n8i).
 */
export async function recordFailedAttempt(params: {
  error: unknown;
  options: CareerPlaybookLLMCallOptions;
  modelId: string;
  attempt: number;
  generationId: string | undefined;
  durationMs: number;
  abortedAttempts: CareerPlaybookAbortedAttempt[];
  ignoredProviderSlugs: Set<string>;
}): Promise<void> {
  const { error, options, modelId, attempt, generationId, durationMs } = params;
  const errorMessage = error instanceof Error ? error.message : String(error);

  const fact = generationId ? await fetchGenerationFact(generationId) : null;

  if (fact?.providerName) {
    const slug = await resolveProviderSlug(fact.providerName);
    if (slug) params.ignoredProviderSlugs.add(slug);
  }

  params.abortedAttempts.push({
    model: modelId,
    attempt,
    durationMs,
    error: errorMessage,
    ...(generationId ? { generationId } : {}),
    ...(fact?.providerName ? { providerName: fact.providerName } : {}),
    // `== null` covers both "no record" and "record without a charge"; a real
    // zero is neither, and is kept.
    ...(fact?.usageUsd == null ? {} : { costUsd: fact.usageUsd }),
  });

  // The pre-instrumentation catch swallowed retries silently; the failed-attempt
  // warning is the single most valuable diagnostic line for latency/cost runaways.
  logger.warn(
    {
      phaseName: options.phaseName,
      node: options.node,
      promptKey: options.promptKey,
      modelId,
      attempt,
      durationMs,
      error: errorMessage,
      generationId,
      providerName: fact?.providerName,
      billedUsd: fact?.usageUsd,
      ignoredInThisChain: [...params.ignoredProviderSlugs],
    },
    'Career Playbook LLM call attempt failed'
  );
}

/**
 * Replace every node's catalogue estimate with what OpenRouter actually charged.
 *
 * Run once, when the generation is over and about to be persisted, because a
 * generation record takes roughly ten seconds to become readable: collecting
 * receipts per call would add minutes to a run, while collecting them all here
 * costs one round of concurrent lookups against records that are long since
 * ready.
 *
 * The estimate is worth replacing. On 2026-08-21 the catalogue put one luna call
 * at $0.0058882 against a real $0.006444801 — 9% low on a single call, and the
 * catalogue's errors do not all point the same way.
 *
 * Never throws: a receipt we could not collect leaves the estimate in place,
 * which is the state this ledger was in before any of this existed.
 */
export async function settleCareerPlaybookNodeCosts(
  nodeCosts: CareerPlaybookNodeCost[]
): Promise<CareerPlaybookNodeCost[]> {
  const settled = await Promise.all(
    nodeCosts.map(async cost => {
      // An aborted attempt already collected its own receipt on the failure
      // path, where the wait was free against a timeout that had just elapsed.
      if (!cost.generation_id || cost.billed_by_provider) return cost;

      try {
        const fact = await fetchGenerationFact(cost.generation_id);
        // `== null` and not falsy: a provider that charged exactly $0 measured
        // that, and it is not the same as having no receipt.
        if (fact?.usageUsd == null) return cost;

        return {
          ...cost,
          cost_usd: fact.usageUsd,
          cost_unknown: false,
          billed_by_provider: true,
          ...(fact.providerName ? { provider_name: fact.providerName } : {}),
        };
      } catch {
        return cost;
      }
    })
  );

  const billed = settled.filter(c => c.billed_by_provider).length;
  logger.info(
    {
      nodes: settled.length,
      billedByProvider: billed,
      estimatedTotal: nodeCosts.reduce((s, c) => s + c.cost_usd, 0),
      settledTotal: settled.reduce((s, c) => s + c.cost_usd, 0),
    },
    'Career Playbook costs settled against the provider'
  );

  return settled;
}
