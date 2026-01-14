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
import 'server-only'

import { createModuleLogger } from '@megacampus/shared-logger'
import type { Logger as PinoLogger } from '@megacampus/shared-logger'
import type { Json } from '@/types/database.generated'

// Create base module logger from shared package
const pinoLogger = createModuleLogger('web')

/**
 * Check if value is an Error or error-like object
 * Handles cross-realm errors (e.g., Supabase AuthError) where instanceof fails
 */
function isErrorLike(arg: unknown): arg is Error & { code?: string; status?: number } {
  if (arg instanceof Error) return true
  if (!arg || typeof arg !== 'object') return false
  const obj = arg as Record<string, unknown>
  // Error-like: has message and either name, stack, or code
  return (
    typeof obj.message === 'string' &&
    (typeof obj.name === 'string' || typeof obj.stack === 'string' || 'code' in obj)
  )
}

/**
 * Extract error properties for logging
 */
function extractErrorProps(
  arg: Error & { code?: string; status?: number }
): Record<string, unknown> {
  return {
    error: arg.message,
    ...(arg.stack ? { stack: arg.stack } : {}),
    ...(arg.name ? { name: arg.name } : {}),
    ...(arg.code ? { code: arg.code } : {}),
    ...('status' in arg ? { status: arg.status } : {}),
    ...(arg.cause ? { cause: String(arg.cause) } : {}),
  }
}

/**
 * Convert variadic arguments to a data object for Pino
 * Handles Error objects, error-like objects (e.g., AuthError), plain objects, and primitives
 * Optimized to avoid unnecessary object copies
 */
function argsToObject(args: unknown[]): Record<string, unknown> | undefined {
  if (args.length === 0) return undefined

  if (args.length === 1) {
    const arg = args[0]

    // Handle Error and error-like objects (including Supabase AuthError)
    if (isErrorLike(arg)) {
      return extractErrorProps(arg)
    }

    // Fast path: plain objects - return as-is, let Pino serialize
    // This avoids the spread operation that creates a copy
    if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
      return arg as Record<string, unknown>
    }

    // Primitives
    return { data: arg }
  }

  // Multiple arguments - combine into object using for loop (faster than forEach)
  const result: Record<string, unknown> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (isErrorLike(arg)) {
      const suffix = i > 0 ? String(i) : ''
      result[`error${suffix}`] = arg.message
      if (arg.stack) result[`stack${suffix}`] = arg.stack
      if (arg.code) result[`code${suffix}`] = arg.code
    } else if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
      Object.assign(result, arg)
    } else if (arg !== undefined) {
      result[`arg${i}`] = arg
    }
  }
  return result
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
  debug: (msg: string, ...args: unknown[]) => void
  info: (msg: string, ...args: unknown[]) => void
  warn: (msg: string, ...args: unknown[]) => void
  error: (msg: string, ...args: unknown[]) => void
  devLog: (msg: string, ...args: unknown[]) => void
  child: (bindings: Record<string, unknown>) => FlexibleLogger
}

function createFlexibleLogger(pino: PinoLogger): FlexibleLogger {
  const isDevelopment = process.env.NODE_ENV === 'development'

  return {
    debug: (msg: string, ...args: unknown[]) => {
      const data = argsToObject(args)
      if (data) {
        pino.debug(data, msg)
      } else {
        pino.debug(msg)
      }
    },
    info: (msg: string, ...args: unknown[]) => {
      const data = argsToObject(args)
      if (data) {
        pino.info(data, msg)
      } else {
        pino.info(msg)
      }
    },
    warn: (msg: string, ...args: unknown[]) => {
      const data = argsToObject(args)
      if (data) {
        pino.warn(data, msg)
      } else {
        pino.warn(msg)
      }
    },
    error: (msg: string, ...args: unknown[]) => {
      const data = argsToObject(args)
      if (data) {
        pino.error(data, msg)
      } else {
        pino.error(msg)
      }
    },
    // devLog only logs in development
    devLog: (msg: string, ...args: unknown[]) => {
      if (isDevelopment) {
        const data = argsToObject(args)
        if (data) {
          pino.debug(data, `[DEV] ${msg}`)
        } else {
          pino.debug(`[DEV] ${msg}`)
        }
      }
    },
    child: (bindings: Record<string, unknown>) => {
      return createFlexibleLogger(pino.child(bindings))
    },
  }
}

