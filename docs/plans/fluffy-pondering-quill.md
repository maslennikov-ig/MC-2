# План: Исправление логирования в Admin Monitor для Stages 1-3

## Проблема

Admin Panel (`AdminPanel.tsx`) показывает пустой список трейсов во время выполнения Stages 1-3. Пользователь ожидает видеть детальный прогресс каждого этапа генерации.

## Корневая причина (обновлено после анализа БД)

### Главная проблема: Stage 2 пропускается!

Когда файлы уже `indexed` (например, через дедупликацию или recovery worker), `lifecycle.router.ts` пропускает Stage 2:

```typescript
// lifecycle.router.ts:344-370
} else if (hasAnyFiles) {
  // Path 2: All files already indexed - skip to Stage 3
  initialState = 'stage_3_init';  // ← Stage 2 пропущен!
}
```

**Данные из БД:**

- `generation_trace`: stage_2 = 105 записей, **stage_3 = 0 записей**
- Для недавних курсов: только Stage 4 записи (Stage 2/3 пропущены)
- `generation_status_history`: `pending → stage_3_init` (Stage 2 обойдён)

Recovery worker обрабатывает документы и устанавливает `vector_status = 'indexed'` **без FSM переходов и без `logTrace()`**.

### Stage 1 (Document Upload)

- **НЕ пишет в `generation_trace` вообще**
- Использует только `logger.info/debug/error` (pino → stdout/error_logs)
- `logTrace()` не вызывается нигде в Stage 1 orchestrator

### Stage 2 (Document Processing) - когда выполняется

- Пишет в `generation_trace` на ключевых этапах:
  - `init/start`, `processing/docling_conversion`, `chunking/hierarchical_chunking`
  - `embedding/generate_embeddings`, `indexing/qdrant_upload`, `summarization/generate_summary`
  - `complete/finish`
- **Достаточно для мониторинга** ✅ (когда выполняется через BullMQ)

### Stage 3 (Classification)

- Пишет в `generation_trace` только в edge cases:
  - `classification_skip` (если feature flag SKIP_STAGE3_CLASSIFICATION=true)
  - `single_document_skip` (если только 1 документ)
- **НЕ логирует при нормальной классификации нескольких документов!**
- Отсутствуют: init, classification process, complete

### Типизация trace-logger

- `stage` тип: `'stage_2' | 'stage_3' | 'stage_4' | 'stage_5' | 'stage_6'`
- **Stage 1 отсутствует в типе!**

## План исправления

### 1. Расширить тип stage в trace-logger.ts

**Файл:** `packages/course-gen-platform/src/shared/trace-logger.ts`

```typescript
// Было:
stage: 'stage_2' | 'stage_3' | 'stage_4' | 'stage_5' | 'stage_6';

// Станет:
stage: 'stage_1' | 'stage_2' | 'stage_3' | 'stage_4' | 'stage_5' | 'stage_6';
```

### 2. Добавить logTrace() в Stage 1 Orchestrator

**Файл:** `packages/course-gen-platform/src/stages/stage1-document-upload/orchestrator.ts`

Добавить вызовы `logTrace()` в метод `execute()`:

```typescript
// После начала execute():
await logTrace({
  courseId: input.courseId,
  stage: 'stage_1',
  phase: 'init',
  stepName: 'start',
  inputData: {
    filename: input.filename,
    fileSize: input.fileSize,
    mimeType: input.mimeType,
  },
  durationMs: 0,
});

// После Phase 1 (Validation):
await logTrace({
  courseId: input.courseId,
  stage: 'stage_1',
  phase: 'validation',
  stepName: 'complete',
  inputData: { filename: input.filename },
  outputData: {
    tier: validationResult.tier,
    courseTitle: validationResult.courseTitle,
  },
  durationMs: validationResult.durationMs,
});

// После Phase 2 (Storage):
await logTrace({
  courseId: input.courseId,
  stage: 'stage_1',
  phase: 'storage',
  stepName: 'complete',
  inputData: { filename: input.filename },
  outputData: {
    fileId: storageResult.fileId,
    storagePath: storageResult.storagePath,
  },
  durationMs: storageResult.durationMs,
});

// В конце (перед return):
await logTrace({
  courseId: input.courseId,
  stage: 'stage_1',
  phase: 'complete',
  stepName: 'finish',
  inputData: { filename: input.filename },
  outputData: { fileId: output.fileId },
  durationMs: totalDuration,
});

// При ошибке (в catch):
await logTrace({
  courseId: input.courseId,
  stage: 'stage_1',
  phase: 'error',
  stepName: 'failed',
  inputData: { filename: input.filename },
  errorData: {
    code: executionError.code,
    message: executionError.message,
  },
  durationMs: Date.now() - startTime,
});
```

