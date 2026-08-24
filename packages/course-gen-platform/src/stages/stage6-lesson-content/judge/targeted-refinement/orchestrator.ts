import { REFINEMENT_CONFIG } from '@megacampus/shared-types';
import type {
  StopReason,
  TaskPriority,
  RefinementStatus,
  BestEffortResult,
  LessonContent,
} from '@megacampus/shared-types';

import { logger } from '../../../../shared/logger';
import { shouldContinueIteration, updateSectionLocks } from './iteration-controller';
import { selectBestIteration } from './best-effort-selector';
import { createExecutionBatches } from '../router';

import type { TargetedRefinementInput, TargetedRefinementOutput, RefinementState } from './types';
import { DELTA_JUDGE_ESTIMATED_TOKENS, MAX_TASKS_PER_ITERATION } from './constants';
import { emitEvent } from './events';
import { initializeQualityLocksFromArbiter } from './state-manager';
import { calculateHeuristicScore, detectScoreOscillation } from './scoring';
import { collectAllIssues, applyPatchToContent, convertToIterationHistory } from './content-utils';
import { executePatcherTask, executeExpanderTask } from './task-executor';
import type { SectionRefinementTask } from '@megacampus/shared-types/judge-types';

/**
 * Check if token budget is exhausted and handle the stop condition.
 * Returns true if budget is exhausted and execution should stop.
 */
function checkBudgetExhausted(
  state: RefinementState,
  remainingTaskCount: number,
  onStreamEvent: TargetedRefinementInput['onStreamEvent']
): { exhausted: boolean; skipped: number; stopReason: StopReason } {
  if (state.tokensUsed < REFINEMENT_CONFIG.limits.maxTokens) {
    return { exhausted: false, skipped: 0, stopReason: 'continue_more_tasks' };
  }

  logger.info(
    {
      iteration: state.iteration,
      tokensUsed: state.tokensUsed,
      maxTokens: REFINEMENT_CONFIG.limits.maxTokens,
      skippedTasks: remainingTaskCount,
    },
    'Token budget exhausted during refinement - skipping remaining tasks'
  );
  emitEvent(onStreamEvent, {
    type: 'budget_warning',
    tokensUsed: state.tokensUsed,
    maxTokens: REFINEMENT_CONFIG.limits.maxTokens,
  });

  return { exhausted: true, skipped: remainingTaskCount, stopReason: 'stop_token_budget' };
}

/**
 * The mutable half of one refinement pass.
 *
 * `budgetStopReason` is how the task groups tell the iteration to stop: they cannot return it,
 * because they run inside a labelled loop and the caller needs the reason after the break.
 */
interface IterationRun {
  currentContent: LessonContent;
  startedTaskCount: number;
  sectionsEdited: string[];
  skippedDueToBudget: number;
  budgetStopReason: StopReason | null;
}

/**
 * Run one kind of refinement task — surgical patches, or whole-section regenerations.
 *
 * These were two loops written twice, differing in the executor, the field the new text arrives
 * under (`patchedContent` against `regeneratedContent`) and one word in a log line. Everything
 * that governs SAFETY was identical and now exists once:
 *
 *   * the budget is re-checked before every task, not once per batch, because a single
 *     regeneration can exhaust what was left;
 *   * the edit count is incremented whether the task succeeded or FAILED, which is what stops a
 *     section that keeps failing from being retried forever — a lock after
 *     `sectionLockAfterEdits` attempts, not after that many successes;
 *   * tokens are counted on failure too, because a refused generation was still paid for.
 *
 * Returns `false` when the budget ran out, which the caller reads as "leave the batch loop".
 */
