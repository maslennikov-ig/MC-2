# Code Review: Enrichment Multi-Generation Refactoring

Date: 2026-03-01
Reviewer: code-reviewer agent
Files reviewed: 20 (6 new, 10 modified, 2 translation, 2 reference)

---

## Summary

This is a substantial, well-structured refactoring that introduces a multi-step batch creation wizard, a Zustand store for batch workflow state, a schema-driven form config registry, and a polling/realtime hook for progress tracking. The overall architecture is sound and the code is readable. However, several bugs were found that will cause runtime failures, and a number of type-safety and UX issues need attention before the feature is ready for production.

**Critical issues found**: 4
**Important issues found**: 7
**Minor / improvement issues found**: 6

---

## Critical Issues (Must Fix)

### CR-001: Immer + Set — mutations on `selectedLessonIds` will silently fail in some runtimes

**File**: `packages/web/components/generation-graph/stores/batch-enrichment-store.ts`
**Lines**: 148–165, 222–224

**Issue**: Zustand's Immer middleware uses `immer` under the hood. Immer does **not** support native `Set` mutations by default. `Set.prototype.add`, `.delete`, and assignment of `new Set(...)` all work correctly inside Immer drafts only because Immer 10+ added experimental `Set`/`Map` support — but that support is opt-in via `enableMapSet()` or the `produce` option `{setAutoFreeze: true, useStrictShallowCopy: true}`. Without the explicit `enableMapSet()` call at application startup, or without verifying the project's Immer version and config, these mutations will either throw or silently produce the wrong state.

The actions `toggleLesson`, `selectAll`, `clearSelection`, and `reset` all mutate or reassign `selectedLessonIds` as a `Set` inside Immer's draft.

```typescript
// batch-enrichment-store.ts line 150–154
toggleLesson: (lessonId) =>
  set((state) => {
    if (state.selectedLessonIds.has(lessonId)) {
      state.selectedLessonIds.delete(lessonId)   // <-- Immer Set mutation
    } else {
      state.selectedLessonIds.add(lessonId)       // <-- Immer Set mutation
    }
  }),
```

**Fix**: Either call `enableMapSet()` from `immer` at app startup (e.g., in a global setup file), or replace `Set<string>` with a plain `string[]` in state and convert to a `Set` in selectors. The plain-array approach is safer and avoids the dependency on Immer's non-default behaviour:

```typescript
// Store state uses plain array
selectedLessonIds: string[]

// Selector converts to Set for O(1) lookup
export const useBatchIsLessonSelected = (lessonId: string): boolean =>
  useBatchEnrichmentStore((state) => state.selectedLessonIds.includes(lessonId))
```

---

### CR-002: Double mutation call — `mutateAsync` inside `onSuccess` already fires; `store.setBatchResult` is called twice

**File**: `packages/web/components/generation-graph/panels/stage7/views/BatchCreateView.tsx`
**Lines**: 662–676, 752–765

**Issue**: `createBatchMutation` is configured with an `onSuccess` callback that calls `store.setBatchResult(result.enrichmentIds, result.created)`. In `handleSubmitBatch`, `mutateAsync` is awaited and its return value (`result`) is then used _again_ to call `store.setBatchResult` and build `mappedInfos`. This means `store.setBatchResult` is called **twice** in the success path: once in `onSuccess`, once explicitly after `mutateAsync` returns.

The first call sets `step = 4` and `status = 'tracking'`. By the time the code after `mutateAsync` runs, the store is already in step 4. The second call is redundant and may produce state inconsistencies if `enrichmentIds` arrive in a different order or if the step has already progressed.

Additionally, `lessonInfoMap` (the local React state for `BatchProgressPanel`) is only set in the explicit post-`mutateAsync` path. If `onSuccess` fires and triggers a re-render before `setLessonInfoMap` runs, `BatchProgressPanel` will render with an empty `lessonInfoMap`.

