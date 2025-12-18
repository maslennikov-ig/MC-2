/**
 * Error formatter for tRPC responses
 * @module errors/error-formatter
 */

import { TRPCError } from '@trpc/server';
import { AppError, ErrorCode } from './typed-errors';
import logger from '../../shared/logger';

export interface FormattedError {
  code: ErrorCode;
  message: string;
  statusCode: number;
}

export function formatError(error: unknown): FormattedError {
  // Handle AppError instances
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
    };
  }

  // Handle TRPCError instances
  if (error instanceof TRPCError) {
    const statusCode = mapTRPCCodeToHTTPStatus(error.code);
    return {
      code: ErrorCode.INTERNAL_ERROR,
      message: error.message,
      statusCode,
    };
  }

  // Handle generic Error instances
  if (error instanceof Error) {
    logger.error({ err: error }, 'Unexpected error');
    return {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
      statusCode: 500,
    };
  }

  // Handle unknown errors
  logger.error({ err: error }, 'Unknown error type');
  return {
    code: ErrorCode.INTERNAL_ERROR,
    message: 'An unknown error occurred',
    statusCode: 500,
  };
}

function mapTRPCCodeToHTTPStatus(code: string): number {
  const mapping: Record<string, number> = {
    PARSE_ERROR: 400,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    METHOD_NOT_SUPPORTED: 405,
    TIMEOUT: 408,
    CONFLICT: 409,
    PRECONDITION_FAILED: 412,
    PAYLOAD_TOO_LARGE: 413,
    UNPROCESSABLE_CONTENT: 422,
    TOO_MANY_REQUESTS: 429,
    CLIENT_CLOSED_REQUEST: 499,
    INTERNAL_SERVER_ERROR: 500,
  };

  return mapping[code] || 500;
}

export function createTRPCError(error: AppError): TRPCError {
  const trpcCode = mapHTTPStatusToTRPCCode(error.statusCode);

  return new TRPCError({
    code: trpcCode,
    message: error.message,
    cause: error,
  });
}

function mapHTTPStatusToTRPCCode(statusCode: number): TRPCError['code'] {
  if (statusCode === 400) return 'BAD_REQUEST';
  if (statusCode === 401) return 'UNAUTHORIZED';
  if (statusCode === 403) return 'FORBIDDEN';
  if (statusCode === 404) return 'NOT_FOUND';
  if (statusCode === 429) return 'TOO_MANY_REQUESTS';
  return 'INTERNAL_SERVER_ERROR';
}
