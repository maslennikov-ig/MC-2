/**
 * Contract: the generation lookup waits for the record instead of guessing.
 *
 * `GET /api/v1/generation` answers 404 for about ten seconds after a call
 * completes, then returns it. Measured against the live API on 2026-08-21.
 *
 * The first implementation read once after 1.5s and accepted `null`. It was
 * correct in every unit test and wrong in production: a 33-node paid run settled
 * exactly zero rows against the provider, and every one kept its catalogue
 * estimate while the code reported the feature as working. This test is the one
 * that would have caught it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => {
  const noop = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
  return { logger: { ...noop, child: () => noop }, default: { ...noop, child: () => noop } };
});
vi.mock('@/shared/services/api-key-service', () => ({
  getOpenRouterApiKey: async () => 'test-key',
  getApiKeySync: () => 'test-key',
}));

import { fetchGenerationFact } from '@/shared/llm/openrouter-generation';

const RECORD = {
  data: {
    usage: 0.006444801,
    native_tokens_prompt: 12437,
    native_tokens_completion: 2834,
    cancelled: false,
    finish_reason: 'stop',
    model: 'openai/gpt-5.6-luna-20260709',
    router: null,
    provider_name: 'OpenAI',
  },
};

/** 404 until `readyAfter` calls, then the record — the shape OpenRouter has. */
function fetchThatBecomesReadable(readyAfter: number) {
  let calls = 0;
  return vi.fn(async () => {
    calls += 1;
    return calls <= readyAfter
      ? new Response('not found', { status: 404 })
      : new Response(JSON.stringify(RECORD), { status: 200 });
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fetchGenerationFact', () => {
  it('keeps asking across the ten seconds the record takes to appear', async () => {
    const stub = fetchThatBecomesReadable(4);
    vi.stubGlobal('fetch', stub);

    const pending = fetchGenerationFact('gen-slow');
    await vi.advanceTimersByTimeAsync(15_000);
    const fact = await pending;

    expect(fact?.usageUsd).toBe(0.006444801);
    expect(fact?.providerName).toBe('OpenAI');
    // One read would have returned null, which is what shipped and what failed.
    expect(stub.mock.calls.length).toBeGreaterThan(1);
  });

  it('gives up once its budget is spent and lets the estimate stand', async () => {
    const stub = vi.fn(async () => new Response('not found', { status: 404 }));
    vi.stubGlobal('fetch', stub);

    const pending = fetchGenerationFact('gen-never', { maxWaitMs: 6_000 });
    await vi.advanceTimersByTimeAsync(30_000);

    expect(await pending).toBeNull();
  });

  it('reads a genuine $0 charge as a measurement, not as an absence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: { ...RECORD.data, usage: 0 } }), { status: 200 })
      )
    );

    const pending = fetchGenerationFact('gen-free');
    await vi.advanceTimersByTimeAsync(10_000);

    // `0` and `null` mean different things, and conflating them corrupted the
    // unpriced-rows metric once already (mc2-y452l).
    expect((await pending)?.usageUsd).toBe(0);
  });
});
