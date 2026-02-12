# Рефакторинг lifecycle.router.ts → lifecycle/ subdirectory

## Контекст

Файл `lifecycle.router.ts` (1772 строки, 6 эндпоинтов) нарушает принцип атомарности. В кодовой базе есть паттерн разбиения — `editing/` subdirectory (7 файлов, агрегатор `editing.router.ts`). Применяем тот же паттерн.

## Анализ дублирования

| Паттерн                                 | Где повторяется           | Решение                                                                       |
| --------------------------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| Course ownership check                  | ALL 6 endpoints           | Использовать `assertCourseAccess` из `server/helpers/course-authorization.ts` |
| Tier extraction (tierMap)               | initiate, generate        | Извлечь в `_shared/helpers.ts` → `extractTierFromOrg()`                       |
| Concurrency check + metrics             | initiate, generate        | Извлечь в `_shared/helpers.ts` → `checkConcurrencyLimits()`                   |
| Document summaries (file_catalog → map) | generate, restartStage(5) | Извлечь в `_shared/helpers.ts` → `buildDocumentSummaries()`                   |
| Auth guard `if (!ctx.user)`             | ALL 6 endpoints           | Убрать — `instructorProcedure` гарантирует user                               |

## План

### Шаг 1: Добавить helpers в `_shared/helpers.ts`

```typescript
// extractTierFromOrg(course) → 'FREE' | 'BASIC' | ...
// checkConcurrencyLimits(userId, tier, courseId, requestId, supabase) → void | throws
// buildDocumentSummaries(supabase, courseId) → { hasVectorizedDocs, documentSummaries }
```

### Шаг 2: Создать `lifecycle/` с 6 файлами

| Файл                                | Endpoint           | ~LOC |
| ----------------------------------- | ------------------ | ---- |
| `lifecycle/initiate.router.ts`      | initiate           | ~250 |
| `lifecycle/generate.router.ts`      | generate           | ~200 |
| `lifecycle/restart-stage.router.ts` | restartStage       | ~250 |
| `lifecycle/cleanup.router.ts`       | cleanupCourse      | ~70  |
| `lifecycle/switch-mode.router.ts`   | switchToManualMode | ~100 |
| `lifecycle/cancel.router.ts`        | cancelGeneration   | ~80  |

### Шаг 3: Переписать `lifecycle.router.ts` как агрегатор

```typescript
export const lifecycleRouter = router({
  ...initiateRouter,
  ...generateRouter,
  ...restartStageRouter,
  ...cleanupRouter,
  ...switchModeRouter,
  ...cancelRouter,
});
```

### Шаг 4: `index.ts` — БЕЗ ИЗМЕНЕНИЙ

Импорт `lifecycleRouter` остаётся тем же.

## Критические файлы

| Файл                                         | Действие                                        |
| -------------------------------------------- | ----------------------------------------------- |
| `.../generation/lifecycle.router.ts`         | Заменить на агрегатор                           |
| `.../generation/_shared/helpers.ts`          | Добавить 3 функции                              |
| `.../generation/lifecycle/*.router.ts`       | 6 новых файлов                                  |
| `.../server/helpers/course-authorization.ts` | Использовать (не менять)                        |
| `.../generation/_shared/constants.ts`        | Использовать TIER_PRIORITY (не менять)          |
| `.../generation/_shared/types.ts`            | Использовать ConcurrencyCheckResult (не менять) |
| `.../generation/index.ts`                    | БЕЗ ИЗМЕНЕНИЙ                                   |

## Паттерн sub-router (по образцу editing/)

```typescript
// lifecycle/cancel.router.ts
import { instructorProcedure } from '../../../procedures';
// ...
export const cancelRouter = {
  cancelGeneration: instructorProcedure
    .input(...)
    .mutation(async ({ ctx, input }) => { ... }),
};
```

Экспортировать **plain object** (НЕ `router(...)`), агрегатор использует spread.

## Верификация

