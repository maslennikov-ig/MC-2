/**
 * Jina price drift gate.
 *
 * `JINA_PRICE_PER_MILLION_TOKENS` is the only thing standing between a Jina
 * call and an unpriced row, and a table nobody re-reads is a table that goes
 * stale. The OpenRouter half of this repository already learned that the
 * expensive way: in the week to 2026-08-21 four catalogue entries had drifted in
 * different directions and the errors partly cancelled, so the gap against the
 * invoice looked smaller than its causes (mc2-hc91g).
 *
 * Jina publishes its rates the same way OpenRouter does — `pricing.prompt`, USD
 * per token, as a string — at `GET https://api.jina.ai/v1/models`. This reads
 * them and says which entries disagree.
 *
 * A separate script rather than a test, for the same reason the model catalogue
 * gate is one: the offline test stays offline, because retrieval must not depend
 * on a third party being reachable, and a check that fails when the network does
 * teaches people to ignore it.
 *
 * Usage:
 *   pnpm -F course-gen-platform exec tsx scripts/check-jina-pricing-drift.ts
 *
 * Refs mc2-d0e2n.3
 */
import { JINA_PRICE_PER_MILLION_TOKENS, jinaCatalogueId } from '@/shared/jina/pricing';

const EXIT_UNREACHABLE = 2;
const EXIT_DRIFT = 1;
const REQUEST_TIMEOUT_MS = 20_000;
const MODELS_URL = 'https://api.jina.ai/v1/models';

interface JinaModelRow {
  id: string;
  pricing?: { prompt?: string };
}

/**
 * The published rate per 1M tokens, or `null` when the provider does not list
 * the model.
 *
 * `null` and 0 are different answers and are kept apart: a model that has left
 * the catalogue is a fact about the provider, while a rate of zero would be a
 * price. Reading one as the other is how a real charge becomes a free row.
 */
function publishedRate(rows: JinaModelRow[], model: string): number | null {
  const row = rows.find(candidate => candidate.id === jinaCatalogueId(model));
  const prompt = row?.pricing?.prompt;
  if (prompt === undefined) return null;
  const perToken = Number(prompt);
  if (!Number.isFinite(perToken) || perToken < 0) return null;
  return perToken * 1_000_000;
}

async function main(): Promise<void> {
  let rows: JinaModelRow[];
  try {
    const response = await fetch(MODELS_URL, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // The list is public. Sending the key would make an unreachable-provider
      // failure indistinguishable from a key problem.
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as { data?: JinaModelRow[] };
    if (!Array.isArray(body.data)) throw new Error('no data array in the response');
    rows = body.data;
  } catch (error) {
    console.error(
      `Could not read ${MODELS_URL}: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(EXIT_UNREACHABLE);
  }

  const drifted: string[] = [];
  const missing: string[] = [];

  for (const [model, recorded] of Object.entries(JINA_PRICE_PER_MILLION_TOKENS)) {
    const live = publishedRate(rows, model);
    if (live === null) {
      missing.push(`${model}: not listed at ${MODELS_URL}`);
      continue;
    }
    // A relative epsilon, and a tiny one — not a tolerance for real movement.
    // The provider publishes USD *per token*, so `0.00000005 * 1e6` is
    // `0.049999999999999996` and an exact comparison reports drift on a table
    // that agrees to every published digit. Anything a person would call a
    // price change is many orders of magnitude larger than this.
    if (Math.abs(live - recorded) > recorded * 1e-9) {
      drifted.push(`${model}: recorded $${recorded}/1M, published $${live}/1M`);
      continue;
    }
    console.log(`ok  ${model}  $${recorded} per 1M tokens`);
  }

  for (const line of missing) console.error(`MISSING  ${line}`);
  for (const line of drifted) console.error(`DRIFT    ${line}`);

  if (drifted.length > 0 || missing.length > 0) {
    console.error(
      '\nUpdate src/shared/jina/pricing.ts. Every Jina row already written keeps the\n' +
        'rate it was priced at; only new calls use the corrected one.'
    );
    process.exit(EXIT_DRIFT);
  }

  console.log(`\n${Object.keys(JINA_PRICE_PER_MILLION_TOKENS).length} rates match the provider.`);
}

void main();
