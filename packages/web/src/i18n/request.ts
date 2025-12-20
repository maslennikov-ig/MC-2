import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

/**
 * List of all translation namespaces.
 * Add new namespaces here - they will be automatically loaded.
 *
 * Each namespace corresponds to a file in messages/{locale}/{namespace}.json
 */
const NAMESPACES = ['common', 'admin', 'generation'] as const;

type Namespace = (typeof NAMESPACES)[number];
type Messages = Record<Namespace, Record<string, unknown>>;

/**
 * Dynamically imports a namespace file for a given locale.
 * Uses dynamic import with template literal for webpack compatibility.
 */
async function loadNamespace(locale: string, namespace: Namespace): Promise<Record<string, unknown>> {
  try {
    // Dynamic import with explicit path pattern for webpack static analysis
    const module = await import(`../../messages/${locale}/${namespace}.json`);
    return module.default;
  } catch (error) {
    console.warn(`Failed to load namespace "${namespace}" for locale "${locale}":`, error);
    return {};
  }
}

/**
 * Loads all namespaces for a given locale and merges them into a single messages object.
 */
async function loadAllMessages(locale: string): Promise<Messages> {
  const entries = await Promise.all(
    NAMESPACES.map(async (namespace) => {
      const messages = await loadNamespace(locale, namespace);
      return [namespace, messages] as const;
    })
  );

  return Object.fromEntries(entries) as Messages;
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // Validate locale
  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    locale = routing.defaultLocale;
  }

  const messages = await loadAllMessages(locale);

  return {
    locale: locale as 'ru' | 'en',
    messages,
  };
});
