/**
 * Contract: an LLM call made with a course context leaves a priced trace row.
 *
 * The tracking path was written and dead — `costTracker.recordStageCost` had no
 * production caller — so `generation_trace.cost_usd` was empty in all but 162 of
 * 37107 rows and `courses.estimated_cost_usd` was null for every course. The
 * only cost figure available was the provider's key counter, which knows
 * nothing about courses, stages or models (mc2-o7740).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const logTrace = vi.fn(async () => undefined);
vi.mock('@/shared/trace-logger', () => ({ logTrace }));

const debug = vi.fn();
const warn = vi.fn();
vi.mock('@/shared/logger', () => {
  const stub = { debug, warn, info: vi.fn(), error: vi.fn() };
  return { logger: stub, default: stub };
});

const COURSE_ID = '20000000-0000-4000-8000-000000000001';

describe('recordLlmCallCost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prices the call from MODEL_CATALOG and traces model and both token counts', async () => {
    const { recordLlmCallCost } = await import('@/shared/metrics/llm-cost');

    await recordLlmCallCost(
      { model: 'openai/gpt-5.6-luna', inputTokens: 1_000_000, outputTokens: 1_000_000 },
      { courseId: COURSE_ID, stage: 'stage_6', phase: 'stage_6_complex' }
    );

    expect(logTrace).toHaveBeenCalledTimes(1);
    const [entry] = logTrace.mock.calls[0] as [Record<string, unknown>];
    expect(entry).toMatchObject({
      courseId: COURSE_ID,
      stage: 'stage_6',
      phase: 'stage_6_complex',
      modelUsed: 'openai/gpt-5.6-luna',
      tokensUsed: 2_000_000,
      inputData: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
    });
    // Catalogue price for gpt-5.6-luna: $0.10 in, $0.60 out per million.
    expect(entry.costUsd).toBeCloseTo(0.7, 10);
  });

  it('charges input and output at their own rates', async () => {
    const { calculateLlmCostUsd } = await import('@/shared/metrics/llm-cost');

    // glm-5.2 is $0.63 in and $1.98 out per million: judging reads a lesson and
    // writes little, so the two rates are not interchangeable.
    expect(
      calculateLlmCostUsd({ model: 'z-ai/glm-5.2', inputTokens: 1_000_000, outputTokens: 0 })
    ).toBeCloseTo(0.63, 10);
    expect(
      calculateLlmCostUsd({ model: 'z-ai/glm-5.2', inputTokens: 0, outputTokens: 1_000_000 })
    ).toBeCloseTo(1.98, 10);
  });

  it('reports a call it cannot attribute instead of dropping it silently', async () => {
    const { recordLlmCallCost } = await import('@/shared/metrics/llm-cost');

    await recordLlmCallCost({
      model: 'openai/gpt-5.6-luna',
      inputTokens: 100,
      outputTokens: 50,
    });

    expect(logTrace).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledTimes(1);
    expect(debug.mock.calls[0][0]).toMatchObject({ model: 'openai/gpt-5.6-luna' });
  });

  it('still traces an uncatalogued model, and says so', async () => {
    const { recordLlmCallCost } = await import('@/shared/metrics/llm-cost');

    await recordLlmCallCost(
      { model: 'vendor/not-in-the-catalogue', inputTokens: 10, outputTokens: 5 },
      { courseId: COURSE_ID, stage: 'stage_5', phase: 'stage_5_sections' }
    );

    expect(warn).toHaveBeenCalledTimes(1);
    const [entry] = logTrace.mock.calls[0] as [Record<string, unknown>];
    expect(entry.modelUsed).toBe('vendor/not-in-the-catalogue');
    expect(entry.costUsd).toBeUndefined();
  });
});
