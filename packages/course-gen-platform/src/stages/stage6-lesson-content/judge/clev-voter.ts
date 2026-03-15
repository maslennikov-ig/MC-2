/**
 * CLEV (Consensus via Lightweight Efficient Voting) Orchestrator for LLM Judge
 * @module stages/stage6-lesson-content/judge/clev-voter
 *
 * Implements the CLEV voting pattern for cost-efficient content evaluation:
 * 1. Start with 2 judges from different model families (in parallel)
 * 2. If scores agree (within threshold), return result (70-85% of cases, 67% cost savings)
 * 3. If disagreement, invoke 3rd judge as tiebreaker
 *
 * Vote aggregation uses weighted mean based on model historical accuracy:
 * - Formula: w_i = 1 / (1 + exp(-accuracy_i))
 * - Weights: Minimax M2.5 (0.76), Qwen3.5 Plus (0.75), GLM-5 (0.74)
 *
 * Reference:
 * - docs/research/010-stage6-generation-strategy/ (CLEV research)
 * - specs/010-stages-456-pipeline/data-model.md
 */

import type {
  JudgeVerdict,
  JudgeAggregatedResult,
  CriteriaScores,
  JudgeConfidence,
  JudgeIssue,
} from '@megacampus/shared-types';
import { determineRecommendation } from '@megacampus/shared-types';
import { DEFAULT_OSCQR_RUBRIC, type OSCQRRubric } from '@megacampus/shared-types';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { RAGChunk, LessonContentBody } from '@megacampus/shared-types/lesson-content';
import { LLMClient, type LLMResponse } from '@/shared/llm';
import { logger } from '@/shared/logger';
import { safeJSONParse } from '@megacampus/shared-utils';
import { createModelConfigService } from '@/shared/llm/model-config-service';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Judge model configuration for CLEV voting
 *
 * Each model has a specific role and historical accuracy-based weight.
 */
export interface JudgeModelConfig {
  /** OpenRouter model identifier */
  modelId: string;
  /** Historical accuracy-based weight (0-1) */
  weight: number;
  /** Temperature for evaluation (recommended: 0.1 for consistency) */
  temperature: number;
  /** Maximum output tokens */
  maxTokens: number;
  /** Role in CLEV voting */
  role: 'primary' | 'secondary' | 'tiebreaker';
  /** Human-readable name for logging */
  displayName: string;
}

/**
 * CLEV Voter configuration
 */
export interface CLEVVoterConfig {
  /**
   * Agreement threshold - scores must be within this delta to be considered agreed.
   * Default: 0.1 (10% difference allowed)
   */
  agreementThreshold: number;
  /**
   * Minimum confidence level to skip 3rd judge on agreement.
   * If both judges have confidence >= this level and agree, skip tiebreaker.
   */
  minConfidence: JudgeConfidence;
  /**
   * Maximum total tokens across all judges (budget control).
   */
  maxTotalTokens: number;
  /**
   * Custom rubric (uses DEFAULT_OSCQR_RUBRIC if not provided).
   */
  rubric?: OSCQRRubric;
}

/**
 * Input for CLEV voting evaluation
 */
