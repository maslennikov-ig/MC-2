/**
 * LMS Integration Error Types
 * @module lms/errors
 *
 * Custom error classes for LMS integration with proper error codes and metadata.
 * All LMS adapters should use these error types for consistent error handling.
 */

/**
 * Error codes for LMS integration operations
 *
 * Categories:
 * - Validation errors (4xx): OLX_VALIDATION_ERROR, INVALID_COURSE_INPUT, COURSE_NOT_READY
 * - Authentication errors (401): AUTH_ERROR, TOKEN_EXPIRED, INVALID_CREDENTIALS
 * - Import errors (5xx): IMPORT_ERROR, IMPORT_TIMEOUT, IMPORT_REJECTED
 * - Network errors: NETWORK_ERROR, CONNECTION_REFUSED, DNS_ERROR, NETWORK_CONNECTION_LOST, LMS_UNREACHABLE
 * - Timeout errors: TIMEOUT_ERROR, UPLOAD_TIMEOUT, POLL_TIMEOUT, LMS_TIMEOUT
 * - Permission errors: PERMISSION_ERROR, INSUFFICIENT_ROLE
 */
export const LMS_ERROR_CODES = {
  // Validation errors (4xx)
  OLX_VALIDATION_ERROR: 'OLX_VALIDATION_ERROR',
  INVALID_COURSE_INPUT: 'INVALID_COURSE_INPUT',
  COURSE_NOT_READY: 'COURSE_NOT_READY',

  // Authentication errors (401)
  AUTH_ERROR: 'AUTH_ERROR',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',

  // Import errors (5xx)
  IMPORT_ERROR: 'IMPORT_ERROR',
  IMPORT_TIMEOUT: 'IMPORT_TIMEOUT',
  IMPORT_REJECTED: 'IMPORT_REJECTED',

  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  CONNECTION_REFUSED: 'CONNECTION_REFUSED',
  DNS_ERROR: 'DNS_ERROR',
  NETWORK_CONNECTION_LOST: 'NETWORK_CONNECTION_LOST', // Connection dropped mid-upload
  LMS_UNREACHABLE: 'LMS_UNREACHABLE', // Cannot connect to LMS

  // Timeout errors
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  UPLOAD_TIMEOUT: 'UPLOAD_TIMEOUT',
  POLL_TIMEOUT: 'POLL_TIMEOUT',
  LMS_TIMEOUT: 'LMS_TIMEOUT', // Generic LMS operation timeout

  // Permission errors
  PERMISSION_ERROR: 'PERMISSION_ERROR',
  INSUFFICIENT_ROLE: 'INSUFFICIENT_ROLE',
} as const;

/** LMS error code type (union of all error codes) */
export type LmsErrorCode = typeof LMS_ERROR_CODES[keyof typeof LMS_ERROR_CODES];

/**
 * Error code to HTTP status code mapping
 *
 * Used by tRPC error handlers and HTTP API endpoints to return
 * appropriate HTTP status codes for LMS errors.
 */
export const ERROR_CODE_TO_HTTP: Record<LmsErrorCode, number> = {
  OLX_VALIDATION_ERROR: 400,
  INVALID_COURSE_INPUT: 400,
  COURSE_NOT_READY: 412,
  AUTH_ERROR: 401,
  TOKEN_EXPIRED: 401,
  INVALID_CREDENTIALS: 401,
  IMPORT_ERROR: 500,
  IMPORT_TIMEOUT: 504,
  IMPORT_REJECTED: 422,
  NETWORK_ERROR: 503,
  CONNECTION_REFUSED: 503,
  DNS_ERROR: 503,
  NETWORK_CONNECTION_LOST: 503,
  LMS_UNREACHABLE: 503,
  TIMEOUT_ERROR: 504,
  UPLOAD_TIMEOUT: 504,
  POLL_TIMEOUT: 504,
  LMS_TIMEOUT: 504,
  PERMISSION_ERROR: 403,
  INSUFFICIENT_ROLE: 403,
};

/**
 * Base error class for all LMS integration errors
 *
 * Provides consistent error structure with:
 * - Typed error codes
 * - LMS type identification
 * - Optional cause chain
 * - Optional metadata
 * - JSON serialization
 */
export class LMSIntegrationError extends Error {
  constructor(
    message: string,
    public readonly code: LmsErrorCode,
    public readonly lmsType: string,
    public readonly cause?: Error,
    public readonly metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'LMSIntegrationError';

    // Capture stack trace (Node.js specific)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize error to JSON (for logging and API responses)
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      lmsType: this.lmsType,
      metadata: this.metadata,
      cause: this.cause?.message,
    };
  }
}

/**
 * OLX validation failed
 *
 * Thrown when OLX structure validation fails before packaging.
 * Contains structured validation errors with paths and severity levels.
 */
export class OLXValidationError extends LMSIntegrationError {
  constructor(
    message: string,
    public readonly errors: Array<{ path: string; message: string; severity: 'error' | 'warning' }>
  ) {
    super(message, 'OLX_VALIDATION_ERROR', 'openedx', undefined, { errors });
    this.name = 'OLXValidationError';
  }
}

/**
 * OAuth2 authentication failed
 *
 * Thrown when Open edX OAuth2 token request fails.
 * May indicate invalid credentials, expired tokens, or connectivity issues.
 */
export class OpenEdXAuthError extends LMSIntegrationError {
  constructor(message: string, cause?: Error) {
    super(message, 'AUTH_ERROR', 'openedx', cause);
    this.name = 'OpenEdXAuthError';
  }
}

/**
 * Course import process failed
 *
 * Thrown when Open edX import task fails or returns error state.
 * Includes task ID and state for debugging.
 */
export class OpenEdXImportError extends LMSIntegrationError {
  constructor(
    message: string,
    public readonly taskId: string,
    public readonly state: string,
    cause?: Error
  ) {
    super(message, 'IMPORT_ERROR', 'openedx', cause, { taskId, state });
    this.name = 'OpenEdXImportError';
  }
}

/**
 * Network/connection error
 *
 * Thrown when network request fails (connection refused, DNS error, etc.).
 * Generic network error for any LMS type.
 */
export class LMSNetworkError extends LMSIntegrationError {
  constructor(message: string, lmsType: string, cause?: Error) {
    super(message, 'NETWORK_ERROR', lmsType, cause);
    this.name = 'LMSNetworkError';
  }
}

/**
 * Operation timeout error
 *
 * Thrown when LMS operation exceeds configured timeout.
 * Includes duration and operation type for debugging.
 */
export class LMSTimeoutError extends LMSIntegrationError {
  constructor(
    message: string,
    lmsType: string,
    public readonly duration: number,
    public readonly operation: 'upload' | 'poll' | 'connect'
  ) {
    super(message, 'TIMEOUT_ERROR', lmsType, undefined, { duration, operation });
    this.name = 'LMSTimeoutError';
  }
}

/**
 * Permission denied error
 *
 * Thrown when user lacks required permissions for LMS operation.
 * Includes operation type and required role guidance.
 */
export class LMSPermissionError extends LMSIntegrationError {
  constructor(
    message: string,
    lmsType: string,
    public readonly operation: string,
    public readonly requiredRole: string = 'Unknown'
  ) {
    super(message, 'PERMISSION_ERROR', lmsType, undefined, { operation, requiredRole });
    this.name = 'LMSPermissionError';
  }
}

/**
 * Type guard for LMS errors
 *
 * @param error - Unknown error object
 * @returns True if error is an LMSIntegrationError instance
 */
export function isLMSError(error: unknown): error is LMSIntegrationError {
  return error instanceof LMSIntegrationError;
}
