/**
 * Model catalogue drift gate.
 *
 * `MODEL_CATALOG` is what every price ceiling and every cost estimate is built
 * from, and the only thing that has ever checked it against reality is
 * `tests/unit/model-catalog-coverage.test.ts` — a hand-written snapshot of the
 * published rates, which is correct exactly until somebody stops re-reading
 * them. In the week to 2026-08-21 four entries drifted, in different directions:
 * `openai/gpt-5.6-luna` at half its tariff, `z-ai/glm-5.2` 1.23x over,
 * `~deepseek/...-latest` 1.45x over, `deepseek/deepseek-v4-flash` 1.7x over. The
 * errors partly cancelled, so the gap against the invoice looked smaller than
 * its causes and pointed nowhere in particular (mc2-hc91g).
 *
 * A wrong price is not only a wrong report. `buildProviderPriceCeiling` sends
 * `provider.max_price` built from these numbers, and a ceiling below every
 * endpoint is answered with `No endpoints found that satisfy the max price for
 * this request` — a hard refusal, not a cheaper route. One stale entry can fail
 * every call to a model.
 *
 * So this reads the published rates and says which entries disagree. It is a
 * separate script rather than a test on purpose: the offline test stays offline,
 * because routing must not depend on a third party being reachable, and a check
 * that fails when the network does teaches people to ignore it.
 *
 * Read-only. Talks to nothing but `GET /api/v1/models`, which needs no key.
 *
 * Usage:
 *   pnpm -F course-gen-platform exec tsx scripts/check-model-catalog-drift.ts
 *   ... --all      check every catalogued model, not only the live routing set
 *
 * Refs mc2-hc91g
 */
import { fileURLToPath } from 'node:url';

import { MODEL_CATALOG, type ModelCapabilities } from '@megacampus/shared-types';

import { collectRoutableModelIds, describeRoutableModel } from '@/shared/llm/routable-models';

const EXIT_UNREACHABLE = 2;
const EXIT_DRIFT = 1;
const REQUEST_TIMEOUT_MS = 20_000;
const MODELS_URL = 'https://openrouter.ai/api/v1/models';

/**
 * How far a catalogued rate may sit from the published one before it is drift.
 *
 * Not zero, because the published figures are per-token decimals and the
 * catalogue stores dollars per million: `0.0000000826` round-trips to `0.0826`
 * with a last-digit wobble that is arithmetic, not disagreement. 0.5% is far
 * below the smallest real drift ever found here (23%) and far above the
 * round-trip.
 */
const TOLERANCE = 0.005;

/** The published rates for one model, in dollars per million tokens. */
export interface PublishedPricing {
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
  imageOutputPricePerMillion: number | null;
}

export interface DriftFinding {
  modelId: string;
  field: string;
  catalogued: number;
  published: number;
  ratio: number;
}

function perMillion(raw: unknown): number | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value * 1_000_000 : null;
}

/** Published rates keyed by model id. */
export function readPublishedPricing(
  rows: Array<Record<string, unknown>>
): Map<string, PublishedPricing> {
  const published = new Map<string, PublishedPricing>();
  for (const row of rows) {
    const id = typeof row.id === 'string' ? row.id : null;
    const pricing = row.pricing as Record<string, unknown> | undefined;
    if (!id || !pricing) continue;

    published.set(id, {
      inputPricePerMillion: perMillion(pricing.prompt),
      outputPricePerMillion: perMillion(pricing.completion),
      imageOutputPricePerMillion: perMillion(pricing.image_output),
    });
  }
  return published;
}

/**
 * Where the catalogue disagrees with the published rates.
 *
 * A model the published list does not carry at all is reported separately: it is
 * either delisted or misspelled, and neither is a price problem.
 */
