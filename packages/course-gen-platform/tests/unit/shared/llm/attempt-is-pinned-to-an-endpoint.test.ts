/**
 * Contract: each attempt names the endpoint it goes to, and the next one goes
 * somewhere else.
 *
 * The skip list in `provider-ignore-is-per-call.test.ts` was held by unit tests
 * only, and the paid run of 2026-08-21 showed why that was not enough. A call
 * timed out after 238s and the chain excluded nobody: `ignoredInThisChain` was
 * empty, and the log carried no `providerName`, because the only source of that
 * name — `GET /api/v1/generation` — is unreadable while the call is still
 * running. The retry went back to the same provider and spent another 504s
 * (mc2-6crnj).
 *
 * Asking afterwards cannot be made to work for the failure that matters. Naming
 * the endpoint up front can: `provider.order` with one tag and
 * `allow_fallbacks: false`. Then a timeout, a silence and a 5xx are all
 * attributable to a provider we chose, and the next attempt takes the next
 * cheapest.
 *
 * Cheapest is still the goal: the list is sorted by live prompt price and the
 * first attempt lands where OpenRouter's default routing would have sent it.
 * Nothing survives the call.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock, fetchGenerationFactMock, resolveProviderSlugMock, listEndpointsMock } =
  vi.hoisted(() => ({
    createMock: vi.fn(),
    fetchGenerationFactMock: vi.fn(),
    resolveProviderSlugMock: vi.fn(),
    listEndpointsMock: vi.fn(),
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
vi.mock('@/shared/llm/openrouter-endpoints', async () => {
  // Only the network half is replaced. The choosing is the logic under test, so
  // it stays real.
  const actual = await vi.importActual<typeof import('@/shared/llm/openrouter-endpoints')>(
    '@/shared/llm/openrouter-endpoints'
  );
  return { ...actual, listModelEndpoints: listEndpointsMock };
});
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
    provider: 'Relace',
  };
}

/**
 * The real shape of `/models/{model}/endpoints`, cheapest first, including one
 * degraded endpoint at the same price as the cheapest — the pair that OpenRouter
 * itself passes over, measured on 2026-08-20.
 */
function endpoints() {
  return [
    {
      tag: 'sail-research/fp4',
      providerName: 'Sail Research',
      promptPricePerMillion: 0.065,
      completionPricePerMillion: 0.18,
      status: 0,
    },
    {
      tag: 'open-inference/fp4',
      providerName: 'OpenInference',
      promptPricePerMillion: 0.065,
      completionPricePerMillion: 0.18,
      status: -2,
    },
    {
      tag: 'relace/fp4',
      providerName: 'Relace',
      promptPricePerMillion: 0.07,
      completionPricePerMillion: 0.14,
      status: 0,
    },
    {
      tag: 'atlascloud/fp8',
      providerName: 'AtlasCloud',
      promptPricePerMillion: 0.44,
      completionPricePerMillion: 1.2,
      status: 0,
    },
  ];
}

const sentProviderBlocks: Array<Record<string, unknown> | undefined> = [];

function recordSentRouting(request: unknown): void {
  const provider = (request as { provider?: Record<string, unknown> }).provider;
  sentProviderBlocks.push(provider ? structuredClone(provider) : undefined);
}

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
  listEndpointsMock.mockResolvedValue(endpoints());
  fetchGenerationFactMock.mockResolvedValue(null);
  resolveProviderSlugMock.mockResolvedValue(null);
});

