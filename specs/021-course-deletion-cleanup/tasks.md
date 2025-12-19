# T021: Course Deletion Cleanup - Tasks

## Status: Ready for Implementation

---

## Tasks

### [ ] T021.1: Create Course Cleanup Service

**File**: `packages/course-gen-platform/src/shared/cleanup/course-cleanup.ts`

Create unified cleanup service:

```typescript
export async function cleanupCourseResources(
  courseId: string,
  organizationId: string
): Promise<CourseCleanupResult>
```

Components:
- Qdrant vector deletion by course_id
- Redis key cleanup (idempotency, jobs)
- RAG context cleanup (reuse existing)
- Physical files deletion

**Executor**: MAIN or fullstack-nextjs-specialist

---

### [ ] T021.2: Add deleteVectorsForCourse to Qdrant lifecycle

**File**: `packages/course-gen-platform/src/shared/qdrant/lifecycle.ts`

Add function to delete ALL vectors for a course (not per-document):

```typescript
export async function deleteVectorsForCourse(courseId: string): Promise<number>
```

**Executor**: MAIN

---

### [ ] T021.3: Create Redis Cleanup Utility

**File**: `packages/course-gen-platform/src/shared/cleanup/redis-cleanup.ts`

```typescript
export async function cleanupRedisForCourse(courseId: string): Promise<number>
```

Patterns to clean:
- `idempotency:generation-{courseId}-*`
- BullMQ job artifacts for course

**Executor**: MAIN

---

### [ ] T021.4: Create File System Cleanup Utility

**File**: `packages/course-gen-platform/src/shared/cleanup/files-cleanup.ts`

```typescript
export async function deleteUploadedFiles(
  organizationId: string,
  courseId: string
): Promise<{ filesDeleted: number; bytesFreed: number }>
```

**Executor**: MAIN

---

### [ ] T021.5: Integrate Cleanup into Delete API

**File**: `packages/web/app/api/courses/[slug]/delete/route.ts`

1. Get organizationId before deletion
2. Call cleanupCourseResources()
3. Log cleanup results
4. Proceed with database deletion

**Executor**: fullstack-nextjs-specialist

---

### [ ] T021.6: Add tRPC endpoint for cleanup (optional)

For admin panel / monitoring - expose cleanup as tRPC procedure.

**Executor**: api-builder

---

### [ ] T021.7: Integration Tests

**File**: `packages/course-gen-platform/tests/integration/course-cleanup.test.ts`

Test scenarios:
- Course with vectors gets cleaned from Qdrant
- Redis keys are removed
- Files are deleted from disk
- Cleanup handles partial failures gracefully

**Executor**: test-writer

---

## Execution Order

1. T021.2 (Qdrant function)
2. T021.3 (Redis cleanup)
3. T021.4 (Files cleanup)
4. T021.1 (Unified service - combines 2,3,4)
5. T021.5 (API integration)
6. T021.7 (Tests)
7. T021.6 (Optional tRPC)

## Priority

**HIGH** - каждый удалённый курс оставляет мусор в Qdrant