### 3. Добавить logTrace() в Stage 3 Orchestrator

**Файл:** `packages/course-gen-platform/src/stages/stage3-classification/orchestrator.ts`

Добавить вызовы `logTrace()` в метод `execute()`:

```typescript
// В начале execute() (после проверки feature flag):
await logTrace({
  courseId,
  stage: 'stage_3',
  phase: 'init',
  stepName: 'start',
  inputData: { organizationId },
  durationMs: 0,
});

// После загрузки документов (Step 1):
await logTrace({
  courseId,
  stage: 'stage_3',
  phase: 'loading',
  stepName: 'documents_loaded',
  inputData: { organizationId },
  outputData: { documentCount: fileIds.length },
  durationMs: Date.now() - startTime,
});

// После классификации (Step 2):
await logTrace({
  courseId,
  stage: 'stage_3',
  phase: 'classification',
  stepName: 'llm_classification_complete',
  inputData: { documentCount: fileIds.length },
  outputData: {
    coreCount,
    importantCount,
    supplementaryCount,
  },
  durationMs: Date.now() - classificationStartTime,
});

// В конце (перед return):
await logTrace({
  courseId,
  stage: 'stage_3',
  phase: 'complete',
  stepName: 'finish',
  inputData: { documentCount: fileIds.length },
  outputData: {
    coreCount,
    importantCount,
    supplementaryCount,
  },
  durationMs: processingTimeMs,
});
```

### 4. **ВАЖНО:** Добавить logTrace() при пропуске Stage 2

**Файл:** `packages/course-gen-platform/src/server/routers/generation/lifecycle.router.ts`

Когда Stage 2 пропускается (Path 2: все файлы уже indexed), добавить трейс для видимости:

```typescript
// После строки 361 (initialState = 'stage_3_init')
// Добавить logTrace для каждого файла чтобы показать что Stage 2 пропущен
for (const file of allFiles) {
  await logTrace({
    courseId,
    stage: 'stage_2',
    phase: 'skip',
    stepName: 'deduplicated',
    inputData: {
      fileId: file.id,
      reason: 'already_indexed',
    },
    durationMs: 0,
  });
}
```

### 5. Добавить logTrace() в recovery worker (опционально)

Если recovery worker обрабатывает документы, он тоже должен писать в `generation_trace`. Это требует отдельного исследования структуры recovery worker.

### 6. Проверить Supabase Realtime Publication

**Проверить:** Миграция `20251126113000_fix_generation_trace_realtime_and_rls.sql` применена.

Эта миграция добавляет:

- `generation_trace` в `supabase_realtime` publication
- RLS политики для authenticated users

Команда для проверки:

```sql
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```

## Критические файлы для изменения

1. `packages/course-gen-platform/src/shared/trace-logger.ts` - добавить 'stage_1' в тип
2. `packages/course-gen-platform/src/stages/stage1-document-upload/orchestrator.ts` - добавить logTrace()
3. `packages/course-gen-platform/src/stages/stage3-classification/orchestrator.ts` - добавить logTrace()
4. `packages/course-gen-platform/src/server/routers/generation/lifecycle.router.ts` - добавить logTrace() при пропуске Stage 2

## Ожидаемый результат

После изменений Admin Monitor покажет:

- **Stage 1**: init → validation → storage → complete (для каждого файла)
- **Stage 2**: либо полный pipeline (docling, chunking, embedding, qdrant), либо `skip/deduplicated`
- **Stage 3**: init → documents_loaded → classification → complete

## Верификация

После внесения изменений:

1. **Запустить type-check:**

   ```bash
   pnpm type-check
   ```

2. **Запустить тесты Stage 1-3:**

   ```bash
   pnpm --filter course-gen-platform test -- --grep "Stage 1|Stage 2|Stage 3"
   ```

3. **Ручная проверка:**
   - Создать тестовый курс
   - Загрузить документ (Stage 1)
   - Открыть Admin Panel (кнопка shield)
   - Убедиться что трейсы Stage 1 появляются в реальном времени
   - Запустить Stage 2-3 и проверить что трейсы появляются

4. **Проверить Realtime в браузере:**
   - Открыть DevTools → Network → WS
   - Найти соединение Supabase Realtime
   - Убедиться что приходят `postgres_changes` события с `generation_trace`

## Оценка рисков

- **Низкий риск**: Добавление логирования не влияет на бизнес-логику
- **Fire-and-forget**: `logTrace()` не блокирует выполнение и не выбрасывает ошибки
- **Backward compatible**: Старые записи в `generation_trace` не затрагиваются
