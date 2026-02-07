# Plan: usePrevious hook + pull-fallback across the project

## Context

Stage 4 analysis results intermittently don't appear after completion (spinner instead of data). Initial fix (commit 669b8010) resolved the immediate bugs but used a sub-optimal pattern (separate refs). The project has 10 places with the "previous value tracking" pattern using manual refs, with no shared `usePrevious` hook. Additionally, components showing analysis/structure data have no pull-fallback when Realtime misses events.

Goals:

1. Create reusable `usePrevious` hook (DRY up 8 places)
2. Refactor GraphView.tsx and other components to use it
3. Add pull-fallback for Stage 4 and Stage 5 output tabs

## Task 1: Create `usePrevious` hook

**File**: `packages/web/lib/hooks/use-previous.ts` (NEW)

```tsx
import { useEffect, useRef } from 'react';

/**
 * Returns the value from the previous render.
 *
 * The ref is updated inside a useEffect (no dependency array = runs after every render).
 * The returned value is read during render from ref.current (closure capture),
 * so all effects in the component always see the PREVIOUS render's value.
 *
 * Replaces the manual pattern:
 *   const prevRef = useRef(value)
 *   useEffect(() => { prevRef.current = value }, [value])
 *
 * Returns `undefined` on the first render (no previous value exists).
 * This naturally handles "skip initial mount" — just check `if (prev === undefined)`.
 *
 * Safe with React 18 Strict Mode (double-invoke): closure value is consistent.
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}
```

Add export to `packages/web/lib/hooks/index.ts`:

```tsx
// Value Tracking
export * from './use-previous';
```

## Task 2: Refactor GraphView.tsx — usePrevious + keep completion statuses

**File**: `packages/web/components/generation-graph/GraphView.tsx`

Replace the two manual refs + two effects (lines 735-792) with:

```tsx
const prevPipelineStatus = usePrevious(pipelineStatus);

// Re-fetch course structure when Stage 5 becomes complete
useEffect(() => {
  if (prevPipelineStatus === undefined) return; // skip initial mount
  const wasNotComplete = prevPipelineStatus !== 'stage_5_complete';
  const isNowComplete = pipelineStatus === 'stage_5_complete';
  if (wasNotComplete && isNowComplete) {
    courseStructureInitialized.current = false;
    void fetchCourseData('structure_only', true);
  }
}, [pipelineStatus, prevPipelineStatus, fetchCourseData]);

// Re-fetch course data when stage transitions to awaiting_approval or complete
useEffect(() => {
  if (prevPipelineStatus === undefined) return; // skip initial mount
  const completionStatuses = [
    'stage_3_awaiting_approval',
    'stage_3_complete',
    'stage_4_awaiting_approval',
    'stage_4_complete',
    'stage_5_awaiting_approval',
    'stage_5_complete',
  ];
  const wasNotComplete = !completionStatuses.includes(prevPipelineStatus || '');
  const isNowComplete = completionStatuses.includes(pipelineStatus || '');
  if (wasNotComplete && isNowComplete) {
    void fetchCourseData('all', false, {
      source: `status-transition:${pipelineStatus}`,
    });
  }
}, [pipelineStatus, prevPipelineStatus, courseId, fetchCourseData]);
```

Key improvement: **one `usePrevious` call, both effects read the same correct previous value**. No shared mutable ref, no race condition by design. Remove `prevStatusForStage5`, `prevStatusForCompletion`, `isInitialMount` refs.

## Task 3: Refactor other components to use `usePrevious`

### 3a. RefinementChat.tsx (line 88)

**Current**: `const prevHistoryLenRef = useRef(history.length)` + manual update in effect (line 100)
**After**: `const prevHistoryLen = usePrevious(history.length)`
**Edge case**: On first render `prevHistoryLen === undefined`. The condition `history.length > undefined` is `false` (NaN comparison), so no action — correct (skip initial mount).

### 3b. QuestionCard.tsx (lines 133-136)

**Current**: 3 refs (`prevIsAnswered`, `prevAnswer`, `prevAnswers`) + manual updates (lines 156-158)
**After**:

