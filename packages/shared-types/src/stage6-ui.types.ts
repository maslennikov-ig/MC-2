/**
 * Stage 6 UI Types - Glass Factory Monitoring Dashboard
 * @module @megacampus/shared-types/stage6-ui.types
 *
 * Type definitions for the Stage 6 lesson generation pipeline UI.
 * Provides types for:
 * - Pipeline node state tracking (3 nodes: generator → selfReviewer → judge)
 * - CLEV voting visualization (multi-judge consensus)
 * - Module dashboard (lesson matrix with aggregated metrics)
 * - Lesson inspector (detailed pipeline view with logs and content preview)
 *
 * Based on: Stage 6 "Glass Factory" UI design (Module Dashboard + Lesson Inspector)
 */

import type { JudgeRecommendation, SelfReviewResult } from './judge-types';

// =============================================================================
// Pipeline Node Types
// =============================================================================

/**
 * Stage6NodeName - The 3 pipeline nodes in Stage 6 lesson generation
 *
 * Pipeline flow:
 * 1. generator: Generates full lesson content (intro + sections + summary) in one pass
 * 2. selfReviewer: Pre-judge validation (Fail-Fast architecture)
 * 3. judge: Evaluates quality using CLEV voting and targeted refinement
 *
 * BACKWARD COMPATIBILITY: Legacy node names (planner, expander, assembler, smoother) are
 * included for parsing trace logs from old generations. These map to 'generator' in the UI.
 */
export type Stage6NodeName = 'generator' | 'selfReviewer' | 'judge' | 'planner' | 'expander' | 'assembler' | 'smoother';

/**
 * Stage6NodeStatus - Current status of a pipeline node
 *
 * - pending: Not started yet
 * - active: Currently processing
 * - completed: Successfully finished
 * - error: Failed with error
 * - loop: In refinement loop (for judge node)
 */
export type Stage6NodeStatus = 'pending' | 'active' | 'completed' | 'error' | 'loop';

/**
 * PipelineNodeState - Current state of a single pipeline node
 *
 * Tracks execution progress, timing, costs, and outputs for each node.
 * Used in both Module Dashboard (micro-stepper) and Lesson Inspector (detailed view).
 */
export interface PipelineNodeState {
  /** Which pipeline node */
  node: Stage6NodeName;
  /** Current status */
  status: Stage6NodeStatus;
  /** Progress percentage (0-100), used for expander parallel progress */
  progress?: number;
  /** When processing started (ISO timestamp) */
  startedAt?: Date;
  /** When processing completed (ISO timestamp) */
  completedAt?: Date;
  /** Total tokens consumed by this node */
  tokensUsed?: number;
  /** Estimated cost in USD */
  costUsd?: number;
  /** Processing duration in milliseconds */
  durationMs?: number;
  /** Error message if status is 'error' */
  errorMessage?: string;
  /** Retry attempt number (0 = first try) */
  retryAttempt?: number;
  /** Node-specific output for inspection (raw JSON) */
  output?: unknown;
}

// =============================================================================
// Judge Voting Types (CLEV Visualization)
// =============================================================================

/**
 * JudgeVerdictType - Verdict from a single judge evaluation
 *
 * Unified with JudgeRecommendation from judge-types for consistency.
 *
 * Based on research: docs/research/010-stage6-generation-strategy/
 * Decision thresholds:
 * - ACCEPT: score >= 0.90 (auto-accept, excellent quality)
 * - ACCEPT_WITH_MINOR_REVISION: score 0.75-0.90 with localized issues (targeted fix)
 * - ITERATIVE_REFINEMENT: score 0.60-0.75 (max 2 iterations)
 * - REGENERATE: score < 0.60 (fundamental issues, regenerate with feedback)
 * - ESCALATE_TO_HUMAN: persistent issues or low confidence
 */
export type JudgeVerdictType = JudgeRecommendation;

/**
 * IndividualJudgeVote - A single judge's evaluation vote
 *
 * Used in CLEV (Consensus via Lightweight Efficient Voting) visualization.
 * Shows individual model evaluation with detailed criteria scoring.
 */
