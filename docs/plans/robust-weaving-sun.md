# План исправления: 404 /api/auth/me

## Проблема

**Симптом**: В консоли браузера:

```
GET https://ai.megacampus.ru/api/auth/me 404 (Not Found)
```

**Причина**: Эндпоинт `/api/auth/me` **не существует**, но вызывается из:

- `packages/web/components/course/viewer/hooks/useViewerState.ts:101`

**Контекст**: Хук `useViewerState` пытается получить userId для синхронизации прогресса курса.

---

## Решение

Заменить fetch-вызов на существующий хук `useAuth()`.

**Почему не создавать новый эндпоинт:**

- `useAuth()` уже работает через Supabase session
- Не нужен roundtrip к серверу
- Более надёжно

---

## Изменения

**Файл**: `packages/web/components/course/viewer/hooks/useViewerState.ts`

1. Добавить импорт:

```typescript
import { useAuth } from '@/lib/hooks/use-auth';
```

2. Использовать хук в компоненте:

```typescript
const { user } = useAuth();
```

3. Заменить useEffect (строки 97-111) на синхронизацию через user:

```typescript
useEffect(() => {
  setUserId(user?.id || null);
}, [user?.id]);
```

---

## Верификация

1. `pnpm type-check` — без ошибок
2. `pnpm build` — успешная сборка
3. Проверить в браузере — ошибки 404 нет
4. Войти в аккаунт, пометить урок завершённым — прогресс синхронизируется
