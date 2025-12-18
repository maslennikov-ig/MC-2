/**
 * Delta Judge - Verifies that patches successfully address issues
 *
 * Delta Judge is a fast, focused evaluation (~150-250 tokens) that checks
 * if a specific issue was addressed by a patch. It verifies:
 * - The targeted issue is resolved
 * - No new critical issues were introduced
 * - Coherence with adjacent sections is maintained
 *
 * @module stage6-lesson-content/judge/verifier/delta-judge
 */

import type {
  DeltaJudgeInput,
  DeltaJudgeOutput,
  JudgeIssue,
  JudgeConfidence,
} from '@megacampus/shared-types';
import { LLMClient } from '@/shared/llm';
import { createModelConfigService } from '@/shared/llm/model-config-service';
import { logger } from '@/shared/logger';

/**
 * Build prompt for Delta Judge verification
 *
 * Creates a focused prompt that asks the judge to verify if a specific
 * issue was successfully addressed by the patch.
 *
 * @param input - DeltaJudgeInput with original, patched content, and issue
 * @returns Formatted prompt string for LLM
 */
export function buildDeltaJudgePrompt(input: DeltaJudgeInput): string {
  return `You are evaluating whether a content fix successfully addressed a specific issue.

## ISSUE TO VERIFY
Criterion: ${input.addressedIssue.criterion}
Severity: ${input.addressedIssue.severity}
Description: ${input.addressedIssue.description}
${input.addressedIssue.suggestedFix ? `Suggested Fix: ${input.addressedIssue.suggestedFix}` : ''}

## ORIGINAL CONTENT
${input.originalContent}

## PATCHED CONTENT
${input.patchedContent}

## CONTEXT ANCHORS
Previous section ends: "${input.contextAnchors.prevSectionEnd || 'N/A'}"
Next section starts: "${input.contextAnchors.nextSectionStart || 'N/A'}"

## EVALUATION CRITERIA
1. Was the specific issue addressed?
2. Was the fix applied correctly?
3. Were any NEW issues introduced?
4. Is coherence with adjacent sections maintained?

## RESPONSE FORMAT (JSON)
{
  "passed": true|false,
  "confidence": "high"|"medium"|"low",
  "reasoning": "Brief explanation of your assessment",
  "newIssues": [] // Array of new issues if any (with criterion, severity, description)
}

Respond ONLY with valid JSON.`;
}

/**
 * Build system prompt for Delta Judge
 *
 * Provides clear instructions for the judge's role and decision criteria.
 *
 * @returns System prompt string
 */
export function buildDeltaJudgeSystemPrompt(): string {
  return `You are a precise content quality evaluator.

Your task: Verify that a specific fix was successfully applied.

Be strict but fair:
- "passed": true if the issue is addressed, even if imperfectly
- "passed": false if the issue remains or new critical issues appear
- Report any NEW issues introduced by the fix
- Consider context coherence with adjacent sections

Response rules:
- Respond ONLY with valid JSON
- Be concise but specific in reasoning
- Flag new issues even if minor (for tracking)`;
}

/**
 * Parse delta judge JSON response
 */
function parseDeltaJudgeResponse(content: string): {
  passed: boolean;
  confidence: string;
  reasoning: string;
  newIssues?: unknown[];
} | null {
  try {
    let jsonStr = content;

    // Remove markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    // Find JSON object
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    if (typeof parsed.passed !== 'boolean' || typeof parsed.reasoning !== 'string') {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Verify a patch addresses its targeted issue
 *
 * Invokes LLM to check if the patch successfully resolved the issue
 * without introducing new problems.
 *
 * @param input - DeltaJudgeInput with original, patched, and issue
 * @returns DeltaJudgeOutput with pass/fail and reasoning
 */
export async function verifyPatch(input: DeltaJudgeInput): Promise<DeltaJudgeOutput> {
  const startTime = Date.now();
  const llmClient = new LLMClient();
  const modelService = createModelConfigService();

  try {
    // Get model configuration
    let modelId = 'openai/gpt-oss-20b';
    let temperature = 0.0;
    let maxTokens = 512;

    try {
      const config = await modelService.getModelForPhase('stage_6_delta_judge');
      modelId = config.modelId;
      temperature = config.temperature;
      maxTokens = config.maxTokens;
      logger.info({ modelId, source: config.source }, 'Delta-Judge using model from config');
    } catch (error) {
      logger.warn({ error: error instanceof Error ? error.message : String(error) },
        'Failed to get delta judge model config, using fallback');
    }

    // Build prompts (functions already exist in this file)
    const prompt = buildDeltaJudgePrompt(input);
    const systemPrompt = buildDeltaJudgeSystemPrompt();

    // Call LLM for verification
    const response = await llmClient.generateCompletion(prompt, {
      model: modelId,
      temperature,
      maxTokens,
      systemPrompt,
    });

    logger.info({
      issue: input.addressedIssue.criterion,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    }, 'Delta-Judge: LLM call complete');

    // Parse JSON response
    const result = parseDeltaJudgeResponse(response.content);

    if (!result) {
      logger.warn({
        responseLength: response.content.length,
        responsePreview: response.content.slice(0, 200),
      }, 'Failed to parse delta judge response');

      return {
        passed: false,
        confidence: 'low',
        reasoning: 'Failed to parse judge response',
        newIssues: [],
        tokensUsed: response.totalTokens,
        durationMs: Date.now() - startTime,
      };
    }

    return {
      passed: result.passed,
      confidence: result.confidence as JudgeConfidence,
      reasoning: result.reasoning,
      newIssues: parseNewIssues(result.newIssues || []),
      tokensUsed: response.totalTokens,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
    }, 'Delta-Judge verification failed');

    return {
      passed: false,
      confidence: 'low',
      reasoning: `Verification error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      newIssues: [],
      tokensUsed: 0,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Parse new issues from LLM response
 *
 * Helper function to convert LLM-generated issue objects into
 * validated JudgeIssue types.
 *
 * @param rawIssues - Array of issue objects from LLM response
 * @returns Array of validated JudgeIssue objects
 * @internal - Used in commented integration example
 */
export function parseNewIssues(rawIssues: any[]): JudgeIssue[] {
  if (!Array.isArray(rawIssues)) {
    return [];
  }

  return rawIssues
    .filter((issue) => {
      // Basic validation
      return (
        issue &&
        typeof issue === 'object' &&
        issue.criterion &&
        issue.severity &&
        issue.description
      );
    })
    .map((issue) => ({
      criterion: issue.criterion,
      severity: issue.severity,
      location: issue.location || 'unknown',
      description: issue.description,
      quotedText: issue.quotedText,
      suggestedFix: issue.suggestedFix || '',
    }));
}
