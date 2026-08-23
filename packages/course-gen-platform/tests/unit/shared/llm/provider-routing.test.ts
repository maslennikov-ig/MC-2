/**
 * Contract: we know who served a call, and we route around whoever failed it —
 * for this call only.
 *
 * Three separate things are pinned here, because each of them has a silent
 * failure mode that looks exactly like success:
 *
 * 1. `x-generation-id` is read from the response headers, not the body, so an
 *    attempt that we abort still leaves one. Read it from the body and every
 *    timed-out call goes back to being invisible, which is what made the
 *    2026-08-20 ledger 46% short of the invoice (mc2-64n8i).
 * 2. `provider.ignore` takes a routing *slug*, and the generation record reports
 *    a *display name*. `OpenInference` is `open-inference`; lower-casing gives
 *    `openinference`, which OpenRouter discards without complaint. Ignoring by
 *    display name would pass review, ship, and do nothing (mc2-pdsjz).
 * 3. The skip list dies with the call. The owner's decision of 2026-08-20 is
 *    that there is no standing blocklist: a provider that is degraded now may be
 *    the cheapest working one next time.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';

import {
  applyProviderRouting,
  buildProviderPriceCeiling,
  type OpenRouterRequestOptions,
} from '@/shared/llm/client-helpers';
import {
  withGenerationIdCapture,
  instrumentFetchWithGenerationId,
  annotateErrorWithGenerationId,
  readGenerationIdFromError,
} from '@/shared/llm/generation-id-capture';

function emptyRequest(): OpenRouterRequestOptions {
  return { model: 'openai/gpt-5.6-luna', messages: [], max_tokens: 100 };
}

describe('provider routing on the request', () => {
  it('sends an ignore list and a price ceiling together', () => {
    const request = emptyRequest();

    applyProviderRouting(request, { max_price: { prompt: 0.3, completion: 1.8 } });
    applyProviderRouting(request, { ignore: ['open-inference'] });

    expect(request.extra_body?.provider).toEqual({
      max_price: { prompt: 0.3, completion: 1.8 },
      ignore: ['open-inference'],
    });
  });

  it('does not clobber the Anthropic cache flag it shares a field with', () => {
    const request = emptyRequest();

    applyProviderRouting(request, { cache_control: true });
    applyProviderRouting(request, { ignore: ['deepinfra'] });

    expect(request.extra_body?.provider).toMatchObject({
      cache_control: true,
      ignore: ['deepinfra'],
    });
  });

  it('drops a stale ignore list rather than leaving it on the next attempt', () => {
    const request = emptyRequest();

    applyProviderRouting(request, { ignore: ['open-inference'] });
    applyProviderRouting(request, { ignore: [] });

    expect(request.extra_body?.provider?.ignore).toBeUndefined();
  });
});

describe('the price ceiling', () => {
  it('is the catalogue rate times the multiplier, in dollars per million', () => {
    // luna is $0.20 in and $1.20 out per million.
    expect(buildProviderPriceCeiling('openai/gpt-5.6-luna', 1.5)).toEqual({
      prompt: 0.3,
      completion: 1.8,
    });
  });

  it('is omitted for a model the catalogue does not price exactly', () => {
    // A dated snapshot is priced from its base model, and its own tariff can
    // differ. A ceiling below every real endpoint refuses the whole model, so
    // guessing here would turn a pricing error into a failed generation.
    expect(buildProviderPriceCeiling('deepseek/deepseek-v4-flash-20260731', 1.5)).toBeUndefined();
    expect(buildProviderPriceCeiling('some/model-nobody-catalogued', 1.5)).toBeUndefined();
  });
});

describe('the generation id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is captured from the response headers, before the body is read', async () => {
    // The body never resolves — the shape of a call we abort. If the id were
    // read from the body, there would be nothing here.
    const baseFetch = vi.fn(
      async () =>
        new Response(new ReadableStream({ start() {} }), {
          headers: { 'x-generation-id': 'gen-abc123' },
        })
    );
    const instrumented = instrumentFetchWithGenerationId(baseFetch as unknown as typeof fetch);

    const captured = await withGenerationIdCapture(async slot => {
      await instrumented('https://openrouter.ai/api/v1/chat/completions');
      return slot.generationId;
    });

    expect(captured).toBe('gen-abc123');
  });

  it('survives the throw of the attempt that produced it', async () => {
    const error = new Error('This operation was aborted');
    annotateErrorWithGenerationId(error, 'gen-xyz789');

    expect(readGenerationIdFromError(error)).toBe('gen-xyz789');
    // Not enumerable: nothing that serialises or compares errors should start
    // seeing it.
    expect(Object.keys(error)).not.toContain('gen-xyz789');
    expect(JSON.stringify(error)).toBe('{}');
  });

  it('does not leak between two calls running side by side', async () => {
    const makeFetch = (id: string) =>
      instrumentFetchWithGenerationId(
        (async () =>
          new Response('{}', { headers: { 'x-generation-id': id } })) as unknown as typeof fetch
      );

    const [first, second] = await Promise.all([
      withGenerationIdCapture(async slot => {
        await makeFetch('gen-first')('https://openrouter.ai/');
        return slot.generationId;
      }),
      withGenerationIdCapture(async slot => {
        await makeFetch('gen-second')('https://openrouter.ai/');
        return slot.generationId;
      }),
    ]);

    expect(first).toBe('gen-first');
    expect(second).toBe('gen-second');
  });

  it('is absent, not fatal, when the response carries no such header', async () => {
    const instrumented = instrumentFetchWithGenerationId(
      (async () => new Response('{}')) as unknown as typeof fetch
    );

    const captured = await withGenerationIdCapture(async slot => {
      await instrumented('https://openrouter.ai/');
      return slot.generationId;
    });

    expect(captured).toBeUndefined();
    expect(readGenerationIdFromError(new Error('no id here'))).toBeUndefined();
    expect(readGenerationIdFromError('not even an error')).toBeUndefined();
  });
});
