# Plan: Phase 3b — Redis Read-Side Cache для Stage 3/4

## Context

Phase 3 (write-side caching) выполнена: Stage 2 записывает `markdown_content` и `processed_content` в Redis при обработке файлов. Кэш **уже прогрет** к моменту запуска Stage 3/4, но Stage 3/4 всё ещё читают контент из Supabase — это **70-80% egress** пайплайна.

**Цель**: Подключить Redis read-side в Stage 3/4, чтобы при тёплом кэше контент файлов не загружался из Supabase.

**Гарантия безопасности**: Redis miss → Supabase fallback. Если Redis пуст, поведение идентично текущему.

---

## Оценка эффекта на Supabase egress

| Stage                    | Что читает                                             | Payload per course    | С Redis cache      |
| ------------------------ | ------------------------------------------------------ | --------------------- | ------------------ |
| Stage 3 (classification) | `processed_content` + `markdown_content` per file      | **10-50 MB**          | ~0 (metadata only) |
| Stage 4 (budget)         | `processed_content` all + `markdown_content` full_text | **5-20 MB**           | ~0 (metadata only) |
| Stage 7 (enrichments)    | `lesson_contents`                                      | ~5-10 MB              | ~0 (уже сделано)   |
| **Итого**                |                                                        | **20-80 MB / course** | **~0 MB / course** |

---

## Task E: Добавить `getCachedFileProcessedContent()` в cache module

**Файл**: `packages/course-gen-platform/src/shared/cache/file-content-cache.ts`

Добавить read-функцию для `processed_content` (write уже есть — `cacheFileProcessedContent`):

```typescript
export async function getCachedFileProcessedContent(
  courseId: string,
  fileId: string
): Promise<string | null> {
  try {
    const redis = getRedisClient();
    return await redis.get(fileProcessedKey(courseId, fileId));
  } catch (error) {
    logger.debug(
      { courseId, fileId, error: error instanceof Error ? error.message : String(error) },
      '[FileContentCache] Failed to read cached file processed content (non-fatal)'
    );
    return null;
  }
}
```

---

## Task F: Stage 3 — Redis cache-aside в `fetchFileMetadata()`

**Файл**: `packages/course-gen-platform/src/stages/stage3-classification/phases/phase-classification.ts`

### F1. `fetchFileMetadata()` (line 544)

Добавить `courseId: string` как 3-й параметр. Перед Supabase query — попытаться получить контент из Redis:

```typescript
async function fetchFileMetadata(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  fileIds: string[],
  courseId: string
): Promise<FileMetadata[]> {
  // Step 1: Try Redis for content (processed_content preferred, fallback to markdown)
  const contentMap = new Map<string, string>();
  await Promise.all(
    fileIds.map(async fid => {
      const cached =
        (await getCachedFileProcessedContent(courseId, fid)) ||
        (await getCachedFileMarkdown(courseId, fid));
      if (cached) contentMap.set(fid, cached);
    })
  );

  const allCached = contentMap.size === fileIds.length;

  // Step 2: Query Supabase — skip content fields when ALL files cached
  const { data, error } = await supabase
    .from('file_catalog')
    .select(
      allCached
        ? 'id, filename, generated_title, original_name, mime_type, file_size, summary_metadata'
        : 'id, filename, generated_title, original_name, mime_type, file_size, processed_content, markdown_content, summary_metadata'
    )
    .in('id', fileIds);

  // ... error handling as before ...

  return data.map(file => {
    // Use cached content if available, else Supabase content
    const content =
      contentMap.get(file.id) || file.processed_content || file.markdown_content || '';
    // ... rest of transform unchanged ...
  });
}
```

**Логика**:

- Тёплый кэш (95% случаев): 1 light Supabase query (metadata only, ~1KB/file) + Redis reads. **Экономия: 10-50 MB egress.**
- Холодный кэш: Полный Supabase query как раньше + нулевой overhead от Redis misses.
- Частичный кэш: Полный query (безопасный fallback), но cached content используется для hit-файлов.

### F2. Callers — передать `courseId`

| Место вызова                         | Строка | `courseId` доступен?  |
| ------------------------------------ | ------ | --------------------- |
| `executeComparativeClassification()` | 239    | Да — параметр функции |
| `executeDocumentClassification()`    | 447    | Да — параметр функции |

Оба вызова: `fetchFileMetadata(supabase, fileIds)` → `fetchFileMetadata(supabase, fileIds, courseId)`

Import: `import { getCachedFileProcessedContent, getCachedFileMarkdown } from '../../../shared/cache/file-content-cache';`

---

## Task G: Stage 4 — Redis cache-aside в `fetchDocumentSummaries()` и `fetchFullTextDocuments()`

**Файл**: `packages/course-gen-platform/src/stages/stage4-analysis/handler-helpers.ts`

