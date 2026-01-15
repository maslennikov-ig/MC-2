import type { LessonGraphStateType, LessonGraphStateUpdate } from '../state';
import type { LessonContent } from '@megacampus/shared-types/lesson-content';
import type {
  JudgeRecommendation,
  JudgeVerdict,
  ArbiterInput,
} from '@megacampus/shared-types/judge-types';
import {
  executeCascadeEvaluation,
  type CascadeEvaluationInput,
  type CascadeResult,
} from '../judge/cascade-evaluator';
import {
  makeDecisionFromVerdict,
  DecisionAction,
  type DecisionResult,
} from '../judge/decision-engine';
import {
  executeTargetedRefinement,
  type TargetedRefinementInput,
  type TargetedRefinementOutput,
} from '../judge/targeted-refinement';
import { consolidateVerdicts } from '../judge/arbiter';
import { logger } from '@/shared/logger';
import { logTrace } from '@/shared/trace-logger';
import { extractContentBody, buildLessonContent } from '../judge/judge-helpers';
import { buildEnrichedJudgeOutput } from '../judge/judge-output-builder';
import { buildJudgeProgressSummary } from '../judge/judge-progress';

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

  // Extract content body for evaluation
  const contentBody = extractContentBody(state);

  if (!contentBody) {
    logger.error(
      {
        lessonId: state.lessonSpec.lesson_id,
      },
      'Judge node: No valid content body to evaluate'
    );

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
    // =========================================================================
    // STEP 1: Execute Cascade Evaluation
    // =========================================================================

    // Use authoritative language from state (passed from database via job data)
    // This is critical for Flesch-Kincaid readability which only works for English
    const cascadeInput: CascadeEvaluationInput = {
      lessonContent: contentBody,
      lessonSpec: state.lessonSpec,
      ragChunks: state.ragChunks,
      language: state.language, // Use state.language instead of heuristic detection
    };

    logger.info(
      {
        lessonId: state.lessonSpec.lesson_id,
      },
      'Judge node: Executing cascade evaluation'
    );

    const cascadeResult: CascadeResult = await executeCascadeEvaluation(cascadeInput);

    // Extract verdict for decision making
    let verdict =
      cascadeResult.clevResult?.verdicts?.[0] ?? cascadeResult.singleJudgeVerdict ?? null;

    // If no verdict but heuristic failures exist, create synthetic verdict for targeted fix
    if (!verdict && cascadeResult.heuristicResults) {
      // Check for structural issues that can be fixed with targeted refinement
      const structuralIssues = cascadeResult.heuristicResults.failureReasons.filter(r =>
        r.includes('Missing required sections')
      );

      if (structuralIssues.length > 0 && contentBody) {
        // Parse missing section names from failure reasons
        // Format: "Missing required sections: conclusion, examples"
        const parsedIssues = structuralIssues.map(issue => {
          // Extract section name after colon
          const colonIndex = issue.indexOf(':');
          const sectionPart = colonIndex > 0 ? issue.slice(colonIndex + 1).trim() : 'content';
          // Take first section name if multiple
          const sectionName = sectionPart.split(',')[0].trim().toLowerCase();

          // Map section names to valid section IDs to avoid sec_global fallback
          // exercises → sec_conclusion (exercises are typically at the end)
          // introduction/intro → sec_introduction
          // conclusion/summary → sec_conclusion
          let location: string;
          if (sectionName === 'exercises' || sectionName === 'examples') {
            location = 'sec_conclusion'; // Exercises go at the end of the lesson
          } else if (sectionName === 'introduction' || sectionName === 'intro') {
            location = 'sec_introduction';
          } else if (sectionName === 'conclusion' || sectionName === 'summary') {
            location = 'sec_conclusion';
          } else {
            location = `sec_${sectionName || '1'}`; // Fallback to first section
          }

          return {
            description: issue,
            // Use 'completeness' criterion - this triggers REGENERATE_SECTION in arbiter
            // (pedagogical_structure with major severity would trigger SURGICAL_EDIT)
            criterion: 'completeness' as const,
            severity: 'major' as const,
            location,
            suggestedFix: `Add the missing ${sectionName} section with appropriate content based on the lesson specification`,
          };
        });

        // Create synthetic verdict for targeted fix
        // Score 0.78 is in the 0.75-0.90 range which triggers TARGETED_FIX for localized issues
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
            completeness: 0.55, // Low score for completeness issue (missing sections)
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

        // Assign synthetic verdict to be used by decision engine
        verdict = syntheticVerdict;

        logger.info(
          {
            lessonId: state.lessonSpec.lesson_id,
            structuralIssues,
            parsedLocations: parsedIssues.map(i => i.location),
          },
          'Judge node: Created synthetic verdict for heuristic structural fix'
        );
      }
    }

    if (!verdict) {
      logger.warn(
        {
          lessonId: state.lessonSpec.lesson_id,
          cascadeStage: cascadeResult.stage,
        },
        'Judge node: No verdict from cascade evaluation'
      );

      // Use cascade result to make a synthetic decision
      const recommendation = cascadeResult.finalRecommendation;
      const needsRegeneration = recommendation === 'REGENERATE';
      const needsHumanReview = recommendation === 'ESCALATE_TO_HUMAN';
      const durationMs = Date.now() - startTime;

      // Build enriched output for trace
      const enrichedOutput = buildEnrichedJudgeOutput(
        cascadeResult,
        state,
        needsRegeneration,
        needsHumanReview
      );

      // Log trace at completion (even for synthetic decision)
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
        outputData: enrichedOutput,
        tokensUsed: cascadeResult.totalTokensUsed,
        durationMs,
      });

      const syntheticProgress = buildJudgeProgressSummary(
        recommendation,
        cascadeResult,
        null,
        state.language,
        durationMs,
        cascadeResult.totalTokensUsed,
        (state.retryCount || 0) + 1,
        state.progressSummary
      );

      return {
        currentNode: 'judge',
        qualityScore: cascadeResult.finalScore,
        judgeRecommendation: recommendation,
        needsRegeneration,
        needsHumanReview,
        // Clear lessonContent if regeneration needed to allow retry
        lessonContent: needsRegeneration ? null : state.lessonContent,
        // Increment retryCount if regeneration needed
        retryCount: needsRegeneration ? state.retryCount + 1 : state.retryCount,
        tokensUsed: cascadeResult.totalTokensUsed,
        durationMs,
        progressSummary: syntheticProgress,
      };
    }

    // =========================================================================
    // STEP 2: Make Decision Based on Verdict
    // =========================================================================

    const decision: DecisionResult = makeDecisionFromVerdict(
      verdict,
      contentBody,
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

    // =========================================================================
    // STEP 3: Handle Decision Actions
    // =========================================================================

    let finalContent: LessonContent | null = null;
    let finalScore = verdict.overallScore;
    let finalRecommendation: JudgeRecommendation = verdict.recommendation;
    let needsRegeneration = false;
    let needsHumanReview = false;
    let refinementTokensUsed = 0;
    let arbiterOutput = null;

    switch (decision.action) {
      case DecisionAction.ACCEPT: {
        // Content accepted - build final LessonContent
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
        // Execute targeted refinement with arbiter consolidation
        logger.info(
          {
            lessonId: state.lessonSpec.lesson_id,
            action: decision.action,
          },
          'Judge node: Starting targeted refinement'
        );

        // Get operation mode from state (default: full-auto)
        const operationMode = state.targetedRefinementMode ?? 'full-auto';

        // Consolidate verdicts to create refinement plan
        const arbiterInput: ArbiterInput = {
          clevResult: cascadeResult.clevResult ?? {
            verdicts: verdict ? [verdict] : [],
            aggregatedScore: verdict?.overallScore ?? 0,
            finalRecommendation: verdict?.recommendation ?? 'REGENERATE',
            votingMethod: 'majority',
            consensusReached: false,
          },
          lessonContent: contentBody,
          operationMode,
        };

        arbiterOutput = await consolidateVerdicts(arbiterInput);

        // Build temporary LessonContent for refinement
        const tempLessonContent = buildLessonContent(state, contentBody, verdict.overallScore);

        // Execute targeted refinement
        const refinementInput: TargetedRefinementInput = {
          content: tempLessonContent,
          arbiterOutput,
          operationMode,
          ragChunks: state.ragChunks,
          lessonSpec: state.lessonSpec,
          language: state.language,
        };

        const refinementResult: TargetedRefinementOutput =
          await executeTargetedRefinement(refinementInput);

        refinementTokensUsed = refinementResult.tokensUsed;

        if (
          refinementResult.status === 'accepted' ||
          refinementResult.status === 'accepted_warning'
        ) {
          finalContent = refinementResult.content;
          finalScore = refinementResult.finalScore;
          finalRecommendation =
            refinementResult.status === 'accepted' ? 'ACCEPT' : 'ACCEPT_WITH_MINOR_REVISION';

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
        } else if (refinementResult.status === 'best_effort') {
          finalContent = refinementResult.content;
          finalScore = refinementResult.finalScore;
          finalRecommendation = 'ACCEPT_WITH_MINOR_REVISION';

          logger.info(
            {
              lessonId: state.lessonSpec.lesson_id,
              finalScore: refinementResult.finalScore,
              qualityStatus: refinementResult.bestEffortResult?.qualityStatus,
            },
            'Judge node: Targeted refinement returned best-effort'
          );
        } else {
          // Escalated status handling:
          // - In semi-auto mode: escalate to human review
          // - In full-auto mode with no work done: if original CLEV score >= 0.75, accept with warning
          const noWorkDone =
            refinementResult.iterations <= 1 &&
            refinementResult.tokensUsed <= arbiterOutput.tokensUsed;
          const originalScoreIsGood = verdict.overallScore >= 0.75;

          if (operationMode === 'full-auto' && noWorkDone && originalScoreIsGood) {
            // Arbiter rejected all issues but CLEV score was good - accept the original content
            // FIX: Use buildLessonContent instead of state.lessonContent which may be null
            // state.lessonContent is only set when content is ACCEPTED, not during the evaluation flow
            finalContent = buildLessonContent(state, contentBody, verdict.overallScore);
            finalScore = verdict.overallScore;
            finalRecommendation = 'ACCEPT_WITH_MINOR_REVISION';

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
          } else {
            needsRegeneration =
              refinementResult.status === 'escalated' && operationMode === 'semi-auto';
            needsHumanReview =
              refinementResult.status === 'escalated' && operationMode === 'semi-auto';
            finalRecommendation = needsRegeneration ? 'REGENERATE' : 'ESCALATE_TO_HUMAN';

            logger.warn(
              {
                lessonId: state.lessonSpec.lesson_id,
                status: refinementResult.status,
                finalScore: refinementResult.finalScore,
              },
              'Judge node: Targeted refinement escalated'
            );
          }
        }
        break;
      }

      case DecisionAction.REGENERATE: {
        // Content needs complete regeneration
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
        // Requires human review
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

    // =========================================================================
    // STEP 4: Return Updated State
    // =========================================================================

    const durationMs = Date.now() - startTime;
    const totalTokensUsed = cascadeResult.totalTokensUsed + refinementTokensUsed;

    // Build reviewInfo for UI warnings
    const factualResult = cascadeResult.factualVerificationResult;
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
        reviewReasons.push(
          `${factualResult.noEvidenceClaims} claim(s) have no evidence in sources`
        );
      }
    }

    const reviewInfo =
      reviewReasons.length > 0
        ? {
            needsReview: true,
            reasons: reviewReasons,
            factualAccuracyScore: factualResult?.overallAccuracyScore,
            unverifiedClaims:
              (factualResult?.unverifiedClaims ?? 0) + (factualResult?.noEvidenceClaims ?? 0),
          }
        : null;

    // Build enriched output for trace
    const enrichedOutput = buildEnrichedJudgeOutput(
      cascadeResult,
      state,
      needsRegeneration,
      needsHumanReview
    );

    // Log trace at completion
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
        decisionAction: decision.action,
        needsRegeneration,
        enrichedOutput,
      },
      tokensUsed: totalTokensUsed,
      durationMs,
    });

    const completionProgress = buildJudgeProgressSummary(
      finalRecommendation,
      cascadeResult,
      decision.action,
      state.language,
      durationMs,
      totalTokensUsed,
      (state.retryCount || 0) + 1,
      state.progressSummary
    );

    // Only set lessonContent if ACCEPTED (or minor revisions)
    // For REGENERATE or ESCALATE_TO_HUMAN, we might keep partial state or clear it
    const finalLessonContent =
      finalRecommendation === 'ACCEPT' || finalRecommendation === 'ACCEPT_WITH_MINOR_REVISION'
        ? finalContent
        : null;

    // If iterative refinement was used, we need to track it
    const usedTargetedRefinement =
      decision.action === DecisionAction.TARGETED_FIX ||
      decision.action === DecisionAction.ITERATIVE_REFINEMENT;

    return {
      currentNode: 'judge',
      lessonContent: finalLessonContent,
      qualityScore: finalScore,
      judgeRecommendation: finalRecommendation,
      needsRegeneration,
      needsHumanReview,
      reviewInfo: reviewInfo ?? undefined,
      // Increment retryCount if regeneration needed
      retryCount: needsRegeneration ? state.retryCount + 1 : state.retryCount,
      tokensUsed: totalTokensUsed,
      durationMs,
      progressSummary: completionProgress,
      // Targeted refinement state updates (only if used)
      ...(usedTargetedRefinement && {
        arbiterOutput,
        targetedRefinementStatus: finalContent ? ('accepted' as const) : ('escalated' as const),
        targetedRefinementTokensUsed: refinementTokensUsed,
      }),
    };
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