export interface IndividualJudgeVote {
  /** Unique judge identifier (e.g., "judge-1", "judge-2") */
  judgeId: string;
  /** Model identifier (e.g., "claude-3.5-sonnet", "gpt-4o", "deepseek-chat") */
  modelId: string;
  /** Human-readable model name (e.g., "Claude 3.5", "GPT-4o", "DeepSeek") */
  modelDisplayName: string;
  /** Verdict from this judge */
  verdict: JudgeVerdictType;
  /** Overall quality score (0-1) */
  score: number;
  /** Individual criteria scores (0-1 scale) */
  criteria: {
    /** Learning objective alignment (25% weight) */
    coherence: number;
    /** Factual accuracy - requires RAG grounding (15% weight) */
    accuracy: number;
    /** Content completeness (10% weight) */
    completeness: number;
    /** Clarity and readability (15% weight) */
    readability: number;
    /** Additional criteria (extensible) */
    [key: string]: number;
  };
  /** Reasoning for the verdict (optional) */
  reasoning?: string;
  /** When evaluation was performed */
  evaluatedAt: Date;
}

/**
 * ConsensusMethod - How the final decision was reached in CLEV voting
 *
 * CLEV approach:
 * - unanimous: All judges agreed (70-85% of cases, saves 67% cost)
 * - majority: 2 out of 3 judges agreed
 * - tie-breaker: 3rd judge invoked to break tie between first two judges
 */
export type ConsensusMethod = 'unanimous' | 'majority' | 'tie-breaker';

/**
 * CLEVVotingResult - Aggregated result from CLEV voting process
 *
 * Shows all individual votes, consensus method, and final decision.
 * Used for detailed judge verdict visualization in Lesson Inspector.
 */
export interface CLEVVotingResult {
  /** Individual votes from all judges (2-3 typically) */
  votes: IndividualJudgeVote[];
  /** How consensus was reached */
  consensusMethod: ConsensusMethod;
  /** Final verdict after aggregation */
  finalVerdict: JudgeVerdictType;
  /** Final aggregated score (weighted mean) */
  finalScore: number;
  /** Which judge was the tie-breaker (if any) */
  tieBreakerId?: string;
  /** Whether 3rd judge was invoked */
  isThirdJudgeInvoked: boolean;
}

/**
 * CascadeStageType - Which stage of cascade evaluation produced the result
 */
export type CascadeStageType = 'heuristic' | 'single_judge' | 'clev_voting';

/**
 * HeuristicsResult - Detailed heuristic evaluation results
 */
export interface HeuristicsResult {
  /** Whether all heuristics passed */
  passed: boolean;
  /** Actual word count */
  wordCount?: number;
  /** Flesch-Kincaid grade level (0 or undefined if skipped) */
  fleschKincaid?: number;
  /** Whether Flesch-Kincaid was skipped (non-English content) */
  fleschKincaidSkipped?: boolean;
  /** Number of examples found */
  examplesCount?: number;
  /** Number of exercises found */
  exercisesCount?: number;
  /** List of failure reasons */
  failureReasons: string[];
}

/**
 * SingleJudgeResult - Result from single judge evaluation (Stage 2)
 */
export interface SingleJudgeResult {
  /** Model used */
  model: string;
  /** Overall score (0-1) */
  score: number;
  /** Confidence level */
  confidence: 'high' | 'medium' | 'low';
  /** Per-criterion scores */
  criteriaScores?: Record<string, number>;
  /** Found issues */
  issues?: Array<{
    criterion: string;
    severity: string;
    location?: string;
    description: string;
    suggestedFix?: string;
  }>;
  /** Positive aspects */
  strengths?: string[];
  /** Recommendation */
  recommendation: string;
}

/**
 * JudgeVerdictDisplay - Complete judge verdict visualization data
 *
 * Combines CLEV voting results with heuristic checks and highlighted issues.
 * Used in Lesson Inspector to show detailed quality evaluation.
 *
 * Enhanced in v0.23.0 to support cascade evaluation visibility:
 * - cascadeStage: Which evaluation stage produced the result
 * - stageReason: Why this stage was chosen
 * - heuristicsResult: Detailed heuristic check results
 * - singleJudgeResult: Single judge results (if applicable)
 * - costSavingsRatio: Cost efficiency from cascade
 */
