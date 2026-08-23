/**
 * Single judge evaluation logic for cascade evaluator
 * @module stages/stage6-lesson-content/judge/cascade/single-judge
 */

import type { JudgeVerdict, JudgeConfidence, CriteriaScores } from '@megacampus/shared-types';
import type { OSCQRRubric } from '@megacampus/shared-types';
import { determineRecommendation } from '@megacampus/shared-types';
import { LLMClient, type LLMResponse } from '@/shared/llm';
import { logger } from '@/shared/logger';
import { safeJSONParse } from '@/shared/workspace-utils';
import { selectJudgeModels } from '../clev-voter';
import { buildJudgePrompt } from '../clev-voter-helpers';
import { DEFAULT_OSCQR_RUBRIC } from '@megacampus/shared-types';
import type { CascadeEvaluationInput, CascadeConfig, RawJudgeResponse } from './types';

/**
 * What the single judge is told.
 *
 * Delegates to the panel's builder rather than keeping a second copy. They were
 * two copies and they had drifted: the panel's prompt carries three checks the
 * single judge's did not — that exercises and the conclusion actually belong to
 * this lesson, that no stray CJK or Arabic script leaked into the prose, and
 * that the lesson is not far shorter than its stated duration.
 *
 * The cheap gate is the one that settles 37% of lessons alone, so a gate that
 * asks *less* than the panel behind it is the wrong way round: it lets through
 * exactly what the panel would have caught. Measured 2026-08-22 over 1302 stored
 * verdicts (mc2-4clyr).
 *
 * The two inputs are structurally identical, and one prompt is also what makes a
 * single verdict admissible as one of the panel's votes.
 *
 * Exported so a test can read what the judge is actually told, the way the
 * conflict-detector prompts are.
 */
export function buildSingleJudgePrompt(input: CascadeEvaluationInput, rubric: OSCQRRubric): string {
  return buildJudgePrompt(input, rubric);
}

interface ParsedSingleJudgeResponse {
  overallScore: number;
  passed: boolean;
  confidence: JudgeConfidence;
  criteriaScores: CriteriaScores;
  issues: Array<{
    criterion: string;
    severity: string;
    location: string;
    description: string;
    suggestedFix: string;
  }>;
  strengths: string[];
}

/**
 * Parse single judge JSON response, or say why it could not be read.
 *
 * The parser knew which field was wrong and the caller logged only how many
 * bytes came back, so a judge answering in the wrong shape was indistinguishable
 * from a judge that did not answer at all.
 */
function parseSingleJudgeResponse(
  content: string
): { ok: true; value: ParsedSingleJudgeResponse } | { ok: false; reason: string } {
  try {
    // Use safeJSONParse which handles:
    // - Markdown code blocks extraction
    // - LLM thinking tags removal
    // - JSON repair (truncated, trailing commas, etc.)
    const parsed = safeJSONParse(content) as RawJudgeResponse;

    // Validate required fields
    const wrong = [
      typeof parsed.overallScore !== 'number' ? 'overallScore is not a number' : '',
      typeof parsed.passed !== 'boolean' ? 'passed is not a boolean' : '',
      typeof parsed.confidence !== 'string' ? 'confidence is not a string' : '',
      !parsed.criteriaScores ? 'criteriaScores is missing' : '',
    ].filter(Boolean);
    if (wrong.length > 0) {
      return { ok: false, reason: wrong.join('; ') };
    }

    return {
      ok: true,
      value: {
        overallScore: parsed.overallScore,
        passed: parsed.passed,
        confidence: parsed.confidence as JudgeConfidence,
        criteriaScores: parsed.criteriaScores,
        issues: parsed.issues || [],
        strengths: parsed.strengths || [],
      },
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Execute single judge evaluation (Stage 2)
 *
 * Uses the cheapest available judge model for initial evaluation.
 * If confidence is high enough, this is the final result.
 *
 * @param input - Evaluation input
 * @param config - Cascade configuration
 * @returns Judge verdict or null on failure
 */
export async function executeSingleJudge(
  input: CascadeEvaluationInput,
  config: CascadeConfig
): Promise<JudgeVerdict | null> {
  const llmClient = new LLMClient();
  const startTime = Date.now();
  const rubric = config.rubric || DEFAULT_OSCQR_RUBRIC;

  // Select cheapest judge model based on language
  const language = input.language || 'en';
  const judgeModels = await selectJudgeModels(language);

  // Use secondary judge (cheaper) for single pass
  const modelConfig = judgeModels.secondary;

  const prompt = buildSingleJudgePrompt(input, rubric);

  logger.info({
    msg: 'Executing single judge evaluation',
    judge: modelConfig.displayName,
    lessonId: input.lessonSpec.lesson_id,
  });

  try {
    const response: LLMResponse = await llmClient.generateCompletion(prompt, {
      model: modelConfig.modelId,
      temperature: modelConfig.temperature,
      maxTokens: modelConfig.maxTokens,
      systemPrompt: 'You are a precise educational content evaluator. Output only valid JSON.',
      ...(input.courseId
        ? {
            costContext: {
              courseId: input.courseId,
              stage: 'stage_6' as const,
              phase: 'stage_6_judge',
              ...(input.lessonUuid ? { lessonId: input.lessonUuid } : {}),
            },
          }
        : {}),
    });

    const durationMs = Date.now() - startTime;

    // Parse JSON response
    const parseResult = parseSingleJudgeResponse(response.content);

    if (!parseResult.ok) {
      logger.warn({
        msg: 'Failed to parse single judge response',
        judge: modelConfig.displayName,
        responseLength: response.content.length,
        reason: parseResult.reason,
      });
      return null;
    }
    const parsed = parseResult.value;

    // Build verdict
    const verdict: JudgeVerdict = {
      overallScore: parsed.overallScore,
      passed: parsed.passed,
      confidence: parsed.confidence,
      criteriaScores: parsed.criteriaScores,
      issues: parsed.issues.map(issue => ({
        criterion: issue.criterion as keyof CriteriaScores,
        severity: issue.severity as 'critical' | 'major' | 'minor',
        location: issue.location,
        description: issue.description,
        suggestedFix: issue.suggestedFix,
      })),
      strengths: parsed.strengths,
      recommendation: determineRecommendation(
        parsed.overallScore,
        parsed.issues.map(issue => ({
          criterion: issue.criterion as keyof CriteriaScores,
          severity: issue.severity as 'critical' | 'major' | 'minor',
          location: issue.location,
          description: issue.description,
          suggestedFix: issue.suggestedFix,
        })),
        parsed.confidence
      ),
      judgeModel: modelConfig.modelId,
      temperature: modelConfig.temperature,
      tokensUsed: response.totalTokens,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      durationMs,
    };

    logger.info({
      msg: 'Single judge evaluation complete',
      judge: modelConfig.displayName,
      overallScore: verdict.overallScore,
      passed: verdict.passed,
      confidence: verdict.confidence,
      recommendation: verdict.recommendation,
      tokensUsed: verdict.tokensUsed,
      durationMs,
    });

    // Log detailed criteria scores for debugging
    logger.debug({
      msg: 'Judge criteria scores',
      judge: modelConfig.displayName,
      criteriaScores: verdict.criteriaScores,
      strengths: verdict.strengths,
    });

    // Log detailed issues for debugging quality problems
    if (verdict.issues.length > 0) {
      logger.warn({
        msg: 'Judge found issues',
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
    logger.error({
      msg: 'Single judge evaluation failed',
      judge: modelConfig.displayName,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
