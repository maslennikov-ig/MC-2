import { getRequestConfig } from 'next-intl/server';
import { headers, cookies } from 'next/headers';
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
  // Try to get locale from multiple sources:
  // 1. requestLocale (from next-intl middleware if used)
  // 2. x-next-intl-locale header (set by our middleware from cookie)
  // 3. NEXT_LOCALE cookie directly
  // 4. Default locale
  let locale = await requestLocale;

  if (!locale) {
    const headersList = await headers();
    locale = headersList.get('x-next-intl-locale') || undefined;
  }

  if (!locale) {
    const cookieStore = await cookies();
    locale = cookieStore.get('NEXT_LOCALE')?.value;
  }

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
