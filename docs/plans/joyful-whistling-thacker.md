# Fix: Userback form fields not pre-filled (GitHub #22)

## Context

Тестер (Сергей Соловьёв) сообщил, что поля email/name в виджете Userback **не заполняются автоматически** для залогиненных пользователей на `develop`. GitHub Issue #22.

## Root Cause

Текущий код передаёт `email`/`name` через **init options** и `user_data`. По документации Userback:

- `user_data` в init options — **статический** подход, требует перезагрузку, **не pre-fill'ит** поля формы
- `email`/`name` в init options — может не работать для pre-fill
- **`identify()`** — рекомендованный способ для SPA, **и идентифицирует пользователя, и заполняет поля формы**

Источники:

- [Userback React Docs](https://docs.userback.io/docs/react): `userback.identify(user_id, {name, email})` — "Use it when user data changes or your user logs out and logs back in"
- [User Identification](https://docs.userback.io/docs/user-identification): `identify()` "pre-fill fields like name and email to save users time"
- [Prefill Fields](https://docs.userback.io/docs/prefill-fields): `Userback.email = '...'` / `Userback.name = '...'`

## Fix

**Файл:** `packages/web/components/feedback/UserbackProvider.tsx`

Стратегия: после инициализации виджета вызывать `identify()` + установить `email`/`name` свойства на инстансе. При смене сессии (login/logout) — destroy + recreate с повторным `identify()`.

```tsx
'use client';

import { useEffect, useRef } from 'react';
import Userback from '@userback/widget';
import type { UserbackWidget } from '@userback/widget';
import { useSupabase } from '@/lib/supabase/browser-client';
import { usePathname } from '@/src/i18n/navigation';
import { useLocale } from 'next-intl';

const USERBACK_TOKEN = process.env.NEXT_PUBLIC_USERBACK_TOKEN;
const USERBACK_ENABLED = process.env.NEXT_PUBLIC_FEATURE_USERBACK === 'true';

const LOCALE_TO_WIDGET_LANG: Record<string, 'ru' | 'en'> = {
  ru: 'ru',
  en: 'en',
};

export function UserbackProvider() {
  const { session } = useSupabase();
  const pathname = usePathname();
  const locale = useLocale();
  const ubRef = useRef<UserbackWidget | null>(null);

  useEffect(() => {
    if (!USERBACK_ENABLED || !USERBACK_TOKEN) return;

    const user = session?.user;
    const userName = (user?.user_metadata?.full_name as string) || undefined;

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
    }).then(instance => {
      ubRef.current = instance;

      // identify() — рекомендованный способ для SPA (docs.userback.io/docs/react)
      // Одновременно идентифицирует пользователя И заполняет поля формы
      if (user) {
        instance.identify(user.id, {
          name: userName || '',
          email: user.email || '',
        });
      }
    });

    return () => {
      ubRef.current?.destroy();
      ubRef.current = null;
    };
  }, [session?.user?.id, locale]);

  useEffect(() => {
    if (!ubRef.current) return;
    ubRef.current.refresh();
  }, [pathname]);

  return null;
}
```

### Ключевые изменения vs текущий код

1. **Убраны** `email`/`name` из init options (не работают для pre-fill)
2. **Убран** `user_data` из init options (статический, не для SPA)
3. **Добавлен** `identify()` после инициализации — рекомендованный способ по документации
4. Widget destroy/recreate на `session?.user?.id` change — обеспечивает корректную очистку при logout

## Verification

1. `pnpm --filter @megacampus/web type-check`
2. Залогиненный пользователь → открыть виджет → поля email/name **предзаполнены**
3. Гость → поля пустые
4. Login → виджет обновляется с данными пользователя
5. Logout → виджет очищается
6. Нет CSP-ошибок в консоли
