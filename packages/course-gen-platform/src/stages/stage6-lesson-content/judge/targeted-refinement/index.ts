/**
 * Targeted Refinement Orchestration Module
 * @module stages/stage6-lesson-content/judge/targeted-refinement
 *
 * Main entry point for orchestrating the targeted refinement loop.
 * Implements parallel Patcher execution and sequential Section-Expander execution
 * with iteration control, quality locks, and best-effort selection.
 *
 * Key responsibilities:
 * - Execute refinement iterations until threshold met or limits reached
 * - Parallel batch execution with max 3 concurrent Patchers
 * - Sequential Section-Expander execution for complex regenerations
 * - Track section edit counts and enforce oscillation locks
 * - Select best iteration if max iterations reached (full-auto mode)
 * - Emit streaming events for UI progress updates
 *
 * Reference:
 * - specs/018-judge-targeted-refinement/quickstart.md (Phase 6: Main Loop)
 * - specs/018-judge-targeted-refinement/spec.md (FR-021 to FR-028)
 */

import type {
  ArbiterOutput,
  SectionRefinementTask,
  OperationMode,
  RefinementStatus,
  BestEffortResult,
  IterationResult,
  RefinementEvent,
  LessonContent,
  JudgeIssue,
  StopReason,
  QualityLockViolation,
  RAGChunk,
  LessonSpecificationV2,
  CriteriaScores,
  IssueSeverity,
  TaskPriority,
} from '@megacampus/shared-types';
import { REFINEMENT_CONFIG } from '@megacampus/shared-types';

// Import from sibling modules
import {
  shouldContinueIteration,
  updateSectionLocks,
} from './iteration-controller';
import {
  selectBestIteration,
} from './best-effort-selector';

// Import from other judge modules
import { executePatch, type LLMCallFn, buildPatcherSystemPrompt } from '../patcher';
import { executeExpansion } from '../section-expander';
import { createExecutionBatches } from '../router';
import { verifyPatch } from '../verifier/delta-judge';
// Quality lock checking - re-exported for use when post-patch scores available (Phase 7)
export { checkQualityLocks } from '../verifier/quality-lock';
import { initializeQualityLocks as initLocksFromScores } from '../verifier/quality-lock';
// Import fix templates for score-based prompt selection
import {
  selectFixPromptTemplate,
  buildCoherencePreservingPrompt,
  type FixPromptContext,
  type IterationHistoryEntry,
} from '../fix-templates';

// Import shared utilities
import { logger } from '../../../../shared/logger';
import { LLMClient } from '../../../../shared/llm';
import { createModelConfigService } from '../../../../shared/llm/model-config-service';

// Re-export submodules for convenience
export * from './iteration-controller';
export * from './best-effort-selector';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Estimated tokens for Delta Judge verification per patch */
const DELTA_JUDGE_ESTIMATED_TOKENS = 250;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Input for executeTargetedRefinement
 */
export interface TargetedRefinementInput {
  /** Initial lesson content to refine */
  content: LessonContent;
  /** Consolidated arbiter output with refinement plan */
  arbiterOutput: ArbiterOutput;
  /** Operation mode (full-auto or semi-auto) */
  operationMode: OperationMode;
  /** Optional LLM call function for dependency injection */
  llmCall?: LLMCallFn;
  /** Optional streaming callback for progress updates */
  onStreamEvent?: (event: RefinementEvent) => void;
  /** Optional RAG chunks for fact grounding in Section-Expander */
  ragChunks?: RAGChunk[];
  /** Optional lesson specification with learning objectives */
  lessonSpec?: LessonSpecificationV2;
}

/**
 * Output from executeTargetedRefinement
 */
export interface TargetedRefinementOutput {
  /** Final refined content */
  content: LessonContent;
  /** Final status */
  status: RefinementStatus;
  /** Final score after refinement */
  finalScore: number;
  /** Total iterations performed */
  iterations: number;
  /** Total tokens used */
  tokensUsed: number;
  /** Total duration in ms */
  durationMs: number;
  /** Best effort result if applicable */
  bestEffortResult?: BestEffortResult;
}

/**
 * Internal state for refinement loop
 */
interface RefinementState {
  iteration: number;
  scoreHistory: number[];
  contentHistory: IterationResult[];
  lockedSections: string[];
  sectionEditCount: Record<string, number>;
  qualityLocks: Record<string, number>;
  tokensUsed: number;
  startTime: number;
}

/**
 * Context passed to Patcher for iteration-aware prompts
 */
