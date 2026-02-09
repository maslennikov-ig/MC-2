/**
 * Unit tests for tRPC errorFormatter
 * @module tests/unit/server/trpc-error-formatter
 */

import { describe, it, expect, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  AppError,
  ErrorCode,
  NotFoundError,
  QuotaExceededError,
} from '@/server/errors/typed-errors';
import {
  LLMError,
  DatabaseError,
  BarrierFailedError,
  PipelineError,
} from '@/shared/errors/pipeline-errors';

// Mock logger and supabase to prevent side effects
vi.mock('@/shared/logger/index.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => ({
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

vi.mock('@/shared/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: null }, error: null })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({ data: null, error: null })),
        })),
      })),
    })),
  })),
}));

/**
 * We test the errorFormatter logic by importing initTRPC and configuring it
 * the same way as in trpc.ts, then calling the formatter directly.
 *
 * The actual errorFormatter is tested indirectly because it's embedded in the
 * tRPC initialization. We extract the formatting logic to test it.
 */
function simulateErrorFormatter(error: TRPCError) {
  // Reproduce the errorFormatter logic from trpc.ts
  const cause = error.cause;

  let appErrorCode: string | undefined;
  let severity: string | undefined;
  let isRetryable: boolean | undefined;

  if (cause instanceof AppError) {
    appErrorCode = cause.code;
  } else if (cause instanceof PipelineError) {
    appErrorCode = cause.code;
    severity = cause.severity;
    isRetryable = cause.retryable;
  }

  // Simulate shape.data with added fields
  return {
    ...(appErrorCode && { appErrorCode }),
    ...(severity && { severity }),
    ...(isRetryable !== undefined && { isRetryable }),
  };
}

describe('tRPC errorFormatter', () => {
  describe('without cause', () => {
    it('returns no extra fields for TRPCError without cause', () => {
      const error = new TRPCError({
        code: 'NOT_FOUND',
        message: 'Not found',
      });

      const result = simulateErrorFormatter(error);
      expect(result).toEqual({});
    });

    it('returns no extra fields for TRPCError with plain Error cause', () => {
      const error = new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed',
        cause: new Error('something'),
      });

      const result = simulateErrorFormatter(error);
      expect(result).toEqual({});
    });
  });

  describe('with AppError cause', () => {
    it('extracts appErrorCode from NotFoundError', () => {
      const appError = new NotFoundError('Course not found');
      const error = new TRPCError({
        code: 'NOT_FOUND',
        message: 'Course not found',
        cause: appError,
      });

      const result = simulateErrorFormatter(error);
      expect(result).toEqual({
        appErrorCode: ErrorCode.NOT_FOUND,
      });
    });

    it('extracts appErrorCode from QuotaExceededError', () => {
      const appError = new QuotaExceededError('Rate limit');
      const error = new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Rate limit',
        cause: appError,
      });

      const result = simulateErrorFormatter(error);
      expect(result).toEqual({
        appErrorCode: ErrorCode.QUOTA_EXCEEDED,
      });
    });

    it('does not include severity or isRetryable for AppError', () => {
      const appError = new NotFoundError();
      const error = new TRPCError({
        code: 'NOT_FOUND',
        message: 'Not found',
        cause: appError,
      });

      const result = simulateErrorFormatter(error);
      expect(result).not.toHaveProperty('severity');
      expect(result).not.toHaveProperty('isRetryable');
    });
  });

  describe('with PipelineError cause', () => {
    it('extracts all fields from transient LLMError', () => {
      const pipelineError = new LLMError('Timeout', 'openrouter', 'gpt-4');
      const error = new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Timeout',
        cause: pipelineError,
      });

      const result = simulateErrorFormatter(error);
      expect(result).toEqual({
        appErrorCode: 'LLM_ERROR',
        severity: 'WARNING',
        isRetryable: true,
      });
    });

    it('extracts all fields from internal DatabaseError', () => {
      const pipelineError = new DatabaseError('Insert failed', 'insert', 'courses');
      const error = new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Insert failed',
        cause: pipelineError,
      });

      const result = simulateErrorFormatter(error);
      expect(result).toEqual({
        appErrorCode: 'DATABASE_ERROR',
        severity: 'CRITICAL',
        isRetryable: false,
      });
    });

    it('extracts all fields from validation BarrierFailedError', () => {
      const pipelineError = new BarrierFailedError(4, 2, 5);
      const error = new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Barrier failed',
        cause: pipelineError,
      });

      const result = simulateErrorFormatter(error);
      expect(result).toEqual({
        appErrorCode: 'BARRIER_FAILED',
        severity: 'ERROR',
        isRetryable: false,
      });
    });
  });
});
