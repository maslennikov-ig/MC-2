/* eslint-disable max-lines */
/**
 * Judge Types and Schemas for Stage 6 Lesson Content Validation
 * @module @megacampus/shared-types/judge-types
 *
 * Provides type definitions and Zod schemas for LLM Judge verdicts,
 * scores, fix recommendations, and aggregated results from CLEV voting.
 *
 * Based on research: docs/research/010-stage6-generation-strategy/
 * LLM Judge Implementation for Educational Lesson Content Validation
 */

import { z } from 'zod';
import {
  JudgeCriterionSchema,
  type JudgeCriterion,
} from './judge-rubric';

// ============================================================================
// CONFIDENCE AND SEVERITY TYPES
// ============================================================================

/**
 * JudgeConfidence - Confidence level of the judge's evaluation
 *
 * High: Clear evaluation, strong evidence
 * Medium: Some uncertainty, partial evidence
 * Low: Limited evidence, requires human validation
 */
export const JudgeConfidenceSchema = z.enum(['high', 'medium', 'low']);

/** JudgeConfidence type */
export type JudgeConfidence = z.infer<typeof JudgeConfidenceSchema>;

/**
 * IssueSeverity - Severity level of identified issues
 *
 * Critical: Must be fixed before publishing (score impact > 0.2)
 * Major: Should be fixed for quality (score impact 0.1-0.2)
 * Minor: Nice to fix but acceptable (score impact < 0.1)
 */
export const IssueSeveritySchema = z.enum(['critical', 'major', 'minor']);

/** IssueSeverity type */
export type IssueSeverity = z.infer<typeof IssueSeveritySchema>;

// ============================================================================
// JUDGE RECOMMENDATION ENUM
// ============================================================================

/**
 * JudgeRecommendation - Recommended action based on overall score
 *
 * Decision thresholds (from research Section 5):
 * - ACCEPT: score >= 0.90 (auto-accept, excellent quality)
 * - ACCEPT_WITH_MINOR_REVISION: score 0.75-0.90 with localized issues
 * - ITERATIVE_REFINEMENT: score 0.60-0.75 (max 2 iterations)
 * - REGENERATE: score < 0.60 (fundamental issues, regenerate with feedback)
 * - ESCALATE_TO_HUMAN: persistent issues after corrections or low confidence
 */
export const JudgeRecommendationSchema = z.enum([
  'ACCEPT',                     // score >= 0.90, auto-publish
  'ACCEPT_WITH_MINOR_REVISION', // score 0.75-0.90, single targeted fix
  'ITERATIVE_REFINEMENT',       // score 0.60-0.75, 2-iteration refinement
  'REGENERATE',                 // score < 0.60, regenerate with feedback
  'ESCALATE_TO_HUMAN',          // persistent issues, manual review required
]);

/** JudgeRecommendation type */
export type JudgeRecommendation = z.infer<typeof JudgeRecommendationSchema>;

// ============================================================================
// CRITERIA SCORES
// ============================================================================

/**
 * CriteriaScores - Individual scores for each of the 6 evaluation criteria
 *
 * Uses criterion names from judge-rubric.ts:
 * - learning_objective_alignment (25%)
 * - pedagogical_structure (20%)
 * - factual_accuracy (15%)
 * - clarity_readability (15%)
 * - engagement_examples (15%)
 * - completeness (10%)
 *
 * All scores are 0-1 scale where:
 * - 0.90+: Excellent
 * - 0.75-0.90: Good
 * - 0.60-0.75: Fair
 * - <0.60: Poor
 */
export const CriteriaScoresSchema = z.object({
  /** Learning objective alignment (25% weight) */
  learning_objective_alignment: z.number().min(0).max(1),
  /** Pedagogical structure quality (20% weight) */
  pedagogical_structure: z.number().min(0).max(1),
  /** Factual accuracy - requires RAG grounding (15% weight) */
  factual_accuracy: z.number().min(0).max(1),
  /** Clarity and readability (15% weight) */
  clarity_readability: z.number().min(0).max(1),
  /** Engagement and examples (15% weight) */
  engagement_examples: z.number().min(0).max(1),
  /** Content completeness (10% weight) */
  completeness: z.number().min(0).max(1),
});

/** CriteriaScores type */
export type CriteriaScores = z.infer<typeof CriteriaScoresSchema>;

// ============================================================================
// JUDGE ISSUE
// ============================================================================

/**
 * JudgeIssue - A specific issue identified during evaluation
 *
 * Issues should be actionable with clear location and suggested fixes.
 * Used for targeted refinement prompts (Template 2 in research).
 */
export const JudgeIssueSchema = z.object({
  /** Which criterion this issue relates to */
  criterion: JudgeCriterionSchema,
  /** How severe is this issue */
  severity: IssueSeveritySchema,
  /** Where in the content (e.g., "section 2, paragraph 3") */
  location: z.string().min(1).describe('Location reference in the content'),
  /** Description of the issue */
  description: z.string().min(10).describe('Clear description of the problem'),
  /** Optional: The problematic text (for targeted fixes) */
  quotedText: z.string().optional().describe('Exact text that has the issue'),
  /** Actionable suggestion for fixing the issue */
  suggestedFix: z.string().min(10).describe('Concrete fix suggestion'),
});

/** JudgeIssue type */
export type JudgeIssue = z.infer<typeof JudgeIssueSchema>;

// ============================================================================
// JUDGE VERDICT
// ============================================================================

/**
 * JudgeVerdict - Complete evaluation result from a single judge
 *
 * JSON output format from research Section 3:
 * - Structured for programmatic parsing
 * - Multi-dimensional feedback for targeted fixes
 * - Confidence scores enable CLEV conditional voting
 */
export const JudgeVerdictSchema = z.object({
  /** Overall quality score (0-1), weighted average of criteria */
  overallScore: z.number().min(0).max(1),
  /** Did the content pass the quality threshold (typically 0.75) */
  passed: z.boolean(),
  /** Judge's confidence in this evaluation */
  confidence: JudgeConfidenceSchema,
  /** Individual scores for each criterion */
  criteriaScores: CriteriaScoresSchema,
  /** List of identified issues (empty if perfect) */
  issues: z.array(JudgeIssueSchema).default([]),
  /** List of strengths to preserve during refinement */
  strengths: z.array(z.string()).default([]),
  /** Recommended action based on score and issues */
  recommendation: JudgeRecommendationSchema,
  /** Which model performed this evaluation */
  judgeModel: z.string().min(1).describe('Model identifier (e.g., "deepseek/deepseek-v3.1-terminus")'),
  /** Temperature used for evaluation (recommended: 0.1) */
  temperature: z.number().min(0).max(1),
  /** Total tokens used for this evaluation */
  tokensUsed: z.number().int().min(0),
  /** Duration of evaluation in milliseconds */
  durationMs: z.number().int().min(0),
});

/** JudgeVerdict type */
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;

// ============================================================================
// FIX RECOMMENDATION
// ============================================================================

/**
 * FixRecommendation - Structured fix instructions for refinement
 *
 * Used in refinement prompts (Templates 1-3 in research Section 5)
 * to guide targeted content improvements while preserving quality.
 */
