/**
 * Judge Node Helper Functions
 * @module stages/stage6-lesson-content/nodes/judge-node-helpers
 *
 * Extracted helper functions to reduce complexity of judge-node.ts
 * These functions represent logical phases of the judge evaluation process.
 */

import type { LessonGraphStateType, LessonGraphStateUpdate } from '../state';
import type {
  JudgeRecommendation,
  JudgeVerdict,
  ArbiterOutput,
} from '@megacampus/shared-types/judge-types';
import type { LessonContent, LessonContentBody } from '@megacampus/shared-types/lesson-content';
import type { CascadeEvaluationInput, CascadeResult } from '../judge/cascade-evaluator';
import { DecisionAction, type DecisionResult } from '../judge/decision-engine';
import { logger } from '@/shared/logger';
import { logTrace } from '@/shared/trace-logger';
import { buildLessonContent } from '../judge/judge-helpers';
import { buildEnrichedJudgeOutput } from '../judge/judge-output-builder';
import { buildJudgeProgressSummary } from '../judge/judge-progress';
import { executeTargetedRefinementFlow, buildReviewInfo } from './judge-refinement-helpers';

/**
 * Context object passed between judge phases
 * Contains all state needed for evaluation and decision making
 */
export interface JudgeContext {
  state: LessonGraphStateType;
  contentBody: LessonContentBody;
  startTime: number;
  cascadeResult?: CascadeResult;
  verdict?: JudgeVerdict | null;
  decision?: DecisionResult;
  finalContent?: LessonContent | null;
  finalScore?: number;
  finalRecommendation?: JudgeRecommendation;
  needsRegeneration?: boolean;
  needsHumanReview?: boolean;
  refinementTokensUsed?: number;
  arbiterOutput?: ArbiterOutput | null;
}

/**
 * Phase 1: Setup judge context and validate inputs
 *
 * Prepares the evaluation context, validates content, and logs trace start.
 * Returns early if content is invalid.
 *
 * @param state - Current LangGraph state
 * @param contentBody - Extracted content body
 * @param startTime - Timestamp when judge started
 * @returns Initial judge context or null if validation failed
 */
export async function setupJudgeContext(
  state: LessonGraphStateType,
  contentBody: LessonContentBody | null,
  startTime: number
): Promise<JudgeContext | null> {
  logger.info(
    {
      lessonId: state.lessonSpec.lesson_id,
      currentNode: 'judge',
      hasGeneratedContent: Boolean(state.generatedContent),
      refinementIterationCount: state.refinementIterationCount,
    },
    'Judge node: Starting content evaluation'
  );

  // Log trace at start
  await logTrace({
    courseId: state.courseId,
    lessonId: state.lessonUuid || undefined,
    stage: 'stage_6',
    phase: 'judge',
    stepName: 'judge_start',
    inputData: {
      lessonLabel: state.lessonSpec.lesson_id,
      lessonTitle: state.lessonSpec.title,
      moduleNumber: state.lessonSpec.lesson_id.split('.')[0],
      hasGeneratedContent: Boolean(state.generatedContent),
      refinementIterationCount: state.refinementIterationCount,
    },
    durationMs: 0,
  });

  // Validate content body
  if (!contentBody) {
    logger.error(
      {
        lessonId: state.lessonSpec.lesson_id,
      },
      'Judge node: No valid content body to evaluate'
    );
    return null; // Signal validation failure
  }

  // Return initial context
  return {
    state,
    contentBody,
    startTime,
  };
}

/**
 * Phase 2: Execute cascade evaluation
 *
 * Runs the cascade evaluation (heuristics → single judge → CLEV)
 * and extracts the verdict. Handles synthetic verdict creation for
 * heuristic structural issues.
 *
 * @param context - Judge context
 * @returns Updated context with cascade result and verdict
 */
export async function runCascadeEvaluation(context: JudgeContext): Promise<JudgeContext> {
  const { state, contentBody } = context;

  // Build cascade input
  const cascadeInput: CascadeEvaluationInput = {
    lessonContent: contentBody,
    lessonSpec: state.lessonSpec,
    ragChunks: state.ragChunks,
    language: state.language,
  };

  logger.info(
    {
      lessonId: state.lessonSpec.lesson_id,
    },
    'Judge node: Executing cascade evaluation'
  );

  const cascadeResult = await import('../judge/cascade-evaluator').then(m =>
    m.executeCascadeEvaluation(cascadeInput)
  );

  // Extract verdict
  let verdict = cascadeResult.clevResult?.verdicts?.[0] ?? cascadeResult.singleJudgeVerdict ?? null;

  // Create synthetic verdict for heuristic structural issues
  verdict = createSyntheticVerdictIfNeeded(verdict, cascadeResult, contentBody, state);

  return {
    ...context,
    cascadeResult,
    verdict,
  };
}

