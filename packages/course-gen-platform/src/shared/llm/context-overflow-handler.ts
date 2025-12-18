/**
 * Context Overflow Handler
 * @module shared/llm/context-overflow-handler
 *
 * Detects context_length_exceeded errors from OpenRouter and provides
 * automatic fallback to extended context models.
 *
 * Handles cases where token estimation is inaccurate and the actual
 * token count exceeds the model's context window, triggering automatic
 * escalation to models with larger context windows.
 *
 * @example
 * ```typescript
 * // Automatic fallback on context overflow
 * const { result, modelUsed } = await executeWithContextFallback(
 *   async (modelId) => await someOperation(modelId),
 *   'qwen/qwen3-235b-a22b-2507',
 *   'ru'
 * );
 * // If context overflow occurs, automatically tries extended tier model
 * ```
 */

import logger from '../logger';
import { STAGE4_MODELS } from './model-selector';

// ============================================================================
// ERROR DETECTION
// ============================================================================

/**
 * Check if an error is a context overflow error from OpenRouter.
 *
 * Detects various context length error patterns from different providers:
 * - context_length_exceeded (OpenRouter standard)
 * - context length (generic)
 * - maximum context (provider-specific)
 * - token limit (provider-specific)
 * - exceeds the model (Anthropic pattern)
 * - too many tokens (OpenAI pattern)
 *
 * @param error - Error object to check
 * @returns true if error indicates context overflow
 *
 * @example
 * ```typescript
 * try {
 *   await llm.invoke(largePrompt);
 * } catch (error) {
 *   if (isContextOverflowError(error)) {
 *     // Handle context overflow
 *   }
 * }
 * ```
 */
export function isContextOverflowError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('context_length_exceeded') ||
      message.includes('context length') ||
      message.includes('maximum context') ||
      message.includes('token limit') ||
      message.includes('exceeds the model') ||
      message.includes('too many tokens')
    );
  }
  return false;
}

// ============================================================================
// FALLBACK SELECTION
// ============================================================================

/**
 * Fallback model information
 */
export interface ContextOverflowFallback {
  /** Fallback model ID to try */
  modelId: string;

  /** Maximum context window for fallback model */
  maxContext: number;
}

/**
 * Get fallback model for context overflow.
 *
 * Escalation strategy:
 * 1. Standard tier (260K) → Extended tier primary (1M)
 * 2. Extended tier primary → Extended tier fallback (1M)
 * 3. Extended tier fallback → No more options (null)
 *
 * @param currentModelId - Current model that failed
 * @param language - Content language ('ru' | 'en')
 * @returns Fallback model info or null if exhausted
 *
 * @example
 * ```typescript
 * // Escalate from standard to extended
 * const fallback = getContextOverflowFallback('qwen/qwen3-235b-a22b-2507', 'ru');
 * // fallback.modelId === 'google/gemini-2.5-flash-preview-09-2025'
 * // fallback.maxContext === 1_000_000
 * ```
 */
export function getContextOverflowFallback(
  currentModelId: string,
  language: 'ru' | 'en'
): ContextOverflowFallback | null {
  const langConfig = STAGE4_MODELS[language];

  // If current model is standard tier, escalate to extended
  if (
    currentModelId === langConfig.standard.primary ||
    currentModelId === langConfig.standard.fallback
  ) {
    logger.info({
      currentModel: currentModelId,
      fallbackModel: langConfig.extended.primary,
      reason: 'context_overflow',
    }, '[ContextOverflow] Escalating to extended context model');

    return {
      modelId: langConfig.extended.primary,
      maxContext: langConfig.extended.maxContext,
    };
  }

  // If already on extended primary, try extended fallback
  if (currentModelId === langConfig.extended.primary) {
    logger.info({
      currentModel: currentModelId,
      fallbackModel: langConfig.extended.fallback,
      reason: 'context_overflow',
    }, '[ContextOverflow] Trying extended fallback model');

    return {
      modelId: langConfig.extended.fallback,
      maxContext: langConfig.extended.maxContext,
    };
  }

  // Already on extended fallback, no more options
  logger.warn({
    currentModel: currentModelId,
  }, '[ContextOverflow] No more fallback options available');

  return null;
}

// ============================================================================
// AUTOMATIC EXECUTION WRAPPER
// ============================================================================

/**
 * Result of execution with context fallback
 */
export interface ExecuteWithContextFallbackResult<T> {
  /** Operation result */
  result: T;

  /** Model ID actually used (may differ from initial if fallback occurred) */
  modelUsed: string;
}

/**
 * Wrapper to execute LLM call with automatic context overflow fallback.
 *
 * Automatically retries operation with larger context models when
 * context_length_exceeded errors occur. Supports up to 2 fallback
 * attempts (standard → extended primary → extended fallback).
 *
 * @param operation - Async operation to execute (receives modelId)
 * @param initialModelId - Initial model to try
 * @param language - Content language ('ru' | 'en')
 * @param maxRetries - Maximum fallback attempts (default: 2)
 * @returns Promise with result and model used
 * @throws Error if operation fails or fallbacks exhausted
 *
 * @example
 * ```typescript
 * // Phase execution with automatic fallback
 * const { result, modelUsed } = await executeWithContextFallback(
 *   async (modelId) => {
 *     const model = getModelForPhase(modelId, 0.3);
 *     return await model.invoke(messages);
 *   },
 *   'qwen/qwen3-235b-a22b-2507',
 *   'ru'
 * );
 *
 * logger.info({ modelUsed }, 'Phase completed');
 * // modelUsed may be 'google/gemini-2.5-flash-preview-09-2025' if fallback occurred
 * ```
 */
export async function executeWithContextFallback<T>(
  operation: (modelId: string) => Promise<T>,
  initialModelId: string,
  language: 'ru' | 'en',
  maxRetries: number = 2
): Promise<ExecuteWithContextFallbackResult<T>> {
  let currentModelId = initialModelId;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const result = await operation(currentModelId);
      return { result, modelUsed: currentModelId };
    } catch (error) {
      if (isContextOverflowError(error)) {
        const fallback = getContextOverflowFallback(currentModelId, language);

        if (fallback) {
          logger.warn({
            attempt: attempt + 1,
            currentModel: currentModelId,
            nextModel: fallback.modelId,
            error: error instanceof Error ? error.message : String(error),
          }, '[ContextOverflow] Retrying with larger context model');

          currentModelId = fallback.modelId;
          attempt++;
          continue;
        }
      }

      // Not a context overflow or no fallback available
      throw error;
    }
  }

  throw new Error(`Context overflow: exhausted all fallback models after ${maxRetries} retries`);
}
