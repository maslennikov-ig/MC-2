# Issue: Invalid Status Values in analysis-orchestrator.ts

**Date Identified:** 2025-01-15
**Status:** 🔴 OPEN (Non-Critical)
**Severity:** Low (Non-blocking, validation fails but logs warning)
**Component:** Stage 4 Analysis Orchestration

---

## Problem

The `analysis-orchestrator.ts` file uses invalid status values when calling `update_course_progress()`:

- Uses: `'analyzing_task'` (invalid)
- Uses: `'analyzing_failed'` (invalid)
- Valid values: `'pending'`, `'in_progress'`, `'completed'`, `'failed'`

---

## Evidence

### Function Validation (from migration 20251021080100)
```sql
-- Validate status
IF p_status NOT IN ('pending', 'in_progress', 'completed', 'failed') THEN
  RAISE EXCEPTION 'Invalid status: %. Must be pending|in_progress|completed|failed', p_status;
END IF;
```

### Code Usage (analysis-orchestrator.ts)
```typescript
// Line 87: Documentation incorrectly claims 'analyzing_task' is valid
* @param status - Generation status (e.g., 'analyzing_task', 'analyzing_failed')

// Line 210: INVALID - should be 'in_progress'
await updateCourseProgress(
  courseId,
  'analyzing_task',  // ❌ INVALID
  PROGRESS_RANGES.phase_0.start,
  PROGRESS_MESSAGES.phase_0_start,
  supabase
);

// Line 231: INVALID - should be 'failed'
await updateCourseProgress(
  courseId,
  'analyzing_failed',  // ❌ INVALID
  PROGRESS_RANGES.phase_0.start,
  barrierResult.errorMessage || 'Обработка документов не завершена',
  supabase
);

// Lines 260, 305, 350, 394, 437: All use 'analyzing_task' (INVALID)
// Lines 529, 540: Use 'analyzing_failed' (INVALID)
```

---

## Why This Wasn't Caught

The `update_course_progress` function will:
1. Receive invalid status value
2. Validate and raise exception: `Invalid status: analyzing_task. Must be pending|in_progress|completed|failed`
3. Exception causes the progress update to fail
4. Code logs warning but continues (non-blocking error handling)

**From analysis-orchestrator.ts line 107-116:**
```typescript
if (error) {
  logger.warn(
    {
      courseId,
      error,
      status,
      progressPercent,
      message,
    },
    'Failed to update course progress (non-blocking)'
  );
}
```

---

## Impact

### Current Behavior
- ❌ Progress updates fail silently during Stage 4 analysis
- ❌ Database validation errors logged but ignored
- ✅ Analysis continues successfully (non-blocking)
- ✅ Final stage 4 completion still updates correctly (different code path)

### User Impact
- ⚠️ Progress bar may not update smoothly during analysis
- ⚠️ Real-time progress messages may not display
- ✅ Analysis completes successfully
- ✅ Final results are correct

---

## Fix Required

### Option A: Update Code to Use Valid Status Values (Recommended)

**File:** `/home/me/code/megacampus2/packages/course-gen-platform/src/orchestrator/services/analysis/analysis-orchestrator.ts`

**Changes:**
```typescript
// Line 87: Fix documentation
- * @param status - Generation status (e.g., 'analyzing_task', 'analyzing_failed')
+ * @param status - Step status ('pending', 'in_progress', 'completed', 'failed')

// Lines 210, 260, 305, 350, 394, 437: Change to 'in_progress'
await updateCourseProgress(
  courseId,
-  'analyzing_task',
+  'in_progress',
  progressPercent,
  message,
  supabase
);

// Lines 231, 529, 540: Change to 'failed'
await updateCourseProgress(
  courseId,
-  'analyzing_failed',
+  'failed',
  progressPercent,
  errorMessage,
  supabase
);
```

**Result:**
- ✅ Progress updates succeed
- ✅ Database validation passes
- ✅ Real-time progress tracking works correctly
- ✅ generation_status enum properly mapped by function

### Option B: Modify Function to Accept Generation Status Values

**NOT RECOMMENDED** because:
- Function signature becomes ambiguous
- generation_status enum values vary by step
- Current design is cleaner (step status → function maps to generation_status)

---

## Testing After Fix

1. Run Stage 4 analysis end-to-end
2. Monitor logs for validation errors:
   ```
   grep -i "invalid status" /path/to/logs
   ```
3. Verify progress updates succeed:
   ```sql
   SELECT generation_progress, generation_status
   FROM courses
   WHERE id = 'test-course-uuid';
   ```
4. Check frontend progress bar updates smoothly

---

## Related Issues

- [RESOLVED] update_course_progress signature mismatch (20250115)
- Stage 4 real-time progress tracking (FR-018)
- Multi-phase analysis orchestration (T023-T025)

---

## Priority

**LOW** - Non-critical because:
- Analysis completes successfully
- Only affects real-time progress display
- Error is logged and handled gracefully
- No data corruption or functionality loss

**Should Fix:** Yes, for better user experience and cleaner logs

---

## Files Affected

- `/home/me/code/megacampus2/packages/course-gen-platform/src/orchestrator/services/analysis/analysis-orchestrator.ts`
  - 12 occurrences of invalid status values
  - All within `updateCourseProgress()` calls

---

**Next Steps:** Create ticket for code cleanup in next sprint. Low priority since functionality works, just logs warnings.