```typescript
// onSuccess fires FIRST (line 663–670):
onSuccess: (result) => {
  store.setBatchResult(result.enrichmentIds, result.created) // call #1
  toast.success(...)
},

// Then after mutateAsync resolves (line 758–765), call #2 happens:
const result = await createBatchMutation.mutateAsync(...)
const mappedInfos = result.enrichmentIds.map(...)
setLessonInfoMap(mappedInfos)   // may arrive after step already changed
```

**Fix**: Remove the `onSuccess` callback from the mutation options and keep all post-success logic inside `handleSubmitBatch` after `mutateAsync`. Use `onError` only for the error path. This makes the data flow explicit and sequential:

```typescript
const createBatchMutation = trpc.enrichment.createBatch.useMutation({
  onError: (error) => {
    store.setError(error.message)
    toast.error(error.message)
  },
})

// In handleSubmitBatch after mutateAsync:
const result = await createBatchMutation.mutateAsync({ ... })
const mappedInfos = result.enrichmentIds.map((eid, idx) => ({ ... }))
setLessonInfoMap(mappedInfos)
store.setBatchResult(result.enrichmentIds, result.created)
toast.success(...)
```

---

### CR-003: Polling loop does not stop when `isComplete` changes mid-interval — stale closure bug

**File**: `packages/web/components/generation-graph/hooks/useBatchProgress.ts`
**Lines**: 140–162

**Issue**: The polling `useEffect` creates a `setInterval` that checks `isComplete` on each tick. But `isComplete` is a derived value computed _outside_ the effect, and the interval callback captures the value of `isComplete` at the time the effect runs (the closure). When `isComplete` becomes `true`, the interval's closure still holds the _stale_ `false` value unless the effect re-runs.

The code tries to fix this by adding `isComplete` to the effect's dependency array, which causes the effect to re-run and create a _new_ interval every time `isComplete` changes. But this means:

1. When `isComplete` goes from `false` to `true`, the effect tears down the old interval (cleanup) and sets up a _new one_, even though no more polling is needed.
2. The second `useEffect` (lines 165–171) then also tries to clear the (already cleared) timer. Both effects fire on the same `isComplete: true` transition.
3. Net result: unnecessary extra poll cycles and duplicate timer management.

The `mountedRef` approach is correct but the `isComplete` in the closure is still stale between re-renders if the effect does not re-run.

**Fix**: Use a `ref` to track `isComplete` so the interval closure always sees the latest value without triggering re-renders:

```typescript
const isCompleteRef = useRef(false);
isCompleteRef.current = isComplete;

useEffect(() => {
  if (enrichmentIds.length === 0) return;
  mountedRef.current = true;
  void pollStatuses();

  const timer = setInterval(() => {
    if (!isCompleteRef.current && mountedRef.current) {
      void pollStatuses();
    } else if (isCompleteRef.current) {
      clearInterval(timer);
    }
  }, POLL_INTERVAL_MS);

  pollTimerRef.current = timer;

  return () => {
    mountedRef.current = false;
    clearInterval(timer);
    pollTimerRef.current = null;
  };
}, [enrichmentIds, pollStatuses]); // remove isComplete from deps
```

Remove the second `useEffect` (lines 165–171) entirely since the interval now self-terminates.

---

### CR-004: `BatchCreateView` lesson selection uses lesson _labels_ as IDs in Zustand store, but `handleSubmitBatch` re-fetches from Supabase, creating a TOCTOU inconsistency

**File**: `packages/web/components/generation-graph/panels/stage7/views/BatchCreateView.tsx`
**Lines**: 408–413, 687–748

**Issue**: The `LessonSelectionStep` builds lesson items where `id: l.id` is the UUID and `label` is the human-readable ordinal string (e.g., `"1.2"`). The `Checkbox` is keyed to `lesson.label` and `onToggle` passes `lesson.label` to `store.toggleLesson`. So the Zustand store's `selectedLessonIds` contains **labels** (strings like `"1.2"`), not UUIDs.

