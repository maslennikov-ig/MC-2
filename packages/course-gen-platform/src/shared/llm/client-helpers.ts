/**
 * LLM Client Helpers
 * @module shared/llm/client-helpers
 *
 * Extracted helpers for the LLM client to reduce method complexity
 * and line count. Contains request building, response parsing,
 * token estimation, and error handling logic.
 */

import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionCreateParamsNonStreaming,
} from 'openai/resources/chat/completions';
import logger from '../../shared/logger';
import type { LLMResponse } from './client';

/**
 * OpenRouter-specific extension for cache_control
 * Used with Anthropic models via OpenRouter
 */
export type MessageWithCacheControl = ChatCompletionMessageParam & {
  cache_control?: { type: string };
};

/**
 * OpenRouter-specific request options
 * Extends standard OpenAI params with provider-specific fields
 */
export type OpenRouterRequestOptions = ChatCompletionCreateParamsNonStreaming & {
  extra_body?: {
    provider?: {
      cache_control?: boolean;
    };
  };
};

/**
 * Build request options for a single-turn completion request.
 *
 * @param model - Model identifier
 * @param prompt - User prompt text
 * @param systemPrompt - System prompt for model behavior
 * @param maxTokens - Maximum output tokens to generate
 * @param temperature - Sampling temperature
 * @param enableCaching - Whether to enable Anthropic cache_control
 * @returns Tuple of [messages, requestOptions]
 */
export function buildCompletionRequest(
  model: string,
  prompt: string,
  systemPrompt: string,
  maxTokens: number,
  temperature: number,
  enableCaching: boolean
): [MessageWithCacheControl[], OpenRouterRequestOptions] {
  const messages: MessageWithCacheControl[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt },
  ];

  // Add cache_control to system message for Anthropic models
  if (enableCaching && model.includes('anthropic')) {
    messages[0].cache_control = { type: 'ephemeral' };
  }

  const requestOptions: OpenRouterRequestOptions = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
  };

  // Add OpenRouter-specific cache enablement
  if (enableCaching && model.includes('anthropic')) {
    requestOptions.extra_body = {
      provider: { cache_control: true },
    };
  }

  return [messages, requestOptions];
}

/**
 * Build request options for a multi-turn chat completion request.
 *
 * @param model - Model identifier
 * @param messages - Array of chat messages
 * @param maxTokens - Maximum output tokens to generate
 * @param temperature - Sampling temperature
 * @param enableCaching - Whether to enable prompt caching (Anthropic: cache_control header;
 *   DeepSeek: auto-caches repeated prefixes server-side; other providers: no-op)
 * @returns Tuple of [messagesWithCacheControl, requestOptions]
 */
export function buildChatCompletionRequest(
  model: string,
  messages: ChatCompletionMessageParam[],
  maxTokens: number,
  temperature: number,
  enableCaching: boolean
): [MessageWithCacheControl[], OpenRouterRequestOptions] {
  const messagesWithCacheControl: MessageWithCacheControl[] = messages.map((msg, idx) => {
    // Add cache_control to system message for Anthropic models
    if (enableCaching && model.includes('anthropic') && idx === 0 && msg.role === 'system') {
      return { ...msg, cache_control: { type: 'ephemeral' } };
    }
    return msg;
  });

  const requestOptions: OpenRouterRequestOptions = {
    model,
    messages: messagesWithCacheControl,
    max_tokens: maxTokens,
    temperature,
  };

  // Add OpenRouter-specific cache enablement
  if (enableCaching && model.includes('anthropic')) {
    requestOptions.extra_body = {
      provider: { cache_control: true },
    };
  }

  return [messagesWithCacheControl, requestOptions];
}

/**
 * Estimate token counts from content lengths when API does not report usage.
 * Uses ~4 chars per token (conservative for mixed content).
 */
export function estimateTokensFromContent(
  inputLength: number,
  outputLength: number,
  model: string
): { inputTokens: number; outputTokens: number; totalTokens: number } {
  const inputTokens = Math.ceil(inputLength / 4);
  const outputTokens = Math.ceil(outputLength / 4);
  const totalTokens = inputTokens + outputTokens;

  logger.debug(
    {
      model,
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: outputTokens,
      estimatedTotalTokens: totalTokens,
    },
    'Token usage estimated from content length (model did not report usage)'
  );

  return { inputTokens, outputTokens, totalTokens };
}

