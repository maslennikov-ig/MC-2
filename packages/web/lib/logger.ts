/**
 * Logger for Next.js web application
 *
 * Server-side: Uses Pino with Axiom transport via wrapper
 * Client-side: Uses structured console logging with color styling
 *
 * NOTE: This wrapper accepts arguments in (message, ...args) order
 * for backward compatibility with existing console-style logging,
 * but internally converts to Pino's (object, message) format.
 */
import { createModuleLogger } from '@megacampus/shared-logger';
import type { Logger as PinoLogger } from '@megacampus/shared-logger';

// Create base module logger from shared package
const pinoLogger = createModuleLogger('web');

/**
 * Convert variadic arguments to a data object for Pino
 * Handles Error objects, plain objects, and primitives
 * Optimized to avoid unnecessary object copies
 */
function argsToObject(args: unknown[]): Record<string, unknown> | undefined {
  if (args.length === 0) return undefined;

  if (args.length === 1) {
    const arg = args[0];

    // Handle Error objects with cause chain
    if (arg instanceof Error) {
      return {
        error: arg.message,
        stack: arg.stack,
        name: arg.name,
        ...(arg.cause ? { cause: String(arg.cause) } : {}),
      };
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
    if (arg instanceof Error) {
      const suffix = i > 0 ? String(i) : '';
      result[`error${suffix}`] = arg.message;
      result[`stack${suffix}`] = arg.stack;
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

/**
 * Detect if running in development mode
 * Works in both Node.js and browser environments
 */
const isDevelopment = (() => {
  if (typeof window !== 'undefined') {
    // Browser: use build-time injected value
    return (
      process.env.NEXT_PUBLIC_NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'development'
    );
  }
  return process.env.NODE_ENV === 'development';
})();

/**
 * Client-side logger for browser environments
 *
 * Uses console.* with color styling for better visibility.
 * Safe to use in both client and server components.
 */
export const clientLogger = {
  /**
   * Log debug message (development only)
   */
  debug: (msg: string, ...args: unknown[]) => {
    if (!isDevelopment) return;
    console.debug(
      '%c[DEBUG]%c ' + msg,
      'color: #888; font-weight: bold',
      'color: inherit',
      ...args
    );
  },

  /**
   * Log info message
   */
  info: (msg: string, ...args: unknown[]) => {
    console.info(
      '%c[INFO]%c ' + msg,
      'color: #2196F3; font-weight: bold',
      'color: inherit',
      ...args
    );
  },

  /**
   * Log warning message
   */
  warn: (msg: string, ...args: unknown[]) => {
    console.warn(
      '%c[WARN]%c ' + msg,
      'color: #FF9800; font-weight: bold',
      'color: inherit',
      ...args
    );
  },

  /**
   * Log error message
   */
  error: (msg: string, ...args: unknown[]) => {
    console.error(
      '%c[ERROR]%c ' + msg,
      'color: #F44336; font-weight: bold',
      'color: inherit',
      ...args
    );
  },
};

export default logger;