export interface JudgeVerdictDisplay {
  /** CLEV voting result with all judges' verdicts */
  votingResult: CLEVVotingResult;
  /** Whether basic heuristics passed (length, structure, etc.) */
  heuristicsPassed: boolean;
  /** List of heuristic issues if any */
  heuristicsIssues?: string[];
  /** Sections with identified issues (for targeted refinement) */
  highlightedSections?: Array<{
    /** Section index in the lesson */
    sectionIndex: number;
    /** Section title */
    sectionTitle: string;
    /** Description of the issue */
    issue: string;
    /** Severity level */
    severity: 'low' | 'medium' | 'high';
  }>;

  // =========================================================================
  // CASCADE EVALUATION VISIBILITY (v0.23.0+)
  // =========================================================================

  /** Which cascade stage produced the final result */
  cascadeStage?: CascadeStageType;
  /** Human-readable reason for this stage */
  stageReason?: string;
  /** Detailed heuristic results (if available) */
  heuristicsResult?: HeuristicsResult;
  /** Single judge result (if Stage 2 was reached) */
  singleJudgeResult?: SingleJudgeResult;
  /** Cost savings ratio (0-1): 1.0 = 100% saved (heuristic), 0.67 = single judge, 0 = full CLEV */
  costSavingsRatio?: number;
  /** Current retry attempt number */
  retryCount?: number;
}

// =============================================================================
// Module Dashboard Types
// =============================================================================

/**
 * MicroStepperState - Compact pipeline state for Module Dashboard
 *
 * Shows only node names and statuses (no detailed metrics).
 * Displayed as a horizontal progress indicator in the lesson matrix.
 */
export interface MicroStepperState {
  /** Pipeline nodes with their current status */
  nodes: Array<{
    /** Node name */
    node: Stage6NodeName;
    /** Current status */
    status: Stage6NodeStatus;
  }>;
}

/**
 * LessonMatrixRow - A single row in the Module Dashboard lesson matrix
 *
 * Represents one lesson with its pipeline state and key metrics.
 * Displayed in tabular format with sorting and filtering capabilities.
 */
export interface LessonMatrixRow {
  /** Lesson UUID */
  lessonId: string;
  /** Lesson number within module (1-based) */
  lessonNumber: number;
  /** Lesson title */
  title: string;
  /** Overall lesson status (derived from pipeline state) */
  status: 'pending' | 'active' | 'completed' | 'error';
  /** Compact pipeline state for micro-stepper */
  pipelineState: MicroStepperState;
  /** Final quality score from judge (0-1, null if not judged yet) */
  qualityScore: number | null;
  /** Total cost for this lesson in USD */
  costUsd: number;
  /** Total processing duration in milliseconds (null if pending/active) */
  durationMs: number | null;
  /** Number of retry attempts */
  retryCount: number;
  /** Whether retry action is available */
  canRetry: boolean;
}

/**
 * ModuleDashboardAggregates - Aggregated metrics for the entire module
 *
 * Provides summary statistics across all lessons in the module.
 * Displayed at the top of the Module Dashboard.
 */
export interface ModuleDashboardAggregates {
  /** Total number of lessons in module */
  totalLessons: number;
  /** Number of completed lessons */
  completedLessons: number;
  /** Number of active (processing) lessons */
  activeLessons: number;
  /** Number of error lessons */
  errorLessons: number;
  /** Number of pending (not started) lessons */
  pendingLessons: number;
  /** Total cost across all lessons in USD */
  totalCostUsd: number;
  /** Average quality score (null if no lessons judged yet) */
  avgQualityScore: number | null;
  /** Total processing time across all lessons in milliseconds */
  totalDurationMs: number;
  /** Estimated time remaining for pending/active lessons (null if unknown) */
  estimatedTimeRemainingMs: number | null;
}

/**
 * ModuleDashboardData - Complete data for Module Dashboard view
 *
 * Contains module metadata, all lesson rows, and aggregated metrics.
 * Top-level data structure for the Module Dashboard component.
 */
