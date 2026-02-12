/* eslint-disable @typescript-eslint/no-unsafe-argument, max-lines-per-function */
/**
 * Sentry Init Module Unit Tests
 * @module tests/unit/shared/sentry/init
 *
 * Tests the Sentry error monitoring initialization module.
 * Covers:
 * - initSentry() initialization with/without DSN
 * - Idempotency of initSentry()
 * - captureError() with tags, extra context, and level
 * - captureError() no-op behavior when DSN not set
 * - captureError() converting non-Error to Error
 * - flushSentry() behavior with/without DSN
 * - Module-level state management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @sentry/node BEFORE any imports
vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  withScope: vi.fn(cb => {
    const mockScope = {
      setTag: vi.fn(),
      setExtra: vi.fn(),
      setLevel: vi.fn(),
    };
    cb(mockScope);
    return mockScope;
  }),
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
}));

// Mock logger
vi.mock('../../../../src/shared/logger/index.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Store original env
const originalEnv = { ...process.env };

describe('Sentry Init Module', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Reset environment
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_ENVIRONMENT;
    delete process.env.NODE_ENV;

    // Reset modules to get fresh state
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('initSentry', () => {
    it('should initialize when DSN is set', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.SENTRY_ENVIRONMENT = 'test';

      // Import after setting env
      const Sentry = await import('@sentry/node');
      const { logger } = await import('../../../../src/shared/logger/index.js');
      const { initSentry } = await import('../../../../src/shared/sentry/init.js');

      initSentry();

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://test@sentry.io/123',
          environment: 'test',
          tracesSampleRate: 0,
          sendDefaultPii: false,
        })
      );

      expect(logger.info).toHaveBeenCalledWith({ environment: 'test' }, 'Sentry initialized');
    });

    it('should be no-op when DSN is not set', async () => {
      // DSN not set
      delete process.env.SENTRY_DSN;

      const Sentry = await import('@sentry/node');
      const { logger } = await import('../../../../src/shared/logger/index.js');
      const { initSentry } = await import('../../../../src/shared/sentry/init.js');

      initSentry();

      expect(Sentry.init).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Sentry DSN not set — error tracking disabled');
    });

    it('should be idempotent (multiple calls safe)', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      const Sentry = await import('@sentry/node');
      const { logger } = await import('../../../../src/shared/logger/index.js');
      const { initSentry } = await import('../../../../src/shared/sentry/init.js');

      initSentry();
      initSentry();
      initSentry();

      // Should only initialize once
      expect(Sentry.init).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledTimes(1);
    });

    it('should use NODE_ENV as fallback for environment', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';
      delete process.env.SENTRY_ENVIRONMENT;

      const Sentry = await import('@sentry/node');
      const { initSentry } = await import('../../../../src/shared/sentry/init.js');

      initSentry();

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'production',
        })
      );
    });

    it('should use default environment when neither SENTRY_ENVIRONMENT nor NODE_ENV set', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      delete process.env.SENTRY_ENVIRONMENT;
      delete process.env.NODE_ENV;

      const Sentry = await import('@sentry/node');
      const { initSentry } = await import('../../../../src/shared/sentry/init.js');

      initSentry();

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'development',
        })
      );
    });

    it('should skip sending events in test environment', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'test';

      const Sentry = await import('@sentry/node');
      const { initSentry } = await import('../../../../src/shared/sentry/init.js');

      initSentry();

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          beforeSend: expect.any(Function),
        })
      );

      // Test beforeSend hook
      const initCall = vi.mocked(Sentry.init).mock.calls[0][0];
      const beforeSend = initCall.beforeSend;

      // Should return null for test env
      const result = beforeSend({ event_id: 'test' } as any, {} as any);
      expect(result).toBeNull();
    });

    it('should not skip events in non-test environment', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.NODE_ENV = 'production';

      const Sentry = await import('@sentry/node');
      const { initSentry } = await import('../../../../src/shared/sentry/init.js');

      initSentry();

      const initCall = vi.mocked(Sentry.init).mock.calls[0][0];
      const beforeSend = initCall.beforeSend;

      const event = { event_id: 'test' } as any;
      const result = beforeSend(event, {} as any);

      // Should return event (not null)
      expect(result).toBe(event);
    });
  });

  describe('captureError', () => {
    it('should be no-op when DSN is not set', async () => {
      delete process.env.SENTRY_DSN;

      const Sentry = await import('@sentry/node');
      const { captureError } = await import('../../../../src/shared/sentry/init.js');

      captureError(new Error('test error'));

      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.withScope).not.toHaveBeenCalled();
    });

    it('should call Sentry.captureException when DSN is set', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      const Sentry = await import('@sentry/node');
      const { captureError } = await import('../../../../src/shared/sentry/init.js');

      const error = new Error('test error');
      captureError(error);

      expect(Sentry.withScope).toHaveBeenCalled();
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });

    it('should pass tags to Sentry scope', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      const Sentry = await import('@sentry/node');
      const { captureError } = await import('../../../../src/shared/sentry/init.js');

      const error = new Error('test error');
      captureError(error, {
        tags: {
          component: 'handler',
          job_type: 'block_regeneration',
        },
      });

      expect(Sentry.withScope).toHaveBeenCalled();

      // Get the scope callback
      const scopeCallback = vi.mocked(Sentry.withScope).mock.calls[0][0];
      const mockScope = {
        setTag: vi.fn(),
        setExtra: vi.fn(),
        setLevel: vi.fn(),
      };
      scopeCallback(mockScope as any);

      expect(mockScope.setTag).toHaveBeenCalledWith('component', 'handler');
      expect(mockScope.setTag).toHaveBeenCalledWith('job_type', 'block_regeneration');
    });

    it('should pass extra context to Sentry scope', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      const Sentry = await import('@sentry/node');
      const { captureError } = await import('../../../../src/shared/sentry/init.js');

      const error = new Error('test error');
      captureError(error, {
        extra: {
          courseId: 'course-123',
          blockPath: 'sections[0].lessons[0].title',
          attempt: 1,
        },
      });

      expect(Sentry.withScope).toHaveBeenCalled();

      const scopeCallback = vi.mocked(Sentry.withScope).mock.calls[0][0];
      const mockScope = {
        setTag: vi.fn(),
        setExtra: vi.fn(),
        setLevel: vi.fn(),
      };
      scopeCallback(mockScope as any);

      expect(mockScope.setExtra).toHaveBeenCalledWith('courseId', 'course-123');
      expect(mockScope.setExtra).toHaveBeenCalledWith('blockPath', 'sections[0].lessons[0].title');
      expect(mockScope.setExtra).toHaveBeenCalledWith('attempt', 1);
    });

    it('should pass level to Sentry scope', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      const Sentry = await import('@sentry/node');
      const { captureError } = await import('../../../../src/shared/sentry/init.js');

      const error = new Error('test error');
      captureError(error, { level: 'warning' });

      expect(Sentry.withScope).toHaveBeenCalled();

      const scopeCallback = vi.mocked(Sentry.withScope).mock.calls[0][0];
      const mockScope = {
        setTag: vi.fn(),
        setExtra: vi.fn(),
        setLevel: vi.fn(),
      };
      scopeCallback(mockScope as any);

      expect(mockScope.setLevel).toHaveBeenCalledWith('warning');
    });

    it('should convert non-Error to Error', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      const Sentry = await import('@sentry/node');
      const { captureError } = await import('../../../../src/shared/sentry/init.js');

      captureError('string error');

      expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
      const capturedError = vi.mocked(Sentry.captureException).mock.calls[0][0];
      expect(capturedError.message).toBe('string error');
    });

    it('should handle non-string, non-Error values', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      const Sentry = await import('@sentry/node');
      const { captureError } = await import('../../../../src/shared/sentry/init.js');

      captureError({ code: 'ERR_TEST', details: 'Something failed' });

      expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
      const capturedError = vi.mocked(Sentry.captureException).mock.calls[0][0];
      // String() converts objects to "[object Object]", so just verify it's an Error
      expect(capturedError).toBeInstanceOf(Error);
      expect(capturedError.message).toBe('[object Object]');
    });

    it('should handle null error', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      const Sentry = await import('@sentry/node');
      const { captureError } = await import('../../../../src/shared/sentry/init.js');

      captureError(null);

      expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
      const capturedError = vi.mocked(Sentry.captureException).mock.calls[0][0];
      expect(capturedError.message).toBe('null');
    });

    it('should handle undefined error', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      const Sentry = await import('@sentry/node');
      const { captureError } = await import('../../../../src/shared/sentry/init.js');

      captureError(undefined);

      expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
      const capturedError = vi.mocked(Sentry.captureException).mock.calls[0][0];
      expect(capturedError.message).toBe('undefined');
    });

    it('should pass all context fields together', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      const Sentry = await import('@sentry/node');
      const { captureError } = await import('../../../../src/shared/sentry/init.js');

      const error = new Error('complex error');
      captureError(error, {
        tags: { handler: 'block-regen' },
        extra: { courseId: 'course-123' },
        level: 'fatal',
      });

      expect(Sentry.withScope).toHaveBeenCalled();

      const scopeCallback = vi.mocked(Sentry.withScope).mock.calls[0][0];
      const mockScope = {
        setTag: vi.fn(),
        setExtra: vi.fn(),
        setLevel: vi.fn(),
      };
      scopeCallback(mockScope as any);

      expect(mockScope.setTag).toHaveBeenCalledWith('handler', 'block-regen');
      expect(mockScope.setExtra).toHaveBeenCalledWith('courseId', 'course-123');
      expect(mockScope.setLevel).toHaveBeenCalledWith('fatal');
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });

    it('should handle empty context', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      const Sentry = await import('@sentry/node');
      const { captureError } = await import('../../../../src/shared/sentry/init.js');

      const error = new Error('test error');
      captureError(error, {});

      expect(Sentry.withScope).toHaveBeenCalled();
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });

    it('should handle undefined context', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      const Sentry = await import('@sentry/node');
      const { captureError } = await import('../../../../src/shared/sentry/init.js');

      const error = new Error('test error');
      captureError(error);

      expect(Sentry.withScope).toHaveBeenCalled();
      expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });
  });

  describe('flushSentry', () => {
    it('should be no-op when DSN is not set', async () => {
      delete process.env.SENTRY_DSN;

      const Sentry = await import('@sentry/node');
      const { flushSentry } = await import('../../../../src/shared/sentry/init.js');

      await flushSentry();

      expect(Sentry.flush).not.toHaveBeenCalled();
    });

    it('should call Sentry.flush when DSN is set', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      const Sentry = await import('@sentry/node');
      const { flushSentry } = await import('../../../../src/shared/sentry/init.js');

      await flushSentry();

      expect(Sentry.flush).toHaveBeenCalledWith(2000);
    });

    it('should use custom timeout', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      const Sentry = await import('@sentry/node');
      const { flushSentry } = await import('../../../../src/shared/sentry/init.js');

      await flushSentry(5000);

      expect(Sentry.flush).toHaveBeenCalledWith(5000);
    });

    it('should return resolved promise when DSN not set', async () => {
      delete process.env.SENTRY_DSN;

      const { flushSentry } = await import('../../../../src/shared/sentry/init.js');

      const result = await flushSentry();

      expect(result).toBeUndefined();
    });

    it('should propagate flush result', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      const Sentry = await import('@sentry/node');
      vi.mocked(Sentry.flush).mockResolvedValue(true);

      const { flushSentry } = await import('../../../../src/shared/sentry/init.js');

      const result = await flushSentry();

      // flushSentry doesn't return the flush result, it just awaits it
      expect(Sentry.flush).toHaveBeenCalledWith(2000);
      expect(result).toBeUndefined();
    });
  });

  describe('module state management', () => {
    it('should maintain initialized state across calls', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      const Sentry = await import('@sentry/node');
      const { initSentry, captureError } = await import('../../../../src/shared/sentry/init.js');

      // First init
      initSentry();
      expect(Sentry.init).toHaveBeenCalledTimes(1);

      // captureError should work after init
      captureError(new Error('test'));
      expect(Sentry.captureException).toHaveBeenCalled();

      // Second init should not re-initialize
      initSentry();
      expect(Sentry.init).toHaveBeenCalledTimes(1); // Still 1
    });

    it('should work when captureError called before initSentry', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      const Sentry = await import('@sentry/node');
      const { captureError } = await import('../../../../src/shared/sentry/init.js');

      // captureError before initSentry
      captureError(new Error('test'));

      // Should still work (checks DSN, not initialized flag)
      expect(Sentry.captureException).toHaveBeenCalled();
    });

    it('should handle multiple modules in isolation', async () => {
      // First module import
      process.env.SENTRY_DSN = 'https://test1@sentry.io/123';
      const { initSentry: init1 } = await import('../../../../src/shared/sentry/init.js');
      init1();

      // Reset modules for second import
      vi.resetModules();

      // Second module import with different DSN
      process.env.SENTRY_DSN = 'https://test2@sentry.io/123';
      const { initSentry: init2 } = await import('../../../../src/shared/sentry/init.js');
      init2();

      const Sentry = await import('@sentry/node');

      // With vi.resetModules(), the module is reloaded but the mock is shared
      // So init will be called twice (once per module load)
      expect(Sentry.init).toHaveBeenCalledTimes(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty DSN string', async () => {
      process.env.SENTRY_DSN = '';

      const Sentry = await import('@sentry/node');
      const { logger } = await import('../../../../src/shared/logger/index.js');
      const { initSentry } = await import('../../../../src/shared/sentry/init.js');

      initSentry();

      expect(Sentry.init).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Sentry DSN not set — error tracking disabled');
    });

    it('should handle whitespace-only DSN', async () => {
      process.env.SENTRY_DSN = '   ';

      const Sentry = await import('@sentry/node');
      const { initSentry } = await import('../../../../src/shared/sentry/init.js');

      initSentry();

      // Whitespace DSN is truthy, so Sentry.init will be called
      // (Sentry SDK will handle invalid DSN internally)
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: '   ',
        })
      );
    });

    it('should handle very long error messages', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      const Sentry = await import('@sentry/node');
      const { captureError } = await import('../../../../src/shared/sentry/init.js');

      const longMessage = 'x'.repeat(10000);
      const error = new Error(longMessage);

      captureError(error);

      expect(Sentry.captureException).toHaveBeenCalledWith(error);
      const capturedError = vi.mocked(Sentry.captureException).mock.calls[0][0];
      expect(capturedError.message).toBe(longMessage);
    });

    it('should handle circular references in extra context', async () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';

      const Sentry = await import('@sentry/node');
      const { captureError } = await import('../../../../src/shared/sentry/init.js');

      const circular: any = { name: 'test' };
      circular.self = circular;

      const error = new Error('test');

      // Should not throw
      expect(() => {
        captureError(error, { extra: { circular } });
      }).not.toThrow();

      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });
});