export interface CLEVEvaluationInput {
  /** Lesson content to evaluate */
  lessonContent: LessonContentBody;
  /** Lesson specification for context */
  lessonSpec: LessonSpecificationV2;
  /** RAG chunks used in generation for fact verification */
  ragChunks: RAGChunk[];
  /** Content language for judge selection ('ru' for Russian, others default to 'en') */
  language?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// NOTE: All hardcoded model constants have been removed.
// Model selection is now entirely database-driven via ModelConfigService.
// See: packages/course-gen-platform/src/shared/llm/model-config-service.ts

/**
 * Select judge models based on generation language (DATABASE-DRIVEN)
 *
 * Queries ModelConfigService for judge models using Stale-While-Revalidate pattern:
 * 1. Try exact language match (e.g., 'ru')
 * 2. If not found, try 'any' as fallback
 * 3. Uses stale cache if database unavailable
 * 4. Throws explicit error if no cache and database unavailable
 *
 * RULE: Judges must be DIFFERENT from the generation model to avoid self-evaluation bias.
 * - Judges: minimax-m2.5 (primary), glm-5 (secondary), qwen3.5-plus (tiebreaker)
 * - All judges are language-agnostic (same for any content language)
 *
 * @param language - Content language ('ru' for Russian, anything else for other)
 * @returns CLEV judge configuration (primary, secondary, tiebreaker)
 * @throws Error if database unavailable and no cached data exists
 */
export async function selectJudgeModels(
  language: string
): Promise<Record<'primary' | 'secondary' | 'tiebreaker', JudgeModelConfig>> {
  // Database lookup via ModelConfigService - throws on error (no hardcoded fallback)
  const modelConfigService = createModelConfigService();
  const judgeModelsResult = await modelConfigService.getJudgeModels(language);

  logger.info(
    {
      language,
      primary: judgeModelsResult.primary.modelId,
      secondary: judgeModelsResult.secondary.modelId,
      tiebreaker: judgeModelsResult.tiebreaker.modelId,
      source: judgeModelsResult.source,
    },
    'Judge models loaded via ModelConfigService'
  );

  // Map to expected format
  return {
    primary: {
      modelId: judgeModelsResult.primary.modelId,
      weight: judgeModelsResult.primary.weight,
      temperature: judgeModelsResult.primary.temperature,
      maxTokens: judgeModelsResult.primary.maxTokens,
      role: 'primary',
      displayName: judgeModelsResult.primary.displayName,
    },
    secondary: {
      modelId: judgeModelsResult.secondary.modelId,
      weight: judgeModelsResult.secondary.weight,
      temperature: judgeModelsResult.secondary.temperature,
      maxTokens: judgeModelsResult.secondary.maxTokens,
      role: 'secondary',
      displayName: judgeModelsResult.secondary.displayName,
    },
    tiebreaker: {
      modelId: judgeModelsResult.tiebreaker.modelId,
      weight: judgeModelsResult.tiebreaker.weight,
      temperature: judgeModelsResult.tiebreaker.temperature,
      maxTokens: judgeModelsResult.tiebreaker.maxTokens,
      role: 'tiebreaker',
      displayName: judgeModelsResult.tiebreaker.displayName,
    },
  };
}

/**
 * Default CLEV voter configuration
 */
export const DEFAULT_CLEV_CONFIG: CLEVVoterConfig = {
  agreementThreshold: 0.1,
  minConfidence: 'medium',
  maxTotalTokens: 10000,
  rubric: DEFAULT_OSCQR_RUBRIC,
};

// ============================================================================
// PROMPT BUILDING & VOTE AGGREGATION (extracted to clev-voter-helpers.ts)
// ============================================================================

import {
  buildJudgePrompt,
  scoresAgree,
  aggregateVerdicts,
  combineIssues,
  combineStrengths,
} from './clev-voter-helpers';

// ============================================================================
// JUDGE EXECUTION
// ============================================================================

/**
 * Execute a single judge evaluation
 *
 * @param input - Evaluation input
 * @param modelConfig - Judge model configuration (fallback)
 * @param rubric - Evaluation rubric
 * @returns JudgeVerdict or null on failure
 */
async function executeJudge(
  input: CLEVEvaluationInput,
  modelConfig: JudgeModelConfig,
  rubric: OSCQRRubric
): Promise<JudgeVerdict | null> {
  const llmClient = new LLMClient();
  const startTime = Date.now();

  // modelConfig comes from selectJudgeModels() which already loads from database
  const prompt = buildJudgePrompt(input, rubric);

  logger.info(
    {
      judge: modelConfig.displayName,
      role: modelConfig.role,
      modelId: modelConfig.modelId,
      lessonId: input.lessonSpec.lesson_id,
    },
    'Executing judge evaluation'
  );

  try {
    const response: LLMResponse = await llmClient.generateCompletion(prompt, {
      model: modelConfig.modelId,
      temperature: modelConfig.temperature,
      maxTokens: modelConfig.maxTokens,
      systemPrompt: 'You are a precise educational content evaluator. Output only valid JSON.',
    });

    const durationMs = Date.now() - startTime;

    // Parse JSON response
    const parsed = parseJudgeResponse(response.content);

    if (!parsed) {
      logger.warn(
        {
          judge: modelConfig.displayName,
          responseLength: response.content.length,
        },
        'Failed to parse judge response'
      );
      return null;
    }

    // Build verdict
    const verdict: JudgeVerdict = {
      overallScore: parsed.overallScore,
      passed: parsed.passed,
      confidence: parsed.confidence as JudgeConfidence,
      criteriaScores: parsed.criteriaScores,
      issues: parsed.issues || [],
      strengths: parsed.strengths || [],
      recommendation: determineRecommendation(
        parsed.overallScore,
        parsed.issues || [],
        parsed.confidence as JudgeConfidence
      ),
      judgeModel: modelConfig.modelId,
      temperature: modelConfig.temperature,
      tokensUsed: response.totalTokens,
      durationMs,
    };

    logger.info(
      {
        judge: modelConfig.displayName,
        overallScore: verdict.overallScore,
        passed: verdict.passed,
        confidence: verdict.confidence,
        recommendation: verdict.recommendation,
        tokensUsed: verdict.tokensUsed,
        durationMs,
      },
      'Judge evaluation complete'
    );

    // Log detailed criteria scores for debugging
    logger.debug({
      msg: 'CLEV judge criteria scores',
      judge: modelConfig.displayName,
      criteriaScores: verdict.criteriaScores,
      strengths: verdict.strengths,
    });

    // Log detailed issues for debugging quality problems
    if (verdict.issues.length > 0) {
      logger.warn({
        msg: 'CLEV judge found issues',
        judge: modelConfig.displayName,
        issueCount: verdict.issues.length,
        issues: verdict.issues.map(issue => ({
          criterion: issue.criterion,
          severity: issue.severity,
          location: issue.location,
          description: issue.description,
          suggestedFix: issue.suggestedFix,
        })),
      });
    }

    return verdict;
  } catch (error) {
    logger.error(
      {
        judge: modelConfig.displayName,
        error: error instanceof Error ? error.message : String(error),
      },
      'Judge evaluation failed'
    );
    return null;
  }
}

/**
 * Parse judge JSON response
 */
function parseJudgeResponse(content: string): {
  overallScore: number;
  passed: boolean;
  confidence: string;
  criteriaScores: CriteriaScores;
  issues?: JudgeIssue[];
  strengths?: string[];
} | null {
  try {
    // Use safeJSONParse which handles:
    // - Markdown code blocks extraction
    // - LLM thinking tags removal
    // - JSON repair (truncated, trailing commas, etc.)
    const parsed = safeJSONParse(content) as {
      overallScore: number;
      passed: boolean;
      confidence: string;
      criteriaScores: CriteriaScores;
      issues?: JudgeIssue[];
      strengths?: string[];
    };

    // Validate required fields
    if (
      typeof parsed.overallScore !== 'number' ||
      typeof parsed.passed !== 'boolean' ||
      typeof parsed.confidence !== 'string' ||
      !parsed.criteriaScores
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

// ============================================================================
// MAIN CLEV VOTING FUNCTION
// ============================================================================

/**
 * Execute CLEV voting evaluation
 *
 * CLEV (Consensus via Lightweight Efficient Voting) pattern:
 * 1. Select judge models based on language (avoid self-evaluation bias)
 * 2. Run Judge 1 and Judge 2 in parallel
 * 3. If scores agree (within threshold), return aggregated result (67% cost savings)
 * 4. If disagree, run Judge 3 as tiebreaker
 * 5. Return majority vote result
 *
 * Model selection based on language:
 * - Russian (qwen3 generates) → judges: deepseek/kimi/minimax
 * - Other languages (deepseek generates) → judges: qwq/kimi/minimax
 *
 * @param input - Evaluation input (lesson content, spec, RAG chunks, language)
 * @param config - CLEV voter configuration (optional, uses defaults)
 * @returns JudgeAggregatedResult with voting outcome
 */
export async function executeCLEVVoting(
  input: CLEVEvaluationInput,
  config: Partial<CLEVVoterConfig> = {}
): Promise<JudgeAggregatedResult> {
  const finalConfig: CLEVVoterConfig = {
    ...DEFAULT_CLEV_CONFIG,
    ...config,
  };

  const rubric = finalConfig.rubric || DEFAULT_OSCQR_RUBRIC;

  // Select judges based on language to avoid self-evaluation bias
  const language = input.language || 'en';
  const judgeModels = await selectJudgeModels(language);

  logger.info(
    {
      lessonId: input.lessonSpec.lesson_id,
      language,
      primaryJudge: judgeModels.primary.displayName,
      secondaryJudge: judgeModels.secondary.displayName,
      tiebreakerJudge: judgeModels.tiebreaker.displayName,
      agreementThreshold: finalConfig.agreementThreshold,
      minConfidence: finalConfig.minConfidence,
    },
    'Starting CLEV voting evaluation with language-aware judge selection'
  );

  const startTime = Date.now();

  // Phase 1: Run primary and secondary judges in parallel
  const [primaryResult, secondaryResult] = await Promise.all([
    executeJudge(input, judgeModels.primary, rubric),
    executeJudge(input, judgeModels.secondary, rubric),
  ]);

  // Handle failures - graceful degradation
  const validVerdicts: JudgeVerdict[] = [];
  if (primaryResult) validVerdicts.push(primaryResult);
  if (secondaryResult) validVerdicts.push(secondaryResult);

  // If both failed, throw error
  if (validVerdicts.length === 0) {
    throw new Error('All judge evaluations failed');
  }

  // If only one succeeded, use it as single verdict
  if (validVerdicts.length === 1) {
    logger.warn(
      {
        lessonId: input.lessonSpec.lesson_id,
      },
      'Only one judge succeeded, using single verdict'
    );

    const verdict = validVerdicts[0];
    return {
      verdicts: [verdict],
      aggregatedScore: verdict.overallScore,
      finalRecommendation: verdict.recommendation,
      votingMethod: 'unanimous',
      consensusReached: true,
    };
  }

  // Phase 2: Check agreement between judges
  const scoresMatch = scoresAgree(
    primaryResult!.overallScore,
    secondaryResult!.overallScore,
    finalConfig.agreementThreshold
  );

  // Check confidence levels
  const confidenceRank: Record<JudgeConfidence, number> = { high: 2, medium: 1, low: 0 };
  const minConfidenceRank = confidenceRank[finalConfig.minConfidence];
  const primaryConfidenceOk = confidenceRank[primaryResult!.confidence] >= minConfidenceRank;
  const secondaryConfidenceOk = confidenceRank[secondaryResult!.confidence] >= minConfidenceRank;
  const bothConfident = primaryConfidenceOk && secondaryConfidenceOk;

  // If agreed with sufficient confidence, return without tiebreaker (70-85% of cases)
  if (scoresMatch && bothConfident) {
    logger.info(
      {
        lessonId: input.lessonSpec.lesson_id,
        primaryScore: primaryResult!.overallScore,
        secondaryScore: secondaryResult!.overallScore,
        durationMs: Date.now() - startTime,
      },
      'CLEV: Judges agreed, skipping tiebreaker (67% cost savings)'
    );

    const aggregated = aggregateVerdicts(validVerdicts, judgeModels);

    return {
      verdicts: validVerdicts,
      aggregatedScore: aggregated.aggregatedScore,
      finalRecommendation: aggregated.finalRecommendation,
      votingMethod: 'unanimous',
      consensusReached: true,
    };
  }

  // Phase 3: Disagreement - invoke tiebreaker
  logger.info(
    {
      lessonId: input.lessonSpec.lesson_id,
      primaryScore: primaryResult!.overallScore,
      secondaryScore: secondaryResult!.overallScore,
      scoreDifference: Math.abs(primaryResult!.overallScore - secondaryResult!.overallScore),
      tiebreaker: judgeModels.tiebreaker.displayName,
    },
    'CLEV: Judges disagreed, invoking tiebreaker'
  );

  const tiebreakerResult = await executeJudge(input, judgeModels.tiebreaker, rubric);

  if (tiebreakerResult) {
    validVerdicts.push(tiebreakerResult);
  }

  // Aggregate all verdicts
  const aggregated = aggregateVerdicts(validVerdicts, judgeModels);

  // Combine issues and strengths (available for debugging/logging)
  const _combinedIssues = combineIssues(validVerdicts);
  const _combinedStrengths = combineStrengths(validVerdicts);

  logger.info(
    {
      lessonId: input.lessonSpec.lesson_id,
      aggregatedScore: aggregated.aggregatedScore,
      finalRecommendation: aggregated.finalRecommendation,
      votingMethod: aggregated.votingMethod,
      consensusReached: aggregated.consensusReached,
      totalJudges: validVerdicts.length,
      totalIssues: _combinedIssues.length,
      totalStrengths: _combinedStrengths.length,
      durationMs: Date.now() - startTime,
    },
    'CLEV voting complete'
  );

  return {
    verdicts: validVerdicts,
    aggregatedScore: aggregated.aggregatedScore,
    finalRecommendation: aggregated.finalRecommendation,
    votingMethod: aggregated.votingMethod,
    consensusReached: aggregated.consensusReached,
  };
}
