/**
 * Judge Refinement Helper Functions
 * @module stages/stage6-lesson-content/nodes/judge-refinement-helpers
 *
 * Extracted refinement and no-verdict handling functions from judge-node-helpers.ts
 * These functions handle targeted refinement flow, result interpretation, and edge cases.
 */

import type { LessonGraphStateType, LessonGraphStateUpdate } from '../state';
import type {
  JudgeRecommendation,
  JudgeVerdict,
  ArbiterInput,
  ArbiterOutput,
} from '@megacampus/shared-types/judge-types';
import type { LessonContent, LessonContentBody } from '@megacampus/shared-types/lesson-content';
import type { TargetedRefinementOutput } from '../judge/targeted-refinement/types';
import type { CascadeResult } from '../judge/cascade-evaluator';
import { logger } from '@/shared/logger';
import { logTrace } from '@/shared/trace-logger';
import { buildLessonContent } from '../judge/judge-helpers';
import { buildEnrichedJudgeOutput } from '../judge/judge-output-builder';
import { buildJudgeProgressSummary } from '../judge/judge-progress';
import type { JudgeContext } from './judge-node-helpers';

/**
 * Execute targeted refinement flow
 *
 * Handles the targeted refinement process including:
 * - Arbiter consolidation
 * - Refinement execution
 * - Result interpretation
 *
 * @param context - Judge context
 * @param verdict - Judge verdict
 * @param contentBody - Content to refine
 * @returns Refinement results
 */
export async function executeTargetedRefinementFlow(
  context: JudgeContext,
  verdict: JudgeVerdict,
  contentBody: LessonContentBody
): Promise<{
  finalContent: LessonContent | null;
  finalScore: number;
  finalRecommendation: JudgeRecommendation;
  needsRegeneration: boolean;
  needsHumanReview: boolean;
  refinementTokensUsed: number;
  arbiterOutput: ArbiterOutput;
}> {
  const { state, cascadeResult, decision } = context;

  logger.info(
    {
      lessonId: state.lessonSpec.lesson_id,
      action: decision?.action,
    },
    'Judge node: Starting targeted refinement'
  );

  const operationMode = state.targetedRefinementMode ?? 'full-auto';

  // Consolidate verdicts
  const consolidateVerdicts = (await import('../judge/arbiter')).consolidateVerdicts;

  const arbiterInput: ArbiterInput = {
    clevResult: cascadeResult?.clevResult ?? {
      verdicts: verdict ? [verdict] : [],
      aggregatedScore: verdict?.overallScore ?? 0,
      finalRecommendation: verdict?.recommendation ?? 'REGENERATE',
      votingMethod: 'majority',
      consensusReached: false,
    },
    lessonContent: contentBody,
    operationMode,
  };

  const arbiterOutput = consolidateVerdicts(arbiterInput);

  // Build temporary LessonContent
  const tempLessonContent = buildLessonContent(state, contentBody, verdict.overallScore);

  // Execute refinement
  const executeTargetedRefinement = (await import('../judge/targeted-refinement'))
    .executeTargetedRefinement;

  const refinementInput = {
    content: tempLessonContent,
    arbiterOutput,
    operationMode,
    ragChunks: state.ragChunks,
    lessonSpec: state.lessonSpec,
    language: state.language,
  };

  const refinementResult = await executeTargetedRefinement(refinementInput);

  return interpretRefinementResult(
    refinementResult,
    verdict,
    operationMode,
    arbiterOutput,
    state,
    contentBody
  );
}

/**
 * Interpret targeted refinement result
 *
 * Determines final content, score, and recommendation based on refinement status.
 *
 * @param refinementResult - Result from targeted refinement
 * @param verdict - Original verdict
 * @param operationMode - Operating mode (full-auto or semi-auto)
 * @param arbiterOutput - Arbiter output
 * @param state - Graph state
 * @param contentBody - Original content
 * @returns Interpreted results
 */