export interface ModuleDashboardData {
  /** Module UUID */
  moduleId: string;
  /** Module number within course (1-based) */
  moduleNumber: number;
  /** Module title */
  title: string;
  /** Overall module status (derived from lessons) */
  status: 'pending' | 'active' | 'completed' | 'error';
  /** All lessons in the module */
  lessons: LessonMatrixRow[];
  /** Aggregated metrics */
  aggregates: ModuleDashboardAggregates;
}

// =============================================================================
// Lesson Inspector Types
// =============================================================================

/**
 * LessonLogEntry - A single log entry in Lesson Inspector
 *
 * Provides detailed execution logs for debugging and monitoring.
 * Logs are timestamped and categorized by node and severity.
 */
export interface LessonLogEntry {
  /** Unique log entry ID */
  id: string;
  /** When the log entry was created */
  timestamp: Date;
  /** Log level */
  level: 'debug' | 'info' | 'warn' | 'error';
  /** Which node generated this log (or 'system' for orchestrator) */
  node: Stage6NodeName | 'system';
  /** Log message */
  message: string;
  /** Additional structured data (optional) */
  details?: Record<string, unknown>;
}

/**
 * LessonContentPreview - Preview of generated lesson content
 *
 * Provides a structured summary of the lesson without full markdown.
 * Used for quick content review in Lesson Inspector.
 */
export interface LessonContentPreview {
  /** Lesson introduction text */
  introduction: string;
  /** Lesson sections with key points */
  sections: Array<{
    /** Section title */
    title: string;
    /** Section content (truncated if needed) */
    content: string;
    /** Key learning points in this section */
    keyPoints: string[];
  }>;
  /** Lesson summary/conclusion */
  summary: string;
  /** Number of exercises/assessments included */
  exerciseCount: number;
}

/**
 * LessonInspectorData - Complete data for Lesson Inspector view
 *
 * Provides detailed information about a single lesson's generation pipeline:
 * - Full pipeline state with all nodes
 * - Generated content preview and raw markdown
 * - Judge evaluation results
 * - Execution logs
 * - Available actions
 *
 * Top-level data structure for the Lesson Inspector component.
 */
export interface LessonInspectorData {
  /** Lesson UUID */
  lessonId: string;
  /** Lesson number within module (1-based) */
  lessonNumber: number;
  /** Module UUID */
  moduleId: string;
  /** Lesson title */
  title: string;
  /** Overall lesson status */
  status: 'pending' | 'active' | 'completed' | 'error';

  // Pipeline state
  /** Detailed state for all pipeline nodes */
  pipelineNodes: PipelineNodeState[];
  /** Currently active node (null if pending or completed) */
  currentNode: Stage6NodeName | null;

  // Content
  /** Structured content preview (null if not generated yet) */
  content: LessonContentPreview | null;
  /** Raw markdown content (null if not generated yet) */
  rawMarkdown: string | null;

  // Quality
  /** Self-review result from pre-judge validation (null if not reviewed yet) */
  selfReviewResult?: SelfReviewResult | null;
  /** Judge evaluation result with CLEV voting (null if not judged yet) */
  judgeResult: JudgeVerdictDisplay | null;

  // Metrics
  /** Total tokens consumed across all nodes */
  totalTokensUsed: number;
  /** Total cost in USD */
  totalCostUsd: number;
  /** Total processing duration in milliseconds */
  totalDurationMs: number;
  /** Number of retry attempts */
  retryCount: number;
  /** Number of refinement iterations (judge loop) */
  refinementIterations: number;

  // Logs
  /** Execution logs for debugging */
  logs: LessonLogEntry[];

  // Actions
  /** Whether regeneration action is available */
  canRegenerate: boolean;
  /** Whether manual approval action is available */
  canApprove: boolean;
  /** Whether manual editing action is available */
  canEdit: boolean;
}

// =============================================================================
// Russian Labels
// =============================================================================

/**
 * STAGE6_NODE_LABELS - Russian labels for pipeline nodes
 *
 * Provides localized labels and descriptions for UI display.
 * Includes both new 3-node pipeline and legacy nodes for backward compatibility.
 */