In `handleSubmitBatch`, the code re-fetches sections and lessons from Supabase to rebuild the label-to-UUID mapping. This is a full second database round-trip that duplicates the data already loaded in `LessonSelectionStep`. If the course structure changes between step 2 and step 3 (unlikely but possible), the mapping will differ. More practically, the label-to-UUID resolution is done for every label in `selectedLabels`; if a label cannot be resolved (e.g., because a lesson was deleted between steps), it is silently skipped with only a `logger.warn`.

When lessons are silently skipped, `resolvedUUIDs.length` may be less than `selectedLabels.length`. The `result.enrichmentIds` from `createBatch` is then mapped to `infoMap` by array index (line 760–762):

```typescript
const mappedInfos: BatchLessonInfo[] = result.enrichmentIds.map((eid, idx) => ({
  enrichmentId: eid,
  lessonLabel: infoMap[idx]?.label ?? `Lesson ${idx + 1}`,
  lessonTitle: infoMap[idx]?.title ?? '',
}));
```

This index-based mapping is only correct if `resolvedUUIDs` and `infoMap` are built in the same loop and `createBatch` returns IDs in the same order as input — which is likely but not guaranteed. If the server reorders, the labels shown in `BatchProgressPanel` will be wrong.

**Fix**: Store lesson UUIDs in the Zustand store (not labels), or pass the already-fetched lesson data from `LessonSelectionStep` down to the confirmation step as local React state rather than re-fetching. Build the `infoMap` from the same resolved data before calling `mutateAsync`.

---

## Important Issues (Should Fix)

### CR-005: `CreateView` success toast uses wrong i18n key — shows "Create" instead of a success message

**File**: `packages/web/components/generation-graph/panels/stage7/views/CreateView.tsx`
**Line**: 57

**Issue**: On successful enrichment creation, the toast shows:

```typescript
toast.success(t('inspector.views.create'));
```

`inspector.views.create` translates to `"Create"` (EN) / `"Создание"` (RU) — the view title, not a confirmation message. There is no dedicated success key for single-enrichment creation.

**Fix**: Add a key to both locale files (e.g., `inspector.createSuccess`) and use it:

```typescript
toast.success(t('inspector.createSuccess'));
```

Suggested key values:

- EN: `"Activity created successfully"`
- RU: `"Активность успешно создана"`

---

### CR-006: `EnrichmentNodeToolbar` "+" button always navigates to `quiz` regardless of context

**File**: `packages/web/components/generation-graph/components/EnrichmentNodeToolbar.tsx`
**Lines**: 126–135

**Issue**: The `Plus` button in the toolbar is wired to call `onCreateEnrichment('quiz')` regardless of what the user may want. The button's tooltip says "Add Activity" (`inspector.addEnrichment`) suggesting it should open the root inspector or a type-picker, but it hard-codes `quiz`.

```typescript
onClick={() => !totalLimitReached && onCreateEnrichment('quiz')}
```

This means clicking "+" opens the create view pre-selected to "quiz", which is misleading if the user clicked it to navigate to the root list.

**Fix**: Either wire the "+" button to navigate to the root inspector view (remove the `CreateEnrichmentType` argument), or document explicitly that clicking "+" creates a quiz and rename the tooltip accordingly. The current silent defaulting to `quiz` is a UX bug.

---

### CR-007: `RootView` realtime subscription re-fires every time `state.status` changes, including when transitioning back to `loading`

**File**: `packages/web/components/generation-graph/panels/stage7/views/RootView.tsx`
**Line**: 511

**Issue**: The realtime subscription effect depends on `state.status`:

```typescript
}, [lessonId, session, supabase, state.status]) // Re-subscribe when state becomes success (we have UUID)
```

The intent is to subscribe only after the initial fetch resolves (so `lessonUuidRef.current` is set). However, every time `fetchEnrichments` is called (including from the realtime callback), `setState({ status: 'loading' })` is set at line 304, which causes `state.status` to change from `'success'` to `'loading'`, which tears down and re-creates the channel subscription. This creates a subscribe/unsubscribe churn on every realtime-triggered refetch.

**Fix**: Track whether the initial UUID resolution has happened with a separate ref, rather than depending on `state.status`. Subscribe once after the first successful UUID resolution:

