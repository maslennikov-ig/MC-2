/**
 * Contract: a Career Playbook attempt is priced by the endpoint it was pinned
 * to, not by the mainstream rate it will not be billed at.
 *
 * The playbook pins one endpoint per attempt with `allow_fallbacks: false` — it
 * has done since the 238s provider hang (mc2-6crnj) — and then priced the result
 * from `MODEL_CATALOG`, which holds what the mainstream providers charge while
 * the pin routes to the cheapest. Measured live on 2026-08-25, `z-ai/glm-5.2`
 * is catalogued at $1.19/$3.74 and served by `sail-research/fp8` at
 * $0.50/$3.15; `deepseek-v4-flash-0731` at $0.14/$0.28 against a served
 * $0.035/$0.100, four times over.
 *
 * The receipt corrects it later — `settleCareerPlaybookNodeCosts` collects every
 * generation record once the run is over — but only for an attempt that produced
 * one. An aborted attempt never does, and the playbook records those on purpose
 * so the total is not silently short.
 */

import { describe, expect, it } from 'vitest';

import { settleSuccessfulAttempt } from '@/stages/stage-career-playbook/nodes/runtime-attempt';
import type { CareerPlaybookLLMCallOptions } from '@/stages/stage-career-playbook/nodes/runtime';

const OPTIONS: CareerPlaybookLLMCallOptions = {
  phaseName: 'stage_career_playbook_spec',
  promptKey: 'career_playbook_spec',
  node: 'spec',
};

function settle(overrides: { endpointRate?: { prompt: number; completion: number } }) {
  return settleSuccessfulAttempt({
    invocation: {
      content: 'result',
      usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
    },
    options: OPTIONS,
    modelId: 'z-ai/glm-5.2',
    attempt: 0,
    promptTokens: 1_000_000,
    generationId: undefined,
    attemptStartedAt: 0,
    callStartedAt: 0,
    abortedAttempts: [],
    ...overrides,
  });
}

describe('a settled Career Playbook attempt', () => {
  it('is priced by the endpoint that will bill it', () => {
    // sail-research/fp8, the endpoint the pin chose: 0.50 + 3.15.
    expect(settle({ endpointRate: { prompt: 0.5, completion: 3.15 } }).costUsd).toBeCloseTo(
      3.65,
      10
    );
  });

  it('falls back to the catalogue when nothing was pinned', () => {
    // glm-5.2 is catalogued at 1.19 + 3.74. Without a pin we do not know who
    // will serve it, so the mainstream rate stands and waits for the receipt.
    expect(settle({}).costUsd).toBeCloseTo(4.93, 10);
  });

  it('does not quietly agree with the catalogue', () => {
    // The guard against this test passing for the wrong reason: the two figures
    // have to differ, or neither assertion above proves anything.
    expect(settle({ endpointRate: { prompt: 0.5, completion: 3.15 } }).costUsd).not.toBeCloseTo(
      settle({}).costUsd,
      6
    );
  });
});