// Export server-side logger with flexible API
export const logger: FlexibleLogger = createFlexibleLogger(pinoLogger)

// Factory for API route loggers
export function createApiLogger(route: string): FlexibleLogger {
  return logger.child({ route })
}

// Factory for server action loggers
export function createActionLogger(action: string): FlexibleLogger {
  return logger.child({ action })
}

// ===========================================================================
// Error Logging to Database (error_logs table)
// ===========================================================================

/**
 * Error severity levels for error_logs table
 */
export type ErrorSeverity = 'WARNING' | 'ERROR' | 'CRITICAL'

/**
 * Environment type for tracking where the error occurred
 */
export type LogEnvironment = 'dev' | 'stage'

/**
 * Parameters for creating a new error_logs entry
 * Adapted from course-gen-platform's CreateErrorLogParams for web context
 */
export interface CreateErrorLogParams {
  /** User ID (optional) */
  user_id?: string
  /** Organization ID (optional - unlike backend, web may not always have org context) */
  organization_id?: string
  /** Human-readable error message (required) */
  error_message: string
  /** Stack trace for debugging (optional) */
  stack_trace?: string | null
  /** Error severity level (required) */
  severity: ErrorSeverity
  /** Environment (auto-detected if not provided) */
  environment?: LogEnvironment | null
  /** File name that caused the error (optional) */
  file_name?: string
  /** File size in bytes (optional) */
  file_size?: number
  /** File MIME type (optional) */
  file_format?: string
  /** BullMQ job ID for tracing (optional) */
  job_id?: string
  /** Job type (e.g., COURSE_UPDATE, COURSE_CREATE) (optional) */
  job_type?: string
  /** Additional metadata (optional) */
  metadata?: Record<string, unknown>
}

/**
 * Detect environment from NEXT_PUBLIC_APP_URL
 */
function detectEnvironment(): LogEnvironment | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''

  try {
    const url = new URL(appUrl)
    const hostname = url.hostname

    if (hostname === 'dev.ai.megacampus.ru') return 'dev'
    if (hostname === 'ai.megacampus.ru') return 'stage'
  } catch {
    // Fallback for invalid URLs
    if (appUrl.includes('dev.ai.megacampus.ru')) return 'dev'
    if (appUrl.includes('ai.megacampus.ru') && !appUrl.includes('dev.')) return 'stage'
  }

  return null
}

/**
 * Log a permanent failure to the error_logs table
 *
 * This is a web-package wrapper that uses the web's supabaseAdmin client.
 * Use this for logging database errors from Server Actions so they appear
 * in the /admin/logs page.
 *
 * @param params - Error log parameters
 * @returns Promise that resolves when error is logged
 *
 * @example
 * ```typescript
 * // Fire and forget (recommended for non-blocking error logging)
 * logPermanentFailure({
 *   error_message: 'Failed to update course',
 *   severity: 'ERROR',
 *   job_type: 'COURSE_UPDATE',
 *   metadata: { courseId, userId, errorCode: 'DATABASE_ERROR' }
 * }).catch(() => {}); // Silently ignore failures
 * ```
 */
export async function logPermanentFailure(params: CreateErrorLogParams): Promise<void> {
  // Lazy import to avoid circular dependencies and keep module boundaries clean
  const { supabaseAdmin } = await import('@/lib/supabase-admin')

  // Auto-detect environment if not provided
  const environment = params.environment ?? detectEnvironment()

  // Insert error log entry
  const { error } = await supabaseAdmin.from('error_logs').insert({
    user_id: params.user_id || null,
    organization_id: params.organization_id || null,
    error_message: params.error_message,
    stack_trace: params.stack_trace || null,
    severity: params.severity,
    environment: environment,
    file_name: params.file_name || null,
    file_size: params.file_size || null,
    file_format: params.file_format || null,
    job_id: params.job_id || null,
    job_type: params.job_type || null,
    metadata: (params.metadata as Json) || null,
  })

  if (error) {
    // Fallback to Pino logger if database insert fails
    logger.error('Failed to insert error_logs entry', {
      err: error.message,
      params,
    })
    throw new Error(`Failed to log permanent failure: ${error.message}`)
  }

  // Log successful insert
  logger.info('Permanent failure logged to error_logs table', {
    organization_id: params.organization_id,
    severity: params.severity,
    job_type: params.job_type,
  })
}

export default logger
