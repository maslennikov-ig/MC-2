/**
 * Contract: a provider that fails is skipped for the rest of that call, and
 * forgiven by the next one.
 *
 * The owner's decision of 2026-08-20, recorded so it cannot drift into a
 * standing blocklist: today's bad provider may be tomorrow's cheapest working
 * one, and a list nobody prunes rots in silence. So the second call must go back
 * to sending no `ignore` at all.
 *
 * The measurement behind it: default routing spent 205s on OpenInference at
 * 13 tok/s — an endpoint whose own status was `-2`, degraded — and the repeat
 * with that provider excluded landed on Sail Research in 58.7s. OpenRouter will
 * not do this for us: `allow_fallbacks` moves off a provider that refuses or is
 * down, never one that is merely crawling (mc2-pdsjz).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock, fetchGenerationFactMock, resolveProviderSlugMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  fetchGenerationFactMock: vi.fn(),
  resolveProviderSlugMock: vi.fn(),
}));

vi.mock('@/shared/logger', () => {
  const noop = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
  return { logger: { ...noop, child: () => noop }, default: { ...noop, child: () => noop } };
});
vi.mock('@/shared/trace-logger', () => ({ logTrace: vi.fn() }));
vi.mock('@/shared/services/api-key-service', () => ({
  getApiKey: async () => 'test-key',
  getOpenRouterApiKey: async () => 'test-key',
  getApiKeySync: () => 'test-key',
}));
vi.mock('@/shared/llm/openrouter-generation', () => ({
  fetchGenerationFact: fetchGenerationFactMock,
  resolveProviderSlug: resolveProviderSlugMock,
}));
vi.mock('openai', () => {
  class MockOpenAI {
    chat = { completions: { create: createMock } };
    static APIError = class extends Error {};
  }
  return { default: MockOpenAI };
});

import { LLMClient } from '@/shared/llm/client';
import { annotateErrorWithGenerationId } from '@/shared/llm/generation-id-capture';

class AbortError extends Error {
  override name = 'AbortError';
}

/**
 * An abort that already carries its generation id, as a real one does: the
 * transport annotates the error from the header it captured before the body.
 */
function abortedWithGenerationId(): AbortError {
  const error = new AbortError('This operation was aborted');
  annotateErrorWithGenerationId(error, 'gen-aborted-1');
  return error;
}

