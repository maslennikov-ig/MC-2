/**
 * Shared tRPC error handling utilities
 * @module server/shared/errors
 */

import { TRPCError } from '@trpc/server';
import { logger } from '../../shared/logger/index.js';
import { AppError } from '../errors/typed-errors';
import { createTRPCError } from '../errors/error-formatter';
import { isPipelineError } from '../../shared/errors/pipeline-errors';

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
 * - Converts AppError to TRPCError preserving code and status
 * - Converts PipelineError to TRPCError preserving severity
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
export function wrapTRPCError(error: unknown, context: ErrorWrapContext): never {
  // Re-throw TRPCError as-is (already properly formatted)
  if (error instanceof TRPCError) {
    throw error;
  }

  // Convert AppError → TRPCError preserving code and status mapping
  if (error instanceof AppError) {
    logger.warn(
      {
        requestId: context.requestId,
        operation: context.operation,
        errorCode: error.code,
        statusCode: error.statusCode,
        ...context.details,
      },
      `${context.operation} failed: ${error.message}`
    );
    throw createTRPCError(error);
  }

  // Convert PipelineError → TRPCError preserving code and severity
  if (isPipelineError(error)) {
    const trpcCode: TRPCError['code'] =
      error.severity === 'CRITICAL'
        ? 'INTERNAL_SERVER_ERROR'
        : error.retryable
          ? 'TOO_MANY_REQUESTS'
          : 'BAD_REQUEST';

    logger.error(
      {
        requestId: context.requestId,
        operation: context.operation,
        pipelineErrorCode: error.code,
        severity: error.severity,
        retryable: error.retryable,
        metadata: error.metadata,
        ...context.details,
      },
      `${context.operation} failed (pipeline): ${error.message}`
    );

    throw new TRPCError({
      code: trpcCode,
      message:
        process.env.NODE_ENV === 'development'
          ? `${context.operation}: ${error.message}`
          : `${context.operation} failed`,
      cause: error,
    });
  }

  // Generic fallback: wrap unknown errors in INTERNAL_SERVER_ERROR
  const errorMessage = error instanceof Error ? error.message : String(error);

  logger.error(
    {
      requestId: context.requestId,
      operation: context.operation,
      error: errorMessage,
      ...context.details,
    },
    `${context.operation} failed`
  );

  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message:
      process.env.NODE_ENV === 'development'
        ? `${context.operation} failed: ${errorMessage}`
        : `${context.operation} failed`,
    cause: error,
  });
}