export const FixRecommendationSchema = z.object({
  /** Issues to address (from JudgeVerdict) */
  issues: z.array(JudgeIssueSchema).min(1),
  /** Sections that should NOT be modified (preserve quality) */
  sectionsToPreserve: z.array(z.string()).default([]),
  /** Sections requiring modification */
  sectionsToModify: z.array(z.string()).default([]),
  /** Domain terminology to maintain consistency */
  preserveTerminology: z.array(z.string()).default([]),
  /** History of previous iterations (for self-refine method) */
  iterationHistory: z.array(z.object({
    /** Feedback given in this iteration */
    feedback: z.string(),
    /** Score achieved after this iteration */
    score: z.number().min(0).max(1),
  })).default([]),
});

/** FixRecommendation type */
export type FixRecommendation = z.infer<typeof FixRecommendationSchema>;

// ============================================================================
// JUDGE AGGREGATED RESULT (CLEV Voting)
// ============================================================================

/**
 * VotingMethod - How the final decision was reached
 *
 * CLEV (Consensus via Lightweight Efficient Voting):
 * - unanimous: All judges agreed (70-85% of cases)
 * - majority: 2/3 judges agreed
 * - tiebreaker: 3rd judge invoked to break tie
 */
export const VotingMethodSchema = z.enum(['unanimous', 'majority', 'tiebreaker']);

/** VotingMethod type */
export type VotingMethod = z.infer<typeof VotingMethodSchema>;

/**
 * JudgeAggregatedResult - Aggregated result from multiple judges (CLEV voting)
 *
 * CLEV approach (research Section 2):
 * - Start with 2 judges (different model families)
 * - If unanimous agreement, return result (67% cost savings)
 * - If disagreement, invoke 3rd judge for tiebreaker
 * - Use weighted mean for numerical scores
 */
export const JudgeAggregatedResultSchema = z.object({
  /** Individual verdicts from each judge (2-3 typically) */
  verdicts: z.array(JudgeVerdictSchema).min(1).max(5),
  /** Aggregated score using weighted mean */
  aggregatedScore: z.number().min(0).max(1),
  /** Final recommendation after aggregation */
  finalRecommendation: JudgeRecommendationSchema,
  /** How the final decision was reached */
  votingMethod: VotingMethodSchema,
  /** Whether judges reached consensus */
  consensusReached: z.boolean(),
});

/** JudgeAggregatedResult type */
export type JudgeAggregatedResult = z.infer<typeof JudgeAggregatedResultSchema>;

// ============================================================================
// TARGETED REFINEMENT TYPES
// ============================================================================

/**
 * FixAction - Action type for routing decisions in targeted refinement
 *
 * Used by Router to determine how to fix an issue:
 * - SURGICAL_EDIT: Patcher handles tone, clarity, grammar, minor additions (~800 tokens)
 * - REGENERATE_SECTION: Section-Expander regenerates single section (~1500 tokens)
 * - FULL_REGENERATE: Restart from Planner for structural failures (~6000 tokens)
 */
export const FixActionSchema = z.enum([
  'SURGICAL_EDIT',        // Patcher: tone, clarity, grammar, minor additions
  'REGENERATE_SECTION',   // Section-Expander: factual errors, major gaps
  'FULL_REGENERATE',      // Restart from Planner: structural failure
]);

/** FixAction type */
export type FixAction = z.infer<typeof FixActionSchema>;

/**
 * ContextScope - Scope of context needed for surgical edits
 */
export const ContextScopeSchema = z.enum(['paragraph', 'section', 'global']);

/** ContextScope type */
export type ContextScope = z.infer<typeof ContextScopeSchema>;

/**
 * ContextWindow - Context anchors for surgical edits
 * Provides start/end quotes to locate problematic area
 */
export const ContextWindowSchema = z.object({
  /** Text anchor at start of problematic area */
  startQuote: z.string().optional(),
  /** Text anchor at end of problematic area */
  endQuote: z.string().optional(),
  /** Scope of context needed */
  scope: ContextScopeSchema,
});

/** ContextWindow type */
export type ContextWindow = z.infer<typeof ContextWindowSchema>;

/**
 * TargetedIssue - Enhanced issue with targeting information for refinement
 *
 * Extends JudgeIssue with:
 * - Unique issue identifier
 * - Target section ID
 * - Recommended fix action
 * - Context anchors for surgical edits
 * - Specific fix instructions
 */
export const TargetedIssueSchema = JudgeIssueSchema.extend({
  /** Unique issue identifier */
  id: z.string().min(1),
  /** Target section ID (e.g., "sec_introduction", "sec_2") */
  targetSectionId: z.string().min(1),
  /** Recommended fix action */
  fixAction: FixActionSchema,
  /** Context anchors for surgical edits */
  contextWindow: ContextWindowSchema,
  /** Specific instructions for the fix agent */
  fixInstructions: z.string().min(10),
});

/** TargetedIssue type */
export type TargetedIssue = z.infer<typeof TargetedIssueSchema>;

// ============================================================================
// TARGETED REFINEMENT CONTRACTS
// ============================================================================

/**
 * ArbiterInput - Input for consolidateVerdicts()
 */
export const ArbiterInputSchema = z.object({
  /** Aggregated result from CLEV voting (2-3 verdicts) */
  clevResult: JudgeAggregatedResultSchema,
  /** Lesson content body for extracting context anchors */
  lessonContent: z.any(), // LessonContentBody - avoiding circular import
  /** Operation mode affects conflict resolution behavior */
  operationMode: z.lazy(() => OperationModeSchema),
});

/** ArbiterInput type */
export type ArbiterInput = z.infer<typeof ArbiterInputSchema>;

/**
 * ArbiterOutput - Result of consolidateVerdicts()
 */
export const ArbiterOutputSchema = z.object({
  /** Generated refinement plan */
  plan: z.lazy(() => RefinementPlanSchema), // Lazy to avoid circular dependency
  /** Krippendorff's Alpha agreement score (0-1) */
  agreementScore: z.number().min(0).max(1),
  /** Interpretation of agreement level */
  agreementLevel: z.enum(['high', 'moderate', 'low']),
  /** Issues accepted based on agreement threshold */
  acceptedIssues: z.array(TargetedIssueSchema),
  /** Issues rejected (low agreement, non-critical) */
  rejectedIssues: z.array(TargetedIssueSchema),
  /** Tokens used for Arbiter LLM call (if any) */
  tokensUsed: z.number().int().min(0),
  /** Duration in milliseconds */
  durationMs: z.number().int().min(0),
});

/** ArbiterOutput type */
export type ArbiterOutput = z.infer<typeof ArbiterOutputSchema>;

/**
 * RouterDecision - Result of routeTask()
 */
export const RouterDecisionSchema = z.object({
  /** Task being routed */
  task: z.lazy(() => SectionRefinementTaskSchema), // Lazy to avoid circular dependency
  /** Chosen fix action */
  action: z.enum(['SURGICAL_EDIT', 'REGENERATE_SECTION', 'FULL_REGENERATE']),
  /** Agent to execute the fix */
  executor: z.enum(['patcher', 'generator']),
  /** Estimated token cost */
  estimatedTokens: z.number().int().min(0),
  /** Routing reasoning */
  reason: z.string(),
});

