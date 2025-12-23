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
 * - Weights: Qwen3-235B (0.75), DeepSeek (0.74), Kimi K2 (0.73), Minimax M2 (0.72)
 *
 * Reference:
 * - docs/research/010-stage6-generation-strategy/ (CLEV research)
 * - specs/010-stages-456-pipeline/data-model.md
 */

import type {
  JudgeVerdict,
  JudgeAggregatedResult,
  VotingMethod,
  CriteriaScores,
  JudgeRecommendation,
  JudgeConfidence,
  JudgeIssue,
} from '@megacampus/shared-types';
import { determineRecommendation } from '@megacampus/shared-types';
import { DEFAULT_OSCQR_RUBRIC, type CriterionConfig, type OSCQRRubric } from '@megacampus/shared-types';
import type { LessonSpecificationV2 } from '@megacampus/shared-types/lesson-specification-v2';
import type { RAGChunk, LessonContentBody } from '@megacampus/shared-types/lesson-content';
import { LLMClient, type LLMResponse } from '@/shared/llm';
import { logger } from '@/shared/logger';
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
 * - If Russian (qwen3 generates) → use deepseek/kimi/minimax/glm as judges
 * - If other languages (deepseek generates) → use qwq/kimi/minimax/glm as judges
 *
 * @param language - Content language ('ru' for Russian, anything else for other)
 * @returns CLEV judge configuration (primary, secondary, tiebreaker)
 * @throws Error if database unavailable and no cached data exists
 */
