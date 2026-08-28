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
          // An object, not a number — see the test below.
          throughput_last_30m: { p50: 100, p75: 130, p90: 160, p99: 190 },
          uptime_last_30m: 99.9,
        },
        {
          tag: 'sail-research/fp4',
          provider_name: 'Sail Research',
          pricing: { prompt: '0.000000065', completion: '0.00000018' },
          status: 0,
          throughput_last_30m: { p50: 9, p75: 12, p90: 15, p99: 21 },
          uptime_last_30m: 99.9,
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

describe('reading throughput', () => {
  it('reads the median out of the object the API actually sends', async () => {
    // `throughput_last_30m` is `{p50,p75,p90,p99}`; `uptime_last_30m`, right
    // beside it, is a plain number. Reading the first with `Number()` gives NaN
    // and makes a fully populated field look empty — which is exactly how the
    // throughput data was once reported as missing.
    global.fetch = respondWith(payload()) as unknown as typeof fetch;

    const endpoints = await listModelEndpoints('deepseek/deepseek-v4-flash-0731');
    const bySlug = new Map(endpoints.map(e => [e.tag, e]));

    expect(bySlug.get('relace/fp4')?.throughputTokensPerSecond).toBe(100);
    expect(bySlug.get('sail-research/fp4')?.throughputTokensPerSecond).toBe(9);
  });

  it('records no figure rather than a zero when the endpoint publishes none', async () => {
    // Zero would mean "infinitely slow" to the floor and would refuse the
    // endpoint; null means "not stated" and lets it through.
    global.fetch = respondWith({
      data: {
        endpoints: [
          { tag: 'new/fp4', pricing: { prompt: '0.0000001', completion: '0.0000002' }, status: 0 },
        ],
      },
    }) as unknown as typeof fetch;

    const [only] = await listModelEndpoints('vendor/newcomer');

    expect(only.throughputTokensPerSecond).toBeNull();
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
      throughputTokensPerSecond: 80,
    },
    {
      tag: 'b/fp4',
      providerName: 'B',
      promptPricePerMillion: 0.065,
      completionPricePerMillion: 0.18,
      status: -2,
      throughputTokensPerSecond: 80,
    },
    {
      tag: 'c/fp4',
      providerName: 'C',
      promptPricePerMillion: 0.07,
      completionPricePerMillion: 0.14,
      status: 0,
      throughputTokensPerSecond: 80,
    },
    {
      tag: 'd/fp8',
      providerName: 'D',
      promptPricePerMillion: 0.44,
      completionPricePerMillion: 1.2,
      status: 0,
      throughputTokensPerSecond: 80,
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

/**
 * Contract: cheapest **among the endpoints that can finish**.
 *
 * The numbers below are the live `/endpoints` list for
 * `deepseek/deepseek-v4-flash-0731` on 2026-08-28, which is the model most of
 * this pipeline runs on. Its cheapest endpoint served 9 tokens a second; the
 * next one up, at twice the price, served 100. An 8000-token lesson is 15
 * minutes at the first rate and 80 seconds at the second, and the phase config
 * gives that call 300 s — so the cheap route could not have finished at all.
 *
 * Sorting on price alone had been choosing it since the sort was written. This
 * is the half of the 2026-08-21 timeout that pinning did not fix: the pin made a
 * slow provider nameable, it did not stop us picking one (mc2-6crnj, mc2-u8kwx).
 */
describe('the throughput floor', () => {
  const endpoint = (
    tag: string,
    promptPricePerMillion: number,
    throughputTokensPerSecond: number | null
  ) => ({
    tag,
    providerName: tag,
    promptPricePerMillion,
    completionPricePerMillion: promptPricePerMillion * 2,
    status: 0,
    throughputTokensPerSecond,
    tier: 'default' as const,
  });

  it('passes over the cheapest endpoint when it cannot keep up', () => {
    const live = [
      endpoint('open-inference/fp4', 0.03, 9),
      endpoint('relace/fp4', 0.06, 100),
      endpoint('deepinfra/fp8', 0.08, 58),
    ];

    expect(pickCheapestUntriedEndpoint(live, new Set())?.tag).toBe('relace/fp4');
  });

  it('takes the cheapest of those that do keep up, not the fastest', () => {
    const live = [
      endpoint('slow/fp4', 0.03, 9),
      endpoint('adequate/fp4', 0.06, 40),
      endpoint('rapid/fp8', 0.08, 200),
    ];

    expect(pickCheapestUntriedEndpoint(live, new Set())?.tag).toBe('adequate/fp4');
  });

  it('uses a slow endpoint rather than none when it is all there is', () => {
    // A floor that can refuse everything is a floor that can stop a generation.
    const live = [endpoint('slow/fp4', 0.03, 9), endpoint('slower/fp8', 0.08, 4)];

    expect(pickCheapestUntriedEndpoint(live, new Set())?.tag).toBe('slow/fp4');
  });

  it('treats an unpublished figure as no objection', () => {
    // "Not stated" is not "slow". A new provider has no 30-minute history, and
    // refusing it would pin routing to whoever is already established.
    const live = [endpoint('newcomer/fp4', 0.03, null), endpoint('known/fp8', 0.08, 120)];

    expect(pickCheapestUntriedEndpoint(live, new Set())?.tag).toBe('newcomer/fp4');
  });

  it('does not answer a request for flex by leaving flex for something dearer', () => {
    // Live numbers for `openai/gpt-5.6-luna` on 2026-08-28: the flex endpoint
    // is $0.10/1M at 26 tok/s, the default one $0.20 at 68. A floor allowed to
    // reach across tiers would double the price of a call that explicitly asked
    // to halve it — speed is not the term flex trades away.
    const live = [
      { ...endpoint('openai/flex', 0.1, 26), tier: 'flex' as const },
      { ...endpoint('azure', 0.2, 68), tier: 'default' as const },
    ];

    expect(pickCheapestUntriedEndpoint(live, new Set(), undefined, 'flex')?.tag).toBe(
      'openai/flex'
    );
  });

  it('falls through to the default tier once the flex endpoint has been tried', () => {
    const live = [
      { ...endpoint('openai/flex', 0.1, 26), tier: 'flex' as const },
      { ...endpoint('azure', 0.2, 68), tier: 'default' as const },
    ];

    expect(
      pickCheapestUntriedEndpoint(live, new Set(['openai/flex']), undefined, 'flex')?.tag
    ).toBe('azure');
  });

  it('still refuses a degraded endpoint however fast it claims to be', () => {
    const live = [
      { ...endpoint('degraded/fp4', 0.03, 500), status: -2 },
      endpoint('healthy/fp8', 0.08, 60),
    ];

    expect(pickCheapestUntriedEndpoint(live, new Set())?.tag).toBe('healthy/fp8');
  });
});

/**
 * Contract: a `~…-latest` alias is followed to the snapshot it serves, because
 * an alias has no endpoints of its own.
 *
 * Measured against the live API on 2026-08-22:
 * `/models/~deepseek/deepseek-v4-flash-latest/endpoints` answers **200 with an
 * empty list**, while `deepseek/deepseek-v4-flash-0731` answers with 30. An
 * empty list is how this module says "could not find out", so routing on the
 * alias would silently turn the pin off — and the pin is what moved two hung
 * 238s calls onto a working provider that same day (mc2-6crnj).
 *
 * The target is read from OpenRouter's own `alias_target.slug`, never guessed
 * from context length or price.
 */
describe('following a latest-alias', () => {
  const ALIAS = '~deepseek/deepseek-v4-flash-latest';
  const SNAPSHOT = 'deepseek/deepseek-v4-flash-0731';

  beforeEach(forgetModelEndpoints);

  function transport() {
    const asked: string[] = [];
    return {
      asked,
      fetchMock: vi.fn(async (url: string) => {
        asked.push(url);
        if (url.endsWith('/models')) {
          return new Response(
            JSON.stringify({
              data: [
                { id: 'openai/gpt-5.6-luna' },
                { id: ALIAS, alias_target: { name: 'DeepSeek V4 Flash 0731', slug: SNAPSHOT } },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify(payload()), { status: 200 });
      }),
    };
  }

  it('asks the snapshot for its endpoints, not the alias', async () => {
    const { asked, fetchMock } = transport();
    vi.stubGlobal('fetch', fetchMock);

    const endpoints = await listModelEndpoints(ALIAS);

    expect(asked.some(url => url.endsWith(`/models/${SNAPSHOT}/endpoints`))).toBe(true);
    expect(asked.some(url => url.includes('deepseek-v4-flash-latest/endpoints'))).toBe(false);
    expect(endpoints.length).toBeGreaterThan(0);
  });

  it('resolves the alias once, not on every attempt of every chain', async () => {
    const { asked, fetchMock } = transport();
    vi.stubGlobal('fetch', fetchMock);

    // Far enough apart that the endpoint list's own five-minute cache is stale
    // and the list is fetched again; the alias must not be.
    await listModelEndpoints(ALIAS, 0);
    await listModelEndpoints(ALIAS, 60 * 60_000);

    expect(asked.filter(url => url.endsWith('/models/endpoints')).length).toBe(0);
    expect(asked.filter(url => url.endsWith(`/models/${SNAPSHOT}/endpoints`)).length).toBe(2);
    expect(asked.filter(url => url.endsWith('/models')).length).toBe(1);
  });

  it('leaves an ordinary model id alone', async () => {
    const { asked, fetchMock } = transport();
    vi.stubGlobal('fetch', fetchMock);

    await listModelEndpoints(SNAPSHOT);

    expect(asked.some(url => url.endsWith('/models'))).toBe(false);
  });
});