async function runTaskGroup(input: {
  tasks: SectionRefinementTask[];
  label: 'Patcher' | 'Expander';
  execute: (task: SectionRefinementTask) => Promise<{
    sectionId: string;
    success: boolean;
    tokensUsed: number;
    newContent: string;
  }>;
  state: RefinementState;
  run: IterationRun;
  selectedTaskCount: number;
  onStreamEvent: TargetedRefinementInput['onStreamEvent'];
}): Promise<boolean> {
  const { tasks, label, execute, state, run, selectedTaskCount, onStreamEvent } = input;

  for (const task of tasks) {
    const budgetCheck = checkBudgetExhausted(
      state,
      selectedTaskCount - run.startedTaskCount,
      onStreamEvent
    );
    if (budgetCheck.exhausted) {
      run.skippedDueToBudget += budgetCheck.skipped;
      run.budgetStopReason = budgetCheck.stopReason;
      return false;
    }

    run.startedTaskCount++;
    run.sectionsEdited.push(task.sectionId);

    const result = await execute(task);

    // Always increment edit count to prevent infinite loops on repeated failures.
    // Section will lock after sectionLockAfterEdits attempts (success or failure).
    state.sectionEditCount[result.sectionId] = (state.sectionEditCount[result.sectionId] || 0) + 1;

    // Count tokens whichever way it went: a refused generation was still paid for.
    state.tokensUsed += result.tokensUsed;

    if (result.success) {
      run.currentContent = applyPatchToContent(
        run.currentContent,
        result.sectionId,
        result.newContent
      );
    } else {
      // Log failed attempt for debugging (hallucination rejection, truncation, etc.)
      logger.warn(
        {
          sectionId: result.sectionId,
          editCount: state.sectionEditCount[result.sectionId],
          maxEdits: REFINEMENT_CONFIG.quality.sectionLockAfterEdits,
        },
        `${label} failed - edit attempt counted toward section lock`
      );
    }
  }

  return true;
}

/**
 * Execute targeted refinement loop
 */
