/**
 * What Jina charges, taken from Jina.
 *
 * @module shared/jina/pricing
 *
 * Jina is a paid provider on two hot paths — one query embedding per retrieval
 * query, one reranker call per lesson — and until 2026-08-28 it appeared in no
 * price table in this repository at all. `MODEL_CATALOG`, `config-seed.json`
 * and `model-config-*.ts` are OpenRouter's, and so is every rule the repository
 * wrote about spend. A provider with no rate cannot be priced, and a call that
 * cannot be priced is a call nobody reports.
 *
 * The rates below come from the provider rather than from a memory or an
 * aggregator, the same discipline `MODEL_CATALOG` follows for OpenRouter:
 *
 *     GET https://api.jina.ai/v1/models     ->  data[].pricing.prompt
 *
 * which returns USD **per token**, as a string, in the same shape OpenRouter
 * uses. Read 2026-08-28; `scripts/check-jina-pricing-drift.ts` re-reads it and
 * fails when this table and the provider disagree.
 *
 * Jina bills a single token pool across embeddings, reranking, reader and the
 * rest, and `completion` is 0 for every model — a reranker returns scores, not
 * text — so one rate per model is the whole tariff.
 */

/** USD per 1M tokens, from `pricing.prompt` x 1e6. */
export const JINA_PRICE_PER_MILLION_TOKENS: Readonly<Record<string, number>> = Object.freeze({
  /** Query embeddings: `generateQueryEmbedding`, one per retrieval query. */
  'jina-embeddings-v3': 0.05,
  /** Lesson reranking: `rerankDocuments`, one per lesson over the whole union. */
  'jina-reranker-v2-base-multilingual': 0.05,
});

/** The id `GET /v1/models` reports for a model this repository calls by bare name. */
export function jinaCatalogueId(model: string): string {
  return `jina-ai/${model}`;
}

/**
 * What a Jina call cost, or `undefined` when the model carries no rate.
 *
 * `undefined` rather than 0, for the same reason `calculateLlmCostUsd` returns
 * it: a measured zero is a measurement and an unknown rate is not, and writing
 * one as the other is how a real charge becomes an untraceable zero row.
 */
export function jinaCostUsd(model: string, totalTokens: number): number | undefined {
  const perMillion = JINA_PRICE_PER_MILLION_TOKENS[model];
  if (perMillion === undefined) return undefined;
  if (!Number.isFinite(totalTokens) || totalTokens < 0) return undefined;
  return (totalTokens / 1_000_000) * perMillion;
}