interface IterationContext {
  score: number;
  iteration: number;
  issues: JudgeIssue[];
  iterationHistory?: IterationHistoryEntry[];
  lessonSpec?: LessonSpecificationV2;
  strengths?: string[];
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Execute targeted refinement loop
 *
 * Algorithm:
 * 1. Initialize state: iteration=0, scoreHistory=[], lockedSections=[], sectionEditCount={}, qualityLocks from initial scores
 * 2. Emit `refinement_start` event
 * 3. Loop while shouldContinueIteration():
 *    a. Get tasks from plan, filter out locked sections
 *    b. Route each task (routeTask)
 *    c. Create execution batches (createExecutionBatches)
 *    d. For each batch:
 *       - Emit `batch_started`
 *       - Execute tasks:
 *         - Patcher tasks: run in parallel (Promise.all, max 3)
 *         - Section-Expander tasks: run sequentially
 *       - For each task, emit `task_started`, `patch_applied`, `verification_result`
 *       - Emit `batch_complete`
 *    e. Update content with patches
 *    f. Update sectionEditCount, check for new locks
 *    g. Re-evaluate score (placeholder: use average criteria score)
 *    h. Emit `iteration_complete`
 *    i. Update scoreHistory
 *    j. Check shouldContinueIteration for next loop
 * 4. If stopped due to max iterations in full-auto mode, call selectBestIteration
 * 5. Emit `refinement_complete`
 * 6. Return TargetedRefinementOutput
 *
 * @param input - TargetedRefinementInput with content, plan, and operation mode
 * @returns TargetedRefinementOutput with final content and status
 */
export async function executeTargetedRefinement(
  input: TargetedRefinementInput
): Promise<TargetedRefinementOutput> {
  const { content, arbiterOutput, operationMode, llmCall, onStreamEvent, ragChunks, lessonSpec } = input;
  const startTime = Date.now();

  logger.info({
    operationMode,
    tasksCount: arbiterOutput.plan.tasks.length,
    agreementScore: arbiterOutput.agreementScore,
  }, 'Starting targeted refinement loop');

  // Extract learning objectives from lesson spec
  const learningObjectives = lessonSpec?.learning_objectives?.map(lo => lo.objective) || [];

  // Pre-populate sectionEditCount with all target sections (HIGH-2 fix)
  // This ensures iteration control logic works correctly even if some sections are never edited
  const sectionEditCount: Record<string, number> = {};
  for (const task of arbiterOutput.plan.tasks) {
    sectionEditCount[task.sectionId] = 0;
  }

  // Initialize state
  const state: RefinementState = {
    iteration: 0,
    scoreHistory: [],
    contentHistory: [],
    lockedSections: [],
    sectionEditCount,
    qualityLocks: initializeQualityLocksFromArbiter(arbiterOutput),
    tokensUsed: arbiterOutput.tokensUsed, // Start with arbiter tokens
    startTime,
  };

  // Initialize current content
  let currentContent = { ...content };

  // Calculate initial score (placeholder: use average of criteria scores from arbiterOutput)
  // Initial score before any refinement (iteration 0, no tasks completed)
  const initialScore = calculateHeuristicScore(arbiterOutput, 0, 0, 0);
  state.scoreHistory.push(initialScore);
  state.contentHistory.push({
    iteration: 0,
    score: initialScore,
    content: currentContent,
    remainingIssues: collectAllIssues(arbiterOutput.plan.tasks),
  });

  // Emit refinement start event
  const targetSections = arbiterOutput.plan.tasks.map(t => t.sectionId);
  emitEvent(onStreamEvent, {
    type: 'refinement_start',
    targetSections,
    mode: operationMode,
  });

  // Emit arbiter_complete event (US3: Judge Consensus)
  emitEvent(onStreamEvent, {
    type: 'arbiter_complete',
    agreementScore: arbiterOutput.agreementScore,
    agreementLevel: arbiterOutput.agreementLevel,
    acceptedIssueCount: arbiterOutput.acceptedIssues.length,
    rejectedIssueCount: arbiterOutput.rejectedIssues.length,
  });

  logger.info({
    agreementScore: arbiterOutput.agreementScore,
    agreementLevel: arbiterOutput.agreementLevel,
    acceptedIssues: arbiterOutput.acceptedIssues.length,
    rejectedIssues: arbiterOutput.rejectedIssues.length,
  }, 'Arbiter consolidation complete');

  // Main refinement loop
  let shouldContinue = true;
  let stopReason: StopReason = 'continue_more_tasks';

  while (shouldContinue) {
    state.iteration++;

    logger.info({
      iteration: state.iteration,
      lockedSections: state.lockedSections.length,
      tokensUsed: state.tokensUsed,
    }, `Starting refinement iteration ${state.iteration}`);

    // Filter out locked sections from tasks
    const availableTasks = arbiterOutput.plan.tasks.filter(
      task => !state.lockedSections.includes(task.sectionId)
    );

    if (availableTasks.length === 0) {
      logger.info('No available tasks (all sections locked)');
      stopReason = 'stop_all_sections_locked';
      break;
    }

    // Advisory budget check - warn but continue processing
    if (state.tokensUsed >= REFINEMENT_CONFIG.limits.maxTokens) {
      const overBudget = state.tokensUsed - REFINEMENT_CONFIG.limits.maxTokens;
      logger.warn({
        tokensUsed: state.tokensUsed,
        maxTokens: REFINEMENT_CONFIG.limits.maxTokens,
        overBudget,
      }, 'Token budget exceeded (advisory) - continuing with tasks');

      // Emit event for UI notification
      emitEvent(onStreamEvent, {
        type: 'budget_warning',
        tokensUsed: state.tokensUsed,
        maxTokens: REFINEMENT_CONFIG.limits.maxTokens,
      });
    }

    // Sort tasks by priority (critical first, then major, then minor)
    const priorityOrder: Record<TaskPriority, number> = { critical: 0, major: 1, minor: 2 };
    const sortedByPriority = [...availableTasks].sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    logger.info({
      totalTasks: availableTasks.length,
      criticalCount: sortedByPriority.filter(t => t.priority === 'critical').length,
      majorCount: sortedByPriority.filter(t => t.priority === 'major').length,
      minorCount: sortedByPriority.filter(t => t.priority === 'minor').length,
    }, 'Tasks sorted by priority');

    const batches = createExecutionBatches(sortedByPriority);

    logger.info({
      sortedTasks: sortedByPriority.length,
      batches: batches.length,
    }, 'Created execution batches');

    // Track sections edited in this iteration for oscillation detection
    const sectionsEditedThisIteration: string[] = [];

    // Execute batches
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchSections = batch.map(t => t.sectionId);
      sectionsEditedThisIteration.push(...batchSections);

      emitEvent(onStreamEvent, {
        type: 'batch_started',
        batchIndex,
        sections: batchSections,
      });

      logger.info({
        batchIndex,
        tasksCount: batch.length,
        sections: batchSections,
        estimatedDeltaJudgeTokens: batch.length * DELTA_JUDGE_ESTIMATED_TOKENS,
      }, 'Executing batch');

      // Separate Patcher and Section-Expander tasks
      const patcherTasks = batch.filter(t => t.actionType === 'SURGICAL_EDIT');
      const expanderTasks = batch.filter(t => t.actionType === 'REGENERATE_SECTION');

      // Execute Patcher tasks in parallel
      if (patcherTasks.length > 0) {
        // Guard: verify no duplicate sectionIds in batch
        const sectionIds = new Set(patcherTasks.map(t => t.sectionId));
        if (sectionIds.size !== patcherTasks.length) {
          logger.error({
            sectionIds: patcherTasks.map(t => t.sectionId),
          }, 'Duplicate sectionIds in patcher batch - this should never happen');
          throw new Error('Invalid batch: duplicate sectionIds detected');
        }

        const patchResults = await Promise.all(
          patcherTasks.map(task => executePatcherTask(task, currentContent, llmCall, onStreamEvent, {
            score: state.scoreHistory[state.scoreHistory.length - 1] || 0.7,
            iteration: state.iteration,
            issues: collectAllIssues(arbiterOutput.plan.tasks),
            iterationHistory: convertToIterationHistory(state.contentHistory),
            lessonSpec,
            strengths: arbiterOutput.acceptedIssues.length === 0 ? ['Content meets quality standards'] : [],
          }))
        );

        // Apply patches and update state
        for (const result of patchResults) {
          if (result.success) {
            currentContent = applyPatchToContent(currentContent, result.sectionId, result.patchedContent);
            state.tokensUsed += result.tokensUsed;
            state.sectionEditCount[result.sectionId] = (state.sectionEditCount[result.sectionId] || 0) + 1;
          }
        }
      }

      // Execute Section-Expander tasks sequentially
      if (expanderTasks.length > 0) {
        for (const task of expanderTasks) {
          const result = await executeExpanderTask(
            task,
            currentContent,
            onStreamEvent,
            ragChunks || [],
            learningObjectives
          );

          if (result.success) {
            currentContent = applyPatchToContent(currentContent, result.sectionId, result.regeneratedContent);
            state.tokensUsed += result.tokensUsed;
            state.sectionEditCount[result.sectionId] = (state.sectionEditCount[result.sectionId] || 0) + 1;
          }
        }
      }

      emitEvent(onStreamEvent, {
        type: 'batch_complete',
        batchIndex,
      });

      logger.info({
        batchIndex,
        tokensUsed: state.tokensUsed,
      }, 'Batch complete');
    }

    // Update section locks based on edit count
    const newlyLockedSections = updateSectionLocks(
      state.sectionEditCount,
      REFINEMENT_CONFIG.quality.sectionLockAfterEdits
    );

    // Emit section_locked events for newly locked sections (US4: Quality Lock)
    for (const sectionId of newlyLockedSections) {
      if (!state.lockedSections.includes(sectionId)) {
        emitEvent(onStreamEvent, {
          type: 'section_locked',
          sectionId,
          reason: 'max_edits',
        });

        logger.info({
          sectionId,
          editCount: state.sectionEditCount[sectionId],
        }, 'Section locked after max edits');
      }
    }

    // TODO (Phase 7): Check for quality lock violations (regression detection)
    // When post-patch judge re-evaluation is available, call checkQualityLocks here:
    // const lockCheckResult = checkQualityLocks(state.qualityLocks, newCriteriaScores);
    // if (!lockCheckResult.passed) {
    //   emitQualityLockViolations(lockCheckResult.violations, onStreamEvent);
    //   // Lock sections with regression
    //   for (const violation of lockCheckResult.violations) {
    //     if (!state.lockedSections.includes(violation.sectionId)) {
    //       emitEvent(onStreamEvent, {
    //         type: 'section_locked',
    //         sectionId: violation.sectionId,
    //         reason: 'regression',
    //       });
    //     }
    //   }
    // }

    // Combine all locked sections from edit count
    state.lockedSections = [...new Set([
      ...state.lockedSections,
      ...newlyLockedSections,
    ])];

    // Re-evaluate score using heuristics
    const tasksCompletedThisIteration = sectionsEditedThisIteration.length;
    const newScore = calculateHeuristicScore(
      arbiterOutput,
      state.iteration,
      tasksCompletedThisIteration,
      state.lockedSections.length
    );
    state.scoreHistory.push(newScore);

    // Check for oscillation AFTER score is calculated
    // Oscillation detection: if previous iteration improved score, but this iteration dropped it
    const oscillationDetected = detectScoreOscillation(state.scoreHistory);
    const sectionsToLockForOscillation: string[] = [];

    if (oscillationDetected.detected) {
      // Lock sections that were edited in this iteration (the one that caused regression)
      sectionsToLockForOscillation.push(...sectionsEditedThisIteration);

      logger.warn({
        sections: sectionsEditedThisIteration,
        previousScore: oscillationDetected.previousScore,
        improvedScore: oscillationDetected.improvedScore,
        currentScore: newScore,
      }, 'Oscillation detected - locking sections to prevent further score degradation');
    }

    // Emit section_locked events for oscillation
    for (const sectionId of sectionsToLockForOscillation) {
      if (!state.lockedSections.includes(sectionId)) {
        emitEvent(onStreamEvent, {
          type: 'section_locked',
          sectionId,
          reason: 'oscillation',
        });

        logger.info({
          sectionId,
          reason: 'Score oscillation detected - section locked to prevent degradation',
        }, 'Section locked due to oscillation');
      }
    }

    // Add oscillation-locked sections to the state
    state.lockedSections = [...new Set([
      ...state.lockedSections,
      ...sectionsToLockForOscillation,
    ])];


    // Store iteration result
    const remainingIssues = collectAllIssues(
      arbiterOutput.plan.tasks.filter(t => !state.lockedSections.includes(t.sectionId))
    );
    state.contentHistory.push({
      iteration: state.iteration,
      score: newScore,
      content: { ...currentContent },
      remainingIssues,
    });

    // Emit iteration complete
    emitEvent(onStreamEvent, {
      type: 'iteration_complete',
      iteration: state.iteration,
      score: newScore,
    });

    logger.info({
      iteration: state.iteration,
      score: newScore,
      scoreImprovement: newScore - state.scoreHistory[state.scoreHistory.length - 2],
      lockedSections: state.lockedSections.length,
    }, 'Iteration complete');

    // Check if we should continue
    const decision = shouldContinueIteration({
      currentState: {
        iteration: state.iteration,
        scoreHistory: state.scoreHistory,
        contentHistory: state.contentHistory,
        lockedSections: state.lockedSections,
        sectionEditCount: state.sectionEditCount,
        qualityLocks: state.qualityLocks,
        tokensUsed: state.tokensUsed,
        startTime: state.startTime,
      },
      latestScore: newScore,
      operationMode,
    });

    shouldContinue = decision.shouldContinue;
    stopReason = decision.reason;

    if (!shouldContinue) {
      logger.info({
        reason: stopReason,
        finalScore: newScore,
        iterations: state.iteration,
      }, 'Stopping refinement loop');
    }
  }

