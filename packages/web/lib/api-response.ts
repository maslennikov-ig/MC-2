/**
 * API Response Utilities
 *
 * Standardized response format helpers for Next.js API routes.
 * Ensures consistent response structure across all endpoints.
 *
 * @module lib/api-response
 */

import { NextResponse } from 'next/server';

// =============================================================================
// NEW STANDARDIZED API (preferred for new code)
// =============================================================================

/**
 * Standard success response structure
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string;
}

/**
 * Standard error response structure
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

/**
 * Union type for API responses
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Create a standardized success response
 */
export function successResponse<T>(data: T): ApiSuccessResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a standardized error response
 */
export function errorResponse(
  code: string,
  message: string,
  details?: unknown
): ApiErrorResponse {
  return {
    success: false,
    error: { code, message, details },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Common error codes
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  BAD_GATEWAY: 'BAD_GATEWAY',
  TIMEOUT: 'TIMEOUT',
} as const;

/**
 * NextResponse helpers with proper status codes
 */
export function jsonSuccess<T>(data: T, status = 200): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(successResponse(data), { status });
}

export function jsonError(
  code: string,
  message: string,
  status = 500,
  details?: unknown
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(errorResponse(code, message, details), { status });
}

// =============================================================================
// LEGACY API (for backward compatibility - use new API for new code)
// =============================================================================

/**
 * @deprecated Use ApiErrorResponse with success discriminator instead
 */
export interface LegacyApiErrorResponse {
  error: string;
  message?: string;
  details?: unknown;
  code?: string;
  timestamp?: string;
}

/**
 * @deprecated Use ApiSuccessResponse with success discriminator instead
 */
export interface LegacyApiSuccessResponse<T = unknown> {
  data: T;
  message?: string;
  timestamp?: string;
}

/**
 * Standard API error response helper
 * @deprecated Use jsonError() instead for new code
 */
export function apiError(
  error: string,
  status: number = 500,
  details?: unknown,
  code?: string
): NextResponse<LegacyApiErrorResponse> {
  const response: LegacyApiErrorResponse = {
    error,
    timestamp: new Date().toISOString(),
  };

  if (details) {
    response.details = details;
  }

  if (code) {
    response.code = code;
  }

  // Add user-friendly messages for common errors
  if (status === 400) {
    response.message = response.message || 'Invalid request data';
  } else if (status === 401) {
    response.message = response.message || 'Authentication required';
  } else if (status === 403) {
    response.message = response.message || 'Access denied';
  } else if (status === 404) {
    response.message = response.message || 'Resource not found';
  } else if (status === 500) {
    response.message = response.message || 'An error occurred while processing your request';
  }

  return NextResponse.json(response, { status });
}

/**
 * Standard API success response helper
 * @deprecated Use jsonSuccess() instead for new code
 */
export function apiSuccess<T>(
  data: T,
  message?: string,
  status: number = 200
): NextResponse<LegacyApiSuccessResponse<T>> {
  const response: LegacyApiSuccessResponse<T> = {
    data,
    timestamp: new Date().toISOString(),
  };

  if (message) {
    response.message = message;
  }

  return NextResponse.json(response, { status });
}

/**
 * Common error responses
 * @deprecated Use jsonError() with ERROR_CODES instead for new code
 */
export const ApiErrors = {
  BAD_REQUEST: (details?: unknown) => apiError('Bad Request', 400, details, 'BAD_REQUEST'),

  UNAUTHORIZED: (message = 'Authentication required') =>
    apiError(message, 401, undefined, 'UNAUTHORIZED'),

  FORBIDDEN: (message = 'Access denied') => apiError(message, 403, undefined, 'FORBIDDEN'),

  NOT_FOUND: (resource = 'Resource') => apiError(`${resource} not found`, 404, undefined, 'NOT_FOUND'),

  VALIDATION_ERROR: (details: unknown) => apiError('Validation failed', 400, details, 'VALIDATION_ERROR'),

  INTERNAL_ERROR: (message = 'Internal server error') =>
    apiError(message, 500, undefined, 'INTERNAL_ERROR'),

  DATABASE_ERROR: (message = 'Database operation failed') =>
    apiError(message, 500, undefined, 'DATABASE_ERROR'),

  RATE_LIMITED: (retryAfter?: number) => apiError('Too many requests', 429, { retryAfter }, 'RATE_LIMITED'),
};
