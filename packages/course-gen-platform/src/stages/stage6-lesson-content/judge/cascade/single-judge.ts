/**
 * Single judge evaluation logic for cascade evaluator
 * @module stages/stage6-lesson-content/judge/cascade/single-judge
 */

import type { JudgeVerdict, JudgeConfidence, CriteriaScores } from '@megacampus/shared-types';
import type { OSCQRRubric, CriterionConfig } from '@megacampus/shared-types';
import { getContentLabels } from '@megacampus/shared-types';
import { determineRecommendation } from '@megacampus/shared-types';
import { LLMClient, type LLMResponse } from '@/shared/llm';
import { logger } from '@/shared/logger';
import { safeJSONParse } from '@/shared/utils/json-repair';
import { selectJudgeModels } from '../clev-voter';
import { DEFAULT_OSCQR_RUBRIC } from '@megacampus/shared-types';
import type { CascadeEvaluationInput, CascadeConfig, RawJudgeResponse } from './types';

/**
 * Build evaluation prompt for single judge
 */
function buildSingleJudgePrompt(input: CascadeEvaluationInput, rubric: OSCQRRubric): string {
  const { lessonContent, lessonSpec, ragChunks } = input;
  const labels = getContentLabels(input.language || 'en');

  // Format learning objectives
  const objectives = lessonSpec.learning_objectives
    .map(lo => `- [${lo.id}] ${lo.objective} (Bloom: ${lo.bloom_level})`)
    .join('\n');

  // Format RAG context for fact verification
  const ragContext =
    ragChunks.length > 0
      ? ragChunks
          .slice(0, 5)
          .map(chunk => `[${chunk.document_name}]: ${chunk.content.slice(0, 500)}...`)
          .join('\n\n')
      : 'No RAG context provided.';

  // Format content for evaluation - provide full content for accurate evaluation
  // Truncation caused low quality scores because judges couldn't assess complete content
  const contentSummary = `
## ${labels.introduction}
${lessonContent.intro}

## Sections (${lessonContent.sections.length} total)
${lessonContent.sections.map(s => `### ${s.title}\n${s.content}`).join('\n\n')}

## ${labels.examples} (${lessonContent.examples.length} total)
${lessonContent.examples.map(e => `- **${e.title}**: ${e.content.slice(0, 500)}${e.content.length > 500 ? '...' : ''}`).join('\n')}

## ${labels.exercises} (${lessonContent.exercises.length} total)
${lessonContent.exercises.map(e => `- ${e.question}`).join('\n')}
`;

  // Format rubric criteria
  const rubricCriteria = rubric.criteria
    .map(
      (c: CriterionConfig) =>
        `- **${c.criterion}** (${(c.weight * 100).toFixed(0)}% weight): ${c.description}`
    )
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
      "location": "<where in content, e.g. sec_1, sec_2, sec_introduction>",
      "description": "<what is wrong>",
      "quotedText": "<OPTIONAL: exact text from content that has the issue, 5-30 words>",
      "suggestedFix": "<how to fix>",
      "inlineReplacement": "<OPTIONAL: exact replacement for quotedText>"
    }
  ],
  "strengths": ["<strength 1>", "<strength 2>"]
}

## INLINE FIX INSTRUCTIONS

For LOCAL issues (typos, incorrect facts, unclear wording) that can be fixed by simple text replacement:

1. Set \`quotedText\` to the EXACT text from the content (5-30 words, unique enough to locate)
2. Set \`inlineReplacement\` to the corrected text

Example:
{
  "criterion": "clarity_readability",
  "severity": "minor",
  "location": "sec_2",
  "description": "Jargon may confuse beginners",
  "quotedText": "синергетический эффект коллаборации",
  "suggestedFix": "Replace jargon with simpler terms",
  "inlineReplacement": "эффект совместной работы"
}

DO NOT provide inlineReplacement for:
- Structural changes (moving paragraphs)
- Adding new examples or content
- Changes requiring creativity
- Issues spanning multiple locations

## LOCATION SPECIFICITY

AVOID using "sec_global" when possible. Instead:
- If the issue appears in specific sections, name them (e.g., "sec_1", "sec_3")
- If engagement is lacking, identify WHERE examples should be added
- Only use "sec_global" for truly document-wide issues (e.g., "inconsistent tone throughout")

Evaluate objectively, focusing on educational quality and alignment with objectives.`;
}

/**
 * Parse single judge JSON response
 */
function parseSingleJudgeResponse(content: string): {
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
} | null {
  try {
    // Use safeJSONParse which handles:
    // - Markdown code blocks extraction
    // - LLM thinking tags removal
    // - JSON repair (truncated, trailing commas, etc.)
    const parsed = safeJSONParse(content) as RawJudgeResponse;

    // Validate required fields
    if (
      typeof parsed.overallScore !== 'number' ||
      typeof parsed.passed !== 'boolean' ||
      typeof parsed.confidence !== 'string' ||
      !parsed.criteriaScores
    ) {
      return null;
    }

    return {
      overallScore: parsed.overallScore,
      passed: parsed.passed,
      confidence: parsed.confidence as JudgeConfidence,
      criteriaScores: parsed.criteriaScores,
      issues: parsed.issues || [],
      strengths: parsed.strengths || [],
    };
  } catch {
    return null;
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
    });

    const durationMs = Date.now() - startTime;

    // Parse JSON response
    const parsed = parseSingleJudgeResponse(response.content);

    if (!parsed) {
      logger.warn({
        msg: 'Failed to parse single judge response',
        judge: modelConfig.displayName,
        responseLength: response.content.length,
      });
      return null;
    }

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
