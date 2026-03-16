# Fix: CI Test Timeouts and Hanging Process Issues

## Context

CI тесты страдают от двух основных проблем:

1. **Unit-тесты**: Процесс зависает после завершения тестов (orphaned BullMQ/Redis/JSDOM connections). Обходное решение — `timeout 600` + exit code 124 handling — маскирует проблему.
2. **Integration-тесты**: Постоянно превышают 20-мин лимит CI job. Последний прогон: 1084s тестов + 30s teardown + setup = ~20 мин → `cancelled`. При этом 92 из 743 тестов падают из-за зависимостей от внешних сервисов.

**Данные из последнего CI run (master, 22957499329):**

- Unit Tests: PASS (~3 мин)
- Contract Tests: PASS (~4 мин)
- Integration Tests: CANCELLED (20-мин timeout), 27/41 файлов failed, 92/743 тестов failed

## Root Causes

### 1. Unit tests: process hangs after completion

- `setup-unit.ts` создаёт JSDOM, мокает Redis/fetch, но `afterAll` cleanup недостаточен
- Vitest `pool: 'forks'` + `isolate: true` (из `vitest.shared.ts`) должен изолировать, но fork может не завершиться если есть активные таймеры/соединения
- **Текущий workaround**: `timeout 600` в CI + `continue-on-error: true` + CI Success Gate принимает `cancelled`

### 2. Integration tests: too slow + too many failures

- 41 тест-файл, `fileParallelism: false`, `maxWorkers: 1` → всё последовательно
- `testTimeout: 1200000` (20 мин!) на каждый тест — один зависший тест блокирует весь run
- `global-setup.ts` запускает BullMQ worker с concurrency=5, teardown имеет 30s guard + `process.exit(0)` fallback
- Многие тесты зависят от Supabase/Qdrant/Jina APIs без proper skip-guards
- `setup.ts` (per-file) не имеет cleanup — JSDOM window никогда не закрывается

### 3. CI workflow design issues

- `continue-on-error: true` на **всех** тест-джобах маскирует реальные падения
- CI Success Gate принимает `cancelled` status для unit tests
- Integration tests не имеют `timeout` shell wrapper (в отличие от unit tests)
- Integration tests используют тот же `setup.ts` что и contract tests — нет разделения

## Plan

### Step 1: Fix unit test hanging (setup-unit.ts)

**File:** `packages/course-gen-platform/tests/setup-unit.ts`

Добавить `forceExit`-подобное поведение через vitest config вместо shell timeout:

**File:** `packages/course-gen-platform/vitest.config.unit.ts`

```diff
  test: {
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['./tests/setup-unit.ts'],
    testTimeout: 30000,
    hookTimeout: 10000,
+   forceExit: true,
    fileParallelism: true,
```

> **Note:** Vitest не имеет `forceExit` опции (это Jest). Вместо этого, добавить cleanup всех open handles в `setup-unit.ts:afterAll`:

В `setup-unit.ts:afterAll` — убедиться что все active handles закрыты:

- Вызвать `vi.useRealTimers()` (уже есть)
- Закрыть JSDOM `dom.window.close()` (уже есть)
- Добавить `setTimeout(() => process.exit(0), 5000).unref()` как safety net

### Step 2: Fix integration test timeout configuration

**File:** `packages/course-gen-platform/vitest.config.ts`

```diff
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    reporters: ['default', 'hanging-process'],
-   testTimeout: 1200000,
+   testTimeout: 120000,
    hookTimeout: 60000,
    teardownTimeout: 30000,
    fileParallelism: false,
    maxWorkers: 1,
  },
```

**Обоснование:** 20-мин таймаут на один тест — абсурдно. Ни один интеграционный тест не должен работать 20 минут. 2 минуты (120000) — разумный лимит. Тесты, которым реально нужно больше, могут использовать per-test `{ timeout: X }`.

### Step 3: Add cleanup to integration test setup

**File:** `packages/course-gen-platform/tests/setup.ts`

