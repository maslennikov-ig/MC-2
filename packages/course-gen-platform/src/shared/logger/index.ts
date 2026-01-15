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

export type { Logger } from 'pino';

// Re-export error logging types and services (these are local)
export * from './types';
export * from './error-service';

// Re-export unchanged functions
export { createModuleLogger, createRequestLogger };

/**
 * Detect environment from APP_URL or NEXT_PUBLIC_APP_URL
 */
function detectEnvironment(): 'dev' | 'stage' | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '';

  try {
    const url = new URL(appUrl);
    const hostname = url.hostname;

    if (hostname === 'dev.ai.megacampus.ru') return 'dev';
    if (hostname === 'ai.megacampus.ru') return 'stage';
  } catch {
    if (appUrl.includes('dev.ai.megacampus.ru')) return 'dev';
    if (appUrl.includes('ai.megacampus.ru') && !appUrl.includes('dev.')) return 'stage';
  }

  return null;
}

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

    // Extract known fields from context
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
      err,
      error,
      ...restMetadata
    } = context;

    // Build metadata with remaining context
    const metadata: Record<string, unknown> = { ...restMetadata };
    if (courseId || course_id) metadata.courseId = courseId || course_id;
    if (err) metadata.errorDetails = typeof err === 'object' ? err : { message: err };
    if (error) metadata.errorDetails = typeof error === 'object' ? error : { message: error };

    await supabase.from('error_logs' as any).insert({
      error_message: message,
      severity: level,
      environment: environment,
      organization_id: (organizationId || organization_id || null) as string | null,
      user_id: (userId || user_id || null) as string | null,
      job_id: (jobId || job_id || null) as string | null,
      job_type: (jobType || job_type || null) as string | null,
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
    });
  } catch (dbError) {
    // Silently fail - don't break the app if DB write fails
    // The original log to console/Axiom will still work
    baseLogger.debug({ dbError }, 'Failed to write log to error_logs table');
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
