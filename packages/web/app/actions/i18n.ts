'use server';

import { cookies } from 'next/headers';
import { localeCookie, isValidLocale, type Locale } from '@/src/i18n/config';

/**
 * Server Action to set the user's preferred locale.
 * Uses proper cookie attributes including Secure flag in production.
 */
export async function setLocale(locale: Locale): Promise<{ success: boolean }> {
  if (!isValidLocale(locale)) {
    return { success: false };
  }

  const cookieStore = await cookies();
  cookieStore.set(localeCookie.name, locale, {
    maxAge: localeCookie.maxAge,
    path: localeCookie.path,
    sameSite: localeCookie.sameSite,
    secure: localeCookie.secure,
  });

  return { success: true };
}
