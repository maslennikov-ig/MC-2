/**
 * Sanitize error messages for safe display in UI
 *
 * Features:
 * - Strips HTML tags to prevent XSS
 * - Truncates to configurable max length
 * - Provides localized fallback for empty/null messages
 *
 * @module lib/utils/sanitize-error
 */

export interface SanitizeErrorOptions {
  /** Fallback message when input is null/undefined/empty */
  fallback?: string;
  /** Maximum length before truncation (default: 150) */
  maxLength?: number;
  /** Locale for default fallback message */
  locale?: string;
}

const DEFAULT_FALLBACKS: Record<string, string> = {
  ru: 'Произошла ошибка',
  en: 'An error occurred',
};

/**
 * Sanitize error message for safe UI display
 *
 * @param message - Raw error message (may contain HTML, be too long, or null)
 * @param options - Configuration options
 * @returns Sanitized, truncated error message safe for display
 *
 * @example
 * ```typescript
 * // Basic usage
 * sanitizeErrorMessage('Something went wrong');
 * // => 'Something went wrong'
 *
 * // With HTML stripping
 * sanitizeErrorMessage('<script>alert("xss")</script>Error');
 * // => 'Error'
 *
 * // With custom fallback
 * sanitizeErrorMessage(null, { fallback: 'Custom error' });
 * // => 'Custom error'
 *
 * // With locale fallback
 * sanitizeErrorMessage(null, { locale: 'ru' });
 * // => 'Произошла ошибка'
 *
 * // With max length
 * sanitizeErrorMessage('Very long message...', { maxLength: 50 });
 * // => 'Very long message...' (truncated to 50 chars with ellipsis)
 * ```
 */
export function sanitizeErrorMessage(
  message: string | null | undefined,
  options: SanitizeErrorOptions = {}
): string {
  const { fallback, maxLength = 150, locale = 'en' } = options;

  // Handle null/undefined/empty
  if (!message || message.trim() === '') {
    return fallback ?? DEFAULT_FALLBACKS[locale] ?? DEFAULT_FALLBACKS.en;
  }

  // Strip HTML tags
  const stripped = message.replace(/<[^>]*>/g, '');

  // Truncate if too long
  if (stripped.length > maxLength) {
    return stripped.slice(0, maxLength) + '...';
  }

  return stripped;
}

/**
 * Extract and sanitize error message from unknown error type
 *
 * Useful for catch blocks where error type is unknown.
 *
 * @param error - Unknown error (Error instance, string, or other)
 * @param options - Sanitization options
 * @returns Sanitized error message
 *
 * @example
 * ```typescript
 * try {
 *   await someOperation();
 * } catch (err) {
 *   const message = getErrorMessage(err, { locale: 'ru' });
 *   toast.error(message);
 * }
 * ```
 */
export function getErrorMessage(
  error: unknown,
  options: SanitizeErrorOptions = {}
): string {
  if (error instanceof Error) {
    return sanitizeErrorMessage(error.message, options);
  }

  if (typeof error === 'string') {
    return sanitizeErrorMessage(error, options);
  }

  // For other types, use fallback
  return options.fallback ?? DEFAULT_FALLBACKS[options.locale ?? 'en'] ?? DEFAULT_FALLBACKS.en;
}
