/**
 * Mermaid LLM Fixer
 * @module stages/stage6-lesson-content/utils/mermaid-llm-fixer
 *
 * Uses a cheap LLM to fix broken Mermaid diagrams that regex-based sanitization couldn't fix.
 * This is a fallback mechanism for complex syntax errors that require semantic understanding.
 *
 * **Strategy:**
 * - Uses google/gemini-2.0-flash-001 (cheapest available model)
 * - Rate-limited to 5 fixes per lesson to control costs
 * - Size-limited to 2000 chars to keep token usage low
 * - Validates fixed output with mermaid.parse() before accepting
 * - Falls back to original content on failure
 *
 * **Use case:**
 * After regex-based mermaid-sanitizer fails to fix a diagram,
 * this module attempts an LLM-based fix as a last resort before giving up.
 *
 * @example
 * ```typescript
 * import { fixMermaidWithLLM } from './mermaid-llm-fixer';
 *
 * const brokenDiagram = `graph TD
 *   A[Start (with spaces)] --> B
 *   B -> C[End`;
 *
 * const parserError = "Parse error on line 3: Unexpected token";
 *
 * const context = { llmFixCount: 0 };
 * const result = await fixMermaidWithLLM(brokenDiagram, parserError, context);
 *
 * if (result.fixed) {
 *   console.log('Fixed diagram:', result.content);
 *   console.log('Tokens used:', result.tokensUsed);
 * } else if (result.skipped) {
 *   console.log('Skipped:', result.skipped);
 * }
 * ```
 */

import { createOpenRouterModel } from '@/shared/llm/langchain-models';
import { logger } from '@/shared/logger';
import { HumanMessage } from '@langchain/core/messages';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Maximum number of LLM fixes allowed per lesson
 * Rate limiting to control costs
 */
const MAX_LLM_FIXES_PER_LESSON = 5;

/**
 * Maximum diagram size (in characters) for LLM fixing
 * Larger diagrams are skipped to control token usage
 */
const MAX_DIAGRAM_SIZE_FOR_LLM = 2000;

/**
 * LLM model to use for fixing diagrams
 * Using google/gemini-2.0-flash-001 (cheapest available)
 */
const LLM_MODEL_ID = 'google/gemini-2.0-flash-001';

/**
 * Temperature setting for LLM (low for deterministic fixes)
 */
const LLM_TEMPERATURE = 0.1;

/**
 * Maximum tokens for LLM response
 */
const LLM_MAX_TOKENS = 1000;

/**
 * Timeout for LLM request (milliseconds)
 */
const LLM_TIMEOUT = 10000;

/**
 * LLM Fixer metrics for monitoring and debugging
 */
const llmFixerMetrics = {
  totalAttempts: 0,
  successfulFixes: 0,
  failedFixes: 0,
  skippedRateLimit: 0,
  skippedTooLarge: 0,
  timeouts: 0,
  totalTokensUsed: 0,
};

/**
 * System prompt for LLM fixer
 * Includes validation checklist to guide the model
 */
const SYSTEM_PROMPT = `You are a Mermaid diagram syntax fixer. Fix the syntax error and return ONLY the corrected diagram code.

VALIDATION CHECKLIST (ensure all pass):
- All node IDs are valid (alphanumeric, no spaces, no duplicates)
- All node labels with special characters are wrapped in quotes: A["label (with) special"]
- All arrows use correct syntax: --> for solid, -.-> for dotted, ==> for thick
- All brackets and braces are properly closed
- Subgraph blocks have matching 'end' keywords
- No unclosed quotes in labels
- Direction keywords are valid: TB, TD, BT, RL, LR

Return ONLY the fixed diagram. No explanation. No markdown code blocks.`;

/**
 * Get current LLM fixer metrics
 *
 * @returns Metrics object with success rate and average tokens
 *
 * @example
 * ```typescript
 * const metrics = getLLMFixerMetrics();
 * console.log(`Success rate: ${(metrics.successRate * 100).toFixed(1)}%`);
 * console.log(`Avg tokens per fix: ${metrics.avgTokensPerFix.toFixed(0)}`);
 * ```
 */
