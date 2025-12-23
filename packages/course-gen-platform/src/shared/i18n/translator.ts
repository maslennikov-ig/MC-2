import { BACKEND_TRANSLATIONS } from './messages';
import { logger } from '../logger/index.js';

/**
 * Supported locales for backend translations
 */
export type Locale = 'ru' | 'en';

/**
 * Translator function signature
 *
 * @param key - Dot-notation key path (e.g., "stage2.init", "steps.2.completed")
 * @param params - Optional parameters for {{param}} interpolation
 * @returns Localized string, or the key itself if translation not found
 *
 * @example
 * ```typescript
 * const t = getTranslator('en');
 * t('stage2.init'); // "Initializing document processing..."
 * t('progress', { count: 3, total: 10 }); // "Processing 3/10" (if key exists)
 * t('missing.key'); // "missing.key" (fallback)
 * ```
 */
export type TranslatorFn = (key: string, params?: Record<string, string | number>) => string;

/**
 * Create a translator function for the specified locale
 *
 * The translator resolves dot-notation keys against BACKEND_TRANSLATIONS
 * and supports {{param}} interpolation for dynamic values.
 *
 * @param locale - Target locale ('ru' or 'en'), defaults to 'ru'
 * @returns Translator function bound to the specified locale
 *
 * @example
 * ```typescript
 * const t = getTranslator('en');
 * t('stage2.docling_start'); // "Converting document..."
 * t('stage2.progress', { current: 5, total: 10 }); // With params
 * ```
 */
export function getTranslator(locale: Locale = 'ru'): TranslatorFn {
  return (key: string, params?: Record<string, string | number>): string => {
    const keys = key.split('.');
    let value: unknown = BACKEND_TRANSLATIONS;

    // Traverse the translation object using dot-notation keys
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        // Key not found - log warning and return key as fallback
        logger.warn({ key, locale }, 'Translation key not found');
        return key;
      }
    }

    // Value should be { ru: string, en: string }
    if (value && typeof value === 'object' && locale in value) {
      const localeValue = (value as Record<string, unknown>)[locale];

      // Validate that the locale value is a string
      if (typeof localeValue !== 'string') {
        logger.warn({ key, locale, valueType: typeof localeValue }, 'Translation value is not a string');
        return key;
      }

      let result = localeValue;

      // Handle parameter interpolation {{param}}
      // Using split/join is faster than creating new RegExp for each param
      if (params) {
        for (const [paramKey, paramValue] of Object.entries(params)) {
          result = result.split(`{{${paramKey}}}`).join(String(paramValue));
        }
      }

      return result;
    }

    // Locale not found in translation object
    logger.warn({ key, locale }, 'Locale not found in translation');
    return key;
  };
}
