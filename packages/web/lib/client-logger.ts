/**
 * Client-side logger for browser environments
 *
 * Uses console.* with color styling for better visibility.
 * This is a lightweight alternative to Pino for browser use.
 *
 * IMPORTANT: Use this logger in 'use client' components.
 * For server components, API routes, and actions, use '@/lib/logger' instead.
 *
 * @example
 * ```typescript
 * 'use client';
 * import { logger } from '@/lib/client-logger';
 *
 * logger.error('Login failed:', error);
 * logger.info('User action completed', { userId });
 * logger.devLog('Debug info'); // Only logs in development
 * ```
 */

const isDevelopment =
  process.env.NEXT_PUBLIC_NODE_ENV === 'development' ||
  process.env.NODE_ENV === 'development';

/**
 * Check if value is an Error or error-like object
 * Handles cross-realm errors (e.g., Supabase AuthError) where instanceof fails
 */
function isErrorLike(arg: unknown): arg is Error & { code?: string; status?: number } {
  if (arg instanceof Error) return true;
  if (!arg || typeof arg !== 'object') return false;
  const obj = arg as Record<string, unknown>;
  return (
    typeof obj.message === 'string' &&
    (typeof obj.name === 'string' || typeof obj.stack === 'string' || 'code' in obj)
  );
}

/**
 * Format error for console output
 */
function formatError(error: Error & { code?: string; status?: number }): string {
  const parts = [error.message];
  if (error.code) parts.push(`[${error.code}]`);
  if (error.status) parts.push(`(${error.status})`);
  return parts.join(' ');
}

/**
 * Process arguments for console output
 * Extracts error messages and formats objects
 */
function processArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (isErrorLike(arg)) {
      return formatError(arg);
    }
    return arg;
  });
}

interface ClientLogger {
  debug: (msg: string, ...args: unknown[]) => void;
  info: (msg: string, ...args: unknown[]) => void;
  warn: (msg: string, ...args: unknown[]) => void;
  error: (msg: string, ...args: unknown[]) => void;
  fatal: (msg: string, ...args: unknown[]) => void;
  devLog: (msg: string, ...args: unknown[]) => void;
  child: (bindings: Record<string, unknown>) => ClientLogger;
}

function createClientLogger(context?: Record<string, unknown>): ClientLogger {
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';

  return {
    debug: (msg: string, ...args: unknown[]) => {
      if (!isDevelopment) return;
      console.debug(
        '%c[DEBUG]%c ' + msg + contextStr,
        'color: #888; font-weight: bold',
        'color: inherit',
        ...processArgs(args)
      );
    },

    info: (msg: string, ...args: unknown[]) => {
      console.info(
        '%c[INFO]%c ' + msg + contextStr,
        'color: #2196F3; font-weight: bold',
        'color: inherit',
        ...processArgs(args)
      );
    },

    warn: (msg: string, ...args: unknown[]) => {
      console.warn(
        '%c[WARN]%c ' + msg + contextStr,
        'color: #FF9800; font-weight: bold',
        'color: inherit',
        ...processArgs(args)
      );
    },

    error: (msg: string, ...args: unknown[]) => {
      console.error(
        '%c[ERROR]%c ' + msg + contextStr,
        'color: #F44336; font-weight: bold',
        'color: inherit',
        ...processArgs(args)
      );
    },

    /**
     * Log fatal error with prominent styling
     * In browser context, this is equivalent to error() but with distinct styling
     * for API parity with server logger (Pino)
     */
    fatal: (msg: string, ...args: unknown[]) => {
      console.error(
        '%c[FATAL]%c ' + msg + contextStr,
        'color: #FFFFFF; background: #B71C1C; font-weight: bold; padding: 2px 6px; border-radius: 2px',
        'color: inherit',
        ...processArgs(args)
      );
    },

    /**
     * Development-only logging
     * Useful for debugging without cluttering production logs
     */
    devLog: (msg: string, ...args: unknown[]) => {
      if (!isDevelopment) return;
      console.debug(
        '%c[DEV]%c ' + msg + contextStr,
        'color: #9C27B0; font-weight: bold',
        'color: inherit',
        ...processArgs(args)
      );
    },

    /**
     * Create a child logger with additional context
     *
     * Note: Unlike server logger (Pino), this only supports simple context bindings.
     * Pino-specific options like serializers, redaction, or custom formatters
     * are not available in the client logger.
     *
     * @param bindings - Context fields to include in all log messages
     * @returns A new ClientLogger with the merged context
     *
     * @example
     * ```typescript
     * const authLogger = logger.child({ component: 'LoginForm' });
     * authLogger.error('Login failed', { code: 'AUTH_ERROR' });
     * // Output: [ERROR] Login failed {"component":"LoginForm"} {code: "AUTH_ERROR"}
     * ```
     */
    child: (bindings: Record<string, unknown>) => {
      return createClientLogger({ ...context, ...bindings });
    },
  };
}

/**
 * Client-side logger instance
 *
 * Use this in 'use client' components instead of the server logger.
 */
export const logger = createClientLogger();

/**
 * Create a child logger with context for a specific component or feature
 *
 * @example
 * ```typescript
 * const authLogger = createLogger({ component: 'LoginForm' });
 * authLogger.error('Login failed:', error);
 * ```
 */
export function createLogger(context: Record<string, unknown>): ClientLogger {
  return createClientLogger(context);
}

/**
 * @deprecated Use `logger` from '@/lib/client-logger' instead
 * This export is for backward compatibility only.
 */
export const clientLogger = logger;

export default logger;
