/**
 * Targeted Refinement API Contracts
 * @module contracts/refinement-api
 *
 * Internal API contracts for Stage 6 Targeted Refinement system.
 * These are NOT tRPC endpoints - they define internal function signatures
 * for the refinement pipeline components.
 */

import { z } from 'zod';
import {
  JudgeAggregatedResultSchema,
  TargetedIssueSchema,
  SectionRefinementTaskSchema,
  RefinementPlanSchema,
  JudgeIssueSchema,
  OperationModeSchema,
  JudgeConfidenceSchema,
  RefinementStatusSchema,
  BestEffortResultSchema,
  IterationResultSchema,
} from '@megacampus/shared-types/judge-types';
import { LessonContentBodySchema } from '@megacampus/shared-types/lesson-content';

// ============================================================================
// ARBITER CONTRACTS
// ============================================================================

/**
 * ArbiterInput - Input for consolidateVerdicts()
 */
export const ArbiterInputSchema = z.object({
  /** Aggregated result from CLEV voting (2-3 verdicts) */
  clevResult: JudgeAggregatedResultSchema,
  /** Lesson content body for extracting context anchors */
  lessonContent: LessonContentBodySchema,
  /** Operation mode affects conflict resolution behavior */
  operationMode: OperationModeSchema,
});

export type ArbiterInput = z.infer<typeof ArbiterInputSchema>;

/**
 * ArbiterOutput - Result of consolidateVerdicts()
 */
export const ArbiterOutputSchema = z.object({
  /** Generated refinement plan */
  plan: RefinementPlanSchema,
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

export type ArbiterOutput = z.infer<typeof ArbiterOutputSchema>;

// ============================================================================
// ROUTER CONTRACTS
// ============================================================================

/**
 * RouterDecision - Result of routeTask()
 */
export const RouterDecisionSchema = z.object({
  /** Task being routed */
  task: SectionRefinementTaskSchema,
  /** Chosen fix action */
  action: z.enum(['SURGICAL_EDIT', 'REGENERATE_SECTION', 'FULL_REGENERATE']),
  /** Agent to execute the fix */
  executor: z.enum(['patcher', 'section-expander', 'planner']),
  /** Estimated token cost */
  estimatedTokens: z.number().int().min(0),
  /** Routing reasoning */
  reason: z.string(),
});

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

export type RoutingConfig = z.infer<typeof RoutingConfigSchema>;

// ============================================================================
// PATCHER CONTRACTS
// ============================================================================

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
});

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

export type PatcherOutput = z.infer<typeof PatcherOutputSchema>;

// ============================================================================
// SECTION-EXPANDER CONTRACTS
// ============================================================================

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
});

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

export type SectionExpanderOutput = z.infer<typeof SectionExpanderOutputSchema>;

// ============================================================================
// DELTA JUDGE CONTRACTS
// ============================================================================

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

export type DeltaJudgeOutput = z.infer<typeof DeltaJudgeOutputSchema>;

// ============================================================================
// QUALITY LOCK CONTRACTS
// ============================================================================

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

export type QualityLockCheckResult = z.infer<typeof QualityLockCheckResultSchema>;

// ============================================================================
// ITERATION CONTROLLER CONTRACTS
// ============================================================================

/**
 * IterationControllerInput - Input for iteration control
 */
export const IterationControllerInputSchema = z.object({
  /** Current iteration state */
  currentState: z.object({
    iteration: z.number().int().min(0),
    scoreHistory: z.array(z.number()),
    contentHistory: z.array(IterationResultSchema),
    lockedSections: z.array(z.string()),
    sectionEditCount: z.record(z.string(), z.number()),
    qualityLocks: z.record(z.string(), z.number()),
    tokensUsed: z.number().int().min(0),
    startTime: z.number().int(), // Unix timestamp ms
  }),
  /** Latest score after batch */
  latestScore: z.number().min(0).max(1),
  /** Operation mode */
  operationMode: OperationModeSchema,
});

export type IterationControllerInput = z.infer<typeof IterationControllerInputSchema>;

/**
 * IterationControllerOutput - Decision from iteration controller
 */
