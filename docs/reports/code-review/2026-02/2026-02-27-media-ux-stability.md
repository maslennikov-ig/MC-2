---
report_type: code-review
generated: 2026-02-27T00:00:00Z
version: 2026-02-27
status: partial
agent: code-reviewer
files_reviewed: 17
issues_found: 14
critical_count: 1
high_count: 4
medium_count: 7
low_count: 2
---

# Code Review Report: Media UX Stability — 2026-02-27

**Generated**: 2026-02-27
**Status**: PARTIAL — Correctness issues found; one is blocking
**Branch**: develop
**Files Reviewed**: 17 (10 in-scope, 7 out-of-scope)
**Issues Found**: 14 (1 critical, 4 high, 7 medium, 2 low)

---

## Executive Summary

This review covers the "Media UX Stability" changeset, which addresses five problems: stale closure in `useEnrichmentGeneration`, state loss on lesson switch, toast spam, uncontrolled tabs, and missing Supabase Realtime subscription. The overall approach is sound and the core bugs are fixed correctly. However, there is one critical infrastructure gap that will cause the Realtime subscription to silently deliver no events, and several high-priority issues around memory growth, edge cases, and test coverage gaps.

### Key Findings

- CRITICAL: `lesson_enrichments` is not in the `supabase_realtime` publication — the Realtime channel will subscribe successfully but receive zero events. The fallback polling will mask this in production but the Realtime implementation will never fire.
- HIGH: `allGenerating` Map in `useEnrichmentGeneration` grows without bound across lesson navigations; no eviction mechanism exists for entries from previously-visited lessons.
- HIGH: `isGenerating` and `getProgress` read from a ref (`generatingRef`) that is one render behind state, causing stale reads in the same render cycle where state updates occur.
- HIGH: The fallback polling `useEffect` in `course-viewer-enhanced.tsx` does not depend on `refreshEnrichments`, which itself depends on `currentLessonId`. A closure over a stale `currentLessonId` is possible during rapid lesson switching.
- HIGH: DELETE events from Supabase Realtime set `payload.new` to `{}` (empty object). The `applyRealtimeEnrichmentUpdate` function checks `nextRecord?.lesson_id`, which will be undefined on DELETE, so DELETE events are silently ignored.
- 7 out-of-scope changes in `packages/web/components/forms/create-course/` are bundled into this PR. These are a separate feature (removing the Formats section from course creation) and should be in their own commit or PR.

---

## Detailed Findings

### Critical Issues (1)

#### C-1. `lesson_enrichments` table is not in the Supabase Realtime publication

- **Files**: `packages/web/components/course/course-viewer-enhanced.tsx` lines 185-232; missing migration
- **Category**: Infrastructure / Supabase Realtime
- **Description**: The Realtime channel subscribes to `postgres_changes` on `lesson_enrichments` and reaches `SUBSCRIBED` status (the subscribe callback will receive `'SUBSCRIBED'`), but no events will ever be delivered. Supabase Realtime only broadcasts changes for tables explicitly added to the `supabase_realtime` publication. Searching all migrations confirms only `courses`, `generation_trace`, and `course_nodes` have been added to that publication. `lesson_enrichments` has never been added.
- **Impact**: The entire Realtime feature — the primary motivation for this changeset — delivers zero value in production. The 15-second fallback polling does provide eventual consistency, but at a much coarser granularity. `isRealtimeConnected` will be `true` (because the channel subscription itself succeeds), so the fallback polling will be disabled, leaving users waiting up to 15 seconds between enrichment status updates instead of getting them instantly. This is a regression from the current polling-only state, which polls every 2 seconds during active generation.
- **Recommendation**: Create a new migration to add `lesson_enrichments` to the publication. Also verify `REPLICA IDENTITY` is set to `FULL` so that UPDATE events include the full `old` record (needed for DELETE-by-UPDATE patterns):

```sql
-- packages/course-gen-platform/supabase/migrations/YYYYMMDD_add_lesson_enrichments_to_realtime.sql
ALTER PUBLICATION supabase_realtime ADD TABLE lesson_enrichments;
ALTER TABLE lesson_enrichments REPLICA IDENTITY FULL;
```

