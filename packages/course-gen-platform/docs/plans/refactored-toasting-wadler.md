# План: Исправление проблемы COMPACT теста (Phase 7 не сохраняет fallback)

## Корневая причина

При ошибке Phase 7 (summarization) в `orchestrator.ts` строки 298-325:

- Ошибка логируется как warning
- НО `processed_content` остаётся `NULL`
- Stage 4 barrier требует `processed_content IS NOT NULL`
- Результат: Stage 4 блокируется

## Проблемные сценарии

| Сценарий             | Код          | Проблема                           |
| -------------------- | ------------ | ---------------------------------- |
| Документ не найден   | line 296-298 | Throws, нет fallback               |
| Нет markdown_content | line 302-305 | `buildEmptyResult()` НЕ пишет в БД |
| LLM/качество ошибка  | line 391-405 | Throws, нет fallback               |

## Предлагаемое исправление

### Изменение 1: orchestrator.ts (основной fix)

В catch блоке (строки 298-325) добавить fallback запись:

```typescript
catch (summarizationError) {
  logger.warn({...}, 'Document summarization failed (non-fatal)');

  // === ДОБАВИТЬ: fallback to markdown_content ===
  const supabase = getSupabaseAdmin();
  const { data: fileData } = await supabase
    .from('file_catalog')
    .select('markdown_content')
    .eq('id', fileId)
    .single();

  if (fileData?.markdown_content) {
    await supabase
      .from('file_catalog')
      .update({
        processed_content: fileData.markdown_content,
        processing_method: 'fallback_error',
        summary_metadata: {
          error: summarizationError instanceof Error
            ? summarizationError.message
            : String(summarizationError),
          fallback_reason: 'summarization_failed',
          quality_score: 0,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', fileId);

    logger.info({ fileId }, 'Stored markdown_content as fallback');
  }
  // === КОНЕЦ ДОБАВЛЕНИЯ ===

  await logTrace({...});
}
```

### Изменение 2: phase-6-summarization.ts (улучшение)

В `buildEmptyResult()` (строка 839) также записывать fallback в БД, а не просто возвращать пустой результат.

## Файлы для изменения

| Файл                                                                    | Изменение                                      |
| ----------------------------------------------------------------------- | ---------------------------------------------- |
| `src/stages/stage2-document-processing/orchestrator.ts`                 | Добавить fallback в catch блок (lines 298-325) |
| `src/stages/stage2-document-processing/phases/phase-6-summarization.ts` | Улучшить `buildEmptyResult()` для записи в БД  |

## Валидация

1. **Unit тест**: Проверить что при ошибке Phase 7 записывается fallback
2. **E2E тест**: Перезапустить COMPACT тест
3. **Проверка БД**: Все документы должны иметь `processed_content IS NOT NULL`

## Критерии успеха

- [ ] Все документы получают `processed_content` (summary или fallback)
- [ ] Stage 4 barrier проходит для automatic mode
- [ ] COMPACT E2E тест достигает Stage 6
