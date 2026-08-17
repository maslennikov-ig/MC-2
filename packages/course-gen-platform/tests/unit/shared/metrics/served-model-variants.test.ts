/**
 * Contract: a served variant of a catalogued model still has a price.
 *
 * The price follows the model the provider actually served, which is not always
 * what was asked for: `deepseek/deepseek-v4-flash` came back as
 * `deepseek/deepseek-v4-flash-0731`, and that is not a catalogue key, so the row
 * was written with no price at all and vanished from the course total. Measured
 * on the paid run of 2026-08-17 (mc2-b7olk.6).
 *
 * The base entry is a floor, not the truth — the 0731 snapshot is billed at 1.7×
 * the alias it stands in for — so the call is priced and the mismatch is logged
 * for the catalogue to fix.
 */

import { describe, expect, it } from 'vitest';
import {
  getModelCapabilities,
  hasExactModelPricing,
  normalizeModelId,
} from '@megacampus/shared-types';
import { calculateLlmCostUsd } from '@/shared/metrics/llm-cost';

describe('a served model variant', () => {
  it('is priced from its base model rather than not at all', () => {
    const cost = calculateLlmCostUsd({
      model: 'deepseek/deepseek-v4-flash-0731',
      inputTokens: 7293,
      outputTokens: 137,
    });

    expect(cost).toBeGreaterThan(0);
  });

  it('says the price is not its own, so the catalogue can gain the entry', () => {
    expect(hasExactModelPricing('deepseek/deepseek-v4-flash-0731')).toBe(false);
    expect(hasExactModelPricing('deepseek/deepseek-v4-flash')).toBe(true);
  });

  it('reads a router alias and a batch suffix as the same model', () => {
    expect(normalizeModelId('~deepseek/deepseek-v4-flash-latest')).toBe(
      'deepseek/deepseek-v4-flash'
    );
    expect(normalizeModelId('openai/gpt-5.6-luna:batch')).toBe('openai/gpt-5.6-luna');
    expect(getModelCapabilities('openai/gpt-5.6-luna:batch')).not.toBeNull();
  });

  it('does not confuse a different model for a variant of this one', () => {
    expect(getModelCapabilities('z-ai/glm-5.2-air')).toBeNull();
    expect(normalizeModelId('z-ai/glm-5.2')).toBe('z-ai/glm-5.2');
  });
});
