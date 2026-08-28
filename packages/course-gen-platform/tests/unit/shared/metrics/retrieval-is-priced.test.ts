/**
 * Contract: retrieval is spend, and it lands on the course that asked for it.
 *
 * Jina is paid on two hot paths — one query embedding per retrieval query, one
 * reranker call per lesson — and until 2026-08-28 neither reached any ledger.
 * `generation_trace` recorded OpenRouter calls only, which is why `mc2-4clyr`
 * could say "Stage 6 is about 90% of generation cost" about a sum that had
 * never counted the retrieval it was describing.
 *
 * The reranker at least counted tokens, into a `TokenUsageTracker` that
 * `getRerankerTokenStats()` exposes and nothing reads and that resets with the
 * process. The hotter path had not even that: `generateQueryEmbedding` received
 * `usage.total_tokens` in the response body and threw it away, with no tracker
 * and no log line, so a query's spend left no trace of any kind.
 *
 * Shown red against the previous behaviour before it was written: with
 * `recordJinaCallCost` absent from both clients, every assertion below that
 * expects a trace row fails on `logTrace` never having been called.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logTrace, cacheGet, cacheSet, fetchMock } = vi.hoisted(() => ({
  logTrace: vi.fn(() => Promise.resolve('trace-id')),
  cacheGet: vi.fn(() => Promise.resolve(null)),
  cacheSet: vi.fn(() => Promise.resolve(true)),
  fetchMock: vi.fn(),
}));

vi.mock('@/shared/trace-logger', () => ({ logTrace }));
vi.mock('../trace-logger', () => ({ logTrace }));
vi.mock('@/shared/cache/redis', () => ({ cache: { get: cacheGet, set: cacheSet } }));
vi.mock('../cache/redis', () => ({ cache: { get: cacheGet, set: cacheSet } }));
vi.mock('@/shared/logger', () => {
  const stub = { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  return { logger: stub, default: stub };
});
vi.mock('../logger', () => {
  const stub = { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  return { logger: stub, default: stub };
});
// The limiters talk to Redis; the calls under test do not depend on what they
// do, only on being allowed through.
vi.mock('@/shared/embeddings/jina-client', async importActual => {
  const actual = await importActual<typeof import('@/shared/embeddings/jina-client')>();
  return {
    ...actual,
    jinaRateLimiter: { waitForSlot: vi.fn(() => Promise.resolve()) },
    jinaConcurrencyLimiter: { acquire: vi.fn(() => Promise.resolve()), release: vi.fn() },
  };
});

import { jinaCostUsd, JINA_PRICE_PER_MILLION_TOKENS } from '@/shared/jina/pricing';
import { recordJinaCallCost } from '@/shared/metrics/jina-cost';
import { rerankDocuments } from '@/shared/jina/reranker-client';

const COURSE = '8baaa75e-bb85-496e-81df-807e770fd73d';

describe('a Jina call is priced from the provider rate', () => {
  it('prices both models this repository calls', () => {
    expect(JINA_PRICE_PER_MILLION_TOKENS['jina-embeddings-v3']).toBe(0.05);
    expect(JINA_PRICE_PER_MILLION_TOKENS['jina-reranker-v2-base-multilingual']).toBe(0.05);
  });

  it('turns a token count into money', () => {
    // The reranker call one lesson of course 8baaa75e made on 2026-08-28.
    expect(jinaCostUsd('jina-reranker-v2-base-multilingual', 8755)).toBeCloseTo(0.00043775, 12);
    // Nine query embeddings for that same lesson.
    expect(jinaCostUsd('jina-embeddings-v3', 241)).toBeCloseTo(0.00001205, 12);
  });

  it('answers undefined for a model with no rate, never zero', () => {
    // A measured zero is a measurement; an unknown rate is not. Writing one as
    // the other is how a real charge becomes an untraceable free row.
    expect(jinaCostUsd('jina-reranker-v3.5', 1000)).toBeUndefined();
    expect(jinaCostUsd('jina-embeddings-v3', 0)).toBe(0);
  });
});

describe('a Jina call lands on the course that asked for it', () => {
  beforeEach(() => {
    logTrace.mockClear();
  });

  it('writes one priced, billed row', async () => {
    await recordJinaCallCost(
      { model: 'jina-embeddings-v3', totalTokens: 241, operation: 'embedding' },
      { courseId: COURSE, stage: 'stage_6', phase: 'rag_retrieval', lessonId: '3.2' }
    );

    expect(logTrace).toHaveBeenCalledTimes(1);
    const row = logTrace.mock.calls[0][0] as Record<string, unknown>;
    expect(row.courseId).toBe(COURSE);
    expect(row.stage).toBe('stage_6');
    expect(row.modelUsed).toBe('jina-embeddings-v3');
    expect(row.tokensUsed).toBe(241);
    expect(row.costUsd).toBeCloseTo(0.00001205, 12);
    // `cost-report.ts` reads both: the first says this is a call and not a
    // stage progress marker, the second keeps it out of the OpenRouter
    // reconciliation, which has a receipt to compare against and Jina does not.
    const input = row.inputData as Record<string, unknown>;
    expect(input.billedCall).toBe(true);
    expect(input.provider).toBe('jina');
  });

  it('records nothing when there is no course, and does not throw', async () => {
    await expect(
      recordJinaCallCost({ model: 'jina-embeddings-v3', totalTokens: 241, operation: 'embedding' })
    ).resolves.toBeUndefined();

    expect(logTrace).not.toHaveBeenCalled();
  });

  it('survives a ledger that will not accept the row', async () => {
    logTrace.mockRejectedValueOnce(new Error('generation_trace is unavailable'));

    // Accounting must not be able to fail a retrieval.
    await expect(
      recordJinaCallCost(
        { model: 'jina-embeddings-v3', totalTokens: 241, operation: 'embedding' },
        { courseId: COURSE, stage: 'stage_6', phase: 'rag_retrieval' }
      )
    ).resolves.toBeUndefined();
  });
});

describe('the reranker prices the call it actually made', () => {
  beforeEach(() => {
    logTrace.mockClear();
    cacheGet.mockReset();
    cacheGet.mockResolvedValue(null);
    cacheSet.mockReset();
    cacheSet.mockResolvedValue(true);
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    process.env.JINA_API_KEY = 'test-key';
  });

  it('charges the lesson for the whole union it sent', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            { index: 0, relevance_score: 0.9 },
            { index: 1, relevance_score: 0.4 },
          ],
          usage: { total_tokens: 8755 },
        }),
    });

    await rerankDocuments('одна заявка', ['первый чанк', 'второй чанк'], 2, {
      courseId: COURSE,
      stage: 'stage_6',
      phase: 'rag_retrieval',
      lessonId: '3.2',
    });

    expect(logTrace).toHaveBeenCalledTimes(1);
    const row = logTrace.mock.calls[0][0] as Record<string, unknown>;
    expect(row.modelUsed).toBe('jina-reranker-v2-base-multilingual');
    expect(row.tokensUsed).toBe(8755);
    expect((row.inputData as Record<string, unknown>).documentCount).toBe(2);
  });

  it('charges nothing for a cache hit, which spent nothing', async () => {
    cacheGet.mockResolvedValue([{ index: 0, relevance_score: 0.9 }]);

    await rerankDocuments('одна заявка', ['первый чанк'], 1, {
      courseId: COURSE,
      stage: 'stage_6',
      phase: 'rag_retrieval',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(logTrace).not.toHaveBeenCalled();
  });
});
