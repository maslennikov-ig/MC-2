/**
 * The quality gates pay Jina, so the course they are gating must be charged.
 *
 * `QualityValidator` and `validateSummaryQuality` embed on every Stage 3, 4 and
 * 5 quality check, and until `mc2-sv89s` they called the Jina client with no
 * course. `recordJinaCallCost` writes no row at all without a context, so that
 * spend was not underpriced — it was absent from `generation_trace` entirely,
 * while `no-anonymous-spend` listed both modules as known holes.
 *
 * This asserts the whole chain rather than the argument hand-off: a validator
 * call carrying a course must end in a ledger row that names that course, is
 * stamped `provider: 'jina'` and `billedCall`, and carries a price. Mocking
 * `recordJinaCallCost` would have passed on the broken code too.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { logTraceMock, waitForSlotMock, acquireMock, releaseMock } = vi.hoisted(() => ({
  logTraceMock: vi.fn().mockResolvedValue('trace-id'),
  waitForSlotMock: vi.fn().mockResolvedValue(undefined),
  acquireMock: vi.fn().mockResolvedValue(undefined),
  releaseMock: vi.fn(),
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

vi.mock('@/shared/trace-logger', () => ({
  logTrace: logTraceMock,
}));

vi.mock('@/shared/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const COURSE_ID = '00000000-0000-4000-8000-0000000000aa';

/** A vector per input text, distinct enough that cosine similarity is a number. */
function embeddingsFor(count: number, seed: number): Array<{ embedding: number[] }> {
  return Array.from({ length: count }, (_, index) => ({
    embedding: Array.from({ length: 768 }, (_unused, position) =>
      Math.sin((position + 1) * (index + seed + 1))
    ),
  }));
}

describe('the quality gates charge the course they are gating', () => {
  const originalApiKey = process.env.JINA_API_KEY;

  beforeEach(() => {
    process.env.JINA_API_KEY = 'test-key';
    logTraceMock.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: { body: string }) => {
        const payload = JSON.parse(init.body) as { input: string | string[] };
        const count = Array.isArray(payload.input) ? payload.input.length : 1;
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: embeddingsFor(count, 0),
              usage: { total_tokens: 400 },
            }),
        });
      })
    );
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.JINA_API_KEY;
    else process.env.JINA_API_KEY = originalApiKey;
    vi.unstubAllGlobals();
  });

  it('writes the overlap batch against the course that asked for it', async () => {
    const { QualityValidator } = await import('@/shared/validation/quality-validator');

    await new QualityValidator().detectOverlapFromTexts(
      ['Variables and types', 'Control flow'],
      ['Section 1', 'Section 2'],
      'en',
      0.75,
      { courseId: COURSE_ID, stage: 'stage_5', phase: 'cross_section_overlap' }
    );

    expect(logTraceMock).toHaveBeenCalledTimes(1);
    const row = logTraceMock.mock.calls[0][0];
    expect(row.courseId).toBe(COURSE_ID);
    expect(row.stage).toBe('stage_5');
    expect(row.phase).toBe('cross_section_overlap');
    expect(row.modelUsed).toBe('jina-embeddings-v3');
    expect(row.tokensUsed).toBe(400);
    expect(row.costUsd).toBeGreaterThan(0);
    expect(row.inputData).toMatchObject({ billedCall: true, provider: 'jina' });
  });

  it('charges both embeddings of a Stage 3 summary check to the same course', async () => {
    const { validateSummaryQuality } = await import('@/shared/validation/quality-validator');

    await validateSummaryQuality('A long source document about Python.', 'A short summary.', {
      costContext: {
        courseId: COURSE_ID,
        stage: 'stage_2',
        phase: 'stage_2_summarization_quality',
      },
    });

    expect(logTraceMock).toHaveBeenCalledTimes(2);
    for (const [row] of logTraceMock.mock.calls) {
      expect(row.courseId).toBe(COURSE_ID);
      expect(row.phase).toBe('stage_2_summarization_quality');
      expect(row.inputData).toMatchObject({ provider: 'jina', operation: 'embedding' });
    }
  });

  it('still runs, and records nothing, for a caller that has no course', async () => {
    const { QualityValidator } = await import('@/shared/validation/quality-validator');

    const result = await new QualityValidator().detectOverlapFromTexts(
      ['Variables and types', 'Control flow'],
      ['Section 1', 'Section 2']
    );

    expect(result.overlapThreshold).toBeGreaterThan(0);
    expect(logTraceMock).not.toHaveBeenCalled();
  });
});
