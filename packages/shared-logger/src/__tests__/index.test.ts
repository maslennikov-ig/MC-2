import { describe, it, expect, beforeEach, vi } from 'vitest';
import pino from 'pino';

// Mock pino before importing the module
vi.mock('pino', () => {
  const mockChild = vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  }));

  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: mockChild,
  };

  return {
    default: vi.fn(() => mockLogger),
    __mockLogger: mockLogger,
    __mockChild: mockChild,
  };
});

// Mock transport config
vi.mock('../transports', () => ({
  getTransportConfig: vi.fn(() => ({
    target: 'pino-pretty',
    options: { colorize: true },
  })),
}));

describe('shared-logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('logger initialization', () => {
    it('creates logger with correct configuration', async () => {
      // Re-import to trigger initialization
      vi.resetModules();
      await import('../index');

      expect(pino).toHaveBeenCalledWith(
        expect.objectContaining({
          level: expect.any(String),
          base: expect.objectContaining({
            service: expect.any(String),
            environment: expect.any(String),
            version: expect.any(String),
          }),
          redact: expect.objectContaining({
            paths: expect.arrayContaining(['password', 'token']),
            remove: true,
          }),
          serializers: expect.objectContaining({
            err: expect.any(Function),
          }),
        })
      );
    });
  });

  describe('createModuleLogger', () => {
    it('creates child logger with module context', async () => {
      vi.resetModules();
      const { createModuleLogger } = await import('../index');
      const { __mockChild } = await import('pino') as any;

      const moduleLogger = createModuleLogger('test-module');

      expect(__mockChild).toHaveBeenCalledWith({ module: 'test-module' });
      expect(moduleLogger).toBeDefined();
    });

    it('creates unique loggers for different modules', async () => {
      vi.resetModules();
      const { createModuleLogger } = await import('../index');
      const { __mockChild } = await import('pino') as any;

      createModuleLogger('auth');
      createModuleLogger('payments');

      expect(__mockChild).toHaveBeenCalledWith({ module: 'auth' });
      expect(__mockChild).toHaveBeenCalledWith({ module: 'payments' });
    });
  });

  describe('createRequestLogger', () => {
    it('creates child logger with requestId only', async () => {
      vi.resetModules();
      const { createRequestLogger } = await import('../index');
      const { __mockChild } = await import('pino') as any;

      const reqLogger = createRequestLogger('req-123');

      expect(__mockChild).toHaveBeenCalledWith({
        requestId: 'req-123',
        userId: undefined,
      });
      expect(reqLogger).toBeDefined();
    });

    it('creates child logger with requestId and userId', async () => {
      vi.resetModules();
      const { createRequestLogger } = await import('../index');
      const { __mockChild } = await import('pino') as any;

      const reqLogger = createRequestLogger('req-456', 'user-789');

      expect(__mockChild).toHaveBeenCalledWith({
        requestId: 'req-456',
        userId: 'user-789',
      });
      expect(reqLogger).toBeDefined();
    });
  });

  describe('createChildLogger', () => {
    it('creates child logger with custom context', async () => {
      vi.resetModules();
      const { createChildLogger } = await import('../index');
      const { __mockChild } = await import('pino') as any;

      const context = {
        jobId: 'job-123',
        module: 'worker',
        courseId: 'course-abc',
      };

      const childLogger = createChildLogger(context);

      expect(__mockChild).toHaveBeenCalledWith(context);
      expect(childLogger).toBeDefined();
    });

    it('creates child logger with minimal context', async () => {
      vi.resetModules();
      const { createChildLogger } = await import('../index');
      const { __mockChild } = await import('pino') as any;

      const childLogger = createChildLogger({ module: 'test' });

      expect(__mockChild).toHaveBeenCalledWith({ module: 'test' });
      expect(childLogger).toBeDefined();
    });
  });

  describe('error serializer', () => {
    it('serializes basic error correctly', async () => {
      vi.resetModules();
      await import('../index');

      // Get the serializer from the pino call
      const pinoCall = (pino as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const errSerializer = pinoCall.serializers.err;

      const error = new Error('Test error');
      const serialized = errSerializer(error);

      expect(serialized).toMatchObject({
        type: 'Error',
        message: 'Test error',
        stack: expect.any(String),
      });
    });

    it('serializes error with cause', async () => {
      vi.resetModules();
      await import('../index');

      const pinoCall = (pino as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const errSerializer = pinoCall.serializers.err;

      const cause = new Error('Root cause');
      const error = new Error('Wrapper error', { cause });
      const serialized = errSerializer(error);

      expect(serialized).toMatchObject({
        type: 'Error',
        message: 'Wrapper error',
        cause: {
          message: 'Root cause',
          stack: expect.any(String),
        },
      });
    });

    it('serializes error with code', async () => {
      vi.resetModules();
      await import('../index');

      const pinoCall = (pino as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const errSerializer = pinoCall.serializers.err;

      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      const serialized = errSerializer(error);

      expect(serialized).toMatchObject({
        type: 'Error',
        message: 'ENOENT',
        code: 'ENOENT',
      });
    });
  });

  describe('PII redaction', () => {
    it('has correct redaction paths configured', async () => {
      vi.resetModules();
      await import('../index');

      const pinoCall = (pino as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];

      expect(pinoCall.redact.paths).toContain('password');
      expect(pinoCall.redact.paths).toContain('token');
      expect(pinoCall.redact.paths).toContain('apiKey');
      expect(pinoCall.redact.paths).toContain('secret');
      expect(pinoCall.redact.paths).toContain('access_token');
      expect(pinoCall.redact.paths).toContain('refresh_token');
      expect(pinoCall.redact.paths).toContain('*.password');
      expect(pinoCall.redact.paths).toContain('req.headers.authorization');
      expect(pinoCall.redact.paths).toContain('headers.cookie');
    });

    it('uses remove mode for redaction', async () => {
      vi.resetModules();
      await import('../index');

      const pinoCall = (pino as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];

      expect(pinoCall.redact.remove).toBe(true);
    });
  });

  describe('exports', () => {
    it('exports logger as default', async () => {
      vi.resetModules();
      const module = await import('../index');

      expect(module.default).toBeDefined();
      expect(module.logger).toBeDefined();
      expect(module.default).toBe(module.logger);
    });

    it('exports factory functions', async () => {
      vi.resetModules();
      const module = await import('../index');

      expect(typeof module.createModuleLogger).toBe('function');
      expect(typeof module.createRequestLogger).toBe('function');
      expect(typeof module.createChildLogger).toBe('function');
    });
  });
});
