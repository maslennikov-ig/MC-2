/**
 * Stage 7 Retry Strategy
 * @module stages/stage7-enrichments/retry-strategy
 *
 * Retry and model fallback logic for enrichment generation.
 * Handles transient errors, rate limits, and model fallback.
 */

import type { EnrichmentType } from '@megacampus/shared-types';
import { STAGE7_CONFIG, MODEL_CONFIG } from './config';

/**
 * Retry context for decision making
 */
export interface RetryContext {
  /** Type of enrichment being generated */
  enrichmentType: EnrichmentType;

  /** Current attempt number (1-based) */
  attempt: number;

  /** Error from previous attempt */
  error?: Error;

  /** Current model being used */
  currentModel?: string;
}

/**
 * Error categories for retry decisions
 */
export type ErrorCategory =
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'context_overflow'
  | 'quality'
  | 'api_error'
  | 'unrecoverable'
  | 'unknown';

/**
 * Categorize error for retry decision
 *
 * @param error - Error to categorize
 * @returns Error category
 */
export function categorizeError(error: Error): ErrorCategory {
  const message = error.message.toLowerCase();

  // Rate limit errors
  if (
    message.includes('rate_limit') ||
    message.includes('rate limit') ||
    message.includes('429') ||
    message.includes('too many requests')
  ) {
    return 'rate_limit';
  }

  // Timeout errors
  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('etimedout')
  ) {
    return 'timeout';
  }

  // Network errors
  if (
    message.includes('network') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('socket hang up') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504')
  ) {
    return 'network';
  }

  // Context overflow errors
  if (
    message.includes('context_length') ||
    message.includes('context length') ||
    message.includes('max_tokens') ||
    message.includes('maximum context') ||
    message.includes('token limit')
  ) {
    return 'context_overflow';
  }

  // Quality errors
  if (
    message.includes('quality') ||
    message.includes('validation failed') ||
    message.includes('invalid output')
  ) {
    return 'quality';
  }

  // API errors (potentially recoverable)
  if (
    message.includes('api error') ||
    message.includes('500') ||
    message.includes('internal server error')
  ) {
    return 'api_error';
  }

  // Unrecoverable errors
  if (
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('not found') ||
    message.includes('invalid api key') ||
    message.includes('authentication')
  ) {
    return 'unrecoverable';
  }

  return 'unknown';
}

/**
 * Determine if error should trigger retry
 *
 * @param ctx - Retry context
 * @returns True if retry should be attempted
 */
export function shouldRetry(ctx: RetryContext): boolean {
  // No error means success, no retry needed
  if (!ctx.error) {
    return false;
  }

  // Max attempts reached
  if (ctx.attempt >= STAGE7_CONFIG.MAX_RETRIES) {
    return false;
  }

  const category = categorizeError(ctx.error);

  // Never retry unrecoverable errors
  if (category === 'unrecoverable') {
    return false;
  }

  // Always retry transient errors
  if (['rate_limit', 'timeout', 'network', 'api_error'].includes(category)) {
    return true;
  }

  // Retry context overflow only if we can fall back to a different model
  if (category === 'context_overflow') {
    const fallbackModel = getFallbackModel(ctx);
    return fallbackModel !== null;
  }

  // Retry quality errors up to max attempts
  if (category === 'quality') {
    return ctx.attempt < STAGE7_CONFIG.MAX_RETRIES;
  }

  // Default: retry unknown errors once
  return ctx.attempt < 2;
}

/**
 * Calculate retry delay with exponential backoff
 *
 * @param ctx - Retry context
 * @returns Delay in milliseconds
 */
export function getRetryDelay(ctx: RetryContext): number {
  const baseDelay = STAGE7_CONFIG.RETRY_DELAY_MS;

  const category = ctx.error ? categorizeError(ctx.error) : 'unknown';

  // Rate limit: longer delay
  if (category === 'rate_limit') {
    return Math.min(baseDelay * Math.pow(3, ctx.attempt - 1), 60_000);
  }

  // Timeout/network: standard exponential backoff
  if (['timeout', 'network', 'api_error'].includes(category)) {
    return Math.min(baseDelay * Math.pow(2, ctx.attempt - 1), 30_000);
  }

  // Other errors: minimal delay
  return baseDelay;
}

/**
 * Get fallback model for retry
 *
 * @param ctx - Retry context
 * @returns Fallback model name or null if no fallback available
 */
export function getFallbackModel(ctx: RetryContext): string | null {
  // Only LLM-based enrichments have model fallback
  if (ctx.enrichmentType !== 'quiz' && ctx.enrichmentType !== 'presentation') {
    return null;
  }

  const modelConfig =
    ctx.enrichmentType === 'quiz' ? MODEL_CONFIG.quiz : MODEL_CONFIG.presentation;

  // If already on fallback, no further fallback
  if (ctx.currentModel === modelConfig.fallback) {
    return null;
  }

  // After max primary attempts, switch to fallback
  if (ctx.attempt >= MODEL_CONFIG.maxPrimaryAttempts) {
    return modelConfig.fallback;
  }

  return null;
}

/**
 * Get model for current attempt
 *
 * @param enrichmentType - Type of enrichment
 * @param attempt - Current attempt number (1-based)
 * @returns Model name to use
 */
export function getModelForAttempt(
  enrichmentType: EnrichmentType,
  attempt: number
): string | null {
  // Only LLM-based enrichments need model selection
  if (enrichmentType !== 'quiz' && enrichmentType !== 'presentation') {
    return null;
  }

  const modelConfig =
    enrichmentType === 'quiz' ? MODEL_CONFIG.quiz : MODEL_CONFIG.presentation;

  // Use fallback after max primary attempts
  if (attempt > MODEL_CONFIG.maxPrimaryAttempts) {
    return modelConfig.fallback;
  }

  return modelConfig.primary;
}

/**
 * Check if error is retryable based on category
 *
 * @param error - Error to check
 * @returns True if error category is retryable
 */
export function isRetryableError(error: Error): boolean {
  const category = categorizeError(error);
  return [
    'rate_limit',
    'timeout',
    'network',
    'api_error',
    'quality',
    'context_overflow',
    'unknown',
  ].includes(category);
}

/**
 * Check if error requires model fallback
 *
 * @param error - Error to check
 * @returns True if model fallback should be attempted
 */
export function requiresModelFallback(error: Error): boolean {
  const category = categorizeError(error);
  return ['context_overflow', 'quality'].includes(category);
}

/**
 * Format error for logging
 *
 * @param error - Error to format
 * @returns Formatted error object
 */
export function formatErrorForLogging(error: Error): {
  message: string;
  category: ErrorCategory;
  retryable: boolean;
  stack?: string;
} {
  const category = categorizeError(error);
  return {
    message: error.message,
    category,
    retryable: isRetryableError(error),
    stack: error.stack,
  };
}
