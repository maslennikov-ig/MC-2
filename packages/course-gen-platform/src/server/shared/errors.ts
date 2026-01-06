/**
 * Shared tRPC error handling utilities
 * @module server/shared/errors
 */

import { TRPCError } from '@trpc/server';
import { logger } from '../../shared/logger/index.js';

/**
 * Context for error wrapping
 */
export interface ErrorWrapContext {
  /** Operation name (e.g., 'Get auto card') */
  operation: string;
  /** Request ID for tracing */
  requestId: string;
  /** Additional details for logging */
  details?: Record<string, unknown>;
}

/**
 * Wrap an error in a TRPCError with proper logging
 *
 * Use in catch blocks to standardize error handling:
 * - Re-throws TRPCError as-is
 * - Logs error with context
 * - Wraps unknown errors in INTERNAL_SERVER_ERROR
 * - Shows detailed message in development mode
 *
 * @param error - The caught error
 * @param context - Error context for logging
 * @throws TRPCError - Always throws
 *
 * @example
 * ```typescript
 * try {
 *   // operation
 * } catch (error) {
 *   wrapTRPCError(error, {
 *     operation: 'Get auto card',
 *     requestId,
 *     details: { courseId, lessonId }
 *   });
 * }
 * ```
 */
export function wrapTRPCError(
  error: unknown,
  context: ErrorWrapContext
): never {
  // Re-throw TRPCError as-is (already properly formatted)
  if (error instanceof TRPCError) {
    throw error;
  }

  // Extract error message
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Log with full context
  logger.error({
    requestId: context.requestId,
    operation: context.operation,
    error: errorMessage,
    ...context.details,
  }, `${context.operation} failed`);

  // Throw wrapped error
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: process.env.NODE_ENV === 'development'
      ? `${context.operation} failed: ${errorMessage}`
      : `${context.operation} failed`,
    cause: error,
  });
}