/** RouterDecision type */
export type RouterDecision = z.infer<typeof RouterDecisionSchema>;

/**
 * RoutingConfig - Configuration for Router
 */
export const RoutingConfigSchema = z.object({
  /** Token budget remaining */
  tokenBudget: z.number().int().min(0),
  /** Maximum Patcher invocations per iteration */
  maxPatcherCalls: z.number().int().min(1).max(10).default(3),
  /** Whether to prefer surgical edits when possible */
  preferSurgical: z.boolean().default(true),
});

/** RoutingConfig type */
export type RoutingConfig = z.infer<typeof RoutingConfigSchema>;

/**
 * PatcherInput - Input for Patcher.execute()
 */
export const PatcherInputSchema = z.object({
  /** Original section content */
  originalContent: z.string(),
  /** Section ID being patched */
  sectionId: z.string(),
  /** Section title for context */
  sectionTitle: z.string(),
  /** Synthesized fix instructions from Arbiter */
  instructions: z.string(),
  /** Context anchors for coherence */
  contextAnchors: z.object({
    prevSectionEnd: z.string().optional(),
    nextSectionStart: z.string().optional(),
  }),
  /** Context window for surgical targeting */
  contextWindow: z.object({
    startQuote: z.string().optional(),
    endQuote: z.string().optional(),
    scope: z.enum(['paragraph', 'section', 'global']),
  }),
  /**
   * Lesson duration in minutes (3-45) for token budget calculation.
   * Longer lessons require more tokens for patching.
   * If not provided, will be estimated from content length.
   */
  lessonDurationMinutes: z.number().int().min(3).max(45).optional(),

  /**
   * Content language for token budget calculation.
   * Different languages have different tokenization ratios:
   * - en/es/fr/de: ~1.0x (baseline)
   * - ru: ~1.33x (Cyrillic needs more tokens)
   * - zh: ~2.67x (CJK needs significantly more tokens)
   * - ja/ko/th: ~2.0x
   * - ar/hi/bn: ~1.6x
   */
  language: z.string().optional(),
});

/** PatcherInput type */
export type PatcherInput = z.infer<typeof PatcherInputSchema>;

/**
 * PatcherOutput - Result of Patcher.execute()
 */
export const PatcherOutputSchema = z.object({
  /** Patched content */
  patchedContent: z.string(),
  /** Whether patch was successful */
  success: z.boolean(),
  /** What was changed (for logging) */
  diffSummary: z.string(),
  /** Tokens used */
  tokensUsed: z.number().int().min(0),
  /** Duration in milliseconds */
  durationMs: z.number().int().min(0),
  /** Error message if failed */
  errorMessage: z.string().optional(),
});

/** PatcherOutput type */
export type PatcherOutput = z.infer<typeof PatcherOutputSchema>;

/**
 * SectionExpanderInput - Input for SectionExpander.execute()
 */
export const SectionExpanderInputSchema = z.object({
  /** Section ID being regenerated */
  sectionId: z.string(),
  /** Section title */
  sectionTitle: z.string(),
  /** Original section content (for reference) */
  originalContent: z.string(),
  /** Issues to address in regeneration */
  issues: z.array(TargetedIssueSchema),
  /** RAG chunks for grounding */
  ragChunks: z.array(z.any()), // RAGChunk - avoiding circular
  /** Learning objectives for this section */
  learningObjectives: z.array(z.string()),
  /** Context anchors for coherence */
  contextAnchors: z.object({
    prevSectionEnd: z.string().optional(),
    nextSectionStart: z.string().optional(),
  }),
  /** Word count target */
  targetWordCount: z.number().int().min(50).max(2000).optional(),
  /** Content language for generation (ISO 639-1 code: 'ru', 'en') */
  language: z.string().optional(),
});

/** SectionExpanderInput type */
export type SectionExpanderInput = z.infer<typeof SectionExpanderInputSchema>;

/**
 * SectionExpanderOutput - Result of SectionExpander.execute()
 */
export const SectionExpanderOutputSchema = z.object({
  /** Regenerated section content */
  regeneratedContent: z.string(),
  /** Whether regeneration was successful */
  success: z.boolean(),
  /** Word count of new content */
  wordCount: z.number().int().min(0),
  /** Tokens used */
  tokensUsed: z.number().int().min(0),
  /** Duration in milliseconds */
  durationMs: z.number().int().min(0),
  /** Error message if failed */
  errorMessage: z.string().optional(),
});

/** SectionExpanderOutput type */
export type SectionExpanderOutput = z.infer<typeof SectionExpanderOutputSchema>;

/**
 * DeltaJudgeInput - Input for DeltaJudge.verify()
 */
export const DeltaJudgeInputSchema = z.object({
  /** Original section content before patch */
  originalContent: z.string(),
  /** Patched/regenerated section content */
  patchedContent: z.string(),
  /** Issue that was addressed */
  addressedIssue: TargetedIssueSchema,
  /** Section ID */
  sectionId: z.string(),
  /** Context anchors for coherence check */
  contextAnchors: z.object({
    prevSectionEnd: z.string().optional(),
    nextSectionStart: z.string().optional(),
  }),
});

/** DeltaJudgeInput type */
export type DeltaJudgeInput = z.infer<typeof DeltaJudgeInputSchema>;

/**
 * DeltaJudgeOutput - Result of DeltaJudge.verify()
 */
export const DeltaJudgeOutputSchema = z.object({
  /** Whether the fix was successful */
  passed: z.boolean(),
  /** Confidence in the assessment */
  confidence: JudgeConfidenceSchema,
  /** Reasoning for the assessment */
  reasoning: z.string(),
  /** Any new issues introduced by the patch */
  newIssues: z.array(JudgeIssueSchema),
  /** Tokens used for verification */
  tokensUsed: z.number().int().min(0),
  /** Duration in milliseconds */
  durationMs: z.number().int().min(0),
});

/** DeltaJudgeOutput type */
export type DeltaJudgeOutput = z.infer<typeof DeltaJudgeOutputSchema>;

/**
 * QualityLockViolation - Record of a quality regression
 */
export const QualityLockViolationSchema = z.object({
  /** Which criterion regressed */
  criterion: z.string(),
  /** Locked score (before patch) */
  lockedScore: z.number().min(0).max(1),
  /** New score (after patch) */
  newScore: z.number().min(0).max(1),
  /** Delta (negative means regression) */
  delta: z.number(),
  /** Section where regression occurred */
  sectionId: z.string(),
});

/** QualityLockViolation type */
export type QualityLockViolation = z.infer<typeof QualityLockViolationSchema>;

/**
 * QualityLockCheckResult - Result of quality lock check
 */
export const QualityLockCheckResultSchema = z.object({
  /** Whether all locks passed */
  passed: z.boolean(),
  /** List of violations */
  violations: z.array(QualityLockViolationSchema),
  /** Current quality locks state */
  currentLocks: z.record(z.string(), z.number()),
});

