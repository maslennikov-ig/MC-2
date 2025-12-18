/**
 * Krippendorff's Alpha calculation for inter-rater agreement
 * @module stages/stage6-lesson-content/judge/arbiter/krippendorff
 *
 * Calculates Krippendorff's Alpha from judge verdicts to measure inter-rater agreement.
 * Uses the `krippendorff` npm package for calculation with ordinal level.
 *
 * Agreement thresholds (from REFINEMENT_CONFIG.krippendorff):
 * - α >= 0.80: High agreement (accept all issues)
 * - α >= 0.67: Moderate agreement (accept issues with 2+ judge consensus)
 * - α < 0.67: Low agreement (only CRITICAL issues, flag for review)
 *
 * Reference:
 * - specs/018-judge-targeted-refinement/research.md
 * - specs/018-judge-targeted-refinement/data-model.md
 */

import { alpha } from 'krippendorff';
import type { JudgeVerdict, CriteriaScores } from '@megacampus/shared-types';
import type { JudgeCriterion } from '@megacampus/shared-types';
import { REFINEMENT_CONFIG } from '@megacampus/shared-types';

/**
 * Agreement level interpretation
 */
export type AgreementLevel = 'high' | 'moderate' | 'low';

/**
 * Result of Krippendorff's Alpha calculation
 */
export interface AgreementResult {
  /** Krippendorff's Alpha score (0-1) */
  score: number;
  /** Interpretation of agreement level */
  level: AgreementLevel;
}

/**
 * Calculate Krippendorff's Alpha from judge verdicts
 *
 * Converts criteria scores into rating matrix format and calculates agreement.
 * Each criterion is treated as a separate item being rated by multiple judges.
 *
 * Matrix format:
 * - Rows = judges (2-3 judges from CLEV voting)
 * - Columns = criteria (6 criteria)
 * - Values = scores (0-1, converted to ordinal scale)
 *
 * @param verdicts - Array of JudgeVerdict from CLEV voting (2-3 verdicts)
 * @returns Agreement score and level interpretation
 *
 * @example
 * const verdicts = clevResult.verdicts; // 2-3 verdicts
 * const { score, level } = calculateAgreementScore(verdicts);
 * console.log(`Agreement: ${score.toFixed(3)} (${level})`);
 */
export function calculateAgreementScore(verdicts: JudgeVerdict[]): AgreementResult {
  if (verdicts.length === 0) {
    throw new Error('Cannot calculate agreement score from empty verdicts array');
  }

  if (verdicts.length === 1) {
    // Single judge: perfect agreement with self
    return {
      score: 1.0,
      level: 'high',
    };
  }

  // Extract criteria scores from all verdicts
  // Criteria order: learning_objective_alignment, pedagogical_structure, factual_accuracy,
  // clarity_readability, engagement_examples, completeness
  const criteria: JudgeCriterion[] = [
    'learning_objective_alignment',
    'pedagogical_structure',
    'factual_accuracy',
    'clarity_readability',
    'engagement_examples',
    'completeness',
  ];

  // Build rating matrix
  // Rows = judges, Columns = criteria
  const ratingMatrix: number[][] = [];

  for (const verdict of verdicts) {
    const row: number[] = criteria.map((criterion) => {
      const score = verdict.criteriaScores[criterion as keyof CriteriaScores];
      // Convert 0-1 score to ordinal scale (0-10 for better granularity)
      return Math.round(score * 10);
    });
    ratingMatrix.push(row);
  }

  // Calculate Krippendorff's Alpha using ordinal metric
  // ordinal metric: takes into account the ordering of categories
  let alphaScore: number;
  try {
    // Use ordinal metric (default is identity metric)
    const ordinalMetric = (a: number, b: number) => Math.abs(a - b);
    alphaScore = alpha(ratingMatrix, ordinalMetric);
  } catch (error) {
    // Fallback: if krippendorff calculation fails (e.g., no variance),
    // calculate simple agreement as average pairwise correlation
    alphaScore = calculateFallbackAgreement(verdicts, criteria);
  }

  // Clamp alpha to [0, 1] range (can be negative for very poor agreement)
  const clampedAlpha = Math.max(0, Math.min(1, alphaScore));

  // Interpret agreement level
  const level = interpretAgreementLevel(clampedAlpha);

  return {
    score: clampedAlpha,
    level,
  };
}

/**
 * Interpret agreement score as level
 *
 * Thresholds from REFINEMENT_CONFIG.krippendorff
 */
function interpretAgreementLevel(score: number): AgreementLevel {
  if (score >= REFINEMENT_CONFIG.krippendorff.highAgreement) {
    return 'high';
  }
  if (score >= REFINEMENT_CONFIG.krippendorff.moderateAgreement) {
    return 'moderate';
  }
  return 'low';
}

/**
 * Fallback agreement calculation when Krippendorff fails
 *
 * Calculates average pairwise correlation between judges' criteria scores.
 * This is a simpler metric but provides a reasonable fallback.
 */
function calculateFallbackAgreement(verdicts: JudgeVerdict[], criteria: JudgeCriterion[]): number {
  if (verdicts.length < 2) {
    return 1.0;
  }

  let totalCorrelation = 0;
  let pairCount = 0;

  // Calculate all pairwise correlations
  for (let i = 0; i < verdicts.length; i++) {
    for (let j = i + 1; j < verdicts.length; j++) {
      const scores1 = criteria.map((c) => verdicts[i].criteriaScores[c as keyof CriteriaScores]);
      const scores2 = criteria.map((c) => verdicts[j].criteriaScores[c as keyof CriteriaScores]);

      // Calculate Pearson correlation
      const correlation = calculatePearsonCorrelation(scores1, scores2);
      if (!isNaN(correlation)) {
        totalCorrelation += correlation;
        pairCount++;
      }
    }
  }

  return pairCount > 0 ? totalCorrelation / pairCount : 0.5;
}

/**
 * Calculate Pearson correlation coefficient between two score arrays
 */
function calculatePearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n !== y.length || n === 0) {
    return 0;
  }

  const meanX = x.reduce((sum, val) => sum + val, 0) / n;
  const meanY = y.reduce((sum, val) => sum + val, 0) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denominator = Math.sqrt(denomX * denomY);
  return denominator > 0 ? numerator / denominator : 0;
}
