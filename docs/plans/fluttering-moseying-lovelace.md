# Fix: Video generation state lost on page navigation

## Context

When the user starts NLM video generation, navigates away from the lesson page, and then returns, the UI shows the "Generate" button again instead of showing the in-progress generation state. The generation IS still running on the backend (visible in NotebookLM), but the frontend fails to resume tracking it.

This affects ALL enrichment types (audio, quiz, presentation, nlm_video, etc.), not just video.

**Verified**: React docs confirm effects run in definition order after render. Next.js docs confirm page re-open triggers full SSR → hydration → mount from scratch (SSR data is fresh, not stale).

## Root Cause: Two Bugs

### Bug 1: Stale data guard blocks resume on fresh page load

**File**: `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx:122-139`

Full effect execution order on mount (hooks fire first, then component effects):

1. **Hook Effect A** (hook line 126): `mountedRef = true` `[deps: []]`
2. **Hook Effect B** (hook line 143): `setGenerating(new Map())` — resets state `[deps: [lessonId]]`
3. **Panel Effect C** (panel line 122): `isInitialLoadRef = true`, `lessonSwitchTimeRef = Date.now()` `[deps: [lessonId]]`
4. **Panel Effect D** (panel line 129): resume logic — checks stale guard `[deps: [enrichments, resumeGeneration, t]]`

Effect C sets `lessonSwitchTimeRef = Date.now()` (T0). Then Effect D: `timeSinceSwitch = Date.now() - T0` ≈ 0ms → `< 100` → **skipped**. Since SSR enrichments data never changes, no dependency triggers a re-run → resume NEVER fires.

The stale guard is correct for SPA lesson switching (avoids stale cached data), but wrong for fresh page loads where SSR data IS fresh.

### Bug 2: Placeholder filter excludes types with active enrichment records

**File**: `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx:279-300`

The `ALL_PLACEHOLDER_TYPES.filter(...)` decides which types get placeholder/generating cards:

- Image types: always shown
- Other types: shown only when `!groupedEnrichments[type]` (NO enrichment record exists)
- NLM types: shown only when all records have legacy draft statuses

When the user returns to the page, the enrichment record EXISTS in the DB with status `pending`/`generating`. So `groupedEnrichments['nlm_video']` exists → filter returns `false` → type excluded from the loop → `EnrichmentGeneratingCard` **never renders**.

The enrichment is also NOT shown in `completedEnrichments` grid (line 237-253) because `GRID_DISPLAY_STATUSES` only includes `completed`, `failed`, `cancelled`.

**Result**: The enrichment is in a "dead zone" — invisible to both grids. Both bugs must be fixed together.

## Fix Plan

### Step 1: Fix Bug 1 — Distinguish first mount from SPA navigation

**File**: `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx`

Two changes:

**a)** Change `isInitialLoadRef` initialization from `true` to `false`:

```typescript
const isInitialLoadRef = useRef(false); // was: useRef(true)
```

**b)** Add `isFirstMountRef` to skip the lessonId effect on first mount (SSR data is fresh):

```typescript
const isFirstMountRef = useRef(true);

// Reset state when lessonId changes (SPA lesson switch only, not first mount)
useEffect(() => {
  if (isFirstMountRef.current) {
    isFirstMountRef.current = false;
    return; // First mount: SSR data is fresh, no stale guard needed
  }
  resumedTypesRef.current.clear();
  isInitialLoadRef.current = true;
  lessonSwitchTimeRef.current = Date.now();
}, [lessonId]);
```

**Result on fresh page load**: `isInitialLoadRef` stays `false` → stale guard not entered → resume effect runs immediately.
**Result on SPA lesson switch**: lessonId effect sets `isInitialLoadRef = true` → stale guard activates → waits for fresh data refetch (150ms, via course-viewer-enhanced.tsx:110).

### Step 2: Fix Bug 2 — Include active-status enrichments in placeholder filter

**File**: `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx`

Add an active generation status check to the filter (before the NLM legacy check):

```typescript
ALL_PLACEHOLDER_TYPES.filter(type => {
  if (IMAGE_PLACEHOLDER_TYPES.includes(type as 'cover' | 'card')) return true;
  if (!groupedEnrichments[type]) return true;

  // NEW: Show placeholder/generating card for enrichments with active generation status
  // This ensures EnrichmentGeneratingCard renders during resume after page navigation
  if (groupedEnrichments[type].some(e => isActiveGenerationStatus(e.status))) return true;

  if (isNlmType(type)) {
    return groupedEnrichments[type].every(enrichment => isLegacyNlmDraftStatus(enrichment.status));
  }
  return false;
});
```

### Step 3: Show syncing state before resume hook fires

**File**: `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx`

Inside the placeholder card render, also detect enrichments with active status directly (to cover the brief window before the resume hook fires):

```typescript
// Inside the .map() callback, around line 314:
const activeEnrichmentForType = groupedEnrichments[type]?.find(
  (e) => isActiveGenerationStatus(e.status) && isEnrichmentOnDemand(e)
)

if (typeIsGenerating && generatingProgress) {
  return <EnrichmentGeneratingCard ... />
}

// NEW: Show syncing card for enrichments with active DB status even before hook resumes
if (activeEnrichmentForType) {
  const parsedCreatedAt = Date.parse(activeEnrichmentForType.created_at ?? '')
  return (
    <EnrichmentGeneratingCard
      key={type}
      type={type}
      progress={-1}
      currentStep="syncing"
      startedAtMs={Number.isFinite(parsedCreatedAt) ? parsedCreatedAt : undefined}
      maxDurationMs={NLM_ENRICHMENT_TYPES.has(type as NlmEnrichmentType) ? 60 * 60 * 1000 : undefined}
      onCancel={() => void cancelGeneration(type)}
    />
  )
}

return <UnifiedEnrichmentCard ... />
```

Note: Step 3 acts as an immediate visual fallback — the user sees "syncing" instantly on page load,
then once the resume effect fires and polling starts, the real progress takes over via the `typeIsGenerating` branch.

## Files to Modify

1. `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx` — all three fixes (single file, ~15 lines changed)

## Verification

1. Start NLM video generation for a lesson
2. Navigate away from the page (close tab or navigate to another page)
3. Reopen/navigate back to the lesson page -> go to Media tab
4. **Expected**: EnrichmentGeneratingCard shows with syncing/progress state
5. Wait for polling to start -> progress updates should appear
6. Also test: switching between lessons within the same page (SPA navigation) still works correctly
7. Run type-check: `pnpm type-check`
8. Run build: `pnpm build`