/** QualityLockCheckResult type */
export type QualityLockCheckResult = z.infer<typeof QualityLockCheckResultSchema>;

/**
 * IterationControllerInput - Input for iteration control
 */
export const IterationControllerInputSchema = z.object({
  /** Current iteration state */
  currentState: z.object({
    iteration: z.number().int().min(0),
    scoreHistory: z.array(z.number()),
    contentHistory: z.array(z.lazy(() => IterationResultSchema)), // Lazy to reference schema
    lockedSections: z.array(z.string()),
    sectionEditCount: z.record(z.string(), z.number()),
    qualityLocks: z.record(z.string(), z.number()),
    tokensUsed: z.number().int().min(0),
    startTime: z.number().int(), // Unix timestamp ms
  }),
  /** Latest score after batch */
  latestScore: z.number().min(0).max(1),
  /** Operation mode */
  operationMode: z.lazy(() => OperationModeSchema),
});

/** IterationControllerInput type */
export type IterationControllerInput = z.infer<typeof IterationControllerInputSchema>;

/**
 * IterationControllerOutput - Decision from iteration controller
 */
/**
 * StopReason - Reasons for stopping iteration
 */
export const StopReasonSchema = z.enum([
  'continue_more_tasks',
  'stop_converged',
  'stop_max_iterations',
  'stop_token_budget',
  'stop_timeout',
  'stop_all_sections_locked',
  'stop_score_threshold_met',
]);

/** StopReason type */
export type StopReason = z.infer<typeof StopReasonSchema>;

export const IterationControllerOutputSchema = z.object({
  /** Should continue iterating? */
  shouldContinue: z.boolean(),
  /** Reason for decision */
  reason: StopReasonSchema,
  /** Updated locked sections */
  newlyLockedSections: z.array(z.string()),
  /** Remaining tasks after filtering locked sections */
  remainingTaskCount: z.number().int().min(0),
});

/** IterationControllerOutput type */
export type IterationControllerOutput = z.infer<typeof IterationControllerOutputSchema>;

/**
 * BestEffortSelectorInput - Input for selecting best iteration
 */
export const BestEffortSelectorInputSchema = z.object({
  /** All iteration results */
  iterationHistory: z.array(z.lazy(() => IterationResultSchema)), // Lazy to reference schema
  /** Unresolved issues from final iteration */
  unresolvedIssues: z.array(JudgeIssueSchema),
  /** Operation mode */
  operationMode: z.lazy(() => OperationModeSchema),
});

/** BestEffortSelectorInput type */
export type BestEffortSelectorInput = z.infer<typeof BestEffortSelectorInputSchema>;

/**
 * BestEffortSelectorOutput - Selected best result
 */
export const BestEffortSelectorOutputSchema = z.object({
  /** Best result */
  bestResult: z.lazy(() => BestEffortResultSchema), // Lazy to reference schema
  /** Selected iteration index */
  selectedIteration: z.number().int().min(0),
  /** Why this iteration was selected */
  selectionReason: z.string(),
  /** Final refinement status */
  finalStatus: z.lazy(() => RefinementStatusSchema), // Lazy to reference schema
});

/** BestEffortSelectorOutput type */
export type BestEffortSelectorOutput = z.infer<typeof BestEffortSelectorOutputSchema>;

/**
 * TaskPriority - Priority level for section refinement tasks
 */
export const TaskPrioritySchema = z.enum(['critical', 'major', 'minor']);

/** TaskPriority type */
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

/**
 * SectionRefinementTask - Per-section refinement task (output of Arbiter)
 *
 * Contains synthesized instructions from all judges with conflicts resolved.
 */
export const SectionRefinementTaskSchema = z.object({
  /** Target section ID */
  sectionId: z.string().min(1),
  /** Section title for context */
  sectionTitle: z.string().min(1),
  /** Action type */
  actionType: z.enum(['SURGICAL_EDIT', 'REGENERATE_SECTION']),
  /** Synthesized instructions from all judges (conflicts resolved) */
  synthesizedInstructions: z.string().min(10),
  /** Context anchors for coherence */
  contextAnchors: z.object({
    /** Last 3 sentences of previous section */
    prevSectionEnd: z.string().optional(),
    /** First 3 sentences of next section */
    nextSectionStart: z.string().optional(),
  }),
  /** Priority for execution order */
  priority: TaskPrioritySchema,
  /** Original issues that led to this task */
  sourceIssues: z.array(TargetedIssueSchema),
});

/** SectionRefinementTask type */
export type SectionRefinementTask = z.infer<typeof SectionRefinementTaskSchema>;

/**
 * ConflictResolution - Record of how a conflict between judges was resolved
 */
export const ConflictResolutionSchema = z.object({
  /** First conflicting issue description */
  issue1: z.string(),
  /** Second conflicting issue description */
  issue2: z.string(),
  /** How the conflict was resolved */
  resolution: z.string(),
});

/** ConflictResolution type */
export type ConflictResolution = z.infer<typeof ConflictResolutionSchema>;

/**
 * RefinementPlanStatus - Status of refinement plan execution
 */
export const RefinementPlanStatusSchema = z.enum([
  'PENDING',
  'EXECUTING',
  'COMPLETED',
  'FAILED',
]);

/** RefinementPlanStatus type */
export type RefinementPlanStatus = z.infer<typeof RefinementPlanStatusSchema>;

/**
 * RefinementPlan - Full refinement plan extending FixRecommendation
 *
 * Contains consolidated tasks by section with parallel execution batches.
 */
export const RefinementPlanSchema = FixRecommendationSchema.extend({
  /** Execution status */
  status: RefinementPlanStatusSchema,
  /** Consolidated tasks by section */
  tasks: z.array(SectionRefinementTaskSchema),
  /** Estimated token cost */
  estimatedCost: z.number().min(0),
  /** Inter-rater agreement score (Krippendorff's Alpha) */
  agreementScore: z.number().min(0).max(1),
  /** Conflict resolution log */
  conflictResolutions: z.array(ConflictResolutionSchema),
  /** Execution batches for parallel processing */
  executionBatches: z.array(z.array(SectionRefinementTaskSchema)),
});

/** RefinementPlan type */
export type RefinementPlan = z.infer<typeof RefinementPlanSchema>;

// ============================================================================
// ITERATION STATE TYPES
// ============================================================================

/**
 * IterationResult - Result of a single refinement iteration
 * Used for best-effort selection in full-auto mode
 */
export const IterationResultSchema = z.object({
  /** Iteration number (0-based) */
  iteration: z.number().int().min(0),
  /** Score achieved */
  score: z.number().min(0).max(1),
  /** Content snapshot */
  content: z.any(), // LessonContent - avoiding circular import
  /** Remaining unresolved issues */
  remainingIssues: z.array(JudgeIssueSchema),
});

/** IterationResult type */
export type IterationResult = z.infer<typeof IterationResultSchema>;

/**
 * RefinementIterationState - State for convergence detection
 */
