/**
 * Main cascade evaluation orchestrator
 * @module stages/stage6-lesson-content/judge/cascade/orchestrator
 *
 * Implements efficient 3-stage cascading evaluation:
 * 1. Heuristic pre-filters (FREE) - filters 30-50% instantly
 * 2. Single cheap judge (50-70% of content passing Stage 1)
 * 3. CLEV voting (15-20% of content with low confidence)
 *
 * This approach optimizes cost by only invoking expensive CLEV voting
 * for borderline cases that require multiple judge consensus.
 */

import type { JudgeVerdict, JudgeConfidence } from '@megacampus/shared-types';
import { logger } from '@/shared/logger';
import { executeCLEVVoting, type CLEVEvaluationInput } from '../clev-voter';
import {
  executeFactualVerification,
  type FactualVerificationResult,
  DEFAULT_FACTUAL_VERIFICATION_CONFIG,
} from '../factual-verifier';
import { runHeuristicFilters } from './heuristic-helpers';
import { executeSingleJudge } from './single-judge';
import { DEFAULT_CASCADE_CONFIG, DEFAULT_HEURISTIC_THRESHOLDS } from './constants';
import type {
  CascadeEvaluationInput,
  CascadeConfig,
  CascadeResult,
  HeuristicResults,
} from './types';

/**
 * Extract text content from lesson body (for factual verification)
 */
function extractTextContent(content: CascadeEvaluationInput['lessonContent']): string {
  const parts: string[] = [];

  if (content.intro) {
    parts.push(content.intro);
  }

  for (const section of content.sections) {
    parts.push(section.title);
    parts.push(section.content);
  }

  for (const example of content.examples) {
    parts.push(example.title);
    parts.push(example.content);
    if (example.code) {
      parts.push(example.code);
    }
  }

  for (const exercise of content.exercises) {
    parts.push(exercise.question);
    if (exercise.hints) {
      parts.push(...exercise.hints);
    }
    if (exercise.solution) {
      parts.push(exercise.solution);
    }
  }

  return parts.join(' ');
}

/**
 * Execute cascading evaluation
 *
 * Three-stage cascade for cost-efficient content evaluation:
 *
 * Stage 1: Heuristic pre-filters (FREE)
 * - Length checks (min/max word count)
 * - Flesch-Kincaid readability (target grade level)
 * - Keyword coverage (required terms present)
 * - Structure validation (sections present)
 * - Filters 30-50% of content instantly
 *
 * Stage 2: Single cheap judge (50-70% of content passing Stage 1)
 * - If confidence score >= threshold -> ACCEPT/REJECT
 * - If confidence score < threshold -> proceed to Stage 3
 *
 * Stage 3: CLEV conditional 3x voting (15-20% of content)
 * - Invoked only for low-confidence cases
 * - Full CLEV voting with consensus
 *
 * @param input - Evaluation input (lesson content, spec, RAG chunks)
 * @param config - Cascade configuration (optional, uses defaults)
 * @returns CascadeResult with final verdict and stage information
 */
