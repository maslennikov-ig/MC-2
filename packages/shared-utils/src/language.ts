/**
 * Language normalization utilities.
 *
 * ISO 639-1 code normalization, full language name mapping, fallback handling.
 * Pure functions — no external dependencies.
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
 * Language code - known codes or any 2-char ISO 639-1 string.
 * The `string & {}` pattern provides autocomplete for known values.
 */
export type LanguageCode = SupportedLanguage | (string & {});

/**
 * Language for database lookups - only ru/en have specific configs.
 * The 'any' value is a universal fallback for other languages.
 */
export type ReserveLanguage = 'ru' | 'en' | 'any';

/**
 * Language code normalization map (ISO 639-1).
 * Supports both 2-char codes and full names for backward compatibility.
 */
export const LANGUAGE_NAME_TO_CODE = {
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
  Russian: 'ru',
  russian: 'ru',
  English: 'en',
  english: 'en',
  Chinese: 'zh',
  chinese: 'zh',
  Spanish: 'es',
  spanish: 'es',
  French: 'fr',
  french: 'fr',
  German: 'de',
  german: 'de',
  Japanese: 'ja',
  japanese: 'ja',
  Korean: 'ko',
  korean: 'ko',
  Arabic: 'ar',
  arabic: 'ar',
  Portuguese: 'pt',
  portuguese: 'pt',
  Italian: 'it',
  italian: 'it',
  Turkish: 'tr',
  turkish: 'tr',
  Vietnamese: 'vi',
  vietnamese: 'vi',
  Thai: 'th',
  thai: 'th',
  Indonesian: 'id',
  indonesian: 'id',
  Malay: 'ms',
  malay: 'ms',
  Hindi: 'hi',
  hindi: 'hi',
  Bengali: 'bn',
  bengali: 'bn',
  Polish: 'pl',
  polish: 'pl',
} as const;

/** Fallback value for unknown languages in database lookups */
export const LANGUAGE_FALLBACK = 'any' as const;

/**
 * Normalize language code to ISO 639-1 format.
 *
 * Handles: 2-char codes, full names, case-insensitive matching, unknown fallback.
 */
export function normalizeLanguageCode(
  language: LanguageCode | undefined,
  defaultLang: SupportedLanguage = 'en'
): SupportedLanguage | 'any' {
  if (!language) {
    return defaultLang;
  }

  const trimmed = language.trim();
  if (!trimmed) {
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

  // Unknown language — return fallback
  return LANGUAGE_FALLBACK;
}

/**
 * Normalize language for model config reserve lookup.
 * Only 'ru' and 'en' have specific reserves, others use 'any'.
 */
export function normalizeLanguageForReserve(language: LanguageCode | undefined): ReserveLanguage {
  const normalized = normalizeLanguageCode(language, 'en');
  if (normalized === 'ru' || normalized === 'en') {
    return normalized;
  }
  return LANGUAGE_FALLBACK;
}