export interface RefinementIterationState {
  /** Current iteration (0-based) */
  iteration: number;
  /** Score history for convergence detection */
  scoreHistory: number[];
  /** Content snapshots for best-effort selection */
  contentHistory: IterationResult[];
  /** Sections locked from further edits (oscillation prevention) */
  lockedSections: Set<string>;
  /** Edit history per section (for oscillation detection) */
  sectionEditCount: Map<string, number>;
  /** Quality locks - criteria that passed and must not regress */
  qualityLocks: Record<string, number>;
  /** Regression tolerance (default: 0.05) */
  regressionTolerance: number;
  /** Hard limits */
  maxIterations: number;
  maxTotalTokens: number;
  timeoutMs: number;
}

// ============================================================================
// OPERATION MODE TYPES
// ============================================================================

/**
 * OperationMode - Semi-auto vs Full-auto operation
 */
export const OperationModeSchema = z.enum(['semi-auto', 'full-auto']);

/** OperationMode type */
export type OperationMode = z.infer<typeof OperationModeSchema>;

/**
 * MaxIterationsAction - What to do when max iterations reached
 */
export const MaxIterationsActionSchema = z.enum([
  'escalate_to_human',  // Semi-auto: requires human review
  'accept_best_effort', // Full-auto: return best available
]);

/** MaxIterationsAction type */
export type MaxIterationsAction = z.infer<typeof MaxIterationsActionSchema>;

/**
 * SemiAutoConfig - Configuration for semi-automatic mode
 * User controls pipeline, human escalation possible
 */
export const SemiAutoConfigSchema = z.object({
  mode: z.literal('semi-auto'),
  /** Escalation to human is possible */
  escalationEnabled: z.literal(true),
  /** Score threshold for automatic accept */
  acceptThreshold: z.number().min(0).max(1).default(0.90),
  /** Score threshold for "good enough" accept */
  goodEnoughThreshold: z.number().min(0).max(1).default(0.85),
  /** Action when max iterations reached */
  onMaxIterations: z.literal('escalate_to_human'),
  /** Show detailed progress in UI */
  showDetailedProgress: z.literal(true),
});

/** SemiAutoConfig type */
export type SemiAutoConfig = z.infer<typeof SemiAutoConfigSchema>;

/**
 * FullAutoConfig - Configuration for fully automatic mode
 * User clicks "Generate" and waits for result, no human escalation
 */
export const FullAutoConfigSchema = z.object({
  mode: z.literal('full-auto'),
  /** Escalation to human is not possible */
  escalationEnabled: z.literal(false),
  /** Lower threshold for full-auto (better something than nothing) */
  acceptThreshold: z.number().min(0).max(1).default(0.85),
  /** "Good enough" threshold with warning */
  goodEnoughThreshold: z.number().min(0).max(1).default(0.75),
  /** Action when max iterations reached */
  onMaxIterations: z.literal('accept_best_effort'),
  /** Only show final result in UI */
  showDetailedProgress: z.literal(false),
});

/** FullAutoConfig type */
export type FullAutoConfig = z.infer<typeof FullAutoConfigSchema>;

/**
 * RefinementConfig - Union of operation mode configs
 */
export const RefinementConfigSchema = z.discriminatedUnion('mode', [
  SemiAutoConfigSchema,
  FullAutoConfigSchema,
]);

/** RefinementConfig type */
export type RefinementConfig = z.infer<typeof RefinementConfigSchema>;

// ============================================================================
// BEST-EFFORT RESULT TYPES
// ============================================================================

/**
 * QualityStatus - Quality status flag for best-effort results
 */
export const QualityStatusSchema = z.enum(['good', 'acceptable', 'below_standard']);

/** QualityStatus type */
export type QualityStatus = z.infer<typeof QualityStatusSchema>;

/**
 * BestEffortResult - Result returned when full-auto mode reaches max iterations
 */
export const BestEffortResultSchema = z.object({
  /** Best content from all iterations */
  content: z.any(), // LessonContent - avoiding circular import
  /** Best achieved score */
  bestScore: z.number().min(0).max(1),
  /** Quality status flag */
  qualityStatus: QualityStatusSchema,
  /** Unresolved issues (for logging) */
  unresolvedIssues: z.array(JudgeIssueSchema),
  /** Recommendations for future improvement */
  improvementHints: z.array(z.string()),
});

/** BestEffortResult type */
export type BestEffortResult = z.infer<typeof BestEffortResultSchema>;

// ============================================================================
// REFINEMENT STATUS TYPES
// ============================================================================

/**
 * RefinementStatus - Final status of refinement process
 */
export const RefinementStatusSchema = z.enum([
  'accepted',          // Score met threshold
  'accepted_warning',  // Full-auto: below ideal but acceptable
  'best_effort',       // Full-auto: returned best available
  'escalated',         // Semi-auto only: needs human review
]);

/** RefinementStatus type */
export type RefinementStatus = z.infer<typeof RefinementStatusSchema>;

// ============================================================================
// STREAMING EVENT TYPES
// ============================================================================

/**
 * RefinementEvent - Events emitted during refinement for UI updates
 */
export type RefinementEvent =
  | { type: 'refinement_start'; targetSections: string[]; mode: OperationMode }
  | {
      type: 'arbiter_complete';
      agreementScore: number;
      agreementLevel: 'high' | 'moderate' | 'low';
      acceptedIssueCount: number;
      rejectedIssueCount: number;
    }
  | { type: 'batch_started'; batchIndex: number; sections: string[] }
  | { type: 'task_started'; sectionId: string; taskType: FixAction }
  | { type: 'patch_applied'; sectionId: string; content: string; diffSummary: string }
  | { type: 'verification_result'; sectionId: string; passed: boolean }
  | {
      type: 'quality_lock_triggered';
      sectionId: string;
      criterion: string;
      lockedScore: number;
      newScore: number;
      delta: number;
    }
  | {
      type: 'section_locked';
      sectionId: string;
      reason: 'max_edits' | 'regression' | 'oscillation';
    }
  | { type: 'batch_complete'; batchIndex: number }
  | { type: 'iteration_complete'; iteration: number; score: number }
  | {
      type: 'escalation_triggered';
      reason: StopReason;
      score: number;
      goodEnoughThreshold: number;
      unresolvedIssuesCount: number;
    }
  | { type: 'budget_warning'; tokensUsed: number; maxTokens: number }
  | {
      type: 'new_issue_detected';
      sectionId: string;
      criterion: JudgeCriterion;
      severity: IssueSeverity;
      description: string;
    }
  | { type: 'refinement_complete'; finalScore: number; status: RefinementStatus };

// ============================================================================
// HEURISTIC PRE-FILTER TYPES
// ============================================================================

/**
 * HeuristicCheckName - Names of heuristic pre-filter checks
 *
 * Heuristic checks are FREE (no LLM needed) and run before judge evaluation.
 * Used to catch obvious quality issues before incurring LLM costs.
 */
export type HeuristicCheckName =
  | 'word_count'           // Content length validation
  | 'flesch_kincaid'       // Readability score (English only)
  | 'keyword_coverage'     // Required keywords present
  | 'section_headers'      // Section structure validation
  | 'content_density'      // Content vs whitespace ratio
  | 'markdown_structure';  // Markdown lint validation