export const STAGE6_NODE_LABELS: Record<Stage6NodeName, { ru: string; description: string }> = {
  // New 3-node pipeline
  generator: { ru: 'Генератор', description: 'Генерация полного контента урока' },
  selfReviewer: { ru: 'Самопроверка', description: 'Предварительная проверка качества' },
  judge: { ru: 'Оценка качества', description: 'Проверка критериев и доработка' },
  // Legacy nodes for backward compatibility with old trace logs
  planner: { ru: 'Планировщик', description: 'Создание структуры урока' },
  expander: { ru: 'Наполнение', description: 'Генерация контента (параллельно)' },
  assembler: { ru: 'Сборщик', description: 'Объединение разделов' },
  smoother: { ru: 'Редактор', description: 'Стилистическая правка' },
} as const;

/**
 * JUDGE_VERDICT_LABELS - Russian labels for judge verdicts
 *
 * Provides localized labels and color coding for verdict types.
 */
export const JUDGE_VERDICT_LABELS: Record<JudgeVerdictType, { ru: string; color: string }> = {
  ACCEPT: { ru: 'Принять', color: 'emerald' },
  ACCEPT_WITH_MINOR_REVISION: { ru: 'Точечное исправление', color: 'yellow' },
  ITERATIVE_REFINEMENT: { ru: 'Итеративная доработка', color: 'orange' },
  REGENERATE: { ru: 'Переделать', color: 'red' },
  ESCALATE_TO_HUMAN: { ru: 'Ручная проверка', color: 'purple' },
} as const;

/**
 * CONSENSUS_METHOD_LABELS - Russian labels for consensus methods
 *
 * Provides localized labels for CLEV voting methods.
 */
export const CONSENSUS_METHOD_LABELS: Record<ConsensusMethod, string> = {
  unanimous: 'Единогласно',
  majority: 'Большинством',
  'tie-breaker': 'Решающий голос',
} as const;

// =============================================================================
// Targeted Refinement UI Types (T093-T098)
// =============================================================================

/**
 * RefinementAgentName - Agent types in the targeted refinement pipeline
 *
 * Maps to executors in the Router decision:
 * - arbiter: Consolidates judge verdicts and creates refinement plan
 * - patcher: Performs surgical edits on sections
 * - section-expander: Regenerates entire sections
 * - delta-judge: Verifies patch results
 */
export type RefinementAgentName = 'arbiter' | 'patcher' | 'section-expander' | 'delta-judge' | 'orchestrator';

/**
 * RefinementEventType - All streaming event types for UI updates
 *
 * Based on RefinementEvent union in judge-types.ts.
 * Used for event filtering and display in RefinementPlanPanel.
 */
export type RefinementEventType =
  | 'refinement_start'
  | 'arbiter_complete'
  | 'batch_started'
  | 'task_started'
  | 'patch_applied'
  | 'verification_result'
  | 'quality_lock_triggered'
  | 'section_locked'
  | 'batch_complete'
  | 'iteration_complete'
  | 'escalation_triggered'
  | 'refinement_complete';

/**
 * FixActionType - Types of fix actions for display
 */
export type FixActionType = 'SURGICAL_EDIT' | 'REGENERATE_SECTION' | 'FULL_REGENERATE';

/**
 * SectionLockReason - Why a section was locked
 */
export type SectionLockReason = 'max_edits' | 'regression' | 'oscillation';

/**
 * RefinementTaskDisplay - UI display model for a single refinement task (T093)
 *
 * Transforms SectionRefinementTask for UI consumption with human-readable status,
 * progress indicators, and localized labels.
 *
 * Represents one section refinement task in the targeted refinement pipeline.
 * Shows current execution status, issues being addressed, and resource usage.
 *
 * @see SectionRefinementTask - Backend type for refinement tasks
 * @see RefinementEvent - Emitted as 'task_started', 'patch_applied', etc.
 *
 * @example
 * ```typescript
 * const taskDisplay: RefinementTaskDisplay = {
 *   taskId: 'task-sec-2-0',
 *   sectionId: 'sec_2',
 *   sectionTitle: 'Introduction to Variables',
 *   fixAction: 'SURGICAL_EDIT',
 *   fixActionLabel: 'Точечная правка',
 *   status: 'completed',
 *   issueCount: 2,
 *   issueSummaries: ['Улучшить ясность', 'Добавить пример'],
 *   instructionsPreview: 'Improve clarity in paragraph 2...',
 *   tokensUsed: 850,
 *   durationMs: 1200,
 *   isLocked: false,
 *   editCount: 1,
 * };
 * ```
 */
