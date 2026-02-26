# Plan: Phase 3 — Redis Cache (Консервативный вариант)

## Context

Phase 1+2 выполнены: DB 391→153 MB, egress оптимизирован. Phase 3 добавляет Redis cache-aside на стороне **записи** для ускорения последующих стейджей. **Read paths НЕ трогаем** — если Redis пуст, всё работает как раньше через Supabase.

## Scope (Консервативный)

- **Write-side only**: Stage 2 кэширует `markdown_content` и `processed_content` в Redis при записи в file_catalog
- **Stage 6+7 lesson markdown**: Stage 6 кэширует markdown в Redis, Stage 7 пробует Redis первым (fallback на metadata как раньше)
- **markdownContent остаётся в metadata** (backward compat, убрать позже)
- **Stage 3, Stage 4 НЕ трогаем** — читают из Supabase как раньше. Redis-оптимизацию чтения добавим позже.

---

## Task A: Создать file-content-cache.ts + обновить cleanup

**Тип**: делаю сам
**Файлы**:

- `packages/course-gen-platform/src/shared/cache/file-content-cache.ts` — **NEW**
- `packages/course-gen-platform/src/shared/cleanup/redis-cleanup.ts` — add 2 patterns (line 76-80)

### API модуля:

```typescript
// Write (fire-and-forget, never throw)
cacheFileMarkdown(courseId, fileId, content): Promise<void>
cacheFileProcessedContent(courseId, fileId, content): Promise<void>
cacheLessonMarkdown(courseId, lessonId, content): Promise<void>

// Read (return null on miss/error)
getCachedFileMarkdown(courseId, fileId): Promise<string | null>
getCachedLessonMarkdown(courseId, lessonId): Promise<string | null>
```

Redis keys: `file_cache:{courseId}:{fileId}:markdown`, `file_cache:{courseId}:{fileId}:processed`, `lesson_md:{courseId}:{lessonId}`. TTL = 4h.

Используем raw `getRedisClient()` с `setex`/`get` (строки, не JSON) — данные уже строки.

### Cleanup

Добавить в `cleanupRedisForCourse()` (line 76-80):

```
`file_cache:${courseId}:*`
`lesson_md:${courseId}:*`
```

---

## Task B: Stage 2 — кэшировать file_catalog при записи

**Тип**: subagent
**Файлы** (все в `packages/course-gen-platform/src/stages/stage2-document-processing/`):

### B1. `orchestrator-helpers.ts` — `storeProcessedDocument()` (line 159)

- Добавить `courseId: string` как 3-й параметр
- After successful Supabase UPDATE (line 172): `void cacheFileMarkdown(courseId, fileId, processingResult.markdown)`
- Import: `import { cacheFileMarkdown } from '../../shared/cache/file-content-cache'`

### B2. `orchestrator.ts` (line 79) — caller

- `storeProcessedDocument(fileId, processingResult)` → `storeProcessedDocument(fileId, processingResult, context.courseId)`
- `context.courseId` доступен (line 60)

### B3. `phases/phase-6-summarization-helpers.ts` — `storeSummary()` (line 378) + `storeFullText()` (line 462)

- `storeSummary()`: Добавить `courseId: string` как 1-й параметр. After Supabase UPDATE (line 420): `void cacheFileProcessedContent(courseId, fileId, summary)`
- `storeFullText()`: Аналогично. After UPDATE (line 495): `void cacheFileProcessedContent(courseId, fileId, fullText)`
- Import: `import { cacheFileProcessedContent } from '../../shared/cache/file-content-cache'`

### B4. `phases/phase-6-summarization.ts` — 5 callers

- Line 252: `storeFullText(` → `storeFullText(courseId, `
- Line 382: `storeFullText(` → `storeFullText(courseId, `
- Line 459: `storeSummary(` → `storeSummary(courseId, `
- Line 512: `storeSummary(` → `storeSummary(courseId, `
- Line 549: `storeFullText(` → `storeFullText(courseId, `
- `courseId` доступен через параметры всех функций (thread from `executePhase6Summarization()` line 143)

---

## Task C: Stage 6 — кэшировать lesson markdown в Redis

**Тип**: subagent
**Файл**: `packages/course-gen-platform/src/stages/stage6-lesson-content/services/database-service.ts`

### C1. `saveLessonContent()` (line 221)

- **Line 263** (`markdownContent: extractContentMarkdown(...)`) — **ОСТАВИТЬ** в metadata (backward compat)
- **Before insert**: extract markdown в переменную: `const markdown = extractContentMarkdown(result.lessonContent, language)`
- **Use in metadata**: `markdownContent: markdown` (вместо inline call)
- **After successful insert**: `void cacheLessonMarkdown(courseId, lessonUuid, markdown)`
- Import: `import { cacheLessonMarkdown } from '../../../shared/cache/file-content-cache'`

### C2. `handlePartialSuccess()` (line 29)

- **Line 53** — аналогично: extract → cache → keep in metadata

---

## Task D: Stage 7 — читать markdown из Redis первым

**Тип**: subagent
**Файлы** (все в `packages/course-gen-platform/src/stages/stage7-enrichments/`):

### D1. `services/database-service.ts` — `getLessonContent()` (line 606)

- Добавить `courseId?: string` как 2-й опциональный параметр
- Before Supabase query: `if (courseId) { const cached = await getCachedLessonMarkdown(courseId, lessonId); if (cached) return cached; }`
- Existing logic (metadata.markdownContent → JSON.stringify) остаётся как fallback
- Import: `import { getCachedLessonMarkdown } from '../../../shared/cache/file-content-cache'`

### D2. Stage 7 handlers — 11 call sites

Все вызовы `getLessonContent(lesson.id)` → `getLessonContent(lesson.id, enrichmentContext.course.id)`

| Файл                                | Строка   |
| ----------------------------------- | -------- |
| `handlers/card-handler.ts`          | 128      |
| `handlers/audio-handler.ts`         | 156      |
| `handlers/quiz-handler.ts`          | 159      |
| `handlers/video-handler.ts`         | 166      |
| `handlers/nlm-audio-handler.ts`     | 185, 248 |
| `handlers/presentation-handler.ts`  | 206, 377 |
| `handlers/nlm-video-handler.ts`     | 243      |
| `handlers/cover-handler-helpers.ts` | 206      |

Все handlers имеют `enrichmentContext.course.id` доступным рядом с вызовом.

---

## Порядок выполнения

```
1. Task A (я сам)    → file-content-cache.ts + cleanup
2. Task B (agent)    → Stage 2 write caching         ─┐ параллельно
   Task C (agent)    → Stage 6 lesson markdown cache  ─┘
   Task D (agent)    → Stage 7 Redis read
3. Verify            → pnpm type-check && pnpm build
4. Commit + push
```

Task B и C можно параллельно (разные stage dirs). Task D зависит от Task A (cache module).

---

## Верификация

1. `pnpm type-check && pnpm build` — компиляция
2. `redis-cli KEYS "file_cache:*"` во время генерации — ключи появляются
3. `redis-cli KEYS "lesson_md:*"` после Stage 6 — lesson markdown закэширован
4. Stage 7 enrichments работают (quiz/audio/video)
5. Старые lesson_contents (с markdownContent в metadata) читаются корректно

---

## Что НЕ входит в scope

- Stage 3/4 read-side optimization (позже, после стабилизации кэша)
- Удаление markdownContent из metadata (позже, когда убедимся в стабильности Redis)
- Batch Redis operations (mget) — не нужны в write-only подходе
