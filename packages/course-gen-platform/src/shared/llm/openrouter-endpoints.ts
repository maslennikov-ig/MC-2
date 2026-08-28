/**
 * Which endpoint serves an attempt, decided here rather than discovered after.
 *
 * The problem this exists for, measured on the paid run of 2026-08-21: a call
 * timed out after 238s, and the chain could not route around the provider that
 * had just hung, because it had no idea who that was. `provider_name` only ever
 * arrives from `GET /api/v1/generation`, and that record is not readable while
 * the upstream call is still running — the very situation a timeout is. The
 * retry went back to the same provider and spent another 504s (mc2-6crnj).
 *
 * Three routes were measured before this one was chosen:
 *
 * - **A response header.** OpenRouter advertises `X-Provider-Name` in
 *   `access-control-expose-headers` and does not send it, in either streaming or
 *   non-streaming mode.
 * - **The response body.** `provider` is in the body, and in every SSE chunk —
 *   but the body of a call that hangs never arrives, and the call that failed
 *   produced zero output tokens in 238s, so no chunk would have arrived either.
 *   It is also undocumented.
 * - **Choosing the endpoint ourselves.** Documented, and it cannot fail to name
 *   the provider, because naming it is the request.
 *
 * So an attempt is pinned: `provider.order` with one endpoint tag and
 * `allow_fallbacks: false`, which the docs describe as guaranteeing the request
 * is served by that one. A failure of any kind — timeout, silence, 5xx — is then
 * attributable without asking anyone, and the next attempt takes the next
 * cheapest endpoint.
 *
 * Cheapest stays the goal (owner, 2026-08-20): the list is sorted by the live
 * prompt price and the first attempt goes where OpenRouter's own default routing
 * would have sent it. Nothing is remembered between calls — the exclusion is the
 * set of endpoints this chain has already tried, and it dies with the chain.
 *
 * @module shared/llm/openrouter-endpoints
 */

import { getApiKeySync } from '../services/api-key-service';
import { OPENROUTER_BASE_URL } from './openrouter-client';
import type { ServiceTier } from './service-tier';
import logger from '../logger';

/**
 * How long a fetched endpoint list is reused.
 *
 * Prices and health move slowly against the length of one generation, and a
 * lookup in front of every attempt would put a third party between us and every
 * call — the thing `buildProviderPriceCeiling` deliberately refuses to do. A
 * stale entry costs at most one wasted attempt, which the chain already handles.
 */
export const ENDPOINT_CACHE_TTL_MS = 5 * 60_000;

/**
 * The service tier an endpoint belongs to, read from its tag.
 *
 * `priority` is not a {@link ServiceTier} we route to, but it has to be
 * nameable: it is the double-price endpoint, and the only way to keep the price
 * sort from ever choosing it is to recognise it.
 */
export type EndpointTier = ServiceTier | 'priority';

/**
 * The tag suffixes that mean a service tier, exhaustively.
 *
 * Matched against a fixed list rather than "whatever follows the last slash",
 * because most of what follows a slash is not a tier: the live catalogue carries
 * `sail-research/fp4` and `open-inference/fp4` (quantisation), `azure/eu` and
 * `azure/us` (region), and `google-vertex/global/flex` (both, then a tier).
 * Treating any suffix as a tier would classify an fp4 endpoint as one and
 * quietly refuse it.
 */
const TIER_SUFFIXES: ReadonlyMap<string, EndpointTier> = new Map<string, EndpointTier>([
  ['flex', 'flex'],
  ['priority', 'priority'],
]);

/** One provider endpoint for one model, as `/endpoints` reports it. */
export interface ModelEndpoint {
  /** What `provider.order` takes, e.g. `sail-research/fp4`. */
  tag: string;
  /** Display name, for the log line a human reads. */
  providerName: string;
  /** Dollars per million prompt tokens, live. */
  promptPricePerMillion: number;
  /** Dollars per million completion tokens, live. */
  completionPricePerMillion: number;
  /** OpenRouter's own health figure; below zero is degraded or disabled. */
  status: number;
  /**
   * Median completion tokens per second over the last 30 minutes, or `null`
   * when the endpoint publishes none.
   *
   * `null` means "not stated", never "slow": a new endpoint has no history, and
   * refusing it for that would freeze routing onto whoever is already busy.
   */
  throughputTokensPerSecond: number | null;
  /** Which service tier this endpoint is, from its tag. */
  tier: EndpointTier;
}