```typescript
const isSubscribedRef = useRef(false);
// In fetchEnrichments, set lessonUuidRef.current
// In the subscription effect, depend on lessonUuidRef.current !== null
// once subscribed, don't depend on state.status
```

---

### CR-008: `handleSubmitBatch` calls `store.startBatch()` before checking if Supabase data is available — error path leaves store in `submitting` state with no recovery

**File**: `packages/web/components/generation-graph/panels/stage7/views/BatchCreateView.tsx`
**Lines**: 684, 696–712

**Issue**: `store.startBatch()` is called immediately, setting `status = 'submitting'`. If the subsequent Supabase queries for sections or lessons fail (lines 696–712), the code calls `store.setError(...)`. But the `setError` action sets `status = 'error'` — this is correct. However, the "retry" button in the error UI calls:

```typescript
useBatchEnrichmentStore.setState({
  status: 'confirming',
  error: null,
});
```

This resets `status` to `'confirming'` but does NOT reset `step` back to 3. The step and status can become desynchronized if `step` was changed to 4 by `setBatchResult` before the error was set. After a retry, the user could be on step 3 UI but with `step === 4` in the store.

Additionally, calling `useBatchEnrichmentStore.setState(...)` directly inside `renderStep` (a render function body) is a side effect during render, which violates React's rendering rules and can cause infinite loops.

**Fix**: Move the retry logic to a dedicated `retryBatch` action in the store. The render function should only call event handlers, not store mutations directly. Use a `useCallback` handler:

```typescript
const handleRetry = useCallback(() => {
  useBatchEnrichmentStore.setState({
    status: 'confirming',
    step: 3,
    error: null,
  });
}, []);
```

---

### CR-009: `DetailView` silently shows "not found" for all NLM types (study guide, flashcards, mind map, infographic, banner, audio_nlm)

**File**: `packages/web/components/generation-graph/panels/stage7/views/DetailView.tsx`
**Lines**: 127–169

**Issue**: The `switch` statement in `useEnrichmentDetail` maps only `quiz`, `video`, `audio`, `presentation`, and `cover` to data states. All other types fall through to `default`:

```typescript
default:
  setState({ status: 'error', error: 'Unknown enrichment type' })
  return
```

This means `nlm_audio`, `nlm_video`, `nlm_study_guide`, `nlm_flashcards`, `nlm_mind_map`, `nlm_infographic`, `banner`, and `document` (already noted with `not_found`) will all show an error state: "Unknown enrichment type". Since this feature adds batch creation for NLM types specifically, users who create `nlm_study_guide` via the new batch wizard and then click on it in the inspector will see "Generation Error: Unknown enrichment type".

**Fix**: Add cases for the NLM types. If preview components for these types do not yet exist, set `status: 'not_found'` (with a better message) rather than `status: 'error'`, so the UX is graceful rather than alarming.

---

### CR-010: `nlm_audio` form config field name mismatch with Zod schema

**File**: `packages/web/components/generation-graph/panels/stage7/forms/enrichment-form-config.ts`
**Lines**: 166–178

**Issue**: The `nlm_audio` form config uses field name `nlm_audio_format`:

```typescript
nlm_audio: {
  formKey: 'nlmAudio',
  fields: [
    {
      name: 'nlm_audio_format',   // <-- key sent to backend
      ...
    },
  ],
},
```

But `onDemandNlmAudioSettingsSchema` in `enrichment-on-demand.ts` (line 117) has:

```typescript
nlm_audio_format: z.enum(['deep_dive', 'brief', 'critique', 'debate']).optional(),
```

This field name matches. However, looking at the `nlm_video` config (lines 183–212), the field names are `nlm_video_format` and `nlm_video_style`, which also match the schema. These are fine.