export interface RefinementTaskDisplay {
  /** Unique task identifier */
  taskId: string;
  /** Target section ID */
  sectionId: string;
  /** Section title for display */
  sectionTitle: string;
  /** Type of fix action */
  fixAction: FixActionType;
  /** Human-readable fix action label (Russian) */
  fixActionLabel: string;
  /** Current task status */
  status: 'pending' | 'active' | 'completed' | 'failed' | 'skipped';
  /** Issues being addressed (count) */
  issueCount: number;
  /** Issue descriptions (truncated for display) */
  issueSummaries: string[];
  /** Synthesized instructions preview (truncated) */
  instructionsPreview: string;
  /** Tokens used (null if not started) */
  tokensUsed: number | null;
  /** Duration in ms (null if not completed) */
  durationMs: number | null;
  /** Whether section is locked (no more edits allowed) */
  isLocked: boolean;
  /** Lock reason if locked */
  lockReason?: SectionLockReason;
  /** Edit count for this section */
  editCount: number;
}

/**
 * RefinementIterationDisplay - UI display model for a refinement iteration (T094)
 *
 * Shows progress through one complete iteration of the refinement loop.
 * Each iteration processes one batch of tasks, updates scores, and may lock sections.
 *
 * Used in RefinementPlanDisplay to show iteration history and current progress.
 *
 * @see RefinementPlanDisplay - Contains all iterations
 * @see RefinementEvent - 'iteration_complete' event emitted when iteration finishes
 *
 * @example
 * ```typescript
 * const iteration: RefinementIterationDisplay = {
 *   iterationNumber: 2,
 *   status: 'completed',
 *   tasks: [task1Display, task2Display],
 *   startScore: 0.78,
 *   endScore: 0.84,
 *   improvement: 0.06,
 *   sectionsLocked: ['sec_3'],
 *   tokensUsed: 2500,
 *   durationMs: 3500,
 *   startedAt: new Date('2024-01-15T10:00:00Z'),
 *   completedAt: new Date('2024-01-15T10:00:03Z'),
 * };
 * ```
 */
export interface RefinementIterationDisplay {
  /** Iteration number (1-based) */
  iterationNumber: number;
  /** Iteration status */
  status: 'pending' | 'active' | 'completed';
  /** Tasks in this iteration */
  tasks: RefinementTaskDisplay[];
  /** Score at start of iteration */
  startScore: number;
  /** Score at end of iteration (null if not completed) */
  endScore: number | null;
  /** Score improvement (endScore - startScore) */
  improvement: number | null;
  /** Sections locked after this iteration */
  sectionsLocked: string[];
  /** Tokens used in this iteration */
  tokensUsed: number;
  /** Duration in ms */
  durationMs: number | null;
  /** When iteration started */
  startedAt: Date;
  /** When iteration completed */
  completedAt: Date | null;
}

/**
 * RefinementPlanDisplay - UI display model for the entire refinement plan (T095)
 *
 * Top-level container for refinement progress visualization.
 * Combines arbiter results, iteration history, and real-time progress tracking.
 *
 * Shows the complete state of the targeted refinement process:
 * - Arbiter consensus and agreement level
 * - All iterations with score progression
 * - Section locking status
 * - Token/budget tracking
 * - Overall plan status
 *
 * @see ArbiterOutput - Backend type for arbiter results
 * @see RefinementIterationDisplay - Individual iteration details
 * @see RefinementEvent - 'refinement_start', 'refinement_complete' events
 *
 * @example
 * ```typescript
 * const plan: RefinementPlanDisplay = {
 *   planId: 'plan-abc123',
 *   lessonId: 'lesson-xyz',
 *   mode: 'full-auto',
 *   modeLabel: 'Автоматический',
 *   status: 'active',
 *   agreementScore: 0.85,
 *   agreementLevel: 'high',
 *   acceptedIssueCount: 5,
 *   rejectedIssueCount: 2,
 *   iterations: [iteration1, iteration2],
 *   currentIteration: 2,
 *   maxIterations: 3,
 *   targetSections: ['sec_1', 'sec_2', 'sec_3'],
 *   lockedSections: ['sec_1'],
 *   initialScore: 0.72,
 *   currentScore: 0.84,
 *   acceptThreshold: 0.85,
 *   goodEnoughThreshold: 0.75,
 *   totalTokensUsed: 5000,
 *   tokenBudget: 15000,
 *   startedAt: new Date('2024-01-15T10:00:00Z'),
 *   completedAt: null,
 *   totalDurationMs: null,
 * };
 * ```
 */
