/**
 * Quality Lock - Prevents regression in passing criteria
 *
 * Quality locks ensure that criteria which already passed evaluation
 * do not regress during targeted refinement. This module provides:
 * - Quality lock checking against regression tolerance
 * - Universal readability metrics calculation
 * - Readability validation against thresholds
 *
 * @module stage6-lesson-content/judge/verifier/quality-lock
 */

import type {
  QualityLockViolation,
  QualityLockCheckResult,
  CriteriaScores,
  UniversalReadabilityMetrics,
} from '@megacampus/shared-types';
import { REFINEMENT_CONFIG } from '@megacampus/shared-types';

/**
 * Check quality locks for regression
 *
 * Quality locks prevent patches from degrading criteria that already passed.
 * A regression occurs when a previously passing criterion's score drops
 * more than the tolerance threshold.
 *
 * Default tolerance: 5% (0.05) - allows minor fluctuations in scoring
 *
 * @param locksBeforePatch - Criteria scores before patch (the "locks")
 * @param scoresAfterPatch - Criteria scores after patch
 * @param sectionId - Section being checked (for logging)
 * @param tolerance - Regression tolerance (default: 0.05)
 * @returns QualityLockCheckResult with pass/fail and violations
 */
export function checkQualityLocks(
  locksBeforePatch: Record<string, number>,
  scoresAfterPatch: CriteriaScores,
  sectionId: string,
  tolerance: number = REFINEMENT_CONFIG.quality.regressionTolerance
): QualityLockCheckResult {
  const violations: QualityLockViolation[] = [];

  // Check each locked criterion
  for (const [criterion, lockedScore] of Object.entries(locksBeforePatch)) {
    const newScore = scoresAfterPatch[criterion as keyof CriteriaScores];
    if (newScore === undefined) continue;

    const delta = newScore - lockedScore;

    // Violation if score dropped more than tolerance
    if (delta < -tolerance) {
      violations.push({
        criterion,
        lockedScore,
        newScore,
        delta,
        sectionId,
      });
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    currentLocks: { ...locksBeforePatch }, // Return current locks state
  };
}

/**
 * Calculate universal readability metrics (language-agnostic)
 *
 * These metrics work across all languages (Russian, English, etc.):
 * - avgSentenceLength: Average number of words per sentence (target: 17, max: 25)
 * - avgWordLength: Average character length of words (max: 10 for German compounds)
 * - paragraphBreakRatio: Ratio of paragraphs to sentences (min: 0.08)
 *
 * Based on FR-035..FR-037 from the specification.
 *
 * @param text - Content text to analyze
 * @returns UniversalReadabilityMetrics
 */
export function calculateUniversalReadability(text: string): UniversalReadabilityMetrics {
  // Split into sentences (handle multiple languages)
  // Matches periods, exclamation marks, question marks (Latin and Cyrillic)
  const sentences = text.split(/[.!?。！？]+/).filter((s) => s.trim().length > 0);

  // Split into words
  const words = text.split(/\s+/).filter((w) => w.length > 0);

  // Split into paragraphs (double newline separation)
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);

  return {
    avgSentenceLength: words.length / Math.max(1, sentences.length),
    avgWordLength:
      words.reduce((sum, w) => sum + w.length, 0) / Math.max(1, words.length),
    paragraphBreakRatio: paragraphs.length / Math.max(1, sentences.length),
  };
}

/**
 * Validate readability metrics against thresholds
 *
 * Checks if readability metrics fall within acceptable ranges:
 * - avgSentenceLength: Should not exceed 25 words
 * - avgWordLength: Should not exceed 10 characters
 * - paragraphBreakRatio: Should be at least 0.08
 *
 * @param metrics - UniversalReadabilityMetrics to validate
 * @param config - Readability config (defaults to REFINEMENT_CONFIG.readability)
 * @returns Validation result with pass/fail and issues
 */
export function validateReadability(
  metrics: UniversalReadabilityMetrics,
  config = REFINEMENT_CONFIG.readability
): { passed: boolean; issues: string[] } {
  const issues: string[] = [];

  if (metrics.avgSentenceLength > config.avgSentenceLength.max) {
    issues.push(
      `Average sentence length ${metrics.avgSentenceLength.toFixed(1)} exceeds max ${config.avgSentenceLength.max}`
    );
  }

  if (metrics.avgWordLength > config.avgWordLength.max) {
    issues.push(
      `Average word length ${metrics.avgWordLength.toFixed(1)} exceeds max ${config.avgWordLength.max}`
    );
  }

  if (metrics.paragraphBreakRatio < config.paragraphBreakRatio.min) {
    issues.push(
      `Paragraph break ratio ${metrics.paragraphBreakRatio.toFixed(2)} below min ${config.paragraphBreakRatio.min}`
    );
  }

  return { passed: issues.length === 0, issues };
}

/**
 * Initialize quality locks from current scores
 *
 * Locks are set for criteria that are currently passing (score >= threshold).
 * These locks prevent regression during targeted refinement.
 *
 * @param scores - Current criteria scores
 * @param threshold - Score threshold for "passing" (default: 0.75)
 * @returns Record of criterion -> locked score
 */
export function initializeQualityLocks(
  scores: CriteriaScores,
  threshold: number = 0.75
): Record<string, number> {
  const locks: Record<string, number> = {};

  for (const [criterion, score] of Object.entries(scores) as [string, number][]) {
    if (score >= threshold) {
      locks[criterion] = score;
    }
  }

  return locks;
}
