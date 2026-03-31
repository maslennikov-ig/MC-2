# Fix: PostgreSQL JSONB null byte rejection in Stage 2 document processing

## Context

Курс **AZQ-2226** ("Обучение по продукту executive MBA") падает на Stage 2 с ошибкой:

```
Failed to store processed document: unsupported Unicode escape sequence
```

**Причина**: Docling MCP извлекает текст из PDF через OCR, и результирующий JSON содержит `\u0000` (null bytes). PostgreSQL JSONB [не поддерживает](https://www.postgresql.org/docs/current/datatype-json.html) `\u0000` и отклоняет INSERT/UPDATE.

**Точка сбоя**: `orchestrator-helpers.ts:167-174` — функция `storeProcessedDocument()` пишет `parsed_content` (JSONB) в таблицу `file_catalog`.

## Plan

### Единственный файл для изменения

`packages/course-gen-platform/src/stages/stage2-document-processing/orchestrator-helpers.ts`

### Шаг 1: Добавить helper `stripNullBytes` (перед `storeProcessedDocument`, ~line 157)

```typescript
/**
 * Strip PostgreSQL-incompatible \u0000 null bytes from JSON data.
 * OCR-extracted documents (via Docling) frequently contain these artifacts.
 */
function stripNullBytes(obj: unknown): unknown {
  return JSON.parse(JSON.stringify(obj).replace(/\\u0000/g, ''));
}
```

Принцип: `JSON.stringify` превращает реальные null bytes в литерал `\u0000`, regex убирает их, `JSON.parse` восстанавливает объект.

### Шаг 2: Применить санитизацию в `storeProcessedDocument()` (lines 167-174)

Было:

```typescript
const { error } = await supabase
  .from('file_catalog')
  .update({
    parsed_content: processingResult.json as unknown as Json,
    markdown_content: processingResult.markdown,
    updated_at: new Date().toISOString(),
  })
  .eq('id', fileId);
```

Станет:

```typescript
const sanitizedJson = stripNullBytes(processingResult.json) as Json;
const sanitizedMarkdown = processingResult.markdown.replace(/\0/g, '');

const { error } = await supabase
  .from('file_catalog')
  .update({
    parsed_content: sanitizedJson,
    markdown_content: sanitizedMarkdown,
    updated_at: new Date().toISOString(),
  })
  .eq('id', fileId);
```

- `parsed_content` (JSONB): round-trip через `JSON.stringify` + regex
- `markdown_content` (text): простой `.replace(/\0/g, '')` — PostgreSQL text тоже не принимает null bytes

### Что НЕ менять

- `docling/client.ts` — сырые данные Docling не трогаем, санитизация на boundary хранения
- Никаких новых файлов или зависимостей
- Не расширяем scope за пределы `\u0000` — только эта последовательность запрещена в PostgreSQL JSONB

## Verification

1. `pnpm type-check && pnpm --filter course-gen-platform build` — сборка проходит
2. Перезапустить обработку курса AZQ-2226 через UI или API — документы должны сохраниться без ошибки
3. Проверить в БД: `SELECT id, parsed_content IS NOT NULL as has_json FROM file_catalog WHERE course_id = '0de49227-3f75-4d97-8aaa-078447d1c2be'` — все 3 файла должны иметь `has_json = true`
