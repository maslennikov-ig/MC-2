import { NextResponse } from 'next/server'

export interface ApiErrorResponse {
  error: string
  message?: string
  details?: unknown
  code?: string
  timestamp?: string
}

export interface ApiSuccessResponse<T = unknown> {
  data: T
  message?: string
  timestamp?: string
}

/**
 * Standard API error response helper
 */
export function apiError(
  error: string,
  status: number = 500,
  details?: unknown,
  code?: string
): NextResponse<ApiErrorResponse> {
  const response: ApiErrorResponse = {
    error,
    timestamp: new Date().toISOString()
  }
  
  if (details) {
    response.details = details
  }
  
  if (code) {
    response.code = code
  }
  
  // Add user-friendly messages for common errors
  if (status === 400) {
    response.message = response.message || 'Invalid request data'
  } else if (status === 401) {
    response.message = response.message || 'Authentication required'
  } else if (status === 403) {
    response.message = response.message || 'Access denied'
  } else if (status === 404) {
    response.message = response.message || 'Resource not found'
  } else if (status === 500) {
    response.message = response.message || 'An error occurred while processing your request'
  }
  
  return NextResponse.json(response, { status })
}

/**
 * Standard API success response helper
 */
export function apiSuccess<T>(
  data: T,
  message?: string,
  status: number = 200
): NextResponse<ApiSuccessResponse<T>> {
  const response: ApiSuccessResponse<T> = {
    data,
    timestamp: new Date().toISOString()
  }
  
  if (message) {
    response.message = message
  }
  
  return NextResponse.json(response, { status })
}

/**
 * Common error responses
 */
export const ApiErrors = {
  BAD_REQUEST: (details?: unknown) => 
    apiError('Bad Request', 400, details, 'BAD_REQUEST'),
    
  UNAUTHORIZED: (message = 'Authentication required') =>
    apiError(message, 401, undefined, 'UNAUTHORIZED'),
    
  FORBIDDEN: (message = 'Access denied') =>
    apiError(message, 403, undefined, 'FORBIDDEN'),
    
  NOT_FOUND: (resource = 'Resource') =>
    apiError(`${resource} not found`, 404, undefined, 'NOT_FOUND'),
    
  VALIDATION_ERROR: (details: unknown) =>
    apiError('Validation failed', 400, details, 'VALIDATION_ERROR'),
    
  INTERNAL_ERROR: (message = 'Internal server error') =>
    apiError(message, 500, undefined, 'INTERNAL_ERROR'),
    
  DATABASE_ERROR: (message = 'Database operation failed') =>
    apiError(message, 500, undefined, 'DATABASE_ERROR'),
    
  RATE_LIMITED: (retryAfter?: number) =>
    apiError('Too many requests', 429, { retryAfter }, 'RATE_LIMITED')
}