export interface RefinementPlanDisplay {
  /** Plan identifier */
  planId: string;
  /** Lesson being refined */
  lessonId: string;
  /** Operation mode */
  mode: 'full-auto' | 'semi-auto';
  /** Human-readable mode label (Russian) */
  modeLabel: string;
  /** Overall plan status */
  status: 'pending' | 'active' | 'completed' | 'escalated';
  /** Arbiter agreement score (Krippendorff's Alpha) */
  agreementScore: number;
  /** Agreement level interpretation */
  agreementLevel: 'high' | 'moderate' | 'low';
  /** Total issues accepted by arbiter */
  acceptedIssueCount: number;
  /** Total issues rejected by arbiter */
  rejectedIssueCount: number;
  /** All iterations */
  iterations: RefinementIterationDisplay[];
  /** Current iteration (1-based, 0 if not started) */
  currentIteration: number;
  /** Maximum iterations allowed */
  maxIterations: number;
  /** Target sections for refinement */
  targetSections: string[];
  /** Currently locked sections */
  lockedSections: string[];
  /** Initial score before refinement */
  initialScore: number;
  /** Current score */
  currentScore: number;
  /** Accept threshold for mode */
  acceptThreshold: number;
  /** Good enough threshold for mode */
  goodEnoughThreshold: number;
  /** Total tokens used */
  totalTokensUsed: number;
  /** Token budget */
  tokenBudget: number;
  /** When refinement started */
  startedAt: Date;
  /** When refinement completed */
  completedAt: Date | null;
  /** Total duration in ms */
  totalDurationMs: number | null;
}

/**
 * BestEffortDisplay - UI display model for best effort selection result (T096)
 *
 * Shows which iteration was selected and why when refinement doesn't reach threshold.
 * Used in full-auto mode when max iterations reached without achieving target score.
 *
 * Contains information about the best content version selected when target quality
 * cannot be achieved within constraints (max iterations, token budget, timeout).
 *
 * @see RefinementEvent - Used in 'best_effort_selected' event (not yet implemented)
 * @see BestEffortResult - Backend type for best effort selection
 *
 * @example
 * ```typescript
 * const display: BestEffortDisplay = {
 *   isActive: true,
 *   selectedIteration: 2,
 *   selectionReason: 'Iteration 2 had highest score (0.82) among 3 attempts',
 *   finalScore: 0.82,
 *   targetThreshold: 0.85,
 *   qualityStatus: 'acceptable',
 *   statusLabel: 'Приемлемое качество',
 *   warningMessage: 'Урок не достиг целевого порога, но принят',
 *   requiresReview: false,
 * };
 * ```
 */
export interface BestEffortDisplay {
  /** Whether best effort selection was used */
  isActive: boolean;
  /** Selected iteration number (1-based) */
  selectedIteration: number | null;
  /** Reason for selection */
  selectionReason: string | null;
  /** Final score achieved */
  finalScore: number;
  /** Target threshold that wasn't met */
  targetThreshold: number;
  /** Quality status */
  qualityStatus: 'meets_threshold' | 'acceptable' | 'below_standard';
  /** Human-readable status label (Russian) */
  statusLabel: string;
  /** Warning message for UI (Russian) */
  warningMessage: string | null;
  /** Whether manual review is recommended */
  requiresReview: boolean;
}

