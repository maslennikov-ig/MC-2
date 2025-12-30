/**
 * Type definitions for next-intl translations
 *
 * This file provides full type safety for translation keys across the application.
 * It uses the Russian messages as the source of truth for type checking.
 *
 * @see https://next-intl.dev/docs/workflows/typescript
 */

import type { Locale } from '@/src/i18n/config';

// Import Russian messages as the source of truth for types (namespace-based)
type CommonMessages = typeof import('../messages/ru/common.json');
type AdminMessages = typeof import('../messages/ru/admin.json');
type GenerationMessages = typeof import('../messages/ru/generation.json');
type AuthMessages = typeof import('../messages/ru/auth.json');
type EnrichmentsMessages = typeof import('../messages/ru/enrichments.json');
type CourseMessages = typeof import('../messages/ru/course.json');
type OrganizationsMessages = typeof import('../messages/ru/organizations.json');

// Combined messages type matching the structure returned by request.ts
type Messages = {
  common: CommonMessages;
  admin: AdminMessages;
  generation: GenerationMessages;
  auth: AuthMessages;
  enrichments: EnrichmentsMessages;
  course: CourseMessages;
  organizations: OrganizationsMessages;
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
     * t('stages.stage_1'); // Type-safe
     * t('invalid'); // TypeScript error
     * ```
     */
    Messages: Messages;

    /**
     * Strictly typed locale values from centralized config
     */
    Locale: Locale;
  }
}

export {};