describe('an attempt is pinned to one endpoint', () => {
  it('sends the cheapest healthy endpoint, and forbids falling off it', async () => {
    respondInOrder({ returns: completion('ok') });

    const client = new LLMClient({ maxRetries: 0 });
    await client.generateCompletion('a prompt', { model: 'openai/gpt-5.6-luna' });

    expect(sentProviderBlocks[0]?.order).toEqual(['sail-research/fp4']);
    // Without this the request could still be served by someone else and the
    // failure would be anonymous again, which is the whole defect.
    expect(sentProviderBlocks[0]?.allow_fallbacks).toBe(false);
  });

  it('moves to the next cheapest after a failure, with no lookup at all', async () => {
    respondInOrder({ throws: abortedWithGenerationId() }, { returns: completion('ok') });

    const client = new LLMClient({ maxRetries: 1 });
    await client.generateCompletion('a prompt', { model: 'openai/gpt-5.6-luna' });

    // `open-inference/fp4` is the same price and is skipped: its status is -2,
    // and OpenRouter's own routing passes over it too. Picking it would be a
    // change of behaviour dressed as a fix.
    expect(sentProviderBlocks.map(block => block?.order)).toEqual([
      ['sail-research/fp4'],
      ['relace/fp4'],
    ]);
    // The point of the pin: nothing had to be asked about who failed. The
    // timeout that motivated this had no readable generation record at all.
    expect(fetchGenerationFactMock).not.toHaveBeenCalled();
  });

  it('does not also send a skip list, which would say the same thing twice', async () => {
    respondInOrder({ throws: abortedWithGenerationId() }, { returns: completion('ok') });

    const client = new LLMClient({ maxRetries: 1 });
    await client.generateCompletion('a prompt', { model: 'openai/gpt-5.6-luna' });

    for (const block of sentProviderBlocks) {
      expect(block?.ignore).toBeUndefined();
    }
  });

  it('keeps the price ceiling, and never pins above it', async () => {
    respondInOrder(
      { throws: abortedWithGenerationId() },
      { throws: abortedWithGenerationId() },
      { returns: completion('ok') }
    );

    const client = new LLMClient({ maxRetries: 2 });
    await client.generateCompletion('a prompt', { model: 'openai/gpt-5.6-luna' });

    for (const block of sentProviderBlocks) {
      expect(block?.max_price).toEqual({ prompt: 0.3, completion: 1.8 });
    }
    // AtlasCloud is $0.44 against a $0.30 ceiling — 6.8x the cheapest was the
    // measured tail this ceiling exists to cut. The third attempt has nowhere
    // cheap left, so it stops pinning rather than pinning something the ceiling
    // would refuse and burning the attempt on the refusal.
    expect(sentProviderBlocks[2]?.order).toBeUndefined();
  });

  it('starts the next call at the cheapest again', async () => {
    respondInOrder({ throws: abortedWithGenerationId() }, { returns: completion('ok') });

    const client = new LLMClient({ maxRetries: 1 });
    await client.generateCompletion('first call', { model: 'openai/gpt-5.6-luna' });
    expect(sentProviderBlocks[1]?.order).toEqual(['relace/fp4']);

    sentProviderBlocks.length = 0;
    respondInOrder({ returns: completion('ok again') });
    await client.generateCompletion('second call', { model: 'openai/gpt-5.6-luna' });

    // The owner's decision: no standing blocklist. What one call learned dies
    // with it, and the next starts at the cheapest.
    expect(sentProviderBlocks[0]?.order).toEqual(['sail-research/fp4']);
  });

  it('falls back to the older behaviour when the endpoint list cannot be had', async () => {
    // The lookup must never be able to fail a generation. With no list there is
    // no pin, and the chain goes back to learning the provider afterwards.
    listEndpointsMock.mockResolvedValue([]);
    fetchGenerationFactMock.mockResolvedValue({
      generationId: 'gen-aborted-1',
      usageUsd: 0.0003,
      providerName: 'OpenInference',
      model: 'openai/gpt-5.6-luna',
      router: null,
      cancelled: true,
      finishReason: null,
      nativeTokensPrompt: null,
      nativeTokensCompletion: null,
    });
    resolveProviderSlugMock.mockResolvedValue('open-inference');
    respondInOrder({ throws: abortedWithGenerationId() }, { returns: completion('ok') });

    const client = new LLMClient({ maxRetries: 1 });
    await client.generateCompletion('a prompt', { model: 'openai/gpt-5.6-luna' });

    expect(sentProviderBlocks[0]?.order).toBeUndefined();
    expect(sentProviderBlocks[1]?.ignore).toEqual(['open-inference']);
  });
});
