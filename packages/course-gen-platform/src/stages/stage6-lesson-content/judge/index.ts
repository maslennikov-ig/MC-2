/**
 * Judge module for Stage 6 Lesson Content Generation
 * @module stages/stage6-lesson-content/judge
 *
 * Exports:
 * - entropy-detector: Logprob entropy calculator for hallucination pre-filtering
 * - factual-verifier: Entropy-based conditional RAG verification for factual accuracy
 * - clev-voter: CLEV (Consensus via Lightweight Efficient Voting) orchestrator
 * - cascade-evaluator: Cascading evaluation with heuristics, single judge, and CLEV
 * - fix-templates: Prompt templates for targeted content refinement based on judge feedback
 * - decision-engine: Score-based decision tree for accept/fix/regenerate/escalate
 * - heuristic-filter: Standalone heuristic pre-filters for cost-free content validation
 * - prompt-cache: Prompt caching service for 60-90% cost reduction
 * - arbiter: Multi-judge consensus with Krippendorff's Alpha and conflict resolution
 * - router: Decision matrix for surgical edit vs section regeneration
 * - patcher: Surgical content edits with context preservation
 * - section-expander: Full section regeneration with RAG grounding
 * - verifier: Delta Judge and quality lock verification
 * - targeted-refinement: Main orchestrator for targeted refinement loop
 */

export * from './entropy-detector';
export * from './factual-verifier';
export * from './clev-voter';
export * from './fix-templates';
export * from './decision-engine';
export * from './prompt-cache';

// Heuristic filter exports (standalone module with enhanced interfaces)
// This supersedes the inline heuristics in cascade-evaluator
export * from './heuristic-filter';

// Cascade evaluator exports (excluding conflicting heuristic exports)
// countSyllables and runHeuristicFilters come from heuristic-filter module
export {
  type CascadeStage,
  type HeuristicThresholds,
  type CascadeConfig,
  type HeuristicResults,
  type CascadeEvaluationInput,
  type CascadeResult,
  DEFAULT_CASCADE_CONFIG,
  calculateFleschKincaid,
  executeCascadeEvaluation,
  executeCLEVVoting,
  selectJudgeModels,
} from './cascade-evaluator';

// Targeted refinement module exports (Phase 2-3)
export * from './arbiter';
export * from './router';
export * from './patcher';
export * from './section-expander';
export * from './verifier';
export * from './targeted-refinement';
