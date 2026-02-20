/**
 * Logger for course-gen-platform
 *
 * Enhanced logger that writes WARN/ERROR logs to both:
 * 1. Console/Axiom (via Pino)
 * 2. error_logs table in Supabase (for admin dashboard visibility)
 *
 * Also exports error logging types and services for centralized error management.
 */
import {
  logger as baseLogger,
  createChildLogger as baseCreateChildLogger,
  createModuleLogger,
  createRequestLogger,
} from '@megacampus/shared-logger';
import type { Logger } from 'pino';
import { getSupabaseAdmin } from '../supabase/admin';
import type { Json } from '@megacampus/shared-types';
import { detectEnvironment } from './utils';
import { shouldAutoMute } from './auto-classification';
import { shouldWriteToDb } from './rate-limiter';

export type { Logger } from 'pino';

// Re-export error logging types and services (these are local)
export * from './types';
export * from './error-service.js';

// Re-export unchanged functions
export { createModuleLogger, createRequestLogger };

/** Safely convert unknown value to string, handling circular references */
function safeStringify(obj: unknown): string {
  if (typeof obj === 'string') return obj;
  if (obj instanceof Error) return obj.message;
  try {
    return JSON.stringify(obj);
  } catch {
    return '[unstringifiable object]';
  }
}

/** Extract error details from unknown error object (Error instances, plain objects, primitives) */
function extractErrorDetails(errorObj: unknown): { errorDetails: Record<string, unknown> } | null {
  if (!errorObj) return null;

  if (typeof errorObj === 'object' && errorObj !== null) {
    const errAny = errorObj as Record<string, unknown>;
    return {
      errorDetails: {
        message: errAny.message || safeStringify(errorObj),
        code: errAny.code,
        name: errAny.name,
      },
    };
  }

  return {
    errorDetails: { message: safeStringify(errorObj) },
  };
}

/**
 * Write log entry to error_logs table (fire-and-forget)
 *
 * IMPORTANT: Failures are logged to console but not retried.
 * This prevents application blocking on database issues.
 * For critical errors, use logPermanentFailure() from error-service.ts instead.
 */
async function writeToErrorLogs(
  level: 'WARNING' | 'ERROR' | 'CRITICAL',
  message: string,
  context: Record<string, unknown> = {}
): Promise<void> {
  try {
    // Pre-insert filter: skip DB write for auto-muted errors
    // These errors are already logged to Pino/Axiom via the original logger call
    const autoMuteResult = shouldAutoMute(message);
    if (autoMuteResult.mute) {
      return;
    }

    // Rate limiter: prevent DB flood during outages (max 5 per message per minute)
    if (!shouldWriteToDb(message)) {
      return;
    }

    const supabase = getSupabaseAdmin();
    const environment = detectEnvironment();

    // Extract known fields from context (support both camelCase and snake_case)
    const ctxAny = context;
    const organizationId = ctxAny.organizationId;
    const organization_id = ctxAny.organization_id;
    const userId = ctxAny.userId;
    const user_id = ctxAny.user_id;
    const jobId = ctxAny.jobId;
    const job_id = ctxAny.job_id;
    const jobType = ctxAny.jobType;
    const job_type = ctxAny.job_type;
    const courseId = ctxAny.courseId;
    const course_id = ctxAny.course_id;
    const lessonId = ctxAny.lessonId;
    const lesson_id = ctxAny.lesson_id;
    const requestId = ctxAny.requestId;
    const request_id = ctxAny.request_id;
    const trpcPath = ctxAny.trpcPath;
    const trpc_path = ctxAny.trpc_path;
    const trpcInput = ctxAny.trpcInput;
    const trpc_input = ctxAny.trpc_input;
    const attemptedValue = ctxAny.attemptedValue;
    const attempted_value = ctxAny.attempted_value;
    const currentValue = ctxAny.currentValue;
    const current_value = ctxAny.current_value;
    const err = ctxAny.err;
    const error = ctxAny.error;
    const stack = ctxAny.stack;

    // Remaining context for metadata
    const {
      organizationId: _1,
      organization_id: _2,
      userId: _3,
      user_id: _4,
      jobId: _5,
      job_id: _6,
      jobType: _7,
      job_type: _8,
      courseId: _9,
      course_id: _10,
      lessonId: _11,
      lesson_id: _12,
      requestId: _13,
      request_id: _14,
      trpcPath: _15,
      trpc_path: _16,
      trpcInput: _17,
      trpc_input: _18,
      attemptedValue: _19,
      attempted_value: _20,
      currentValue: _21,
      current_value: _22,
      err: _23,
      error: _24,
      stack: _25,
      ...restMetadata
    } = ctxAny;

    // Build metadata with remaining context
    const metadata: Record<string, unknown> = { ...restMetadata };

    // Extract error details safely using helper function
    const errorObj = err || error;
    const errorDetails = extractErrorDetails(errorObj);
    if (errorDetails) {
      Object.assign(metadata, errorDetails);
    }

    // Include current value in metadata for context
    const currentVal = currentValue || current_value;
    if (currentVal) metadata.currentValue = currentVal;

    // Safely serialize trpcInput
    const inputData = trpcInput || trpc_input;
    let sanitizedInput: Record<string, unknown> | null = null;
    if (inputData && typeof inputData === 'object') {
      try {
        // Sanitize and limit size
        sanitizedInput = JSON.parse(JSON.stringify(inputData)) as Record<string, unknown>;
      } catch {
        sanitizedInput = { _error: 'Failed to serialize input' };
      }
    }

    // Insert without reading back — auto-mute is handled by pre-insert filter above
    await supabase.from('error_logs').insert({
      error_message: message,
      severity: level,
      environment: environment,
      organization_id: (organizationId || organization_id || null) as unknown as string,
      user_id: (userId || user_id || null) as unknown as string,
      job_id: (jobId || job_id || null) as unknown as string,
      job_type: (jobType || job_type || null) as unknown as string,
      course_id: (courseId || course_id || null) as unknown as string,
      lesson_id: (lessonId || lesson_id || null) as unknown as string,
      request_id: (requestId || request_id || null) as unknown as string,
      trpc_path: (trpcPath || trpc_path || null) as unknown as string,
      trpc_input: sanitizedInput as unknown as Json,
      attempted_value: (attemptedValue || attempted_value || null) as unknown as string,
      stack_trace: (stack || null) as unknown as string,
      metadata: (Object.keys(metadata).length > 0 ? metadata : null) as unknown as Json,
    });
  } catch (dbError) {
    // Don't break the app if DB write fails, but log at WARN level for visibility
    baseLogger.warn(
      {
        dbError,
        errorType: dbError instanceof Error ? dbError.constructor.name : typeof dbError,
      },
      'Failed to write log to error_logs table - check database connection'
    );
  }
}

