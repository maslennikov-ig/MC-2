import type { LessonGraphStateType, LessonGraphStateUpdate } from '../state';
import type { JudgeRecommendation } from '@megacampus/shared-types/judge-types';
import { logger } from '@/shared/logger';
import { logTrace } from '@/shared/trace-logger';
import { extractContentBody } from '../judge/judge-helpers';
import { buildJudgeProgressSummary } from '../judge/judge-progress';
import {
  setupJudgeContext,
  runCascadeEvaluation,
  makeJudgeDecision,
  processJudgeDecision,
  finalizeJudgeResult,
} from './judge-node-helpers';
import { handleNoVerdict } from './judge-refinement-helpers';

/**
 * Judge Node - Evaluates generated content and makes decisions
 *
 * Uses a cascade evaluation approach:
 * 1. Heuristic filters (fast, cheap)
 * 2. Single LLM Judge (moderate cost/speed)
 * 3. CLEV (Consensus-based LLM Evaluation with Voting) - only if needed
 *
 * @param state - Current LangGraph state after selfReviewer node
 * @returns Updated state with judge verdict and final content
 */
export async function judgeNode(state: LessonGraphStateType): Promise<LessonGraphStateUpdate> {
  const startTime = Date.now();

  // Extract content body for evaluation
  const contentBody = extractContentBody(state);

  // Phase 1: Setup and validation
  const setupResult = await setupJudgeContext(state, contentBody, startTime);

  if (!setupResult) {
    // No valid content body
    const noContentProgress = buildJudgeProgressSummary(
      'REGENERATE',
      null,
      null,
      state.language,
      Date.now() - startTime,
      0,
      (state.retryCount || 0) + 1,
      state.progressSummary
    );

    return {
      currentNode: 'judge',
      errors: ['Judge node: No valid content body to evaluate'],
      needsRegeneration: true,
      judgeRecommendation: 'REGENERATE' as JudgeRecommendation,
      progressSummary: noContentProgress,
    };
  }

  try {
    // Phase 2: Execute cascade evaluation
    let context = await runCascadeEvaluation(setupResult);

    // Handle no-verdict scenario
    if (!context.verdict) {
      return await handleNoVerdict(context);
    }

    // Phase 3: Make decision from verdict
    context = await makeJudgeDecision(context);

    // Phase 4: Process decision action
    context = await processJudgeDecision(context);

    // Phase 5: Finalize and return result
    return await finalizeJudgeResult(context);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startTime;

    logger.error(
      {
        lessonId: state.lessonSpec.lesson_id,
        error: errorMessage,
        durationMs,
      },
      'Judge node: Evaluation failed with exception'
    );

    // Log trace on error
    await logTrace({
      courseId: state.courseId,
      lessonId: state.lessonUuid || undefined,
      stage: 'stage_6',
      phase: 'judge',
      stepName: 'judge_error',
      inputData: {
        lessonLabel: state.lessonSpec.lesson_id,
        lessonTitle: state.lessonSpec.title,
        moduleNumber: state.lessonSpec.lesson_id.split('.')[0],
      },
      errorData: {
        error: errorMessage,
      },
      durationMs,
    });

    const errorProgress = buildJudgeProgressSummary(
      'REGENERATE',
      null,
      null,
      state.language,
      durationMs,
      0,
      (state.retryCount || 0) + 1,
      state.progressSummary
    );

    return {
      currentNode: 'judge',
      errors: [`Judge node error: ${errorMessage}`],
      needsRegeneration: true,
      judgeRecommendation: 'REGENERATE' as JudgeRecommendation,
      durationMs,
      progressSummary: errorProgress,
    };
  }
}
