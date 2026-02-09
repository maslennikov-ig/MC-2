# Backend Performance: p-limit, JOINs, LLM Cache

**Bead**: mc2-zxuy
**Source**: AUDIT_REPORT.md Section 11.1

## Context

Pipeline генерации курсов и API endpoints имеют три категории performance-проблем:

1. **LLM Cache** — LLM-вызовы для классификации (intent, document) не кэшируются, хотя они детерминированные и повторяются
2. **Query Consolidation** — API endpoints делают 2-5 последовательных Supabase-запросов вместо одного с JOINs/relational select
3. **p-limit retry** — retry failed секций в Stage 5 идёт последовательно вместо параллельно

## Part 1: LLM Classification Cache (~2ч)

### 1.1 Intent Classification Cache

**Файл**: `packages/course-gen-platform/src/shared/intent/classifier.ts`

**Проблема**: Каждый вызов `classifyIntent()` (строка 151) делает LLM-запрос через OpenRouter, даже если тот же userMessage+context уже классифицировался. temperature=0.1 — детерминированный результат.

**Решение**: Обернуть в Redis-кэш с коротким TTL.

**Изменения**:

```typescript
// В начале файла — импорт
import { cache as redisCache } from '../cache/redis';
import { createHash } from 'crypto';

// Константы
const INTENT_CACHE_TTL = 3600; // 1 час
const INTENT_CACHE_PREFIX = 'intent_class';
const INTENT_CACHE_VERSION = 'v1'; // bump при изменении промпта/модели

// Хелпер для генерации cache key
function buildIntentCacheKey(
  userMessage: string,
  nodeContext?: NodeContextForClassification
): string {
  const payload = JSON.stringify({
    msg: userMessage,
    ctx: nodeContext?.stageId || '',
    et: nodeContext?.elementType || '',
  });
  const hash = createHash('sha256').update(payload).digest('hex').slice(0, 16);
  return `${INTENT_CACHE_PREFIX}:${INTENT_CACHE_VERSION}:${hash}`;
}
```

В функции `classifyIntent()` — добавить cache lookup перед LLM вызовом и cache set после:

```typescript
export async function classifyIntent(...): Promise<ClassifiedIntent> {
  // 1. Проверить кэш
  const cacheKey = buildIntentCacheKey(userMessage, nodeContext);
  const cached = await redisCache.get<ClassifiedIntent>(cacheKey);
  if (cached) {
    logger.debug({ cacheKey, intent: cached.intent }, 'Intent classification cache hit');
    return cached;
  }

  // 2. LLM вызов (существующий код)
  // ...

  // 3. Сохранить в кэш
  if (validated.intent !== 'UNKNOWN') {
    await redisCache.set(cacheKey, validated, { ttl: INTENT_CACHE_TTL });
  }

  return validated;
}
```

**Ключевые решения**:

- TTL = 1 час (достаточно для одной сессии редактирования)
- Не кэшируем UNKNOWN (низкая confidence, нет смысла)
- Version в ключе — при изменении промпта просто бампаем `INTENT_CACHE_VERSION`
- SHA256 hash от payload — уникальность гарантирована

### 1.2 Document Classification Cache (Stage 3)

**Файл**: `packages/course-gen-platform/src/stages/stage3-classification/phases/phase-classification.ts`

**Проблема**: При re-run генерации курса с теми же документами, `classifyDocument()` (строка 542) и `classifyDocumentsComparatively()` (строка 587) делают LLM-вызовы заново. Документы не меняются между запусками.

**Решение**: Кэшировать результат comparative classification по courseId + hash(fileIds + courseContext).

**Изменения** в `executeDocumentClassificationComparative()`:

```typescript
import { cache as redisCache } from '../../../shared/cache/redis';
import { createHash } from 'crypto';

const DOC_CLASS_CACHE_TTL = 86400 * 7; // 7 дней
const DOC_CLASS_CACHE_PREFIX = 'doc_class';
const DOC_CLASS_CACHE_VERSION = 'v1';

function buildDocClassCacheKey(
  courseId: string,
  fileIds: string[],
  courseContext: { title: string; description: string }
): string {
  const payload = JSON.stringify({
    fids: [...fileIds].sort(), // sort для стабильности
    title: courseContext.title,
    desc: courseContext.description,
  });
  const hash = createHash('sha256').update(payload).digest('hex').slice(0, 16);
  return `${DOC_CLASS_CACHE_PREFIX}:${DOC_CLASS_CACHE_VERSION}:${courseId}:${hash}`;
}
```

