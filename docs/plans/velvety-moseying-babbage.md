# Plan: Fix Course Generation Progress & Stage 5 Approval UX

## Context

Тестер (JAM-6506) сообщает что "не генерируется структура курса" — видит Этап 5 "Формирование структуры" как зависший с текстом "section 5 complete". На самом деле генерация **завершилась успешно** (10 секций, 50 уроков, quality: 1.0), курс в статусе `stage_5_awaiting_approval` — ждёт одобрения структуры. Но UI не даёт тестеру понять что нужно сделать.

**Курс тестера**: `ba4ec34d` ("Как стать счастливым"), dev-окружение.

## Root Causes Found

### Bug 1 (Critical UX): Progress JSONB не обновляется Stage 5 хэндлером

- **Что**: `generation_progress` показывает `current_step: 4`, `percentage: 53%`, `message: "progress.step_5_complete"` — всё от Stage 4, Stage 5 не обновил прогресс
- **Почему**: `JOB_TYPE_TO_STEP` в `base-handler.ts:70-82` устарел:
  ```
  STRUCTURE_GENERATION → 3  // Должно быть 5 (RPC step 5 = Stage 5)
  STRUCTURE_ANALYSIS → 2     // Должно быть 4 (RPC step 4 = Stage 4)
  DOCUMENT_CLASSIFICATION → 2 // Должно быть 3 (RPC step 3 = Stage 3)
  FINALIZATION → 5            // Должно быть 6 (RPC step 6 = finalizing)
  ```
  RPC был обновлён миграцией `20251126093000` (steps 2-6 → stages 2-5+finalization), но `JOB_TYPE_TO_STEP` не обновили.
- **Эффект**: Stage 5 вызывает RPC с step_id=3, RPC пытается выставить `stage_3_summarizing` — конфликт с FSM, прогресс не обновляется (или перезатирается)

### Bug 2 (UX): Сырые i18n ключи в сообщениях прогресса

- **Что**: Stage 4 orchestrator записывает `progress.step_0_5_start`, `progress.step_5_complete` напрямую в БД
- **Где**: `stage4-analysis/utils/validators.ts:33-50` — `PROGRESS_MESSAGES` object
- **Эффект**: Фронтенд показывает "section 5 complete" (попытка translate, fallback к raw тексту)

### Bug 3 (UX): Неочевидно что нужно одобрить структуру

- **Что**: `MissionControlBanner` с кнопкой Approve показывается вверху графа, но тестер его не видит/не понимает
- **Скриншот**: Stage 5 node жёлтый с "section 5 complete" — нет CTA на самом узле

### Bug 4 (Data): Застрявший курс e5d15807

- Статус `stage_5_generating` >10 часов, generation_metadata = NULL
- Worker умер без обработки ошибки

### Bug 5 (Data): Error metadata не сохраняется при failure

- ВСЕ failed курсы имеют `generation_metadata = NULL`
- `markCourseAsFailed()` в `handler-db-helpers.ts:380-414` не записывает metadata

---

## Implementation Plan

### Fix 1: Обновить JOB_TYPE_TO_STEP маппинг (Critical)

**File**: `packages/course-gen-platform/src/orchestrator/handlers/base-handler.ts:70-82`

```typescript
const JOB_TYPE_TO_STEP: Record<JobType, number | null> = {
  [JobType.TEST_JOB]: null,
  [JobType.DOCUMENT_PROCESSING]: 2, // Stage 2 → RPC step 2 ✅ (без изменений)
  [JobType.SUMMARY_GENERATION]: 2, // Fallback ✅ (без изменений)
  [JobType.DOCUMENT_CLASSIFICATION]: 3, // Stage 3 → RPC step 3 (было 2)
  [JobType.STRUCTURE_ANALYSIS]: 4, // Stage 4 → RPC step 4 (было 2)
  [JobType.STRUCTURE_GENERATION]: 5, // Stage 5 → RPC step 5 (было 3)
  [JobType.TEXT_GENERATION]: null, // Stage 6 нет в RPC (было 4)
  [JobType.LESSON_CONTENT]: null, // Stage 6 нет в RPC (было 4)
  [JobType.ENRICHMENT_GENERATION]: null, // ✅ (без изменений)
  [JobType.BLOCK_REGENERATION]: null, // ✅ (без изменений)
  [JobType.FINALIZATION]: 6, // Finalization → RPC step 6 (было 5)
};
```

**Note**: Stage 6 (LESSON_CONTENT/TEXT_GENERATION) нет в RPC `update_course_progress` — они обновляют прогресс через свои собственные механизмы (lesson-level tracking). Поэтому → null.

Также обновить JSDoc комментарий `@param stepId` с "2-5" на "2-6" (line 554).

### Fix 2: Исправить сообщения прогресса Stage 4 (High)

**File**: `packages/course-gen-platform/src/stages/stage4-analysis/utils/validators.ts:80-117`

Текущий `updateCourseProgress()` передаёт сырые i18n ключи. Нужно передавать человекочитаемые сообщения.

**Вариант**: Заменить `PROGRESS_MESSAGES` значения на русский текст (как в base-handler, который использует `getCachedTranslator`):

