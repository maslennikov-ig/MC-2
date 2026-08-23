/**
 * `stage_5_escalation` is in the chain Stage 5 actually uses (mc2-9yrgb).
 *
 * The phase had six active rows in `llm_model_config` and a screen in
 * pipeline-admin, and nothing ever asked for it: `escalateToLargerModel` takes
 * its chain from the caller, and no caller named this phase. Stage 5 escalated
 * to `stage_4_expert` instead — same primary model that had just failed, and a
 * smaller output budget than a normal attempt gets.
 *
 * Two things are worth holding here, and they are different:
 *   - that the phase is reachable at all, which is the defect;
 *   - that its budget fits the models it routes to, which is the trap the plan
 *     said to check BEFORE making it reachable. Wiring up a phase whose output
 *     budget exceeds the model's ceiling swaps silent inaction for a loud
 *     refusal on a live course, which is worse.
 *
 * This is a unit test, so it proves the wiring, not the behaviour. The
 * behavioural proof is a run in which Stage 5 really escalated.
 */
import { describe, expect, it } from 'vitest';

import { getModelCapabilities } from '@megacampus/shared-types';

import { getEscalationChain } from '@/shared/regeneration/layers/layer-4-model-escalation';

/**
 * The output budget `stage_5_escalation` carries in `llm_model_config`, read
 * from the live table on 2026-08-23 — six active rows, all 30000, reasoning on
 * with a reserved 8000. Restated here because the ceiling check below is only
 * meaningful against the number the database really asks for.
 */
const ESCALATION_MAX_OUTPUT_TOKENS = 30_000;

/** The models those rows route to: primary, and the cross-vendor fallback. */
const ESCALATION_MODEL_IDS = [
  'openai/gpt-5.6-luna',
  'z-ai/glm-5.2',
  'deepseek/deepseek-v4-flash-0731',
] as const;

describe('Stage 5 escalation', () => {
  it('reaches stage_5_escalation before the old expert hop', () => {
    const chain = getEscalationChain('generation');

    expect(chain[0]).toBe('stage_5_escalation');
  });

  it('keeps stage_4_expert behind it rather than replacing it', () => {
    // If the escalation phase cannot be resolved, the fallback is the behaviour
    // that has been running for months, not an exception out of Layer 4.
    expect(getEscalationChain('generation')).toEqual(['stage_5_escalation', 'stage_4_expert']);
  });

  it('does not change how the analyze stage escalates', () => {
    expect(getEscalationChain('analyze', 'stage_4_scope')).toEqual(['stage_4_expert']);
    expect(getEscalationChain('analyze', 'stage_4_expert')).toEqual([]);
  });

  it.each(ESCALATION_MODEL_IDS)('%s can emit the budget the phase asks for', modelId => {
    const ceiling = getModelCapabilities(modelId)?.maxOutputTokens;

    expect(ceiling, `${modelId} is not in MODEL_CATALOG`).toBeTypeOf('number');
    expect(ceiling).toBeGreaterThanOrEqual(ESCALATION_MAX_OUTPUT_TOKENS);
  });
});