В `executeDocumentClassificationComparative()` — cache lookup после fetchCourseContext, cache set после успешной классификации (перед `storeClassificationResults`).

**Ключевые решения**:

- TTL = 7 дней (документы не меняются)
- Кэш key включает courseId + sorted fileIds + courseContext — при изменении файлов или контекста кэш инвалидируется автоматически
- Кэшируем `DocumentPriority[]` (финальный результат), а не промежуточный LLM response

### 1.3 Добавить cleanup-ключи

**Файл**: `packages/course-gen-platform/src/shared/cleanup/redis-cleanup.ts`

Добавить паттерны для новых кэш-ключей в cleanup при удалении курса:

- `doc_class:*:${courseId}:*`

---

## Part 2: Query Consolidation (~4ч)

### 2.1 Organizations GET — member count (CRITICAL)

**Файл**: `packages/web/app/api/organizations/route.ts` (строки 56-122)

**Проблема**: 2 запроса — сначала memberships с relational select, потом отдельный запрос для подсчёта участников с клиентской агрегацией через Map.

**Решение**: Использовать Supabase `count: 'exact'` с группировкой или один дополнительный RPC-запрос.

**Подход**: Заменить второй запрос (строки 97-122) на relational select с count. Supabase PostgREST не поддерживает GROUP BY напрямую, поэтому лучший подход — вложенный select с `count`:

```typescript
// Вместо второго запроса — для каждой org получить count через relational select
const { data: memberships } = await supabase
  .from('organization_members')
  .select(
    `
    role,
    organization_id,
    organizations (
      id, name, slug, tier, settings, created_at, updated_at,
      organization_members ( id )
    )
  `
  )
  .eq('user_id', user.id);
```

Затем `memberCount = m.organizations.organization_members.length`.

Это один запрос вместо двух — PostgREST делает JOIN на сервере.

### 2.2 Courses Paginated — duplicate section query (HIGH)

**Файл**: `packages/web/app/api/courses/paginated/route.ts` (строки 139-237)

**Проблема**:

1. Запрос sections делается ДВАЖДЫ (строки 148-152 и 159-162) — полный дубликат
2. O(n^2) client-side `.find()` для каждого lesson (строка 174)
3. В курсе уже есть `total_lessons_count` и `total_sections_count` (строки 98-99) — можно использовать их!

**Решение**: Использовать поля `total_lessons_count` и `total_sections_count`, которые уже есть в таблице courses и уже выбираются в запросе.

```typescript
// Убрать строки 139-237 (все дополнительные запросы)
// Заменить на:
coursesWithCounts = courses.map(
  (course: Course): CourseWithCounts => ({
    ...course,
    sections_count: course.total_sections_count || 0,
    lessons_count: course.total_lessons_count || 0,
    is_owner: user ? course.user_id === user.id : false,
  })
);
```

**Экономия**: 3 запроса → 0 дополнительных. Самое простое и эффективное исправление.

### 2.3 Invitations [token] GET — relational select (MEDIUM)

**Файл**: `packages/web/app/api/invitations/[token]/route.ts` (строки 31-91)

**Проблема**: 2 запроса — invitation + organization отдельно.

**Решение**: Использовать relational select:

```typescript
const { data: invitation } = await adminClient
  .from('organization_invitations')
  .select(
    `
    *,
    organizations:organization_id (id, name, slug)
  `
  )
  .eq('token', token)
  .single();
```

Один запрос вместо двух. Удалить второй запрос (строки 87-91).

### 2.4 Organizations [orgId] Invitations GET — creator join (MEDIUM)

**Файл**: `packages/web/app/api/organizations/[orgId]/invitations/route.ts` (строки 142-186)

**Проблема**: 2 запроса — invitations + creators отдельно.

**Решение**: Relational select:

```typescript
const { data: invitations, count } = await adminClient
  .from('organization_invitations')
  .select(
    `
    *,
    creator:created_by (id, email, full_name)
  `,
    { count: 'exact' }
  )
  .eq('organization_id', orgId)
  .order('created_at', { ascending: false })
  .range(offset, offset + pageSize - 1);
```

Удалить второй запрос (строки 172-186) и `creatorsMap`.

---

## Part 3: p-limit Retry Parallelization (~1ч)

### 3.1 Параллелизация retry в Stage 5

**Файл**: `packages/course-gen-platform/src/stages/stage5-generation/phases/generation-phases.ts` (строки 738-847)