function completion(content: string) {
  return {
    choices: [{ message: { content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    model: 'openai/gpt-5.6-luna',
    provider: 'Sail Research',
  };
}

/**
 * The `provider` block as each attempt actually sent it.
 *
 * Snapshotted at call time on purpose: the client mutates one request object
 * across attempts, so reading `mock.calls` afterwards would show every attempt
 * carrying the last one's routing.
 */
const sentProviderBlocks: Array<Record<string, unknown> | undefined> = [];

function recordSentRouting(request: unknown): void {
  const provider = (request as { extra_body?: { provider?: Record<string, unknown> } }).extra_body
    ?.provider;
  sentProviderBlocks.push(provider ? structuredClone(provider) : undefined);
}

/** Queue one outcome per attempt, capturing what that attempt sent. */
function respondInOrder(...outcomes: Array<{ throws: Error } | { returns: unknown }>): void {
  let call = 0;
  createMock.mockImplementation(async (request: unknown) => {
    recordSentRouting(request);
    const outcome = outcomes[Math.min(call, outcomes.length - 1)];
    call += 1;
    if ('throws' in outcome) throw outcome.throws;
    return outcome.returns;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sentProviderBlocks.length = 0;
  fetchGenerationFactMock.mockResolvedValue({
    generationId: 'gen-1',
    usageUsd: 0.00031,
    providerName: 'OpenInference',
    model: 'openai/gpt-5.6-luna',
    router: null,
    cancelled: true,
    finishReason: null,
    nativeTokensPrompt: null,
    nativeTokensCompletion: null,
  });
  resolveProviderSlugMock.mockResolvedValue('open-inference');
});

describe('the provider skip list', () => {
  it('excludes the provider that failed from the next attempt of the same call', async () => {
    respondInOrder({ throws: abortedWithGenerationId() }, { returns: completion('ok') });

    const client = new LLMClient({ maxRetries: 1 });
    await client.generateCompletion('a prompt', { model: 'openai/gpt-5.6-luna' });

    const [first, second] = sentProviderBlocks;
    // The first attempt cannot know who will fail it.
    expect(first?.ignore).toBeUndefined();
    // The second routes around them — by slug, which is what OpenRouter reads.
    // A display name here would be discarded silently and this would still pass
    // review while doing nothing.
    expect(second?.ignore).toEqual(['open-inference']);
    expect(resolveProviderSlugMock).toHaveBeenCalledWith('OpenInference');
    expect(fetchGenerationFactMock).toHaveBeenCalledWith('gen-aborted-1');
  });

  it('carries the price ceiling on every attempt, so ignoring is not a licence to spend', async () => {
    respondInOrder({ throws: abortedWithGenerationId() }, { returns: completion('ok') });

    const client = new LLMClient({ maxRetries: 1 });
    await client.generateCompletion('a prompt', { model: 'openai/gpt-5.6-luna' });

    expect(sentProviderBlocks).toHaveLength(2);
    // luna at $0.20/$1.20 per million, times the 1.5 ceiling multiplier.
    for (const block of sentProviderBlocks) {
      expect(block?.max_price).toEqual({ prompt: 0.3, completion: 1.8 });
    }
  });

  it('is forgotten by the next call, which starts again at the cheapest', async () => {
    respondInOrder({ throws: abortedWithGenerationId() }, { returns: completion('ok') });

    const client = new LLMClient({ maxRetries: 1 });
    await client.generateCompletion('first call', { model: 'openai/gpt-5.6-luna' });
    expect(sentProviderBlocks[1]?.ignore).toEqual(['open-inference']);

    sentProviderBlocks.length = 0;
    respondInOrder({ returns: completion('ok again') });
    await client.generateCompletion('second call', { model: 'openai/gpt-5.6-luna' });

    // No standing blocklist: the next call goes back to the cheapest endpoint.
    expect(sentProviderBlocks[0]?.ignore).toBeUndefined();
  });

  it('leaves the provider alone when the request itself was wrong', async () => {
    // A 400 is ours to fix, not the provider's to answer for. Excluding them
    // would shrink the pool for the attempts that follow and fix nothing.
    const OpenAI = (await import('openai')).default as unknown as {
      APIError: new (message: string) => Error & { status?: number };
    };
    const badRequest = new OpenAI.APIError('Invalid parameter');
    badRequest.status = 400;
    annotateErrorWithGenerationId(badRequest, 'gen-bad-request');

    respondInOrder({ throws: badRequest }, { returns: completion('ok') });

    const client = new LLMClient({ maxRetries: 1 });
    await client
      .generateCompletion('a prompt', { model: 'openai/gpt-5.6-luna' })
      .catch(() => undefined);

    // The id was there to be used; the classifier is what declined to use it.
    expect(fetchGenerationFactMock).not.toHaveBeenCalled();
    for (const block of sentProviderBlocks) {
      expect(block?.ignore).toBeUndefined();
    }
  });

  it('gives up the price ceiling rather than the generation when nothing meets it', async () => {
    // Measured against the live API on 2026-08-21: a ceiling below every
    // endpoint is answered with "No endpoints found that satisfy the max price
    // for this request" and the call is lost. One wrong catalogue price would
    // otherwise fail every call for that model, so the limit yields first.
    const refusal = new Error('No endpoints found that satisfy the max price for this request');
    respondInOrder({ throws: refusal }, { returns: completion('ok') });

    const client = new LLMClient({ maxRetries: 1 });
    await client.generateCompletion('a prompt', { model: 'openai/gpt-5.6-luna' });

    expect(sentProviderBlocks[0]?.max_price).toEqual({ prompt: 0.3, completion: 1.8 });
    expect(sentProviderBlocks[1]?.max_price).toBeUndefined();
    // The ceiling is not a provider's fault, so nobody is excluded for it.
    expect(sentProviderBlocks[1]?.ignore).toBeUndefined();
  });

  it('reports the provider that served a successful call', async () => {
    respondInOrder({ returns: completion('ok') });

    const client = new LLMClient({ maxRetries: 0 });
    const response = await client.generateCompletion('a prompt', {
      model: 'openai/gpt-5.6-luna',
    });

    expect(response.providerName).toBe('Sail Research');
  });
});
