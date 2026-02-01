# План: Полное исправление Flaky CI/CD тестов

## Текущий статус

**Частично исправлено (деплой работает, тесты падают):**

| Что сделано                              | Статус |
| ---------------------------------------- | ------ |
| CI timeout 5→15 мин                      | ✅     |
| Worker cleanup + force exit              | ✅     |
| `always()` для Deploy                    | ✅     |
| Container cleanup                        | ✅     |
| Shared Supabase client                   | ✅     |
| Exponential backoff (generation.test.ts) | ✅     |
| Token caching (generation.test.ts)       | ✅     |

**НЕ исправлено (тесты падают):**

| Файл                           | Проблема                                  |
| ------------------------------ | ----------------------------------------- |
| analysis.test.ts               | Нет backoff, нет caching, 3 retry с 500ms |
| locks-api.test.ts              | Линейный backoff, нет caching             |
| metrics-api.test.ts            | 1 попытка, без retry                      |
| stage2-6-full-pipeline.test.ts | 1 попытка, без retry                      |
| stage6-api.test.ts             | 3 retry с 500ms, нет backoff              |
| t055-full-pipeline.test.ts     | 1 попытка, без retry                      |
| trpc-server.test.ts            | 3 retry с 500ms, нет backoff              |
| lms-status.test.ts             | 3 retry с 500ms, нет backoff              |

**Корневая причина:** 8+ разных реализаций `getAuthToken()` без централизации.

---

## План исправления (Phase 2)

### Task 1: Создать централизованный auth-token хелпер

**Файл**: `packages/course-gen-platform/tests/helpers/auth-token.ts` (новый)

Скопировать лучшую реализацию из `generation.test.ts` и сделать её переиспользуемой:

```typescript
/**
 * Centralized Auth Token Helper
 *
 * Features:
 * - Token caching (50-min TTL, matches Supabase 1-hour default)
 * - Exponential backoff with jitter (1s-16s max)
 * - Rate limit detection (429, "rate limit", "Database error")
 * - 5 retries by default
 */

import { createClient } from '@supabase/supabase-js';

const TOKEN_CACHE = new Map<string, { token: string; expiresAt: number }>();
const TOKEN_CACHE_TTL_MS = 50 * 60 * 1000; // 50 minutes

// Singleton Supabase client for auth
let authClient: ReturnType<typeof createClient> | null = null;

function getAuthClient() {
  if (!authClient) {
    authClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return authClient;
}

function isRetryableError(error: { message?: string; status?: number } | null): boolean {
  if (!error) return false;
  const message = error.message?.toLowerCase() || '';
  return (
    error.status === 429 ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('database error') ||
    message.includes('connection') ||
    message.includes('timeout')
  );
}

export async function getAuthToken(email: string, password: string, retries = 5): Promise<string> {
  // Check cache first
  const cached = TOKEN_CACHE.get(email);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const supabase = getAuthClient();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (data?.session?.access_token) {
        TOKEN_CACHE.set(email, {
          token: data.session.access_token,
          expiresAt: Date.now() + TOKEN_CACHE_TTL_MS,
        });
        return data.session.access_token;
      }

      if (!isRetryableError(error) || attempt === retries) {
        throw new Error(`Auth failed for ${email}: ${error?.message || 'Unknown error'}`);
      }

      // Exponential backoff with jitter: ~1s, ~2s, ~4s, ~8s, ~16s
      const baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 16000);
      const jitter = Math.random() * 500;
      const delay = baseDelay + jitter;

      console.log(
        `⏳ Auth attempt ${attempt}/${retries} failed, retrying in ${Math.round(delay)}ms...`
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    } catch (e) {
      if (attempt === retries) throw e;
    }
  }
  throw new Error(`Auth failed for ${email} after ${retries} attempts`);
}

export function clearTokenCache(): void {
  TOKEN_CACHE.clear();
}
```

---

### Task 2: Обновить все test файлы

Заменить локальные `getAuthToken()` на импорт из централизованного хелпера.

**Файлы для изменения:**