/**
 * Create synthetic verdict for heuristic structural issues
 *
 * If no verdict but heuristic failures exist (e.g., missing sections),
 * creates a synthetic verdict to enable targeted refinement.
 *
 * @param verdict - Current verdict (may be null)
 * @param cascadeResult - Cascade evaluation result
 * @param contentBody - Content being evaluated
 * @param state - Graph state
 * @returns Verdict (original or synthetic)
 */
function createSyntheticVerdictIfNeeded(
  verdict: JudgeVerdict | null,
  cascadeResult: CascadeResult,
  contentBody: LessonContentBody,
  state: LessonGraphStateType
): JudgeVerdict | null {
  if (verdict || !cascadeResult.heuristicResults) {
    return verdict;
  }

  // Check for structural issues
  const structuralIssues = cascadeResult.heuristicResults.failureReasons.filter(r =>
    r.includes('Missing required sections')
  );

  if (structuralIssues.length === 0 || !contentBody) {
    return null;
  }

  // Parse missing section names
  const parsedIssues = structuralIssues.map(issue => {
    const colonIndex = issue.indexOf(':');
    const sectionPart = colonIndex > 0 ? issue.slice(colonIndex + 1).trim() : 'content';
    const sectionName = sectionPart.split(',')[0].trim().toLowerCase();

    // Map section names to valid section IDs
    let location: string;
    if (sectionName === 'exercises' || sectionName === 'examples') {
      location = 'sec_conclusion';
    } else if (sectionName === 'introduction' || sectionName === 'intro') {
      location = 'sec_introduction';
    } else if (sectionName === 'conclusion' || sectionName === 'summary') {
      location = 'sec_conclusion';
    } else {
      location = `sec_${sectionName || '1'}`;
    }

    return {
      description: issue,
      criterion: 'completeness' as const,
      severity: 'major' as const,
      location,
      suggestedFix: `Add the missing ${sectionName} section with appropriate content based on the lesson specification`,
    };
  });

  // Create synthetic verdict
  const syntheticVerdict: JudgeVerdict = {
    judgeModel: 'heuristic-fixer',
    overallScore: 0.78,
    confidence: 'high' as const,
    recommendation: 'ACCEPT_WITH_MINOR_REVISION' as JudgeRecommendation,
    criteriaScores: {
      learning_objective_alignment: 0.85,
      pedagogical_structure: 0.8,
      factual_accuracy: 0.9,
      clarity_readability: 0.85,
      engagement_examples: 0.8,
      completeness: 0.55,
    },
    issues: parsedIssues,
    strengths: [
      'Content quality is acceptable',
      'Most sections are complete',
      'Learning objectives addressed',
    ],
    temperature: 0.3,
    passed: false,
    durationMs: 0,
    tokensUsed: 0,
  };

  logger.info(
    {
      lessonId: state.lessonSpec.lesson_id,
      structuralIssues,
      parsedLocations: parsedIssues.map(i => i.location),
    },
    'Judge node: Created synthetic verdict for heuristic structural fix'
  );

  return syntheticVerdict;
}

/**
 * Phase 3: Make decision from verdict
 *
 * Uses decision engine to determine action based on verdict and context.
 *
 * @param context - Judge context with verdict
 * @returns Updated context with decision
 */
export async function makeJudgeDecision(context: JudgeContext): Promise<JudgeContext> {
  const { verdict, state } = context;

  if (!verdict) {
    logger.warn(
      {
        lessonId: state.lessonSpec.lesson_id,
        cascadeStage: context.cascadeResult?.stage,
      },
      'Judge node: No verdict from cascade evaluation'
    );

    return context; // Will handle in next phase
  }

  const makeDecisionFromVerdict = (await import('../judge/decision-engine'))
    .makeDecisionFromVerdict;

  const decision = makeDecisionFromVerdict(
    verdict,
    context.contentBody,
    state.refinementIterationCount,
    state.previousScores
  );

  logger.info(
    {
      lessonId: state.lessonSpec.lesson_id,
      action: decision.action,
      score: verdict.overallScore,
      confidence: verdict.confidence,
      reason: decision.reason,
    },
    'Judge node: Decision made'
  );

  return {
    ...context,
    decision,
  };
}

/**
 * Phase 4: Process decision action
 *
 * Executes the appropriate action based on decision:
 * - ACCEPT: Build final content
 * - TARGETED_FIX/ITERATIVE_REFINEMENT: Run targeted refinement
 * - REGENERATE: Mark for regeneration
 * - ESCALATE_TO_HUMAN: Mark for human review
 *
 * @param context - Judge context with decision
 * @returns Updated context with final content and recommendation
 */