The actual mismatch is for `video`'s `speed` slider (defaultValue `1.0`, min `0.5`, max `2.0`). The `onDemandAudioSettingsSchema` (which governs regular `audio`) defines `speed` as an **enum** (`slow`, `normal`, `fast`), not a number. The `video` type's speed settings are sent as a `number`, which is inconsistent with how the `audio` type sends speed. Verify which schema `video` enrichment settings go through on the backend — if it uses the same `audio` schema, numeric speed will fail validation.

**Fix**: Confirm the backend schema for `video` type's speed field. If it expects a number, document this explicitly. If it's not yet implemented, add a note in the config.

---

### CR-011: `useBatchProgress` Supabase Realtime subscription errors are not surfaced to the user

**File**: `packages/web/components/generation-graph/hooks/useBatchProgress.ts`
**Lines**: 174–222

**Issue**: The Realtime subscription callback handles `SUBSCRIBED` status but does not handle `CHANNEL_ERROR` or `TIMED_OUT`. If the Supabase channel fails to connect, the hook silently falls back to polling only. There is no error state returned, and the UI gives no indication that realtime updates are not working.

For comparison, `useEnrichmentsByLesson` in `RootView.tsx` (lines 461–485) handles `CHANNEL_ERROR` and `TIMED_OUT` and updates `isConnected` state.

**Fix**: Add error handling to the channel subscription callback in `useBatchProgress`:

```typescript
.subscribe((status: string) => {
  if (status === 'SUBSCRIBED') {
    logger.debug('[useBatchProgress] Realtime subscription active', ...)
  } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
    logger.warn('[useBatchProgress] Realtime subscription failed', { status, courseId })
    // polling continues as fallback — no user impact, but log it
  }
})
```

---

## Minor Issues / Improvements

### CR-012: `DynamicEnrichmentForm` `renderField` renders `<div>` with `key` on the wrapper, not inside map — React key warning will fire

**File**: `packages/web/components/generation-graph/panels/stage7/forms/DynamicEnrichmentForm.tsx`
**Lines**: 58–123

**Issue**: `renderField` returns JSX with `key={field.name}` on the outermost `<div>` for select and slider, and on the `<div className="flex...">` for checkbox. These elements are returned from `renderField` and rendered via `formConfig.fields.map(renderField)` (line 147). The `key` prop is set on the inner element rather than the element returned from `map`, which is the same element here — so this actually works correctly. No React warning will fire.

However, the `renderField` function returns `null` as a fallback (line 122) which means unknown widget types silently render nothing. This is acceptable but should be documented.

**Improvement**: Add a `console.warn` or logger call for unknown widget types to catch config errors during development.

---

### CR-013: `BatchProgressPanel` "Done" button label reuses `batch.completed` translation key, which is the status text, not a button label

**File**: `packages/web/components/generation-graph/panels/stage7/components/BatchProgressPanel.tsx`
**Lines**: 157–159, 192–194

**Issue**: The "Done" button text is:

```typescript
<Button onClick={onDone} className="w-full">
  {t('batch.completed')}
</Button>
```

`batch.completed` translates to `"Batch generation complete"` (EN) / `"Массовая генерация завершена"` (RU) — this is a status message, not a button label. The button should say "Done" / "Готово".

**Fix**: Add a `batch.done` key to both locale files:

- EN: `"Done"`
- RU: `"Готово"`

And use `t('batch.done')` for the button.

---

### CR-014: `enrichment-inspector-store.ts` has `CreateEnrichmentType` that includes `podcast`, `mindmap`, `reading` — types not in `CREATEABLE_TYPES` or form config

**File**: `packages/web/components/generation-graph/stores/enrichment-inspector-store.ts`
**Lines**: 14–30

**Issue**: `CreateEnrichmentType` in the inspector store includes `podcast`, `mindmap`, and `reading` (legacy/planned types), while `CreateableEnrichmentType` in `enrichment-form-config.ts` does not include these. This creates a type divergence: the inspector store can navigate to create a `podcast`, but the `DynamicEnrichmentForm` will receive an unsupported `CreateableEnrichmentType` cast (`type as CreateableEnrichmentType` in `CreateView.tsx` line 52).

