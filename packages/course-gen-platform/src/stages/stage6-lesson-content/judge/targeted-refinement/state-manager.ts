import type {
  ArbiterOutput,
  CriteriaScores,
  IssueSeverity,
} from '@megacampus/shared-types';
import { initializeQualityLocks as initLocksFromScores } from '../verifier/quality-lock';
import { logger } from '../../../../shared/logger';

/**
 * Extract criteria scores from arbiter output
 */
export function extractCriteriaScoresFromArbiter(
  arbiterOutput: ArbiterOutput
): CriteriaScores {
  // Defensive check for invalid input (HIGH-1 fix)
  if (!arbiterOutput?.acceptedIssues || !Array.isArray(arbiterOutput.acceptedIssues)) {
    logger.warn('extractCriteriaScoresFromArbiter called with invalid arbiterOutput');
    // Return default scores at base level
    const baseScore = 0.75;
    return {
      learning_objective_alignment: baseScore,
      pedagogical_structure: baseScore,
      factual_accuracy: baseScore,
      clarity_readability: baseScore,
      engagement_examples: baseScore,
      completeness: baseScore,
    };
  }

  // Severity weights: critical issues impact score more
  const severityWeight: Record<IssueSeverity, number> = {
    critical: 0.15,
    major: 0.10,
    minor: 0.05,
  };

  // Calculate weighted penalty per criterion
  const criteriaWeightedPenalty: Record<string, number> = {};

  for (const issue of arbiterOutput.acceptedIssues) {
    const c = issue.criterion;
    const weight = severityWeight[issue.severity];
    criteriaWeightedPenalty[c] = (criteriaWeightedPenalty[c] || 0) + weight;
  }

  // Base score from agreement level
  const baseScore = arbiterOutput.agreementScore >= 0.80 ? 0.85 :
                    arbiterOutput.agreementScore >= 0.67 ? 0.75 : 0.65;

  // All 6 criteria
  const allCriteria = [
    'learning_objective_alignment',
    'pedagogical_structure',
    'factual_accuracy',
    'clarity_readability',
    'engagement_examples',
    'completeness',
  ] as const;

  // Build scores: criteria without issues get base score,
  // criteria with issues get penalized based on severity weighting (floor at 0.5)
  const scores: CriteriaScores = {
    learning_objective_alignment: baseScore,
    pedagogical_structure: baseScore,
    factual_accuracy: baseScore,
    clarity_readability: baseScore,
    engagement_examples: baseScore,
    completeness: baseScore,
  };

  // Apply weighted penalty (floor at 0.5)
  for (const c of allCriteria) {
    if (criteriaWeightedPenalty[c]) {
      scores[c] = Math.max(0.5, baseScore - criteriaWeightedPenalty[c]);
    }
  }

  return scores;
}

/**
 * Initialize quality locks from arbiter output
 */
export function initializeQualityLocksFromArbiter(
  arbiterOutput: ArbiterOutput
): Record<string, number> {
  const scores = extractCriteriaScoresFromArbiter(arbiterOutput);
  return initLocksFromScores(scores, 0.75);
}
