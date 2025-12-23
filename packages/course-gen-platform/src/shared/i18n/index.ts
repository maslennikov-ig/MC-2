/**
 * Backend i18n module for BullMQ worker progress messages
 *
 * Provides localized progress messages (ru/en) for course generation pipeline.
 *
 * @example
 * ```typescript
 * import { getTranslator } from '@/shared/i18n';
 *
 * const t = getTranslator('en');
 * t('stage2.init'); // "Initializing document processing..."
 * ```
 *
 * @module shared/i18n
 */
export { getTranslator, type Locale, type TranslatorFn } from './translator';
export { BACKEND_TRANSLATIONS, type BackendTranslations } from './messages';