### G1. `fetchDocumentSummaries()` (line 330)

Разделить на два шага: metadata query (light) + content from Redis with Supabase fallback:

```typescript
async function fetchDocumentSummaries(courseId: string): Promise<DocumentSummaryResult[]> {
  const supabase = getSupabaseAdmin();

  // Step 1: Light metadata query (no processed_content)
  const { data: documents } = await supabase
    .from('file_catalog')
    .select('id, original_name, filename, summary_metadata, priority')
    .eq('course_id', courseId)
    .eq('vector_status', 'indexed')
    .not('processed_content', 'is', null);

  if (!documents || documents.length === 0) return [];

  // Step 2: Get processed_content from Redis
  const contentMap = new Map<string, string>();
  await Promise.all(
    documents.map(async doc => {
      const cached = await getCachedFileProcessedContent(courseId, doc.id);
      if (cached) contentMap.set(doc.id, cached);
    })
  );

  // Step 3: For cache misses, batch-fetch content from Supabase
  const missedIds = documents.filter(d => !contentMap.has(d.id)).map(d => d.id);
  if (missedIds.length > 0) {
    const { data: contentData } = await supabase
      .from('file_catalog')
      .select('id, processed_content')
      .in('id', missedIds);
    for (const d of contentData || []) {
      if (d.processed_content) contentMap.set(d.id, d.processed_content);
    }
  }

  // Step 4: Build results using contentMap
  return documents.map(doc => {
    const processedContent = contentMap.get(doc.id) || '';
    // ... rest of transform uses processedContent instead of doc.processed_content
  });
}
```

**Логика**: Тёплый кэш = 1 light query. Холодный = 2 queries (same total data). Штраф: ~5ms round trip.

### G2. `fetchFullTextDocuments()` (line 362)

Добавить `courseId: string` как 2-й параметр. Redis first, Supabase for misses:

```typescript
async function fetchFullTextDocuments(
  documentIds: string[],
  courseId: string
): Promise<Map<string, string>> {
  if (documentIds.length === 0) return new Map();

  // Try Redis first
  const map = new Map<string, string>();
  await Promise.all(
    documentIds.map(async id => {
      const cached = await getCachedFileMarkdown(courseId, id);
      if (cached) map.set(id, cached);
    })
  );

  // Fetch remaining from Supabase
  const missedIds = documentIds.filter(id => !map.has(id));
  if (missedIds.length > 0) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('file_catalog')
      .select('id, markdown_content')
      .in('id', missedIds)
      .not('markdown_content', 'is', null);
    for (const doc of data || []) {
      if (doc.markdown_content) map.set(doc.id, doc.markdown_content);
    }
  }

  return map;
}
```

### G3. `resolveDocumentContent()` (line 387) — caller

Добавить `courseId: string` как 3-й параметр, передать в `fetchFullTextDocuments`:

```typescript
export async function resolveDocumentContent(
  allocation: Stage4BudgetAllocation,
  documents: DocumentSummaryResult[],
  courseId: string
): Promise<DocumentSummaryResult[]> {
  // ...
  const fullTextMap = await fetchFullTextDocuments(fullTextIds, courseId);
  // ... rest unchanged
}
```

### G4. Caller в `orchestrator-helpers.ts` (line 216)

```typescript
resolvedDocumentSummaries = await resolveDocumentContent(
  budgetAllocation,
  originalDocumentSummaries,
  courseId // ← добавить (courseId доступен на line 195)
);
```

Import: `import { getCachedFileProcessedContent, getCachedFileMarkdown } from '../../shared/cache/file-content-cache';`

---

## Порядок выполнения

```
1. Task E (сам)     → getCachedFileProcessedContent в cache module
2. Task F (agent)   → Stage 3 read-side cache    ─┐ параллельно
   Task G (agent)   → Stage 4 read-side cache    ─┘
3. Verify           → pnpm type-check && pnpm build
4. Commit + push
```

---

## Верификация

1. `pnpm type-check && pnpm build` — компиляция
2. Запустить генерацию курса → проверить в логах:
   - Stage 3: `Loaded file for classification` — contentLength > 0 (контент получен из Redis)
   - Stage 4: docs processed (content из Redis, metadata из Supabase)
3. `redis-cli DBSIZE` до и после — ключи `file_cache:*` уже должны существовать (прогреты Stage 2)
4. Ретест: остановить Redis → генерация всё равно работает (Supabase fallback)

---

## Что НЕ входит в scope

- `mget` batch operations (per-file `get` достаточно для 20-100 файлов, ~1-5ms total)
- Stage 5/6 file_catalog reads (не найдены в коде — используют data от предыдущих stages)
- Удаление `markdownContent` из lesson_contents metadata (backward compat)
