/**
 * What OpenRouter says a call actually cost, and who actually served it.
 *
 * `GET /api/v1/generation?id=<x-generation-id>` answers with the provider's own
 * figures: `usage` is the amount charged, not our estimate of it, and
 * `provider_name` is the endpoint that took the request. Both are unavailable
 * from the completion body alone, and both are still available after a call we
 * aborted — the generation record outlives our connection.
 *
 * Why this file exists rather than another price table: `MODEL_CATALOG` was
 * measured wrong in three places at once on 2026-08-20 — `openai/gpt-5.6-luna`
 * at exactly half its tariff, `z-ai/glm-5.2` 1.23x too dear,
 * `~deepseek/deepseek-v4-flash-latest` 1.45x too dear — and a $0.077338 ledger
 * faced a $0.144177 invoice with no way to say which calls were wrong
 * (mc2-z0xr3). A catalogue is a plan; this is the receipt.
 *
 * Everything here is best-effort and never throws. Accounting must not be able
 * to fail a generation, and routing must not be able to fail one either.
 */

import logger from '../logger';
import { getOpenRouterApiKey } from '../services/api-key-service';

const OPENROUTER_API = 'https://openrouter.ai/api/v1';

/**
 * How long a generation record takes to become readable, and how long we wait.
 *
 * Measured against the live API on 2026-08-21: `GET /api/v1/generation` answered
 * 404 for **9.6 seconds** after the call completed, then returned the record.
 * The first implementation waited 1.5s once, and so missed every single lookup
 * of a 33-node paid run — every row kept its catalogue estimate while reporting
 * itself as settled. The delay is why this polls rather than guessing an
 * interval.
 *
 * 30s of patience against a ~10s answer, because the alternative to waiting is
 * an unpriced row, and nothing here is on a path a user is waiting on.
 */
const GENERATION_LOOKUP_DELAY_MS = 2_000;
const GENERATION_LOOKUP_INTERVAL_MS = 2_000;
const GENERATION_LOOKUP_MAX_WAIT_MS = 30_000;
const GENERATION_LOOKUP_TIMEOUT_MS = 15_000;

/** The provider's own account of one call. */
export interface OpenRouterGenerationFact {
  generationId: string;
  /** Dollars OpenRouter charged. `0` is a measurement; `null` is an absence. */
  usageUsd: number | null;
  nativeTokensPrompt: number | null;
  nativeTokensCompletion: number | null;
  cancelled: boolean;
  finishReason: string | null;
  /** The snapshot actually served, e.g. `deepseek/deepseek-v4-flash-20260731`. */
  model: string | null;
  /** The alias asked for, when one was used. */
  router: string | null;
  /** Display name, e.g. `Sail Research`. Not the slug — see {@link resolveProviderSlug}. */
  providerName: string | null;
}

/**
 * A wait that keeps the process alive while something is waiting on it.
 *
 * This timer used to be `unref`'d, and that is a promise Node is allowed to
 * abandon: if nothing else holds the event loop, the loop is considered empty,
 * `beforeExit` fires and the process leaves with code 0 while this `await` is
 * still pending. Every caller here is inside `await`, so an abandoned timer is
 * an abandoned caller.
 *
 * That is not theoretical (mc2-avjau). A Career Playbook attempt on
 * `group_6_wrap` timed out at its configured 238 s; the failure handler asked
 * for the generation record; this slept 2 s before the first read; the aborted
 * request had already closed the only socket, so at that instant nothing was
 * left. Measured 2026-08-23: `beforeExit code=0` at 243.0 s with two stdio pipes
 * as the only live resources. No result, no error, no timeout message — exit 0,
 * which a caller reads as success. Four runs, four times.
 *
 * It only ever showed in a one-shot script: a worker holds queue sockets and
 * interval timers, so the loop is never empty there and the same lookup
 * completes. The bound is `GENERATION_LOOKUP_MAX_WAIT_MS`, which caps the whole
 * lookup at 30 s — a real bound, unlike a timer nothing is obliged to run.
 */
function sleep(ms: number, keepProcessAlive: boolean): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    if (!keepProcessAlive) timer.unref?.();
  });
}