Note: Without this migration, the fallback polling logic must be inverted — poll by default and only stop when Realtime is confirmed working. The current code disables polling when `isRealtimeConnected === true`, which is the wrong default given the publication is not configured.

---

### High Priority Issues (4)

#### H-1. `allGenerating` Map grows without bound across lesson visits

- **File**: `packages/web/lib/hooks/useEnrichmentGeneration.ts` lines 111-112, 636-647
- **Category**: Performance / Memory
- **Description**: The old code cleared `generating` on every `lessonId` change. The new code intentionally keeps all entries in `allGenerating` keyed by `lessonId:type` to preserve state across lesson navigation. There is no eviction: every lesson visited during a session adds entries that are never removed (unless generation completes or is cancelled). A student visiting 50 lessons each with 3 active generations accumulates 150 entries permanently in the Map. The `useMemo` for `generating` iterates the full Map on every render.
- **Impact**: Slow memory growth in long sessions; increased render cost of the `useMemo` over time.
- **Recommendation**: Add a bounded eviction strategy. The simplest approach is to evict entries for the previous lesson once `lessonId` changes and all polling for that lesson has stopped:

```typescript
useEffect(() => {
  return () => {
    // On lesson change, remove completed (non-polling) entries for the old lesson
    const prefix = `${lessonId}:`;
    setAllGenerating(prev => {
      const next = new Map(prev);
      next.forEach((_, key) => {
        if (key.startsWith(prefix) && !pollingIntervalsRef.current.has(key)) {
          next.delete(key);
        }
      });
      return next;
    });
  };
}, [lessonId]);
```

#### H-2. `isGenerating` and `getProgress` read stale ref values within the same render

- **File**: `packages/web/lib/hooks/useEnrichmentGeneration.ts` lines 526-535
- **Category**: React correctness
- **Description**: `isGenerating` and `getProgress` are implemented as `useCallback` with empty dependency arrays and read from `generatingRef.current`. The ref is synced to state via a `useEffect`, which runs after the render that updated the state. Consequently, in the render where `setAllGenerating` fires (e.g., immediately after a generation starts), `generatingRef.current` still holds the previous Map and `isGenerating` returns the old value. Any component that calls `isGenerating` directly in its render body (not inside an event handler) will see a one-render-stale result.
- **Impact**: UI flicker or missed loading state on the render immediately following generation start.
- **Recommendation**: Return `allGenerating` from the hook and derive `isGenerating`/`getProgress` from state, not from the ref. The ref is needed inside async callbacks (polling closures); it should not be the source of truth for rendering. Alternatively, derive these inside the `useMemo` that already computes `generating`:

```typescript
const isGenerating = useCallback(
  (type: string) => generating.has(type), // reads from useMemo which reads from state
  [generating]
);
const getProgress = useCallback((type: string) => generating.get(type), [generating]);
```

#### H-3. Realtime DELETE events are silently dropped

- **File**: `packages/web/components/course/course-viewer-enhanced.tsx` lines 126-128
- **Category**: Correctness / Supabase Realtime
- **Description**: For DELETE events, Supabase sets `payload.new` to `{}` (empty object) and `payload.old` to the previous row (but only if `REPLICA IDENTITY FULL` is set; otherwise `payload.old` is also `{}`). The current code reads `nextRecord?.lesson_id ?? previousRecord?.lesson_id`. If `REPLICA IDENTITY` is not `FULL`, both will be undefined and the early `return` on line 128 fires, silently dropping the DELETE. Even if `REPLICA IDENTITY FULL` is set, the `eventType` check must come before the record validation, as a DELETE with a valid `old` record is legitimate and must still be processed as a removal.
- **Impact**: Deleted enrichments will persist in the UI indefinitely after a DELETE event (or until a full refetch).
- **Recommendation**: Guard DELETE events explicitly before relying on `nextRecord`:

```typescript
const applyRealtimeEnrichmentUpdate = useCallback(
  (
    eventType: 'INSERT' | 'UPDATE' | 'DELETE',
    nextRecord?: Partial<EnrichmentRow>,
    previousRecord?: Partial<EnrichmentRow>
  ) => {
    const record = eventType === 'DELETE' ? previousRecord : nextRecord;
    const lessonId = record?.lesson_id;
    const enrichmentId = record?.id;
    if (!lessonId || !enrichmentId) return;
    // ... rest of logic
  }
);
```