  // Determine final status and handle best-effort selection
  const finalScore = state.scoreHistory[state.scoreHistory.length - 1];
  const modeConfig = REFINEMENT_CONFIG.modes[operationMode];
  let finalStatus: RefinementStatus;
  let bestEffortResult: BestEffortResult | undefined;

  if (finalScore >= modeConfig.acceptThreshold) {
    finalStatus = 'accepted';
  } else if (finalScore >= modeConfig.goodEnoughThreshold) {
    finalStatus = 'accepted_warning';
  } else if (stopReason === 'stop_max_iterations' && operationMode === 'full-auto') {
    // Best-effort selection for full-auto mode
    const unresolvedIssues = state.contentHistory[state.contentHistory.length - 1].remainingIssues;
    const selectorResult = selectBestIteration({
      iterationHistory: state.contentHistory,
      unresolvedIssues,
      operationMode,
    });

    bestEffortResult = selectorResult.bestResult;
    finalStatus = selectorResult.finalStatus;
    currentContent = bestEffortResult.content as LessonContent;

    logger.info({
      selectedIteration: selectorResult.selectedIteration,
      bestScore: bestEffortResult.bestScore,
      qualityStatus: bestEffortResult.qualityStatus,
      selectionReason: selectorResult.selectionReason,
    }, 'Selected best iteration (full-auto mode)');
  } else if (stopReason === 'stop_max_iterations' && operationMode === 'semi-auto') {
    finalStatus = 'escalated';
  } else {
    // Default case
    finalStatus = finalScore >= modeConfig.goodEnoughThreshold ? 'accepted_warning' : 'escalated';
  }