export const IterationControllerOutputSchema = z.object({
  /** Should continue iterating? */
  shouldContinue: z.boolean(),
  /** Reason for decision */
  reason: z.enum([
    'continue_more_tasks',
    'stop_converged',
    'stop_max_iterations',
    'stop_token_budget',
    'stop_timeout',
    'stop_all_sections_locked',
    'stop_score_threshold_met',
  ]),
  /** Updated locked sections */
  newlyLockedSections: z.array(z.string()),
  /** Remaining tasks after filtering locked sections */
  remainingTaskCount: z.number().int().min(0),
});

export type IterationControllerOutput = z.infer<typeof IterationControllerOutputSchema>;

// ============================================================================
// BEST-EFFORT SELECTOR CONTRACTS
// ============================================================================

/**
 * BestEffortSelectorInput - Input for selecting best iteration
 */
export const BestEffortSelectorInputSchema = z.object({
  /** All iteration results */
  iterationHistory: z.array(IterationResultSchema),
  /** Unresolved issues from final iteration */
  unresolvedIssues: z.array(JudgeIssueSchema),
  /** Operation mode */
  operationMode: OperationModeSchema,
});

export type BestEffortSelectorInput = z.infer<typeof BestEffortSelectorInputSchema>;

/**
 * BestEffortSelectorOutput - Selected best result
 */
export const BestEffortSelectorOutputSchema = z.object({
  /** Best result */
  bestResult: BestEffortResultSchema,
  /** Selected iteration index */
  selectedIteration: z.number().int().min(0),
  /** Why this iteration was selected */
  selectionReason: z.string(),
  /** Final refinement status */
  finalStatus: RefinementStatusSchema,
});

export type BestEffortSelectorOutput = z.infer<typeof BestEffortSelectorOutputSchema>;

// ============================================================================
// STREAMING EVENT CONTRACTS
// ============================================================================

/**
 * Extended RefinementEvent types for UI streaming
 * (Base types already in judge-types.ts, this adds discriminated union handling)
 */
export const RefinementStreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('refinement_start'),
    targetSections: z.array(z.string()),
    mode: OperationModeSchema,
    totalTasks: z.number().int(),
    estimatedTokens: z.number().int(),
  }),
  z.object({
    type: z.literal('arbiter_complete'),
    agreementScore: z.number(),
    agreementLevel: z.enum(['high', 'moderate', 'low']),
    acceptedIssueCount: z.number().int(),
    rejectedIssueCount: z.number().int(),
  }),
  z.object({
    type: z.literal('batch_started'),
    batchIndex: z.number().int(),
    sections: z.array(z.string()),
  }),
  z.object({
    type: z.literal('task_started'),
    sectionId: z.string(),
    taskType: z.enum(['SURGICAL_EDIT', 'REGENERATE_SECTION']),
  }),
  z.object({
    type: z.literal('patch_applied'),
    sectionId: z.string(),
    success: z.boolean(),
    diffSummary: z.string(),
    tokensUsed: z.number().int(),
  }),
  z.object({
    type: z.literal('verification_result'),
    sectionId: z.string(),
    passed: z.boolean(),
    newIssueCount: z.number().int(),
  }),
  z.object({
    type: z.literal('section_locked'),
    sectionId: z.string(),
    reason: z.enum(['max_edits', 'regression', 'oscillation']),
  }),
  z.object({
    type: z.literal('batch_complete'),
    batchIndex: z.number().int(),
    successCount: z.number().int(),
    failedCount: z.number().int(),
  }),
  z.object({
    type: z.literal('iteration_complete'),
    iteration: z.number().int(),
    score: z.number(),
    improvement: z.number(),
    sectionsLocked: z.array(z.string()),
  }),
  z.object({
    type: z.literal('refinement_complete'),
    finalScore: z.number(),
    status: RefinementStatusSchema,
    totalIterations: z.number().int(),
    totalTokensUsed: z.number().int(),
    totalDurationMs: z.number().int(),
  }),
]);

export type RefinementStreamEvent = z.infer<typeof RefinementStreamEventSchema>;
