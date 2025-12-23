import type { ArbiterOutput } from '@megacampus/shared-types';
import { REFINEMENT_CONFIG } from '@megacampus/shared-types';
import { logger } from '../../../../shared/logger';

/**
 * Calculate iteration score using heuristics (no LLM call)
 */
export function calculateHeuristicScore(
  arbiterOutput: ArbiterOutput,
  iteration: number,
  tasksCompletedThisIteration: number,
  totalLockedSections: number
): number {
  // Validate inputs
  if (!arbiterOutput || !arbiterOutput.plan) {
    return 0.5;
  }

  // Base score from agreement level
  const baseScore = arbiterOutput.agreementScore >= 0.80 ? 0.75 :
                    arbiterOutput.agreementScore >= 0.67 ? 0.70 : 0.65;

  // Progress bonus based on tasks completed this iteration
  const totalTasks = arbiterOutput.plan.tasks.length;
  const progressRatio = totalTasks > 0 ? tasksCompletedThisIteration / totalTasks : 0;
  const progressBonus = progressRatio * 0.10;

  // Iteration bonus (diminishing returns: +0.03 per iteration, max 3 iterations)
  const iterationBonus = Math.min(iteration, 3) * 0.03;

  // Locked sections bonus (locked = stable quality)
  const lockedBonus = totalLockedSections > 0 ? 0.02 : 0;

  // Calculate final score, cap at 0.95
  const finalScore = Math.min(0.95, baseScore + progressBonus + iterationBonus + lockedBonus);

  logger.debug({
    baseScore,
    progressBonus,
    iterationBonus,
    lockedBonus,
    finalScore,
    iteration,
    tasksCompletedThisIteration,
  }, 'Calculated heuristic score');

  return finalScore;
}

/**
 * Detect score oscillation pattern
 */
export function detectScoreOscillation(scoreHistory: number[]): {
  detected: boolean;
  previousScore?: number;
  improvedScore?: number;
} {
  // Need at least 3 data points to detect oscillation
  if (scoreHistory.length < 3) {
    return { detected: false };
  }

  // Tolerance threshold to avoid false positives from minor score fluctuations
  const OSCILLATION_TOLERANCE = REFINEMENT_CONFIG.quality.oscillationTolerance;

  // Get last 3 scores
  const len = scoreHistory.length;
  const previousScore = scoreHistory[len - 3]; // N-2
  const improvedScore = scoreHistory[len - 2]; // N-1
  const currentScore = scoreHistory[len - 1];  // N

  // Check if score improved in N-1, then dropped in N (with tolerance)
  const hadImprovement = improvedScore > previousScore + OSCILLATION_TOLERANCE;
  const hadRegression = currentScore < improvedScore - OSCILLATION_TOLERANCE;

  if (hadImprovement && hadRegression) {
    return {
      detected: true,
      previousScore,
      improvedScore,
    };
  }

  return { detected: false };
}
