/**
 * Centralized i18n configuration - Single Source of Truth
 *
 * All locale-related constants should be imported from here.
 * DO NOT duplicate these values elsewhere.
 */

export const locales = ['ru', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'ru';

/**
 * All translation namespaces.
 * Each namespace corresponds to a file: messages/{locale}/{namespace}.json
 *
 * To add a new namespace:
 * 1. Add the namespace name here
 * 2. Create messages/ru/{namespace}.json
 * 3. Create messages/en/{namespace}.json
 * 4. Update types/i18n.d.ts with the new type
 */
export const namespaces = ['common', 'admin', 'generation', 'auth', 'enrichments'] as const;
export type Namespace = (typeof namespaces)[number];

/**
 * Cookie configuration for locale persistence
 */
export const localeCookie = {
  name: 'NEXT_LOCALE',
  maxAge: 31536000, // 1 year
  path: '/',
  sameSite: 'lax' as const, // lowercase for cookies() API compatibility
  secure: process.env.NODE_ENV === 'production',
} as const;

/**
 * Helper to check if a locale is valid
 */
export function isValidLocale(locale: unknown): locale is Locale {
  return typeof locale === 'string' && locales.includes(locale as Locale);
}

/**
 * Helper to get locale with fallback
 */
export function getLocaleOrDefault(locale: unknown): Locale {
  return isValidLocale(locale) ? locale : defaultLocale;
}
