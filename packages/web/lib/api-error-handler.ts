import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { ZodError, ZodIssue } from 'zod'
import { PostgrestError } from '@supabase/supabase-js'

export type ErrorCode = 
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMIT'
  | 'DATABASE_ERROR'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'INTERNAL_ERROR'

const ERROR_MAPPINGS: Record<ErrorCode, { statusCode: number; defaultMessage: string }> = {
  VALIDATION_ERROR: { statusCode: 400, defaultMessage: 'Invalid request data' },
  UNAUTHORIZED: { statusCode: 401, defaultMessage: 'Authentication required' },
  FORBIDDEN: { statusCode: 403, defaultMessage: 'Permission denied' },
  NOT_FOUND: { statusCode: 404, defaultMessage: 'Resource not found' },
  CONFLICT: { statusCode: 409, defaultMessage: 'Resource conflict' },
  RATE_LIMIT: { statusCode: 429, defaultMessage: 'Too many requests' },
  DATABASE_ERROR: { statusCode: 500, defaultMessage: 'Database operation failed' },
  EXTERNAL_SERVICE_ERROR: { statusCode: 502, defaultMessage: 'External service error' },
  INTERNAL_ERROR: { statusCode: 500, defaultMessage: 'Internal server error' }
}

export class StandardApiError extends Error {
  public readonly code: ErrorCode
  public readonly statusCode: number
  public readonly details?: unknown

  constructor(code: ErrorCode, message?: string, details?: unknown) {
    const mapping = ERROR_MAPPINGS[code]
    super(message || mapping.defaultMessage)
    this.code = code
    this.statusCode = mapping.statusCode
    this.details = details
    this.name = 'StandardApiError'
  }
}

/**
 * Standardized error response handler for API routes
 */
export function handleApiError(error: unknown, context?: string): NextResponse {
  // Log the error with context
  const logContext = context ? `[${context}]` : '[API]'
  
  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const errors = error.issues.map((err: ZodIssue) => ({
      path: err.path.join('.'),
      message: err.message
    }))
    
    logger.warn(`${logContext} Validation error:`, { errors })
    
    return NextResponse.json(
      {
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors
      },
      { status: 400 }
    )
  }
  
  // Handle StandardApiError
  if (error instanceof StandardApiError) {
    logger.error(`${logContext} API error:`, {
      code: error.code,
      message: error.message,
      details: error.details
    })
    
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        ...(process.env.NODE_ENV === 'development' && { details: error.details })
      },
      { status: error.statusCode }
    )
  }
  
  // Handle Supabase/PostgrestError
  if (error && typeof error === 'object' && 'code' in error) {
    const pgError = error as PostgrestError
    
    // Map common Postgres error codes
    let errorCode: ErrorCode = 'DATABASE_ERROR'
    let statusCode = 500
    
    if (pgError.code === 'PGRST116') {
      errorCode = 'NOT_FOUND'
      statusCode = 404
    } else if (pgError.code === '23505') {
      errorCode = 'CONFLICT'
      statusCode = 409
    } else if (pgError.code === '42501') {
      errorCode = 'FORBIDDEN'
      statusCode = 403
    }
    
    logger.error(`${logContext} Database error:`, pgError)
    
    return NextResponse.json(
      {
        error: pgError.message || 'Database operation failed',
        code: errorCode,
        ...(process.env.NODE_ENV === 'development' && { details: pgError })
      },
      { status: statusCode }
    )
  }
  
  // Handle standard Error objects
  if (error instanceof Error) {
    logger.error(`${logContext} Unhandled error:`, error)
    
    return NextResponse.json(
      {
        error: 'An unexpected error occurred',
        code: 'INTERNAL_ERROR',
        ...(process.env.NODE_ENV === 'development' && { 
          details: {
            message: error.message,
            stack: error.stack
          }
        })
      },
      { status: 500 }
    )
  }
  
  // Handle unknown errors
  logger.error(`${logContext} Unknown error:`, error)
  
  return NextResponse.json(
    {
      error: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
      ...(process.env.NODE_ENV === 'development' && { details: error })
    },
    { status: 500 }
  )
}

/**
 * Wrap async API route handlers with error handling
 */
export function withErrorHandler<T extends (...args: Parameters<T>) => Promise<NextResponse>>(
  handler: T,
  context?: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await handler(...args)
    } catch (error) {
      return handleApiError(error, context)
    }
  }) as T
}

/**
 * Response shape from failed API calls in server actions
 */
export interface ActionApiErrorResponse {
  message?: string;
  error?: string;
}

/**
 * Extract error message from a failed fetch response and throw an Error
 *
 * Used in server actions to standardize error handling when calling
 * backend tRPC endpoints or other APIs.
 *
 * @param response - The failed fetch Response object
 * @param fallbackMessage - Default message if no error details available
 * @throws Error with extracted or fallback message
 *
 * @example
 * ```typescript
 * if (!response.ok) {
 *   await extractApiError(response, 'Failed to start generation');
 * }
 * ```
 */
export async function extractApiError(
  response: Response,
  fallbackMessage: string
): Promise<never> {
  const errorData: ActionApiErrorResponse = await response
    .json()
    .catch(() => ({ message: 'Unknown error' }));

  throw new Error(errorData.message || errorData.error || fallbackMessage);
}