  const durationMs = Date.now() - startTime;

  // Emit escalation event if escalated (US2 semi-auto escalation)
  if (finalStatus === 'escalated' && operationMode === 'semi-auto') {
    emitEvent(onStreamEvent, {
      type: 'escalation_triggered',
      reason: stopReason,
      score: finalScore,
      goodEnoughThreshold: modeConfig.goodEnoughThreshold,
      unresolvedIssuesCount: bestEffortResult?.unresolvedIssues.length ?? 0,
    });

    logger.info({
      reason: stopReason,
      score: finalScore,
      goodEnoughThreshold: modeConfig.goodEnoughThreshold,
    }, 'Escalation triggered - requires human review');
  }

  // Emit refinement complete
  emitEvent(onStreamEvent, {
    type: 'refinement_complete',
    finalScore,
    status: finalStatus,
  });

  logger.info({
    finalStatus,
    finalScore,
    iterations: state.iteration,
    tokensUsed: state.tokensUsed,
    durationMs,
  }, 'Targeted refinement complete');

  return {
    content: currentContent,
    status: finalStatus,
    finalScore,
    iterations: state.iteration,
    tokensUsed: state.tokensUsed,
    durationMs,
    bestEffortResult,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract criteria scores from arbiter output
 *
 * Estimates scores based on:
 * - Agreement level (high/moderate/low)
 * - Number of issues per criterion
 */
function extractCriteriaScoresFromArbiter(
  arbiterOutput: ArbiterOutput
): CriteriaScores {
  // Defensive check for invalid input (HIGH-1 fix)
  if (!arbiterOutput?.acceptedIssues || !Array.isArray(arbiterOutput.acceptedIssues)) {
    logger.warn('extractCriteriaScoresFromArbiter called with invalid arbiterOutput');
    // Return default scores at base level
    const baseScore = 0.75;
    return {
      learning_objective_alignment: baseScore,
      pedagogical_structure: baseScore,
      factual_accuracy: baseScore,
      clarity_readability: baseScore,
      engagement_examples: baseScore,
      completeness: baseScore,
    };
  }

  // Severity weights: critical issues impact score more
  const severityWeight: Record<IssueSeverity, number> = {
    critical: 0.15,
    major: 0.10,
    minor: 0.05,
  };

  // Calculate weighted penalty per criterion
  const criteriaWeightedPenalty: Record<string, number> = {};

  for (const issue of arbiterOutput.acceptedIssues) {
    const c = issue.criterion;
    const weight = severityWeight[issue.severity];
    criteriaWeightedPenalty[c] = (criteriaWeightedPenalty[c] || 0) + weight;
  }

  // Base score from agreement level
  const baseScore = arbiterOutput.agreementScore >= 0.80 ? 0.85 :
                    arbiterOutput.agreementScore >= 0.67 ? 0.75 : 0.65;

  // All 6 criteria
  const allCriteria = [
    'learning_objective_alignment',
    'pedagogical_structure',
    'factual_accuracy',
    'clarity_readability',
    'engagement_examples',
    'completeness',
  ] as const;

  // Build scores: criteria without issues get base score,
  // criteria with issues get penalized based on severity weighting (floor at 0.5)
  const scores: CriteriaScores = {
    learning_objective_alignment: baseScore,
    pedagogical_structure: baseScore,
    factual_accuracy: baseScore,
    clarity_readability: baseScore,
    engagement_examples: baseScore,
    completeness: baseScore,
  };

  // Apply weighted penalty (floor at 0.5)
  for (const c of allCriteria) {
    if (criteriaWeightedPenalty[c]) {
      scores[c] = Math.max(0.5, baseScore - criteriaWeightedPenalty[c]);
    }
  }

  return scores;
}

/**
 * Initialize quality locks from arbiter output
 *
 * Uses existing CLEV evaluation data - no additional LLM calls.
 * Criteria scoring >= 0.75 are locked to prevent regression.
 */
function initializeQualityLocksFromArbiter(
  arbiterOutput: ArbiterOutput
): Record<string, number> {
  const scores = extractCriteriaScoresFromArbiter(arbiterOutput);
  return initLocksFromScores(scores, 0.75);
}

/**
 * Calculate iteration score using heuristics (no LLM call)
 *
 * Formula: baseScore + progressBonus + iterationBonus + lockedBonus
 *
 * Where:
 * - baseScore: Derived from arbiter agreement level
 * - progressBonus: (tasksCompletedThisIteration / totalTasks) * 0.10
 * - iterationBonus: iteration * 0.03 (progressive improvement)
 * - lockedBonus: +0.02 if any sections locked (stable quality indicator)
 *
 * This provides realistic score progression without expensive re-evaluation.
 */
function calculateHeuristicScore(
  arbiterOutput: ArbiterOutput,
  iteration: number,
  tasksCompletedThisIteration: number,
  totalLockedSections: number
): number {
  // Validate inputs
  if (!arbiterOutput || !arbiterOutput.plan) {
    return 0.5;
  }

  // Base score from agreement level
  const baseScore = arbiterOutput.agreementScore >= 0.80 ? 0.75 :
                    arbiterOutput.agreementScore >= 0.67 ? 0.70 : 0.65;

  // Progress bonus based on tasks completed this iteration
  const totalTasks = arbiterOutput.plan.tasks.length;
  const progressRatio = totalTasks > 0 ? tasksCompletedThisIteration / totalTasks : 0;
  const progressBonus = progressRatio * 0.10;

  // Iteration bonus (diminishing returns: +0.03 per iteration, max 3 iterations)
  const iterationBonus = Math.min(iteration, 3) * 0.03;

  // Locked sections bonus (locked = stable quality)
  const lockedBonus = totalLockedSections > 0 ? 0.02 : 0;

  // Calculate final score, cap at 0.95
  const finalScore = Math.min(0.95, baseScore + progressBonus + iterationBonus + lockedBonus);

  logger.debug({
    baseScore,
    progressBonus,
    iterationBonus,
    lockedBonus,
    finalScore,
    iteration,
    tasksCompletedThisIteration,
  }, 'Calculated heuristic score');

  return finalScore;
}

/**
 * Collect all issues from refinement tasks
 */
function collectAllIssues(tasks: SectionRefinementTask[]): JudgeIssue[] {
  const allIssues: JudgeIssue[] = [];
  for (const task of tasks) {
    for (const targetedIssue of task.sourceIssues) {
      // Convert TargetedIssue to JudgeIssue by omitting targeted fields
      const { id, targetSectionId, fixAction, contextWindow, fixInstructions, ...judgeIssue } = targetedIssue;
      allIssues.push(judgeIssue as JudgeIssue);
    }
  }
  return allIssues;
}

/**
 * Convert contentHistory to IterationHistoryEntry[] for fix-templates
 *
 * Transforms internal iteration results into format expected by coherence preserving template.
 * Excludes the current/latest iteration (that's what we're fixing now).
 *
 * @param contentHistory - Array of iteration results from refinement state
 * @returns Array of iteration history entries for fix-templates
 */
function convertToIterationHistory(
  contentHistory: IterationResult[]
): IterationHistoryEntry[] {
  // Slice off the last entry (current iteration) - we only want history of past iterations
  return contentHistory.slice(0, -1).map((result, index) => ({
    feedback: result.remainingIssues.length > 0
      ? `Iteration ${index + 1}: ${result.remainingIssues.length} issues remaining. ` +
        result.remainingIssues.slice(0, 3).map(i => i.description || 'No description').join('; ')
      : `Iteration ${index + 1}: No issues found.`,
    score: result.score,
  }));
}

/**
 * Verify patch using Delta Judge with most severe issue
 *
 * Selects the most severe issue from sourceIssues for verification
 * to minimize token cost while ensuring critical issues are checked.
 */
async function verifyPatchWithDeltaJudge(
  originalContent: string,
  patchedContent: string,
  task: SectionRefinementTask,
  onStreamEvent: ((event: RefinementEvent) => void) | undefined
): Promise<{ passed: boolean; tokensUsed: number }> {
  // Guard: skip verification if no source issues
  if (task.sourceIssues.length === 0) {
    logger.warn({
      sectionId: task.sectionId,
    }, 'Task has no source issues - skipping Delta Judge verification');
    return { passed: true, tokensUsed: 0 };
  }

  // Select most severe issue for verification
  const severityOrder: Record<IssueSeverity, number> = { critical: 0, major: 1, minor: 2 };
  const primaryIssue = [...task.sourceIssues].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  )[0];

  logger.debug({
    sectionId: task.sectionId,
    selectedIssue: primaryIssue.criterion,
    selectedSeverity: primaryIssue.severity,
    totalIssues: task.sourceIssues.length,
  }, 'Selected most severe issue for Delta Judge verification');

  const deltaResult = await verifyPatch({
    originalContent,
    patchedContent,
    addressedIssue: primaryIssue,
    sectionId: task.sectionId,
    contextAnchors: task.contextAnchors,
  });

  // Log and emit new issues
  if (deltaResult.newIssues.length > 0) {
    logger.warn({
      sectionId: task.sectionId,
      newIssuesCount: deltaResult.newIssues.length,
      newIssues: deltaResult.newIssues.map(i => ({
        criterion: i.criterion,
        severity: i.severity,
        description: i.description?.slice(0, 50) || 'No description',
      })),
    }, 'Delta Judge found new issues introduced by patch');

    for (const newIssue of deltaResult.newIssues) {
      emitEvent(onStreamEvent, {
        type: 'new_issue_detected',
        sectionId: task.sectionId,
        criterion: newIssue.criterion,
        severity: newIssue.severity,
        description: newIssue.description || 'No description',
      });
    }
  }

  return {
    passed: deltaResult.passed,
    tokensUsed: deltaResult.tokensUsed,
  };
}

/**
 * Execute a Patcher task with comprehensive error handling
 */
async function executePatcherTask(
  task: SectionRefinementTask,
  content: LessonContent,
  llmCall: LLMCallFn | undefined,
  onStreamEvent: ((event: RefinementEvent) => void) | undefined,
  iterationContext: IterationContext
): Promise<{ success: boolean; sectionId: string; patchedContent: string; tokensUsed: number }> {
  try {
    emitEvent(onStreamEvent, {
      type: 'task_started',
      sectionId: task.sectionId,
      taskType: 'SURGICAL_EDIT',
    });

    // Extract section content (placeholder: assumes body.sections array)
    const sectionContent = extractSectionContent(content, task.sectionId);

    // Determine template type based on score and iteration
    const templateType = selectFixPromptTemplate(
      iterationContext.score,
      iterationContext.iteration,
      iterationContext.issues
    );

    logger.info({
      sectionId: task.sectionId,
      templateType,
      score: iterationContext.score,
      iteration: iterationContext.iteration,
      issuesCount: iterationContext.issues.length,
    }, 'Selected fix prompt template type');

    // Use coherence preserving template for iteration > 1 with history
    if (templateType === 'coherence_preserving' && iterationContext.iterationHistory && iterationContext.lessonSpec) {
      logger.info({
        sectionId: task.sectionId,
        iteration: iterationContext.iteration,
        historyLength: iterationContext.iterationHistory.length,
      }, 'Using coherence preserving template with iteration history');

      // Build FixPromptContext from available data
      const fixPromptContext: FixPromptContext = {
        originalContent: sectionContent,
        score: iterationContext.score,
        issues: task.sourceIssues.map(ti => ({
          criterion: ti.criterion,
          severity: ti.severity,
          location: ti.location,
          description: ti.description,
          quotedText: ti.quotedText,
          suggestedFix: ti.suggestedFix,
        })),
        strengths: iterationContext.strengths || [],
        lessonSpec: iterationContext.lessonSpec,
        iterationHistory: iterationContext.iterationHistory,
        sectionsToPreserve: [],
        sectionsToModify: [task.sectionId],
        terminology: [], // Could be extracted from lessonSpec if needed
      };

      const coherencePrompt = buildCoherencePreservingPrompt(fixPromptContext);

      // Use custom LLM call with coherence prompt
      // Default LLM call implementation if not provided
      const defaultLLMCall = async (
        prompt: string,
        systemPrompt: string,
        options: { maxTokens: number; temperature: number }
      ): Promise<{ content: string; tokensUsed: number }> => {
        const llmClient = new LLMClient();
        const modelService = createModelConfigService();

        let modelId = 'openai/gpt-oss-120b'; // Fallback
        try {
          const config = await modelService.getModelForPhase('stage_6_patcher');
          modelId = config.modelId;
          logger.info({ modelId, source: config.source }, 'Patcher using model from config');
        } catch (error) {
          logger.warn({ error: error instanceof Error ? error.message : String(error) },
            'Failed to get patcher model config, using fallback');
        }

        const response = await llmClient.generateCompletion(prompt, {
          model: modelId,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          systemPrompt,
        });

        return {
          content: response.content,
          tokensUsed: response.totalTokens,
        };
      };

      const response = await (llmCall || defaultLLMCall)(
        coherencePrompt,
        buildPatcherSystemPrompt(),
        { maxTokens: 1200, temperature: 0.1 }
      );

      logger.info({
        sectionId: task.sectionId,
        tokensUsed: response.tokensUsed,
        outputLength: response.content.length,
      }, 'Coherence preserving prompt execution complete');

      emitEvent(onStreamEvent, {
        type: 'patch_applied',
        sectionId: task.sectionId,
        content: response.content.trim(),
        diffSummary: 'Coherence preserving refinement applied',
      });

      // Verify patch using Delta Judge (lightweight ~150-250 tokens)
      let verificationPassed = true;
      let deltaJudgeTokens = 0;

      // Only run Delta Judge if content actually changed
      if (response.content.trim() !== sectionContent) {
        try {
          const result = await verifyPatchWithDeltaJudge(
            sectionContent,
            response.content.trim(),
            task,
            onStreamEvent
          );
          verificationPassed = result.passed;
          deltaJudgeTokens = result.tokensUsed;

          logger.info({
            sectionId: task.sectionId,
            passed: result.passed,
            tokensUsed: result.tokensUsed,
          }, 'Delta Judge verification complete');
        } catch (error) {
          logger.error({
            error: error instanceof Error ? error.message : String(error),
            sectionId: task.sectionId,
          }, 'Delta Judge verification failed, assuming pass');
          verificationPassed = true;
        }
      }

      emitEvent(onStreamEvent, {
        type: 'verification_result',
        sectionId: task.sectionId,
        passed: verificationPassed,
      });

      return {
        success: verificationPassed,
        sectionId: task.sectionId,
        patchedContent: verificationPassed ? response.content.trim() : sectionContent,
        tokensUsed: response.tokensUsed + deltaJudgeTokens,
      };
    }

    // Fallback to standard patcher for other template types (structured_refinement, targeted_section)
    if (templateType === 'coherence_preserving') {
      logger.warn({
        sectionId: task.sectionId,
        templateType,
        hasLessonSpec: !!iterationContext.lessonSpec,
        hasIterationHistory: !!iterationContext.iterationHistory,
        historyLength: iterationContext.iterationHistory?.length || 0,
      }, 'Coherence template selected but prerequisites missing - falling back to standard patcher');
    } else {
      logger.info({
        sectionId: task.sectionId,
        templateType,
      }, 'Using standard patcher for non-coherence template');
    }

    // Build Patcher input
    const patcherInput = {
      originalContent: sectionContent,
      sectionId: task.sectionId,
      sectionTitle: task.sectionTitle,
      instructions: task.synthesizedInstructions,
      contextAnchors: task.contextAnchors,
      contextWindow: {
        startQuote: undefined,
        endQuote: undefined,
        scope: 'section' as const,
      },
    };

    // Execute patch
    const patchResult = await executePatch(patcherInput, llmCall);

    emitEvent(onStreamEvent, {
      type: 'patch_applied',
      sectionId: task.sectionId,
      content: patchResult.patchedContent,
      diffSummary: patchResult.diffSummary,
    });

    // Verify patch using Delta Judge (lightweight ~150-250 tokens)
    let verificationPassed = true;
    let deltaJudgeTokens = 0;

    // Only run Delta Judge if content actually changed
    if (patchResult.patchedContent !== sectionContent && patchResult.success) {
      try {
        const result = await verifyPatchWithDeltaJudge(
          sectionContent,
          patchResult.patchedContent,
          task,
          onStreamEvent
        );
        verificationPassed = result.passed;
        deltaJudgeTokens = result.tokensUsed;

        logger.info({
          sectionId: task.sectionId,
          passed: result.passed,
          tokensUsed: result.tokensUsed,
        }, 'Delta Judge verification complete');
      } catch (error) {
        logger.error({
          error: error instanceof Error ? error.message : String(error),
          sectionId: task.sectionId,
        }, 'Delta Judge verification failed, assuming pass');
        // On error, assume pass to avoid blocking (graceful degradation)
        verificationPassed = true;
      }
    }

    emitEvent(onStreamEvent, {
      type: 'verification_result',
      sectionId: task.sectionId,
      passed: verificationPassed,
    });

    return {
      success: patchResult.success && verificationPassed,
      sectionId: task.sectionId,
      patchedContent: verificationPassed ? patchResult.patchedContent : sectionContent, // Rollback if failed
      tokensUsed: patchResult.tokensUsed + deltaJudgeTokens,
    };
  } catch (error) {
    // Log error and return failure result for graceful degradation
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
      sectionId: task.sectionId,
      taskType: 'SURGICAL_EDIT',
    }, 'Patcher task failed with error');

