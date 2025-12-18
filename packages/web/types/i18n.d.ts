/**
 * Type definitions for next-intl translations
 *
 * This file provides full type safety for translation keys across the application.
 * It uses the Russian messages as the source of truth for type checking.
 *
 * @see https://next-intl.dev/docs/workflows/typescript
 */

// Import Russian messages as the source of truth for types (namespace-based)
type CommonMessages = typeof import('../messages/ru/common.json');
type AdminMessages = typeof import('../messages/ru/admin.json');
type GenerationMessages = typeof import('../messages/ru/generation.json');

// Combined messages type matching the structure returned by request.ts
type Messages = {
  common: CommonMessages;
  admin: AdminMessages;
  generation: GenerationMessages;
};

declare global {
  // Make sure IntlMessages is available globally
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface IntlMessages extends Messages {}
}

declare module 'next-intl' {
  interface AppConfig {
    /**
     * Type-safe messages based on Russian translations (namespace-based)
     *
     * This enables autocomplete and validation for all translation keys.
     * Example usage:
     * ```tsx
     * const t = useTranslations('generation');
     * t('stages.stage_1'); // ✅ Type-safe
     * t('invalid'); // ❌ TypeScript error
     *
     * const tCommon = useTranslations('common');
     * tCommon('loading'); // ✅ Type-safe
     * ```
     */
    Messages: Messages;

    /**
     * Strictly typed locale values
     *
     * Ensures only valid locales ('ru' | 'en') can be used throughout the app.
     * Example usage:
     * ```tsx
     * const locale = useLocale(); // Type: 'ru' | 'en'
     * <Link href="/" locale="en" /> // ✅ Type-safe
     * <Link href="/" locale="fr" /> // ❌ TypeScript error
     * ```
     */
    Locale: 'ru' | 'en';
  }
}

export {};
