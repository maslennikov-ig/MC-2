/**
 * Contract: the endpoint list is read in the units the rest of the code speaks.
 *
 * `/models/{model}/endpoints` reports prices per token, as strings — the real
 * response for `deepseek/deepseek-v4-flash-0731` on 2026-08-21 carried
 * `"prompt": "0.000000065"`. Everything else in this codebase, including the
 * ceiling these prices are filtered against, is dollars per million. Getting
 * that conversion wrong by a factor of a million would not throw; it would
 * silently filter out every endpoint, or none, and the pin would quietly stop
 * choosing (mc2-6crnj).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => {
  const noop = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };
  return { logger: { ...noop, child: () => noop }, default: { ...noop, child: () => noop } };
});
vi.mock('@/shared/services/api-key-service', () => ({
  getApiKeySync: () => 'test-key',
  getOpenRouterApiKey: async () => 'test-key',
  getApiKey: async () => 'test-key',
}));

import {
  forgetModelEndpoints,
  listModelEndpoints,
  pickCheapestUntriedEndpoint,
} from '@/shared/llm/openrouter-endpoints';

/** Two entries copied from the live response, order deliberately not by price. */
function payload() {
  return {
    data: {
      endpoints: [
        {
          tag: 'relace/fp4',
          provider_name: 'Relace',
          pricing: { prompt: '0.00000007', completion: '0.00000014' },
          status: 0,
        },
        {
          tag: 'sail-research/fp4',
          provider_name: 'Sail Research',
          pricing: { prompt: '0.000000065', completion: '0.00000018' },
          status: 0,
        },
        // No tag: nothing can be routed to it, so it is not a candidate.
        { provider_name: 'Nameless', pricing: { prompt: '0.00000001' }, status: 0 },
      ],
    },
  };
}

function respondWith(body: unknown, ok = true) {
  return vi.fn(async () => ({ ok, status: ok ? 200 : 404, json: async () => body }));
}

beforeEach(() => {
  forgetModelEndpoints();
  vi.clearAllMocks();
});

describe('reading the endpoint list', () => {
  it('converts per-token prices to per-million and sorts by the cheapest', async () => {
    vi.stubGlobal('fetch', respondWith(payload()));

    const endpoints = await listModelEndpoints('deepseek/deepseek-v4-flash-0731');

    expect(endpoints.map(endpoint => endpoint.tag)).toEqual(['sail-research/fp4', 'relace/fp4']);
    expect(endpoints[0].promptPricePerMillion).toBeCloseTo(0.065, 6);
    expect(endpoints[0].completionPricePerMillion).toBeCloseTo(0.18, 6);
    vi.unstubAllGlobals();
  });

  it('asks for the model whole, with both segments in the path', async () => {
    const fetchMock = respondWith(payload());
    vi.stubGlobal('fetch', fetchMock);

    await listModelEndpoints('deepseek/deepseek-v4-flash-0731');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://openrouter.ai/api/v1/models/deepseek/deepseek-v4-flash-0731/endpoints'
    );
    vi.unstubAllGlobals();
  });

  it('answers with nothing rather than throwing when the lookup fails', async () => {
    vi.stubGlobal('fetch', respondWith({}, false));

    await expect(listModelEndpoints('deepseek/deepseek-v4-flash-0731')).resolves.toEqual([]);
    vi.unstubAllGlobals();
  });

  it('does not cache a failed lookup, so the next attempt may try again', async () => {
    const failing = respondWith({}, false);
    vi.stubGlobal('fetch', failing);
    await listModelEndpoints('deepseek/deepseek-v4-flash-0731');

    const working = respondWith(payload());
    vi.stubGlobal('fetch', working);
    const endpoints = await listModelEndpoints('deepseek/deepseek-v4-flash-0731');

    expect(endpoints).toHaveLength(2);
    vi.unstubAllGlobals();
  });

  it('reuses a good list rather than asking before every attempt', async () => {
    const fetchMock = respondWith(payload());
    vi.stubGlobal('fetch', fetchMock);

    await listModelEndpoints('deepseek/deepseek-v4-flash-0731', 1_000);
    await listModelEndpoints('deepseek/deepseek-v4-flash-0731', 2_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe('choosing among endpoints', () => {
  const list = [
    {
      tag: 'a/fp4',
      providerName: 'A',
      promptPricePerMillion: 0.065,
      completionPricePerMillion: 0.18,
      status: 0,
    },
    {
      tag: 'b/fp4',
      providerName: 'B',
      promptPricePerMillion: 0.065,
      completionPricePerMillion: 0.18,
      status: -2,
    },
    {
      tag: 'c/fp4',
      providerName: 'C',
      promptPricePerMillion: 0.07,
      completionPricePerMillion: 0.14,
      status: 0,
    },
    {
      tag: 'd/fp8',
      providerName: 'D',
      promptPricePerMillion: 0.44,
      completionPricePerMillion: 1.2,
      status: 0,
    },
  ];

  it('takes the cheapest healthy one', () => {
    expect(pickCheapestUntriedEndpoint(list, new Set())?.tag).toBe('a/fp4');
  });

  it('skips what this chain has already spent an attempt on', () => {
    expect(pickCheapestUntriedEndpoint(list, new Set(['a/fp4']))?.tag).toBe('c/fp4');
  });

  it('skips a degraded endpoint, as OpenRouter default routing does', () => {
    // Same price as the cheapest, status -2. On 2026-08-20 default routing
    // passed over exactly this one, and a 205s call was what picking it looked
    // like.
    expect(pickCheapestUntriedEndpoint(list, new Set())?.tag).not.toBe('b/fp4');
  });

  it('never pins above the ceiling, which would spend the attempt on a refusal', () => {
    const ceiling = { prompt: 0.3, completion: 1.8 };
    expect(pickCheapestUntriedEndpoint(list, new Set(['a/fp4', 'c/fp4']), ceiling)).toBeUndefined();
    // Without a ceiling the same call has somewhere left to go.
    expect(pickCheapestUntriedEndpoint(list, new Set(['a/fp4', 'c/fp4']))?.tag).toBe('d/fp8');
  });
});