At runtime, `getFormConfig('podcast')` returns `undefined`, so the form renders the no-settings path (description + Create button). The `createEnrichment` server action's Zod schema also does not include `podcast` as a valid enum value, so the request would fail validation.

**Fix**: Either add `podcast`, `mindmap`, `reading` to the `createEnrichmentSchema` enum in `enrichment-actions.ts` and the form config, or remove them from `CreateEnrichmentType` in the inspector store. The store type should be the single source of truth and should match what can actually be created.

---

### CR-015: `DiscardChangesDialog` `handleConfirm` calls both `pendingAction()` and `onDiscard()` — potential double navigation

**File**: `packages/web/components/generation-graph/panels/stage7/components/DiscardChangesDialog.tsx`
**Lines**: 95–102

**Issue**: `handleConfirm` calls `pendingAction()` (which is typically `goBack`) and then `onDiscard()` (which is `() => setDirty(false)`). In `EnrichmentInspectorPanel`, the dialog's `onConfirm` also calls `goBack()` again:

```typescript
onConfirm={() => {
  handleConfirm()  // calls pendingAction() = goBack()
  goBack()         // called again
}}
```

This causes `goBack()` to be called twice, popping two entries from the navigation history instead of one, which could navigate past the root view.

**Fix**: Remove the explicit `goBack()` call from the `onConfirm` handler in `EnrichmentInspectorPanel`. Let `handleConfirm` call `pendingAction()` (which is `goBack`) exactly once. The same fix applies to `CreateView.tsx` lines 109–112:

```typescript
// EnrichmentInspectorPanel.tsx - was:
onConfirm={() => {
  handleConfirm()
  goBack()  // remove this
}}

// CreateView.tsx - was:
onConfirm={() => {
  handleConfirm()  // already calls goBack via pendingAction
  goBack()         // remove this
}}
```

---

### CR-016: Missing `typeDescriptions` for `banner` enrichment type in both locale files

**File**: `packages/web/messages/en/enrichments.json`, `packages/web/messages/ru/enrichments.json`

**Issue**: `typeDescriptions.banner` exists in both locale files. Verified correct. However, `DynamicEnrichmentForm` renders `typeDescriptions.{type}` for types with no form config (e.g., `document`). The `document` type has a description in both locales, so this is fine.

The `banner` type uses the shared `coverBanner` form config (it has settings), so the description path is never rendered for `banner` in practice. No bug, but worth noting.

**Actual missing key**: `batch.confirmDescription` is used in `ConfirmationStep` (BatchCreateView.tsx line 544) as:

```typescript
t('batch.confirmDescription', { count: selectedCount, type: typeName });
```

The key exists in both locale files as:

- EN: `"This will create {count} \"{type}\" enrichments"`
- RU: `"Будет создано {count} дополнений типа \"{type}\""`

These are correct. No missing keys found in the translation files for the new batch UI.

**Minor issue found**: `inspector.views.batch` is used in `InspectorHeader` when `view === 'batch'` is not the create/batch-with-type case:

```typescript
let title = t(`inspector.views.${view}` as Parameters<typeof t>[0]);
```

