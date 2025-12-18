/**
 * Utility functions for handling async errors and retries
 */

interface RetryOptions {
  maxAttempts?: number
  delay?: number
  backoff?: 'linear' | 'exponential'
  onRetry?: (attempt: number, error: Error) => void
}

/**
 * Retry an async function with configurable options
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoff = 'exponential',
    onRetry
  } = options

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      
      if (attempt === maxAttempts) {
        throw lastError
      }

      const currentDelay = backoff === 'exponential' 
        ? delay * Math.pow(2, attempt - 1) 
        : delay * attempt

      onRetry?.(attempt, lastError)

      await new Promise(resolve => setTimeout(resolve, currentDelay))
    }
  }

  throw lastError
}

/**
 * Safe async wrapper that catches errors and provides fallback
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  fallback: T,
  onError?: (error: Error) => void
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    onError?.(error as Error)
    return fallback
  }
}

/**
 * Safe async wrapper that returns a result object
 */
export async function safeAsyncResult<T>(
  fn: () => Promise<T>
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const data = await fn()
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error as Error }
  }
}

/**
 * Timeout wrapper for promises
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutMessage = 'Operation timed out'
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(timeoutMessage)), ms)
  })

  return Promise.race([promise, timeout])
}