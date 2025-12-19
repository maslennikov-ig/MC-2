# T021: Complete Course Deletion Cleanup

## Problem Statement

При удалении курса через API (`DELETE /api/courses/[slug]/delete`) **не удаляются**:

1. **Векторы из Qdrant** - накапливаются бесконечно
2. **Redis данные** - BullMQ jobs, idempotency keys
3. **RAG context cache** - таблица `rag_context_cache`
4. **Физические файлы на диске** - папка `uploads/{org_id}/{course_id}/`

## Current Behavior

```typescript
// packages/web/app/api/courses/[slug]/delete/route.ts
// Удаляются только:
- assets (явно)
- lessons (явно)
- sections (явно)
- course (явно)
- file_catalog (каскадно через FK ON DELETE CASCADE)
- generation_status (каскадно)
- другие связанные таблицы (каскадно)
```

**Qdrant, Redis, файлы на диске - НЕ очищаются!**

## Impact

- **Qdrant**: Неограниченный рост размера коллекции
- **Redis**: Накопление мусорных ключей
- **Disk**: Занятие места удалёнными файлами
- **Costs**: Оплата за хранение мусорных данных

## Solution

### Option A: Synchronous Cleanup (Recommended)

Добавить очистку в API endpoint перед удалением из БД:

```typescript
// 1. Delete vectors from Qdrant
await deleteVectorsForCourse(courseId);

// 2. Clean Redis
await cleanupRedisForCourse(courseId);

// 3. Clean RAG context
await cleanupCourseRagContext(courseId);

// 4. Delete physical files
await deleteUploadedFiles(organizationId, courseId);

// 5. Then delete from database (cascades handle the rest)
await supabase.from('courses').delete().eq('id', id);
```

### Option B: Async Cleanup via Job Queue

Создать BullMQ job для фоновой очистки после удаления из БД.

**Минус**: Данные могут остаться, если job не выполнится.

## Implementation Tasks

### 1. Create Cleanup Service

```typescript
// packages/course-gen-platform/src/shared/cleanup/course-cleanup.ts

export interface CourseCleanupResult {
  qdrantVectorsDeleted: number;
  redisKeysDeleted: number;
  ragContextEntriesDeleted: number;
  filesDeleted: number;
  bytesFreed: number;
}

export async function cleanupCourseResources(
  courseId: string,
  organizationId: string
): Promise<CourseCleanupResult>;
```

### 2. Qdrant Cleanup

```typescript
// Delete ALL vectors for course_id (not just per-document)
await qdrantClient.delete(COLLECTION_CONFIG.name, {
  filter: {
    must: [{ key: 'course_id', match: { value: courseId } }],
  },
  wait: true,
});
```

### 3. Redis Cleanup

```typescript
// Delete patterns:
// - idempotency:generation-{courseId}-*
// - bull:course-generation:{courseId}:*
// - Any other course-specific keys

const patterns = [
  `idempotency:generation-${courseId}-*`,
  `rag:${courseId}:*`,
];

for (const pattern of patterns) {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
```

### 4. File System Cleanup

```typescript
const uploadDir = path.join(
  process.env.UPLOADS_DIR || 'uploads',
  organizationId,
  courseId
);

await fs.rm(uploadDir, { recursive: true, force: true });
```

### 5. Update Delete API

```typescript
// packages/web/app/api/courses/[slug]/delete/route.ts

import { cleanupCourseResources } from '@megacampus/course-gen-platform/shared/cleanup';

// Before database deletion:
const cleanupResult = await cleanupCourseResources(courseId, organizationId);
logger.info({ cleanupResult }, 'Course resources cleaned up');

// Then proceed with database deletion...
```

## Acceptance Criteria

- [ ] При удалении курса удаляются все векторы из Qdrant
- [ ] При удалении курса очищаются связанные ключи Redis
- [ ] При удалении курса удаляется RAG context cache
- [ ] При удалении курса удаляются физические файлы
- [ ] Добавлены логи для отслеживания cleanup операций
- [ ] Написаны интеграционные тесты

## Files to Modify

1. `packages/course-gen-platform/src/shared/cleanup/course-cleanup.ts` (NEW)
2. `packages/web/app/api/courses/[slug]/delete/route.ts`
3. `packages/course-gen-platform/src/shared/qdrant/lifecycle.ts` (add deleteVectorsForCourse)

## Related

- `packages/course-gen-platform/src/shared/rag/rag-cleanup.ts` - уже есть cleanupCourseRagContext
- `packages/course-gen-platform/src/shared/qdrant/lifecycle.ts` - есть handleFileDelete