/** The service tier an endpoint tag names, or `default` when it names none. */
export function readEndpointTier(tag: string): EndpointTier {
  const suffix = tag.slice(tag.lastIndexOf('/') + 1);
  return TIER_SUFFIXES.get(suffix) ?? 'default';
}

interface CacheEntry {
  endpoints: ModelEndpoint[];
  fetchedAtMs: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ModelEndpoint[]>>();
/**
 * `~alias` → the snapshot it serves, for the life of the process.
 *
 * Not time-bounded like the endpoint cache: the endpoints of a model change with
 * its providers, and an alias moves when its family gets a new member. A worker
 * restarts often enough, and a move that a restart picks up is a move that gets
 * logged.
 */
const aliasTargets = new Map<string, string>();

/** Test seam: forget every fetched list, and every alias resolved from one. */
export function forgetModelEndpoints(): void {
  cache.clear();
  inFlight.clear();
  aliasTargets.clear();
}

function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  // `/endpoints` reports prices as strings of dollars per token.
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

/**
 * The median of `throughput_last_30m`.
 *
 * It is an **object** — `{p50, p75, p90, p99}` — not a number, which is worth
 * stating because reading it with `Number()` yields `NaN` and makes a fully
 * populated field look empty. `uptime_last_30m`, right beside it, *is* a number.
 * A plain number is still accepted here in case the shape changes back.
 *
 * p50 rather than p90: the question is what a typical call gets, and p90 would
 * let one good half-hour excuse a provider that is usually slow.
 */
function readThroughput(record: Record<string, unknown>): number | null {
  const raw = record.throughput_last_30m;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'object' && raw !== null) {
    return readNumber(raw as Record<string, unknown>, 'p50');
  }
  return null;
}

function parseEndpoint(raw: unknown): ModelEndpoint | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;

  const tag = typeof record.tag === 'string' && record.tag.length > 0 ? record.tag : null;
  if (!tag) return null;

  const pricing = record.pricing;
  if (typeof pricing !== 'object' || pricing === null) return null;
  const prompt = readNumber(pricing as Record<string, unknown>, 'prompt');
  const completion = readNumber(pricing as Record<string, unknown>, 'completion');
  if (prompt === null || completion === null) return null;

  return {
    tag,
    providerName: typeof record.provider_name === 'string' ? record.provider_name : tag,
    // Reported per token; the rest of this codebase speaks per million.
    promptPricePerMillion: prompt * 1_000_000,
    completionPricePerMillion: completion * 1_000_000,
    status: readNumber(record, 'status') ?? 0,
    throughputTokensPerSecond: readThroughput(record),
    tier: readEndpointTier(tag),
  };
}

/**
 * What a `~…-latest` alias points at right now.
 *
 * `/models/{alias}/endpoints` answers **200 with an empty list** — measured
 * 2026-08-22: 0 for `~deepseek/deepseek-v4-flash-latest`, 30 for
 * `deepseek/deepseek-v4-flash-0731`, 17 for the undated slug. An empty list is
 * indistinguishable from "could not find out", so routing on an alias silently
 * turns off the per-attempt endpoint pin — the thing that on 2026-08-22 moved
 * two hung 238s calls onto a working provider instead of back onto the same one.
 *
 * OpenRouter names the target itself: the alias's `/models` entry carries
 * `alias_target.slug`. So the alias is followed, as the owner asked, and the
 * pin, the price ceiling and the receipt keep working against the concrete
 * snapshot. Nothing is inferred from context length or price.
 *
 * Only the endpoint lookup needs this. A request may name the alias directly and
 * be served correctly — verified live, including with `provider.order` pinned to
 * an endpoint of the resolved snapshot.
 */
async function resolveAliasTarget(modelId: string, apiKey: string): Promise<string> {
  if (!modelId.startsWith('~')) return modelId;

  const cached = aliasTargets.get(modelId);
  if (cached) return cached;

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) return modelId;

    const payload = (await response.json()) as {
      data?: Array<{ id?: string; alias_target?: { slug?: string } }>;
    };
    const slug = payload.data?.find(entry => entry.id === modelId)?.alias_target?.slug;
    if (!slug) return modelId;

    aliasTargets.set(modelId, slug);
    logger.info({ modelId, slug }, '[Routing] Alias resolved to the snapshot it serves today');
    return slug;
  } catch {
    // An unresolved alias is the old behaviour, not a failure.
    return modelId;
  }
}

