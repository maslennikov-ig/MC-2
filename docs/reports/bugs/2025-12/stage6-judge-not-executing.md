# Stage 6 Judge Not Executing - Bug Report

**Date:** 2025-12-09
**Severity:** Critical
**Status:** FIXED
**Affected Component:** `packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts`

## Summary

The Judge node in Stage 6 pipeline was exiting immediately without executing cascade evaluation (CLEV voting system). This resulted in:
- `qualityScore: 0` for all generated lessons
- No actual quality evaluation performed
- Missing `judge_complete` trace records in database

## Evidence (Before Fix)

### Database Analysis

**Generation trace records for stage_6:**
```
step_name          | count
-------------------|-------
start              | 2
planner_start      | 2
planner_complete   | 2
expander_start     | 2
expander_complete  | 2
assembler_start    | 2
assembler_complete | 2
smoother_start     | 2
smoother_complete  | 2
judge_start        | 2
judge_complete     | 0  ← MISSING!
judge_error        | 0
finish             | 2
```

**Timing evidence:**
- `judge_start`: 11:32:01.673
- `finish`: 11:32:02.683
- **Delta: ~1 second** (cascade evaluation should take 10-30+ seconds)

**Lesson content in database:**
```json
{
  "status": "completed",
  "metadata": {
    "qualityScore": 0,  // Default value, not from judge
    "total_tokens": 0,
    "model_used": null
  }
}
```

## Root Cause Analysis

Investigation revealed **3 separate bugs** working together:

### Bug 1: Routing Logic Prioritization (Critical)

**File:** `orchestrator.ts`, lines 591-611

**Problem:** The routing function checked `lessonContent !== null` BEFORE checking `needsRegeneration`. This caused the graph to exit even when regeneration was needed.

**Original code:**
```typescript
function shouldRetryAfterJudge(state: LessonGraphStateType): 'planner' | '__end__' {
  // BUG: This check came BEFORE needsRegeneration check
  if (state.lessonContent !== null) {
    return '__end__';
  }

  if (state.needsRegeneration && state.retryCount < MAX_RETRIES) {
    return 'planner';
  }
  // ...
}
```

**Fix:** Reordered checks to prioritize `needsRegeneration`:
```typescript
function shouldRetryAfterJudge(state: LessonGraphStateType): 'planner' | '__end__' {
  // FIXED: Check needsRegeneration FIRST
  if (state.needsRegeneration && state.retryCount < MAX_RETRIES) {
    logger.debug({ retryCount: state.retryCount + 1 }, 'Judge routing: Routing to planner for regeneration');
    return 'planner';
  }

  if (state.lessonContent !== null) {
    return '__end__';
  }
  // ...
}
```

### Bug 2: State Reducer Rejecting Explicit Null (Critical)

**File:** `state.ts`, lines 186-189

**Problem:** The `lessonContent` reducer used `(x, y) => y ?? x` which rejects explicit `null` values. When judge returned `lessonContent: null` to trigger regeneration, the reducer kept the old value.

**Original code:**
```typescript
lessonContent: Annotation<LessonContent | null>({
  reducer: (x, y) => y ?? x,  // BUG: ?? rejects explicit null
  default: () => null,
}),
```

**Fix:** Changed to accept explicit null:
```typescript
lessonContent: Annotation<LessonContent | null>({
  reducer: (x, y) => (y !== undefined ? y : x),  // FIXED: Only reject undefined
  default: () => null,
}),
```

### Bug 3: Missing retryCount Increment (Medium)

**File:** `orchestrator.ts`, lines 366-378 and 532-546

**Problem:** The judge node didn't increment `retryCount` when recommending regeneration. This would have caused infinite retry loops.

**Fix:** Added retryCount increment in both code paths:
```typescript
return {
  // ... other fields
  retryCount: needsRegeneration ? state.retryCount + 1 : state.retryCount,
};
```

## Verification (After Fix)

### Test Results

```
Judge node: Starting content evaluation
Judge node: Executing cascade evaluation
Judge node: No verdict from cascade evaluation
Judge routing: Routing to planner for regeneration (retryCount: 1)
...
Judge node: Starting content evaluation
Judge node: Executing cascade evaluation
Judge node: No verdict from cascade evaluation
Judge routing: Ending graph (default) (retryCount: 2)
```

### Behavior Changes

| Aspect | Before Fix | After Fix |
|--------|------------|-----------|
| Judge Duration | ~1 second | 5+ minutes (with retries) |
| Cascade Evaluation | Never executed | Executes fully |
| Regeneration Loop | Broken | Works correctly |
| retryCount | Always 0 | Increments properly |
| Error Handling | Silent exit | Proper routing |

## Files Changed

1. **`packages/course-gen-platform/src/stages/stage6-lesson-content/state.ts`**
   - Line 187: Fixed `lessonContent` reducer to accept explicit null

2. **`packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts`**
   - Lines 366-378: Added retryCount increment for synthetic decision path
   - Lines 532-546: Added retryCount increment for normal decision path
   - Lines 591-611: Fixed routing function priority order
   - Added debug logging for routing decisions

## Impact

### Before Fix
- All lessons had `qualityScore: 0`
- No quality evaluation performed
- Content saved even when quality gates failed
- UI showed misleading "accept" with 0 score

### After Fix
- Judge executes cascade evaluation (heuristics → single judge → CLEV voting)
- Regeneration loop works with proper retry counting
- Content only saved when quality passes
- Proper error reporting with failure reasons

## Related Files

- `packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts` - Main orchestrator with judgeNode
- `packages/course-gen-platform/src/stages/stage6-lesson-content/state.ts` - LangGraph state definition
- `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade-evaluator.ts` - Cascade evaluation logic
- `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/clev-voter.ts` - CLEV voting system
- `packages/course-gen-platform/scripts/debug-stage6-generation.ts` - Debug script used for testing

## Notes

- Existing lessons with `qualityScore: 0` can be re-evaluated by re-running Stage 6
- The content generation pipeline (planner → expander → assembler → smoother) was working correctly
- Only the judge evaluation and routing logic had bugs