export function interpretRefinementResult(
  refinementResult: TargetedRefinementOutput,
  verdict: JudgeVerdict,
  operationMode: string,
  arbiterOutput: ArbiterOutput,
  state: LessonGraphStateType,
  contentBody: LessonContentBody
): {
  finalContent: LessonContent | null;
  finalScore: number;
  finalRecommendation: JudgeRecommendation;
  needsRegeneration: boolean;
  needsHumanReview: boolean;
  refinementTokensUsed: number;
  arbiterOutput: ArbiterOutput;
} {
  const refinementTokensUsed = refinementResult.tokensUsed;

  if (refinementResult.status === 'accepted' || refinementResult.status === 'accepted_warning') {
    logger.info(
      {
        lessonId: state.lessonSpec.lesson_id,
        initialScore: verdict.overallScore,
        finalScore: refinementResult.finalScore,
        iterations: refinementResult.iterations,
        status: refinementResult.status,
      },
      'Judge node: Targeted refinement successful'
    );

    return {
      finalContent: refinementResult.content,
      finalScore: refinementResult.finalScore,
      finalRecommendation:
        refinementResult.status === 'accepted' ? 'ACCEPT' : 'ACCEPT_WITH_MINOR_REVISION',
      needsRegeneration: false,
      needsHumanReview: false,
      refinementTokensUsed,
      arbiterOutput,
    };
  }

  if (refinementResult.status === 'best_effort') {
    logger.info(
      {
        lessonId: state.lessonSpec.lesson_id,
        finalScore: refinementResult.finalScore,
        qualityStatus: refinementResult.bestEffortResult?.qualityStatus,
      },
      'Judge node: Targeted refinement returned best-effort'
    );

    return {
      finalContent: refinementResult.content,
      finalScore: refinementResult.finalScore,
      finalRecommendation: 'ACCEPT_WITH_MINOR_REVISION',
      needsRegeneration: false,
      needsHumanReview: false,
      refinementTokensUsed,
      arbiterOutput,
    };
  }

  // Escalated status handling
  const noWorkDone =
    refinementResult.iterations <= 1 && refinementResult.tokensUsed <= arbiterOutput.tokensUsed;
  const originalScoreIsGood = verdict.overallScore >= 0.75;

  if (operationMode === 'full-auto' && noWorkDone && originalScoreIsGood) {
    logger.info(
      {
        lessonId: state.lessonSpec.lesson_id,
        status: 'accepted_fallback',
        originalScore: verdict.overallScore,
        heuristicScore: refinementResult.finalScore,
        reason: 'Arbiter rejected issues but CLEV score was good',
      },
      'Judge node: Targeted refinement escalated but accepting original (good CLEV score)'
    );

    return {
      finalContent: buildLessonContent(state, contentBody, verdict.overallScore),
      finalScore: verdict.overallScore,
      finalRecommendation: 'ACCEPT_WITH_MINOR_REVISION',
      needsRegeneration: false,
      needsHumanReview: false,
      refinementTokensUsed,
      arbiterOutput,
    };
  }

  logger.warn(
    {
      lessonId: state.lessonSpec.lesson_id,
      status: refinementResult.status,
      finalScore: refinementResult.finalScore,
    },
    'Judge node: Targeted refinement escalated'
  );

  const needsRegeneration =
    refinementResult.status === 'escalated' && operationMode === 'semi-auto';
  const needsHumanReview = refinementResult.status === 'escalated' && operationMode === 'semi-auto';

  return {
    finalContent: null,
    finalScore: refinementResult.finalScore,
    finalRecommendation: needsRegeneration ? 'REGENERATE' : 'ESCALATE_TO_HUMAN',
    needsRegeneration,
    needsHumanReview,
    refinementTokensUsed,
    arbiterOutput,
  };
}

/**
 * Build review info for UI warnings
 *
 * @param needsHumanReview - Whether human review is needed
 * @param cascadeResult - Cascade evaluation result
 * @returns Review info object or null
 */
