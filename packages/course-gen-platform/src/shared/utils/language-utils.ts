/**
 * Language normalization utilities
 *
 * Consolidates language code handling across the platform:
 * - ISO 639-1 code normalization (2-char codes: ru, en, zh, etc.)
 * - Full language name mapping (Russian → ru, English → en, etc.)
 * - Fallback handling for unknown languages
 *
 * @module language-utils
 */

import { logger } from '../logger';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Language code type with known values + extensibility
 *
 * Known codes get autocomplete, but any 2-char string is valid.
 * Uses branded type pattern for flexibility.
 */
export type SupportedLanguage =
  | 'ru'
  | 'en'
  | 'zh'
  | 'es'
  | 'fr'
  | 'de'
  | 'ja'
  | 'ko'
  | 'ar'
  | 'pt'
  | 'it'
  | 'tr'
  | 'vi'
  | 'th'
  | 'id'
  | 'ms'
  | 'hi'
  | 'bn'
  | 'pl';

/**
 * Language code - known codes or any 2-char ISO 639-1 string
 *
 * The `string & {}` pattern allows TypeScript to accept any string while
 * still providing autocomplete for known SupportedLanguage values.
 */
export type LanguageCode = SupportedLanguage | (string & {});

/**
 * Language for database lookups - only ru/en have specific configs
 *
 * Used in model config service for language-specific reserve percentages.
 * The 'any' value is used as a universal fallback for other languages.
 */
export type ReserveLanguage = 'ru' | 'en' | 'any';

/**
 * Language code normalization map (ISO 639-1)
 * Supports both 2-char codes and full names for backward compatibility
 *
 * Uses 'as const' assertion to ensure readonly object with literal types
 */
export const LANGUAGE_NAME_TO_CODE = {
  // Lowercase 2-char codes (already valid)
  ru: 'ru',
  en: 'en',
  zh: 'zh',
  es: 'es',
  fr: 'fr',
  de: 'de',
  ja: 'ja',
  ko: 'ko',
  ar: 'ar',
  pt: 'pt',
  it: 'it',
  tr: 'tr',
  vi: 'vi',
  th: 'th',
  id: 'id',
  ms: 'ms',
  hi: 'hi',
  bn: 'bn',
  pl: 'pl',
  // Full names (backward compatibility with database)
  Russian: 'ru',
  russian: 'ru',
  English: 'en',
  english: 'en',
  Chinese: 'zh',
  Spanish: 'es',
  French: 'fr',
  German: 'de',
  Japanese: 'ja',
  Korean: 'ko',
  Arabic: 'ar',
  Portuguese: 'pt',
  Italian: 'it',
  Turkish: 'tr',
  Vietnamese: 'vi',
  Thai: 'th',
  Indonesian: 'id',
  Malay: 'ms',
  Hindi: 'hi',
  Bengali: 'bn',
  Polish: 'pl',
} as const;

/** Fallback value for unknown languages in database lookups */
export const LANGUAGE_FALLBACK = 'any' as const;

/**
 * Normalize language code to ISO 639-1 format
 *
 * Handles multiple input formats:
 * - 2-char ISO codes: 'ru', 'en', 'zh' → return as-is
 * - Full names: 'Russian', 'English', 'Chinese' → convert to ISO code
 * - Case-insensitive: 'RU', 'russian', 'ENGLISH' → normalize
 * - Unknown formats: '??', 'Unknown' → fallback to 'any'
 * - Undefined: use defaultLang parameter
 *
 * @param language - Language code or name (case-sensitive for names)
 * @param defaultLang - Default language if undefined (default: 'en')
 * @returns ISO 639-1 code ('ru', 'en', etc.) or 'any' for unknown
 *
 * @example
 * ```typescript
 * normalizeLanguageCode('ru')           // → 'ru'
 * normalizeLanguageCode('Russian')      // → 'ru'
 * normalizeLanguageCode('RU')           // → 'ru'
 * normalizeLanguageCode('russian')      // → 'ru'
 * normalizeLanguageCode('zh')           // → 'zh'
 * normalizeLanguageCode('Chinese')      // → 'zh'
 * normalizeLanguageCode('??')           // → 'any'
 * normalizeLanguageCode(undefined)      // → 'en' (default)
 * normalizeLanguageCode(undefined, 'ru') // → 'ru' (custom default)
 * ```
 */
export function normalizeLanguageCode(
  language: LanguageCode | undefined,
  defaultLang: SupportedLanguage = 'en'
): string {
  if (!language) {
    return defaultLang;
  }

  // Trim whitespace for validation
  const trimmed = language.trim();
  if (!trimmed) {
    logger.warn(
      {
        language,
        defaultLang,
      },
      '[language-utils] Empty language string after trim, using default'
    );
    return defaultLang;
  }

  // Try exact match first (case-sensitive for full names like 'Russian')
  const exactMatch = LANGUAGE_NAME_TO_CODE[trimmed as keyof typeof LANGUAGE_NAME_TO_CODE];
  if (exactMatch) {
    return exactMatch;
  }

  // Try lowercase match for case-insensitive codes
  const lowercaseMatch =
    LANGUAGE_NAME_TO_CODE[trimmed.toLowerCase() as keyof typeof LANGUAGE_NAME_TO_CODE];
  if (lowercaseMatch) {
    return lowercaseMatch;
  }

  // If it's a 2-char code not in our map, accept it as-is (ISO 639-1 format)
  if (trimmed.length === 2) {
    const normalized = trimmed.toLowerCase();
    logger.debug(
      {
        language: trimmed,
        normalized,
      },
      '[language-utils] Unknown 2-char language code, accepting as-is'
    );
    return normalized;
  }

  // Unknown language format
  logger.warn(
    {
      language: trimmed,
      fallback: LANGUAGE_FALLBACK,
    },
    '[language-utils] Unknown language format, using fallback'
  );
  return LANGUAGE_FALLBACK;
}

/**
 * Normalize language for model config reserve lookup
 * Only 'ru' and 'en' have specific reserves, others use 'any'
 *
 * This is used for database lookups where model configurations are stored
 * per-language. The database has specific configs for Russian and English,
 * while other languages use the 'any' fallback reserve.
 *
 * @param language - Language code or name
 * @returns 'ru', 'en', or 'any'
 *
 * @example
 * ```typescript
 * normalizeLanguageForReserve('ru')        // → 'ru'
 * normalizeLanguageForReserve('Russian')   // → 'ru'
 * normalizeLanguageForReserve('en')        // → 'en'
 * normalizeLanguageForReserve('English')   // → 'en'
 * normalizeLanguageForReserve('zh')        // → 'any'
 * normalizeLanguageForReserve('Chinese')   // → 'any'
 * normalizeLanguageForReserve(undefined)   // → 'en'
 * ```
 */
export function normalizeLanguageForReserve(language: LanguageCode | undefined): ReserveLanguage {
  const normalized = normalizeLanguageCode(language, 'en');
  if (normalized === 'ru' || normalized === 'en') {
    return normalized;
  }
  return LANGUAGE_FALLBACK;
}
