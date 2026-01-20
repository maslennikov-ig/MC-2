'use client'

import { useEffect, useRef } from 'react'
import { useLocale } from 'next-intl'
import { useRouter, usePathname } from '@/src/i18n/navigation'
import { setLocale } from '@/app/actions/i18n'
import { locales, type Locale } from '@/src/i18n/config'
import { getLocalPreferences, saveLocalPreferences } from '@/lib/user-preferences'

/**
 * LocaleInitializer - ensures locale consistency between cookie and localStorage.
 *
 * On mount, checks if saved language in localStorage differs from current locale.
 * If different and valid, applies the saved preference.
 * If no saved preference, saves current locale to localStorage.
 *
 * This component renders nothing and runs only once on mount.
 */
export function LocaleInitializer() {
  const currentLocale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const hasInitialized = useRef(false)

  useEffect(() => {
    // Only run once on mount
    if (hasInitialized.current) return
    hasInitialized.current = true

    const initializeLocale = async () => {
      const savedPrefs = getLocalPreferences()

      if (!savedPrefs) {
        // No saved preferences - nothing to sync
        return
      }

      const savedLanguage = savedPrefs.language as Locale | undefined

      // Validate saved language
      if (!savedLanguage || !locales.includes(savedLanguage)) {
        // Invalid saved language - update to current locale
        saveLocalPreferences({ ...savedPrefs, language: currentLocale })
        return
      }

      // If saved language matches current, no action needed
      if (savedLanguage === currentLocale) {
        return
      }

      // Saved language differs from current - apply saved preference
      // This handles the case where user selected a language but cookie was lost/cleared
      try {
        // Set the locale cookie
        await setLocale(savedLanguage)

        // Navigate to the saved locale
        router.replace(pathname, { locale: savedLanguage })
      } catch (error) {
        // If navigation fails, update localStorage to match current locale
        console.error('[LocaleInitializer] Failed to apply saved locale:', error)
        saveLocalPreferences({ ...savedPrefs, language: currentLocale })
      }
    }

    // Small delay to avoid hydration mismatch
    const timeoutId = setTimeout(() => {
      void initializeLocale()
    }, 100)

    return () => clearTimeout(timeoutId)
  }, [currentLocale, pathname, router])

  // This component renders nothing
  return null
}

export default LocaleInitializer
