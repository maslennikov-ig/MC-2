import { describe, expect, it } from 'vitest';
import type { CareerPlaybookNodeCost } from '@megacampus/shared-types';
import {
  appendCareerPlaybookNodeCost,
  sumCareerPlaybookNodeCosts,
} from '@/server/routers/career-playbook/cost-breakdown';

function nodeCost(overrides: Partial<CareerPlaybookNodeCost> = {}): CareerPlaybookNodeCost {
  return {
    node: 'blockRegenerator',
    model: 'mock-career-model',
    input_tokens: 10,
    output_tokens: 5,
    cost_usd: 0.01,
    ...overrides,
  };
}

describe('appendCareerPlaybookNodeCost', () => {
  it('preserves regeneration_attempts and per-node telemetry across a manual regeneration', () => {
    const existing = {
      nodeCosts: [nodeCost({ cost_usd: 0.02, duration_ms: 1200, attempts: 1 })],
      total_cost_usd: 0.02,
      regeneration_attempts: { block_6: 2 },
    };

    const next = appendCareerPlaybookNodeCost(
      existing,
      nodeCost({ cost_usd: 0.03, duration_ms: 900, attempts: 1 })
    );

    // The known bug this fixes: regeneration_attempts must survive the append.
    expect(next.regeneration_attempts).toEqual({ block_6: 2 });
    expect(next.nodeCosts).toHaveLength(2);
    expect(next.nodeCosts[0]).toMatchObject({ duration_ms: 1200, attempts: 1 });
    expect(next.nodeCosts[1]).toMatchObject({ duration_ms: 900, attempts: 1 });
    expect(next.total_cost_usd).toBeCloseTo(0.05, 10);
  });

  it('appends to a legacy breakdown that lacks the new fields', () => {
    const legacy = {
      nodeCosts: [nodeCost({ cost_usd: 0.02 })],
      total_cost_usd: 0.02,
    };

    const next = appendCareerPlaybookNodeCost(legacy, nodeCost({ cost_usd: 0.03 }));

    expect(next.nodeCosts).toHaveLength(2);
    expect(next.total_cost_usd).toBeCloseTo(0.05, 10);
    expect(next.regeneration_attempts).toBeUndefined();
  });

  it('starts a fresh breakdown when the prior value is missing or invalid', () => {
    const next = appendCareerPlaybookNodeCost('not-a-breakdown', nodeCost({ cost_usd: 0.04 }));

    expect(next.nodeCosts).toHaveLength(1);
    expect(next.total_cost_usd).toBeCloseTo(0.04, 10);
    expect(next.regeneration_attempts).toBeUndefined();
  });
});

describe('sumCareerPlaybookNodeCosts', () => {
  it('sums cost_usd across node costs', () => {
    expect(
      sumCareerPlaybookNodeCosts([
        nodeCost({ cost_usd: 0.02 }),
        nodeCost({ cost_usd: 0.03, duration_ms: 500, attempts: 2 }),
      ])
    ).toBeCloseTo(0.05, 10);
  });
});