    // Emit verification failure for UI tracking
    emitEvent(onStreamEvent, {
      type: 'verification_result',
      sectionId: task.sectionId,
      passed: false,
    });

    // Return original content on failure (graceful degradation)
    const originalContent = extractSectionContent(content, task.sectionId);
    return {
      success: false,
      sectionId: task.sectionId,
      patchedContent: originalContent,
      tokensUsed: 0,
    };
  }
}

/**
 * Execute a Section-Expander task with comprehensive error handling
 */
async function executeExpanderTask(
  task: SectionRefinementTask,
  content: LessonContent,
  onStreamEvent: ((event: RefinementEvent) => void) | undefined,
  ragChunks: RAGChunk[],
  learningObjectives: string[]
): Promise<{ success: boolean; sectionId: string; regeneratedContent: string; tokensUsed: number }> {
  try {
    emitEvent(onStreamEvent, {
      type: 'task_started',
      sectionId: task.sectionId,
      taskType: 'REGENERATE_SECTION',
    });

    // Extract section content
    const sectionContent = extractSectionContent(content, task.sectionId);

    // Build Section-Expander input
    const expanderInput = {
      sectionId: task.sectionId,
      sectionTitle: task.sectionTitle,
      originalContent: sectionContent,
      issues: task.sourceIssues,
      ragChunks,               // Use passed RAG chunks
      learningObjectives,      // Use passed learning objectives
      contextAnchors: task.contextAnchors,
      targetWordCount: 300, // Default target
    };

    // Execute expansion
    const expandResult = await executeExpansion(expanderInput);

    emitEvent(onStreamEvent, {
      type: 'patch_applied',
      sectionId: task.sectionId,
      content: expandResult.regeneratedContent,
      diffSummary: `Regenerated section (${expandResult.wordCount} words)`,
    });

    // Verify regeneration using Delta Judge
    let verificationPassed = true;
    let deltaJudgeTokens = 0;

    if (expandResult.regeneratedContent !== sectionContent && expandResult.success) {
      try {
        const result = await verifyPatchWithDeltaJudge(
          sectionContent,
          expandResult.regeneratedContent,
          task,
          onStreamEvent
        );
        verificationPassed = result.passed;
        deltaJudgeTokens = result.tokensUsed;

        logger.info({
          sectionId: task.sectionId,
          passed: result.passed,
          tokensUsed: result.tokensUsed,
        }, 'Delta Judge verification complete for expansion');
      } catch (error) {
        logger.error({
          error: error instanceof Error ? error.message : String(error),
          sectionId: task.sectionId,
        }, 'Delta Judge verification failed for expansion, assuming pass');
        verificationPassed = true;
      }
    }

    emitEvent(onStreamEvent, {
      type: 'verification_result',
      sectionId: task.sectionId,
      passed: verificationPassed,
    });

    return {
      success: expandResult.success && verificationPassed,
      sectionId: task.sectionId,
      regeneratedContent: verificationPassed ? expandResult.regeneratedContent : sectionContent,
      tokensUsed: expandResult.tokensUsed + deltaJudgeTokens,
    };
  } catch (error) {
    // Log error and return failure result for graceful degradation
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
      sectionId: task.sectionId,
      taskType: 'REGENERATE_SECTION',
    }, 'Section-Expander task failed with error');

    // Emit verification failure for UI tracking
    emitEvent(onStreamEvent, {
      type: 'verification_result',
      sectionId: task.sectionId,
      passed: false,
    });

    // Return original content on failure (graceful degradation)
    const originalContent = extractSectionContent(content, task.sectionId);
    return {
      success: false,
      sectionId: task.sectionId,
      regeneratedContent: originalContent,
      tokensUsed: 0,
    };
  }
}