function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  // `??`, not `||`: a genuine zero is a measurement. Filing it as "not measured"
  // is the bug that corrupted the unpriced-rows metric once already (mc2-y452l).
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function requestGeneration(
  generationId: string,
  apiKey: string
): Promise<OpenRouterGenerationFact | null> {
  const response = await fetch(
    `${OPENROUTER_API}/generation?id=${encodeURIComponent(generationId)}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(GENERATION_LOOKUP_TIMEOUT_MS),
    }
  );

  // 404 while the record is still being written is the expected first answer,
  // not an error worth logging at warn.
  if (!response.ok) return null;

  const body = (await response.json()) as { data?: Record<string, unknown> };
  const data = body?.data;
  if (!data || typeof data !== 'object') return null;

  return {
    generationId,
    usageUsd: readNumber(data, 'usage'),
    nativeTokensPrompt: readNumber(data, 'native_tokens_prompt'),
    nativeTokensCompletion: readNumber(data, 'native_tokens_completion'),
    cancelled: data.cancelled === true,
    finishReason: readString(data, 'finish_reason'),
    model: readString(data, 'model'),
    router: readString(data, 'router'),
    providerName: readString(data, 'provider_name'),
  };
}

/** How patient a particular lookup is allowed to be. */
export interface GenerationLookupOptions {
  /** Wait before the first read, so it does not race the record being written. */
  initialDelayMs?: number;
  /** Total time to keep asking before giving up and letting the estimate stand. */
  maxWaitMs?: number;
  /**
   * Whether the wait between reads holds the event loop open. Default true,
   * because the default caller is `await`ing the answer and an abandoned wait
   * abandons them with it — see {@link sleep}.
   *
   * `false` belongs to exactly one shape: a caller that scheduled this in the
   * background and will not read the result, where "a receipt still to be
   * collected is not a reason to keep a process alive" still holds. There the
   * cost of losing it is a trace row that keeps its catalogue estimate; here it
   * was a run that reported success without producing anything.
   */
  keepProcessAlive?: boolean;
}

/**
 * The generation record for one call, or `null` if it never became readable.
 *
 * Never throws. Polls, because the record takes about ten seconds to appear and
 * a single read is a coin toss — see the constants above for what happened when
 * this guessed instead of waiting.
 */
export async function fetchGenerationFact(
  generationId: string,
  options: GenerationLookupOptions = {}
): Promise<OpenRouterGenerationFact | null> {
  try {
    const apiKey = await getOpenRouterApiKey();
    if (!apiKey) return null;

    const deadline = Date.now() + (options.maxWaitMs ?? GENERATION_LOOKUP_MAX_WAIT_MS);
    const keepProcessAlive = options.keepProcessAlive ?? true;
    await sleep(options.initialDelayMs ?? GENERATION_LOOKUP_DELAY_MS, keepProcessAlive);

    for (;;) {
      const fact = await requestGeneration(generationId, apiKey);
      if (fact) return fact;
      if (Date.now() >= deadline) return null;
      await sleep(GENERATION_LOOKUP_INTERVAL_MS, keepProcessAlive);
    }
  } catch (error) {
    logger.debug(
      { error: error instanceof Error ? error.message : String(error), generationId },
      '[OpenRouter] Could not read the generation record'
    );
    return null;
  }
}

/**
 * Display name -> routing slug, because `provider.ignore` takes the slug.
 *
 * These are not the same string and cannot be derived from one another:
 * `OpenInference` is `open-inference`, `Sail Research` is `sail-research`,
 * `AtlasCloud` is `atlas-cloud`. Lower-casing the display name produces
 * `openinference`, which OpenRouter does not recognise — and an unrecognised
 * slug is skipped silently, so ignoring by display name would look implemented
 * and do nothing.
 */
let providerSlugsByName: Map<string, string> | null = null;
let providerSlugsInFlight: Promise<Map<string, string> | null> | null = null;

async function loadProviderSlugs(): Promise<Map<string, string> | null> {
  try {
    const response = await fetch(`${OPENROUTER_API}/providers`, {
      signal: AbortSignal.timeout(GENERATION_LOOKUP_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const body = (await response.json()) as { data?: Array<Record<string, unknown>> };
    const rows = body?.data;
    if (!Array.isArray(rows)) return null;

    const map = new Map<string, string>();
    for (const row of rows) {
      const name = readString(row, 'name');
      const slug = readString(row, 'slug');
      if (name && slug) map.set(name.toLowerCase(), slug);
    }
    return map.size > 0 ? map : null;
  } catch (error) {
    logger.debug(
      { error: error instanceof Error ? error.message : String(error) },
      '[OpenRouter] Could not read the provider list'
    );
    return null;
  }
}

/**
 * The slug `provider.ignore` expects for a provider display name.
 *
 * Falls back to the display name when the list is unreachable or the name is
 * unknown. Measured against the live API on 2026-08-21: `ignore` accepted the
 * display name, the slug and a naive lower-cased form alike, all three
 * excluding the named providers. The slug is still what the documentation
 * specifies and what this sends by preference — but since the lenient forms
 * work, falling back to one beats sending nothing and silently keeping a
 * failed provider in the pool.
 */
export async function resolveProviderSlug(displayName: string): Promise<string | null> {
  if (!displayName) return null;

  if (!providerSlugsByName) {
    providerSlugsInFlight ??= loadProviderSlugs();
    providerSlugsByName = await providerSlugsInFlight;
    providerSlugsInFlight = null;
  }

  return providerSlugsByName?.get(displayName.toLowerCase()) ?? displayName;
}

/** Test seam: forget the cached provider list. */
export function resetProviderSlugCache(): void {
  providerSlugsByName = null;
  providerSlugsInFlight = null;
}
