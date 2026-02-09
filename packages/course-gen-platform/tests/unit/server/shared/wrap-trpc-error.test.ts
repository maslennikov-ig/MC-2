/**
 * Unit tests for wrapTRPCError
 * @module tests/unit/server/shared/wrap-trpc-error
 */

import { describe, it, expect, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { wrapTRPCError, type ErrorWrapContext } from '@/server/shared/errors';
import {
  NotFoundError,
  AuthenticationError,
  QuotaExceededError,
  BadRequestError,
  InternalError,
} from '@/server/errors/typed-errors';
import {
  LLMError,
  DatabaseError,
  BarrierFailedError,
  NetworkError,
} from '@/shared/errors/pipeline-errors';

// Mock the logger to prevent DB writes during tests
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

const defaultContext: ErrorWrapContext = {
  operation: 'Test operation',
  requestId: 'test-req-123',
};

describe('wrapTRPCError', () => {
  describe('TRPCError pass-through', () => {
    it('re-throws TRPCError as-is', () => {
      const trpcError = new TRPCError({
        code: 'NOT_FOUND',
        message: 'Resource not found',
      });

      expect(() => wrapTRPCError(trpcError, defaultContext)).toThrow(trpcError);
    });

    it('preserves TRPCError code and message', () => {
      const trpcError = new TRPCError({
        code: 'FORBIDDEN',
        message: 'Access denied',
      });

      try {
        wrapTRPCError(trpcError, defaultContext);
      } catch (e) {
        expect(e).toBe(trpcError);
        expect((e as TRPCError).code).toBe('FORBIDDEN');
        expect((e as TRPCError).message).toBe('Access denied');
      }
    });
  });

  describe('AppError conversion', () => {
    it('converts NotFoundError to TRPCError NOT_FOUND', () => {
      const appError = new NotFoundError('Course not found');

      try {
        wrapTRPCError(appError, defaultContext);
        expect.fail('Should have thrown');
      } catch (e) {
        const thrown = e as TRPCError;
        expect(thrown).toBeInstanceOf(TRPCError);
        expect(thrown.code).toBe('NOT_FOUND');
        expect(thrown.message).toBe('Course not found');
        expect(thrown.cause).toBe(appError);
      }
    });

    it('converts AuthenticationError to TRPCError UNAUTHORIZED', () => {
      const appError = new AuthenticationError('Token expired');

      try {
        wrapTRPCError(appError, defaultContext);
        expect.fail('Should have thrown');
      } catch (e) {
        const thrown = e as TRPCError;
        expect(thrown).toBeInstanceOf(TRPCError);
        expect(thrown.code).toBe('UNAUTHORIZED');
        expect(thrown.cause).toBe(appError);
      }
    });

    it('converts QuotaExceededError to TRPCError TOO_MANY_REQUESTS', () => {
      const appError = new QuotaExceededError('Rate limit hit');

      try {
        wrapTRPCError(appError, defaultContext);
        expect.fail('Should have thrown');
      } catch (e) {
        const thrown = e as TRPCError;
        expect(thrown).toBeInstanceOf(TRPCError);
        expect(thrown.code).toBe('TOO_MANY_REQUESTS');
        expect(thrown.cause).toBe(appError);
      }
    });

    it('converts BadRequestError to TRPCError BAD_REQUEST', () => {
      const appError = new BadRequestError('Invalid input');

      try {
        wrapTRPCError(appError, defaultContext);
        expect.fail('Should have thrown');
      } catch (e) {
        const thrown = e as TRPCError;
        expect(thrown).toBeInstanceOf(TRPCError);
        expect(thrown.code).toBe('BAD_REQUEST');
        expect(thrown.cause).toBe(appError);
      }
    });

    it('converts InternalError to TRPCError INTERNAL_SERVER_ERROR', () => {
      const appError = new InternalError('Something broke');

      try {
        wrapTRPCError(appError, defaultContext);
        expect.fail('Should have thrown');
      } catch (e) {
        const thrown = e as TRPCError;
        expect(thrown).toBeInstanceOf(TRPCError);
        expect(thrown.code).toBe('INTERNAL_SERVER_ERROR');
        expect(thrown.cause).toBe(appError);
      }
    });
  });

  describe('PipelineError conversion', () => {
    it('converts transient LLMError to TOO_MANY_REQUESTS', () => {
      const pipelineError = new LLMError('Model timeout', 'openrouter', 'gpt-4', 429);

      try {
        wrapTRPCError(pipelineError, defaultContext);
        expect.fail('Should have thrown');
      } catch (e) {
        const thrown = e as TRPCError;
        expect(thrown).toBeInstanceOf(TRPCError);
        expect(thrown.code).toBe('TOO_MANY_REQUESTS');
        expect(thrown.cause).toBe(pipelineError);
      }
    });

    it('converts transient NetworkError to TOO_MANY_REQUESTS', () => {
      const pipelineError = new NetworkError('Connection refused', 'https://api.example.com');

      try {
        wrapTRPCError(pipelineError, defaultContext);
        expect.fail('Should have thrown');
      } catch (e) {
        const thrown = e as TRPCError;
        expect(thrown).toBeInstanceOf(TRPCError);
        expect(thrown.code).toBe('TOO_MANY_REQUESTS');
        expect(thrown.cause).toBe(pipelineError);
      }
    });

    it('converts internal DatabaseError to INTERNAL_SERVER_ERROR', () => {
      const pipelineError = new DatabaseError('Insert failed', 'insert', 'courses');

      try {
        wrapTRPCError(pipelineError, defaultContext);
        expect.fail('Should have thrown');
      } catch (e) {
        const thrown = e as TRPCError;
        expect(thrown).toBeInstanceOf(TRPCError);
        expect(thrown.code).toBe('INTERNAL_SERVER_ERROR');
        expect(thrown.cause).toBe(pipelineError);
      }
    });

    it('converts validation BarrierFailedError to BAD_REQUEST', () => {
      const pipelineError = new BarrierFailedError(4, 2, 5);

      try {
        wrapTRPCError(pipelineError, defaultContext);
        expect.fail('Should have thrown');
      } catch (e) {
        const thrown = e as TRPCError;
        expect(thrown).toBeInstanceOf(TRPCError);
        expect(thrown.code).toBe('BAD_REQUEST');
        expect(thrown.cause).toBe(pipelineError);
      }
    });
  });

  describe('generic error fallback', () => {
    it('wraps plain Error as INTERNAL_SERVER_ERROR', () => {
      const plainError = new Error('Something unexpected');

      try {
        wrapTRPCError(plainError, defaultContext);
        expect.fail('Should have thrown');
      } catch (e) {
        const thrown = e as TRPCError;
        expect(thrown).toBeInstanceOf(TRPCError);
        expect(thrown.code).toBe('INTERNAL_SERVER_ERROR');
        expect(thrown.cause).toBe(plainError);
      }
    });

    it('wraps string error as INTERNAL_SERVER_ERROR', () => {
      try {
        wrapTRPCError('string error', defaultContext);
        expect.fail('Should have thrown');
      } catch (e) {
        const thrown = e as TRPCError;
        expect(thrown).toBeInstanceOf(TRPCError);
        expect(thrown.code).toBe('INTERNAL_SERVER_ERROR');
        expect(thrown.message).toContain('Test operation');
      }
    });
  });

  describe('development mode messages', () => {
    it('includes detailed message for PipelineError in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      try {
        const pipelineError = new LLMError('Rate limit exceeded', 'openrouter');
        wrapTRPCError(pipelineError, defaultContext);
        expect.fail('Should have thrown');
      } catch (e) {
        const thrown = e as TRPCError;
        expect(thrown.message).toContain('Test operation');
        expect(thrown.message).toContain('Rate limit exceeded');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });
});
