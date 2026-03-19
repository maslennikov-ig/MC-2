# Исследование курса AGD-0687 и системные исправления

## Context

Курс AGD-0687 ("Как стать счастливым") — штатно ожидает ответов на 11 уточняющих вопросов. Ошибок нет. Но при исследовании выявлены **2 системные проблемы**, затрагивающие все генерации.

Похожие закрытые задачи: mc2-jv8s (дубли вопросов), mc2-csxx (UI fallback). **Обе проблемы ниже — НОВЫЕ.**

---

## Проблема 1: Дублирование FSM инициализации (CRITICAL)

**Симптом**: 2 события `FSM_INITIALIZED` для AGD-0687 (4 сек разница). Stage 2 × 3, Stage 3 × 2. Всего 3 курса за неделю затронуты.

**Root Cause**: `initiate.router.ts:245` — `Date.now()` в idempotency key делает каждый вызов уникальным:

```typescript
idempotencyKey: `generation-${courseId}-${Date.now()}`;
```

Трёхслойная защита (Redis 24h + DB 48h + cache) бесполезна, т.к. ключи всегда разные.

**Почему нельзя просто убрать `Date.now()`**: Idempotency keys хранятся 48 часов в БД. Стабильный ключ `generation-${courseId}` заблокирует повторную генерацию после отмены/сброса в течение 48 часов.

**Fix**: Добавить **guard по статусу курса** перед FSM инициализацией. Если курс уже в процессе генерации — отклонить запрос.

### Реализация

В `initiate.router.ts`, после проверки `assertCourseAccess` (строка ~53), добавить:

```typescript
// Prevent duplicate generation - reject if already in progress
const ALLOWED_INITIATE_STATUSES = ['draft', 'pending', 'failed', 'cancelled'];
if (course.generation_status && !ALLOWED_INITIATE_STATUSES.includes(course.generation_status)) {
  logger.warn(
    { requestId, courseId, currentStatus: course.generation_status },
    'Duplicate generation attempt rejected - course already in progress'
  );
  throw new TRPCError({
    code: 'CONFLICT',
    message: `Course generation already in progress (status: ${course.generation_status})`,
  });
}
```

**Файл**: `packages/course-gen-platform/src/server/routers/generation/lifecycle/initiate.router.ts:53`

---

## Проблема 2: Прогресс-сообщение вводит в заблуждение (MEDIUM)

**Симптом**: Курс показывает "Генерация уточняющих вопросов..." (70%) хотя вопросы уже готовы и ожидается ввод пользователя.

**Root Cause**: `orchestrator-phase-helpers.ts:247` устанавливает `PROGRESS_MESSAGES.step_0_5_start` перед генерацией. После генерации + перехода в `stage_4_clarifying` (строка 283-296) прогресс-сообщение **не обновляется**.

### Реализация

**1)** Добавить новую константу в `validators.ts:40`:

```typescript
step_0_5_start: 'Генерация уточняющих вопросов...',
step_0_5_waiting: 'Ожидание ответов на уточняющие вопросы',  // NEW
step_0_5_complete: 'Уточняющие вопросы готовы',
```

**2)** В `orchestrator-phase-helpers.ts`, после `supabase.from('courses').update(...)` (строка ~289) и перед `throw new ClarifyingQuestionsInterrupt(...)` (строка ~303), добавить:

```typescript
await updateCourseProgress(
  courseId,
  'stage_4_clarifying',
  PROGRESS_RANGES.step_0_5.end,
  PROGRESS_MESSAGES.step_0_5_waiting,
  supabase
);
```

**Файлы**:

- `packages/course-gen-platform/src/stages/stage4-analysis/utils/validators.ts:40` — новая константа
- `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator-phase-helpers.ts:296-303` — обновить прогресс перед interrupt

---

## План действий

1. **Fix guard** в `initiate.router.ts` — проверка `generation_status` перед инициализацией
2. **Fix прогресс** в `validators.ts` + `orchestrator-phase-helpers.ts` — новая константа + вызов updateCourseProgress
3. **Создать Beads-задачу** для отслеживания
4. **Верификация**:
   - `pnpm --filter course-gen-platform type-check`
   - `pnpm --filter course-gen-platform test`
   - `pnpm build`
   - SQL-проверка дублей FSM после деплоя

## Критичные файлы

| Файл                                    | Изменение                            |
| --------------------------------------- | ------------------------------------ |
| `initiate.router.ts:53`                 | Guard по generation_status           |
| `validators.ts:40`                      | Новая константа `step_0_5_waiting`   |
| `orchestrator-phase-helpers.ts:296-303` | updateCourseProgress перед interrupt |