**Проблема**: `retryFailedSections()` ретраит секции последовательно в `for...of` цикле (строка 763). При 3 failed секциях с 3 retry attempts: 3×(2s+4s+8s) = 42s последовательно.

**Решение**: Использовать уже импортированный `pLimit` для параллельного retry с ограничением конкурентности.

**Изменения**:

```typescript
private async retryFailedSections(
  failedResults: Array<{ index: number; error: string }>,
  input: GenerationJobInput,
  qdrantClient: QdrantClient | undefined,
  maxRetries: number
): Promise<{ successes: ...; failures: ... }> {
  // ...existing validation...

  // Параллельный retry с p-limit (max 2 concurrent, чтобы не усилить rate limiting)
  const retryLimit = pLimit(Math.min(PARALLEL_CONFIG.MAX_CONCURRENT_SECTIONS, 2));

  const retryPromises = failedResults.map(failed =>
    retryLimit(() => this.retrySingleSection(failed, input, qdrantClient, maxRetries))
  );

  const results = await Promise.allSettled(retryPromises);

  // Собрать results в successes/failures
  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (result.value.success) {
        successes.push(result.value.data);
      } else {
        failures.push(result.value.data);
      }
    }
  }

  return { successes, failures };
}

// Извлечь retry логику одной секции в отдельный метод
private async retrySingleSection(
  failed: { index: number; error: string },
  input: GenerationJobInput,
  qdrantClient: QdrantClient | undefined,
  maxRetries: number
): Promise<{ success: boolean; data: any }> {
  // Существующая логика retry одной секции (строки 763-834)
  // с exponential backoff и logging
}
```

**Ключевые решения**:

- `pLimit(2)` вместо `pLimit(4)` — при retry мы уже знаем, что были проблемы (rate limits), поэтому ограничиваем конкурентность сильнее
- Извлечение `retrySingleSection()` — чистый рефакторинг, логика не меняется

---

## Файлы для изменения

| Файл                                                                                           | Изменение                                  | Часть    |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------ | -------- |
| `packages/course-gen-platform/src/shared/intent/classifier.ts`                                 | Redis cache wrapper                        | Part 1.1 |
| `packages/course-gen-platform/src/stages/stage3-classification/phases/phase-classification.ts` | Redis cache для comparative classification | Part 1.2 |
| `packages/course-gen-platform/src/shared/cleanup/redis-cleanup.ts`                             | Новые cleanup patterns                     | Part 1.3 |
| `packages/web/app/api/organizations/route.ts`                                                  | Relational select с count                  | Part 2.1 |
| `packages/web/app/api/courses/paginated/route.ts`                                              | Использовать total\_\*\_count              | Part 2.2 |
| `packages/web/app/api/invitations/[token]/route.ts`                                            | Relational select                          | Part 2.3 |
| `packages/web/app/api/organizations/[orgId]/invitations/route.ts`                              | Relational select с creator                | Part 2.4 |
| `packages/course-gen-platform/src/stages/stage5-generation/phases/generation-phases.ts`        | pLimit для retry                           | Part 3.1 |

## Существующие утилиты для переиспользования

- `RedisCache` class — `packages/course-gen-platform/src/shared/cache/redis.ts` (экспорт: `cache`)
- `pLimit` — уже импортирован в `generation-phases.ts:49`
- `PARALLEL_CONFIG` — уже определён в `generation-phases.ts:78-85`

## Порядок выполнения

1. **Part 1** (LLM Cache) — самый безопасный, не меняет внешнее поведение
2. **Part 2** (Queries) — аккуратно, endpoint по endpoint
3. **Part 3** (p-limit retry) — минимальный рефакторинг

## Верификация

### После Part 1:

```bash
cd packages/course-gen-platform
pnpm type-check
npx vitest run "classifier"
npx vitest run "phase-classification"
```

### После Part 2:

```bash
cd packages/web
pnpm type-check
pnpm build
```

Ручная проверка (или через Playwright):

- GET /api/organizations — список организаций с memberCount
- GET /api/courses/paginated — список курсов с sections_count, lessons_count
- GET /api/invitations/[token] — детали приглашения с organization info
- GET /api/organizations/[orgId]/invitations — список приглашений с creator info

### После Part 3:

```bash
cd packages/course-gen-platform
pnpm type-check
npx vitest run "generation-phases"
```

### Финальная проверка:

```bash
pnpm type-check
pnpm build
```
