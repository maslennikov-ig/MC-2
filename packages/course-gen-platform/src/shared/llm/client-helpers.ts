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
import { modelSupportsTemperature, modelSupportsReasoning } from '@megacampus/shared-types';

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
  /**
   * OpenRouter reasoning controls. Always sent to a model that can reason:
   * `{ enabled: false }` when the phase did not ask for it, because several
   * models deliberate by default.
   */
  reasoning?: {
    enabled?: boolean;
    effort?: 'low' | 'medium' | 'high';
    max_tokens?: number;
  };
};

/** Reasoning settings as the caller supplies them, before provider checks. */
export interface ReasoningRequest {
  enabled: boolean;
  effort?: 'low' | 'medium' | 'high' | null;
  maxTokens?: number | null;
}

/**
 * Check if model supports explicit cache_control breakpoints via OpenRouter.
 *
 * Only Anthropic models use explicit cache_control breakpoints.
 * Google/Gemini models use implicit caching (automatic, 0.25x cost, no write fees),
 * which is cheaper than explicit caching and requires no breakpoints.
 *
 * @see https://openrouter.ai/docs/guides/best-practices/prompt-caching
 */
function supportsExplicitCaching(model: string): boolean {
  return model.includes('anthropic');
}

/**
 * Builds the `reasoning` field OpenRouter accepts.
 *
 * OpenRouter rejects a request carrying both controls: `400 Only one of
 * "reasoning.effort" and "reasoning.max_tokens" can be specified`. Sending both
 * is what the phase configuration naturally produces, since `stage_6_complex`
 * and its two siblings carry an effort *and* a budget, so every complex-tier
 * Stage 6 generation failed at the provider.
 *
 * The budget wins. It is the load-bearing half: the database and the seed
 * generator both refuse `reasoning_enabled` without one, and the answer budget
 * below is grown by exactly this number. Dropping the budget and keeping the
 * effort would leave that accounting describing a request that was never sent.
 */
export function buildReasoningPayload(reasoning: ReasoningRequest): {
  effort?: 'low' | 'medium' | 'high';
  max_tokens?: number;
} {
  if (reasoning.maxTokens) return { max_tokens: reasoning.maxTokens };
  return reasoning.effort ? { effort: reasoning.effort } : {};
}

/**
 * Apply `temperature` only where the model actually honours it.
 *
 * OpenAI's GPT-5.6 series exposes reasoning-side controls instead — its
 * OpenRouter `supported_parameters` lists `reasoning` and `reasoning_effort`
 * but not `temperature`. Sending it anyway makes the pipeline-admin screen lie:
 * the row shows 0.7 while the request is served at the provider default.
 */
function withSamplingControls(
  requestOptions: OpenRouterRequestOptions,
  model: string,
  temperature: number,
  reasoning?: ReasoningRequest
): OpenRouterRequestOptions {
  if (modelSupportsTemperature(model)) {
    requestOptions.temperature = temperature;
  }

  if (!reasoning?.enabled) {
    // Silence is not "off". Several catalogued models — DeepSeek V4 Flash among
    // them — deliberate by default, and OpenRouter bills that against
    // max_tokens. A Stage 2 summarization spent its whole budget reasoning,
    // returned no content, and ran past its 60s bound on every retry until the
    // course stopped (mc2-2pplo, 2026-08-14). A phase that did not ask for
    // reasoning has to say so.
    if (modelSupportsReasoning(model)) {
      requestOptions.reasoning = { enabled: false };
    }
    return requestOptions;
  }

  if (!modelSupportsReasoning(model)) {
    logger.warn(
      { model },
      'Phase asks for reasoning but the model does not accept it - sending the request without it'
    );
    return requestOptions;
  }

  requestOptions.reasoning = buildReasoningPayload(reasoning);

  // OpenRouter bills reasoning tokens against max_tokens, so the reasoning
  // budget is ADDED to the answer budget. Taking it out of the existing budget
  // would buy deliberation by truncating the reply - the exact failure this
  // feature is supposed to avoid.
  if (reasoning.maxTokens && typeof requestOptions.max_tokens === 'number') {
    requestOptions.max_tokens += reasoning.maxTokens;
  }

  return requestOptions;
}

/**
 * Build request options for a single-turn completion request.
 *
 * @param model - Model identifier
 * @param prompt - User prompt text
 * @param systemPrompt - System prompt for model behavior
 * @param maxTokens - Maximum output tokens to generate
 * @param temperature - Sampling temperature
 * @param enableCaching - Whether to enable prompt caching (Anthropic: explicit cache_control header;
 *   Google/Gemini: implicit caching, automatic, no breakpoints needed; DeepSeek: auto server-side)
 * @returns Tuple of [messages, requestOptions]
 */
export function buildCompletionRequest(
  model: string,
  prompt: string,
  systemPrompt: string,
  maxTokens: number,
  temperature: number,
  enableCaching: boolean,
  reasoning?: ReasoningRequest
): [MessageWithCacheControl[], OpenRouterRequestOptions] {
  const messages: MessageWithCacheControl[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt },
  ];

  // Add cache_control to system message for Anthropic and Google models
  if (enableCaching && supportsExplicitCaching(model)) {
    messages[0].cache_control = { type: 'ephemeral' };
  }

  const requestOptions: OpenRouterRequestOptions = withSamplingControls(
    {
      model,
      messages,
      max_tokens: maxTokens,
    },
    model,
    temperature,
    reasoning
  );

  // Add OpenRouter-specific cache enablement for Anthropic
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
 * @param enableCaching - Whether to enable prompt caching (Anthropic: explicit cache_control header;
 *   Google/Gemini: implicit caching, automatic, no breakpoints needed;
 *   DeepSeek: auto-caches repeated prefixes server-side; other providers: no-op)
 * @returns Tuple of [messagesWithCacheControl, requestOptions]
 */
export function buildChatCompletionRequest(
  model: string,
  messages: ChatCompletionMessageParam[],
  maxTokens: number,
  temperature: number,
  enableCaching: boolean,
  reasoning?: ReasoningRequest
): [MessageWithCacheControl[], OpenRouterRequestOptions] {
  const messagesWithCacheControl: MessageWithCacheControl[] = messages.map((msg, idx) => {
    // Add cache_control to system message for Anthropic and Google models
    if (enableCaching && supportsExplicitCaching(model) && idx === 0 && msg.role === 'system') {
      return { ...msg, cache_control: { type: 'ephemeral' } };
    }
    return msg;
  });

  const requestOptions: OpenRouterRequestOptions = withSamplingControls(
    {
      model,
      messages: messagesWithCacheControl,
      max_tokens: maxTokens,
    },
    model,
    temperature,
    reasoning
  );

  // Add OpenRouter-specific cache enablement for Anthropic
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
