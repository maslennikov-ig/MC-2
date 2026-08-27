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
 * **`--write` applies the new rates rather than reporting them.** Filing a
 * ticket to have a person retype two numbers a machine already knows is a
 * ritual, not a control: the runtime ceiling reads the *live* rate and only
 * falls back to this catalogue when that lookup fails, and the figure a course
 * is actually billed comes from `GET /api/v1/generation` seconds later. So the
 * catalogue's precision earns nobody's attention, and the nightly job now keeps
 * it current by itself.
 *
 * What still earns attention is a *large* move, and the size is not invented:
 * the ceiling is the catalogued rate times
 * {@link PROVIDER_PRICE_CEILING_MULTIPLIER}, so a rise of that factor is exactly
 * the point where a stale entry stops being untidy and starts refusing every
 * call to the model. Anything smaller is written silently; anything at or beyond
 * it is also written, and then said out loud.
 *
 * Talks to `GET /api/v1/models`, which needs no key, and to
 * `/api/v1/images/models/.../endpoints` for ids the chat list does not carry.
 *
 * Usage:
 *   pnpm -F course-gen-platform exec tsx scripts/check-model-catalog-drift.ts
 *   ... --all      check every catalogued model, not only the live routing set
 *   ... --write    apply the published rates to the catalogue and its snapshot
 *
 * Refs mc2-hc91g
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { MODEL_CATALOG, type ModelCapabilities } from '@megacampus/shared-types';

import { PROVIDER_PRICE_CEILING_MULTIPLIER } from '@/shared/llm/client';
import { collectRoutableModelIds, describeRoutableModel } from '@/shared/llm/routable-models';

const EXIT_UNREACHABLE = 2;
const EXIT_DRIFT = 1;
const REQUEST_TIMEOUT_MS = 20_000;
const MODELS_URL = 'https://openrouter.ai/api/v1/models';

/**
 * The move that is worth waking somebody for, in either direction.
 *
 * Taken from the ceiling multiplier rather than chosen, because that is what
 * makes it matter: `max_price` is the catalogued rate times this, so a rise of
 * this factor puts the frozen ceiling under the real price and every endpoint is
 * refused. A fall of the same size is harmless to the ceiling but means a third
 * of the price vanished overnight, which is usually the provider set changing
 * rather than a tariff being edited.
 *
 * For scale: the drifts this gate has actually found sit at 1.03x, 1.11x, 1.23x
 * and 1.57x, and the one real incident — `deepseek-v4-flash` on 2026-08-25 —
 * moved 2.33x inside two hours.
 */
const LOUD_RATIO = PROVIDER_PRICE_CEILING_MULTIPLIER;

/** Where the two files that carry these numbers live. */
const CATALOGUE_PATH = new URL('../../shared-types/src/model-catalog.ts', import.meta.url);
const SNAPSHOT_PATH = new URL('../tests/unit/model-catalog-coverage.test.ts', import.meta.url);

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

/** What the image catalogue charges for one output image, and in what unit. */
export interface PublishedImagePrice {
  /** USD for one whole picture, when the model is billed that way. */
  flatUsd?: number;
  /** USD per 1M image output tokens, when it is billed that way instead. */
  perMillionTokens?: number;
}

/**
 * What an image costs, from the image catalogue rather than the chat one.
 *
 * Both halves are read because both exist: 26 of the 48 quote a flat price per
 * frame and 17 quote a per-token rate, and a gate that understood only one of
 * them would leave the other's prices unchecked. That gap was real and mine —
 * `openai/gpt-image-2` went in as the banner's fallback and was reported as
 * "delisted, or misspelled" because this only knew about flat prices.
 *
 * The base entry only, never a `variant`. The variants are real and matter —
 * `seedream-5-0-pro` doubles at `high_resolution`, which a 1:1 request silently
 * selects — but they price a different request than the catalogue entry
 * describes.
 *
 * `null` when the model is not in this catalogue either, which is the genuine
 * "delisted or misspelled" case the caller reports.
 */
