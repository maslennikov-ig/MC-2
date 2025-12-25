import { REFINEMENT_CONFIG } from '@megacampus/shared-types';
import type { StopReason, TaskPriority } from '@megacampus/shared-types';

import { logger } from '../../../../shared/logger';
import { shouldContinueIteration, updateSectionLocks } from './iteration-controller';
import { selectBestIteration } from './best-effort-selector';
import { createExecutionBatches } from '../router';

import type {
  TargetedRefinementInput,
  TargetedRefinementOutput,
  RefinementState,
} from './types';
import { DELTA_JUDGE_ESTIMATED_TOKENS } from './constants';
import { emitEvent } from './events';
import { initializeQualityLocksFromArbiter } from './state-manager';
import { calculateHeuristicScore, detectScoreOscillation } from './scoring';
import { collectAllIssues, applyPatchToContent, convertToIterationHistory } from './content-utils';
import { executePatcherTask, executeExpanderTask } from './task-executor';

/**
 * Execute targeted refinement loop
 */
export async function executeTargetedRefinement(
  input: TargetedRefinementInput
): Promise<TargetedRefinementOutput> {
  const { content, arbiterOutput, operationMode, llmCall, onStreamEvent, ragChunks, lessonSpec, language } = input;
  const startTime = Date.now();

  logger.info({
    operationMode,
    tasksCount: arbiterOutput.plan.tasks.length,
    agreementScore: arbiterOutput.agreementScore,
    language: language || 'default (en)',
    hasRagChunks: (ragChunks?.length || 0) > 0,
    hasLessonSpec: !!lessonSpec,
  }, 'Starting targeted refinement loop');

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

  let currentContent = { ...content };

  // Calculate initial score
  const initialScore = calculateHeuristicScore(arbiterOutput, 0, 0, 0);
  state.scoreHistory.push(initialScore);
  state.contentHistory.push({
    iteration: 0,
    score: initialScore,
    content: currentContent,
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

    // Advisory budget check
    if (state.tokensUsed >= REFINEMENT_CONFIG.limits.maxTokens) {
      const overBudget = state.tokensUsed - REFINEMENT_CONFIG.limits.maxTokens;
      logger.warn({
        tokensUsed: state.tokensUsed,
        maxTokens: REFINEMENT_CONFIG.limits.maxTokens,
        overBudget,
      }, 'Token budget exceeded (advisory) - continuing with tasks');

      emitEvent(onStreamEvent, {
        type: 'budget_warning',
        tokensUsed: state.tokensUsed,
        maxTokens: REFINEMENT_CONFIG.limits.maxTokens,
      });
    }

    // Sort tasks by priority
    const priorityOrder: Record<TaskPriority, number> = { critical: 0, major: 1, minor: 2 };
    const sortedByPriority = [...availableTasks].sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    const batches = createExecutionBatches(sortedByPriority);
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

      const patcherTasks = batch.filter(t => t.actionType === 'SURGICAL_EDIT');
      const expanderTasks = batch.filter(t => t.actionType === 'REGENERATE_SECTION');

      // Execute Patcher tasks
      if (patcherTasks.length > 0) {
        const sectionIds = new Set(patcherTasks.map(t => t.sectionId));
        if (sectionIds.size !== patcherTasks.length) {
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
            language, // Pass language for token budget calculation
          }))
        );

        for (const result of patchResults) {
          if (result.success) {
            currentContent = applyPatchToContent(currentContent, result.sectionId, result.patchedContent);
            state.tokensUsed += result.tokensUsed;
            state.sectionEditCount[result.sectionId] = (state.sectionEditCount[result.sectionId] || 0) + 1;
          }
        }
      }

      // Execute Expander tasks
      if (expanderTasks.length > 0) {
        for (const task of expanderTasks) {
          const result = await executeExpanderTask(
            task,
            currentContent,
            onStreamEvent,
            ragChunks || [],
            lessonSpec?.learning_objectives?.map(lo => lo.objective) || [],
            language
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

    state.lockedSections = [...new Set([
      ...state.lockedSections,
      ...newlyLockedSections,
    ])];

    // Re-evaluate score
    const tasksCompletedThisIteration = sectionsEditedThisIteration.length;
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
      sectionsToLockForOscillation.push(...sectionsEditedThisIteration);
      logger.warn({
        sections: sectionsEditedThisIteration,
        previousScore: oscillationDetected.previousScore,
        improvedScore: oscillationDetected.improvedScore,
        currentScore: newScore,
      }, 'Oscillation detected - locking sections to prevent further score degradation');
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
  let finalStatus: any; // RefinementStatus type issue workaround if needed
  let bestEffortResult: any | undefined;

  if (finalScore >= modeConfig.acceptThreshold) {
    finalStatus = 'accepted';
  } else if (finalScore >= modeConfig.goodEnoughThreshold) {
    finalStatus = 'accepted_warning';
  } else if (stopReason === 'stop_max_iterations' && operationMode === 'full-auto') {
    const unresolvedIssues = state.contentHistory[state.contentHistory.length - 1].remainingIssues;
    const selectorResult = selectBestIteration({
      iterationHistory: state.contentHistory,
      unresolvedIssues,
      operationMode,
    });

    bestEffortResult = selectorResult.bestResult;
    finalStatus = selectorResult.finalStatus;
    currentContent = bestEffortResult.content; // Safe cast

    logger.info({
      selectedIteration: selectorResult.selectedIteration,
      bestScore: bestEffortResult.bestScore,
      qualityStatus: bestEffortResult.qualityStatus,
      selectionReason: selectorResult.selectionReason,
    }, 'Selected best iteration (full-auto mode)');
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
