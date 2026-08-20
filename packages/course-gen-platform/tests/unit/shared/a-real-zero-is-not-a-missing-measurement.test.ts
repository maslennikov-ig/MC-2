/**
 * Contract: a measured zero reaches the ledger as 0, not as NULL.
 *
 * `logTrace` built its insert with `||`, and 0 is falsy. A call that genuinely
 * cost $0, produced 0 tokens, ran at temperature 0 or scored 0 was written as
 * NULL — the same value a call that was never measured leaves behind.
 *
 * That is not a cosmetic difference. The diagnostic used to find pricing holes
 * counts rows with tokens and no price; with `||` it could not tell a free call
 * from an unpriced one, so the metric that finds the bug was itself corrupted by
 * the bug (mc2-y452l).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { insert, from } = vi.hoisted(() => {
  const insert = vi.fn(() => Promise.resolve({ error: null }));
  return { insert, from: vi.fn(() => ({ insert })) };
});

vi.mock('@/shared/supabase/admin', () => ({ getSupabaseAdmin: () => ({ from }) }));

vi.mock('@/shared/logger', () => {
  const stub = { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  return { logger: stub, default: stub };
});

import { logTrace } from '@/shared/trace-logger';

const COURSE_ID = '30000000-0000-4000-8000-000000000001';

const BASE = {
  courseId: COURSE_ID,
  stage: 'stage_6' as const,
  phase: 'stage_6_complex',
  stepName: 'llm_call',
  durationMs: 10,
};

/** The row `logTrace` handed to Supabase. */
async function insertedRow(params: Parameters<typeof logTrace>[0]) {
  await logTrace(params);
  expect(insert).toHaveBeenCalledTimes(1);
  return insert.mock.calls[0][0] as Record<string, unknown>;
}

describe('a zero that was measured', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insert.mockResolvedValue({ error: null });
  });

  it('records a $0 call as 0, so it is not counted as unpriced', async () => {
    const row = await insertedRow({ ...BASE, costUsd: 0, tokensUsed: 1_500 });

    expect(row.cost_usd).toBe(0);
    expect(row.cost_usd).not.toBeNull();
  });

  it('records a call that produced no tokens as 0', async () => {
    const row = await insertedRow({ ...BASE, tokensUsed: 0, costUsd: 0.004 });

    expect(row.tokens_used).toBe(0);
  });

  it('keeps temperature 0, which is the ordinary value for a deterministic call', async () => {
    const row = await insertedRow({ ...BASE, temperature: 0 });

    expect(row.temperature).toBe(0);
  });

  it('keeps a quality score of 0, which is a verdict and not a missing one', async () => {
    const row = await insertedRow({ ...BASE, qualityScore: 0 });

    expect(row.quality_score).toBe(0);
  });
});

describe('a value that was genuinely not supplied', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insert.mockResolvedValue({ error: null });
  });

  it('still becomes NULL, so the two stay distinguishable', async () => {
    const row = await insertedRow(BASE);

    expect(row.cost_usd).toBeNull();
    expect(row.tokens_used).toBeNull();
    expect(row.temperature).toBeNull();
    expect(row.quality_score).toBeNull();
  });

  it('leaves the two fields whose falsy value is their default alone', async () => {
    const row = await insertedRow(BASE);

    // Not `null`: a first attempt is attempt 0 and an uncached call is `false`.
    expect(row.retry_attempt).toBe(0);
    expect(row.was_cached).toBe(false);
  });
});
