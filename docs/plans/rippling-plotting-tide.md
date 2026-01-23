# План: Пропуск Stage 3 для единственного документа

## Задача

Когда загружен только один документ, пропустить этап приоритизации (Stage 3 Classification) и автоматически присвоить ему приоритет `CORE` (ключевой).

## Контекст

### Текущая логика Stage 3

**Файл**: `packages/course-gen-platform/src/stages/stage3-classification/orchestrator.ts`

1. **0 документов** (строки 96-108): `success: false`, пустые classifications
2. **1+ документов**: Вызов LLM для сравнительной классификации (CORE/IMPORTANT/SUPPLEMENTARY)
3. Результаты сохраняются в `file_catalog.priority` и `file_catalog.summary_metadata`

### Почему пропускаем для 1 документа

- Сравнительная классификация бессмысленна для одного документа
- Экономия токенов LLM и времени обработки
- Единственный документ логически является ключевым (CORE)

## Изменения

### 1. `stage3-classification/orchestrator.ts`

**Добавить проверку после `fileIds.length === 0`** (после строки 108):

```typescript
// После проверки на 0 документов, добавить проверку на 1 документ
if (fileIds.length === 1) {
  logger.info(
    { courseId, fileId: fileIds[0] },
    'Single document detected - auto-assigning CORE priority (skipping LLM classification)'
  );

  if (onProgress) {
    onProgress(50, 'Single document - assigning CORE priority...');
  }

  const result = await this.assignSingleDocumentAsCORE(courseId, fileIds[0], startTime);

  if (onProgress) {
    onProgress(100, 'Classification complete (single document)');
  }

  return result;
}
```

**Добавить приватный метод** `assignSingleDocumentAsCORE()`:

```typescript
/**
 * Auto-assign CORE priority to single document (skip LLM classification)
 *
 * When only one document is uploaded, it's automatically the most important.
 * No need to call LLM for comparative classification.
 */
private async assignSingleDocumentAsCORE(
  courseId: string,
  fileId: string,
  startTime: number
): Promise<Stage3Output> {
  const supabase = getSupabaseAdmin();

  // Load filename for output
  const { data: fileData, error: fileError } = await supabase
    .from('file_catalog')
    .select('filename, summary_metadata')
    .eq('id', fileId)
    .single();

  if (fileError || !fileData) {
    logger.error({ fileId, error: fileError }, 'Failed to load file for single-document CORE assignment');
    throw new Error(`Failed to load file: ${fileError?.message || 'not found'}`);
  }

  // Build classification metadata
  const now = new Date();
  const existingMetadata = (fileData.summary_metadata as Record<string, unknown>) || {};
  const classificationMetadata = {
    ...existingMetadata,
    classification: {
      priority: 'HIGH',
      priority_level: 'CORE',
      importance_score: 1.0, // Max score for single document
      order: 1,
      classification_rationale: 'Auto-assigned CORE: single document in course (LLM classification skipped)',
      classified_at: now.toISOString(),
    },
  };

  // Update file_catalog with CORE priority
  const { error: updateError } = await supabase
    .from('file_catalog')
    .update({
      priority: 'CORE',
      summary_metadata: classificationMetadata,
      updated_at: now.toISOString(),
    })
    .eq('id', fileId);

  if (updateError) {
    logger.error({ fileId, error: updateError }, 'Failed to update file with CORE priority');
    throw new Error(`Failed to update priority: ${updateError.message}`);
  }

  const processingTimeMs = Date.now() - startTime;

  logger.info({
    courseId,
    fileId,
    filename: fileData.filename,
    processingTimeMs,
  }, 'Single document auto-assigned as CORE');

  return {
    success: true,
    courseId,
    classifications: [{
      fileId,
      filename: fileData.filename,
      priority: 'CORE',
      rationale: 'Auto-assigned CORE: single document in course (LLM classification skipped)',
    }],
    totalDocuments: 1,
    coreCount: 1,
    importantCount: 0,
    supplementaryCount: 0,
    processingTimeMs,
  };
}
```

### 2. Добавить логирование и trace

В начале метода `assignSingleDocumentAsCORE` добавить trace для observability:

```typescript
await logTrace({
  courseId,
  stage: 'stage_3',
  phase: 'single_document_skip',
  stepName: 'auto_assign_core',
  inputData: {
    fileId,
    reason: 'single_document_auto_core',
  },
  durationMs: 0,
});
```

## Файлы для изменения

| Файл                                                                            | Изменения                                                                 |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `packages/course-gen-platform/src/stages/stage3-classification/orchestrator.ts` | + проверка `fileIds.length === 1`, + метод `assignSingleDocumentAsCORE()` |

## Верификация

1. **Unit test**: Добавить тест для случая 1 документа
2. **Manual test**:
   - Создать курс с 1 документом
   - Запустить генерацию
   - Проверить что Stage 3 пропущен (в логах)
   - Проверить `file_catalog.priority = 'CORE'`
3. **Type check**: `pnpm type-check`
4. **Build**: `pnpm build`

## Паттерн (по аналогии с существующим кодом)

Используем тот же паттерн что и для 0 документов (строки 96-108) и `skipClassification()` (строки 246-313):

- Early return с успешным результатом
- Логирование решения
- Обновление БД напрямую без LLM
- Возврат Stage3Output с правильными счетчиками