export async function readPublishedImagePrice(
  modelId: string
): Promise<PublishedImagePrice | null> {
  try {
    const response = await fetch(
      `https://openrouter.ai/api/v1/images/models/${modelId}/endpoints`,
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
    );
    if (!response.ok) return null;
    const body = (await response.json()) as {
      endpoints?: Array<{ pricing?: Array<Record<string, unknown>> }>;
    };
    for (const endpoint of body.endpoints ?? []) {
      const base = (endpoint.pricing ?? []).find(
        price => price.billable === 'output_image' && price.variant === undefined
      );
      if (!base || typeof base.cost_usd !== 'number') continue;
      if (base.unit === 'image') return { flatUsd: base.cost_usd };
      if (base.unit === 'token') return { perMillionTokens: base.cost_usd * 1_000_000 };
      // Megapixel pricing depends on the frame requested, so there is no single
      // number to compare an entry against. Say so by returning the model as
      // found but unpriceable rather than as missing.
      return {};
    }
    return null;
  } catch {
    return null;
  }
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

/**
 * A published rate as a TypeScript literal.
 *
 * The published figures are per-token decimals multiplied by a million here, so
 * they arrive carrying float noise — `0.0000000886066` becomes
 * `0.08860600000000001`. Six decimals is well inside {@link TOLERANCE} and reads
 * like a price rather than an artefact.
 */
export function formatRate(value: number): string {
  return String(Number(value.toFixed(6)));
}

/**
 * Replace one rate inside one model's entry in `model-catalog.ts`.
 *
 * Anchored on the entry's own key and stopped at the next one, so a field name
 * that appears in twenty entries is only rewritten in the intended one. Returns
 * the source unchanged when the field is not there — an entry that does not
 * carry a rate is not one to invent a rate for.
 */
export function applyRateToCatalogue(
  source: string,
  modelId: string,
  field: string,
  value: number
): string {
  const key = `'${modelId}': {`;
  const start = source.indexOf(key);
  if (start === -1) return source;

  // The entry ends at the line that closes it: two spaces, brace, comma. Every
  // entry in this file is indented that way, and nothing nested inside one is.
  const end = source.indexOf('\n  },', start);
  if (end === -1) return source;

  const block = source.slice(start, end);
  const replaced = block.replace(
    new RegExp(`(\\b${field}:\\s*)[\\d.]+`, 'u'),
    `$1${formatRate(value)}`
  );
  return replaced === block ? source : source.slice(0, start) + replaced + source.slice(end);
}

/**
 * Replace one rate in the hand-verified snapshot beside the catalogue.
 *
 * Two shapes live there: `'id': [input, output],` for text rates and
 * `'id': N,` for the image ones. Every occurrence of the id is updated rather
 * than the first — the retired-model table states the same published fact as the
 * live one, and leaving one of them behind would make the pair disagree about
 * what OpenRouter charges.
 */
export function applyRateToSnapshot(
  source: string,
  modelId: string,
  field: string,
  value: number
): string {
  const literal = formatRate(value);
  const id = modelId.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

  if (field === 'inputPricePerMillion' || field === 'outputPricePerMillion') {
    const slot = field === 'inputPricePerMillion' ? 1 : 2;
    return source.replace(
      new RegExp(`('${id}':\\s*\\[)([\\d.]+)(,\\s*)([\\d.]+)(\\])`, 'gu'),
      (_match, open: string, input: string, gap: string, output: string, close: string) =>
        slot === 1
          ? `${open}${literal}${gap}${output}${close}`
          : `${open}${input}${gap}${literal}${close}`
    );
  }

  return source.replace(new RegExp(`('${id}':\\s*)[\\d.]+(,)`, 'gu'), `$1${literal}$2`);
}

/** Write every finding into both files, and say how many landed. */
function applyFindings(findings: DriftFinding[]): number {
  let catalogue = readFileSync(CATALOGUE_PATH, 'utf8');
  let snapshot = readFileSync(SNAPSHOT_PATH, 'utf8');
  let applied = 0;

  for (const finding of findings) {
    const nextCatalogue = applyRateToCatalogue(
      catalogue,
      finding.modelId,
      finding.field,
      finding.published
    );
    if (nextCatalogue === catalogue) {
      console.warn(
        `  could not find ${finding.modelId} ${finding.field} in the catalogue; left as it was`
      );
      continue;
    }
    catalogue = nextCatalogue;
    snapshot = applyRateToSnapshot(snapshot, finding.modelId, finding.field, finding.published);
    applied += 1;
  }

  if (applied > 0) {
    writeFileSync(CATALOGUE_PATH, catalogue);
    writeFileSync(SNAPSHOT_PATH, snapshot);
  }
  return applied;
}

async function main(): Promise<void> {
  const checkAll = process.argv.includes('--all');
  const write = process.argv.includes('--write');
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

  // An id missing from `/api/v1/models` is not necessarily delisted. Image
  // generation has its own catalogue of 48 at `/api/v1/images/models`, and only
  // nine models appear in both; `sourceful/riverflow-v2.5-fast` draws every
  // lesson banner and is absent from the chat list by design. Reporting it as
  // "delisted, or misspelled" and moving on would leave a live-routed price
  // unverified, which is the exact failure this gate was widened to stop
  // (mc2-a6qxc).
  const stillAbsent: string[] = [];
  for (const modelId of absent) {
    const entry = MODEL_CATALOG[modelId];
    const live = await readPublishedImagePrice(modelId);
    if (live === null) {
      stillAbsent.push(modelId);
      continue;
    }

    const comparisons: Array<[string, number | undefined, number | undefined]> = [
      ['imagePriceFlatUsd', entry?.imagePriceFlatUsd, live.flatUsd],
      ['imageOutputPricePerMillion', entry?.imageOutputPricePerMillion, live.perMillionTokens],
    ];

    for (const [field, catalogued, publishedRate] of comparisons) {
      if (catalogued == null || publishedRate == null) continue;
      const ratio = publishedRate / catalogued;
      if (Math.abs(ratio - 1) <= TOLERANCE) continue;
      drift.push({ modelId, field, catalogued, published: publishedRate, ratio });
    }
  }

  for (const modelId of stillAbsent) {
    console.warn(
      `  not in the published list: ${modelId} — delisted, or the id is misspelled in MODEL_CATALOG`
    );
  }

  if (drift.length === 0) {
    // Says what was compared, not what was asked for. `absent` never reached the
    // published list and `uncatalogued` has no number to compare, so counting
    // either as a match would report full coverage of a check that skipped them.
    const compared = modelIds.length - absent.length - uncatalogued.length;
    const skipped = [
      ...(absent.length > 0 ? [`${absent.length} not in the published list`] : []),
      ...(uncatalogued.length > 0 ? [`${uncatalogued.length} not in MODEL_CATALOG`] : []),
    ];
    console.log(
      `model catalogue drift check OK: ${compared} of ${modelIds.length} ` +
        `${checkAll ? 'catalogued' : 'routable'} models match the published rates` +
        (skipped.length > 0 ? ` (${skipped.join(', ')})` : '')
    );
    return;
  }

  // As a signed change, not as `ratio`. `ratio` is catalogued/published, so a
  // price that doubled reads "0.46x" — true, and the opposite of how anyone will
  // read it at 03:20 on a phone.
  const describe = (finding: DriftFinding) => {
    const change = (finding.published / finding.catalogued - 1) * 100;
    return (
      `${finding.modelId} ${finding.field}: ${finding.catalogued} → ${finding.published} ` +
      `(${change > 0 ? '+' : ''}${change.toFixed(0)}%)`
    );
  };

  const loud = drift.filter(
    finding => finding.ratio >= LOUD_RATIO || finding.ratio <= 1 / LOUD_RATIO
  );

  if (!write) {
    console.error('::error::MODEL_CATALOG no longer matches the published OpenRouter rates.');
    for (const finding of drift) console.error(`  ${describe(finding)}`);
    console.error('Re-run with --write to apply these, or edit the two files by hand.');
    process.exit(EXIT_DRIFT);
  }

  const applied = applyFindings(drift);
  console.log(`applied ${applied} of ${drift.length} published rate(s):`);
  for (const finding of drift) console.log(`  ${describe(finding)}`);

  if (loud.length > 0) {
    // The workflow reads this file to decide whether anybody hears about it. A
    // file rather than an exit code, because "the catalogue moved a lot" and
    // "the job failed" are different things and a nightly job that fails on the
    // first is one people stop reading.
    writeFileSync(
      new URL('../drift-loud.txt', import.meta.url),
      `${loud.map(describe).join('\n')}\n`
    );
    console.log(
      `\n${loud.length} of them moved by ${LOUD_RATIO}x or more — the factor the price ` +
        `ceiling is built from, so this is where a stale entry starts refusing calls.`
    );
  }
}

// Only run when invoked directly: the comparison above is imported by tests.
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))
) {
  void main();
}