export async function executeTargetedRefinement(
  input: TargetedRefinementInput
): Promise<TargetedRefinementOutput> {
  const {
    content,
    arbiterOutput,
    operationMode,
    llmCall,
    onStreamEvent,
    ragChunks,
    lessonSpec,
    language,
    courseId,
  } = input;
  const startTime = Date.now();

  logger.info(
    {
      operationMode,
      tasksCount: arbiterOutput.plan.tasks.length,
      agreementScore: arbiterOutput.agreementScore,
      language: language || 'default (en)',
      hasRagChunks: (ragChunks?.length || 0) > 0,
      hasLessonSpec: !!lessonSpec,
    },
    'Starting targeted refinement loop'
  );

  // Pre-populate sectionEditCount with all target sections
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
    tokensUsed: arbiterOutput.tokensUsed,
    startTime,
  };

  // The mutable half of one refinement pass. Held in an object rather than as locals because
  // `runTaskGroup` advances all four, and passing four `let`s into a helper is how they drift.
  const run: IterationRun = {
    currentContent: { ...content },
    startedTaskCount: 0,
    sectionsEdited: [],
    skippedDueToBudget: 0,
    budgetStopReason: null,
  };

  // Calculate initial score
  const initialScore = calculateHeuristicScore(arbiterOutput, 0, 0, 0);
  state.scoreHistory.push(initialScore);
  state.contentHistory.push({
    iteration: 0,
    score: initialScore,
    content: run.currentContent,
    remainingIssues: collectAllIssues(arbiterOutput.plan.tasks),
  });

  const targetSections = arbiterOutput.plan.tasks.map(t => t.sectionId);
  emitEvent(onStreamEvent, {
    type: 'refinement_start',
    targetSections,
    mode: operationMode,
  });

  emitEvent(onStreamEvent, {
    type: 'arbiter_complete',
    agreementScore: arbiterOutput.agreementScore,
    agreementLevel: arbiterOutput.agreementLevel,
    acceptedIssueCount: arbiterOutput.acceptedIssues.length,
    rejectedIssueCount: arbiterOutput.rejectedIssues.length,
  });

  let shouldContinue = true;
  let stopReason: StopReason = 'continue_more_tasks';

  while (shouldContinue) {
    state.iteration++;

    logger.info(
      {
        iteration: state.iteration,
        lockedSections: state.lockedSections.length,
        tokensUsed: state.tokensUsed,
      },
      `Starting refinement iteration ${state.iteration}`
    );

    // Filter out locked sections from tasks
    const availableTasks = arbiterOutput.plan.tasks.filter(
      task => !state.lockedSections.includes(task.sectionId)
    );

    if (availableTasks.length === 0) {
      logger.info('No available tasks (all sections locked)');
      stopReason = 'stop_all_sections_locked';
      break;
    }

    if (state.tokensUsed >= REFINEMENT_CONFIG.limits.maxTokens) {
      run.skippedDueToBudget += availableTasks.length;
      logger.warn(
        {
          tokensUsed: state.tokensUsed,
          maxTokens: REFINEMENT_CONFIG.limits.maxTokens,
          skippedTasks: availableTasks.length,
        },
        'Token budget exhausted before refinement iteration - skipping remaining tasks'
      );

      emitEvent(onStreamEvent, {
        type: 'budget_warning',
        tokensUsed: state.tokensUsed,
        maxTokens: REFINEMENT_CONFIG.limits.maxTokens,
      });

      stopReason = 'stop_token_budget';
      break;
    }

    // Sort tasks by priority
    const priorityOrder: Record<TaskPriority, number> = { critical: 0, major: 1, minor: 2 };
    const sortedByPriority = [...availableTasks].sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    const selectedTasks = sortedByPriority.slice(0, MAX_TASKS_PER_ITERATION);
    const skippedTasksThisIteration = sortedByPriority.length - selectedTasks.length;

    if (skippedTasksThisIteration > 0) {
      logger.info(
        {
          iteration: state.iteration,
          selectedTasks: selectedTasks.length,
          skippedTasks: skippedTasksThisIteration,
          maxTasksPerIteration: MAX_TASKS_PER_ITERATION,
        },
        'Refinement iteration task cap reached - deferring remaining tasks to next iteration'
      );
    }

    const batches = createExecutionBatches(selectedTasks);
    run.startedTaskCount = 0;
    run.sectionsEdited = [];
    run.budgetStopReason = null;

    // Execute batches
    batchLoop: for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchSections = batch.map(t => t.sectionId);

      emitEvent(onStreamEvent, {
        type: 'batch_started',
        batchIndex,
        sections: batchSections,
      });

      logger.info(
        {
          batchIndex,
          tasksCount: batch.length,
          sections: batchSections,
          estimatedDeltaJudgeTokens: batch.length * DELTA_JUDGE_ESTIMATED_TOKENS,
        },
        'Executing batch'
      );

      const patcherTasks = batch.filter(t => t.actionType === 'SURGICAL_EDIT');
      const expanderTasks = batch.filter(t => t.actionType === 'REGENERATE_SECTION');

      if (patcherTasks.length > 0) {
        const sectionIds = new Set(patcherTasks.map(t => t.sectionId));
        if (sectionIds.size !== patcherTasks.length) {
          throw new Error('Invalid batch: duplicate sectionIds detected');
        }
      }

      const patcherRan = await runTaskGroup({
        tasks: patcherTasks,
        label: 'Patcher',
        execute: task =>
          executePatcherTask(task, run.currentContent, llmCall, onStreamEvent, {
            score: state.scoreHistory[state.scoreHistory.length - 1] || 0.7,
            iteration: state.iteration,
            issues: collectAllIssues(arbiterOutput.plan.tasks),
            iterationHistory: convertToIterationHistory(state.contentHistory),
            lessonSpec,
            strengths:
              arbiterOutput.acceptedIssues.length === 0 ? ['Content meets quality standards'] : [],
            language, // Pass language for token budget calculation
            courseId,
          }).then(result => ({ ...result, newContent: result.patchedContent })),
        state,
        run,
        selectedTaskCount: selectedTasks.length,
        onStreamEvent,
      });
      if (!patcherRan) break batchLoop;

      const expanderRan = await runTaskGroup({
        tasks: expanderTasks,
        label: 'Expander',
        execute: task =>
          executeExpanderTask(
            task,
            run.currentContent,
            onStreamEvent,
            ragChunks || [],
            lessonSpec?.learning_objectives?.map(lo => lo.objective) || [],
            language,
            courseId
          ).then(result => ({ ...result, newContent: result.regeneratedContent })),
        state,
        run,
        selectedTaskCount: selectedTasks.length,
        onStreamEvent,
      });
      if (!expanderRan) break batchLoop;

      emitEvent(onStreamEvent, {
        type: 'batch_complete',
        batchIndex,
      });
    }

    // Update section locks based on edit count
    const newlyLockedSections = updateSectionLocks(
      state.sectionEditCount,
      REFINEMENT_CONFIG.quality.sectionLockAfterEdits
    );

    for (const sectionId of newlyLockedSections) {
      if (!state.lockedSections.includes(sectionId)) {
        emitEvent(onStreamEvent, {
          type: 'section_locked',
          sectionId,
          reason: 'max_edits',
        });
      }
    }

    state.lockedSections = [...new Set([...state.lockedSections, ...newlyLockedSections])];

    // Re-evaluate score
    const tasksCompletedThisIteration = run.sectionsEdited.length;
    const newScore = calculateHeuristicScore(
      arbiterOutput,
      state.iteration,
      tasksCompletedThisIteration,
      state.lockedSections.length
    );
    state.scoreHistory.push(newScore);

    // Check for oscillation
    const oscillationDetected = detectScoreOscillation(state.scoreHistory);
    const sectionsToLockForOscillation: string[] = [];

    if (oscillationDetected.detected) {
      sectionsToLockForOscillation.push(...run.sectionsEdited);
      logger.warn(
        {
          sections: run.sectionsEdited,
          previousScore: oscillationDetected.previousScore,
          improvedScore: oscillationDetected.improvedScore,
          currentScore: newScore,
        },
        'Oscillation detected - locking sections to prevent further score degradation'
      );
    }

    for (const sectionId of sectionsToLockForOscillation) {
      if (!state.lockedSections.includes(sectionId)) {
        emitEvent(onStreamEvent, {
          type: 'section_locked',
          sectionId,
          reason: 'oscillation',
        });
      }
    }

    state.lockedSections = [...new Set([...state.lockedSections, ...sectionsToLockForOscillation])];

    // Store iteration result
    const remainingIssues = collectAllIssues(
      arbiterOutput.plan.tasks.filter(t => !state.lockedSections.includes(t.sectionId))
    );
    state.contentHistory.push({
      iteration: state.iteration,
      score: newScore,
      content: { ...run.currentContent },
      remainingIssues,
    });

    emitEvent(onStreamEvent, {
      type: 'iteration_complete',
      iteration: state.iteration,
      score: newScore,
    });

    logger.info(
      {
        iteration: state.iteration,
        score: newScore,
        scoreImprovement: newScore - state.scoreHistory[state.scoreHistory.length - 2],
        lockedSections: state.lockedSections.length,
      },
      'Iteration complete'
    );

    if (run.budgetStopReason) {
      stopReason = run.budgetStopReason;
      shouldContinue = false;
    } else {
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
    }

    if (!shouldContinue) {
      logger.info(
        {
          reason: stopReason,
          finalScore: newScore,
          iterations: state.iteration,
          skippedTasksDueToBudget: run.skippedDueToBudget,
        },
        'Stopping refinement loop'
      );
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
  } else if (
    (stopReason === 'stop_max_iterations' || stopReason === 'stop_token_budget') &&
    operationMode === 'full-auto'
  ) {
    const unresolvedIssues = state.contentHistory[state.contentHistory.length - 1].remainingIssues;
    const selectorResult = selectBestIteration({
      iterationHistory: state.contentHistory,
      unresolvedIssues,
      operationMode,
    });

    bestEffortResult = selectorResult.bestResult;
    finalStatus = selectorResult.finalStatus;
    run.currentContent = bestEffortResult.content as LessonContent; // Safe cast

    logger.info(
      {
        selectedIteration: selectorResult.selectedIteration,
        bestScore: bestEffortResult.bestScore,
        qualityStatus: bestEffortResult.qualityStatus,
        selectionReason: selectorResult.selectionReason,
      },
      'Selected best iteration (full-auto mode)'
    );
  } else if (stopReason === 'stop_max_iterations' && operationMode === 'semi-auto') {
    finalStatus = 'escalated';
  } else {
    finalStatus = finalScore >= modeConfig.goodEnoughThreshold ? 'accepted_warning' : 'escalated';
  }

  const durationMs = Date.now() - startTime;

  if (finalStatus === 'escalated' && operationMode === 'semi-auto') {
    emitEvent(onStreamEvent, {
      type: 'escalation_triggered',
      reason: stopReason,
      score: finalScore,
      goodEnoughThreshold: modeConfig.goodEnoughThreshold,
      unresolvedIssuesCount: bestEffortResult?.unresolvedIssues.length ?? 0,
    });
  }

  emitEvent(onStreamEvent, {
    type: 'refinement_complete',
    finalScore,
    status: finalStatus,
  });

  logger.info(
    {
      finalStatus,
      finalScore,
      iterations: state.iteration,
      stopReason,
      skippedTasksDueToBudget: run.skippedDueToBudget,
      tokensUsed: state.tokensUsed,
      durationMs,
    },
    'Targeted refinement complete'
  );

  return {
    content: run.currentContent,
    status: finalStatus,
    finalScore,
    iterations: state.iteration,
    tokensUsed: state.tokensUsed,
    durationMs,
    bestEffortResult,
  };
}