/**
 * LessonInspectorDataRefinementExtension - Extension to LessonInspectorData for refinement (T097)
 *
 * Additional fields to add to LessonInspectorData when refinement data is available.
 * Extends the base lesson inspector with targeted refinement progress tracking.
 *
 * Provides:
 * - Complete refinement plan with iteration history
 * - Best effort results if threshold not met
 * - Real-time event streaming for UI updates
 * - Escalation status for semi-auto mode
 *
 * @see LessonInspectorData - Base inspector data structure
 * @see RefinementPlanDisplay - Main refinement plan visualization
 * @see BestEffortDisplay - Best effort selection results
 *
 * @example
 * ```typescript
 * const extension: LessonInspectorDataRefinementExtension = {
 *   refinementPlan: planDisplay,
 *   bestEffortResult: null, // Threshold met, no best effort needed
 *   recentEvents: [
 *     {
 *       type: 'iteration_complete',
 *       timestamp: new Date(),
 *       data: { iteration: 2, score: 0.84 },
 *     },
 *   ],
 *   isRefining: false,
 *   isEscalated: false,
 *   escalationReason: null,
 * };
 * ```
 */
export interface LessonInspectorDataRefinementExtension {
  /** Refinement plan display (null if no refinement performed) */
  refinementPlan: RefinementPlanDisplay | null;
  /** Best effort result (null if threshold met or no refinement) */
  bestEffortResult: BestEffortDisplay | null;
  /** Recent refinement events for live streaming */
  recentEvents: Array<{
    /** Event type */
    type: RefinementEventType;
    /** When event occurred */
    timestamp: Date;
    /** Event-specific data */
    data: Record<string, unknown>;
  }>;
  /** Whether refinement is currently in progress */
  isRefining: boolean;
  /** Whether escalation is active (requires human review) */
  isEscalated: boolean;
  /** Escalation reason if escalated */
  escalationReason: string | null;
}

// =============================================================================
// Refinement Russian Labels (T098)
// =============================================================================

/**
 * REFINEMENT_MODE_LABELS - Russian labels for operation modes
 */
export const REFINEMENT_MODE_LABELS: Record<'full-auto' | 'semi-auto', { ru: string; description: string }> = {
  'full-auto': { ru: 'Автоматический', description: 'Полностью автоматическая доработка' },
  'semi-auto': { ru: 'Полуавтоматический', description: 'С возможностью эскалации на человека' },
} as const;

/**
 * FIX_ACTION_LABELS - Russian labels for fix actions
 */
export const FIX_ACTION_LABELS: Record<FixActionType, { ru: string; description: string }> = {
  SURGICAL_EDIT: { ru: 'Точечная правка', description: 'Локальное исправление текста' },
  REGENERATE_SECTION: { ru: 'Переписать раздел', description: 'Полная перегенерация раздела' },
  FULL_REGENERATE: { ru: 'Переписать урок', description: 'Полная перегенерация урока' },
} as const;

/**
 * REFINEMENT_STATUS_LABELS - Russian labels for refinement statuses
 */
export const REFINEMENT_STATUS_LABELS: Record<'accepted' | 'accepted_warning' | 'best_effort' | 'escalated', { ru: string; color: string }> = {
  accepted: { ru: 'Принято', color: 'emerald' },
  accepted_warning: { ru: 'Принято с замечаниями', color: 'yellow' },
  best_effort: { ru: 'Лучший результат', color: 'orange' },
  escalated: { ru: 'Требует проверки', color: 'purple' },
} as const;

/**
 * SECTION_LOCK_LABELS - Russian labels for section lock reasons
 */
export const SECTION_LOCK_LABELS: Record<SectionLockReason, { ru: string; description: string }> = {
  max_edits: { ru: 'Лимит правок', description: 'Достигнут лимит правок для этого раздела' },
  regression: { ru: 'Регрессия качества', description: 'Правка ухудшила качество раздела' },
  oscillation: { ru: 'Осцилляция', description: 'Раздел колеблется между версиями' },
} as const;

/**
 * AGREEMENT_LEVEL_LABELS - Russian labels for agreement levels
 */
export const AGREEMENT_LEVEL_LABELS: Record<'high' | 'moderate' | 'low', { ru: string; description: string }> = {
  high: { ru: 'Высокое согласие', description: 'Судьи единодушны (α ≥ 0.80)' },
  moderate: { ru: 'Умеренное согласие', description: 'Судьи в основном согласны (0.67 ≤ α < 0.80)' },
  low: { ru: 'Низкое согласие', description: 'Судьи расходятся во мнениях (α < 0.67)' },
} as const;