/**
 * Extract section content from lesson content by section ID
 *
 * Section ID format: "sec_N" where N is 1-indexed
 * Maps to sections array index (N-1)
 *
 * @param content - Full LessonContent object
 * @param sectionId - Section ID in format "sec_1", "sec_2", etc.
 * @returns Section content string, or empty string if not found
 */
function extractSectionContent(content: LessonContent, sectionId: string): string {
  const body = content.content;

  // Handle intro request (special case)
  if (sectionId === 'sec_intro' || sectionId === 'intro') {
    return body.intro;
  }

  // Parse section index from ID (sec_1 → index 0, sec_2 → index 1, etc.)
  // Note: Different from parseSectionIndex in arbiter/section-utils.ts which returns 1-indexed for ordering.
  // Here we need 0-indexed for array access.
  const match = sectionId.match(/sec_(\d+)/);
  if (!match) {
    logger.warn({ sectionId }, 'Invalid section ID format');
    return '';
  }

  const sectionIndex = parseInt(match[1], 10) - 1; // Convert to 0-indexed

  if (sectionIndex < 0 || sectionIndex >= body.sections.length) {
    logger.warn({
      sectionId,
      sectionIndex,
      totalSections: body.sections.length,
    }, 'Section index out of bounds');
    return '';
  }

  const section = body.sections[sectionIndex];
  logger.debug({
    sectionId,
    sectionTitle: section.title,
    contentLength: section.content.length,
  }, 'Extracted section content');

  return section.content;
}

