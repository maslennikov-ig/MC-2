import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { acquireMock, releaseMock, waitForSlotMock, recordJinaCallCostMock } = vi.hoisted(() => ({
  acquireMock: vi.fn().mockResolvedValue(undefined),
  releaseMock: vi.fn(),
  waitForSlotMock: vi.fn().mockResolvedValue(undefined),
  recordJinaCallCostMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/shared/jina/distributed-rate-limiter', () => ({
  DistributedRateLimiter: class {
    waitForSlot = waitForSlotMock;
  },
}));

vi.mock('@/shared/jina/distributed-concurrency-limiter', () => ({
  DistributedConcurrencyLimiter: class {
    acquire = acquireMock;
    release = releaseMock;
  },
}));

vi.mock('@/shared/metrics/jina-cost', () => ({
  recordJinaCallCost: recordJinaCallCostMock,
}));

vi.mock('@/shared/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function rateLimited(retryAfterSeconds: string) {
  return {
    ok: false,
    status: 429,
    statusText: 'Too Many Requests',
    headers: new Headers({ 'retry-after': retryAfterSeconds }),
    json: vi.fn().mockResolvedValue({ detail: 'rate limit' }),
  };
}

function embeddings(count: number) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({
      data: Array.from({ length: count }, () => ({
        embedding: Array.from({ length: 768 }, () => 0),
      })),
      usage: { total_tokens: 123 },
    }),
  };
}

describe('Jina rate-limit wait budget', () => {
  const originalApiKey = process.env.JINA_API_KEY;

  beforeEach(() => {
    process.env.JINA_API_KEY = 'test-key';
    acquireMock.mockClear();
    releaseMock.mockClear();
    waitForSlotMock.mockClear();
    recordJinaCallCostMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalApiKey === undefined) delete process.env.JINA_API_KEY;
    else process.env.JINA_API_KEY = originalApiKey;
    vi.unstubAllGlobals();
  });

  it('caps the total 429 wait across every batch of one call instead of per batch', async () => {
    vi.useFakeTimers();
    // Two batches, each answered with a maximal Retry-After. Per-batch retries
    // would park the caller for two full windows; the call-wide budget pays for
    // the first and then fails fast rather than holding a BullMQ lock open.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rateLimited('300'))
      .mockResolvedValueOnce(embeddings(100))
      .mockResolvedValueOnce(rateLimited('300'));
    vi.stubGlobal('fetch', fetchMock);

    const { generateEmbeddings } = await import('@/shared/embeddings/jina-client');
    const texts = Array.from({ length: 200 }, (_, index) => `text ${index}`);
    const resultPromise = generateEmbeddings(texts, 'retrieval.passage');
    const rejection = expect(resultPromise).rejects.toThrow(/rate limit|429|Too Many Requests/iu);

    await vi.advanceTimersByTimeAsync(300_000);
    await rejection;

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('spends the budget across retries and stops before a wait it cannot afford', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rateLimited('3'))
      .mockResolvedValueOnce(rateLimited('3'));
    vi.stubGlobal('fetch', fetchMock);

    const { generateEmbeddings } = await import('@/shared/embeddings/jina-client');
    const resultPromise = generateEmbeddings(
      ['one text'],
      'retrieval.passage',
      undefined,
      undefined,
      {
        rateLimitWaitBudgetMs: 5_000,
      }
    );
    const rejection = expect(resultPromise).rejects.toThrow(/rate limit|429|Too Many Requests/iu);

    await vi.advanceTimersByTimeAsync(3_000);
    await rejection;

    // Second 429 asks for 3s with 2s left: a clamped wait would only retry into
    // the same closed window, so the call fails without a third attempt.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('still honours one full provider window under the default budget', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rateLimited('300'))
      .mockResolvedValueOnce(embeddings(1));
    vi.stubGlobal('fetch', fetchMock);

    const { generateEmbeddings, JINA_RATE_LIMIT_WAIT_BUDGET_MS } = await import(
      '@/shared/embeddings/jina-client'
    );
    expect(JINA_RATE_LIMIT_WAIT_BUDGET_MS).toBe(300_000);

    const resultPromise = generateEmbeddings(['one text'], 'retrieval.passage');

    await vi.advanceTimersByTimeAsync(299_999);
    expect(fetchMock).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1);
    await expect(resultPromise).resolves.toHaveLength(1);
  });

  it('does not draw 5xx backoff from the rate-limit budget', async () => {
    vi.useFakeTimers();
    const serverError = {
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers(),
      json: vi.fn().mockResolvedValue({ detail: 'upstream' }),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(serverError)
      .mockResolvedValueOnce(rateLimited('300'))
      .mockResolvedValueOnce(embeddings(1));
    vi.stubGlobal('fetch', fetchMock);

    const { generateEmbeddings } = await import('@/shared/embeddings/jina-client');
    const resultPromise = generateEmbeddings(['one text'], 'retrieval.passage');

    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(300_000);
    await expect(resultPromise).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
