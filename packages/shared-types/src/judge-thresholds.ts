/**
 * Heuristic Thresholds for Stage 6 Judge Evaluation
 * @module @megacampus/shared-types/judge-thresholds
 *
 * These thresholds are used in cascade evaluation to determine
 * if content passes basic quality checks before LLM judging.
 */

/**
 * Default heuristic thresholds for content quality checks
 */
export const HEURISTIC_THRESHOLDS = {
  /** Minimum word count for lesson content */
  minWordCount: 500,
  /** Minimum Flesch-Kincaid grade level (lower = easier to read) */
  targetFleschKincaidMin: 8,
  /** Maximum Flesch-Kincaid grade level (higher = harder to read) */
  targetFleschKincaidMax: 12,
  /** Minimum number of examples required */
  minExamples: 1,
  /** Minimum number of exercises required */
  minExercises: 1,
} as const;

/**
 * Type for heuristic thresholds (readonly)
 */
export type HeuristicThresholds = typeof HEURISTIC_THRESHOLDS;

/**
 * Calculate dynamic word count thresholds based on lesson duration
 *
 * Philosophy:
 * - Minimum: ~120 words/minute (strict - content should not be too short)
 * - Maximum: ~600 words/minute (generous - allow detailed content)
 *
 * Constraints:
 * - Minimum threshold: 300 words (even for very short lessons)
 * - Maximum threshold: 25000 words (for very long lessons)
 *
 * @param durationMinutes - Estimated lesson duration in minutes (default: 15)
 * @returns Object with minWordCount and maxWordCount
 *
 * @example
 * ```typescript
 * calculateWordCountThresholds(5)  // { minWordCount: 600, maxWordCount: 3000 }
 * calculateWordCountThresholds(15) // { minWordCount: 1800, maxWordCount: 9000 }
 * calculateWordCountThresholds(40) // { minWordCount: 4800, maxWordCount: 24000 }
 * ```
 */
export function calculateWordCountThresholds(durationMinutes: number = 15): {
  minWordCount: number;
  maxWordCount: number;
} {
  // ~120 words/minute for minimum (strict - ensures adequate content)
  const minWords = Math.max(300, Math.round(durationMinutes * 120));

  // ~600 words/minute for maximum (generous buffer for detailed content)
  const maxWords = Math.min(25000, Math.round(durationMinutes * 600));

  // Ensure maxWords is always >= minWords + buffer
  const finalMaxWords = Math.max(maxWords, minWords + 500);

  return {
    minWordCount: minWords,
    maxWordCount: finalMaxWords,
  };
}
