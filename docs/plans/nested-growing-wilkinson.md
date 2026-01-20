# Plan: Fix course_size not applied in Stage 4 (GTQ-6162)

## Problem Summary

Курс GTQ-6162 был создан с `course_size = 'mini'` (8-16 уроков), но Stage 4 сгенерировал 48 уроков, игнорируя preset.

## ROOT CAUSE FOUND ✅

**Разница между E2E тестами и production flow:**

| E2E Test                     | Production Flow            |
| ---------------------------- | -------------------------- |
| `INSERT` с course_size сразу | `INSERT` без course_size   |
| `addJob()` сразу после       | `UPDATE` course_size позже |
| Нет race condition           | **Race condition!**        |

**Production flow проблема:**

1. `materializeDraftSession` → INSERT курс БЕЗ course_size
2. `updateDraftAndStartGeneration` → UPDATE course_size
3. Router redirect → страница генерации
4. Frontend auto-starts → `startGeneration(courseId)`
5. Stage 4 handler SELECT → **читает ДО применения UPDATE!**

**E2E тест работает** потому что создаёт курс СРАЗУ с course_size:

```typescript
// e2e-mini-auto-course.ts:54-76
await supabase.from('courses').insert({
  course_size: TEST_CONFIG.COURSE_SIZE, // ← Сразу при INSERT!
});
```

## Timeline Analysis

| Event              | Time (UTC)  | Delta |
| ------------------ | ----------- | ----- |
| Course created     | 22:33:47.62 | -     |
| Generation started | 22:33:51.86 | +4.2s |
| Stage 4 init trace | 22:33:56    | +8.4s |

**4.2 секунды** между созданием и стартом генерации — это очень быстро для async update!

## Action Plan

### Step 1: Deploy DEV (immediate)

DEV сервер отстаёт на 3 коммита. Нужно задеплоить актуальный develop.

### Step 2: Fix Race Condition (main fix)

**Рекомендуемое решение:** Передавать `course_size` через данные job, а не читать из БД.

Файлы для изменения:

1. `packages/web/app/actions/admin-generation.ts` - передавать course_size в initiate
2. `packages/course-gen-platform/src/server/routers/generation/lifecycle.router.ts` - принимать course_size
3. `packages/course-gen-platform/src/stages/stage4-analysis/handler.ts` - использовать course_size из job data с fallback на БД

### Step 3: Add Logging (diagnostic)

Добавить лог в Stage 4 handler чтобы видеть какое значение course_size читается из БД.

## Files to Modify

| File                                                                             | Change                                  |
| -------------------------------------------------------------------------------- | --------------------------------------- |
| `packages/web/app/actions/admin-generation.ts`                                   | Передать course_size в initiate payload |
| `packages/course-gen-platform/src/server/routers/generation/lifecycle.router.ts` | Принять course_size из input            |
| `packages/course-gen-platform/src/stages/stage4-analysis/handler.ts`             | Использовать course_size из job data    |

## Verification

1. Задеплоить DEV
2. Создать тестовый курс с `course_size = 'mini'` через UI (automatic mode)
3. Проверить что Stage 4 промпт содержит MINI preset guidance
4. Проверить что сгенерировано 8-16 уроков
