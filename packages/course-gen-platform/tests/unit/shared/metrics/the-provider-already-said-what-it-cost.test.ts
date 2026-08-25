/**
 * Contract: when OpenRouter states the charge, we record the charge.
 *
 * Every completion body carries `usage.cost`. Measured 2026-08-25 on the live
 * API: present with and without `usage: {include: true}`, and equal to what
 * `GET /api/v1/generation` reports eleven seconds later — $0.000004257 both
 * times, on the same 13+5 tokens. It arrives in the response we are already
 * reading, for nothing.
 *
 * It was being thrown away. The row got a catalogue estimate, and a deferred
 * lookup went back to OpenRouter for the number that had been in the first
 * answer. Worse, that lookup needs a generation id, and over the fortnight to
 * 2026-08-25 the 92 rows that never settled had captured one **once**:
 *
 *   stage_4_expert            15 rows, 0 with a generation id
 *   stage_6_content           13 rows, 1
 *   stage_4_scope             10 rows, 0
 *
 * So for those rows the receipt was never going to arrive, and the estimate was
 * the permanent record — 17% of the reported spend on a number the provider had
 * already corrected in the same breath.
 */

import { describe, expect, it } from 'vitest';

import { calculateLlmCostUsd, estimateLlmCostUsd } from '@/shared/metrics/llm-cost';

const LUNA = 'openai/gpt-5.6-luna';

describe('a call the provider priced', () => {
  it('is recorded at the stated charge, not at any estimate of it', () => {
    expect(
      calculateLlmCostUsd({
        model: LUNA,
        inputTokens: 13,
        outputTokens: 5,
        actualCostUsd: 0.000004257,
      })
    ).toBe(0.000004257);
  });

  it('overrides the pinned endpoint rate, which is only ever a prediction', () => {
    // The endpoint rate would give 13*0.10 + 5*0.60 per million = 0.0000043.
    // The provider charged 0.000004257 — the difference is a cache discount the
    // rate card cannot know about.
    const stated = calculateLlmCostUsd({
      model: LUNA,
      inputTokens: 13,
      outputTokens: 5,
      actualCostUsd: 0.000004257,
      endpointRate: { prompt: 0.1, completion: 0.6 },
    });

    expect(stated).toBe(0.000004257);
    expect(stated).not.toBeCloseTo(0.0000043, 12);
  });

  it('records a genuine zero as a measurement rather than falling through', () => {
    // A $0 charge is a fact — a fully cached read, or a free-tier route. Treating
    // it as "no figure" and estimating instead is the bug that once corrupted the
    // very query used to find unpriced calls (mc2-y452l).
    expect(
      calculateLlmCostUsd({ model: LUNA, inputTokens: 13, outputTokens: 5, actualCostUsd: 0 })
    ).toBe(0);
  });

  it('can still be asked what it was predicted to cost', () => {
    // The row keeps both numbers. The prediction is the only thing that can show
    // a catalogue entry has drifted, and it cannot do that from a field that was
    // overwritten with the charge it was meant to be compared against.
    const usage = {
      model: LUNA,
      inputTokens: 1_000_000,
      outputTokens: 0,
      actualCostUsd: 0.000004257,
    };

    expect(calculateLlmCostUsd(usage)).toBe(0.000004257);
    expect(estimateLlmCostUsd(usage)).toBeCloseTo(0.2, 10);
  });

  it('still estimates when no body arrived to state a charge', () => {
    // An aborted or timed-out call has no `usage` at all. That is the case the
    // endpoint rate and the catalogue exist for, and the one where the deferred
    // receipt lookup earns its keep.
    expect(
      calculateLlmCostUsd({
        model: LUNA,
        inputTokens: 1_000_000,
        outputTokens: 0,
        endpointRate: { prompt: 0.1, completion: 0.6 },
      })
    ).toBeCloseTo(0.1, 10);
  });
});
