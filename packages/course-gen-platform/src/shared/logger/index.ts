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
import { detectEnvironment } from './utils';
import { applyAutoMuteStatus } from './auto-mute-service';

export type { Logger } from 'pino';

// Re-export error logging types and services (these are local)
export * from './types';
export * from './error-service.js';

// Re-export unchanged functions
export { createModuleLogger, createRequestLogger };

/**
 * Write log entry to error_logs table (fire-and-forget)
 */
async function writeToErrorLogs(
  level: 'WARNING' | 'ERROR' | 'CRITICAL',
  message: string,
  context: Record<string, unknown> = {}
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const environment = detectEnvironment();

    // Extract known fields from context (support both camelCase and snake_case)
    const {
      organizationId,
      organization_id,
      userId,
      user_id,
      jobId,
      job_id,
      jobType,
      job_type,
      courseId,
      course_id,
      lessonId,
      lesson_id,
      requestId,
      request_id,
      trpcPath,
      trpc_path,
      trpcInput,
      trpc_input,
      attemptedValue,
      attempted_value,
      currentValue,
      current_value,
      err,
      error,
      stack,
      ...restMetadata
    } = context;

    // Build metadata with remaining context
    const metadata: Record<string, unknown> = { ...restMetadata };

    // Extract error details safely
    const errorObj = err || error;
    if (errorObj) {
      if (typeof errorObj === 'object' && errorObj !== null) {
        const errAny = errorObj as Record<string, unknown>;
        metadata.errorDetails = {
          message: errAny.message || String(errorObj),
          code: errAny.code,
          name: errAny.name,
        };
      } else {
        metadata.errorDetails = { message: String(errorObj) };
      }
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
        sanitizedInput = JSON.parse(JSON.stringify(inputData));
      } catch {
        sanitizedInput = { _error: 'Failed to serialize input' };
      }
    }

    const { data: insertedLog } = await supabase
      .from('error_logs' as any)
      .insert({
        error_message: message,
        severity: level,
        environment: environment,
        organization_id: (organizationId || organization_id || null) as string | null,
        user_id: (userId || user_id || null) as string | null,
        job_id: (jobId || job_id || null) as string | null,
        job_type: (jobType || job_type || null) as string | null,
        course_id: (courseId || course_id || null) as string | null,
        lesson_id: (lessonId || lesson_id || null) as string | null,
        request_id: (requestId || request_id || null) as string | null,
        trpc_path: (trpcPath || trpc_path || null) as string | null,
        trpc_input: sanitizedInput,
        attempted_value: (attemptedValue || attempted_value || null) as string | null,
        stack_trace: (stack || null) as string | null,
        metadata: Object.keys(metadata).length > 0 ? metadata : null,
      })
      .select('id')
      .single();

    // Check if this error should be auto-muted
    const logId = (insertedLog as unknown as { id: string } | null)?.id;
    if (logId) {
      await applyAutoMuteStatus(logId, message);
    }
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
      const original = Reflect.get(target, prop, receiver);

      // Intercept warn method
      if (prop === 'warn' && typeof original === 'function') {
        return function (objOrMsg: unknown, msg?: string) {
          // Call original warn
          if (typeof objOrMsg === 'string') {
            original.call(target, objOrMsg);
            writeToErrorLogs('WARNING', objOrMsg, {}).catch(() => {});
          } else {
            original.call(target, objOrMsg, msg);
            writeToErrorLogs(
              'WARNING',
              msg || 'Warning',
              objOrMsg as Record<string, unknown>
            ).catch(() => {});
          }
        };
      }

      // Intercept error method
      if (prop === 'error' && typeof original === 'function') {
        return function (objOrMsg: unknown, msg?: string) {
          // Call original error
          if (typeof objOrMsg === 'string') {
            original.call(target, objOrMsg);
            writeToErrorLogs('ERROR', objOrMsg, {}).catch(() => {});
          } else {
            original.call(target, objOrMsg, msg);
            writeToErrorLogs('ERROR', msg || 'Error', objOrMsg as Record<string, unknown>).catch(
              () => {}
            );
          }
        };
      }

      // Intercept fatal method (map to CRITICAL)
      if (prop === 'fatal' && typeof original === 'function') {
        return function (objOrMsg: unknown, msg?: string) {
          // Call original fatal
          if (typeof objOrMsg === 'string') {
            original.call(target, objOrMsg);
            writeToErrorLogs('CRITICAL', objOrMsg, {}).catch(() => {});
          } else {
            original.call(target, objOrMsg, msg);
            writeToErrorLogs(
              'CRITICAL',
              msg || 'Fatal error',
              objOrMsg as Record<string, unknown>
            ).catch(() => {});
          }
        };
      }

      // For child() method, wrap the returned child logger too
      if (prop === 'child' && typeof original === 'function') {
        return function (bindings: Record<string, unknown>) {
          const childLogger = original.call(target, bindings);
          return createEnhancedLogger(childLogger);
        };
      }

      return original;
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