Also add a migration to set `REPLICA IDENTITY FULL` on `lesson_enrichments` (required for DELETE payloads to include full row data).

#### H-4. Fallback polling closure may capture stale `currentLessonId`

- **File**: `packages/web/components/course/course-viewer-enhanced.tsx` lines 234-244
- **Category**: React correctness / stale closure
- **Description**: The fallback polling `useEffect` depends on `[currentLessonId, isRealtimeConnected, refreshEnrichments]`. The `refreshEnrichments` callback itself has `[currentLessonId, course.id, refetchEnrichments]` as dependencies. When the user switches lessons rapidly, the intermediate values of `currentLessonId` may not be captured by the effect before it re-runs, because React batches state updates. In the edge case where `isRealtimeConnected` becomes `false` during a lesson switch (e.g., network drop), the setInterval captures the `currentLessonId` from the closure at the time the interval was set. If `currentLessonId` changes after that (next lesson), the interval calls `refreshEnrichments(currentLessonId)` with the old lesson id until the next re-render triggers effect cleanup and re-registration.
- **Impact**: Enrichment data for the wrong lesson is fetched during the brief window between lesson switch and effect re-registration.
- **Recommendation**: Use a ref to ensure the interval always calls with the current lesson:

```typescript
const currentLessonIdRef = useRef(currentLessonId);
useEffect(() => {
  currentLessonIdRef.current = currentLessonId;
}, [currentLessonId]);

useEffect(() => {
  if (isRealtimeConnected || !currentLessonId) return;
  const interval = setInterval(() => {
    void refreshEnrichments(currentLessonIdRef.current ?? undefined);
  }, REALTIME_FALLBACK_INTERVAL_MS);
  return () => clearInterval(interval);
}, [isRealtimeConnected, currentLessonId, refreshEnrichments]);
```

---

### Medium Priority Issues (7)

#### M-1. `completedToastsRef` leaks entries if component unmounts during the 5-second timeout

- **File**: `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx` lines 83-88
- **Category**: Memory / correctness
- **Description**: `setTimeout(() => completedToastsRef.current.delete(enrichmentId), 5000)` is not tracked and not cancelled on unmount. If `EnrichmentsPanel` unmounts within 5 seconds of a completion toast, the timeout fires on a ref that is no longer associated with a mounted component. The ref itself will be GC'd eventually, but the timeout callback holds a reference to it for 5 seconds, delaying garbage collection.
- **Recommendation**: Track the timeout IDs and cancel them in a cleanup effect, or use `useRef` to store the timeouts map.

#### M-2. No test coverage for Realtime channel lifecycle

- **File**: `packages/web/components/course/course-viewer-enhanced.tsx` — no test file exists for this component
- **Category**: Testing
- **Description**: The entire Realtime subscription logic (subscribe, error handling, cleanup, fallback polling activation) has zero test coverage. The `applyRealtimeEnrichmentUpdate` function — which is complex and has edge cases for INSERT/UPDATE/DELETE — is tested only indirectly.
- **Recommendation**: Add unit tests for `applyRealtimeEnrichmentUpdate` and integration tests for the subscription lifecycle:
  - Verify channel is unsubscribed on component unmount
  - Verify `isRealtimeConnected` transitions correctly on `CHANNEL_ERROR`
  - Verify fallback polling starts when Realtime disconnects and stops when it reconnects
  - Verify merge logic for INSERT vs. UPDATE vs. DELETE events

#### M-3. `resumedKeysRef` is module-level shared state — no reset on lessonId change

