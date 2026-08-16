/**
 * Contract: a model that turns out to require reasoning costs one refused call,
 * not a live course.
 *
 * `MODEL_CATALOG.requiresReasoning` is a hand-kept fact about someone else's
 * service. It is right today because every catalogued model was measured
 * against the live API on 2026-08-15, and OpenRouter's `supported_parameters`
 * cannot tell the two kinds apart — so the next model added brings the defect
 * back, and last time it cost a paid run (mc2-2pplo).
 */

import { describe, expect, it, beforeEach } from 'vitest';

import {
  forgetLearnedMandatoryReasoning,
  isMandatoryReasoningRejection,
  rememberMandatoryReasoning,
  requiresReasoningNow,
} from '@/shared/llm/mandatory-reasoning-recovery';
import { applyMandatoryReasoningFloor } from '@/shared/llm/client-helpers';

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

const UNFLAGGED = 'some-vendor/some-new-thinker';

describe('mandatory reasoning recovery', () => {
  beforeEach(forgetLearnedMandatoryReasoning);

  it('recognises the refusal by what the provider actually says', () => {
    expect(
      isMandatoryReasoningRejection(
        new ApiError(400, 'Reasoning is mandatory for this endpoint and cannot be disabled')
      )
    ).toBe(true);
  });

  it('is not fooled by any other bad request', () => {
    expect(isMandatoryReasoningRejection(new ApiError(400, 'max_tokens is too large'))).toBe(false);
    expect(isMandatoryReasoningRejection(new ApiError(429, 'rate limited'))).toBe(false);
    expect(isMandatoryReasoningRejection(new Error('reasoning budget exceeded'))).toBe(false);
  });

  it('learns the model, so the next request asks for the least deliberation', () => {
    expect(requiresReasoningNow(UNFLAGGED)).toBe(false);

    expect(rememberMandatoryReasoning(UNFLAGGED)).toBe(true);

    expect(requiresReasoningNow(UNFLAGGED)).toBe(true);
  });

  it('says it is not news the second time, so a retry is not made forever', () => {
    rememberMandatoryReasoning(UNFLAGGED);

    expect(rememberMandatoryReasoning(UNFLAGGED)).toBe(false);
  });

  it('has nothing to learn about a model the catalogue already flags', () => {
    expect(requiresReasoningNow('google/gemini-3.7-flash')).toBe(true);
    expect(rememberMandatoryReasoning('google/gemini-3.7-flash')).toBe(false);
  });

  it('grows the answer budget when it asks for the floor, because it is billed', () => {
    const request = { model: UNFLAGGED, messages: [], max_tokens: 1_000 } as never;

    applyMandatoryReasoningFloor(request, UNFLAGGED);

    expect(request).toMatchObject({ reasoning: { effort: 'low' } });
    expect((request as { max_tokens: number }).max_tokens).toBeGreaterThan(1_000);
  });
});
