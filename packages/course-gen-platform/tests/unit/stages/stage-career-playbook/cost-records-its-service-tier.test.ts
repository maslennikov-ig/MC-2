/**
 * Contract: the settled cost ledger says which tier served the call.
 *
 * On 2026-08-30 a run was audited for whether it used the flex tier. Not one of
 * its 64 cost rows named a tier, which read as "flex was never asked for" — and
 * the conclusion was reported as fact. It was wrong: every luna call in that run
 * had been served by `openai/flex` at half rate, as `GET /api/v1/generation`
 * said plainly when finally asked. The routing decision had been in place for
 * five days.
 *
 * The receipt lookup already happens, once, when the run is over. Keeping the
 * tier it returns costs nothing and makes the question answerable from the
 * stored row instead of from arithmetic on a total.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { CareerPlaybookNodeCost } from '@megacampus/shared-types';

const { fetchGenerationFactMock } = vi.hoisted(() => ({
  fetchGenerationFactMock: vi.fn(),
}));

vi.mock('@/shared/llm/openrouter-generation', () => ({
  fetchGenerationFact: fetchGenerationFactMock,
}));

const { settleCareerPlaybookNodeCosts } = await import(
  '@/stages/stage-career-playbook/nodes/runtime-attempt'
);

function cost(overrides: Partial<CareerPlaybookNodeCost> = {}): CareerPlaybookNodeCost {
  return {
    node: 'crossBlockJudge',
    model: 'openai/gpt-5.6-luna',
    input_tokens: 33_000,
    output_tokens: 1_600,
    cost_usd: 0.0058882,
    generation_id: 'gen-1',
    ...overrides,
  };
}

describe('settleCareerPlaybookNodeCosts', () => {
  beforeEach(() => {
    fetchGenerationFactMock.mockReset();
  });

  it('records the tier the receipt names, alongside the price it names', () => {
    fetchGenerationFactMock.mockResolvedValue({
      usageUsd: 0.004876616,
      providerName: 'OpenAI',
      serviceTier: 'flex',
    });

    return settleCareerPlaybookNodeCosts([cost()]).then(([settled]) => {
      expect(settled.service_tier).toBe('flex');
      expect(settled.provider_name).toBe('OpenAI');
      expect(settled.cost_usd).toBe(0.004876616);
      expect(settled.billed_by_provider).toBe(true);
    });
  });

  it('leaves the field absent for a provider that offers no tier', async () => {
    fetchGenerationFactMock.mockResolvedValue({
      usageUsd: 0.0003,
      providerName: 'DeepInfra',
      serviceTier: null,
    });

    const [settled] = await settleCareerPlaybookNodeCosts([cost({ model: 'z-ai/glm-5.3-flash' })]);

    expect(settled.service_tier).toBeUndefined();
    expect(settled.provider_name).toBe('DeepInfra');
  });

  it('does not invent a tier when no receipt could be collected', async () => {
    fetchGenerationFactMock.mockResolvedValue(null);

    const [settled] = await settleCareerPlaybookNodeCosts([cost()]);

    expect(settled.service_tier).toBeUndefined();
    expect(settled.cost_usd).toBe(0.0058882);
    expect(settled.billed_by_provider).toBeUndefined();
  });
});