/**
 * MarkdownStructureDetails - Details from markdown structure validation
 *
 * Part of heuristic pre-filter (FREE, no LLM needed).
 * Uses markdown-lint to validate document structure and catch formatting issues.
 *
 * Issue severity levels:
 * - critical: Breaks document structure (e.g., missing headers, malformed tables)
 * - major: Degrades quality (e.g., inconsistent spacing, missing blank lines)
 * - minor: Cosmetic issues (e.g., trailing spaces, inconsistent list markers)
 */
export interface MarkdownStructureDetails {
  /** Total number of markdown lint issues */
  totalIssues: number;
  /** Critical issues that break document structure */
  criticalIssues: number;
  /** Major issues that degrade quality */
  majorIssues: number;
  /** Minor cosmetic issues */
  minorIssues: number;
  /** Rules that were auto-fixed */
  autoFixedRules: string[];
  /** Rules that need Patcher intervention */
  patcherRules: string[];
  /** Individual issue details for logging */
  issueDetails: Array<{
    line: number;
    rule: string;
    description: string;
    severity: 'critical' | 'major' | 'minor';
  }>;
}

// ============================================================================
// READABILITY METRICS TYPES
// ============================================================================

/**
 * UniversalReadabilityMetrics - Language-agnostic readability metrics
 */
export const UniversalReadabilityMetricsSchema = z.object({
  /** Average sentence length in words (target: 15-20, max: 25) */
  avgSentenceLength: z.number().min(0),
  /** Average word length in characters (max varies by language) */
  avgWordLength: z.number().min(0),
  /** Paragraph break ratio (paragraphs / sentences, min: 0.08) */
  paragraphBreakRatio: z.number().min(0),
});

/** UniversalReadabilityMetrics type */
export type UniversalReadabilityMetrics = z.infer<typeof UniversalReadabilityMetricsSchema>;

// ============================================================================
// HELPER CONSTANTS
// ============================================================================

/**
 * Default criteria weights based on research recommendations
 * Maps JudgeCriterion values from judge-rubric.ts to their weights
 */
export const CRITERIA_WEIGHTS: Record<JudgeCriterion, number> = {
  learning_objective_alignment: 0.25,
  pedagogical_structure: 0.20,
  factual_accuracy: 0.15,
  clarity_readability: 0.15,
  engagement_examples: 0.15,
  completeness: 0.10,
};

/**
 * Score thresholds for recommendation decisions
 */
export const SCORE_THRESHOLDS = {
  /** Score >= 0.90: ACCEPT */
  ACCEPT: 0.90,
  /** Score 0.75-0.90: ACCEPT_WITH_MINOR_REVISION or ITERATIVE_REFINEMENT */
  MINOR_REVISION: 0.75,
  /** Score 0.60-0.75: ITERATIVE_REFINEMENT */
  REFINEMENT: 0.60,
  /** Score < 0.60: REGENERATE */
  REGENERATE: 0.60,
} as const;

/**
 * Maximum refinement iterations before escalation
 */
export const MAX_REFINEMENT_ITERATIONS = 2;

/**
 * Priority hierarchy for conflict resolution between judges
 * Higher priority (lower index) wins when judges contradict
 */
export const PRIORITY_HIERARCHY: JudgeCriterion[] = [
  'factual_accuracy',             // 1. Accuracy & Safety (highest)
  'learning_objective_alignment', // 2. Learning objectives
  'pedagogical_structure',        // 3. Structure
  'clarity_readability',          // 4. Clarity
  'engagement_examples',          // 5. Engagement
  'completeness',                 // 6. Completeness (lowest)
];

/**
 * Complete refinement configuration with all thresholds and settings
 * Based on Stage6 Targeted Refinement Spec v1.1
 */
export const REFINEMENT_CONFIG = {
  // Operation modes
  modes: {
    'semi-auto': {
      acceptThreshold: 0.90,
      goodEnoughThreshold: 0.85,
      onMaxIterations: 'escalate' as const,
      escalationEnabled: true,
    },
    'full-auto': {
      acceptThreshold: 0.85,
      goodEnoughThreshold: 0.75,
      onMaxIterations: 'best_effort' as const,
      escalationEnabled: false,
    },
  },

  // Hard limits
  limits: {
    maxIterations: 3,
    maxTokens: 15000,
    timeoutMs: 300000, // 5 minutes
  },

  // Quality control
  quality: {
    regressionTolerance: 0.05,
    sectionLockAfterEdits: 2,
    convergenceThreshold: 0.02,
    oscillationTolerance: 0.01, // 1% threshold for oscillation detection
  },

  // Parallel execution
  parallel: {
    maxConcurrentPatchers: 3,
    adjacentSectionGap: 1,
    sequentialForRegenerations: true,
  },

  // Readability (universal, language-agnostic)
  readability: {
    avgSentenceLength: { target: 17, max: 25 },
    avgWordLength: { max: 10 }, // Generous for German compound words
    paragraphBreakRatio: { min: 0.08 },
  },

  // Krippendorff's Alpha thresholds for inter-rater agreement
  krippendorff: {
    highAgreement: 0.80,    // Accept all issues
    moderateAgreement: 0.67, // Accept issues with 2+ judge agreement
    // Below 0.67: Only accept CRITICAL issues, flag for review
  },

  // Token cost estimates per action
  tokenCosts: {
    patcher: { min: 500, max: 1000 },
    sectionExpander: { min: 1200, max: 2000 },
    deltaJudge: { min: 150, max: 250 },
    arbiter: { min: 400, max: 600 },
    fullRegenerate: { min: 5000, max: 7000 },
  },
} as const;

/** Type for REFINEMENT_CONFIG */
export type RefinementConfigType = typeof REFINEMENT_CONFIG;

// ============================================================================
// REFINEMENT CONFIG DATABASE/API TYPES
// ============================================================================

/**
 * Token cost estimate range
 */
export interface TokenCostRange {
  min: number;
  max: number;
}

/**
 * Token costs configuration (stored as JSONB)
 */
export interface TokenCostsConfig {
  patcher: TokenCostRange;
  sectionExpander: TokenCostRange;
  deltaJudge: TokenCostRange;
  arbiter: TokenCostRange;
  fullRegenerate: TokenCostRange;
}

/**
 * Readability configuration (stored as JSONB)
 */
export interface ReadabilityConfig {
  avgSentenceLength: { target: number; max: number };
  avgWordLength: { max: number };
  paragraphBreakRatio: { min: number };
}

/**
 * Refinement config as stored in database
 */
export interface RefinementConfigDb {
  id: string;
  configType: 'global' | 'course_override';
  courseId: string | null;
  operationMode: OperationMode;

  // Mode-specific thresholds
  acceptThreshold: number;
  goodEnoughThreshold: number;
  onMaxIterations: 'escalate' | 'best_effort';
  escalationEnabled: boolean;

  // Hard limits
  maxIterations: number;
  maxTokens: number;
  timeoutMs: number;

  // Quality control
  regressionTolerance: number;
  sectionLockAfterEdits: number;
  convergenceThreshold: number;

  // Parallel execution
  maxConcurrentPatchers: number;
  adjacentSectionGap: number;
  sequentialForRegenerations: boolean;