```tsx
const prevIsAnswered = usePrevious(isAnswered);
const prevAnswer = usePrevious(question.currentAnswer);
const prevAnswers = usePrevious(question.currentAnswers);
```

Remove lines 156-158 (manual ref updates). Adjust conditions:

- Line 140: `isAnswered && !prevIsAnswered` → `isAnswered && prevIsAnswered === false`
- Line 147-149: `question.currentAnswer !== prevAnswer` (direct comparison instead of `.current`)
  **Edge case**: First render all `prev*` are `undefined`. `isAnswered && !undefined` = `isAnswered && true` = true if answered on mount → sets mode to 'answered'. But this already happens via useState initializer (line 129), so it's a harmless no-op.

### 3c-3e. Stage2Group.tsx (120), StageNode.tsx (31), ModuleGroup.tsx (150) — identical pattern

**Current**: `const prevZoomModeRef = useRef<...>('full')` + manual check & update
**After**: `const prevZoomMode = usePrevious(currentZoomMode)`
**Edge case**: First render `prevZoomMode === undefined`. Current ref initializes with `'full'`. Since `currentZoomMode` also starts as `'full'` (from zoom calculation), the condition `prev !== current` is `undefined !== 'full'` = true → would fire `updateNodeInternals` once on mount. Fix: add `if (prevZoomMode === undefined) return` guard.

### 3f. course-viewer-enhanced.tsx (line 101)

**Current**: `const prevLessonIdRef = useRef<string | null>(null)` + skip-initial-mount logic
**After**: `const prevLessonId = usePrevious(currentLessonId)`
**Edge case**: `prevLessonId === undefined` on first render → `if (prevLessonId === undefined) return` replaces the existing `if (prevLessonIdRef.current === null)` check. Same semantics.

### 3g. useRotatingStatusMessage.ts (line 307)

**Current**: `const previousStatusRef = useRef(status)` + manual check & update
**After**: `const prevStatus = usePrevious(status)`
**Edge case**: First render `prevStatus === undefined`. `undefined !== status` → true → `setMessageIndex(0)`. But `messageIndex` is already 0 from useState(0), so harmless no-op.

### NOT refactoring (different pattern — ref updated in event handler + effect):

- `panels/output/EditableField.tsx:94` — ref captures value for undo history in `handleChange`
- `panels/output/EditableChips.tsx:62` — same pattern

## Task 4: Pull-fallback for Stage4OutputTab

**File**: `packages/web/components/generation-graph/panels/stage4/Stage4OutputTab.tsx`

Add direct Supabase fetch when neither `persistedAnalysisResult` nor `outputData` has data:

```tsx
const [directFetchResult, setDirectFetchResult] = useState<AnalysisResult | null>(null);
const hasFetched = useRef(false);

// Pull-fallback: fetch analysis_result directly if not available via context/traces
useEffect(() => {
  if (persistedAnalysisResult || outputData || hasFetched.current || !courseId) return;
  hasFetched.current = true;

  const supabase = createClient();
  supabase
    .from('courses')
    .select('analysis_result')
    .eq('id', courseId)
    .single()
    .then(({ data }) => {
      if (data?.analysis_result) {
        const parsed = parseAnalysisResult(data.analysis_result);
        if (parsed) setDirectFetchResult(parsed);
      }
    });
}, [persistedAnalysisResult, outputData, courseId]);
```

Update the `analysisResult` memo to include the third source:

```tsx
const analysisResult = useMemo((): AnalysisResult | null => {
  if (persistedAnalysisResult) {
    const parsed = parseAnalysisResult(persistedAnalysisResult);
    if (parsed) return parsed;
  }
  if (outputData) {
    const parsed = parseAnalysisResult(outputData);
    if (parsed) return parsed;
  }
  return directFetchResult; // ← pull-fallback (3rd priority)
}, [persistedAnalysisResult, outputData, directFetchResult]);
```

## Task 5: Pull-fallback for Stage5OutputTab

