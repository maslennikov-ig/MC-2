/**
 * Locale Validation Utilities
 * @module shared/validation/locale-validator
 *
 * Provides type-safe locale validation to replace unsafe type assertions.
 * Used across routers and handlers to ensure locale values are valid.
 *
 * ## Locale Fallback Rationale
 *
 * The default fallback is 'ru' (Russian) for the following reasons:
 *
 * 1. **Primary Market**: The platform's primary user base is Russian-speaking,
 *    so 'ru' is the most likely correct choice when locale is missing/invalid.
 *
 * 2. **Graceful Degradation**: We fallback instead of throwing errors because:
 *    - Legacy database records may have null/undefined language fields
 *    - External API integrations might not always provide locale
 *    - UI should render content rather than show errors for missing metadata
 *
 * 3. **Type Safety**: Replaces legacy unsafe patterns like:
 *    `(value || 'ru') as 'ru' | 'en'` which bypasses TypeScript checks
 *
 * 4. **Future Extensibility**: When adding new locales, only VALID_LOCALES
 *    array needs updating - all validation logic remains unchanged.
 *
 * @see packages/web/src/i18n/config.ts - Frontend i18n configuration (SSOT)
 */

/**
 * Supported locale type
 */
export type SupportedLocale = 'ru' | 'en';

/**
 * Valid locale values
 */
const VALID_LOCALES: readonly SupportedLocale[] = ['ru', 'en'] as const;

/**
 * Default locale when value is invalid or missing
 */
export const DEFAULT_LOCALE: SupportedLocale = 'ru';

/**
 * Type guard to check if a value is a valid locale
 *
 * @param value - Value to check
 * @returns True if value is a valid SupportedLocale
 *
 * @example
 * ```typescript
 * if (isValidLocale(course.language)) {
 *   // language is typed as SupportedLocale
 * }
 * ```
 */
export function isValidLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && VALID_LOCALES.includes(value as SupportedLocale);
}

/**
 * Validate and return a safe locale value with fallback
 *
 * Replaces unsafe type assertions like `(value || 'ru') as 'ru' | 'en'`
 * with proper validation.
 *
 * @param value - Locale value to validate (can be undefined/null/any string)
 * @param fallback - Fallback locale if value is invalid (default: 'ru')
 * @returns Valid SupportedLocale
 *
 * @example
 * ```typescript
 * // Before (unsafe):
 * locale: (course.language || 'ru') as 'ru' | 'en'
 *
 * // After (safe):
 * locale: validateLocale(course.language)
 * ```
 */
export function validateLocale(
  value: string | null | undefined,
  fallback: SupportedLocale = DEFAULT_LOCALE
): SupportedLocale {
  if (isValidLocale(value)) {
    return value;
  }
  return fallback;
}
