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
  singleJudgeConfidenceThreshold: 0.8,
  skipHeuristics: false,
  skipSingleJudge: false,
  skipFactualVerification: false,
  factualVerificationConfig: DEFAULT_FACTUAL_VERIFICATION_CONFIG,
  minFactualAccuracyScore: 0.6,
  rubric: DEFAULT_OSCQR_RUBRIC,
};
