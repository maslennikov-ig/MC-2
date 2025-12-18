/**
 * Layer 5: Quality Fallback
 *
 * Last resort fallback to high-quality model (Kimi K2) when validation/quality fails.
 * Extracted from orchestrator/services/analysis/phase-2-scope.ts for reusability.
 *
 * NOTE: This is NOT for context overflow - use 'emergency' phase (Grok/Gemini) for that.
 * This layer is specifically for quality/validation failures with normal-sized input.
 *
 * Pattern:
 * - Invoke quality fallback model (high precision, reliable structured output)
 * - Used when all other layers exhausted (auto-repair, critique, partial-regen, escalation)
 * - Last line of defense for quality issues
 *
 * @module shared/regeneration/layers/layer-5-emergency
 * @see packages/course-gen-platform/src/orchestrator/services/analysis/phase-2-scope.ts (lines 185-197)
 */

import { getModelForPhase } from '@/shared/llm/langchain-models';
import logger from '@/shared/logger';

/**
 * Quality fallback result
 */
export interface QualityFallbackResult {
  /** Raw output from quality fallback model */
  output: string;
  /** Quality fallback model that succeeded */
  modelUsed: string;
}

/**
 * Invokes quality fallback model as last resort for validation/quality failures
 *
 * Uses the 'quality_fallback' phase from langchain-models, which defaults to
 * moonshotai/kimi-k2-0905 (S-TIER quality, reliable structured output).
 *
 * NOTE: This is NOT for context overflow. For large inputs, use 'emergency' phase.
 *
 * @param prompt - Prompt to invoke on quality fallback model
 * @param courseId - Course ID for model configuration
 * @returns Quality fallback result with output and model metadata
 * @throws Error if quality fallback model fails (rare - indicates critical failure)
 *
 * @example
 * ```typescript
 * import { qualityFallback } from '@/shared/regeneration/layers/layer-5-emergency';
 *
 * try {
 *   const result = await qualityFallback(prompt, courseId);
 *   console.log(result.output); // Raw JSON from Kimi K2
 *   console.log(result.modelUsed); // 'moonshotai/kimi-k2-0905'
 * } catch (error) {
 *   // This is a critical failure - all repair layers exhausted
 *   console.error('Quality fallback failed:', error);
 * }
 * ```
 */
export async function qualityFallback(
  prompt: string,
  courseId: string
): Promise<QualityFallbackResult> {
  logger.warn('Layer 5: Quality fallback invoked (last resort)');

  try {
    const fallbackModel = await getModelForPhase('quality_fallback', courseId);
    const fallbackModelId = fallbackModel.model || 'moonshotai/kimi-k2-0905';

    logger.info({ fallbackModelId }, 'Invoking quality fallback model');

    const response = await fallbackModel.invoke(prompt);
    const output = response.content as string;

    // Verify output is parseable JSON
    JSON.parse(output);

    logger.info(
      { fallbackModelId },
      'Layer 5: Quality fallback succeeded'
    );

    return {
      output,
      modelUsed: fallbackModelId,
    };
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Layer 5: Quality fallback FAILED (CRITICAL)'
    );

    throw new Error(
      `Layer 5 (Quality fallback) failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Checks if quality fallback should be attempted
 *
 * Some scenarios may skip quality fallback (e.g., cost constraints,
 * non-critical operations).
 *
 * NOTE: This is for quality/validation failures, not context overflow.
 *
 * @param stage - Regeneration stage
 * @param config - Optional configuration
 * @returns True if quality fallback should be attempted
 *
 * @example
 * ```typescript
 * import { shouldAttemptQualityFallback } from '@/shared/regeneration/layers/layer-5-emergency';
 *
 * if (shouldAttemptQualityFallback('analyze')) {
 *   await qualityFallback(prompt, courseId);
 * }
 * ```
 */
export function shouldAttemptQualityFallback(
  stage: string,
  config?: { skipEmergency?: boolean }
): boolean {
  // Skip if explicitly disabled
  if (config?.skipEmergency) {
    return false;
  }

  // Always attempt for critical stages
  if (stage === 'analyze' || stage === 'generation') {
    return true;
  }

  // Default: attempt quality fallback
  return true;
}