export async function executeCascadeEvaluation(
  input: CascadeEvaluationInput,
  config: Partial<CascadeConfig> = {}
): Promise<CascadeResult> {
  const finalConfig: CascadeConfig = {
    ...DEFAULT_CASCADE_CONFIG,
    ...config,
    heuristicThresholds: {
      ...DEFAULT_HEURISTIC_THRESHOLDS,
      ...config.heuristicThresholds,
    },
    factualVerificationConfig: {
      ...DEFAULT_FACTUAL_VERIFICATION_CONFIG,
      ...config.factualVerificationConfig,
    },
  };

  const startTime = Date.now();
  let totalTokensUsed = 0;

  logger.info({
    msg: 'Starting cascade evaluation',
    lessonId: input.lessonSpec.lesson_id,
    skipHeuristics: finalConfig.skipHeuristics,
    skipSingleJudge: finalConfig.skipSingleJudge,
    confidenceThreshold: finalConfig.singleJudgeConfidenceThreshold,
  });

  // =========================================================================
  // STAGE 1: Heuristic Pre-filters (FREE)
  // =========================================================================

  let heuristicResults: HeuristicResults | undefined;

  if (!finalConfig.skipHeuristics) {
    // Pass language to heuristic filters - Flesch-Kincaid is skipped for non-English
    const language = input.language || 'en';
    heuristicResults = runHeuristicFilters(
      input.lessonContent,
      input.lessonSpec,
      finalConfig.heuristicThresholds,
      language
    );

    if (!heuristicResults.passed) {
      logger.info({
        msg: 'Content failed heuristic pre-filters, recommending REGENERATE',
        lessonId: input.lessonSpec.lesson_id,
        failureReasons: heuristicResults.failureReasons,
      });

      return {
        stage: 'heuristic',
        passed: false,
        heuristicResults,
        finalScore: 0,
        finalRecommendation: 'REGENERATE',
        totalTokensUsed: 0,
        totalDurationMs: Date.now() - startTime,
        costSavingsRatio: 1.0, // 100% savings - no LLM calls
      };
    }

    logger.info({
      msg: 'Content passed heuristic pre-filters, proceeding to factual verification',
      lessonId: input.lessonSpec.lesson_id,
    });
  }

  // =========================================================================
  // STAGE 1.5: Factual Verification against RAG (FREE - no LLM calls)
  // =========================================================================

  let factualVerificationResult: FactualVerificationResult | undefined;

  if (!finalConfig.skipFactualVerification && input.ragChunks.length > 0) {
    const textContent = extractTextContent(input.lessonContent);

    factualVerificationResult = executeFactualVerification(
      textContent,
      input.ragChunks,
      undefined, // No entropy result yet - could be added later
      finalConfig.factualVerificationConfig
    );

    logger.info({
      msg: 'Factual verification complete',
      lessonId: input.lessonSpec.lesson_id,
      accuracyScore: factualVerificationResult.overallAccuracyScore.toFixed(3),
      claimsVerified: factualVerificationResult.verifiedClaims,
      claimsContradicted: factualVerificationResult.contradictedClaims,
      claimsUnverified: factualVerificationResult.unverifiedClaims,
      requiresHumanReview: factualVerificationResult.requiresHumanReview,
    });

    // Factual verification failure logic:
    // - FAIL if there are actual contradictions with source material
    // - PASS if only "no evidence" claims (unverifiable ≠ wrong)
    // - Log warning for review but don't block generation
    const hasActualContradictions = factualVerificationResult.contradictedClaims > 0;
    const hasSignificantUnverified = factualVerificationResult.unverifiedClaims > 2;

    if (hasActualContradictions) {
      logger.warn({
        msg: 'Content failed factual verification - contradictions found with source materials',
        lessonId: input.lessonSpec.lesson_id,
        accuracyScore: factualVerificationResult.overallAccuracyScore,
        minRequired: finalConfig.minFactualAccuracyScore,
        contradictedClaims: factualVerificationResult.contradictedClaims,
        flaggedSentences: factualVerificationResult.flaggedSentences.slice(0, 3),
      });

      return {
        stage: 'heuristic', // Still considered heuristic stage (pre-LLM)
        passed: false,
        heuristicResults,
        factualVerificationResult,
        finalScore: factualVerificationResult.overallAccuracyScore,
        finalRecommendation: 'REGENERATE',
        totalTokensUsed: 0,
        totalDurationMs: Date.now() - startTime,
        costSavingsRatio: 1.0, // 100% savings - no LLM calls
      };
    }

    // Log info when claims couldn't be verified (but no contradictions)
    if (factualVerificationResult.noEvidenceClaims > 0 || hasSignificantUnverified) {
      logger.info({
        msg: 'Factual verification: some claims unverifiable (no contradictions found)',
        lessonId: input.lessonSpec.lesson_id,
        noEvidenceClaims: factualVerificationResult.noEvidenceClaims,
        unverifiedClaims: factualVerificationResult.unverifiedClaims,
        note: 'Proceeding to LLM judge - no factual errors detected',
      });
    }
  } else if (!finalConfig.skipFactualVerification && input.ragChunks.length === 0) {
    logger.debug({
      msg: 'Skipping factual verification - no RAG chunks available',
      lessonId: input.lessonSpec.lesson_id,
    });
  }

  // =========================================================================
  // STAGE 2: Single Cheap Judge (50-70% of content)
  // =========================================================================

  let singleJudgeVerdict: JudgeVerdict | undefined;

  if (!finalConfig.skipSingleJudge) {
    singleJudgeVerdict = (await executeSingleJudge(input, finalConfig)) || undefined;

    if (singleJudgeVerdict) {
      totalTokensUsed += singleJudgeVerdict.tokensUsed;

      // Check confidence threshold
      const confidenceRank: Record<JudgeConfidence, number> = { high: 2, medium: 1, low: 0 };
      const isHighConfidence = confidenceRank[singleJudgeVerdict.confidence] >= 1; // medium or high
      const isAboveThreshold =
        singleJudgeVerdict.overallScore >= finalConfig.singleJudgeConfidenceThreshold ||
        singleJudgeVerdict.overallScore < 1 - finalConfig.singleJudgeConfidenceThreshold;

      if (isHighConfidence && isAboveThreshold) {
        logger.info({
          msg: 'Single judge verdict accepted with high confidence',
          lessonId: input.lessonSpec.lesson_id,
          score: singleJudgeVerdict.overallScore,
          confidence: singleJudgeVerdict.confidence,
          recommendation: singleJudgeVerdict.recommendation,
        });

        return {
          stage: 'single_judge',
          passed: singleJudgeVerdict.passed,
          heuristicResults,
          factualVerificationResult,
          singleJudgeVerdict,
          finalScore: singleJudgeVerdict.overallScore,
          finalRecommendation: singleJudgeVerdict.recommendation,
          totalTokensUsed,
          totalDurationMs: Date.now() - startTime,
          costSavingsRatio: 0.67, // 67% savings - 1 judge instead of 3
        };
      }

      logger.info({
        msg: 'Single judge has low confidence, proceeding to CLEV voting',
        lessonId: input.lessonSpec.lesson_id,
        score: singleJudgeVerdict.overallScore,
        confidence: singleJudgeVerdict.confidence,
      });
    } else {
      logger.warn({
        msg: 'Single judge failed, proceeding to CLEV voting',
        lessonId: input.lessonSpec.lesson_id,
      });
    }
  }

  // =========================================================================
  // STAGE 3: CLEV Voting (15-20% of content)
  // =========================================================================

  const clevInput: CLEVEvaluationInput = {
    lessonContent: input.lessonContent,
    lessonSpec: input.lessonSpec,
    ragChunks: input.ragChunks,
    language: input.language,
  };

  const clevResult = await executeCLEVVoting(clevInput, {
    rubric: finalConfig.rubric,
  });

  // Sum tokens from all CLEV verdicts
  const clevTokens = clevResult.verdicts.reduce((sum, v) => sum + v.tokensUsed, 0);
  totalTokensUsed += clevTokens;

  logger.info({
    msg: 'CLEV voting complete',
    lessonId: input.lessonSpec.lesson_id,
    aggregatedScore: clevResult.aggregatedScore,
    finalRecommendation: clevResult.finalRecommendation,
    votingMethod: clevResult.votingMethod,
    consensusReached: clevResult.consensusReached,
    judgesUsed: clevResult.verdicts.length,
  });

  return {
    stage: 'clev_voting',
    passed: clevResult.aggregatedScore >= (finalConfig.rubric?.passingThreshold ?? 0.7),
    heuristicResults,
    factualVerificationResult,
    singleJudgeVerdict,
    clevResult,
    finalScore: clevResult.aggregatedScore,
    finalRecommendation: clevResult.finalRecommendation,
    totalTokensUsed,
    totalDurationMs: Date.now() - startTime,
    costSavingsRatio: 0, // No savings - full CLEV voting
  };
}

// Re-export CLEV voting and factual verification for convenience
export { executeCLEVVoting, selectJudgeModels } from '../clev-voter';
export {
  executeFactualVerification,
  getFactualVerificationSummary,
  type FactualVerificationResult,
  type FactualVerificationConfig,
} from '../factual-verifier';
