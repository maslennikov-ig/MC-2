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
  default: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('generateEmbeddings usage observer', () => {
  const originalApiKey = process.env.JINA_API_KEY;

  beforeEach(() => {
    process.env.JINA_API_KEY = 'test-key';
    acquireMock.mockClear();
    releaseMock.mockClear();
    waitForSlotMock.mockClear();
    recordJinaCallCostMock.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [
            { embedding: Array.from({ length: 768 }, () => 0) },
            { embedding: Array.from({ length: 768 }, () => 1) },
          ],
          usage: { total_tokens: 321 },
        }),
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalApiKey === undefined) delete process.env.JINA_API_KEY;
    else process.env.JINA_API_KEY = originalApiKey;
    vi.unstubAllGlobals();
  });

  it('reports the provider token receipt from the same successful batch', async () => {
    const { generateEmbeddings } = await import('@/shared/embeddings/jina-client');
    const onUsage = vi.fn();

    const embeddings = await generateEmbeddings(
      ['first text', 'second text'],
      'retrieval.passage',
      undefined,
      onUsage
    );

    expect(embeddings).toHaveLength(2);
    expect(onUsage).toHaveBeenCalledOnce();
    expect(onUsage).toHaveBeenCalledWith({
      model: 'jina-embeddings-v3',
      totalTokens: 321,
      documentCount: 2,
    });
  });

  it('keeps the existing third-argument cost context contract when no observer is supplied', async () => {
    const { generateEmbeddings } = await import('@/shared/embeddings/jina-client');
    const costContext = {
      courseId: '00000000-0000-4000-8000-000000000001',
      stage: 'stage_6' as const,
      phase: 'rag_retrieval',
    };

    await generateEmbeddings(['first text', 'second text'], 'retrieval.passage', costContext);

    expect(recordJinaCallCostMock).toHaveBeenCalledWith(
      expect.objectContaining({ totalTokens: 321, documentCount: 2 }),
      costContext
    );
  });

  it('waits for the provider Retry-After window before retrying a 429', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'retry-after': '2' }),
        json: vi.fn().mockResolvedValue({ detail: 'rate limit' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [{ embedding: Array.from({ length: 768 }, () => 0) }],
          usage: { total_tokens: 123 },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { generateEmbeddings } = await import('@/shared/embeddings/jina-client');
    const resultPromise = generateEmbeddings(['retry me'], 'retrieval.passage');

    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchMock).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1);
    await expect(resultPromise).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses the full minute window for a 429 without Retry-After', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({ detail: 'rate limit' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [{ embedding: Array.from({ length: 768 }, () => 0) }],
          usage: { total_tokens: 123 },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { generateEmbeddings } = await import('@/shared/embeddings/jina-client');
    const resultPromise = generateEmbeddings(['retry me'], 'retrieval.passage');

    await vi.advanceTimersByTimeAsync(59_999);
    expect(fetchMock).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1);
    await expect(resultPromise).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the one-second exponential retry for 5xx errors', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({ detail: 'temporarily unavailable' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [{ embedding: Array.from({ length: 768 }, () => 0) }],
          usage: { total_tokens: 123 },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { generateEmbeddings } = await import('@/shared/embeddings/jina-client');
    const resultPromise = generateEmbeddings(['retry me'], 'retrieval.passage');

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1);
    await expect(resultPromise).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
