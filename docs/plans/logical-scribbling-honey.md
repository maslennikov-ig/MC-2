# Fix Contract Test Auth Failures in CI

## Context

Contract tests на CI стабильно падают с ошибками `Auth attempt X/5 failed for test-instructor1@megacampus.com (transient error)`. Все 5 попыток retry проваливаются.

**Корневая причина**: `generation.test.ts` содержит **дублированную** inline-реализацию `getAuthToken()` (строки 186-284), которая создаёт **новый `createClient()` при каждом вызове** через dynamic `import()`. Это порождает 15+ `GoTrueClient` инстансов, которые исчерпывают пул соединений Supabase → "Database error querying schema" → ошибка классифицируется как transient → retry тоже создаёт новый клиент → бесконечный цикл.

Централизованный хелпер `tests/helpers/auth-token.ts` уже решает эту проблему через singleton-паттерн, но `generation.test.ts` его не использует.

## Plan

### Step 1: Add centralized import to generation.test.ts

Добавить после существующих импортов (после строки 43):

```typescript
import { getAuthToken, clearTokenCache } from '../helpers/auth-token';
```

### Step 2: Remove inline getAuthToken (lines 186-284)

Удалить ~99 строк:

- Строки 186-189: `TOKEN_CACHE`, `TOKEN_CACHE_TTL_MS`
- Строки 191-284: вся inline `getAuthToken()` функция с JSDoc

Следующий блок (строка 286+, `createTestCourse`) остаётся без изменений.

### Step 3: Add clearTokenCache() to afterAll

В блоке `afterAll` (строка 438), добавить `clearTokenCache()` перед cleanup auth users (строка 456):

```typescript
// Clear cached auth tokens
clearTokenCache();
```

### Step 4: No call-site changes needed

Все 14 вызовов `getAuthToken` в файле используют идентичную сигнатуру:

```typescript
const token = await getAuthToken(TEST_USERS.instructor1.email, 'test-password-123');
```

Централизованный хелпер имеет ту же сигнатуру: `(email, password, retries?) => Promise<string>`.

## Critical Files

| File                                                             | Action                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| `packages/course-gen-platform/tests/contract/generation.test.ts` | Modify: add import, remove lines 186-284, add clearTokenCache |
| `packages/course-gen-platform/tests/helpers/auth-token.ts`       | Reference only, no changes                                    |
| `packages/course-gen-platform/tests/contract/analysis.test.ts`   | Reference pattern (line 43)                                   |

## What Changes at Runtime

| Metric                  | Before                          | After                       |
| ----------------------- | ------------------------------- | --------------------------- |
| GoTrueClient instances  | Up to 70 (14 calls x 5 retries) | 1 (singleton)               |
| Token cache             | Per-file (lost between retries) | Shared singleton (persists) |
| Log prefix              | `Auth attempt`                  | `[AuthToken] Attempt`       |
| Network error detection | Missing                         | Included                    |

## Verification

1. `pnpm type-check` — проверка типов
2. `pnpm --filter course-gen-platform test tests/contract/generation.test.ts` — тесты generation
3. `pnpm --filter course-gen-platform test tests/contract/` — все contract тесты
4. Проверить в логах `[AuthToken]` prefix (подтверждает использование singleton)
5. Убедиться что warning "Multiple GoTrueClient instances" исчез
6. Push в develop → проверить CI run
