import {
  CareerPlaybookCostBreakdownSchema,
  type CareerPlaybookCostBreakdown,
  type CareerPlaybookNodeCost,
} from '@megacampus/shared-types';

/**
 * Single source of truth for the Career Playbook "resum" step: total spend is
 * always the sum of every node cost's `cost_usd`.
 *
 * Aborted attempts carry `cost_usd: 0` and `cost_unknown: true`. They are not
 * summed — a fabricated estimate would be worse than an honest gap — so the
 * total is a lower bound whenever `unknown_cost_attempts` is non-zero.
 */
export function sumCareerPlaybookNodeCosts(nodeCosts: CareerPlaybookNodeCost[]): number {
  return nodeCosts.reduce((sum, nodeCost) => sum + nodeCost.cost_usd, 0);
}

/** How many recorded attempts have a cost the application cannot account for. */
export function countCareerPlaybookUnknownCostAttempts(
  nodeCosts: CareerPlaybookNodeCost[]
): number {
  return nodeCosts.filter(nodeCost => nodeCost.cost_unknown === true).length;
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
  const priorBreakdown = parsed.success ? parsed.data : null;
  const nodeCosts = [...(priorBreakdown?.nodeCosts ?? []), nodeCost];

  // Spread the parsed prior breakdown so schema-known extras (e.g.
  // regeneration_attempts) survive a manual single-block regeneration instead of
  // being dropped when only nodeCosts/total are rewritten.
  return {
    ...(priorBreakdown ?? {}),
    nodeCosts,
    total_cost_usd: sumCareerPlaybookNodeCosts(nodeCosts),
    unknown_cost_attempts: countCareerPlaybookUnknownCostAttempts(nodeCosts),
  };
}