/**
 * Parse a chat completion response into an LLMResponse.
 *
 * Extracts content, token usage (with fallback estimation), model info,
 * and finish reason from the OpenAI completion object.
 *
 * @param completion - Raw completion response from OpenAI SDK
 * @param model - Requested model (used as fallback)
 * @param inputContentLength - Total input content length for token estimation fallback
 * @returns Parsed LLMResponse
 * @throws Error if completion has no content
 */
export function parseCompletionResponse(
  completion: OpenAI.Chat.Completions.ChatCompletion,
  model: string,
  inputContentLength: number
): LLMResponse {
  const choice = completion.choices[0];
  if (!choice?.message?.content) {
    throw new Error('No content in completion response');
  }

  const usage = completion.usage;

  // Extract token counts from API response
  let inputTokens = usage?.prompt_tokens || 0;
  let outputTokens = usage?.completion_tokens || 0;
  let totalTokens = usage?.total_tokens || 0;

  // Fallback: estimate tokens if model didn't report usage
  if (totalTokens === 0) {
    const estimated = estimateTokensFromContent(
      inputContentLength,
      choice.message.content.length,
      model
    );
    inputTokens = estimated.inputTokens;
    outputTokens = estimated.outputTokens;
    totalTokens = estimated.totalTokens;
  }

  return {
    content: choice.message.content,
    inputTokens,
    outputTokens,
    totalTokens,
    model: completion.model || model,
    finishReason: choice.finish_reason || 'unknown',
    requestId: (completion as unknown as Record<string, unknown>)._request_id as string | undefined,
  };
}

/**
 * Handle an API error from the OpenAI SDK.
 *
 * Logs the error with context, checks if it is retryable, and either
 * re-throws (for retry) or wraps in a non-retryable Error.
 *
 * @param error - The OpenAI APIError
 * @param context - Additional context for logging (model, prompt length, etc.)
 * @throws Error (always)
 */
export function handleApiError(
  error: InstanceType<typeof OpenAI.APIError>,
  context: Record<string, unknown>
): never {
  const errorPayload = error as unknown as Record<string, unknown>;
  logger.error(
    {
      status: error.status,
      message: error.message,
      requestId: errorPayload.request_id as string | undefined,
      code: errorPayload.code as string | undefined,
      ...context,
    },
    'OpenAI API error'
  );

  // Check if error is retryable
  if (!isRetryableApiError(error)) {
    throw new Error(`Non-retryable API error (${error.status}): ${error.message}`);
  }

  // Re-throw to trigger retry
  throw error;
}

/**
 * Handle an unknown (non-API) error during an LLM request.
 *
 * Logs full context for debugging and re-throws.
 *
 * @param error - The unknown error
 * @param context - Additional context for logging
 * @throws The original error (always)
 */
export function handleUnknownError(error: unknown, context: Record<string, unknown>): never {
  logger.error(
    {
      error: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : 'Unknown',
      ...context,
    },
    'Unknown error during LLM request'
  );
  throw error;
}

/**
 * Determine if an API error is retryable.
 *
 * Retryable errors:
 * - 429 (Rate limit), 500, 502, 503, 504
 * - Network errors (ECONNRESET, ETIMEDOUT, etc.)
 *
 * Non-retryable errors:
 * - 400, 401, 403, 404, 422
 */
export function isRetryableApiError(error: InstanceType<typeof OpenAI.APIError>): boolean {
  const retryableStatuses = [429, 500, 502, 503, 504];

  if (retryableStatuses.includes(error.status || 0)) {
    return true;
  }

  // Check for network-level errors
  const message = error.message.toLowerCase();
  const networkErrors = [
    'timeout',
    'econnreset',
    'econnrefused',
    'etimedout',
    'enotfound',
    'socket',
    'connection error',
  ];

  return networkErrors.some(pattern => message.includes(pattern));
}
