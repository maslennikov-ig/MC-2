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
 * The cheapest endpoint this chain has not tried yet.
 *
 * Skips what OpenRouter's own routing skips — a negative `status` is degraded or
 * disabled — so the first attempt lands where the default route would have sent
 * it. On 2026-08-20 the same model's two cheapest endpoints were priced
 * identically and OpenRouter passed over the one at status `-2`; picking it
 * ourselves would have been a change of behaviour dressed as a fix.
 *
 * The ceiling is applied here, against the live price, rather than left to
 * `provider.max_price` alone: a pinned endpoint the ceiling then refuses costs a
 * whole attempt, and the ceiling is built from a catalogue that drifts.
 */
export function pickCheapestUntriedEndpoint(
  endpoints: ModelEndpoint[],
  triedTags: ReadonlySet<string>,
  ceiling?: { prompt?: number; completion?: number }
): ModelEndpoint | undefined {
  return endpoints.find(endpoint => {
    if (triedTags.has(endpoint.tag)) return false;
    if (endpoint.status < 0) return false;
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
}
