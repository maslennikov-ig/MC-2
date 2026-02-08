/**
 * Self-Reviewer Module Re-exports
 * @module stages/stage6-lesson-content/nodes/self-reviewer
 *
 * Centralized exports for the self-reviewer node components.
 */

// Constants and Configuration
export {
  HEURISTIC_TOKENS_USED,
  LLM_PER_ATTEMPT_TIMEOUT_MS,
  LLMIssueSchema,
  SELF_REVIEW_CONFIG,
  calculateSelfReviewerMaxTokens,
  type SelfReviewerLLMResponse,
  type HeuristicCheckDetails,
} from './self-reviewer-constants';

// Heuristic Functions
export {
  findSectionsWithForeignCharacters,
  removeChatbotArtifacts,
} from './self-reviewer-heuristics';

// Helper Functions
export {
  withRetry,
  buildHeuristicDetails,
  determineFinalStatus,
  extractSectionsToRegenerate,
  buildReasoningMessage,
  buildHeuristicOnlyResult,
} from './self-reviewer-helpers';

// JSON Processing
export { repairTruncatedJson, parseSelfReviewerResponse } from './self-reviewer-json';

// Progress Summary
export { buildSelfReviewProgressSummary } from './self-reviewer-progress';

// Phase Functions (NEW)
export {
  runHeuristicPhase,
  analyzeCriticalIssues,
  buildMinorIssues,
  type HeuristicCheckResults,
  type CriticalIssueAnalysis,
  type LanguageCheckResult,
  type TruncationCheckResult,
  type MermaidCheckResult,
} from './self-reviewer-phases';

// LLM Review Functions (NEW)
export {
  runLLMReview,
  buildLLMReviewResult,
  applyPatching,
  type LLMReviewResult,
  type LLMReviewOptions,
} from './self-reviewer-llm';
