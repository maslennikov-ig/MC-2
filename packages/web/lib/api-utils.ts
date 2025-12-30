import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';

/**
 * Standardized API error response structure
 */
export interface ApiErrorResponse {
  error: string;
  errorCode: string;
  message: string;
  requestId: string;
  timestamp: string;
  details?: unknown;
}

/**
 * Create a standardized error response
 */
export function apiError(
  errorCode: string,
  message: string,
  status: number,
  requestId?: string,
  details?: unknown
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      error: errorCode,
      errorCode,
      message,
      requestId: requestId || nanoid(8),
      timestamp: new Date().toISOString(),
      ...(details !== undefined && { details }),
    },
    { status }
  );
}

/**
 * Create a success response with requestId
 */
export function apiSuccess<T extends Record<string, unknown>>(
  data: T,
  requestId?: string
): NextResponse {
  return NextResponse.json({
    ...data,
    requestId: requestId || nanoid(8),
  });
}

/**
 * Common error helpers for consistent error responses
 */
export const ApiErrors = {
  unauthorized: (requestId?: string) =>
    apiError('UNAUTHORIZED', 'Authentication required', 401, requestId),

  forbidden: (message: string, requestId?: string) =>
    apiError('FORBIDDEN', message, 403, requestId),

  notFound: (entity: string, requestId?: string) =>
    apiError('NOT_FOUND', `${entity} not found`, 404, requestId),

  badRequest: (message: string, requestId?: string, details?: unknown) =>
    apiError('BAD_REQUEST', message, 400, requestId, details),

  conflict: (message: string, requestId?: string) =>
    apiError('CONFLICT', message, 409, requestId),

  internal: (requestId?: string) =>
    apiError('INTERNAL_ERROR', 'An unexpected error occurred', 500, requestId),

  validationError: (errors: unknown, requestId?: string) =>
    apiError('VALIDATION_ERROR', 'Invalid request data', 400, requestId, errors),

  databaseError: (requestId?: string) =>
    apiError('DATABASE_ERROR', 'Database operation failed', 500, requestId),
};

/**
 * Get or generate request ID from request headers
 */
export function getRequestId(request: Request): string {
  return request.headers.get('x-request-id') || nanoid(8);
}

/**
 * Extract client info from request for audit logging
 */
export function getClientInfo(request: Request): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  return {
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    userAgent: request.headers.get('user-agent'),
  };
}
