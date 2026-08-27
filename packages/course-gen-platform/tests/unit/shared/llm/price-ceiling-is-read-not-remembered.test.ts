/**
 * Contract: the price ceiling comes from today's published rate, and never from
 * a number that can quietly go stale.
 *
 * `MODEL_CATALOG` holds one hand-frozen rate per model. On 2026-08-25 two of
 * them had drifted low — `deepseek-v4-flash-0731` at 0.08 against a published
 * 0.14, `z-ai/glm-5.2` at 0.966 against 1.19. That was harmless right up until
 * the morning of the same day, when routing moved out of the `extra_body`
 * envelope and `provider.max_price` started reaching OpenRouter for the first
 * time (mc2-5pt54). A ceiling is catalogue x 1.5; built from a stale low rate it
 * narrows the provider pool silently, and low enough it refuses every endpoint
 * and fails the call outright (mc2-qch4w).
 *
 * The rule itself is unchanged — published rate times a multiplier. Checked
 * against the live endpoint distributions on all seven configured models before
 * choosing it: it reproduces the catalogue ceiling exactly today, and `cheapest
 * x 1.5` would have admitted 2 of deepseek's 24 endpoints and 1 of luna's 4,
 * starving the retry chain of anywhere to go.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  OpenRouterCatalogue,
  forgetPublishedRates,
  getPublishedModelRate,
  resolveProviderPriceCeiling,
} from '@/shared/llm/openrouter-catalogue';
import { buildProviderPriceCeiling } from '@/shared/llm/client-helpers';

const LUNA = 'openai/gpt-5.6-luna';

/**
 * A fresh Response per call. A `Response` body can only be read once, so a
 * mock that resolves the same object twice fails on the second read with
 * "Body is unusable" — which looks like a caching bug and is not one.
 */
function catalogueResponse(
  models: Array<{ id: string; prompt: string; completion: string }>
): Response {
  return new Response(
    JSON.stringify({
      data: models.map(model => ({
        id: model.id,
        context_length: 1_000_000,
        pricing: { prompt: model.prompt, completion: model.completion },
      })),
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  forgetPublishedRates();
});

describe('the published rate', () => {
  it('is read from OpenRouter and reported per million tokens', async () => {
    // `/models` reports dollars per token; everything else here speaks per
    // million, and mixing the two is a factor of a million in a price ceiling.
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() =>
          catalogueResponse([{ id: LUNA, prompt: '0.0000002', completion: '0.0000012' }])
        )
    );

    await expect(getPublishedModelRate(LUNA)).resolves.toEqual({ prompt: 0.2, completion: 1.2 });
  });

  it('is absent for a model the catalogue does not list', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() =>
          catalogueResponse([{ id: LUNA, prompt: '0.0000002', completion: '0.0000012' }])
        )
    );

    await expect(getPublishedModelRate('vendor/not-listed')).resolves.toBeUndefined();
  });

  it('is absent for a free leg, which would read as "free providers only"', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() => catalogueResponse([{ id: LUNA, prompt: '0', completion: '0' }]))
    );

    await expect(getPublishedModelRate(LUNA)).resolves.toBeUndefined();
  });

  it('is fetched once and reused, not asked for in front of every attempt', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        catalogueResponse([{ id: LUNA, prompt: '0.0000002', completion: '0.0000012' }])
      );
    vi.stubGlobal('fetch', fetchMock);

    await getPublishedModelRate(LUNA);
    await getPublishedModelRate(LUNA);
    await getPublishedModelRate('vendor/other');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('the ceiling', () => {
  it('follows the published rate rather than the frozen catalogue', async () => {
    // The catalogue prices luna at 0.20/1.20. Publish something else and the
    // ceiling must move with it — that movement is the whole point.
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() =>
          catalogueResponse([{ id: LUNA, prompt: '0.00000031', completion: '0.0000019' }])
        )
    );

    await expect(resolveProviderPriceCeiling(LUNA, 1.5)).resolves.toEqual({
      prompt: 0.465,
      completion: 2.85,
    });
    expect(buildProviderPriceCeiling(LUNA, 1.5)).toEqual({ prompt: 0.3, completion: 1.8 });
  });

  it('falls back to the frozen catalogue when the price list cannot be read', async () => {
    // A request with no ceiling at all is what this exists to prevent, so an
    // unreachable catalogue degrades to the frozen rate rather than to nothing.
    // `scripts/check-model-catalog-drift.ts` is what keeps that fallback honest.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(resolveProviderPriceCeiling(LUNA, 1.5)).resolves.toEqual({
      prompt: 0.3,
      completion: 1.8,
    });
  });

  it('is absent for a model neither source prices exactly', async () => {
    // A dated snapshot or a `~` alias is priced from its base model, whose own
    // tariff can differ. A ceiling below every real endpoint refuses the whole
    // model, so guessing here turns a pricing error into a failed generation.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(
      resolveProviderPriceCeiling('deepseek/deepseek-v4-flash-20260731', 1.5)
    ).resolves.toBeUndefined();
  });
});

describe('the catalogue itself', () => {
  it('refuses an empty list rather than treating it as "no models exist"', async () => {
    const catalogue = new OpenRouterCatalogue({
      fetch: vi.fn().mockImplementation(() => catalogueResponse([])),
    });

    await expect(catalogue.list()).rejects.toThrow('empty');
  });

  it('re-fetches once its cache has expired', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        catalogueResponse([{ id: LUNA, prompt: '0.0000002', completion: '0.0000012' }])
      );
    let clock = 0;
    const catalogue = new OpenRouterCatalogue({
      fetch: fetchMock,
      cacheTtlMs: 1_000,
      now: () => clock,
    });

    await catalogue.list();
    clock = 999;
    await catalogue.list();
    clock = 1_001;
    await catalogue.list();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
