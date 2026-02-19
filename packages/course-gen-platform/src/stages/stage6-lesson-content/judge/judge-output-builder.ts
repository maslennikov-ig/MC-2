import type { LessonGraphStateType } from '../state';
import type { JudgeRecommendation } from '@megacampus/shared-types/judge-types';
import type { CascadeResult, CascadeStage } from './cascade-evaluator';
import { logger } from '@/shared/logger';

/**
 * Return type for buildEnrichedJudgeOutput
 */
export type EnrichedJudgeOutput = {
  cascadeStage: CascadeStage;
  stageReason: string;
  heuristics: {
    passed: boolean;
    wordCount?: number;
    fleschKincaid?: number;
    examplesCount?: number;
    exercisesCount?: number;
    failureReasons: string[];
  } | null;
  singleJudge: {
    model: string;
    score: number;
    confidence: 'high' | 'medium' | 'low';
    criteriaScores: Record<string, number>;
    issues: Array<{
      criterion: string;
      severity: string;
      location: string;
      description: string;
      quotedText?: string;
      suggestedFix: string;
    }>;
    strengths: string[];
    recommendation: JudgeRecommendation;
  } | null;
  votes?: Array<{
    judge_id: string;
    model_id: string;
    model_display_name: string;
    verdict: JudgeRecommendation;
    score: number;
    coherence: number;
    accuracy: number;
    completeness: number;
    readability: number;
    reasoning: string | undefined;
    evaluated_at: string;
  }>;
  consensus_method?: string;
  is_third_judge_invoked: boolean;
  heuristics_passed: boolean;
  heuristics_issues: string[];
  finalRecommendation: JudgeRecommendation;
  final_verdict: JudgeRecommendation;
  qualityScore: number;
  needsRegeneration: boolean;
  needsHumanReview: boolean;
  retryCount: number;
  costSavingsRatio: number;
};

/**
 * Simple cache for last enriched judge output
 * Since this function is called once per judge execution (not on every render),
 * we cache the last result to avoid redundant computation if called multiple times
 * with the same inputs.
 */
let lastEnrichedJudgeOutputCache: {
  key: string;
  result: EnrichedJudgeOutput;
} | null = null;

/**
 * Build enriched judge output data for trace logging
 * Transforms cascade evaluation results into UI-friendly format
 */
export function buildEnrichedJudgeOutput(
  cascadeResult: CascadeResult,
  state: LessonGraphStateType,
  needsRegeneration: boolean,
  needsHumanReview: boolean
): EnrichedJudgeOutput {
  // Input validation
  if (!cascadeResult || !cascadeResult.stage) {
    logger.warn(
      {
        hasCascadeResult: Boolean(cascadeResult),
        stage: cascadeResult?.stage,
      },
      'buildEnrichedJudgeOutput: Invalid cascadeResult'
    );
    return {
      cascadeStage: 'heuristic' as const,
      stageReason: 'Invalid cascade result - defaulting to heuristic',
      heuristics: null,
      singleJudge: null,
      votes: undefined,
      consensus_method: undefined,
      is_third_judge_invoked: false,
      heuristics_passed: false,
      heuristics_issues: ['Invalid cascade result'],
      finalRecommendation: 'REGENERATE',
      final_verdict: 'REGENERATE',
      qualityScore: 0,
      needsRegeneration: true,
      needsHumanReview: false,
      retryCount: state?.retryCount ?? 0,
      costSavingsRatio: 1,
    };
  }

  // Create cache key from inputs
  const cacheKey = `${cascadeResult.stage}-${state.retryCount}-${needsRegeneration}-${needsHumanReview}-${cascadeResult.finalScore}`;

  // Check cache
  if (lastEnrichedJudgeOutputCache?.key === cacheKey) {
    logger.debug({ cacheKey }, 'buildEnrichedJudgeOutput: Using cached result');
    return lastEnrichedJudgeOutputCache.result;
  }

  // Compute stage reason
  const stageReasonMap: Record<CascadeStage, string> = {
    heuristic: 'Failed heuristic pre-filters',
    single_judge: 'High confidence single judge decision',
    clev_voting: 'CLEV voting consensus',
  };
  const stageReason = stageReasonMap[cascadeResult.stage];

  // Build heuristics data
  const heuristics = cascadeResult.heuristicResults
    ? {
        passed: cascadeResult.heuristicResults.passed,
        wordCount: cascadeResult.heuristicResults.wordCount,
        fleschKincaid: cascadeResult.heuristicResults.fleschKincaid,
        examplesCount: cascadeResult.heuristicResults.examplesCount,
        exercisesCount: cascadeResult.heuristicResults.exercisesCount,
        failureReasons: cascadeResult.heuristicResults.failureReasons,
      }
    : null;

  // Build single judge data
  const singleJudge = cascadeResult.singleJudgeVerdict
    ? {
        model: cascadeResult.singleJudgeVerdict.judgeModel,
        score: cascadeResult.singleJudgeVerdict.overallScore,
        confidence: cascadeResult.singleJudgeVerdict.confidence,
        criteriaScores: cascadeResult.singleJudgeVerdict.criteriaScores,
        issues: cascadeResult.singleJudgeVerdict.issues,
        strengths: cascadeResult.singleJudgeVerdict.strengths,
        recommendation: cascadeResult.singleJudgeVerdict.recommendation,
      }
    : null;

  // Build CLEV votes array for UI
  const votes = cascadeResult.clevResult
    ? cascadeResult.clevResult.verdicts.map(v => ({
        judge_id: v.judgeModel || 'unknown',
        model_id: v.judgeModel,
        model_display_name: v.judgeModel || 'Unknown Model',
        verdict: v.recommendation,
        score: v.overallScore,
        coherence: v.criteriaScores?.clarity_readability ?? v.overallScore,
        accuracy: v.criteriaScores?.factual_accuracy ?? v.overallScore,
        completeness: v.criteriaScores?.completeness ?? v.overallScore,
        readability: v.criteriaScores?.clarity_readability ?? v.overallScore,
        reasoning: v.strengths?.join('; '),
        evaluated_at: new Date().toISOString(),
      }))
    : undefined;

  const result = {
    // Cascade info
    cascadeStage: cascadeResult.stage,
    stageReason,

    // Heuristic results
    heuristics,

    // Single judge results
    singleJudge,

    // CLEV results
    votes,

    // Voting metadata
    consensus_method: cascadeResult.clevResult?.votingMethod,
    is_third_judge_invoked: cascadeResult.clevResult
      ? cascadeResult.clevResult.verdicts.length > 2
      : false,

    // Heuristics for backward compat
    heuristics_passed: cascadeResult.heuristicResults?.passed ?? true,
    heuristics_issues: cascadeResult.heuristicResults?.failureReasons ?? [],

    // Decision
    finalRecommendation: cascadeResult.finalRecommendation,
    final_verdict: cascadeResult.finalRecommendation,
    qualityScore: cascadeResult.finalScore,
    needsRegeneration,
    needsHumanReview,

    // Retry info
    retryCount: state.retryCount,

    // Metrics
    costSavingsRatio: cascadeResult.costSavingsRatio,
  };

  // Cache result before returning
  lastEnrichedJudgeOutputCache = { key: cacheKey, result };

  return result;
}

/**
 * Extract unique model identifiers from an enriched judge output.
 * Collects the single judge model (if present) and all CLEV vote model IDs.
 */
export function extractJudgeModels(
  enrichedOutput: ReturnType<typeof buildEnrichedJudgeOutput>
): string[] {
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