- **File**: `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx` lines 121, 148-152
- **Category**: State management
- **Description**: `resumedKeysRef` accumulates keys of the form `lessonId:type`. The cleanup inside the `useEffect` only removes keys for the current `lessonId` when those types are no longer active. Keys from previously-visited lessons are never cleaned up. In a long session visiting many lessons, this Set grows without bound. Additionally, if the same lesson is visited, navigated away from, and revisited after an enrichment has completed and restarted, the key `lessonId:type` is never re-added to `resumedKeysRef` after cleanup (because `resumedKeysRef.current.delete(key)` removes it). That is actually correct behaviour — but it depends on the cleanup firing correctly, which it does only when the `useEffect` dependency array triggers a re-run. If `enrichments` reference is stable (same array reference returned) across a lesson switch, the cleanup may not fire, leaving stale keys in the Set.
- **Recommendation**: Reset `resumedKeysRef` when `lessonId` changes to prevent unbounded growth:

```typescript
const prevLessonIdRef = useRef(lessonId);
useEffect(() => {
  if (prevLessonIdRef.current !== lessonId) {
    // Remove keys for old lesson on lesson switch
    const oldPrefix = `${prevLessonIdRef.current}:`;
    resumedKeysRef.current.forEach(key => {
      if (key.startsWith(oldPrefix)) resumedKeysRef.current.delete(key);
    });
    prevLessonIdRef.current = lessonId;
  }
}, [lessonId]);
```

#### M-4. `applyRealtimeEnrichmentUpdate` does not handle partial UPDATE payloads defensively

- **File**: `packages/web/components/course/course-viewer-enhanced.tsx` lines 144-154
- **Category**: Robustness
- **Description**: When performing a merge for UPDATE events, the code does `{ ...currentLessonItems[existingIndex], ...nextRecord }`. Supabase Realtime UPDATE payloads include the full new row unless column filters are applied, so this should be safe in the common case. However, if `nextRecord` is a partial record (e.g., from a filtered subscription or a future schema change), fields like `content` (a JSONB blob that may include file URLs or structured data) could be overwritten with `undefined`. The `as EnrichmentRow` cast suppresses TypeScript's ability to catch this.
- **Recommendation**: Add a guard to filter out `undefined` values before merging, and add a comment explaining the Supabase guarantee relied upon:

```typescript
const cleanNextRecord = Object.fromEntries(
  Object.entries(nextRecord).filter(([, v]) => v !== undefined)
);
const mergedRow =
  existingIndex >= 0
    ? ({ ...currentLessonItems[existingIndex], ...cleanNextRecord } as EnrichmentRow)
    : (nextRecord as EnrichmentRow);
```

#### M-5. URL sync in `LessonView` does not clear the `tab` param on lesson navigation

- **File**: `packages/web/components/course/viewer/components/LessonView.tsx` lines 110-121
- **Category**: UX / URL state
- **Description**: When the user navigates to a different lesson (via sidebar or prev/next buttons), the URL retains the `?tab=enrichments` (or `?tab=structure`) query parameter. The new lesson loads with the same tab already active, which may be unexpected — if the user was on the "enrichments" tab for lesson A and navigates to lesson B, lesson B opens on the enrichments tab rather than the default content tab. There is no mechanism to reset the tab to `content` on lesson change.
- **Recommendation**: Decide on the intended UX. If tabs should reset on lesson navigation, clear the `tab` param in the component that handles `setCurrentLessonId`. If tab persistence is desired, document it as intentional in a comment.

#### M-6. Missing `Suspense` boundary for `useSearchParams` in `LessonView`

- **File**: `packages/web/components/course/viewer/components/LessonView.tsx` line 108
- **Category**: Next.js correctness
- **Description**: Next.js 14+ requires components that call `useSearchParams()` to be wrapped in a `Suspense` boundary, or the page will throw a build/runtime error if rendered in a non-Suspense context. `LessonView` is a client component but is rendered inside a Server Component tree (`course-viewer-enhanced.tsx` is `'use client'` but its parent page may not wrap it in `Suspense`). This can cause a `useSearchParams` bail-out warning in development and hydration errors in production.
- **Recommendation**: Wrap the `LessonView` usage in `course-viewer-enhanced.tsx` with `<Suspense fallback={null}>`, or verify that the parent page already provides a Suspense boundary:

```tsx
import { Suspense } from 'react'
// In CourseViewerEnhanced:
<Suspense fallback={<div>Loading...</div>}>
  <LessonView ... />
</Suspense>
```

#### M-7. `refreshEnrichments` depends on `localEnrichmentsRef.current` which may be stale at call time

