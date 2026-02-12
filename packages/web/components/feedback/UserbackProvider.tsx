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
    const userName = (user?.user_metadata?.full_name as string) || undefined

    Userback(USERBACK_TOKEN, {
      widget_settings: {
        language: LOCALE_TO_WIDGET_LANG[locale] ?? 'en',
        help_title:
          locale === 'ru'
            ? userName
              ? `Привет, ${userName}! Чем можем помочь?`
              : 'Чем мы можем помочь?'
            : undefined,
        help_message: locale === 'ru' ? 'Оставьте отзыв или сообщите об ошибке' : undefined,
      },
    }).then((instance) => {
      ubRef.current = instance

      // identify() — рекомендованный способ для SPA (docs.userback.io/docs/react)
      // Одновременно идентифицирует пользователя И заполняет поля формы
      if (user) {
        instance.identify(user.id, {
          name: userName || '',
          email: user.email || '',
        })
      }
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