1. `pnpm --filter course-gen-platform type-check`
2. `pnpm --filter course-gen-platform build`
3. `pnpm --filter course-gen-platform test`
4. Grep `lifecycleRouter` — все импорты корректны

---

## Промпт для агента

Ниже — готовый промпт для передачи другому агенту (code-structure-refactorer или fullstack-nextjs-specialist):

---

### TASK: Refactor lifecycle.router.ts into lifecycle/ subdirectory

**Objective**: Split the monolithic `lifecycle.router.ts` (1772 lines, 6 endpoints) into a `lifecycle/` subdirectory following the established `editing/` pattern.

**IMPORTANT**: Read ALL referenced files before making any changes. Follow existing patterns exactly.

#### Reference Files (READ FIRST)

1. **Original file**: `packages/course-gen-platform/src/server/routers/generation/lifecycle.router.ts` — the file being split
2. **Pattern to follow**: `packages/course-gen-platform/src/server/routers/generation/editing.router.ts` — aggregator pattern
3. **Sub-router pattern**: `packages/course-gen-platform/src/server/routers/generation/editing/permissions.router.ts` — simplest example of sub-router (plain object export)
4. **Sub-router pattern 2**: `packages/course-gen-platform/src/server/routers/generation/editing/field-update.router.ts` — more complex sub-router
5. **Existing helpers**: `packages/course-gen-platform/src/server/helpers/course-authorization.ts` — `assertCourseAccess()` + `buildAuthContext()` (REUSE for ownership checks)
6. **Shared helpers**: `packages/course-gen-platform/src/server/routers/generation/_shared/helpers.ts` — add new helpers here
7. **Shared types**: `packages/course-gen-platform/src/server/routers/generation/_shared/types.ts` — `ConcurrencyCheckResult`, `CourseSettings`
8. **Shared constants**: `packages/course-gen-platform/src/server/routers/generation/_shared/constants.ts` — `TIER_PRIORITY`
9. **Main index**: `packages/course-gen-platform/src/server/routers/generation/index.ts` — should NOT change

#### Step 1: Add helpers to `_shared/helpers.ts`

Add these 3 functions to the existing file:

**`extractTierFromOrg(course)`** — Extract and normalize tier from organization join:

- Input: course object with `organization` relation having `tier` field
- Output: `'FREE' | 'BASIC' | 'STANDARD' | 'TRIAL' | 'PREMIUM'`
- Logic: map lowercase db tier ('trial','free','basic','standard','premium') to uppercase enum
- Default: 'FREE'

**`checkConcurrencyLimits(params)`** — Check concurrency + log to system_metrics + throw if rejected:

- Uses `ConcurrencyTracker` from `../../../../shared/concurrency/tracker`
- On limit hit: insert `system_metrics` event + throw `TRPCError TOO_MANY_REQUESTS`
- On tracker error: throw `TRPCError INTERNAL_SERVER_ERROR`
- Extract the full logic from lines 157-211 of the original file

**`buildDocumentSummaries(supabase, courseId)`** — Query file_catalog for indexed docs + build summaries:

- Query `file_catalog` where `vector_status = 'indexed'`, select `id, filename, processed_content, mime_type`
- Return `{ hasVectorizedDocs: boolean, documentSummaries: Array<{file_id, file_name, summary, key_topics}> }`
- Extract from lines 706-741 of the original file
- Handle query errors gracefully (warn + assume no docs)

#### Step 2: Create lifecycle/ directory with 6 files

Each file exports a **plain object** (NOT `router(...)`) with a single endpoint. Pattern:

```typescript
export const xxxRouter = {
  endpointName: instructorProcedure
    .use(createRateLimiter({...}))
    .input(...)
    .mutation(async ({ ctx, input }) => { ... }),
};
```

**Files to create:**