export function findDrift(
  catalogue: Record<string, ModelCapabilities>,
  published: Map<string, PublishedPricing>,
  modelIds: string[]
): { drift: DriftFinding[]; absent: string[] } {
  const drift: DriftFinding[] = [];
  const absent: string[] = [];

  for (const modelId of modelIds) {
    const entry = catalogue[modelId];
    if (!entry) continue;

    const live = published.get(modelId);
    if (!live) {
      absent.push(modelId);
      continue;
    }

    const comparisons: Array<[string, number | undefined, number | null]> = [
      ['inputPricePerMillion', entry.inputPricePerMillion, live.inputPricePerMillion],
      ['outputPricePerMillion', entry.outputPricePerMillion, live.outputPricePerMillion],
      [
        'imageOutputPricePerMillion',
        entry.imageOutputPricePerMillion,
        live.imageOutputPricePerMillion,
      ],
    ];

    for (const [field, catalogued, publishedRate] of comparisons) {
      // `== null` rather than falsy: a genuine free leg is a published rate of
      // zero, and treating it as "not published" would hide a real change.
      if (catalogued == null || publishedRate == null) continue;
      if (publishedRate === 0 && catalogued === 0) continue;

      const denominator = publishedRate === 0 ? catalogued : publishedRate;
      const ratio = catalogued / denominator;
      if (Math.abs(ratio - 1) <= TOLERANCE) continue;

      drift.push({ modelId, field, catalogued, published: publishedRate, ratio });
    }
  }

  return { drift, absent };
}

async function main(): Promise<void> {
  const checkAll = process.argv.includes('--all');
  // Derived from the registries that can actually put a model on the wire, not
  // from a hand-kept list of them. The list held seven ids; sixty days of
  // `generation_trace` to 2026-08-25 held eleven, six of which were therefore
  // running on frozen, unverified prices (mc2-a6qxc).
  const modelIds = checkAll ? Object.keys(MODEL_CATALOG) : collectRoutableModelIds();

  const uncatalogued = modelIds.filter(modelId => !(modelId in MODEL_CATALOG));
  for (const modelId of uncatalogued) {
    // Not drift — worse. There is no number to compare, so the cost path falls
    // back to a default and `provider.max_price` is built from a guess.
    console.warn(
      `  routable but not in MODEL_CATALOG: ${modelId} — routed from ${describeRoutableModel(
        modelId
      ).join(', ')}`
    );
  }

  let rows: Array<Record<string, unknown>>;
  try {
    const response = await fetch(MODELS_URL, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`${MODELS_URL} answered ${response.status}`);
    }
    const body = (await response.json()) as { data?: Array<Record<string, unknown>> };
    if (!Array.isArray(body.data)) throw new Error('no `data` array in the response');
    rows = body.data;
  } catch (error) {
    // Exit 2, not 1: "we could not check" is not "the catalogue is wrong", and a
    // caller that cannot tell them apart will eventually treat both as noise.
    console.error(
      `::error::could not read the published model list: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exit(EXIT_UNREACHABLE);
  }

  const published = readPublishedPricing(rows);
  const { drift, absent } = findDrift(MODEL_CATALOG, published, modelIds);

  for (const modelId of absent) {
    console.warn(
      `  not in the published list: ${modelId} — delisted, or the id is misspelled in MODEL_CATALOG`
    );
  }

  if (drift.length === 0) {
    console.log(
      `model catalogue drift check OK: ${modelIds.length - absent.length} of ${modelIds.length} ` +
        `${checkAll ? 'catalogued' : 'routable'} models match the published rates`
    );
    return;
  }

  console.error('::error::MODEL_CATALOG no longer matches the published OpenRouter rates.');
  for (const finding of drift) {
    console.error(
      `  ${finding.modelId} ${finding.field}: catalogue ${finding.catalogued}, ` +
        `published ${finding.published} (${finding.ratio.toFixed(2)}x)`
    );
  }
  console.error(
    'Update packages/shared-types/src/model-catalog.ts and the snapshot in\n' +
      'tests/unit/model-catalog-coverage.test.ts. A stale price is not only a wrong\n' +
      'report: provider.max_price is built from these numbers, and a ceiling under\n' +
      'every endpoint refuses the call outright.'
  );
  process.exit(EXIT_DRIFT);
}

// Only run when invoked directly: the comparison above is imported by tests.
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))
) {
  void main();
}