async function requestEndpoints(modelId: string): Promise<ModelEndpoint[]> {
  // Synchronous on purpose. The caller is about to make a paid call, so the key
  // has already been resolved database-first and cached; going back to the
  // database here would add a round trip to every chain and would disturb the
  // client's own once-only initialisation. No key means no pin, which is a
  // degradation and never a failure.
  const apiKey = getApiKeySync('openrouter');
  if (!apiKey) return [];

  // An alias has no endpoints of its own; ask the snapshot it points at.
  const resolved = await resolveAliasTarget(modelId, apiKey);

  // The path is `/models/{author}/{slug}/endpoints`, so the model id goes in
  // whole and only its segments are escaped.
  const path = resolved
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');

  const response = await fetch(`${OPENROUTER_BASE_URL}/models/${path}/endpoints`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    logger.debug(
      { modelId, status: response.status },
      '[Routing] Could not list the endpoints for this model; leaving the choice to OpenRouter'
    );
    return [];
  }

  const payload = (await response.json()) as { data?: { endpoints?: unknown[] } };
  const endpoints = (payload.data?.endpoints ?? [])
    .map(parseEndpoint)
    .filter((endpoint): endpoint is ModelEndpoint => endpoint !== null)
    .sort((left, right) => left.promptPricePerMillion - right.promptPricePerMillion);

  return endpoints;
}

/**
 * The endpoints serving a model, cheapest first.
 *
 * Never throws and never blocks a generation: an empty list means "we could not
 * find out", and the caller falls back to letting OpenRouter route, which is
 * what happened before any of this existed.
 */
export async function listModelEndpoints(
  modelId: string,
  nowMs: number = Date.now()
): Promise<ModelEndpoint[]> {
  const cached = cache.get(modelId);
  if (cached && nowMs - cached.fetchedAtMs < ENDPOINT_CACHE_TTL_MS) return cached.endpoints;

  const existing = inFlight.get(modelId);
  if (existing) return existing;

  const pending = requestEndpoints(modelId)
    .catch(error => {
      logger.debug(
        { modelId, error: error instanceof Error ? error.message : String(error) },
        '[Routing] Endpoint lookup failed; leaving the choice to OpenRouter'
      );
      return [] as ModelEndpoint[];
    })
    .then(endpoints => {
      // A failed lookup is not cached: the next attempt should be free to try
      // again rather than inherit five minutes of blindness.
      if (endpoints.length > 0) cache.set(modelId, { endpoints, fetchedAtMs: nowMs });
      inFlight.delete(modelId);
      return endpoints;
    });

  inFlight.set(modelId, pending);
  return pending;
}

/**
 * What a model actually costs at one tier, or `undefined` if it has no healthy
 * endpoint there.
 *
 * "No endpoint there" is a real answer and not a lookup failure, and the
 * difference matters: `openai/gpt-5.6-luna:batch` publishes a flex endpoint at
 * $0.05/$0.30 and `z-ai/glm-5.2` publishes none at all. Anything deciding
 * whether a cheaper route exists has to be able to tell those apart rather than
 * assume a tier multiplier applies everywhere.
 */
export function cheapestEndpointAtTier(
  endpoints: readonly ModelEndpoint[],
  tier: ServiceTier
): ModelEndpoint | undefined {
  // The list arrives sorted by prompt price, so the first match is the cheapest.
  return endpoints.find(endpoint => endpoint.tier === tier && endpoint.status >= 0);
}

/**
 * The slowest endpoint worth the first attempt, in completion tokens per second.
 *
 * Derived, not chosen. The largest ordinary Stage 6 output budget is 8000 tokens
 * and the phase config gives that call 300 s (`stage6-model-config.ts`), so an
 * endpoint has to sustain ~27 tok/s just to finish inside its own timeout. 30 is
 * that with a little air.
 *
 * What it excludes, measured 2026-08-28 against the live `/endpoints` lists: the
 * first attempt for `deepseek/deepseek-v4-flash-0731` — the model most of the
 * pipeline runs on — was going to `open-inference/fp4`, cheapest at $0.030/1M
 * and **9 tok/s**. At that rate an 8000-token lesson needs 15 minutes and the
 * 300 s timeout kills it first. The next endpoint up, `relace/fp4`, is $0.060
 * and 100 tok/s: eleven times faster for three hundredths of a cent per million
 * input tokens. `z-ai/glm-5.2` has the same shape — `sail-research/fp8` and
 * `morph/fp4` both sit at 14 tok/s under a third of the list.
 *
 * This is the missing half of the 2026-08-21 incident. Pinning an attempt made a
 * hung provider *attributable* (mc2-6crnj); it did nothing to stop us choosing
 * the slow one first, every time, because price was the only sort key.
 *
 * Uptime is deliberately not part of this (owner, 2026-08-27): an endpoint that
 * is down fails its attempt and the chain moves on, which already works. Being
 * consistently slow is different — it does not fail, it just takes the whole
 * budget.
 */