export async function processJudgeDecision(context: JudgeContext): Promise<JudgeContext> {
  const { decision, verdict, state, contentBody } = context;

  if (!decision || !verdict) {
    // No decision possible, return context as-is
    return context;
  }

  let finalContent: LessonContent | null = null;
  let finalScore = verdict.overallScore;
  let finalRecommendation: JudgeRecommendation = verdict.recommendation;
  let needsRegeneration = false;
  let needsHumanReview = false;
  let refinementTokensUsed = 0;
  let arbiterOutput = null;

  switch (decision.action) {
    case DecisionAction.ACCEPT: {
      logger.info(
        {
          lessonId: state.lessonSpec.lesson_id,
          score: verdict.overallScore,
        },
        'Judge node: Content ACCEPTED'
      );

      finalContent = buildLessonContent(state, contentBody, verdict.overallScore);
      break;
    }

    case DecisionAction.TARGETED_FIX:
    case DecisionAction.ITERATIVE_REFINEMENT: {
      const refinementResult = await executeTargetedRefinementFlow(context, verdict, contentBody);

      finalContent = refinementResult.finalContent;
      finalScore = refinementResult.finalScore;
      finalRecommendation = refinementResult.finalRecommendation;
      needsRegeneration = refinementResult.needsRegeneration;
      needsHumanReview = refinementResult.needsHumanReview;
      refinementTokensUsed = refinementResult.refinementTokensUsed;
      arbiterOutput = refinementResult.arbiterOutput;
      break;
    }

    case DecisionAction.REGENERATE: {
      needsRegeneration = true;
      finalRecommendation = 'REGENERATE';

      logger.info(
        {
          lessonId: state.lessonSpec.lesson_id,
          score: verdict.overallScore,
          reason: decision.reason,
        },
        'Judge node: Content needs REGENERATION'
      );
      break;
    }

    case DecisionAction.ESCALATE_TO_HUMAN: {
      needsHumanReview = true;
      finalRecommendation = 'ESCALATE_TO_HUMAN';

      logger.info(
        {
          lessonId: state.lessonSpec.lesson_id,
          score: verdict.overallScore,
          confidence: verdict.confidence,
        },
        'Judge node: Escalating to HUMAN REVIEW'
      );
      break;
    }
  }

  return {
    ...context,
    finalContent,
    finalScore,
    finalRecommendation,
    needsRegeneration,
    needsHumanReview,
    refinementTokensUsed,
    arbiterOutput,
  };
}

/**
 * Phase 5: Finalize judge result
 *
 * Builds final state update including:
 * - Progress summary
 * - Review info
 * - Trace logging
 * - State updates
 *
 * @param context - Complete judge context
 * @returns Final state update object
 */
export async function finalizeJudgeResult(context: JudgeContext): Promise<LessonGraphStateUpdate> {
  const {
    state,
    startTime,
    cascadeResult,
    decision,
    finalContent,
    finalScore,
    finalRecommendation,
    needsRegeneration,
    needsHumanReview,
    refinementTokensUsed,
    arbiterOutput,
  } = context;

  const durationMs = Date.now() - startTime;
  const totalTokensUsed = (cascadeResult?.totalTokensUsed ?? 0) + (refinementTokensUsed ?? 0);

  // Build reviewInfo
  const reviewInfo = buildReviewInfo(needsHumanReview, cascadeResult);

  // Build enriched output
  const enrichedOutput = buildEnrichedJudgeOutput(
    cascadeResult!,
    state,
    needsRegeneration ?? false,
    needsHumanReview ?? false
  );

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
    },
    outputData: {
      finalRecommendation,
      finalScore,
      decisionAction: decision?.action,
      needsRegeneration,
      enrichedOutput,
    },
    tokensUsed: totalTokensUsed,
    durationMs,
  });

  // Build progress summary
  const completionProgress = buildJudgeProgressSummary(
    finalRecommendation!,
    cascadeResult!,
    decision?.action ?? null,
    state.language,
    durationMs,
    totalTokensUsed,
    (state.retryCount || 0) + 1,
    state.progressSummary
  );

  // Determine final lesson content
  const finalLessonContent =
    finalRecommendation === 'ACCEPT' || finalRecommendation === 'ACCEPT_WITH_MINOR_REVISION'
      ? finalContent
      : null;

  // Track targeted refinement usage
  const usedTargetedRefinement =
    decision?.action === DecisionAction.TARGETED_FIX ||
    decision?.action === DecisionAction.ITERATIVE_REFINEMENT;

  return {
    currentNode: 'judge',
    lessonContent: finalLessonContent,
    qualityScore: finalScore,
    judgeRecommendation: finalRecommendation,
    needsRegeneration,
    needsHumanReview,
    reviewInfo: reviewInfo ?? undefined,
    retryCount: needsRegeneration ? state.retryCount + 1 : state.retryCount,
    tokensUsed: totalTokensUsed,
    durationMs,
    progressSummary: completionProgress,
    ...(usedTargetedRefinement && {
      arbiterOutput,
      targetedRefinementStatus: finalContent ? ('accepted' as const) : ('escalated' as const),
      targetedRefinementTokensUsed: refinementTokensUsed,
    }),
  };
}