1. **`lifecycle/initiate.router.ts`** — `initiate` endpoint (lines 80-496)
   - Replace ownership check with `assertCourseAccess(buildAuthContext(ctx.user!), course, 'initiate')`
   - Replace tier logic with `extractTierFromOrg(course)`
   - Replace concurrency logic with `checkConcurrencyLimits(...)`
   - Remove redundant `if (!ctx.user)` check
   - Keep all business logic intact (3-path decision, FSM init, generation code)

2. **`lifecycle/generate.router.ts`** — `generate` endpoint (lines 529-904)
   - Replace ownership check with `assertCourseAccess`
   - Replace tier logic with `extractTierFromOrg`
   - Replace concurrency logic with `checkConcurrencyLimits`
   - Replace document summaries logic with `buildDocumentSummaries`
   - Remove redundant `if (!ctx.user)` check
   - Keep validation logic (analysis_result, learning_outcomes parsing, input bounds)

3. **`lifecycle/restart-stage.router.ts`** — `restartStage` endpoint (lines 946-1297)
   - NO ownership check refactoring needed (uses RPC `restart_from_stage` which checks internally)
   - For Stage 5 restart: use `buildDocumentSummaries` helper
   - Remove redundant `if (!ctx.user)` check
   - Keep all stage-specific logic intact

4. **`lifecycle/cleanup.router.ts`** — `cleanupCourse` endpoint (lines 1327-1426)
   - Has DIFFERENT ownership logic (allows superadmin + no-owner courses), keep as-is or adapt `assertCourseAccess`
   - Remove redundant `if (!ctx.user)` check
   - Keep `cleanupCourseResources` call

5. **`lifecycle/switch-mode.router.ts`** — `switchToManualMode` endpoint (lines 1458-1612)
   - Replace ownership check with `assertCourseAccess`
   - Remove redundant `if (!ctx.user)` check
   - Keep mode/pause validation logic

6. **`lifecycle/cancel.router.ts`** — `cancelGeneration` endpoint (lines 1640-1765)
   - Replace ownership check with `assertCourseAccess`
   - Remove redundant `if (!ctx.user)` check
   - Keep terminal state check + job cleanup

#### Step 3: Rewrite `lifecycle.router.ts` as aggregator

Replace the entire file with an aggregator (~30 lines) following `editing.router.ts` pattern:

```typescript
import { router } from '../../trpc';
import { initiateRouter } from './lifecycle/initiate.router';
import { generateRouter } from './lifecycle/generate.router';
import { restartStageRouter } from './lifecycle/restart-stage.router';
import { cleanupRouter } from './lifecycle/cleanup.router';
import { switchModeRouter } from './lifecycle/switch-mode.router';
import { cancelRouter } from './lifecycle/cancel.router';

export const lifecycleRouter = router({
  ...initiateRouter,
  ...generateRouter,
  ...restartStageRouter,
  ...cleanupRouter,
  ...switchModeRouter,
  ...cancelRouter,
});

export type LifecycleRouter = typeof lifecycleRouter;
```

#### Step 4: Verify `index.ts` unchanged

The import `import { lifecycleRouter } from './lifecycle.router'` in `index.ts` must still work. Do NOT modify `index.ts`.

#### Critical Rules

1. **NEVER remove or change business logic** — only restructure code location
2. **NEVER change endpoint names** — `initiate`, `generate`, `restartStage`, `cleanupCourse`, `switchToManualMode`, `cancelGeneration` must stay identical
3. **All imports must be correct** — relative paths change because files move into `lifecycle/` subdir
4. **Reuse existing helpers** — `assertCourseAccess`, `buildAuthContext` from `server/helpers/course-authorization.ts`
5. **JSDoc comments** — Keep the essential JSDoc from original (purpose, input, output) but don't need full @example blocks
6. **Remove `if (!ctx.user)` guards** — `instructorProcedure` middleware guarantees `ctx.user` is non-null

#### Verification

After all changes:

```bash
pnpm --filter course-gen-platform type-check
pnpm --filter course-gen-platform build
pnpm --filter course-gen-platform test
```

All 3 must pass with no errors.