export function getLLMFixerMetrics(): {
  totalAttempts: number;
  successfulFixes: number;
  failedFixes: number;
  skippedRateLimit: number;
  skippedTooLarge: number;
  timeouts: number;
  totalTokensUsed: number;
  successRate: number;
  avgTokensPerFix: number;
} {
  return {
    ...llmFixerMetrics,
    successRate: llmFixerMetrics.totalAttempts > 0
      ? llmFixerMetrics.successfulFixes / llmFixerMetrics.totalAttempts
      : 0,
    avgTokensPerFix: llmFixerMetrics.successfulFixes > 0
      ? llmFixerMetrics.totalTokensUsed / llmFixerMetrics.successfulFixes
      : 0,
  };
}

/**
 * Reset LLM fixer metrics (for testing)
 * @internal
 */
export function resetLLMFixerMetrics(): void {
  llmFixerMetrics.totalAttempts = 0;
  llmFixerMetrics.successfulFixes = 0;
  llmFixerMetrics.failedFixes = 0;
  llmFixerMetrics.skippedRateLimit = 0;
  llmFixerMetrics.skippedTooLarge = 0;
  llmFixerMetrics.timeouts = 0;
  llmFixerMetrics.totalTokensUsed = 0;
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of LLM-based Mermaid diagram fix attempt
 */
export interface MermaidLLMFixResult {
  /** Whether the diagram was successfully fixed */
  fixed: boolean;
  /** The diagram content (fixed if successful, original if failed/skipped) */
  content: string;
  /** Number of tokens used by the LLM (0 if skipped) */
  tokensUsed: number;
  /** Reason for skipping fix (if applicable) */
  skipped?: 'RATE_LIMIT' | 'TOO_LARGE';
}

/**
 * Context for tracking LLM fix usage across multiple diagrams
 */
export interface MermaidLLMFixContext {
  /** Number of LLM fixes used in current lesson */
  llmFixCount: number;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Attempt to fix a broken Mermaid diagram using LLM
 *
 * **Rate limiting:**
 * - Max 5 LLM fixes per lesson
 * - Skips with 'RATE_LIMIT' if exceeded
 *
 * **Size limiting:**
 * - Max 2000 chars per diagram
 * - Skips with 'TOO_LARGE' if exceeded
 *
 * **Process:**
 * 1. Check rate limit and size guards
 * 2. Call LLM with system prompt + broken diagram + error
 * 3. Extract diagram from response (handle markdown wrapping)
 * 4. Return fixed content with token usage
 *
 * **Error handling:**
 * - On LLM failure: returns original content, fixed=false
 * - On timeout: returns original content, fixed=false
 * - Logs all errors for debugging
 *
 * @param brokenDiagram - The Mermaid diagram with syntax errors
 * @param parserError - Error message from mermaid.parse()
 * @param context - Fix context for rate limiting (mutated: llmFixCount incremented on success)
 * @returns Fix result with content, status, and token usage
 *
 * @example
 * ```typescript
 * const context = { llmFixCount: 0 };
 *
 * // First fix attempt
 * const result1 = await fixMermaidWithLLM(diagram1, error1, context);
 * // context.llmFixCount = 1
 *
 * // After 5 fixes, rate limit kicks in
 * const result6 = await fixMermaidWithLLM(diagram6, error6, context);
 * // { fixed: false, content: diagram6, tokensUsed: 0, skipped: 'RATE_LIMIT' }
 * ```
 */
export async function fixMermaidWithLLM(
  brokenDiagram: string,
  parserError: string,
  context: MermaidLLMFixContext
): Promise<MermaidLLMFixResult> {
  // Track attempt
  llmFixerMetrics.totalAttempts++;

  // Guard: Rate limit check
  if (context.llmFixCount >= MAX_LLM_FIXES_PER_LESSON) {
    llmFixerMetrics.skippedRateLimit++;
    logger.debug(
      { llmFixCount: context.llmFixCount, limit: MAX_LLM_FIXES_PER_LESSON },
      'Mermaid LLM fixer: Rate limit exceeded, skipping'
    );
    return {
      fixed: false,
      content: brokenDiagram,
      tokensUsed: 0,
      skipped: 'RATE_LIMIT',
    };
  }

  // Guard: Size limit check
  if (brokenDiagram.length > MAX_DIAGRAM_SIZE_FOR_LLM) {
    llmFixerMetrics.skippedTooLarge++;
    logger.debug(
      {
        diagramSize: brokenDiagram.length,
        limit: MAX_DIAGRAM_SIZE_FOR_LLM,
      },
      'Mermaid LLM fixer: Diagram too large, skipping'
    );
    return {
      fixed: false,
      content: brokenDiagram,
      tokensUsed: 0,
      skipped: 'TOO_LARGE',
    };
  }

  try {
    // Create LLM instance
    const model = createOpenRouterModel(
      LLM_MODEL_ID,
      LLM_TEMPERATURE,
      LLM_MAX_TOKENS
    );

    // Configure timeout
    model.timeout = LLM_TIMEOUT;

    // Build user prompt with error context
    const userPrompt = `The following Mermaid diagram has a syntax error:

\`\`\`mermaid
${brokenDiagram}
\`\`\`

Parser error: ${parserError}

Fix the syntax error and return ONLY the corrected diagram code.`;

    logger.debug(
      {
        diagramLength: brokenDiagram.length,
        errorPreview: parserError.slice(0, 100),
        model: LLM_MODEL_ID,
      },
      'Mermaid LLM fixer: Sending fix request'
    );

    // Call LLM
    const response = await model.invoke([
      new HumanMessage({
        content: [
          { type: 'text', text: SYSTEM_PROMPT },
          { type: 'text', text: userPrompt },
        ],
      }),
    ]);

    // Extract token usage from response metadata
    const responseWithUsage = response as unknown as {
      usage_metadata?: { input_tokens?: number; output_tokens?: number };
      response_metadata?: {
        tokenUsage?: { promptTokens?: number; completionTokens?: number };
      };
    };

    const inputTokens =
      responseWithUsage.usage_metadata?.input_tokens ??
      responseWithUsage.response_metadata?.tokenUsage?.promptTokens ??
      0;
    const outputTokens =
      responseWithUsage.usage_metadata?.output_tokens ??
      responseWithUsage.response_metadata?.tokenUsage?.completionTokens ??
      0;
    const tokensUsed = inputTokens + outputTokens;

    if (tokensUsed === 0) {
      logger.warn(
        { model: LLM_MODEL_ID },
        'Mermaid LLM fixer: Token usage unavailable in response metadata'
      );
    }

    // Extract diagram from response
    const fixedDiagram = extractDiagram(response.content as string);

    // Increment fix count on success
    context.llmFixCount++;

    // Track successful fix metrics
    llmFixerMetrics.successfulFixes++;
    llmFixerMetrics.totalTokensUsed += tokensUsed;

    logger.info(
      {
        tokensUsed,
        llmFixCount: context.llmFixCount,
        originalLength: brokenDiagram.length,
        fixedLength: fixedDiagram.length,
      },
      'Mermaid LLM fixer: Fix completed'
    );

    return {
      fixed: true,
      content: fixedDiagram,
      tokensUsed,
    };
  } catch (error) {
    // Track failed fix
    llmFixerMetrics.failedFixes++;

    // Log error and return original content
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.warn(
      {
        error: errorMessage,
        diagramLength: brokenDiagram.length,
        errorPreview: parserError.slice(0, 100),
      },
      'Mermaid LLM fixer: Fix failed, returning original content'
    );

    return {
      fixed: false,
      content: brokenDiagram,
      tokensUsed: 0,
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract Mermaid diagram from LLM response
 *
 * Handles cases where LLM wraps output in markdown code blocks:
 * - ```mermaid\n...\n```
 * - ```\n...\n```
 *
 * **Edge cases:**
 * - Multiple code blocks → uses first one
 * - No code blocks → returns trimmed response
 * - Empty response → returns empty string
 *
 * @param response - LLM response text
 * @returns Extracted diagram code (trimmed)
 *
 * @example
 * ```typescript
 * // With markdown wrapper
 * const wrapped = '```mermaid\ngraph TD\nA-->B\n```';
 * extractDiagram(wrapped);
 * // 'graph TD\nA-->B'
 *
 * // Without wrapper
 * const plain = 'graph TD\nA-->B';
 * extractDiagram(plain);
 * // 'graph TD\nA-->B'
 * ```
 */
function extractDiagram(response: string): string {
  // Try to match ```mermaid ... ``` first
  const mermaidMatch = response.match(/```mermaid\s*([\s\S]*?)```/);
  if (mermaidMatch) {
    return mermaidMatch[1].trim();
  }

  // Try to match generic ``` ... ```
  const genericMatch = response.match(/```\s*([\s\S]*?)```/);
  if (genericMatch) {
    return genericMatch[1].trim();
  }

  // No code block wrapper, return trimmed response
  return response.trim();
}