export function buildReviewInfo(
  needsHumanReview: boolean | undefined,
  cascadeResult: CascadeResult | undefined
): {
  needsReview: boolean;
  reasons: string[];
  factualAccuracyScore?: number;
  unverifiedClaims: number;
} | null {
  const factualResult = cascadeResult?.factualVerificationResult;
  const reviewReasons: string[] = [];

  if (needsHumanReview) {
    reviewReasons.push('Judge escalated to human review');
  }

  if (factualResult?.requiresHumanReview) {
    if (factualResult.contradictedClaims > 0) {
      reviewReasons.push(
        `${factualResult.contradictedClaims} claim(s) contradict source materials`
      );
    }
    if (factualResult.unverifiedClaims > 0) {
      reviewReasons.push(`${factualResult.unverifiedClaims} claim(s) could not be verified`);
    }
    if (factualResult.noEvidenceClaims > 0) {
      reviewReasons.push(`${factualResult.noEvidenceClaims} claim(s) have no evidence in sources`);
    }
  }

  if (reviewReasons.length === 0) {
    return null;
  }

  return {
    needsReview: true,
    reasons: reviewReasons,
    factualAccuracyScore: factualResult?.overallAccuracyScore,
    unverifiedClaims:
      (factualResult?.unverifiedClaims ?? 0) + (factualResult?.noEvidenceClaims ?? 0),
  };
}

/**
 * Handle no-verdict scenario
 *
 * Creates synthetic decision when cascade produces no verdict.
 *
 * @param context - Judge context
 * @returns State update for no-verdict case
 */
export async function handleNoVerdict(context: JudgeContext): Promise<LessonGraphStateUpdate> {
  const { state, startTime, cascadeResult } = context;

  const recommendation = cascadeResult?.finalRecommendation ?? 'REGENERATE';
  const needsRegeneration = recommendation === 'REGENERATE';
  const needsHumanReview = recommendation === 'ESCALATE_TO_HUMAN';
  const durationMs = Date.now() - startTime;

  // Build enriched output
  const enrichedOutput = buildEnrichedJudgeOutput(
    cascadeResult!,
    state,
    needsRegeneration,
    needsHumanReview
  );
  const judgeModelsUsed = extractJudgeModels(enrichedOutput);
  const modelUsed =
    judgeModelsUsed.length === 0
      ? null
      : judgeModelsUsed.length === 1
        ? judgeModelsUsed[0]
        : judgeModelsUsed.join(', ');

  // Log trace
  await logTrace({
    courseId: state.courseId,
    lessonId: state.lessonUuid || undefined,
    stage: 'stage_6',
    phase: 'judge',
    stepName: 'judge_complete',
    inputData: {
      lessonLabel: state.lessonSpec.lesson_id,
      lessonTitle: state.lessonSpec.title,
      moduleNumber: state.lessonSpec.lesson_id.split('.')[0],
      syntheticDecision: true,
    },
    outputData: {
      ...enrichedOutput,
      judgeModelsUsed,
    },
    modelUsed,
    tokensUsed: cascadeResult?.totalTokensUsed,
    durationMs,
  });

  const syntheticProgress = buildJudgeProgressSummary(
    recommendation,
    cascadeResult!,
    null,
    state.language,
    durationMs,
    cascadeResult?.totalTokensUsed ?? 0,
    (state.retryCount || 0) + 1,
    state.progressSummary
  );

  return {
    currentNode: 'judge',
    qualityScore: cascadeResult?.finalScore,
    judgeRecommendation: recommendation,
    needsRegeneration,
    needsHumanReview,
    lessonContent: needsRegeneration ? null : state.lessonContent,
    retryCount: needsRegeneration ? state.retryCount + 1 : state.retryCount,
    tokensUsed: cascadeResult?.totalTokensUsed ?? 0,
    durationMs,
    progressSummary: syntheticProgress,
  };
}

function extractJudgeModels(enrichedOutput: ReturnType<typeof buildEnrichedJudgeOutput>): string[] {
  const models = new Set<string>();

  if (enrichedOutput.singleJudge?.model) {
    models.add(enrichedOutput.singleJudge.model);
  }

  for (const vote of enrichedOutput.votes ?? []) {
    if (vote.model_id) {
      models.add(vote.model_id);
    }
  }

  return Array.from(models);
}