export const MIN_ENDPOINT_THROUGHPUT_TPS = 30;

/**
 * True when an endpoint is quick enough to be worth trying first.
 *
 * An endpoint with no published figure passes. "Not stated" is not "slow", and a
 * new provider has no 30-minute history — refusing it would pin routing to
 * whoever is already established.
 */
function isFastEnough(endpoint: ModelEndpoint): boolean {
  return (
    endpoint.throughputTokensPerSecond === null ||
    endpoint.throughputTokensPerSecond >= MIN_ENDPOINT_THROUGHPUT_TPS
  );
}

/**
 * The cheapest of a price-sorted group that can keep up, or its cheapest member.
 *
 * The second half matters as much as the first: a floor able to refuse every
 * endpoint is a floor able to stop a generation, and no throughput figure is
 * worth that. A slow route beats no route.
 */
function cheapestFastEnough(group: readonly ModelEndpoint[]): ModelEndpoint | undefined {
  return group.find(isFastEnough) ?? group[0];
}

/**
 * The cheapest endpoint this chain has not tried yet, within the tier it may use.
 *
 * Skips what OpenRouter's own routing skips — a negative `status` is degraded or
 * disabled — so the first attempt lands where the default route would have sent
 * it. On 2026-08-20 the same model's two cheapest endpoints were priced
 * identically and OpenRouter passed over the one at status `-2`; picking it
 * ourselves would have been a change of behaviour dressed as a fix.
 *
 * `allowedTier` is the one thing the price sort must not decide for itself. A
 * flex endpoint is half the price and therefore always first, so without this
 * every call in the pipeline — including the chat box — would move to a tier
 * that refuses rather than falls back the moment OpenRouter published the tags.
 * `priority` is excluded whatever is asked for: it is double the price, and
 * nothing here is worth that to answer sooner.
 *
 * Degradation needs no special case. A flex endpoint that refuses for capacity
 * fails its attempt like any other, and the next attempt takes the next cheapest
 * untried endpoint, which is the default-tier one.
 *
 * The ceiling is applied here, against the live price, rather than left to
 * `provider.max_price` alone: a pinned endpoint the ceiling then refuses costs a
 * whole attempt, and the ceiling is built from a catalogue that drifts.
 *
 * Cheapest is still the goal, but cheapest **among those that can finish** —
 * see {@link MIN_ENDPOINT_THROUGHPUT_TPS}. When nothing clears the floor the
 * cheapest eligible endpoint is returned anyway: a slow route beats no route.
 */
export function pickCheapestUntriedEndpoint(
  endpoints: ModelEndpoint[],
  triedTags: ReadonlySet<string>,
  ceiling?: { prompt?: number; completion?: number },
  allowedTier: ServiceTier = 'default'
): ModelEndpoint | undefined {
  const eligible = endpoints.filter(endpoint => {
    if (triedTags.has(endpoint.tag)) return false;
    if (endpoint.status < 0) return false;
    if (endpoint.tier === 'priority') return false;
    if (endpoint.tier === 'flex' && allowedTier !== 'flex') return false;
    if (ceiling?.prompt !== undefined && endpoint.promptPricePerMillion > ceiling.prompt) {
      return false;
    }
    if (
      ceiling?.completion !== undefined &&
      endpoint.completionPricePerMillion > ceiling.completion
    ) {
      return false;
    }
    return true;
  });

  // The floor applies **within** the tier that was asked for, never across it.
  // `openai/flex` serves Luna at $0.10/1M and 26 tok/s against `azure` at $0.20
  // and 68: a floor allowed to reach across tiers would answer a deliberate
  // request for half price by doubling it. Flex is an opt-in with a known
  // trade, and speed is not the term being traded.
  //
  // Falling through from an exhausted flex group to the default one is the
  // documented behaviour and unchanged: a flex endpoint that refuses for
  // capacity fails its attempt, and the next attempt finds the group empty.
  const flex = eligible.filter(endpoint => endpoint.tier === 'flex');
  const standard = eligible.filter(endpoint => endpoint.tier !== 'flex');

  return (
    (allowedTier === 'flex' ? cheapestFastEnough(flex) : undefined) ?? cheapestFastEnough(standard)
  );
}