- **File**: `packages/web/components/course/course-viewer-enhanced.tsx` lines 98-118
- **Category**: Correctness
- **Description**: `refreshEnrichments` uses `localEnrichmentsRef.current` to spread existing enrichment data: `{ ...(localEnrichmentsRef.current ?? {}), [lessonIdToRefresh]: result.enrichments }`. The `localEnrichmentsRef` is synced from `localEnrichments` via a `useEffect`. If two rapid lesson switches trigger two concurrent `refreshEnrichments` calls, the second call may read the ref before the first call's result has been applied to state (and thus before the ref has been updated), causing the first lesson's new data to be overwritten. The `refetch` inside `useServerData` does have its own race-condition guard via `fetchId`, but that only protects within a single `refetch` call chain, not across two simultaneous calls with different lesson IDs.
- **Recommendation**: The `refetch` in `useServerData` accepts the full new state via the callback. Instead of spreading inside the callback, use a functional state update pattern that always reads fresh state at the time of application:

```typescript
await refetchEnrichments(async () => {
  const result = await getLessonEnrichments({ lessonId: lessonIdToRefresh, courseId: course.id });
  if (result.success && result.enrichments) {
    // Return a function that will merge with current state at application time
    return (prev: typeof localEnrichments) => ({
      ...(prev ?? {}),
      [lessonIdToRefresh]: result.enrichments,
    });
  }
  return null;
});
```

Note: This requires `useServerData.refetch` to accept `() => Promise<T | ((prev: T) => T) | null>`. If that refactor is too large, use `setLocalEnrichments` with a functional updater directly after the fetch completes.

---

### Low Priority Issues (2)

#### L-1. `HIDDEN_ENRICHMENT_STATUSES` is a module-level constant typed as `Set<string>` but should be `Set<EnrichmentStatus>`

- **File**: `packages/web/components/course/course-viewer-enhanced.tsx` line 26
- **Category**: Type safety
- **Description**: `const HIDDEN_ENRICHMENT_STATUSES = new Set(['failed', 'cancelled'])` loses type information. If the `status` column type changes (e.g., a new terminal status is added), TypeScript will not warn that this set is incomplete.
- **Recommendation**: Type it against the database enum or a shared type:

```typescript
import type { Database } from '@/types/database.generated';
type EnrichmentStatus = Database['public']['Tables']['lesson_enrichments']['Row']['status'];
const HIDDEN_ENRICHMENT_STATUSES = new Set<EnrichmentStatus>(['failed', 'cancelled']);
```

#### L-2. `log` constant created at module level in `course-viewer-enhanced.tsx` but never used for INFO-level context

- **File**: `packages/web/components/course/course-viewer-enhanced.tsx` line 28
- **Category**: Code quality
- **Description**: `log.warn` is used correctly inside the Realtime subscription callback. However, successful subscription events (`SUBSCRIBED` status) produce no log at all, making it difficult to verify Realtime is working in production logs. This is intentional to avoid noise, but a single `log.debug` on `SUBSCRIBED` would aid debugging.
- **Recommendation**: Add a debug log on successful connection:

```typescript
if (status === 'SUBSCRIBED') {
  setIsRealtimeConnected(true);
  log.debug('Realtime connected for course', { courseId: course.id });
  return;
}
```

---

## Out-of-Scope Changes (Must Flag)

The following files contain changes **unrelated to the "Media UX Stability" plan**. These changes implement removal of the "Formats" section from the course creation form, which is a separate feature:

