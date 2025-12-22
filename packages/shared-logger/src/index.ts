/**
 * @module @megacampus/shared-logger
 *
 * Centralized Pino logger with Axiom integration for the MegaCampus platform.
 *
 * Features:
 * - Structured JSON logging
 * - Axiom transport in production
 * - Synchronous stdout in development (prevents Next.js worker thread issues)
 * - PII redaction
 * - Custom error serialization
 *
 * Development Usage:
 * - Default: JSON output to stdout (sync, no worker threads)
 * - Pretty print: `pnpm dev | pino-pretty` or set PINO_PRETTY=1
 *
 * Production Usage:
 * - Async transport to Axiom (if configured) and stdout
 */
import pino, { Logger, DestinationStream, LoggerOptions } from 'pino';
import { getTransportConfig } from './transports';
import type { ChildLoggerContext } from './types';

/**
 * Creates the appropriate destination for logging.
 *
 * NOTE: This module is Node.js-only. For browser logging, use
 * '@/lib/client-logger' in the web package.
 *
 * In development: Uses pino.destination with sync:true to avoid worker threads.
 * This prevents "the worker has exited" errors in Next.js Server Components.
 *
 * In production: Uses async transports for better performance.
 */
function createLoggerDestination(): DestinationStream | undefined {
  const transportConfig = getTransportConfig();

  // If transport config is defined (production), let pino handle it
  if (transportConfig) {
    return undefined;
  }

  // Development: Use synchronous stdout destination
  // This avoids worker threads that cause issues with Next.js HMR and Server Components
  return pino.destination({
    dest: 1, // stdout
    sync: true, // Critical: synchronous writes prevent worker thread issues
  });
}

const loggerOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: process.env.SERVICE_NAME || 'megacampus',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '0.0.0',
  },
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
};

// Add transport config only in production (when it's defined)
const transportConfig = getTransportConfig();
if (transportConfig) {
  loggerOptions.transport = transportConfig;
}

// Create logger with appropriate destination
const destination = createLoggerDestination();
const logger = destination
  ? pino(loggerOptions, destination)
  : pino(loggerOptions);

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