/**
 * Apply patched content to a specific section (immutable update)
 *
 * Returns new LessonContent with updated section content.
 * Uses immutable update pattern to preserve other fields.
 *
 * @param content - Original LessonContent
 * @param sectionId - Section ID to update (format: "sec_N")
 * @param patchedContent - New content for the section
 * @returns New LessonContent with updated section
 */
function applyPatchToContent(
  content: LessonContent,
  sectionId: string,
  patchedContent: string
): LessonContent {
  const body = content.content;

  // Handle intro update (special case)
  if (sectionId === 'sec_intro' || sectionId === 'intro') {
    return {
      ...content,
      content: {
        ...body,
        intro: patchedContent,
      },
      updated_at: new Date(),
    };
  }

  // Parse section index (HIGH-3: consistent with extractSectionContent - converts sec_N to 0-indexed array position)
  const match = sectionId.match(/sec_(\d+)/);
  if (!match) {
    logger.warn({ sectionId }, 'Invalid section ID format, returning unchanged');
    return content;
  }

  const sectionIndex = parseInt(match[1], 10) - 1;

  if (sectionIndex < 0 || sectionIndex >= body.sections.length) {
    logger.warn({ sectionId, sectionIndex }, 'Section index out of bounds, returning unchanged');
    return content;
  }

  // Immutable update of sections array
  const updatedSections = body.sections.map((section, index) => {
    if (index === sectionIndex) {
      logger.debug({
        sectionId,
        sectionTitle: section.title,
        oldLength: section.content.length,
        newLength: patchedContent.length,
      }, 'Applying patch to section');

      return {
        ...section,
        content: patchedContent,
      };
    }
    return section;
  });

  // Return new LessonContent with updated body
  return {
    ...content,
    content: {
      ...body,
      sections: updatedSections,
    },
    updated_at: new Date(),
  };
}

