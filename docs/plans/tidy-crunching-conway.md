# Plan: lessonDigest as summary_preview (mc2-w6eu)

## Context

Stage 6 (single-call generation) now produces a `lessonDigest` — factual 3-5 sentence summary of generated lesson content. Currently this digest is extracted in the LangGraph pipeline but **lost** when converting to `Stage6Output`: it never reaches the database.

Meanwhile, `summary_preview` for inter-lesson context is built from lesson objectives in Stage 5 (`v2-converter.ts:127`). This is suboptimal — actual content summaries would give the LLM much better context for generating coherent adjacent lessons.

**Goal**: Persist lessonDigest to DB and use it as `summary_preview` when available (regeneration, retries, and lucky ordering during parallel generation).

## Housekeeping (before implementation)

Close 4 completed tasks:

- `bd close mc2-mdg8 --reason="Stage 6 single-call implemented and deployed"`
- `bd close mc2-85zs --reason="Stage 5 chat debug page implemented (487 lines)"`
- `bd close mc2-rnxr --reason="Phase 4 course_nodes: all 8 subtasks complete, migrations applied"`
- `bd close mc2-09yp --reason="SUPABASE_JWT_SECRET already exists in GitHub secrets (added 2026-02-12)"`

## Implementation

### Step 1: Add `lessonDigest` to Stage6Output type

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/types/index.ts`

Add to `Stage6Output` interface (after `reviewInfo`):

```typescript
/** Lesson digest — 3-5 sentence factual summary for inter-lesson context */
lessonDigest?: string;
```

### Step 2: Pass lessonDigest through execute-stage6

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/execution/execute-stage6.ts`

In `executeStage6()` return block (~line 80), add:

```typescript
lessonDigest: result.lessonDigest || undefined,
```

`result` is `LessonGraphStateType` which already has `lessonDigest: string | null` (state.ts:183).

### Step 3: Save lessonDigest in database metadata

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/services/database-service.ts`

In `saveLessonContent()` metadata object (~line 200), add:

```typescript
lessonDigest: result.lessonDigest ?? undefined,
```

`saveLessonContent()` receives `Stage6Output`, which now includes `lessonDigest` from Step 1.

### Step 4: Enrich summary_preview from DB before generation

**File**: `packages/course-gen-platform/src/stages/stage6-lesson-content/services/job-processor.ts`

Add a helper function `enrichSummaryPreviewFromDB()`:

1. Check `lessonSpec.lesson_context?.previous_lesson?.lesson_id`
2. If exists, call `resolveLessonUuid(courseId, previousLessonId)`
3. Query `lesson_contents` for that lesson_id where status='completed', order by created_at desc, limit 1
4. Extract `metadata.lessonDigest` from the result
5. If found, set `lessonSpec.lesson_context.previous_lesson.summary_preview = digest`

Call this function in `processStage6Job()` BEFORE calling `executeStage6()`, after RAG retrieval.

**Existing utilities to reuse**:

- `resolveLessonUuid()` from `@/shared/database/lesson-resolver` (already imported in job-processor.ts:4)
- `getSupabaseAdmin()` from `@/shared/supabase/admin` (already used in database-service.ts)

### Step 5: Also enrich in Stage 5 handler (for courses with prior Stage 6 runs)

**File**: `packages/course-gen-platform/src/stages/stage5-generation/utils/section-batch/v2-converter.ts`

In `buildLessonContext()` (~line 127), after setting objectives-based summary_preview:

- This is the initial generation path
- Leave as-is for now (Stage 5 runs before Stage 6, no digests exist yet)
- The enrichment in Step 4 handles the case where digests DO exist (retries, partial regeneration)

**No changes needed here.**

## Data Flow (after implementation)

```
Stage 5 (v2-converter.ts)
  └─ summary_preview = objectives.slice(0,2).join('. ')  [unchanged]
       │
       ▼
BullMQ Job Processor (job-processor.ts)  [NEW]
  └─ enrichSummaryPreviewFromDB():
     └─ IF previous lesson has digest in DB → override summary_preview
     └─ ELSE → keep objectives-based preview
       │
       ▼
Stage 6 Generation (generator-single-call.ts)
  └─ Generates content + extracts lessonDigest  [unchanged]
       │
       ▼
execute-stage6.ts  [MODIFIED]
  └─ Returns Stage6Output with lessonDigest
       │
       ▼
database-service.ts  [MODIFIED]
  └─ Saves lessonDigest to lesson_contents.metadata
```

## Files Modified

| File                           | Change                               |
| ------------------------------ | ------------------------------------ |
| `types/index.ts`               | Add `lessonDigest` to `Stage6Output` |
| `execution/execute-stage6.ts`  | Pass `result.lessonDigest` to output |
| `services/database-service.ts` | Save `lessonDigest` in metadata      |
| `services/job-processor.ts`    | Add `enrichSummaryPreviewFromDB()`   |

All files are under `packages/course-gen-platform/src/stages/stage6-lesson-content/`.

## Verification

1. `pnpm type-check` — no TypeScript errors
2. `pnpm build` — builds successfully
3. Run existing Stage 6 unit tests: `pnpm test -- --testPathPattern stage6`
4. Verify digest appears in lesson_contents metadata:
   ```sql
   SELECT lesson_id, metadata->'lessonDigest' as digest
   FROM lesson_contents
   WHERE metadata->'lessonDigest' IS NOT NULL
   LIMIT 5;
   ```
5. Verify enrichment works on retry: re-run a lesson (retry-lesson), check that previous lesson's digest is used as summary_preview in logs
