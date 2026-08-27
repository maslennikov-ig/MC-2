/**
 * The published price list, read from OpenRouter rather than remembered.
 *
 * `MODEL_CATALOG` holds one rate per model, frozen by hand. That number is used
 * for two different jobs and is only ever right for one of them:
 *
 * - As a **cost estimate** it is an upper bound we rarely pay. `/models`
 *   publishes the mainstream providers' price, not the cheapest, and the
 *   per-attempt pin routes to the cheapest — measured 2026-08-25, that is 0.035
 *   against a published 0.14 for `deepseek-v4-flash-0731`, a quarter. The
 *   estimate is corrected within seconds by the provider's own receipt, so the
 *   overstatement is short-lived.
 * - As a **price ceiling** it is load-bearing, and a frozen number goes stale.
 *   On 2026-08-25 two entries had drifted low — deepseek 0.08 against a
 *   published 0.14, glm-5.2 0.966 against 1.19 — which silently tightened the
 *   ceiling around a smaller provider pool. Low enough and it refuses every
 *   endpoint, turning a stale constant into a failed generation (mc2-qch4w).
 *
 * So the ceiling reads the live number. The rule is unchanged — published rate
 * times a multiplier — and on all seven configured models it reproduces the
 * catalogue ceiling exactly; it simply cannot drift. Checked against three
 * alternatives on the live endpoint distributions before choosing:
 * `cheapest x 1.5` admitted 2 of deepseek's 24 endpoints and 1 of luna's 4,
 * which would have starved the retry chain of anywhere to go.
 *
 * The old objection to reading this live — that routing must not depend on a
 * third party being reachable — no longer applies here: both call sites already
 * `await listModelEndpoints()` a line later, so the dependency is present either
 * way. An unreachable catalogue falls back to the frozen rate rather than
 * dropping the ceiling.
 *
 * @module shared/llm/openrouter-catalogue
 */

import { buildProviderPriceCeiling } from './client-helpers';
import logger from '../logger';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const DEFAULT_CATALOG_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CATALOG_TIMEOUT_MS = 5_000;

/** One model as `/api/v1/models` reports it. Prices are dollars per token. */
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

export interface OpenRouterCatalogueOptions {
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
 * The catalogue, fetched once and reused briefly.
 *
 * Injectable rather than a module of functions because two callers want
 * different lifetimes: the batch eligibility check builds its own with a test
 * fetch, and the price ceiling shares one process-wide instance. A short cache
 * keeps a listing of 419 models from riding in front of every attempt.
 *
 * Throws on failure. Callers decide what an unreachable price list means for
 * them — for eligibility it means "stay synchronous", for the ceiling it means
 * "use the frozen rate" — and neither should be guessed here.
 */
export class OpenRouterCatalogue {
  /**
   * Undefined means "whatever `fetch` is when the call happens".
   *
   * Resolved per call rather than captured in the constructor: this class has a
   * process-wide instance built at import time, and reading `globalThis.fetch`
   * then freezes whichever implementation existed before any wrapper — or any
   * test stub — was installed. `openrouter-endpoints.ts` calls the global
   * directly for the same reason.
   */
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly cacheTtlMs: number;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private cached: { models: OpenRouterCatalogModel[]; expiresAt: number } | null = null;

  constructor(options: OpenRouterCatalogueOptions = {}) {
    this.fetchImpl = options.fetch;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CATALOG_TTL_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_CATALOG_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
  }

  clearCache(): void {
    this.cached = null;
  }

  async list(): Promise<OpenRouterCatalogModel[]> {
    if (this.cached && this.cached.expiresAt > this.now()) return this.cached.models;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const send = this.fetchImpl ?? globalThis.fetch;
      const response = await send(OPENROUTER_MODELS_URL, { signal: controller.signal });
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

/** Shared by everything that just wants today's published price. */
const publishedCatalogue = new OpenRouterCatalogue();

/** Test seam: forget the published price list. */
export function forgetPublishedRates(): void {
  publishedCatalogue.clearCache();
}

function parseRatePerMillion(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  // Rounded because the multiplication does not land where it should:
  // 0.0000002 * 1_000_000 is 0.19999999999999998 in binary floating point. Six
  // decimals is finer than any published rate, and leaving the drift in would
  // put it in a ceiling that is then compared against endpoint prices.
  return Number((parsed * 1_000_000).toFixed(6));
}

/**
 * What OpenRouter publishes for this model right now, in dollars per million.
 *
 * `undefined` for a model the catalogue does not list, a free leg, or a
 * catalogue we could not read — all three mean "no live number", and the caller
 * decides what to do about it rather than receiving a guess.
 */
export async function getPublishedModelRate(
  model: string
): Promise<{ prompt: number; completion: number } | undefined> {
  let models: OpenRouterCatalogModel[];
  try {
    models = await publishedCatalogue.list();
  } catch (error) {
    logger.debug(
      { model, error: error instanceof Error ? error.message : String(error) },
      '[Routing] Could not read the published price list'
    );
    return undefined;
  }

  const entry = models.find(candidate => candidate.id === model);
  if (!entry) return undefined;

  const prompt = parseRatePerMillion(entry.pricing.prompt);
  const completion = parseRatePerMillion(entry.pricing.completion);
  if (prompt === null || completion === null) return undefined;

  return { prompt, completion };
}

/**
 * The most a provider may charge for this model, from the live price list.
 *
 * Falls back to {@link buildProviderPriceCeiling} — the frozen catalogue — when
 * the live number is unavailable, because a request with no ceiling at all is
 * what this exists to prevent. `scripts/check-model-catalog-drift.ts` is what
 * keeps that fallback honest.
 */
export async function resolveProviderPriceCeiling(
  model: string,
  multiplier: number
): Promise<{ prompt: number; completion: number } | undefined> {
  const published = await getPublishedModelRate(model);
  if (!published) return buildProviderPriceCeiling(model, multiplier);

  return {
    prompt: Number((published.prompt * multiplier).toFixed(6)),
    completion: Number((published.completion * multiplier).toFixed(6)),
  };
}
