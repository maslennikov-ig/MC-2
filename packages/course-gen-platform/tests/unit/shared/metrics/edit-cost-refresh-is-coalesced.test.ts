/**
 * Contract: a chat turn re-sums the course once, after both its calls.
 *
 * An edit has no job to refresh `courses.estimated_cost_usd`, so the cost path
 * refreshes it itself (mc2-b7olk.5). The refresh is a SUM over every
 * `generation_trace` row the course has, and one turn is at least two priced
 * calls — the intent classification and the answer — so doing it per call read
 * the whole history twice for one turn, and got slower the longer the course had
 * been worked on (mc2-m8fi5).
 *
 * Coalescing has to keep the total right, not just cheap: the one re-sum that
 * runs must read the table after both new rows are in it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { logTrace, updateCourseEstimatedCost } = vi.hoisted(() => ({
  logTrace: vi.fn(() => Promise.resolve(undefined)),
  updateCourseEstimatedCost: vi.fn(
    (_courseId: string): Promise<number | undefined> => Promise.resolve(0)
  ),
}));

vi.mock('@/shared/trace-logger', () => ({ logTrace }));
vi.mock('@/services/token-tracking-service', () => ({ updateCourseEstimatedCost }));

vi.mock('@/shared/logger', () => {
  const stub = { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  return { logger: stub, default: stub };
});

import {
  EDIT_REFRESH_DEBOUNCE_MS,
  EDIT_REFRESH_RETRY_DELAY_MS,
  recordLlmCallCost,
} from '@/shared/metrics/llm-cost';

const COURSE_ID = '20000000-0000-4000-8000-000000000001';
const OTHER_COURSE_ID = '20000000-0000-4000-8000-000000000002';

const USAGE = { model: 'openai/gpt-5.6-luna', inputTokens: 1_000, outputTokens: 500 };

function editContext(courseId = COURSE_ID) {
  return { courseId, stage: 'stage_edit' as const, phase: 'chat_stage_6_refinement' };
}

describe('the course total after an edit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    updateCourseEstimatedCost.mockResolvedValue(0);
  });

  afterEach(async () => {
    // Let anything still waiting run, so it cannot land in the next test.
    updateCourseEstimatedCost.mockResolvedValue(0);
    await vi.advanceTimersByTimeAsync(EDIT_REFRESH_DEBOUNCE_MS + EDIT_REFRESH_RETRY_DELAY_MS * 2);
    vi.useRealTimers();
  });

  it('re-sums once for two priced calls in the same turn', async () => {
    await recordLlmCallCost(USAGE, editContext());
    await recordLlmCallCost(USAGE, editContext());

    await vi.advanceTimersByTimeAsync(EDIT_REFRESH_DEBOUNCE_MS);

    expect(updateCourseEstimatedCost).toHaveBeenCalledTimes(1);
    expect(updateCourseEstimatedCost).toHaveBeenCalledWith(COURSE_ID);
  });

  it('re-sums after both trace rows exist, not between them', async () => {
    await recordLlmCallCost(USAGE, editContext());
    await recordLlmCallCost(USAGE, editContext());

    // The sum is the source of truth for the column, so a re-sum that ran
    // before the second row would write a total that is short by one call.
    expect(logTrace).toHaveBeenCalledTimes(2);
    expect(updateCourseEstimatedCost).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(EDIT_REFRESH_DEBOUNCE_MS);

    expect(updateCourseEstimatedCost).toHaveBeenCalledTimes(1);
  });

  it('never makes the caller wait for accounting', async () => {
    await recordLlmCallCost(USAGE, editContext());

    // recordLlmCallCost resolved with the refresh still pending; a chat turn
    // does not pay for the course's history.
    expect(updateCourseEstimatedCost).not.toHaveBeenCalled();
  });

  it("keeps one course out of another course's re-sum", async () => {
    await recordLlmCallCost(USAGE, editContext());
    await recordLlmCallCost(USAGE, editContext(OTHER_COURSE_ID));

    await vi.advanceTimersByTimeAsync(EDIT_REFRESH_DEBOUNCE_MS);

    expect(updateCourseEstimatedCost.mock.calls.map(call => call[0]).sort()).toEqual([
      COURSE_ID,
      OTHER_COURSE_ID,
    ]);
  });

  it('tries once more when the re-sum could not write', async () => {
    // `updateCourseEstimatedCost` returns undefined when it did not write — it
    // leaves a real recorded cost alone rather than replacing it with the zero
    // a failed read reports. Nothing else would come back for it: the last edit
    // of a session has no later stage run to put the total right.
    updateCourseEstimatedCost.mockResolvedValueOnce(undefined);

    await recordLlmCallCost(USAGE, editContext());
    await vi.advanceTimersByTimeAsync(EDIT_REFRESH_DEBOUNCE_MS);
    expect(updateCourseEstimatedCost).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(EDIT_REFRESH_RETRY_DELAY_MS);

    expect(updateCourseEstimatedCost).toHaveBeenCalledTimes(2);
  });

  it('gives up after that one retry rather than looping', async () => {
    // Accounting freshness, not a durability guarantee. The trace rows are
    // already in the table; only the course total is stale.
    updateCourseEstimatedCost.mockResolvedValue(undefined);

    await recordLlmCallCost(USAGE, editContext());
    await vi.advanceTimersByTimeAsync(EDIT_REFRESH_DEBOUNCE_MS + EDIT_REFRESH_RETRY_DELAY_MS * 5);

    expect(updateCourseEstimatedCost).toHaveBeenCalledTimes(2);
  });

  it('does not retry a re-sum that wrote', async () => {
    await recordLlmCallCost(USAGE, editContext());
    await vi.advanceTimersByTimeAsync(EDIT_REFRESH_DEBOUNCE_MS + EDIT_REFRESH_RETRY_DELAY_MS * 2);

    expect(updateCourseEstimatedCost).toHaveBeenCalledTimes(1);
  });

  it('leaves a pipeline stage to the job that owns it', async () => {
    await recordLlmCallCost(USAGE, {
      courseId: COURSE_ID,
      stage: 'stage_6',
      phase: 'stage_6_complex',
    });

    await vi.advanceTimersByTimeAsync(EDIT_REFRESH_DEBOUNCE_MS);

    expect(logTrace).toHaveBeenCalledTimes(1);
    expect(updateCourseEstimatedCost).not.toHaveBeenCalled();
  });
});
