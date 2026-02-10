/**
 * Cascading Evaluation Logic for Stage 6 Lesson Content
 * @module stages/stage6-lesson-content/judge/cascade-evaluator
 *
 * Implements efficient 3-stage cascading evaluation:
 * 1. Heuristic pre-filters (FREE) - filters 30-50% instantly
 * 2. Single cheap judge (50-70% of content passing Stage 1)
 * 3. CLEV voting (15-20% of content with low confidence)
 *
 * This approach optimizes cost by only invoking expensive CLEV voting
 * for borderline cases that require multiple judge consensus.
 *
 * Reference:
 * - docs/research/010-stage6-generation-strategy/ (cascade research)
 * - specs/010-stages-456-pipeline/data-model.md
 *
 * NOTE: This file is now a barrel export. All implementation has been
 * moved to the ./cascade/ subdirectory for better organization.
 */

// Re-export all types
export type {
  CascadeStage,
  HeuristicThresholds,
  CascadeConfig,
  HeuristicResults,
  CascadeEvaluationInput,
  CascadeResult,
} from './cascade/types';

// Re-export constants
export { DEFAULT_CASCADE_CONFIG } from './cascade/constants';

// Re-export text utilities
export { countSyllables, calculateFleschKincaid } from './cascade/text-utils';

// Re-export heuristic filters
export { runHeuristicFilters } from './cascade/heuristic-helpers';

// Re-export main orchestrator function
export { executeCascadeEvaluation } from './cascade/orchestrator';

// Re-export CLEV voting functions from clev-voter module
export { executeCLEVVoting, selectJudgeModels } from './clev-voter';

// Re-export factual verification
export {
  executeFactualVerification,
  getFactualVerificationSummary,
  type FactualVerificationResult,
  type FactualVerificationConfig,
} from './factual-verifier';