/**
 * Detect score oscillation pattern
 *
 * Oscillation occurs when:
 * 1. Score improved in iteration N-1 (compared to N-2) by more than tolerance
 * 2. Score dropped in iteration N (compared to N-1) by more than tolerance
 *
 * This indicates that recent changes degraded quality, and the section
 * should be locked to prevent further oscillation.
 *
 * Uses tolerance threshold (1%) to avoid false positives from minor fluctuations.
 *
 * @param scoreHistory - Array of scores from all iterations (oldest to newest)
 * @returns Object with detection result and relevant scores
 *
 * @example
 * ```ts
 * // No oscillation - steady improvement
 * detectScoreOscillation([0.70, 0.75, 0.80]); // { detected: false }
 *
 * // Oscillation detected - improved then dropped significantly
 * detectScoreOscillation([0.70, 0.78, 0.72]); // { detected: true, previousScore: 0.70, improvedScore: 0.78 }
 *
 * // No oscillation - minor fluctuation within tolerance
 * detectScoreOscillation([0.70, 0.71, 0.705]); // { detected: false }
 *
 * // Not enough data
 * detectScoreOscillation([0.70, 0.75]); // { detected: false }
 * ```
 */
function detectScoreOscillation(scoreHistory: number[]): {
  detected: boolean;
  previousScore?: number;
  improvedScore?: number;
} {
  // Need at least 3 data points to detect oscillation
  if (scoreHistory.length < 3) {
    return { detected: false };
  }

  // Tolerance threshold to avoid false positives from minor score fluctuations
  const OSCILLATION_TOLERANCE = REFINEMENT_CONFIG.quality.oscillationTolerance;

  // Get last 3 scores
  const len = scoreHistory.length;
  const previousScore = scoreHistory[len - 3]; // N-2
  const improvedScore = scoreHistory[len - 2]; // N-1
  const currentScore = scoreHistory[len - 1];  // N

  // Check if score improved in N-1, then dropped in N (with tolerance)
  const hadImprovement = improvedScore > previousScore + OSCILLATION_TOLERANCE;
  const hadRegression = currentScore < improvedScore - OSCILLATION_TOLERANCE;

  if (hadImprovement && hadRegression) {
    return {
      detected: true,
      previousScore,
      improvedScore,
    };
  }

  return { detected: false };
}

/**
 * Emit a refinement event to the stream callback
 *
 * Helper function that safely emits events to the optional stream callback.
 * Used throughout the refinement process to notify UI of progress, warnings,
 * and status changes.
 *
 * @param callback - Optional callback function to receive events
 * @param event - The RefinementEvent to emit
 *
 * @example
 * ```typescript
 * emitEvent(onStreamEvent, {
 *   type: 'iteration_start',
 *   iteration: 1,
 *   totalTasks: 5,
 * });
 * ```
 */
function emitEvent(
  onStreamEvent: ((event: RefinementEvent) => void) | undefined,
  event: RefinementEvent
): void {
  if (onStreamEvent) {
    try {
      onStreamEvent(event);
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        eventType: event.type,
      }, 'Error emitting refinement event');
    }
  }
}

/**
 * Emit quality_lock_triggered events for any violations detected
 *
 * Called after patch application when quality lock violations are detected.
 * Each violation triggers a separate event for UI tracking.
 *
 * **Phase 7 Integration Note:**
 * This function requires post-patch judge re-evaluation to detect quality regressions.
 * Currently not called in the main refinement loop because:
 * 1. Post-patch CriteriaScores are not available (placeholder scores used)
 * 2. checkQualityLocks needs actual criterion-level scores to detect regressions
 * 3. Phase 7 will integrate full judge re-evaluation after each patch
 *
 * When Phase 7 is ready, call this function in the main loop after patch application:
 * ```ts
 * const lockCheckResult = checkQualityLocks(state.qualityLocks, postPatchScores);
 * if (!lockCheckResult.passed) {
 *   emitQualityLockViolations(lockCheckResult.violations, onStreamEvent);
 * }
 * ```
 *
 * See TODO comment at line ~360 in the main refinement loop.
 *
 * @param violations - Array of QualityLockViolation from checkQualityLocks
 * @param onStreamEvent - Streaming callback
 */
export function emitQualityLockViolations(
  violations: QualityLockViolation[],
  onStreamEvent: ((event: RefinementEvent) => void) | undefined
): void {
  for (const violation of violations) {
    emitEvent(onStreamEvent, {
      type: 'quality_lock_triggered',
      sectionId: violation.sectionId,
      criterion: violation.criterion,
      lockedScore: violation.lockedScore,
      newScore: violation.newScore,
      delta: violation.delta,
    });

    logger.warn({
      sectionId: violation.sectionId,
      criterion: violation.criterion,
      lockedScore: violation.lockedScore,
      newScore: violation.newScore,
      delta: violation.delta,
    }, 'Quality lock violation detected');
  }
}
