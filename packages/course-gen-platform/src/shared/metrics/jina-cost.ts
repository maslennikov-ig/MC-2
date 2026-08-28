/**
 * What one Jina call cost, written into the same ledger as every other call.
 *
 * @module shared/metrics/jina-cost
 *
 * `mc2-4clyr` says Stage 6 is about 90% of generation cost. That figure is a
 * sum over `generation_trace`, and until 2026-08-28 `generation_trace` held
 * OpenRouter calls and nothing else — so Jina was in neither the numerator nor
 * the denominator of a number the repository presented as the whole picture.
 *
 * Jina was not merely unpriced, it was unreported. The reranker counted tokens
 * into a `TokenUsageTracker` that `getRerankerTokenStats()` exposes and nothing
 * reads, and that resets with the process. The hotter path was worse: query
 * embeddings go through `makeJinaV3Request`, which touches no tracker and logs
 * no `usage` at all, so a retrieval query's spend left no trace of any kind.
 *
 * The rule this restores is the repository's own, and it is not new: one paid
 * call, one priced row, attributable to a course. The mechanism is the same
 * `logTrace` write `recordLlmCallCost` makes, with the same `billedCall` stamp,
 * so `scripts/cost-report.ts` counts a Jina call as a call rather than as a
 * progress marker.
 *
 * Two things it deliberately does NOT do:
 *
 * - It never asks a provider to settle the row. OpenRouter has
 *   `/api/v1/generation`; Jina returns `usage.total_tokens` in the response
 *   body and offers no per-call receipt, so the recorded figure is a
 *   token count times a published rate and stays that. `billedInResponse` is
 *   therefore absent, which is honest rather than missing: recorded cost is
 *   still not the provider invoice.
 * - It records only when the API was actually called. Both Jina clients read a
 *   Redis cache first, and a cache hit spends nothing; pricing one would invent
 *   money.
 */

import logger from '../logger';
import { logTrace } from '../trace-logger';
import { jinaCostUsd } from '../jina/pricing';
import type { LlmCostContext } from './llm-cost';

export interface JinaCallUsage {
  /** Bare Jina model name, e.g. `jina-embeddings-v3`. */
  model: string;
  /** `usage.total_tokens` from the response body. */
  totalTokens: number;
  /** What the call did — an embedding, or a rerank over N documents. */
  operation: 'embedding' | 'rerank';
  /** How many documents a rerank was asked to score; the volume that moves. */
  documentCount?: number;
  durationMs?: number;
}

/**
 * Records one Jina call's tokens, model and price against a course.
 *
 * Never throws and never blocks the caller: accounting must not be able to fail
 * a retrieval. A call made without a course context is logged at debug with the
 * model, so the remaining holes stay visible instead of silent — the same
 * bargain `recordLlmCallCost` strikes, for the same reason.
 */
export async function recordJinaCallCost(
  usage: JinaCallUsage,
  context?: LlmCostContext
): Promise<void> {
  if (!context) {
    logger.debug(
      { model: usage.model, totalTokens: usage.totalTokens, operation: usage.operation },
      '[Cost] Jina call without a course context; its cost is not attributed'
    );
    return;
  }

  const costUsd = jinaCostUsd(usage.model, usage.totalTokens);
  if (costUsd === undefined) {
    logger.warn(
      { model: usage.model, courseId: context.courseId, totalTokens: usage.totalTokens },
      '[Cost] Jina model has no rate in JINA_PRICE_PER_MILLION_TOKENS; the call is traced without a price'
    );
  }

  try {
    await logTrace({
      courseId: context.courseId,
      stage: context.stage,
      phase: context.phase,
      stepName: context.stepName ?? `jina_${usage.operation}`,
      ...(context.lessonId ? { lessonId: context.lessonId } : {}),
      modelUsed: usage.model,
      tokensUsed: usage.totalTokens,
      ...(costUsd === undefined ? {} : { costUsd }),
      durationMs: usage.durationMs ?? context.durationMs ?? 0,
      inputData: {
        // The same stamp `recordLlmCallCost` writes, so a reconciliation can
        // tell a paid call from a stage progress marker.
        billedCall: true,
        // Which provider, because the ledger now holds two and the OpenRouter
        // reconciliation must be able to leave these rows out of its comparison.
        provider: 'jina',
        inputTokens: usage.totalTokens,
        outputTokens: 0,
        operation: usage.operation,
        ...(usage.documentCount === undefined ? {} : { documentCount: usage.documentCount }),
        ...(costUsd === undefined ? {} : { estimatedCostUsd: costUsd }),
      },
    });
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error), model: usage.model },
      '[Cost] Could not record a Jina call cost'
    );
  }
}
