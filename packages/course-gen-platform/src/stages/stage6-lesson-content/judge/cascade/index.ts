/**
 * Cascade evaluation module
 * @module stages/stage6-lesson-content/judge/cascade
 *
 * Barrel export for all cascade evaluation components.
 */

// Export all types
export type {
  CascadeStage,
  HeuristicThresholds,
  CascadeConfig,
  HeuristicResults,
  CascadeEvaluationInput,
  CascadeResult,
} from './types';

// Export constants
export { DEFAULT_CASCADE_CONFIG } from './constants';

// Export text utilities
export { countSyllables, calculateFleschKincaid } from './text-utils';

// Export heuristic filters
export { runHeuristicFilters } from './heuristic-helpers';

// Export main orchestrator and re-exports
export {
  executeCascadeEvaluation,
  executeCLEVVoting,
  selectJudgeModels,
  executeFactualVerification,
  getFactualVerificationSummary,
  type FactualVerificationResult,
  type FactualVerificationConfig,
} from './orchestrator';
