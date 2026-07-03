import {
  CareerPlaybookCostBreakdownSchema,
  type CareerPlaybookCostBreakdown,
  type CareerPlaybookNodeCost,
} from '@megacampus/shared-types';

/**
 * Single source of truth for the Career Playbook "resum" step: total spend is
 * always the sum of every node cost's `cost_usd`.
 */
export function sumCareerPlaybookNodeCosts(nodeCosts: CareerPlaybookNodeCost[]): number {
  return nodeCosts.reduce((sum, nodeCost) => sum + nodeCost.cost_usd, 0);
}

/**
 * Append a node cost to an existing cost breakdown and recompute the total.
 * Tolerates a missing/invalid prior breakdown by starting a fresh one, so
 * follow-up rounds accumulate spend instead of discarding it.
 */
export function appendCareerPlaybookNodeCost(
  existing: unknown,
  nodeCost: CareerPlaybookNodeCost
): CareerPlaybookCostBreakdown {
  const parsed = CareerPlaybookCostBreakdownSchema.safeParse(existing);
  const nodeCosts = [...(parsed.success ? parsed.data.nodeCosts : []), nodeCost];

  return {
    nodeCosts,
    total_cost_usd: sumCareerPlaybookNodeCosts(nodeCosts),
  };
}