  // Krippendorff's Alpha thresholds
  krippendorffHighAgreement: number;
  krippendorffModerateAgreement: number;

  // JSONB fields
  tokenCosts: TokenCostsConfig;
  readability: ReadabilityConfig;

  // Versioning
  version: number;
  isActive: boolean;

  // Audit
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  createdByEmail?: string | null;
}

/**
 * Zod schema for operation mode
 */
export const operationModeSchema = z.enum(['full-auto', 'semi-auto']);

/**
 * Zod schema for refinement config update input
 */
export const refinementConfigUpdateSchema = z.object({
  id: z.string().uuid(),

  // Mode-specific thresholds
  acceptThreshold: z.number().min(0).max(1).optional(),
  goodEnoughThreshold: z.number().min(0).max(1).optional(),
  onMaxIterations: z.enum(['escalate', 'best_effort']).optional(),
  escalationEnabled: z.boolean().optional(),

  // Hard limits
  maxIterations: z.number().int().min(1).max(10).optional(),
  maxTokens: z.number().int().min(1000).max(100000).optional(),
  timeoutMs: z.number().int().min(10000).max(600000).optional(),

  // Quality control
  regressionTolerance: z.number().min(0).max(0.5).optional(),
  sectionLockAfterEdits: z.number().int().min(1).max(10).optional(),
  convergenceThreshold: z.number().min(0).max(0.1).optional(),

  // Parallel execution
  maxConcurrentPatchers: z.number().int().min(1).max(10).optional(),
  adjacentSectionGap: z.number().int().min(1).max(5).optional(),
  sequentialForRegenerations: z.boolean().optional(),

  // Krippendorff's Alpha thresholds
  krippendorffHighAgreement: z.number().min(0.5).max(1).optional(),
  krippendorffModerateAgreement: z.number().min(0.3).max(1).optional(),

  // Optimistic locking
  expectedVersion: z.number().int().positive().optional(),
});

export type RefinementConfigUpdateInput = z.infer<typeof refinementConfigUpdateSchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate a JudgeVerdict
 * @param verdict - Raw verdict data to validate
 * @returns Validation result with parsed data or errors
 */
export function validateJudgeVerdict(verdict: unknown) {
  return JudgeVerdictSchema.safeParse(verdict);
}

/**
 * Validate a JudgeAggregatedResult
 * @param result - Raw aggregated result to validate
 * @returns Validation result with parsed data or errors
 */
export function validateJudgeAggregatedResult(result: unknown) {
  return JudgeAggregatedResultSchema.safeParse(result);
}

/**
 * Validate CriteriaScores
 * @param scores - Raw criteria scores to validate
 * @returns Validation result with parsed data or errors
 */
export function validateCriteriaScores(scores: unknown) {
  return CriteriaScoresSchema.safeParse(scores);
}

/**
 * Validate a JudgeIssue
 * @param issue - Raw issue data to validate
 * @returns Validation result with parsed data or errors
 */
export function validateJudgeIssue(issue: unknown) {
  return JudgeIssueSchema.safeParse(issue);
}

/**
 * Validate a FixRecommendation
 * @param recommendation - Raw fix recommendation to validate
 * @returns Validation result with parsed data or errors
 */
