/**
 * Error Message Formatter Utility
 * @module shared/utils/error-formatter
 *
 * Provides safe error message extraction from unknown error types.
 * Replaces the repeated `error instanceof Error ? error.message : String(error)` pattern.
 */

/**
 * Extract a human-readable message from an unknown error
 *
 * @param error - Error instance, string, or unknown value
 * @returns Error message string
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