/**
 * Enhanced logger that writes to both console and error_logs table
 */
function createEnhancedLogger(pinoLogger: Logger): Logger {
  // Create proxy that intercepts warn/error calls
  return new Proxy(pinoLogger, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver) as unknown;

      // Intercept warn method
      if (prop === 'warn' && typeof original === 'function') {
        const originalWarn = original as (objOrMsg: unknown, msg?: string) => void;
        return function (objOrMsg: unknown, msg?: string) {
          if (typeof objOrMsg === 'string') {
            originalWarn.call(target, objOrMsg);
            writeToErrorLogs('WARNING', objOrMsg, {}).catch(() => {});
          } else {
            originalWarn.call(target, objOrMsg, msg);
            // Skip DB write if caller explicitly opts out with { dbLog: false }
            const ctx = objOrMsg as Record<string, unknown>;
            if (ctx?.dbLog !== false) {
              writeToErrorLogs('WARNING', msg || 'Warning', ctx).catch(() => {});
            }
          }
        };
      }

      // Intercept error method
      if (prop === 'error' && typeof original === 'function') {
        const originalError = original as (objOrMsg: unknown, msg?: string) => void;
        return function (objOrMsg: unknown, msg?: string) {
          if (typeof objOrMsg === 'string') {
            originalError.call(target, objOrMsg);
            writeToErrorLogs('ERROR', objOrMsg, {}).catch(() => {});
          } else {
            originalError.call(target, objOrMsg, msg);
            const ctx = objOrMsg as Record<string, unknown>;
            if (ctx?.dbLog !== false) {
              writeToErrorLogs('ERROR', msg || 'Error', ctx).catch(() => {});
            }
          }
        };
      }

      // Intercept fatal method (map to CRITICAL)
      if (prop === 'fatal' && typeof original === 'function') {
        const originalFatal = original as (objOrMsg: unknown, msg?: string) => void;
        return function (objOrMsg: unknown, msg?: string) {
          if (typeof objOrMsg === 'string') {
            originalFatal.call(target, objOrMsg);
            writeToErrorLogs('CRITICAL', objOrMsg, {}).catch(() => {});
          } else {
            originalFatal.call(target, objOrMsg, msg);
            const ctx = objOrMsg as Record<string, unknown>;
            if (ctx?.dbLog !== false) {
              writeToErrorLogs('CRITICAL', msg || 'Fatal error', ctx).catch(() => {});
            }
          }
        };
      }

      // For child() method, wrap the returned child logger too
      if (prop === 'child' && typeof original === 'function') {
        const originalChild = original as (bindings: Record<string, unknown>) => Logger;
        return function (bindings: Record<string, unknown>) {
          const childLogger = originalChild.call(target, bindings);
          return createEnhancedLogger(childLogger);
        };
      }

      return original as Logger[keyof Logger];
    },
  });
}

/**
 * Enhanced base logger with DB logging
 */
export const logger = createEnhancedLogger(baseLogger);
export default logger;

/**
 * Creates a child logger with custom context fields
 * The returned logger also writes WARN/ERROR to error_logs table
 */
export function createChildLogger(context: Record<string, unknown>): Logger {
  const childLogger = baseCreateChildLogger(context);
  return createEnhancedLogger(childLogger);
}

// Re-export domain loggers
export * from './domain';

// Re-export context builders
export * from './context/builders';
