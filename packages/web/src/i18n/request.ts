import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { namespaces, localeCookie, getLocaleOrDefault, defaultLocale, type Namespace, type Locale } from './config';

type Messages = Record<Namespace, Record<string, unknown>>;

/**
 * Dynamically imports a namespace file for a given locale.
 * Uses dynamic import with template literal for webpack compatibility.
 * In development: fails fast to catch missing translations early.
 * In production: falls back to default locale, then empty object.
 */
async function loadNamespace(locale: string, namespace: Namespace): Promise<Record<string, unknown>> {
  try {
    const module = await import(`../../messages/${locale}/${namespace}.json`);
    return module.default;
  } catch (error) {
    // In development, fail fast to catch missing translations early
    if (process.env.NODE_ENV === 'development') {
      console.error(`[i18n] Failed to load namespace "${namespace}" for locale "${locale}":`, error);
      throw new Error(`Missing translation namespace: ${namespace} for locale: ${locale}`);
    }

    // In production, log error and try fallback
    console.error(`Failed to load namespace "${namespace}" for locale "${locale}":`, error);

    // If already trying default locale, return empty object
    if (locale === defaultLocale) {
      return {};
    }

    // Try to load default locale namespace as fallback
    try {
      const fallbackModule = await import(`../../messages/${defaultLocale}/${namespace}.json`);
      console.warn(`Using fallback locale "${defaultLocale}" for namespace "${namespace}"`);
      return fallbackModule.default;
    } catch {
      console.error(`Failed to load fallback namespace "${namespace}"`);
      return {};
    }
  }
}

/**
 * Loads all namespaces for a given locale and merges them into a single messages object.
 */
async function loadAllMessages(locale: string): Promise<Messages> {
  const entries = await Promise.all(
    namespaces.map(async (namespace) => {
      const messages = await loadNamespace(locale, namespace);
      return [namespace, messages] as const;
    })
  );

  return Object.fromEntries(entries) as Messages;
}

export default getRequestConfig(async ({ requestLocale }) => {
  // Primary: requestLocale from next-intl's createMiddleware
  // next-intl middleware handles locale detection via cookies and headers
  let locale = await requestLocale;

  // Fallback: Read cookie directly (edge cases where middleware didn't run)
  if (!locale) {
    const cookieStore = await cookies();
    locale = cookieStore.get(localeCookie.name)?.value;
  }

  // Validate and get locale with fallback to default
  const validLocale: Locale = getLocaleOrDefault(locale);

  const messages = await loadAllMessages(validLocale);

  return {
    locale: validLocale,
    messages,
  };
});
