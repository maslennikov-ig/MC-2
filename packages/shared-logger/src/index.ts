/**
 * @module @megacampus/shared-logger
 *
 * Centralized Pino logger with Axiom integration for the MegaCampus platform.
 *
 * Features:
 * - Structured JSON logging
 * - Axiom transport in production
 * - pino-pretty in development
 * - PII redaction
 * - Custom error serialization
 */
import pino, { Logger } from 'pino';
import { getTransportConfig } from './transports';
import type { ChildLoggerContext } from './types';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: process.env.SERVICE_NAME || 'megacampus',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '0.0.0',
  },
  transport: getTransportConfig(),
  redact: {
    paths: [
      'password',
      'token',
      'apiKey',
      'api_key',
      'secret',
      'access_token',
      'refresh_token',
      'accessToken',
      'refreshToken',
      '*.password',
      '*.token',
      '*.apiKey',
      '*.secret',
      'req.headers.authorization',
      'req.headers.cookie',
      'headers.authorization',
      'headers.cookie',
    ],
    remove: true,
  },
  serializers: {
    err: (err: Error) => ({
      type: err.constructor.name,
      message: err.message,
      stack: err.stack,
      code: (err as NodeJS.ErrnoException).code,
      cause: err.cause ? {
        message: (err.cause as Error).message,
        stack: (err.cause as Error).stack,
      } : undefined,
    }),
  },
});

/**
 * Creates a child logger with custom context fields
 *
 * Child loggers inherit all configuration from parent but add
 * context fields that appear in every log message.
 *
 * @param context - Context fields to add to all log messages
 * @returns A new Pino logger instance with bound context
 *
 * @example
 * ```typescript
 * const jobLogger = createChildLogger({
 *   module: 'worker',
 *   jobId: 'job-123'
 * });
 * jobLogger.info({ status: 'started' }, 'Job processing');
 * ```
 */
export function createChildLogger(context: ChildLoggerContext): Logger {
  return logger.child(context);
}

/**
 * Creates a child logger for a specific module/service
 *
 * @param module - Module or service name
 * @returns A Pino logger with module context
 *
 * @example
 * ```typescript
 * const authLogger = createModuleLogger('auth-service');
 * authLogger.info('User authenticated');
 * ```
 */
export function createModuleLogger(module: string): Logger {
  return logger.child({ module });
}

/**
 * Creates a child logger for HTTP request correlation
 *
 * @param requestId - Unique request identifier
 * @param userId - Optional user identifier
 * @returns A Pino logger with request context
 *
 * @example
 * ```typescript
 * const reqLogger = createRequestLogger(req.headers['x-request-id'], user?.id);
 * reqLogger.info('Processing request');
 * ```
 */
export function createRequestLogger(requestId: string, userId?: string): Logger {
  return logger.child({ requestId, userId });
}

export { logger };
export default logger;
export type { Logger } from 'pino';
export type { ChildLoggerContext, LoggerOptions } from './types';
