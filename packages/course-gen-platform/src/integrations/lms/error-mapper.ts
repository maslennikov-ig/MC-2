/**
 * LMS Error Mapper
 * @module integrations/lms/error-mapper
 *
 * Maps LMS error codes to user-friendly messages for better UX.
 * This module provides human-readable error messages and guidance
 * for common LMS integration failures.
 *
 * Error codes are standardized across the LMS integration module
 * and map to specific failure scenarios with actionable feedback.
 *
 * @example
 * ```typescript
 * import { mapLMSError } from './error-mapper';
 *
 * const mapped = mapLMSError('LMS_AUTH_FAILED', 'OAuth2 token invalid');
 * // {
 * //   code: 'LMS_AUTH_FAILED',
 * //   userMessage: 'Authentication failed. Please verify your LMS credentials are correct.',
 * //   details: 'OAuth2 token invalid'
 * // }
 * ```
 */

/**
 * Mapped error result with user-friendly message
 */
export interface MappedError {
  /**
   * Standardized error code
   */
  code: string;

  /**
   * User-friendly error message with actionable guidance
   */
  userMessage: string;

  /**
   * Technical error details (optional)
   */
  details?: string;
}

/**
 * Error code to user message mapping
 *
 * Each entry maps a technical error code to a clear, actionable
 * user-facing message. Messages should:
 * - Explain what went wrong in simple terms
 * - Provide guidance on how to fix the issue
 * - Avoid technical jargon where possible
 */
const ERROR_MESSAGE_MAP: Record<string, string> = {
  // Connection Errors
  LMS_CONNECTION_FAILED:
    'Unable to connect to the LMS. Please check your network connection and try again.',
  LMS_TIMEOUT: 'The operation timed out. The LMS may be under heavy load. Please try again later.',
  LMS_NETWORK_ERROR:
    'A network error occurred while communicating with the LMS. Please check your connection.',

  // Authentication Errors
  LMS_AUTH_FAILED:
    'Authentication failed. Please verify your LMS credentials (Client ID and Client Secret) are correct.',
  LMS_AUTH_EXPIRED:
    'Your LMS authentication has expired. Please refresh your credentials in the configuration.',
  LMS_INSUFFICIENT_PERMISSIONS:
    'The LMS credentials do not have sufficient permissions. Please verify the account has course import access.',

  // Import Errors
  LMS_IMPORT_FAILED:
    'The course import failed on the LMS side. Please check that the course format is valid and try again.',
  LMS_IMPORT_TIMEOUT:
    'The course import is taking longer than expected. The LMS may still be processing the import.',
  LMS_IMPORT_REJECTED:
    'The LMS rejected the course import. Please check the course content and LMS configuration.',

  // Content Errors
  INVALID_OLX:
    'The course content could not be converted to the required format. Please check the course structure.',
  INVALID_COURSE_STRUCTURE:
    'The course structure is invalid. Please ensure all sections and units are properly configured.',
  MISSING_REQUIRED_FIELDS:
    'Required course information is missing. Please ensure the course has a title and organization.',

  // Upload Errors
  UPLOAD_FAILED:
    'Failed to upload the course package to the LMS. Please check your connection and try again.',
  UPLOAD_SIZE_EXCEEDED:
    'The course package is too large. Please reduce the amount of content or media files.',
  UPLOAD_TIMEOUT: 'The upload took too long. Please try again with a faster connection.',

  // Course Errors
  COURSE_EXISTS:
    'A course with this ID already exists in the LMS. Please delete it first or choose a different ID.',
  COURSE_NOT_FOUND: 'The course was not found in the LMS. It may have been deleted.',

  // Configuration Errors
  INVALID_CONFIG:
    'The LMS configuration is invalid. Please check the LMS URL, Studio URL, and credentials.',
  CONFIG_NOT_FOUND:
    'The LMS configuration was not found. Please verify the configuration exists and is active.',
  CONFIG_INACTIVE:
    'The LMS configuration is inactive. Please activate it in the configuration settings.',

  // User Actions
  CANCELLED: 'The import was cancelled by the user.',

  // Unknown/Generic Errors
  UNKNOWN_ERROR: 'An unexpected error occurred. Please try again or contact support if the issue persists.',
};

/**
 * Map LMS error codes to user-friendly messages
 *
 * Takes an error code and optional technical error message and returns
 * a structured error object with a user-friendly message and optional
 * technical details.
 *
 * @param errorCode - Standardized error code (e.g., 'LMS_AUTH_FAILED')
 * @param errorMessage - Technical error message (optional)
 * @returns Mapped error with user-friendly message
 *
 * @example
 * ```typescript
 * // With known error code
 * mapLMSError('LMS_AUTH_FAILED', 'Invalid credentials');
 * // {
 * //   code: 'LMS_AUTH_FAILED',
 * //   userMessage: 'Authentication failed. Please verify your LMS credentials are correct.',
 * //   details: 'Invalid credentials'
 * // }
 *
 * // With unknown error code
 * mapLMSError(null, 'Connection refused');
 * // {
 * //   code: 'UNKNOWN_ERROR',
 * //   userMessage: 'Connection refused',
 * //   details: 'Connection refused'
 * // }
 *
 * // With no error information
 * mapLMSError(null, null);
 * // {
 * //   code: 'UNKNOWN_ERROR',
 * //   userMessage: 'An unexpected error occurred.',
 * //   details: undefined
 * // }
 * ```
 */
export function mapLMSError(errorCode: string | null, errorMessage: string | null): MappedError {
  const code = errorCode || 'UNKNOWN_ERROR';
  const userMessage = ERROR_MESSAGE_MAP[code] || errorMessage || 'An unexpected error occurred.';

  return {
    code,
    userMessage,
    details: errorMessage || undefined,
  };
}

/**
 * Get user-friendly message for error code
 *
 * Convenience function to get just the user message for a known error code.
 * If the code is not recognized, returns the default unknown error message.
 *
 * @param errorCode - Standardized error code
 * @returns User-friendly error message
 *
 * @example
 * ```typescript
 * getUserMessage('LMS_TIMEOUT');
 * // 'The operation timed out. The LMS may be under heavy load. Please try again later.'
 *
 * getUserMessage('CUSTOM_ERROR');
 * // 'An unexpected error occurred. Please try again or contact support if the issue persists.'
 * ```
 */
export function getUserMessage(errorCode: string): string {
  return ERROR_MESSAGE_MAP[errorCode] || ERROR_MESSAGE_MAP.UNKNOWN_ERROR;
}

/**
 * Check if error code is recognized
 *
 * Utility function to check if an error code has a mapped user-friendly message.
 *
 * @param errorCode - Error code to check
 * @returns True if error code is recognized
 *
 * @example
 * ```typescript
 * isKnownErrorCode('LMS_AUTH_FAILED'); // true
 * isKnownErrorCode('CUSTOM_ERROR'); // false
 * ```
 */
export function isKnownErrorCode(errorCode: string): boolean {
  return errorCode in ERROR_MESSAGE_MAP;
}
