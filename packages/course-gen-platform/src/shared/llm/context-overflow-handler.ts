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
import type { Stage4TierConfig, Stage4ModelSelection } from '../../stages/stage4-analysis/phases/stage4-budget-allocator';

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
 * Get fallback model for context overflow using budget allocation's model selection.
 *
 * Escalation strategy:
 * 1. Standard tier → Extended tier primary (from tierConfig)
 * 2. Extended tier primary → Extended tier fallback (from tierConfig)
 * 3. Extended tier fallback → No more options (null)
 *
 * @param currentModelId - Current model that failed
 * @param language - Content language ('ru' | 'en')
 * @param tierConfig - Tier configuration from Budget Allocator (DB-driven)
 * @param modelSelection - Current model selection from Budget Allocator
 * @returns Fallback model info or null if exhausted
 */
export function getContextOverflowFallback(
  currentModelId: string,
  _language: 'ru' | 'en',
  tierConfig?: Stage4TierConfig,
  _modelSelection?: Stage4ModelSelection
): ContextOverflowFallback | null {
  if (!tierConfig) {
    // Without tier config, use generic Gemini Flash as universal large-context fallback
    if (currentModelId !== 'google/gemini-2.5-flash') {
      logger.info(
        {
          currentModel: currentModelId,
          fallbackModel: 'google/gemini-2.5-flash',
          reason: 'context_overflow_no_tier_config',
        },
        '[ContextOverflow] Escalating to Gemini Flash (no tier config available)'
      );
      return {
        modelId: 'google/gemini-2.5-flash',
        maxContext: 1_000_000,
      };
    }
    return null;
  }

  const { standard, extended } = tierConfig;

  // Check extended FIRST — handles overlap where standard.fallbackModelId === extended.modelId
  if (currentModelId === extended.modelId) {
    logger.info(
      {
        currentModel: currentModelId,
        fallbackModel: extended.fallbackModelId,
        reason: 'context_overflow',
      },
      '[ContextOverflow] Trying extended fallback model'
    );

    return {
      modelId: extended.fallbackModelId,
      maxContext: extended.maxContext,
    };
  }

  // If current model is standard tier, escalate to extended
  if (
    currentModelId === standard.modelId ||
    currentModelId === standard.fallbackModelId
  ) {
    logger.info(
      {
        currentModel: currentModelId,
        fallbackModel: extended.modelId,
        reason: 'context_overflow',
      },
      '[ContextOverflow] Escalating to extended context model'
    );

    return {
      modelId: extended.modelId,
      maxContext: extended.maxContext,
    };
  }

  // Already on extended fallback, no more options
  logger.warn(
    {
      currentModel: currentModelId,
    },
    '[ContextOverflow] No more fallback options available'
  );

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
 * @param tierConfig - Optional tier configuration from Budget Allocator
 * @param modelSelection - Optional current model selection
 * @returns Promise with result and model used
 * @throws Error if operation fails or fallbacks exhausted
 */
export async function executeWithContextFallback<T>(
  operation: (modelId: string) => Promise<T>,
  initialModelId: string,
  language: 'ru' | 'en',
  maxRetries: number = 2,
  tierConfig?: Stage4TierConfig,
  modelSelection?: Stage4ModelSelection
): Promise<ExecuteWithContextFallbackResult<T>> {
  let currentModelId = initialModelId;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const result = await operation(currentModelId);
      return { result, modelUsed: currentModelId };
    } catch (error) {
      if (isContextOverflowError(error)) {
        const fallback = getContextOverflowFallback(currentModelId, language, tierConfig, modelSelection);

        if (fallback) {
          logger.warn(
            {
              attempt: attempt + 1,
              currentModel: currentModelId,
              nextModel: fallback.modelId,
              error: error instanceof Error ? error.message : String(error),
            },
            '[ContextOverflow] Retrying with larger context model'
          );

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