**File**: `packages/web/components/generation-graph/panels/stage5/Stage5OutputTab.tsx`

Same pattern. Need to add imports: `import { useEffect, useRef, useState }` and `import { createClient } from '@/lib/supabase/client'`.

Currently `parsedData` (line 106) depends on `outputData` prop. Add direct fetch:

```tsx
const [directFetchResult, setDirectFetchResult] = useState<unknown>(null);
const hasFetched = useRef(false);

useEffect(() => {
  if (outputData || hasFetched.current || !courseId) return;
  hasFetched.current = true;

  const supabase = createClient();
  supabase
    .from('courses')
    .select('course_structure')
    .eq('id', courseId)
    .single()
    .then(({ data }) => {
      if (data?.course_structure) setDirectFetchResult(data.course_structure);
    });
}, [outputData, courseId]);
```

Update `parsedData` memo to use fallback:

```tsx
const parsedData = useMemo((): CourseStructure | null => {
  if (isCourseStructure(outputData)) return outputData;
  if (isCourseStructure(directFetchResult)) return directFetchResult;
  return null;
}, [outputData, directFetchResult]);
```

## Files to Modify

| #   | File                                                                          | Change                                            |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------- |
| 1   | `packages/web/lib/hooks/use-previous.ts`                                      | NEW: `usePrevious` hook                           |
| 2   | `packages/web/lib/hooks/index.ts`                                             | Add export                                        |
| 3   | `packages/web/components/generation-graph/GraphView.tsx`                      | Refactor to usePrevious, keep completion statuses |
| 4   | `packages/web/components/generation-graph/panels/RefinementChat.tsx`          | usePrevious                                       |
| 5   | `packages/web/components/generation-graph/panels/clarifying/QuestionCard.tsx` | usePrevious (3 refs)                              |
| 6   | `packages/web/components/generation-graph/nodes/Stage2Group.tsx`              | usePrevious                                       |
| 7   | `packages/web/components/generation-graph/nodes/StageNode.tsx`                | usePrevious                                       |
| 8   | `packages/web/components/generation-graph/nodes/ModuleGroup.tsx`              | usePrevious                                       |
| 9   | `packages/web/components/course/course-viewer-enhanced.tsx`                   | usePrevious                                       |
| 10  | `packages/web/lib/hooks/useRotatingStatusMessage.ts`                          | usePrevious                                       |
| 11  | `packages/web/components/generation-graph/panels/stage4/Stage4OutputTab.tsx`  | Pull-fallback                                     |
| 12  | `packages/web/components/generation-graph/panels/stage5/Stage5OutputTab.tsx`  | Pull-fallback                                     |

## React Documentation Validation (Context7)

The `usePrevious` pattern is confirmed by React docs:

- React docs: "Effects run after every commit" — `useEffect(() => { ref.current = value })` updates ref AFTER render
- React docs: "Storing information from previous renders" — official pattern uses `useState` during render, but `useRef + useEffect` is the standard community pattern for use in effects (avoids extra re-renders)
- React 18 effect execution: "React will first run the cleanup function with the old values, and then run your setup function with the new values" — effects run in declaration order within a component
- The returned value is captured during render (closure), not during effects — both effects safely read the same previous value

## Verification

1. `pnpm type-check` — no type errors
2. `pnpm --filter @megacampus/web build` — builds successfully
3. Manual: Stage 4 results appear after completion without refresh
4. Manual: Stage 5 structure appears after completion without refresh
5. Grep: `grep -r "prevZoomModeRef\|prevHistoryLenRef\|prevPipelineStatus\|prevStatusFor\|previousStatusRef\|prevLessonIdRef\|prevIsAnswered\|prevAnswer\b\|prevAnswers" packages/web/` — should return 0 results (all replaced by usePrevious)
6. Grep: `grep -r "usePrevious" packages/web/` — should show 10+ imports across refactored files

## Execution Order

Tasks 1-2 must be sequential (hook created before usage). Tasks 3a-3g are independent and can be parallelized. Tasks 4-5 are independent and can run in parallel with Task 3.