| File                                                                        | Change                                                                                           |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/web/components/forms/create-course-form.tsx`                      | Removes `FormatsSection` import and usage                                                        |
| `packages/web/components/forms/create-course/_data/constants.ts`            | Deleted entirely (contained `generationFormats` data)                                            |
| `packages/web/components/forms/create-course/_types/index.ts`               | Deleted entirely (contained `GenerationFormat` type)                                             |
| `packages/web/components/forms/create-course/components/FormatsSection.tsx` | Deleted entirely                                                                                 |
| `packages/web/components/forms/create-course/_hooks/useCreateCourseForm.ts` | Removes `formats` state, `toggleFormat` callback                                                 |
| `packages/web/components/forms/create-course/_hooks/useAutoSave.ts`         | Hardcodes `outputFormats: ['text']` instead of reading form value                                |
| `packages/web/components/forms/create-course/_hooks/useSubmitCourse.ts`     | Hardcodes `output_formats: 'text'` instead of reading from form                                  |
| `packages/web/components/forms/create-course/_schemas/form-schema.ts`       | Removes `formats` field from Zod schema                                                          |
| `packages/web/components/forms/create-course/components/StyleSection.tsx`   | Animation delay tweak (cosmetic, likely tied to FormatsSection removal)                          |
| `packages/web/components/forms/create-course/components/UploadSection.tsx`  | Layout change from `xl:col-span-1` to `xl:col-span-2` (to fill the space left by FormatsSection) |

**Assessment**: The format-removal changes are self-consistent and appear intentional. Hardcoding `output_formats: 'text'` in both `useAutoSave` and `useSubmitCourse` is correct if text is the only supported format. No bugs are introduced by these changes. However, they should not be in the same PR as the Media UX Stability work:

1. Mixed concerns make rollback harder — if the Realtime feature has a bug in production, rolling back this PR also rolls back the Formats removal (which is unrelated).
2. The PR description does not mention these changes, increasing review surface area unexpectedly.

**Action required**: Separate these changes into their own commit (`feat: remove formats section from course creation`) and ideally their own PR, or at minimum add them to the PR description with an explanation.

---

## Correctness Assessment by Plan Item

| Plan Item                                         | Status          | Notes                                                                                                                                                                           |
| ------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Stale closure fix in `useEnrichmentGeneration` | CORRECTLY FIXED | `onCompleteRef`/`onErrorRef` pattern is idiomatic and correct. `startPolling` dependency array is now minimal.                                                                  |
| 2. State loss on lesson switch                    | CORRECTLY FIXED | Global Map keyed by `lessonId:type` preserves state across navigation. `useMemo` correctly scopes returned `generating` to current lesson.                                      |
| 3. Toast spam                                     | CORRECTLY FIXED | `completedToastsRef` deduplicates per-enrichment within a 5-second window. The info toast on resume was removed entirely (no replacement needed).                               |
| 4. Uncontrolled tabs                              | CORRECTLY FIXED | `useSearchParams` + `router.replace` is the correct Next.js pattern. `scroll: false` prevents scroll jump. Early return on same-tab click prevents unnecessary history entries. |
| 5. Missing Supabase Realtime                      | PARTIALLY FIXED | Code is correct, but table is not in the publication. Subscription succeeds but delivers no events. See C-1.                                                                    |

---

## Best Practices Validation

### React Patterns

- Ref-as-latest-value pattern for callbacks: correctly applied for `onComplete`/`onError`. Issue: also applied for `generatingRef` where state should be the source of truth for rendering (see H-2).
- Cleanup on unmount: all `useEffect` hooks have proper cleanup via returned functions. `AbortController` usage is correct.
- Dependency arrays: all dependency arrays are minimal and correct. Removal of `onComplete`, `onError`, `generating`, and `lessonId` from `startPolling`/`startGeneration`/`cancelGeneration` dependencies is correct because those are accessed via refs.

### Supabase Realtime Patterns

- Channel naming: `viewer:enrichments:${course.id}` is correctly namespaced and unique per course.
- Table filter: `filter: 'course_id=eq.${course.id}'` correctly scopes events to the current course. This requires the `course_id` column on `lesson_enrichments` to have an index for filter performance.
- `isMounted` guard in subscribe callback: correctly prevents state updates after unmount.
- `supabase.removeChannel(channel)` in cleanup: correct. Using `void` to discard the Promise is appropriate since cleanup cannot be async.
- CRITICAL gap: table not in publication (see C-1).

### URL State (Next.js)

- `useSearchParams().toString()` preserves existing params when adding `tab`. This is correct and prevents accidentally clearing other query parameters (e.g., `?section=...`).
- `router.replace` (not `push`) is correct — tab switches should not create browser history entries.
- `scroll: false` is correct — prevents the page from scrolling to top on tab change.

---

## Validation Gates

Type-check and build were not run as part of this review. Based on code analysis:

- **Type safety**: The `as Partial<EnrichmentRow>` casts on Realtime payload (lines 202-205) are necessary because Supabase types `payload.new` and `payload.old` as `Record<string, unknown>`. This is a known limitation of the Supabase JS client's TypeScript types. The casts are acceptable.
- **Potential type error**: `getGenerationKey(lessonIdRef.current, type)` in `isGenerating` and `getProgress` — `lessonIdRef.current` is typed as `string` (initialized from `lessonId: string`), so no type issue.
- **Missing type safety**: `HIDDEN_ENRICHMENT_STATUSES` (see L-1).

---

## Summary Table

| ID  | Priority | File                                             | Description                                            |
| --- | -------- | ------------------------------------------------ | ------------------------------------------------------ |
| C-1 | CRITICAL | `course-viewer-enhanced.tsx` + missing migration | `lesson_enrichments` not in realtime publication       |
| H-1 | HIGH     | `useEnrichmentGeneration.ts`                     | `allGenerating` Map grows without bound                |
| H-2 | HIGH     | `useEnrichmentGeneration.ts`                     | `isGenerating`/`getProgress` read stale ref            |
| H-3 | HIGH     | `course-viewer-enhanced.tsx`                     | DELETE events silently dropped                         |
| H-4 | HIGH     | `course-viewer-enhanced.tsx`                     | Fallback polling stale closure                         |
| M-1 | MEDIUM   | `EnrichmentsPanel.tsx`                           | Untracked timeout ref in toast dedup                   |
| M-2 | MEDIUM   | (missing test file)                              | No tests for Realtime subscription lifecycle           |
| M-3 | MEDIUM   | `EnrichmentsPanel.tsx`                           | `resumedKeysRef` grows without bound                   |
| M-4 | MEDIUM   | `course-viewer-enhanced.tsx`                     | Partial UPDATE merge not guarded                       |
| M-5 | MEDIUM   | `LessonView.tsx`                                 | Tab param persists across lesson navigation            |
| M-6 | MEDIUM   | `LessonView.tsx`                                 | Missing Suspense boundary for `useSearchParams`        |
| M-7 | MEDIUM   | `course-viewer-enhanced.tsx`                     | `refreshEnrichments` stale ref race on rapid switching |
| L-1 | LOW      | `course-viewer-enhanced.tsx`                     | `HIDDEN_ENRICHMENT_STATUSES` untyped                   |
| L-2 | LOW      | `course-viewer-enhanced.tsx`                     | No debug log on successful Realtime connect            |
| OOS | FLAG     | `create-course/*`                                | 10 files unrelated to Media UX plan                    |

---

## Required Actions Before Merge

1. **Add migration** to include `lesson_enrichments` in `supabase_realtime` publication and set `REPLICA IDENTITY FULL` (C-1). This is the only change that makes the Realtime feature actually work.

2. **Fix DELETE event handling** in `applyRealtimeEnrichmentUpdate` to read from `previousRecord` when `eventType === 'DELETE'` (H-3).

3. **Invert the fallback polling default**: while C-1 is unfixed in production, `isRealtimeConnected` will be `true` but events will never arrive, effectively disabling the fallback. If the migration cannot be deployed immediately, consider starting the fallback unconditionally and disabling it only after the first successful Realtime event is received.

## Recommended Actions Before Merge

4. Fix `isGenerating`/`getProgress` to read from `generating` (state-derived) rather than `generatingRef` (H-2).

5. Separate out-of-scope `create-course/` changes into their own commit (OOS).

6. Add `Suspense` boundary for `useSearchParams` in `LessonView` (M-6).

## Nice-to-Have (Can Be Follow-Up Issues)

7. Add bounded eviction to `allGenerating` Map (H-1).
8. Fix fallback polling stale closure (H-4).
9. Cancel `completedToastsRef` timeouts on unmount (M-1).
10. Add Realtime subscription lifecycle tests (M-2).

---

## Artifacts

- This report: `docs/reports/code-review/2026-02/2026-02-27-media-ux-stability.md`

---

Code review complete. Critical infrastructure gap (C-1) and DELETE event handling (H-3) must be resolved before this code delivers the intended Realtime functionality in production.