export function validateFixRecommendation(recommendation: unknown) {
  return FixRecommendationSchema.safeParse(recommendation);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate weighted overall score from criteria scores
 * @param criteriaScores - Individual criteria scores
 * @param weights - Optional custom weights (defaults to CRITERIA_WEIGHTS)
 * @returns Weighted average score (0-1)
 */
export function calculateWeightedScore(
  criteriaScores: CriteriaScores,
  weights: Record<JudgeCriterion, number> = CRITERIA_WEIGHTS,
): number {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const [criterion, score] of Object.entries(criteriaScores) as [JudgeCriterion, number][]) {
    const weight = weights[criterion] ?? 0;
    weightedSum += score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Determine recommendation based on score and issue analysis
 * @param score - Overall score (0-1)
 * @param issues - List of identified issues
 * @param confidence - Judge confidence level
 * @returns Appropriate recommendation
 */
export function determineRecommendation(
  score: number,
  issues: JudgeIssue[],
  confidence: JudgeConfidence,
): JudgeRecommendation {
  // Low confidence always escalates
  if (confidence === 'low') {
    return 'ESCALATE_TO_HUMAN';
  }

  // Score-based decision tree
  if (score >= SCORE_THRESHOLDS.ACCEPT) {
    return 'ACCEPT';
  }

  if (score >= SCORE_THRESHOLDS.MINOR_REVISION) {
    // Check if issues are localized (less than 30% of content affected)
    const criticalIssues = issues.filter(i => i.severity === 'critical');
    if (criticalIssues.length === 0 && issues.length <= 3) {
      return 'ACCEPT_WITH_MINOR_REVISION';
    }
    return 'ITERATIVE_REFINEMENT';
  }

  if (score >= SCORE_THRESHOLDS.REFINEMENT) {
    return 'ITERATIVE_REFINEMENT';
  }

  return 'REGENERATE';
}

// ============================================================================
// SELF-REVIEWER TYPES (Pre-Judge Validation)
// ============================================================================

/**
 * SelfReviewStatus - Result status from Self-Reviewer node
 *
 * Fail-Fast architecture with 4-phase evaluation:
 * - PASS: Content is clean, proceed to Judges
 * - PASS_WITH_FLAGS: Content acceptable with minor observations
 * - FIXED: Self-repairable hygiene issues were fixed, patched_content provided
 * - REGENERATE: Fatal errors (truncation, language failure), skip Judges
 * - FLAG_TO_JUDGE: Semantic issues requiring Judge attention
 */
export const SelfReviewStatusSchema = z.enum([
  'PASS',
  'PASS_WITH_FLAGS',
  'FIXED',
  'REGENERATE',
  'FLAG_TO_JUDGE',
]);

/** SelfReviewStatus type */
export type SelfReviewStatus = z.infer<typeof SelfReviewStatusSchema>;

/**
 * SelfReviewIssueType - Types of issues detected by Self-Reviewer
 *
 * Phase 1 (Integrity/Critical): TRUNCATION, LANGUAGE, EMPTY, SHORT_SECTION
 * Phase 2 (Hygiene): HYGIENE
 * Phase 3 (Semantic): ALIGNMENT, HALLUCINATION, LOGIC
 */
export const SelfReviewIssueTypeSchema = z.enum([
  'TRUNCATION',     // Content appears cut off (Phase 1)
  'LANGUAGE',       // Wrong language / script pollution (Phase 1)
  'EMPTY',          // Empty or placeholder fields (Phase 1)
  'SHORT_SECTION',  // Section has < 50 words (Phase 1)
  'HYGIENE',        // Chatbot artifacts, markdown errors (Phase 2)
  'ALIGNMENT',      // Learning objective mismatch (Phase 3)
  'HALLUCINATION',  // Contradicts RAG context (Phase 3)
  'LOGIC',          // Internal contradictions (Phase 3)
]);

/** SelfReviewIssueType type */
export type SelfReviewIssueType = z.infer<typeof SelfReviewIssueTypeSchema>;

/**
 * SelfReviewSeverity - Severity levels for Self-Review issues
 *
 * - CRITICAL: Must regenerate (Phase 1 failures)
 * - FIXABLE: Self-repairable (Phase 2 hygiene)
 * - COMPLEX: Requires Judge evaluation (Phase 3)
 * - INFO: Informational only (Phase 4)
 */
export const SelfReviewSeveritySchema = z.enum([
  'CRITICAL',  // Must regenerate
  'FIXABLE',   // Can be auto-fixed
  'COMPLEX',   // Needs Judge
  'INFO',      // Informational
]);

/** SelfReviewSeverity type */
export type SelfReviewSeverity = z.infer<typeof SelfReviewSeveritySchema>;

/**
 * SelfReviewIssue - Individual issue from Self-Reviewer
 */
export const SelfReviewIssueSchema = z.object({
  /** Type of issue */
  type: SelfReviewIssueTypeSchema,
  /** Severity level */
  severity: SelfReviewSeveritySchema,
  /** Location in content (section ID or "global") */
  location: z.string().min(1),
  /** Description of the issue */
  description: z.string().min(1),
});

/** SelfReviewIssue type */
export type SelfReviewIssue = z.infer<typeof SelfReviewIssueSchema>;

/**
 * SelfReviewResult - Complete result from Self-Reviewer node
 *
 * Part of Fail-Fast architecture to reduce Judge token costs by 30-50%
 * by filtering obviously broken content before expensive evaluation.
 */
export const SelfReviewResultSchema = z.object({
  /** Final status from evaluation */
  status: SelfReviewStatusSchema,
  /** Concise reasoning (max 2 sentences) */
  reasoning: z.string(),
  /** List of issues found */
  issues: z.array(SelfReviewIssueSchema).default([]),
  /**
   * Full patched content if status is FIXED.
   * Contains the complete LessonContentBody JSON.
   * Null for all other statuses.
   */
  patchedContent: z.any().nullable().default(null),
  /**
   * Section IDs that need regeneration (e.g., ['introduction', 'section_2']).
   * Populated when specific sections have fixable issues.
   * Used for section-level regeneration instead of full content replacement.
   */
  sectionsToRegenerate: z.array(z.string()).optional(),
  /** Tokens used for self-review LLM call */
  tokensUsed: z.number().int().min(0).default(0),
  /** Duration of self-review in milliseconds */
  durationMs: z.number().int().min(0).default(0),
  /** Whether heuristic pre-checks passed */
  heuristicsPassed: z.boolean().default(true),
  /** Details from heuristic checks (language, truncation) */
  heuristicDetails: z.object({
    languageCheck: z.object({
      passed: z.boolean(),
      foreignCharacters: z.number().default(0),
      scriptsFound: z.array(z.string()).default([]),
    }).optional(),
    truncationCheck: z.object({
      passed: z.boolean(),
      issues: z.array(z.string()).default([]),
    }).optional(),
  }).optional(),
});

/** SelfReviewResult type */
export type SelfReviewResult = z.infer<typeof SelfReviewResultSchema>;

/**
 * SelfReviewerConfig - Configuration for Self-Reviewer node
 */
export const SelfReviewerConfigSchema = z.object({
  /** Enable heuristic pre-checks (FREE, no LLM) */
  enableHeuristicChecks: z.boolean().default(true),
  /** Enable LLM-based semantic review */
  enableLLMReview: z.boolean().default(true),
  /** Skip self-review if content is short */
  minContentLengthForReview: z.number().int().min(0).default(100),
  /** Model to use for self-review (should be fast/cheap) */
  model: z.string().optional(),
  /** Temperature for self-review (low for consistency) */
  temperature: z.number().min(0).max(1).default(0.1),
});

/** SelfReviewerConfig type */
export type SelfReviewerConfig = z.infer<typeof SelfReviewerConfigSchema>;

/**
 * Validate a SelfReviewResult
 * @param result - Raw result data to validate
 * @returns Validation result with parsed data or errors
 */
export function validateSelfReviewResult(result: unknown) {
  return SelfReviewResultSchema.safeParse(result);
}

// ============================================================================
// PROGRESS SUMMARY TYPES (User-Friendly Messages)
// ============================================================================

/**
 * SummaryItemSeverity - Severity level for progress summary items
 */
export const SummaryItemSeveritySchema = z.enum(['info', 'warning', 'error']);
export type SummaryItemSeverity = z.infer<typeof SummaryItemSeveritySchema>;

/**
 * SummaryItem - A single item in the progress summary
 *
 * Used to display user-friendly messages about issues found or fixes applied.
 */
export const SummaryItemSchema = z.object({
  /** Brief description (1-2 sentences) */
  text: z.string(),
  /** Severity level */
  severity: SummaryItemSeveritySchema,
});

export type SummaryItem = z.infer<typeof SummaryItemSchema>;

/**
 * ProgressSummaryStatus - Overall status of the generation progress
 */
export const ProgressSummaryStatusSchema = z.enum([
  'generating',
  'reviewing',
  'fixing',
  'completed',
  'failed',
]);
export type ProgressSummaryStatus = z.infer<typeof ProgressSummaryStatusSchema>;

/**
 * NodeAttemptSummary - Summary for a single node execution attempt
 *
 * Captures user-friendly information about what happened during
 * a single execution of a pipeline node (generator, selfReviewer, judge).
 */
export const NodeAttemptSummarySchema = z.object({
  /** Node name (generator, selfReviewer, judge) */
  node: z.string(),
  /** Attempt number (1-based) */
  attempt: z.number().int().min(1),
  /** Status of this attempt */
  status: ProgressSummaryStatusSchema,
  /** Result label (e.g., "PASS", "PASS_WITH_FLAGS", "ACCEPT") */
  resultLabel: z.string().optional(),
  /** Issues found during this attempt */
  issuesFound: z.array(SummaryItemSchema).default([]),
  /** Actions performed during this attempt */
  actionsPerformed: z.array(SummaryItemSchema).default([]),
  /** Outcome message (where it was routed next) */
  outcome: z.string().optional(),
  /** Timestamp when this attempt started */
  startedAt: z.coerce.date().optional(),
  /** Duration in milliseconds */
  durationMs: z.number().int().min(0).optional(),
  /** Tokens used */
  tokensUsed: z.number().int().min(0).optional(),
});

export type NodeAttemptSummary = z.infer<typeof NodeAttemptSummarySchema>;

/**
 * ProgressSummary - Aggregated progress summary for lesson generation
 *
 * Contains all attempt summaries grouped by node, providing a complete
 * picture of what happened during generation.
 */
export const ProgressSummarySchema = z.object({
  /** Current overall status */
  status: ProgressSummaryStatusSchema,
  /** Current phase description (localized) */
  currentPhase: z.string(),
  /** Language code used for messages (e.g., 'ru', 'en') */
  language: z.string().default('en'),
  /** All attempt summaries, grouped by node */
  attempts: z.array(NodeAttemptSummarySchema).default([]),
  /** Final outcome message */
  outcome: z.string().optional(),
});

export type ProgressSummary = z.infer<typeof ProgressSummarySchema>;
