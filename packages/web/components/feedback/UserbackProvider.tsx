'use client'

import { useEffect, useRef } from 'react'
import Userback from '@userback/widget'
import type { UserbackWidget } from '@userback/widget'
import { useSupabase } from '@/lib/supabase/browser-client'
import { usePathname } from '@/src/i18n/navigation'
import { useLocale } from 'next-intl'

const USERBACK_TOKEN = process.env.NEXT_PUBLIC_USERBACK_TOKEN
const USERBACK_ENABLED = process.env.NEXT_PUBLIC_FEATURE_USERBACK === 'true'

const LOCALE_TO_WIDGET_LANG: Record<string, 'ru' | 'en'> = {
  ru: 'ru',
  en: 'en',
}

export function UserbackProvider() {
  const { session } = useSupabase()
  const pathname = usePathname()
  const locale = useLocale()
  const ubRef = useRef<UserbackWidget | null>(null)

  useEffect(() => {
    if (!USERBACK_ENABLED || !USERBACK_TOKEN) return

    const user = session?.user

    Userback(USERBACK_TOKEN, {
      email: user?.email,
      name: user?.user_metadata?.full_name as string | undefined,
      user_data: user
        ? {
            id: user.id,
            info: {
              name: user.user_metadata?.full_name || '',
              email: user.email || '',
            },
          }
        : undefined,
      widget_settings: {
        language: LOCALE_TO_WIDGET_LANG[locale] ?? 'en',
      },
    }).then((instance) => {
      ubRef.current = instance
    })

    return () => {
      ubRef.current?.destroy()
      ubRef.current = null
    }
  }, [session?.user?.id, locale])

  useEffect(() => {
    if (!ubRef.current) return
    ubRef.current.refresh()
  }, [pathname])

  return null
}