| Файл                                       | Действие                                                 |
| ------------------------------------------ | -------------------------------------------------------- |
| `tests/contract/analysis.test.ts`          | Удалить локальный getAuthToken, импортировать из helpers |
| `tests/e2e/locks-api.test.ts`              | Удалить локальный getAuthToken, импортировать из helpers |
| `tests/e2e/metrics-api.test.ts`            | Удалить локальный getAuthToken, импортировать из helpers |
| `tests/e2e/stage2-6-full-pipeline.test.ts` | Удалить локальный getAuthToken, импортировать из helpers |
| `tests/e2e/stage6-api.test.ts`             | Удалить локальный getAuthToken, импортировать из helpers |
| `tests/e2e/t055-full-pipeline.test.ts`     | Удалить локальный getAuthToken, импортировать из helpers |
| `tests/integration/trpc-server.test.ts`    | Удалить локальный getAuthToken, импортировать из helpers |
| `tests/integration/lms-status.test.ts`     | Удалить локальный getAuthToken, импортировать из helpers |

**generation.test.ts** — оставить как есть (уже имеет лучшую реализацию, является источником паттерна)

**Паттерн замены:**

```diff
- async function getAuthToken(...) { ... }
+ import { getAuthToken } from '../helpers/auth-token';
```

---

### Task 3: Экспортировать из helpers/index.ts

**Файл**: `packages/course-gen-platform/tests/helpers/index.ts`

```typescript
export { getAuthToken, clearTokenCache } from './auth-token';
export { getTestSupabaseClient } from './shared-supabase';
```

---

## Файлы для изменения (итого)

```
packages/course-gen-platform/tests/helpers/auth-token.ts     # NEW: централизованный хелпер
packages/course-gen-platform/tests/helpers/index.ts          # EDIT: добавить экспорт
packages/course-gen-platform/tests/contract/analysis.test.ts # EDIT: использовать хелпер
packages/course-gen-platform/tests/e2e/locks-api.test.ts     # EDIT: использовать хелпер
packages/course-gen-platform/tests/e2e/metrics-api.test.ts   # EDIT: использовать хелпер
packages/course-gen-platform/tests/e2e/stage2-6-full-pipeline.test.ts  # EDIT
packages/course-gen-platform/tests/e2e/stage6-api.test.ts    # EDIT: использовать хелпер
packages/course-gen-platform/tests/e2e/t055-full-pipeline.test.ts      # EDIT
packages/course-gen-platform/tests/integration/trpc-server.test.ts     # EDIT
packages/course-gen-platform/tests/integration/lms-status.test.ts      # EDIT
```

---

## Верификация (на develop только!)

### Шаг 1: Локальная проверка

```bash
cd packages/course-gen-platform

# Type check
pnpm type-check

# Contract tests (основные проблемы здесь)
pnpm test:contract

# Integration tests
pnpm test:integration
```

### Шаг 2: Push на develop

```bash
git add .
git commit -m "fix(tests): centralize auth token helper with exponential backoff"
git push origin develop
```

### Шаг 3: Проверить CI на develop

```bash
gh run list --branch develop --limit 1
gh run view <run-id> --json jobs --jq '.jobs[] | "\(.name) | \(.conclusion)"'
```

### Критерии успеха

- [ ] Contract Tests: 0 ошибок "Database error querying schema"
- [ ] Contract Tests: 0 ошибок "rate limit"
- [ ] Integration Tests: все проходят
- [ ] E2E Tests: все проходят (если запускаются)

### НЕ делать

- ❌ НЕ мержить в master
- ❌ НЕ деплоить на staging
- ✅ Только develop для тестирования

---

## Риски

| Риск                               | Вероятность | Митигация                        |
| ---------------------------------- | ----------- | -------------------------------- |
| Импорт ломает тесты                | Низкая      | Проверка type-check перед commit |
| Token cache между файлами          | Низкая      | Кэш изолирован в модуле          |
| Jitter добавляет непредсказуемость | Низкая      | Max 500ms jitter, незначительно  |

---

## Порядок выполнения

1. Создать `tests/helpers/auth-token.ts`
2. Обновить `tests/helpers/index.ts`
3. Обновить каждый test файл (8 файлов)
4. `pnpm type-check` в course-gen-platform
5. Локально запустить `pnpm test:contract`
6. Push на develop
7. Проверить CI