Добавить `afterAll` cleanup (сейчас его нет):

```typescript
import { afterAll } from 'vitest';

// ... existing setup code ...

afterAll(() => {
  // Close JSDOM to release resources and allow process to exit
  if (dom && dom.window) {
    dom.window.close();
  }
});
```

### Step 4: Add shell-level timeout to integration tests in CI

**File:** `.github/workflows/ci-cd.yml`

```diff
      - name: Run integration tests
-       run: pnpm test:integration
+       run: |
+         timeout 900 pnpm test:integration
+         EXIT_CODE=$?
+         if [ $EXIT_CODE -eq 124 ]; then
+           echo "::warning::Integration tests timed out after 15 minutes"
+           exit 1
+         fi
+         exit $EXIT_CODE
```

**Обоснование:** 15 мин shell timeout (900s) внутри 20-мин job timeout оставляет 5 минут на setup/teardown. Тест-процесс будет kill'нут до того, как job timeout выбросит cancelled.

### Step 5: Remove `continue-on-error: true` from unit tests

**File:** `.github/workflows/ci-cd.yml`

```diff
  test-unit:
    name: Unit Tests
    runs-on: ubuntu-latest
    needs: setup
    if: ${{ !inputs.skip_tests }}
    timeout-minutes: 15
-   continue-on-error: true # Unit tests have hanging process issues, fix later
```

И убрать accept `cancelled` из CI Success Gate:

```diff
-         # Unit tests: allow success, skipped, or cancelled (timeout due to hanging process issue)
-         # continue-on-error: true makes failed jobs "success", but timeout gives "cancelled"
-         if [ "${{ needs.test-unit.result }}" != "success" ] && \
-            [ "${{ needs.test-unit.result }}" != "skipped" ] && \
-            [ "${{ needs.test-unit.result }}" != "cancelled" ]; then
-           echo "Unit tests failed with result: ${{ needs.test-unit.result }}"
+         if [ "${{ needs.test-unit.result }}" != "success" ] && \
+            [ "${{ needs.test-unit.result }}" != "skipped" ]; then
+           echo "Unit tests failed with result: ${{ needs.test-unit.result }}"
            exit 1
          fi
-         if [ "${{ needs.test-unit.result }}" == "cancelled" ]; then
-           echo "⚠️ Unit tests timed out (hanging process issue) - allowing CI to proceed"
-         fi
```

**Обоснование:** После fix'а unit test hanging (Step 1), workaround больше не нужен. Unit tests должны блокировать деплой при падении.

### Step 6: Keep `continue-on-error: true` for integration tests (intentional)

Integration tests зависят от внешних сервисов (Supabase, Qdrant, Jina). 92 из 743 тестов не приспособлены к CI среде. Они не должны блокировать деплой пока не стабилизированы.

**Не меняем** `continue-on-error: true` для test-contract и test-integration.

## Critical Files

| File                                               | Action                                                                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/course-gen-platform/tests/setup-unit.ts` | Edit — add process.exit safety net                                                                         |
| `packages/course-gen-platform/tests/setup.ts`      | Edit — add afterAll JSDOM cleanup                                                                          |
| `packages/course-gen-platform/vitest.config.ts`    | Edit — reduce testTimeout 1200000 → 120000                                                                 |
| `.github/workflows/ci-cd.yml`                      | Edit — remove continue-on-error from unit tests, add timeout wrapper to integration tests, tighten CI gate |

## Verification

1. **Локально — unit tests**: `cd packages/course-gen-platform && npx vitest run --config vitest.config.unit.ts` — должны завершиться без зависания
2. **Локально — shared build**: `pnpm build` — проверить что ничего не сломали
3. **CI — push to develop**: unit tests должны пройти без `timeout 600` kill
4. **CI — push to master**: integration tests должны уложиться в shell timeout (900s) или явно упасть с конкретной ошибкой вместо `cancelled`
5. `pnpm type-check` — must pass
