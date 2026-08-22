/**
 * Constants for cascade evaluation
 * @module stages/stage6-lesson-content/judge/cascade/constants
 */

import { DEFAULT_OSCQR_RUBRIC } from '@megacampus/shared-types';
import { DEFAULT_FACTUAL_VERIFICATION_CONFIG } from '../factual-verifier';
import type { HeuristicThresholds, CascadeConfig } from './types';

/**
 * Conclusion section markers by language
 * Used by checkRequiredSections to detect conclusion presence
 */
export const CONCLUSION_MARKERS = {
  en: ['conclusion', 'summary', 'recap', 'takeaway', 'final thoughts'],
  ru: ['заключение', 'итоги', 'выводы', 'резюме', 'подведение', 'подытож'],
} as const;

/**
 * Regex pattern for conclusion detection (combines all languages)
 * Used for last-section fallback check
 */
export const CONCLUSION_REGEX =
  /итог|вывод|заключ|резюме|summary|conclusion|подвед|recap|takeaway/i;

/**
 * Default heuristic thresholds
 */
export const DEFAULT_HEURISTIC_THRESHOLDS: HeuristicThresholds = {
  minWordCount: 500,
  maxWordCount: 10000,
  targetFleschKincaid: { min: 8, max: 12 },
  requiredSections: ['introduction', 'exercises'],
  minExamples: 0, // Disabled: examples extraction not implemented yet
  minExercises: 2, // Enabled: exercises generation implemented in generator.ts
};

/**
 * Default cascade configuration
 */
export const DEFAULT_CASCADE_CONFIG: CascadeConfig = {
  heuristicThresholds: DEFAULT_HEURISTIC_THRESHOLDS,
  /**
   * Above this, one judge settles it; below, the panel votes.
   *
   * Set from the distribution rather than from a round number. Across 1302
   * stored single-judge verdicts: minimum 0.520, p10 0.700, **median 0.820**,
   * p90 0.880, maximum 0.930. The old 0.8 sat a hundredth under the median —
   * the one place on the curve where the most lessons are closest to the line,
   * so it split the corpus almost in half and sent 45.5% to a full panel.
   *
   * What each choice sends to the panel: 0.85 → 65.4%, 0.82 → 49.8%,
   * 0.80 → 45.5%, 0.78 → 32.9%, **0.75 → 24.3%**, 0.70 → 9.8%.
   *
   * 0.75 is the nearest value to the cascade's own design target of 15-20% that
   * still approaches it from above, and it stays clear of p10, so the genuinely
   * weak tail keeps its second opinion. 0.70 would undercut the target and buy
   * little more.
   *
   * This is a quality decision with a price attached, so it is written down
   * where it can be argued with (mc2-r31fw).
   */
  singleJudgeConfidenceThreshold: 0.75,
  skipHeuristics: false,
  skipSingleJudge: false,
  skipFactualVerification: false,
  factualVerificationConfig: DEFAULT_FACTUAL_VERIFICATION_CONFIG,
  minFactualAccuracyScore: 0.6,
  rubric: DEFAULT_OSCQR_RUBRIC,
};
