/**
 * Retry utility with exponential backoff
 * @module utils/retry
 */

import logger from '../logger';

export interface RetryOptions {
  maxRetries: number;
  delays: number[]; // [100, 200, 400] = exponential backoff
  onRetry?: (attempt: number, error: Error) => void;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < options.maxRetries) {
        const delay = options.delays[attempt] || options.delays[options.delays.length - 1];
        logger.warn({ attempt: attempt + 1, delay, err: lastError.message }, 'Retry attempt');
        options.onRetry?.(attempt + 1, lastError);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Failed after ${options.maxRetries} retries: ${lastError!.message}`);
}
