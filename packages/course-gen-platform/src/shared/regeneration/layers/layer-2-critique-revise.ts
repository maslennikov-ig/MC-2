/**
 * Layer 2: Critique-Revise
 *
 * LangChain-based service to ask LLM to fix its own JSON output.
 * Refactored from orchestrator/services/analysis/revision-chain.ts for reusability.
 *
 * Pattern:
 * 1. Show LLM the original prompt
 * 2. Show LLM its failed output
 * 3. Show LLM the parse error
 * 4. Ask LLM to generate valid JSON
 * 5. Retry up to maxRetries times
 *
 * @module shared/regeneration/layers/layer-2-critique-revise
 * @see packages/course-gen-platform/src/orchestrator/services/analysis/revision-chain.ts (original)
 */

import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import type { ChatOpenAI } from '@langchain/openai';
import logger from '@/shared/logger';

/**
 * Revision prompt template
 * Instructs LLM to fix its own malformed JSON output
 */
const REVISION_TEMPLATE = `You are a JSON repair assistant. Your previous JSON output was invalid.

Original prompt:
--------------
{original_prompt}
--------------

Your previous JSON output (INVALID):
--------------
{failed_output}
--------------

Parse error:
--------------
{parse_error}
--------------

TASK: Generate VALID JSON that satisfies the original prompt and fixes the parse error.

CRITICAL RULES:
1. Return ONLY valid JSON (no explanations, no markdown, no code blocks)
2. Do NOT wrap output in \`\`\`json ... \`\`\`
3. Start directly with {{ or [
4. Ensure all brackets are properly closed
5. Remove trailing commas
6. Quote all object keys
7. Ensure all strings are properly closed

Return the corrected JSON now:`;

/**
 * Critique-revise result
 */
export interface CritiqueReviseResult {
  /** Parsed JSON object */
  data: any;
  /** Number of revision attempts used */
  attempts: number;
}

/**
 * Asks LLM to revise its own malformed JSON output
 *
 * Uses LangChain's PromptTemplate and chain pattern to iteratively repair JSON.
 * Retries up to maxRetries times if repair still fails to parse.
 *
 * @param originalPrompt - The original prompt that produced malformed JSON
 * @param failedOutput - The malformed JSON output from LLM
 * @param parseError - The JSON parse error message
 * @param model - ChatOpenAI model instance (same model that produced output)
 * @param maxRetries - Maximum revision attempts (default: 2)
 * @returns Critique-revise result with parsed data and attempt count
 * @throws Error if all revision attempts fail
 *
 * @example
 * ```typescript
 * import { critiqueAndRevise } from '@/shared/regeneration/layers/layer-2-critique-revise';
 * import { getModelForPhase } from '@/orchestrator/services/analysis/langchain-models';
 *
 * const model = await getModelForPhase('stage_4_scope', courseId);
 * const result = await critiqueAndRevise(
 *   prompt,
 *   '{"key": "value"',
 *   'Unexpected end',
 *   model,
 *   2
 * );
 * console.log(result.data); // { key: 'value' }
 * console.log(result.attempts); // 1
 * ```
 */
export async function critiqueAndRevise(
  originalPrompt: string,
  failedOutput: string,
  parseError: string,
  model: ChatOpenAI,
  maxRetries: number = 2
): Promise<CritiqueReviseResult> {
  logger.info({ maxRetries }, 'Layer 2: Critique-revise starting');

  // Create revision prompt template
  const revisePrompt = PromptTemplate.fromTemplate(REVISION_TEMPLATE);

  // Create revision chain: prompt → model → string output
  const reviseChain = revisePrompt.pipe(model).pipe(new StringOutputParser());

  const currentOutput = failedOutput;
  let currentError = parseError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    logger.debug({ attempt: attempt + 1, maxRetries }, 'Critique-revise attempt');

    try {
      // Invoke revision chain
      const revised = await reviseChain.invoke({
        original_prompt: originalPrompt,
        failed_output: currentOutput,
        parse_error: currentError,
      });

      // Clean output (remove markdown code blocks if present)
      const cleaned = cleanJSONOutput(revised);

      // Try parsing
      const parsed = JSON.parse(cleaned);

      logger.info(
        { attempts: attempt + 1 },
        'Layer 2: Critique-revise succeeded'
      );

      return {
        data: parsed,
        attempts: attempt + 1,
      };
    } catch (err) {
      logger.warn(
        {
          attempt: attempt + 1,
          maxRetries,
          error: err instanceof Error ? err.message : String(err),
        },
        'Critique-revise attempt failed'
      );

      // Update error for next iteration
      currentError = err instanceof Error ? err.message : String(err);

      // If this was the last attempt, throw
      if (attempt === maxRetries - 1) {
        throw new Error(
          `Layer 2 (Critique-revise) failed after ${maxRetries} attempts. Last error: ${currentError}`
        );
      }
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new Error('Critique-revise failed unexpectedly');
}

/**
 * Cleans LLM output to extract pure JSON
 *
 * Handles common LLM output patterns:
 * - Markdown code blocks: ```json ... ```
 * - Explanatory text before/after JSON
 * - Extra whitespace
 *
 * @param output - Raw LLM output
 * @returns Cleaned JSON string
 */
function cleanJSONOutput(output: string): string {
  let cleaned = output.trim();

  // Remove markdown code blocks
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  // If output has explanatory text, try to extract JSON structure
  // Look for first { or [ and last } or ]
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');

  let startIdx = -1;
  let endIdx = -1;

  // Determine start
  if (firstBrace !== -1 && firstBracket !== -1) {
    startIdx = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    startIdx = firstBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
  }

  // Determine end
  if (lastBrace !== -1 && lastBracket !== -1) {
    endIdx = Math.max(lastBrace, lastBracket);
  } else if (lastBrace !== -1) {
    endIdx = lastBrace;
  } else if (lastBracket !== -1) {
    endIdx = lastBracket;
  }

  // Extract JSON if found
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  }

  return cleaned;
}
