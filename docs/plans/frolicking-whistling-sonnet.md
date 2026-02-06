# Plan: Embed Userback Feedback Widget (Issue #21)

## Context

GitHub Issue #21 запрашивает интеграцию [Userback](https://userback.io) виджета обратной связи в MegaCampusAI. Цель: пользователи смогут отправлять отзывы, баг-репорты и скриншоты прямо из приложения. Виджет управляется feature-флагом и env-переменными, поддерживает SPA-навигацию и опциональную идентификацию пользователя через Supabase session.

**Похожих закрытых issue/beads-задач нет** — это новая функциональность.

**Комментарий к issue**: только автогенерация от traycerai-бота с планом, совпадающим с нашим подходом. Полезных пользовательских предложений нет.

## Implementation Plan

### Step 1: Install `@userback/widget`

```bash
pnpm --filter @megacampus/web add @userback/widget
```

### Step 2: Create `packages/web/components/feedback/UserbackProvider.tsx`

Новый `'use client'` компонент:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import Userback from '@userback/widget';
import type { UserbackWidget } from '@userback/widget';
import { useSupabase } from '@/lib/supabase/browser-client';
import { usePathname } from '@/src/i18n/navigation';

const USERBACK_TOKEN = process.env.NEXT_PUBLIC_USERBACK_TOKEN;
const USERBACK_ENABLED = process.env.NEXT_PUBLIC_FEATURE_USERBACK === 'true';

export function UserbackProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSupabase();
  const pathname = usePathname();
  const ubRef = useRef<UserbackWidget | null>(null);

  // Initialize Userback
  useEffect(() => {
    if (!USERBACK_ENABLED || !USERBACK_TOKEN) return;

    Userback(USERBACK_TOKEN, {
      user_data: session?.user
        ? {
            id: session.user.id,
            info: {
              name: session.user.user_metadata?.full_name || '',
              email: session.user.email || '',
            },
          }
        : undefined,
    }).then(instance => {
      ubRef.current = instance;
    });
  }, [session]);

  // Refresh on route change (SPA)
  useEffect(() => {
    ubRef.current?.refresh();
  }, [pathname]);

  return <>{children}</>;
}
```

**Ключевые решения:**

- `useRef` хранит экземпляр виджета между рендерами
- `usePathname` из `@/src/i18n/navigation` (не из `next/navigation`) — проектное соглашение
- `session` в deps первого useEffect — реинициализация при login/logout
- Компонент рендерит только `{children}`, без собственного UI

### Step 3: Mount в `packages/web/app/[locale]/providers.tsx`

Добавить `UserbackProvider` **внутрь** `SupabaseProvider` (нужен доступ к `useSupabase()`):

```tsx
import { UserbackProvider } from '@/components/feedback/UserbackProvider';

// ...
<SupabaseProvider>
  <UserbackProvider>
    {children}
    <AuthModal />
  </UserbackProvider>
</SupabaseProvider>;
```

### Step 4: CSP в `packages/web/next.config.ts`

Добавить домены Userback в обе CSP-политики (dev и prod):

| Директива     | Добавить                                        | Строки   |
| ------------- | ----------------------------------------------- | -------- |
| `script-src`  | `https://static.userback.io`                    | 359, 375 |
| `connect-src` | `https://api.userback.io wss://api.userback.io` | 364, 380 |
| `frame-src`   | `https://*.userback.io`                         | 365, 381 |

### Step 5: Env variables в `.env.production.example`

В секцию FEATURE FLAGS (после строки 111):

```bash
# Userback Feedback Widget
# Get widget token from: https://app.userback.io → Widget Settings → Install
NEXT_PUBLIC_FEATURE_USERBACK=false
NEXT_PUBLIC_USERBACK_TOKEN=your-userback-widget-token-here
```

### Step 6: Beads task

```bash
bd create --type=feature --priority=3 --title="Embed Userback feedback widget" --external-ref="gh-21"
```

## Files to Modify

| File                                                    | Action                              |
| ------------------------------------------------------- | ----------------------------------- |
| `packages/web/package.json`                             | Add `@userback/widget` dependency   |
| `packages/web/components/feedback/UserbackProvider.tsx` | **Create** — new provider component |
| `packages/web/app/[locale]/providers.tsx`               | Add `<UserbackProvider>` wrapper    |
| `packages/web/next.config.ts` (lines 357-388)           | Add Userback domains to CSP         |
| `.env.production.example` (line ~111)                   | Add env var documentation           |

## Complexity

**Medium** — несколько файлов, но простая логика. Делегация subagent `nextjs-ui-designer` для создания компонента и модификации провайдеров.

## Verification

1. `pnpm --filter @megacampus/web type-check` — без ошибок типов
2. `pnpm --filter @megacampus/web build` — сборка проходит
3. Без реального токена виджет НЕ загружается (feature flag off) — регрессий нет
4. Read modified files для верификации корректности