export async function selectJudgeModels(language: string): Promise<Record<'primary' | 'secondary' | 'tiebreaker', JudgeModelConfig>> {
  // Database lookup via ModelConfigService - throws on error (no hardcoded fallback)
  const modelConfigService = createModelConfigService();
  const judgeModelsResult = await modelConfigService.getJudgeModels(language);

  logger.info({
    language,
    primary: judgeModelsResult.primary.modelId,
    secondary: judgeModelsResult.secondary.modelId,
    tiebreaker: judgeModelsResult.tiebreaker.modelId,
    source: judgeModelsResult.source,
  }, 'Judge models loaded via ModelConfigService');

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
// PROMPT BUILDING
// ============================================================================

/**
 * Build the evaluation prompt for a judge
 */
function buildJudgePrompt(
  input: CLEVEvaluationInput,
  rubric: OSCQRRubric,
): string {
  const { lessonContent, lessonSpec, ragChunks } = input;

  // Format learning objectives
  const objectives = lessonSpec.learning_objectives
    .map((lo) => `- [${lo.id}] ${lo.objective} (Bloom: ${lo.bloom_level})`)
    .join('\n');

  // Format RAG context for fact verification
  const ragContext = ragChunks.length > 0
    ? ragChunks
        .slice(0, 5)
        .map((chunk) => `[${chunk.document_name}]: ${chunk.content.slice(0, 500)}...`)
        .join('\n\n')
    : 'No RAG context provided.';

  // Format content for evaluation - provide full content for accurate evaluation
  // Truncation caused low quality scores because judges couldn't assess complete content
  const contentSummary = `
## Introduction
${lessonContent.intro}

## Sections (${lessonContent.sections.length} total)
${lessonContent.sections.map((s) => `### ${s.title}\n${s.content}`).join('\n\n')}

## Examples (${lessonContent.examples.length} total)
${lessonContent.examples.map((e) => `- **${e.title}**: ${e.content.slice(0, 500)}${e.content.length > 500 ? '...' : ''}`).join('\n')}

## Exercises (${lessonContent.exercises.length} total)
${lessonContent.exercises.map((e) => `- ${e.question}`).join('\n')}
`;

  // Format rubric criteria
  const rubricCriteria = rubric.criteria
    .map((c: CriterionConfig) => `- **${c.criterion}** (${(c.weight * 100).toFixed(0)}% weight): ${c.description}`)
    .join('\n');

  return `You are an expert educational content evaluator. Evaluate the following lesson content against the OSCQR-based rubric.

## LESSON SPECIFICATION

**Title**: ${lessonSpec.title}
**Description**: ${lessonSpec.description}
**Difficulty**: ${lessonSpec.difficulty_level}
**Target Audience**: ${lessonSpec.metadata.target_audience}
**Content Archetype**: ${lessonSpec.metadata.content_archetype}

### Learning Objectives
${objectives}

## LESSON CONTENT TO EVALUATE
${contentSummary}

## REFERENCE MATERIALS (for fact verification)
${ragContext}

## EVALUATION RUBRIC

Evaluate against these 6 criteria (scores 0.0-1.0):
${rubricCriteria}

**Passing Threshold**: ${rubric.passingThreshold}

## OUTPUT FORMAT

Respond ONLY with valid JSON in this exact format:
{
  "overallScore": <number 0-1>,
  "passed": <boolean>,
  "confidence": "<high|medium|low>",
  "criteriaScores": {
    "learning_objective_alignment": <number 0-1>,
    "pedagogical_structure": <number 0-1>,
    "factual_accuracy": <number 0-1>,
    "clarity_readability": <number 0-1>,
    "engagement_examples": <number 0-1>,
    "completeness": <number 0-1>
  },
  "issues": [
    {
      "criterion": "<criterion_name>",
      "severity": "<critical|major|minor>",
      "location": "<where in content>",
      "description": "<what is wrong>",
      "suggestedFix": "<how to fix>"
    }
  ],
  "strengths": ["<strength 1>", "<strength 2>"]
}

Evaluate objectively, focusing on educational quality and alignment with objectives.`;
}

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
  rubric: OSCQRRubric,
): Promise<JudgeVerdict | null> {
  const llmClient = new LLMClient();
  const startTime = Date.now();

  // modelConfig comes from selectJudgeModels() which already loads from database
  const prompt = buildJudgePrompt(input, rubric);

  logger.info({
    judge: modelConfig.displayName,
    role: modelConfig.role,
    modelId: modelConfig.modelId,
    lessonId: input.lessonSpec.lesson_id,
  }, 'Executing judge evaluation');

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
      logger.warn({
        judge: modelConfig.displayName,
        responseLength: response.content.length,
      }, 'Failed to parse judge response');
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
        parsed.confidence as JudgeConfidence,
      ),
      judgeModel: modelConfig.modelId,
      temperature: modelConfig.temperature,
      tokensUsed: response.totalTokens,
      durationMs,
    };

    logger.info({
      judge: modelConfig.displayName,
      overallScore: verdict.overallScore,
      passed: verdict.passed,
      confidence: verdict.confidence,
      recommendation: verdict.recommendation,
      tokensUsed: verdict.tokensUsed,
      durationMs,
    }, 'Judge evaluation complete');

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
        issues: verdict.issues.map((issue) => ({
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
    logger.error({
      judge: modelConfig.displayName,
      error: error instanceof Error ? error.message : String(error),
    }, 'Judge evaluation failed');
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
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = content;

    // Remove markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    // Try to find JSON object in response
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

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
// VOTE AGGREGATION
// ============================================================================

/**
 * Check if two scores agree within threshold
 */
function scoresAgree(score1: number, score2: number, threshold: number): boolean {
  return Math.abs(score1 - score2) <= threshold;
}

/**
 * Aggregate verdicts using weighted mean
 *
 * Uses model weights based on historical accuracy:
 * - Formula: w_i = 1 / (1 + exp(-accuracy_i))
 * - Higher accuracy models have more influence on final score
 * - Weights are loaded from database via ModelConfigService
 *
 * @param verdicts - Array of judge verdicts
 * @param judgeModels - Optional judge model configs with weights (from selectJudgeModels)
 */
function aggregateVerdicts(
  verdicts: JudgeVerdict[],
  judgeModels?: Record<'primary' | 'secondary' | 'tiebreaker', JudgeModelConfig>
): {
  aggregatedScore: number;
  finalRecommendation: JudgeRecommendation;
  consensusReached: boolean;
  votingMethod: VotingMethod;
} {
  if (verdicts.length === 0) {
    throw new Error('Cannot aggregate empty verdicts array');
  }

  // Get weight for a model - use provided judgeModels config or fallback to pattern matching
  const getModelWeight = (modelId: string): number => {
    // Try to find weight from provided judgeModels config
    if (judgeModels) {
      for (const config of Object.values(judgeModels)) {
        if (config.modelId === modelId) {
          return config.weight;
        }
      }
    }

    // Fallback weights for known model families (used when judgeModels not provided)
    // These are reasonable defaults based on model performance benchmarks
    if (modelId.includes('qwen3') || modelId.includes('qwen/qwen3')) return 0.75;
    if (modelId.includes('deepseek')) return 0.74;
    if (modelId.includes('kimi')) return 0.73;
    if (modelId.includes('minimax')) return 0.72;
    if (modelId.includes('glm')) return 0.71;
    if (modelId.includes('gemini')) return 0.68;
    return 0.70; // Default fallback weight
  };

  // Calculate weighted mean score
  let totalWeight = 0;
  let weightedSum = 0;

  for (const verdict of verdicts) {
    const weight = getModelWeight(verdict.judgeModel);
    weightedSum += verdict.overallScore * weight;
    totalWeight += weight;
  }

  const aggregatedScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Majority vote for recommendation
  const recommendationCounts = new Map<JudgeRecommendation, number>();
  for (const verdict of verdicts) {
    const count = recommendationCounts.get(verdict.recommendation) || 0;
    recommendationCounts.set(verdict.recommendation, count + 1);
  }

  let finalRecommendation: JudgeRecommendation = verdicts[0].recommendation;
  let maxCount = 0;
  for (const [rec, count] of recommendationCounts) {
    if (count > maxCount) {
      maxCount = count;
      finalRecommendation = rec;
    }
  }

  // Determine voting method
  let votingMethod: VotingMethod;
  const allAgree = verdicts.every((v) => v.recommendation === finalRecommendation);

  if (verdicts.length === 2 && allAgree) {
    votingMethod = 'unanimous';
  } else if (verdicts.length === 3 && allAgree) {
    votingMethod = 'unanimous';
  } else if (verdicts.length === 3) {
    votingMethod = 'tiebreaker';
  } else {
    votingMethod = 'majority';
  }

  const consensusReached = allAgree || maxCount >= Math.ceil(verdicts.length / 2);

  return {
    aggregatedScore,
    finalRecommendation,
    consensusReached,
    votingMethod,
  };
}

/**
 * Combine and deduplicate issues from multiple verdicts
 */
function combineIssues(verdicts: JudgeVerdict[]): JudgeIssue[] {
  const seenIssues = new Set<string>();
  const combinedIssues: JudgeIssue[] = [];

  for (const verdict of verdicts) {
    for (const issue of verdict.issues) {
      // Create a key for deduplication based on criterion and description
      const issueKey = `${issue.criterion}:${issue.description.slice(0, 50)}`;
      if (!seenIssues.has(issueKey)) {
        seenIssues.add(issueKey);
        combinedIssues.push(issue);
      }
    }
  }

  // Sort by severity: critical > major > minor
  const severityOrder: Record<string, number> = { critical: 0, major: 1, minor: 2 };
  return combinedIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

/**
 * Combine and deduplicate strengths from multiple verdicts
 */
function combineStrengths(verdicts: JudgeVerdict[]): string[] {
  const seenStrengths = new Set<string>();
  const combinedStrengths: string[] = [];

  for (const verdict of verdicts) {
    for (const strength of verdict.strengths) {
      // Normalize and deduplicate
      const normalizedStrength = strength.toLowerCase().trim();
      if (!seenStrengths.has(normalizedStrength)) {
        seenStrengths.add(normalizedStrength);
        combinedStrengths.push(strength);
      }
    }
  }

  return combinedStrengths;
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
  config: Partial<CLEVVoterConfig> = {},
): Promise<JudgeAggregatedResult> {
  const finalConfig: CLEVVoterConfig = {
    ...DEFAULT_CLEV_CONFIG,
    ...config,
  };

  const rubric = finalConfig.rubric || DEFAULT_OSCQR_RUBRIC;

  // Select judges based on language to avoid self-evaluation bias
  const language = input.language || 'en';
  const judgeModels = await selectJudgeModels(language);

  logger.info({
    lessonId: input.lessonSpec.lesson_id,
    language,
    primaryJudge: judgeModels.primary.displayName,
    secondaryJudge: judgeModels.secondary.displayName,
    tiebreakerJudge: judgeModels.tiebreaker.displayName,
    agreementThreshold: finalConfig.agreementThreshold,
    minConfidence: finalConfig.minConfidence,
  }, 'Starting CLEV voting evaluation with language-aware judge selection');

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
    logger.warn({
      lessonId: input.lessonSpec.lesson_id,
    }, 'Only one judge succeeded, using single verdict');

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
    finalConfig.agreementThreshold,
  );

  // Check confidence levels
  const confidenceRank: Record<JudgeConfidence, number> = { high: 2, medium: 1, low: 0 };
  const minConfidenceRank = confidenceRank[finalConfig.minConfidence];
  const primaryConfidenceOk = confidenceRank[primaryResult!.confidence] >= minConfidenceRank;
  const secondaryConfidenceOk = confidenceRank[secondaryResult!.confidence] >= minConfidenceRank;
  const bothConfident = primaryConfidenceOk && secondaryConfidenceOk;

  // If agreed with sufficient confidence, return without tiebreaker (70-85% of cases)
  if (scoresMatch && bothConfident) {
    logger.info({
      lessonId: input.lessonSpec.lesson_id,
      primaryScore: primaryResult!.overallScore,
      secondaryScore: secondaryResult!.overallScore,
      durationMs: Date.now() - startTime,
    }, 'CLEV: Judges agreed, skipping tiebreaker (67% cost savings)');

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
  logger.info({
    lessonId: input.lessonSpec.lesson_id,
    primaryScore: primaryResult!.overallScore,
    secondaryScore: secondaryResult!.overallScore,
    scoreDifference: Math.abs(primaryResult!.overallScore - secondaryResult!.overallScore),
    tiebreaker: judgeModels.tiebreaker.displayName,
  }, 'CLEV: Judges disagreed, invoking tiebreaker');

  const tiebreakerResult = await executeJudge(input, judgeModels.tiebreaker, rubric);

  if (tiebreakerResult) {
    validVerdicts.push(tiebreakerResult);
  }

  // Aggregate all verdicts
  const aggregated = aggregateVerdicts(validVerdicts, judgeModels);

  // Combine issues and strengths (available for debugging/logging)
  const _combinedIssues = combineIssues(validVerdicts);
  const _combinedStrengths = combineStrengths(validVerdicts);

  logger.info({
    lessonId: input.lessonSpec.lesson_id,
    aggregatedScore: aggregated.aggregatedScore,
    finalRecommendation: aggregated.finalRecommendation,
    votingMethod: aggregated.votingMethod,
    consensusReached: aggregated.consensusReached,
    totalJudges: validVerdicts.length,
    totalIssues: _combinedIssues.length,
    totalStrengths: _combinedStrengths.length,
    durationMs: Date.now() - startTime,
  }, 'CLEV voting complete');

  return {
    verdicts: validVerdicts,
    aggregatedScore: aggregated.aggregatedScore,
    finalRecommendation: aggregated.finalRecommendation,
    votingMethod: aggregated.votingMethod,
    consensusReached: aggregated.consensusReached,
  };
}
