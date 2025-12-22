/**
 * Server-side logger for Next.js web application
 *
 * Uses Pino with Axiom transport via @megacampus/shared-logger.
 *
 * IMPORTANT: This module is SERVER-ONLY. Do NOT import in 'use client' components.
 * For client-side logging, use '@/lib/client-logger' instead.
 *
 * NOTE: This wrapper accepts arguments in (message, ...args) order
 * for backward compatibility with existing console-style logging,
 * but internally converts to Pino's (object, message) format.
 *
 * @example
 * ```typescript
 * // Server Component, API Route, or Server Action
 * import { logger } from '@/lib/logger';
 *
 * logger.info('Processing request', { userId });
 * logger.error('Failed to process', error);
 * ```
 */
import 'server-only';

import { createModuleLogger } from '@megacampus/shared-logger';
import type { Logger as PinoLogger } from '@megacampus/shared-logger';

// Create base module logger from shared package
const pinoLogger = createModuleLogger('web');

/**
 * Check if value is an Error or error-like object
 * Handles cross-realm errors (e.g., Supabase AuthError) where instanceof fails
 */
function isErrorLike(arg: unknown): arg is Error & { code?: string; status?: number } {
  if (arg instanceof Error) return true;
  if (!arg || typeof arg !== 'object') return false;
  const obj = arg as Record<string, unknown>;
  // Error-like: has message and either name, stack, or code
  return typeof obj.message === 'string' &&
    (typeof obj.name === 'string' || typeof obj.stack === 'string' || 'code' in obj);
}

/**
 * Extract error properties for logging
 */
function extractErrorProps(arg: Error & { code?: string; status?: number }): Record<string, unknown> {
  return {
    error: arg.message,
    ...(arg.stack ? { stack: arg.stack } : {}),
    ...(arg.name ? { name: arg.name } : {}),
    ...(arg.code ? { code: arg.code } : {}),
    ...('status' in arg ? { status: arg.status } : {}),
    ...(arg.cause ? { cause: String(arg.cause) } : {}),
  };
}

/**
 * Convert variadic arguments to a data object for Pino
 * Handles Error objects, error-like objects (e.g., AuthError), plain objects, and primitives
 * Optimized to avoid unnecessary object copies
 */
function argsToObject(args: unknown[]): Record<string, unknown> | undefined {
  if (args.length === 0) return undefined;

  if (args.length === 1) {
    const arg = args[0];

    // Handle Error and error-like objects (including Supabase AuthError)
    if (isErrorLike(arg)) {
      return extractErrorProps(arg);
    }

    // Fast path: plain objects - return as-is, let Pino serialize
    // This avoids the spread operation that creates a copy
    if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
      return arg as Record<string, unknown>;
    }

    // Primitives
    return { data: arg };
  }

  // Multiple arguments - combine into object using for loop (faster than forEach)
  const result: Record<string, unknown> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (isErrorLike(arg)) {
      const suffix = i > 0 ? String(i) : '';
      result[`error${suffix}`] = arg.message;
      if (arg.stack) result[`stack${suffix}`] = arg.stack;
      if (arg.code) result[`code${suffix}`] = arg.code;
    } else if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
      Object.assign(result, arg);
    } else if (arg !== undefined) {
      result[`arg${i}`] = arg;
    }
  }
  return result;
}

/**
 * FlexibleLogger interface that accepts (msg, ...args) order
 *
 * This wrapper maintains backward compatibility with console-style logging
 * while internally converting to Pino's (object, message) format.
 *
 * @example
 * ```typescript
 * import { logger } from '@/lib/logger';
 *
 * // Console-style (backward compatible)
 * logger.info('User logged in', { userId: '123' });
 *
 * // Multiple arguments
 * logger.error('Failed to process', error, { context: 'data' });
 * ```
 */
interface FlexibleLogger {
  debug: (msg: string, ...args: unknown[]) => void;
  info: (msg: string, ...args: unknown[]) => void;
  warn: (msg: string, ...args: unknown[]) => void;
  error: (msg: string, ...args: unknown[]) => void;
  devLog: (msg: string, ...args: unknown[]) => void;
  child: (bindings: Record<string, unknown>) => FlexibleLogger;
}

function createFlexibleLogger(pino: PinoLogger): FlexibleLogger {
  const isDevelopment = process.env.NODE_ENV === 'development';

  return {
    debug: (msg: string, ...args: unknown[]) => {
      const data = argsToObject(args);
      if (data) {
        pino.debug(data, msg);
      } else {
        pino.debug(msg);
      }
    },
    info: (msg: string, ...args: unknown[]) => {
      const data = argsToObject(args);
      if (data) {
        pino.info(data, msg);
      } else {
        pino.info(msg);
      }
    },
    warn: (msg: string, ...args: unknown[]) => {
      const data = argsToObject(args);
      if (data) {
        pino.warn(data, msg);
      } else {
        pino.warn(msg);
      }
    },
    error: (msg: string, ...args: unknown[]) => {
      const data = argsToObject(args);
      if (data) {
        pino.error(data, msg);
      } else {
        pino.error(msg);
      }
    },
    // devLog only logs in development
    devLog: (msg: string, ...args: unknown[]) => {
      if (isDevelopment) {
        const data = argsToObject(args);
        if (data) {
          pino.debug(data, `[DEV] ${msg}`);
        } else {
          pino.debug(`[DEV] ${msg}`);
        }
      }
    },
    child: (bindings: Record<string, unknown>) => {
      return createFlexibleLogger(pino.child(bindings));
    },
  };
}

// Export server-side logger with flexible API
export const logger: FlexibleLogger = createFlexibleLogger(pinoLogger);

// Factory for API route loggers
export function createApiLogger(route: string): FlexibleLogger {
  return logger.child({ route });
}

// Factory for server action loggers
export function createActionLogger(action: string): FlexibleLogger {
  return logger.child({ action });
}

export default logger;