```typescript
export const PROGRESS_MESSAGES = {
  step_0_start: 'Начало валидации данных...',
  step_0_complete: 'Валидация данных завершена',
  step_1_start: 'Базовая классификация...',
  step_1_complete: 'Классификация завершена',
  step_0_5_start: 'Генерация уточняющих вопросов...',
  step_0_5_complete: 'Уточняющие вопросы готовы',
  step_2_start: 'Глубокий анализ материалов...',
  step_2_complete: 'Анализ материалов завершён',
  step_3_start: 'Синтез документов...',
  step_3_complete: 'Синтез завершён',
  step_4_start: 'Финальная сборка результатов...',
  step_4_complete: 'Анализ завершён',
  step_6_start: 'Подготовка бюджета...',
  step_6_complete: 'Бюджет подготовлен',
  step_5_start: 'Итоговая валидация...',
  step_5_complete: 'Анализ задачи завершён',
} as const;
```

### Fix 3: Исправить отображение Stage 5 awaiting_approval на фронтенде (High)

**Problem**: Узел Stage 5 показывает raw message "section 5 complete" вместо "Ожидает подтверждения".

**Approach**: Добавить перевод для `progress.step_5_complete` в фронтенд i18n файлы, ИЛИ (лучше) — после Fix 2 это сообщение будет "Анализ задачи завершён" вместо raw ключа. Но это для Stage 4.

Для Stage 5 нужно убедиться что при переходе в `stage_5_awaiting_approval` прогресс обновляется с правильным сообщением. Проверить что `base-handler.ts` вызывает `updateCourseProgress(step=5, 'completed')` при завершении Stage 5, что через RPC выставит:

- `steps[4].status = 'completed'`
- `message = t('steps.5.completed')` = "Структура курса определена"
- `percentage = 5 * 20 = 100`

Также добавить i18n-ключи для fallback на фронтенде:

**File**: `packages/web/messages/ru/generation.json` — добавить ключи:

```json
"progress": {
  "step_0_start": "Начало валидации...",
  "step_0_complete": "Валидация завершена",
  "step_0_5_start": "Уточняющие вопросы...",
  "step_0_5_complete": "Вопросы готовы",
  "step_1_start": "Классификация...",
  "step_1_complete": "Классификация завершена",
  "step_2_start": "Глубокий анализ...",
  "step_2_complete": "Анализ завершён",
  "step_3_start": "Синтез документов...",
  "step_3_complete": "Синтез завершён",
  "step_4_start": "Финальная сборка...",
  "step_4_complete": "Анализ задачи завершён",
  "step_5_start": "Итоговая валидация...",
  "step_5_complete": "Анализ задачи завершён",
  "step_6_start": "Подготовка бюджета...",
  "step_6_complete": "Бюджет готов"
}
```

**File**: `packages/web/messages/en/generation.json` — аналогичные английские переводы.

### Fix 4: Очистить застрявший курс e5d15807 (Quick fix)

```sql
UPDATE courses
SET generation_status = 'failed',
    error_code = 'UNKNOWN',
    failed_at_stage = 5,
    updated_at = NOW()
WHERE id = 'e5d15807-dca3-414a-b42b-7ba27511c09f'
AND generation_status = 'stage_5_generating';
```

### Fix 5: Сохранять error metadata при failure (Medium)

**File**: `packages/course-gen-platform/src/stages/stage5-generation/handler-db-helpers.ts`

В функции `markCourseAsFailed()` добавить запись базовой metadata:

```typescript
export async function markCourseAsFailed(
  courseId: string,
  errorCode: GenerationErrorCode,
  jobLogger: pino.Logger,
  errorDetails?: { message?: string; phase?: string; duration_ms?: number }
): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  const errorMetadata = {
    error_code: errorCode,
    failed_at: new Date().toISOString(),
    failed_phase: errorDetails?.phase ?? 'unknown',
    error_message: errorDetails?.message ?? errorCode,
    duration_ms: errorDetails?.duration_ms ?? 0,
  };

  await supabaseAdmin
    .from('courses')
    .update({
      generation_status: 'failed',
      failed_at_stage: 5,
      error_code: errorCode,
      generation_metadata: errorMetadata, // NEW
      updated_at: new Date().toISOString(),
    })
    .eq('id', courseId);
}
```

Обновить все вызовы `markCourseAsFailed()` в `handler.ts` чтобы передавать `errorDetails`.

---

## Files to Modify

| File                                                                              | Change                                                                | Priority |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------- |
| `packages/course-gen-platform/src/orchestrator/handlers/base-handler.ts`          | Fix JOB_TYPE_TO_STEP (lines 70-82)                                    | Critical |
| `packages/course-gen-platform/src/stages/stage4-analysis/utils/validators.ts`     | Replace i18n keys with actual text in PROGRESS_MESSAGES (lines 33-50) | High     |
| `packages/web/messages/ru/generation.json`                                        | Add progress.\* translation keys                                      | High     |
| `packages/web/messages/en/generation.json`                                        | Add progress.\* translation keys                                      | High     |
| `packages/course-gen-platform/src/stages/stage5-generation/handler-db-helpers.ts` | Add generation_metadata on failure                                    | Medium   |
| `packages/course-gen-platform/src/stages/stage5-generation/handler.ts`            | Pass error details to markCourseAsFailed                              | Medium   |

## Verification

1. **Type-check**: `pnpm type-check` — должен пройти
2. **Build**: `pnpm build` — должен пройти
3. **DB fix**: Выполнить SQL для очистки e5d15807
4. **Manual test**: Создать новый курс, пройти через Stages 2-5, проверить что:
   - Прогресс обновляется корректно на каждом этапе
   - Сообщения на русском (не raw i18n ключи)
   - При Stage 5 completion видно кнопку "Подтвердить структуру"
   - Percentage отражает реальный прогресс
5. **DB verify**: `SELECT generation_status, generation_progress->'current_step', generation_progress->'message' FROM courses WHERE id = '<new-course>'` — проверить что current_step и message корректны
