/**
 * Open edX API Types
 * @module integrations/lms/openedx/api/types
 *
 * Type definitions for Open edX Course Import API.
 * Based on Open edX REST API v0 specification.
 */

/**
 * Import task state enumeration
 *
 * States returned by Open edX import status endpoint:
 * - PENDING: Task queued but not started
 * - IN_PROGRESS: Import processing active
 * - SUCCESS: Import completed successfully
 * - FAILURE: Import failed with error
 */
export type ImportTaskState = 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE';

/**
 * Import status response from Open edX API
 *
 * Returned by GET /api/courses/v0/import/{course_id}/status/{task_id}
 *
 * @example
 * ```json
 * {
 *   "task_id": "abc123",
 *   "state": "IN_PROGRESS",
 *   "progress_percent": 45,
 *   "message": "Processing course structure..."
 * }
 * ```
 */
export interface ImportStatus {
  /** Celery task ID */
  task_id: string;

  /** Current task state */
  state: ImportTaskState;

  /** Progress percentage (0-100), null if not available */
  progress_percent: number | null;

  /** Human-readable status message */
  message: string | null;

  /** Error message if state is FAILURE */
  error_message: string | null;

  /** Course key (org+course+run) if import succeeded */
  course_key: string | null;
}

/**
 * Import result after polling completes
 *
 * Terminal result of import operation after polling until SUCCESS or FAILURE.
 */
export interface ImportResult {
  /** Did import succeed? */
  success: boolean;

  /** Course key (e.g., "course-v1:Org+Course+Run") if successful */
  courseKey: string | null;

  /** Studio URL to edit course if successful */
  courseUrl: string | null;

  /** Error message if failed */
  error: string | null;

  /** Final task state */
  state: ImportTaskState;

  /** Task ID for reference */
  taskId: string;
}

/**
 * Import task creation response
 *
 * Returned by POST /api/courses/v0/import/{course_id}
 *
 * @example
 * ```json
 * {
 *   "task_id": "abc123-def456-789"
 * }
 * ```
 */
export interface ImportTaskResponse {
  /** Celery task ID for polling status */
  task_id: string;
}

/**
 * OAuth2 token response from Open edX
 *
 * Returned by POST /oauth2/access_token
 *
 * @example
 * ```json
 * {
 *   "access_token": "abc123...",
 *   "token_type": "Bearer",
 *   "expires_in": 3600,
 *   "scope": "read write"
 * }
 * ```
 */
export interface OAuth2TokenResponse {
  /** Bearer token for Authorization header */
  access_token: string;

  /** Token type (always "Bearer" for Open edX) */
  token_type: string;

  /** Token lifetime in seconds (typically 3600) */
  expires_in: number;

  /** Granted scopes (space-separated) */
  scope: string;
}

/**
 * Open edX API error response
 *
 * Standard error format returned by Open edX REST API.
 *
 * @example
 * ```json
 * {
 *   "error": "invalid_grant",
 *   "error_description": "Invalid credentials given."
 * }
 * ```
 */
export interface OpenEdXApiErrorResponse {
  /** Error code (e.g., "invalid_grant", "not_found") */
  error: string;

  /** Human-readable error description */
  error_description?: string;

  /** Additional error details */
  detail?: string;
}

/**
 * Open edX API error class
 *
 * Wraps HTTP errors from Open edX API with structured error data.
 */
export class OpenEdXApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode?: string,
    public readonly errorDescription?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'OpenEdXApiError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Create from axios error response
   */
  static fromResponse(statusCode: number, data: OpenEdXApiErrorResponse): OpenEdXApiError {
    const message = data.error_description || data.detail || data.error || 'Open edX API error';
    return new OpenEdXApiError(message, statusCode, data.error, data.error_description);
  }

  /**
   * Serialize to JSON for logging
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      errorCode: this.errorCode,
      errorDescription: this.errorDescription,
    };
  }
}
