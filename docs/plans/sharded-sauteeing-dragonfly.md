# План: Исправление Flaky CI/CD тестов

## Проблема

CI/CD тесты систематически падают на **всех ветках** (develop и master):

| Тест | Статус | Причина |
|------|--------|---------|
| Unit Tests | timeout/cancelled | Превышение 5-минутного лимита CI |
| Contract Tests | failure | Supabase rate limiting, connection errors |
| Integration Tests | failure | Supabase connection pooling |

**Результат**: Deploy на master блокируется, хотя код корректный.

---

## Корневые причины

### 1. Unit Tests — Таймаут

**Проблема**: CI таймаут (5 мин) < vitest таймаут (20 мин)

- `.github/workflows/ci-cd.yml:201` — `timeout-minutes: 5`
- `vitest.config.ts:12` — `testTimeout: 1200000` (20 мин)
- Worker процесс зависает при cleanup
- `CLEANUP_TIMEOUT_MS = 5000` (5 сек) — недостаточно

### 2. Contract Tests — Supabase Rate Limiting

**Файл**: `tests/contract/generation.test.ts`

**Проблемы в `getAuthToken()` (строки 193-218)**:
- Нет exponential backoff — фиксированная задержка 500ms
- Нет обработки 429 (Too Many Requests)
- Нет кэширования токенов между тестами
- Каждый тест создаёт новую сессию Supabase Auth

### 3. Integration Tests — Connection Pooling

**Файлы**: `tests/integration/*.test.ts`

- Каждый тест создаёт новый Supabase client
- Нет явного закрытия connections в `afterAll`
- Connection pool исчерпывается → "Database error querying schema"

---

## План исправления

### Task 1: Увеличить CI таймаут для Unit Tests

**Файл**: `.github/workflows/ci-cd.yml`

```diff
  test-unit:
    name: Unit Tests
-   timeout-minutes: 5
+   timeout-minutes: 15
```

**Риск**: Низкий. Просто даём больше времени.

---

### Task 2: Улучшить Worker Cleanup

**Файл**: `packages/course-gen-platform/tests/global-setup.ts`

```diff
- const CLEANUP_TIMEOUT_MS = 5000;
+ const CLEANUP_TIMEOUT_MS = 30000; // 30 секунд для cleanup
```

Также добавить force kill если worker не остановился:

```typescript
// В teardown()
try {
  await withTimeout(stopWorker(true), CLEANUP_TIMEOUT_MS, 'Worker stop');
} catch (e) {
  console.error('Worker cleanup timeout, forcing exit');
  process.exit(0); // Force exit вместо зависания
}
```

---

### Task 3: Добавить Exponential Backoff в getAuthToken

**Файл**: `packages/course-gen-platform/tests/contract/generation.test.ts`

```typescript
async function getAuthToken(email: string, password: string, retries = 5): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (data?.session?.access_token) {
        return data.session.access_token;
      }

      // Определяем тип ошибки
      const errorMessage = error?.message || '';
      const isRateLimit = errorMessage.includes('rate limit') || error?.status === 429;
      const isTransient = errorMessage.includes('Database error') || isRateLimit;

      if (!isTransient || attempt === retries) {
        throw new Error(`Auth failed: ${errorMessage}`);
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 16000);
      console.log(`Auth attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));

    } catch (e) {
      if (attempt === retries) throw e;
    }
  }
  throw new Error('Auth failed after all retries');
}
```

---

### Task 4: Добавить Token Caching

**Файл**: `packages/course-gen-platform/tests/contract/generation.test.ts`

```typescript
// Кэш токенов на уровне файла
const tokenCache = new Map<string, { token: string; expires: number }>();

async function getAuthToken(email: string, password: string): Promise<string> {
  const cacheKey = email;
  const cached = tokenCache.get(cacheKey);

  // Токен валиден 50 минут (Supabase default = 1 час)
  if (cached && cached.expires > Date.now()) {
    return cached.token;
  }

  // ... получение нового токена с exponential backoff ...

  tokenCache.set(cacheKey, {
    token: newToken,
    expires: Date.now() + 50 * 60 * 1000 // 50 минут
  });

  return newToken;
}
```

---

### Task 5: Shared Supabase Client для Integration Tests

**Файл**: `packages/course-gen-platform/tests/integration/shared-client.ts` (новый)

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let sharedClient: SupabaseClient | null = null;

export function getSharedSupabaseClient(): SupabaseClient {
  if (!sharedClient) {
    sharedClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
      {
        auth: { persistSession: false },
        db: { schema: 'public' }
      }
    );
  }
  return sharedClient;
}

export async function closeSharedClient(): Promise<void> {
  if (sharedClient) {
    // Supabase JS client doesn't have explicit close, but we can reset
    sharedClient = null;
  }
}
```

Использование в тестах:
```typescript
import { getSharedSupabaseClient, closeSharedClient } from './shared-client';

const supabase = getSharedSupabaseClient();

afterAll(async () => {
  await closeSharedClient();
});
```

---

## Файлы для изменения

```
.github/workflows/ci-cd.yml                              # Task 1: timeout
packages/course-gen-platform/tests/global-setup.ts       # Task 2: cleanup
packages/course-gen-platform/tests/contract/generation.test.ts  # Task 3-4: auth
packages/course-gen-platform/tests/integration/shared-client.ts # Task 5: new file
packages/course-gen-platform/tests/integration/*.test.ts        # Task 5: use shared client
```

---

## Порядок выполнения

1. **Task 1** — самый простой, сразу даёт эффект
2. **Task 2** — предотвращает зависание
3. **Task 3** — решает rate limiting
4. **Task 4** — оптимизация (можно объединить с Task 3)
5. **Task 5** — connection pooling для integration tests

---

## Верификация

### Локально
```bash
# Unit tests
cd packages/course-gen-platform
pnpm test:unit

# Contract tests
pnpm test:contract

# Integration tests
pnpm test:integration
```

### В CI
```bash
# Перезапустить workflow
gh run rerun <run-id> --failed

# Или запустить полный CI
git commit --allow-empty -m "test: trigger CI" && git push
```

### Критерии успеха
- [ ] Unit Tests проходят за < 10 минут
- [ ] Contract Tests: 0 ошибок "rate limit" или "Database error"
- [ ] Integration Tests: все проходят
- [ ] Deploy to Production выполняется

---

## Риски

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| Exponential backoff слишком медленный | Низкая | Максимум 16 сек между попытками |
| Token cache устаревает | Низкая | TTL 50 мин < Supabase TTL 60 мин |
| Force exit ломает другие тесты | Низкая | Exit только после cleanup timeout |

---

## Альтернативы (отклонены)

1. **Пропустить тесты на master** — плохо для качества
2. **Отключить Contract/Integration tests** — скрывает реальные баги
3. **Mock Supabase полностью** — теряем интеграционную проверку

---

## Beads задача

```bash
bd create "Исправить flaky CI/CD тесты" \
  -t bug \
  --priority 1 \
  --labels ci,testing \
  -d "Unit Tests timeout, Contract/Integration Tests падают из-за Supabase rate limiting.

Задачи:
1. Увеличить CI timeout для Unit Tests (5 → 15 мин)
2. Улучшить worker cleanup (5 → 30 сек + force exit)
3. Добавить exponential backoff в getAuthToken
4. Добавить token caching
5. Shared Supabase client для integration tests

Блокирует: деплой на production"
```