When `view === 'batch'`, this falls through and the title is overridden by the batch-specific logic. But if neither condition is met (which can't happen with current code), `inspector.views.batch` would be needed. Check that `inspector.views.batch` is never actually used as a fallback — it is not present in either locale file. Since the batch view always overrides the title, this is not currently reachable, but adding the key for safety is recommended.

---

## Positive Observations

1. **Schema-driven form config registry** (`enrichment-form-config.ts`) is an excellent pattern. Centralising form field definitions with defaults co-located next to the Zod schemas makes it easy to add new types and keeps the UI config as a single source of truth.

2. **Separation of concerns**: The batch wizard is cleanly separated into a store (`batch-enrichment-store.ts`), a progress hook (`useBatchProgress.ts`), a progress panel component (`BatchProgressPanel.tsx`), and a view (`BatchCreateView.tsx`). Each module has a single responsibility.

3. **Abort controller usage in `useEnrichmentsByLesson`**: The pattern of creating a new `AbortController` on each fetch and aborting on unmount or dependency change is correct and prevents stale data from being applied to state. The cancelled-flag pattern is also used correctly.

4. **Debounced realtime refetch** in `RootView`: Using `REFETCH_DEBOUNCE_MS = 300` to batch rapid realtime events before triggering a refetch is a pragmatic and correct optimisation.

5. **Discriminated union in `DetailView`**: Using a proper discriminated union (`EnrichmentData`) for type-safe preview rendering is much better than the `(enrichment as any)` pattern seen in older code. The exhaustive check (`const _exhaustive: never = enrichment`) is a good TypeScript practice.

6. **Lazy loading heavy views** in `EnrichmentInspectorPanel`: Using `React.lazy` for `CreateViewLazy`, `DetailViewLazy`, and `BatchCreateViewLazy` reduces the initial bundle size for the main panel, which is correct given these are infrequently-accessed views.

7. **tRPC procedure names are all correct**: Every call in the frontend matches procedures defined in `enrichmentRouter` — `create`, `createBatch`, `delete`, `regenerate`, `getGenerationStatus`, `getPlaybackUrl`. No stale or incorrect procedure names were found.

8. **Translation completeness**: All keys used in the new batch UI (`batch.*`, `forms.*`, `status.*`) are present in both `en/enrichments.json` and `ru/enrichments.json`. The Russian locale uses proper ICU plural forms where appropriate.

9. **Error boundaries**: `EnrichmentInspectorPanel` is wrapped in `EnrichmentInspectorErrorBoundary`, providing a catch-all for unexpected errors in any child view.

10. **Authorization on every server action**: Every function in `enrichment-actions.ts` verifies user authentication and course ownership before performing any database operation. The ownership check pattern (`course.user_id !== currentUser.id`) is applied consistently.

---

## Summary Table

| ID     | Severity  | File                                 | Description                                                                                        |
| ------ | --------- | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| CR-001 | Critical  | `batch-enrichment-store.ts`          | Immer `Set` mutations may fail without `enableMapSet()`                                            |
| CR-002 | Critical  | `BatchCreateView.tsx`                | Double `store.setBatchResult` call; `lessonInfoMap` set after store advances to step 4             |
| CR-003 | Critical  | `useBatchProgress.ts`                | Stale closure causes polling to not stop correctly when complete                                   |
| CR-004 | Critical  | `BatchCreateView.tsx`                | Labels vs UUIDs in store; second Supabase fetch creates TOCTOU gap; index-based ID mapping fragile |
| CR-005 | Important | `CreateView.tsx`                     | Success toast shows view title instead of a success message                                        |
| CR-006 | Important | `EnrichmentNodeToolbar.tsx`          | "+" button hard-codes `quiz` type regardless of intent                                             |
| CR-007 | Important | `RootView.tsx`                       | Realtime channel re-subscribes on every loading state transition                                   |
| CR-008 | Important | `BatchCreateView.tsx`                | Store state mutation directly in render function; step/status desync after retry                   |
| CR-009 | Important | `DetailView.tsx`                     | NLM types show "Unknown enrichment type" error in detail view                                      |
| CR-010 | Important | `enrichment-form-config.ts`          | `video` speed is numeric but `audio` speed is enum — verify backend schema                         |
| CR-011 | Important | `useBatchProgress.ts`                | Realtime subscription errors are not handled or surfaced                                           |
| CR-012 | Minor     | `DynamicEnrichmentForm.tsx`          | Unknown widget types silently render nothing                                                       |
| CR-013 | Minor     | `BatchProgressPanel.tsx`             | "Done" button label reuses status text key                                                         |
| CR-014 | Minor     | `enrichment-inspector-store.ts`      | `CreateEnrichmentType` includes legacy types not supported by backend                              |
| CR-015 | Minor     | `DiscardChangesDialog.tsx` + callers | `goBack()` called twice on discard confirm                                                         |
| CR-016 | Minor     | locale files                         | `inspector.views.batch` key is absent from both locale files (currently unreachable)               |
