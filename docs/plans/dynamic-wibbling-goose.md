# Plan: Fundamental Fix for Stage 4 Analysis Results Not Appearing

## Context

After Stage 4 deep analysis completes, the "Results" section shows a spinner with "Результаты анализа появятся здесь" instead of actual results. This bug has been "fixed" 3+ times (mc2-8ul7, mc2-ukyv, mc2-z6yc) but keeps recurring because previous fixes only addressed symptoms, not root causes.

**Root Cause**: Two bugs in GraphView.tsx make the status-based data-fetch fallback completely non-functional, leaving the system 100% dependent on Supabase Realtime events. When Realtime briefly disconnects (long sessions, background tabs, network glitches), there's no working fallback → spinner forever.

## Root Cause Analysis

### Bug 1: Shared `prevPipelineStatus` ref race condition (CRITICAL)

**File**: `packages/web/components/generation-graph/GraphView.tsx:735-804`

Two `useEffect` hooks share a single `prevPipelineStatus` ref:

- **Effect 1** (line 737): Detects `stage_5_complete` → updates `prevPipelineStatus.current = pipelineStatus` at line 748
- **Effect 2** (line 761): Detects `_awaiting_approval` → reads `prevPipelineStatus.current` at line 768

React runs effects in declaration order. When `pipelineStatus` changes from `stage_4_analyzing → stage_4_awaiting_approval`:

1. Effect 1 runs first → sets ref to `stage_4_awaiting_approval` (line 748)
2. Effect 2 runs second → reads ref = `stage_4_awaiting_approval`
3. `wasNotAwaiting = !['...awaiting...'].includes('stage_4_awaiting_approval')` = **false**
4. Condition fails → **fetch NEVER triggers**

### Bug 2: Missing `stage_4_complete` status

Effect 2 only watches `_awaiting_approval` statuses. In **automatic mode**, Stage 4 transitions to `stage_4_complete`, which is NOT in the list → no fallback in automatic mode at all.

### Bug 3: Inline duplicate fetch function

Effect 2 (line 773) creates a local `fetchCourseData` function instead of using the unified `fetchCourseData` callback (line 487). The inline version:

- Has no deduplication (no `refetchInProgressRef` check)
- Has no logging
- Has no `checkMounted` guard
- Shadows the outer `fetchCourseData` by name

### Why it's intermittent

- Realtime connected → Event 1 (data change) fires → `course-data-updated` dispatched → works
- Realtime disconnected → Event missed → status-based fallback is broken → spinner
- Page refresh → initial mount fetch loads everything → works

## Fix

### Step 1: Separate refs for each effect

**File**: `packages/web/components/generation-graph/GraphView.tsx`

Replace shared `prevPipelineStatus` ref (line 735) with two dedicated refs:

```tsx
// BEFORE:
const prevPipelineStatus = useRef<string | null>(null);

// AFTER:
const prevStatusForStage5 = useRef<string | null>(null);
const prevStatusForCompletion = useRef<string | null>(null);
```

Update Effect 1 (line 737-757) to use `prevStatusForStage5`:

- Line 741: `prevStatusForStage5.current = pipelineStatus ?? null`
- Line 746: `prevStatusForStage5.current !== 'stage_5_complete'`
- Line 748: `prevStatusForStage5.current = pipelineStatus ?? null`

Update `isInitialMount` effect to init both refs:

- Line 741: also set `prevStatusForCompletion.current = pipelineStatus ?? null`

### Step 2: Fix Effect 2 — add complete statuses + use unified fetch + update ref

**File**: `packages/web/components/generation-graph/GraphView.tsx:761-804`

Replace the entire Effect 2:

```tsx
useEffect(() => {
  // Cover both semi-automatic (_awaiting_approval) and automatic (_complete) modes
  const completionStatuses = [
    'stage_3_awaiting_approval',
    'stage_3_complete',
    'stage_4_awaiting_approval',
    'stage_4_complete',
    'stage_5_awaiting_approval',
    'stage_5_complete',
  ];

  const wasNotComplete = !completionStatuses.includes(prevStatusForCompletion.current || '');
  const isNowComplete = completionStatuses.includes(pipelineStatus || '');

  // Update ref AFTER reading (fixes the race condition)
  prevStatusForCompletion.current = pipelineStatus ?? null;

  if (wasNotComplete && isNowComplete) {
    // Use unified fetchCourseData with deduplication and logging
    void fetchCourseData('all', false, {
      source: `status-transition:${pipelineStatus}`,
    });
  }
}, [pipelineStatus, courseId, fetchCourseData]);
```

Key changes:

- Uses `prevStatusForCompletion` (dedicated ref) instead of shared `prevPipelineStatus`
- Updates ref AFTER reading it (not before, like Effect 1 does)
- Adds `stage_4_complete`, `stage_3_complete`, `stage_5_complete` to the list
- Uses unified `fetchCourseData` (with dedup, logging, mounted guard) instead of inline function
- Removes redundant inline `fetchCourseData` (44 lines of duplicated code)

### Step 3: Remove `stage_5_complete` from Effect 2 overlap (optional cleanup)

Note: `stage_5_complete` is now handled by BOTH Effect 1 (for structure fetch) and Effect 2 (for analysis_result fetch). This is fine — Effect 1 fetches `structure_only`, Effect 2 fetches `all`. The unified `fetchCourseData` has deduplication via `refetchInProgressRef`, so if Effect 1's fetch is in progress, Effect 2's will be skipped (and vice versa). This means in practice only ONE fetch runs, which is correct.

To avoid this ambiguity, we could remove `stage_5_complete` from Effect 2's list. But keeping it is safer — if Effect 1 runs first with `structure_only`, Effect 2's `all` fetch would be blocked. So let's keep it but add a comment explaining the interaction.

## Files to Modify

| File                                                     | Change                                                   |
| -------------------------------------------------------- | -------------------------------------------------------- |
| `packages/web/components/generation-graph/GraphView.tsx` | Fix shared ref, add complete statuses, use unified fetch |

**That's it — single file change.** The fix is minimal and targeted.

## Verification

1. **Type check**: `pnpm type-check`
2. **Build**: `pnpm --filter @megacampus/web build`
3. **Manual test** (automatic mode): Run a course generation in automatic mode, verify Stage 4 results appear without page refresh
4. **Manual test** (semi-automatic mode): Run in semi-automatic mode, verify results appear at `stage_4_awaiting_approval`
5. **Log verification**: Check browser console for `[GraphView] Course data updated, refetching... source: status-transition:stage_4_complete` log entries
