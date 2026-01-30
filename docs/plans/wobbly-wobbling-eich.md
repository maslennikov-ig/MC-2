# Plan: Fix Stage 3 Skip for Deduplicated Documents

## Problem

When all documents in a course are deduplicated (reused from other courses), Stage 3 (classification/prioritization) is completely skipped. Documents remain with default `SUPPLEMENTARY` priority instead of being properly classified.

### Root Cause Chain

1. Document uploaded → deduplication detects same SHA256 hash exists
2. `phase-2-storage.ts` sets `vector_status: 'indexed'` immediately (no Stage 2 needed)
3. `lifecycle.router.ts:initiate()` queries only `vector_status='pending'` files
4. Query returns 0 files → `hasFiles = false`
5. `initialState = 'stage_4_init'` → Stage 3 never runs
6. Priorities stay at default `SUPPLEMENTARY`

### Impact

- Priority classification is per-course (same document can be CORE in one course, SUPPLEMENTARY in another)
- Skipping Stage 3 means no proper priority distribution for deduplicated courses
- Affects RAG retrieval quality (priority boosting won't work correctly)

## Solution

Modify `lifecycle.router.ts:initiate()` to use **two separate queries**:

1. **Query 1**: Files with `vector_status='pending'` (for Stage 2 decision)
2. **Query 2**: All files regardless of status (for Stage 3 decision)

### Three-Path Decision Logic

| hasPendingFiles | hasAnyFiles | initialState   | Description                           |
| --------------- | ----------- | -------------- | ------------------------------------- |
| true            | true        | `stage_2_init` | Normal flow - process documents       |
| false           | true        | `stage_3_init` | NEW - all docs indexed, classify them |
| false           | false       | `stage_4_init` | No documents at all                   |

## Implementation

### File to Modify

`/home/me/code/mc2/packages/course-gen-platform/src/server/routers/generation/lifecycle.router.ts`

### Changes (lines ~243-280)

```typescript
// BEFORE:
const { data: uploadedFiles } = await supabase
  .from('file_catalog')
  .select('id, storage_path, mime_type')
  .eq('course_id', courseId)
  .eq('vector_status', 'pending');

const hasFiles = uploadedFiles && uploadedFiles.length > 0;

if (hasFiles) {
  initialState = 'stage_2_init';
} else {
  initialState = 'stage_4_init';
}

// AFTER:
// Query 1: Check for files that need Stage 2 processing
const { data: pendingFiles } = await supabase
  .from('file_catalog')
  .select('id')
  .eq('course_id', courseId)
  .eq('vector_status', 'pending');

// Query 2: Check for any files (for Stage 3 classification)
const { data: allFiles } = await supabase
  .from('file_catalog')
  .select('id')
  .eq('course_id', courseId);

const hasPendingFiles = pendingFiles && pendingFiles.length > 0;
const hasAnyFiles = allFiles && allFiles.length > 0;

// Three-path decision logic
if (hasPendingFiles) {
  // Files need processing - start at Stage 2
  initialState = 'stage_2_init';
} else if (hasAnyFiles) {
  // All files already indexed (deduplicated) - skip to Stage 3 for classification
  initialState = 'stage_3_init';
  logger.info(
    { courseId, fileCount: allFiles.length },
    'All files already indexed (deduplicated) - starting at Stage 3'
  );
} else {
  // No files at all - skip to Stage 4
  initialState = 'stage_4_init';
}
```

### Additional Change: Update job creation logic

The existing code creates `DOCUMENT_PROCESSING` jobs only when `hasFiles` is true. Need to ensure Stage 3 handler is invoked when starting at `stage_3_init`.

Check if FSM transition from `stage_3_init` → Stage 3 handler is already wired (likely yes, but verify).

## Verification

1. **Unit Test**: Create test case in `lifecycle.router.test.ts`:
   - Mock scenario: course with 2 files, both have `vector_status: 'indexed'`
   - Assert: `initialState === 'stage_3_init'`

2. **Integration Test**:
   - Create course with document that exists in another course (same hash)
   - Start generation
   - Verify Stage 3 runs and assigns priorities

3. **Manual Test on Dev**:

   ```bash
   # 1. Find a course with deduplicated documents
   SELECT c.id, c.code, f.id as file_id, f.vector_status, f.original_file_id, f.priority
   FROM courses c
   JOIN file_catalog f ON f.course_id = c.id
   WHERE f.original_file_id IS NOT NULL;

   # 2. Start generation via UI
   # 3. Check generation_trace for stage_3 entries
   # 4. Verify file_catalog.priority updated
   ```

## Risk Assessment

- **Low risk**: Change is isolated to `initiate()` method
- **Backward compatible**: Existing courses with pending files work unchanged
- **No data migration needed**: Fix applies to new generations only

## Related Files

- `packages/course-gen-platform/src/stages/stage1-document-upload/phases/phase-2-storage.ts` - Deduplication logic (read-only reference)
- `packages/course-gen-platform/src/stages/stage3-classification/orchestrator.ts` - Stage 3 logic (read-only reference)
- `packages/course-gen-platform/src/shared/fsm/` - FSM transitions (verify `stage_3_init` state exists)
