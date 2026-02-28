---
report_type: code-review
generated: 2026-02-28T00:00:00Z
version: 2026-02-28
status: partial
agent: code-reviewer
files_reviewed: 16
issues_found: 13
critical_count: 0
high_count: 4
medium_count: 6
low_count: 3
---

# Code Review Report: Performance Fixes (2026-02-28)

**Generated**: 2026-02-28
**Status**: PARTIAL — no blocking issues; 4 high-priority items should be addressed before or shortly after merge
**Files Reviewed**: 16
**Issues Found**: 13 (0 critical, 4 high, 6 medium, 3 low)

**Context7 validation**: Next.js App Router docs confirm `window.history.replaceState` is the officially documented pattern for cosmetic URL-only updates. Framer Motion / Motion docs confirm that direct children of `AnimatePresence` must be `motion` components.

---

## Executive Summary

The three-part refactor achieves its stated goals. Navigation lag from `router.replace()` is correctly eliminated by switching to `window.history.replaceState()` for cosmetic URL updates. Mount animations on synchronously loaded content are correctly removed; hover panels and view-switch transitions correctly retain `AnimatePresence + motion.div`. The `isLoading` skeleton and removal of the 100ms `setTimeout` are both straightforward and correct.

No regressions were found in accessibility attributes (`tabIndex`, `role`, `aria-*`, `onKeyDown`). No critical bugs were found. The issues below are architectural edge-cases and consistency gaps, not show-stoppers.

---

## Bugs Found

### HIGH-1 — Duplicate `transition-*` classes cause CSS specificity fight on EnrichmentCard and UnifiedEnrichmentCard

**Severity**: HIGH
**Files**:

- `/home/me/code/mc2/packages/web/components/course/viewer/components/EnrichmentCard.tsx` lines 458-463
- `/home/me/code/mc2/packages/web/components/course/viewer/components/UnifiedEnrichmentCard.tsx` lines 572-577

**Description**: The outer card `div` in both files now has two separate `transition-*` utility classes in the same `cn()` call:

```tsx
// EnrichmentCard.tsx lines 458-463
className={cn(
  'group relative overflow-hidden rounded-2xl',
  'flex min-h-[480px] flex-col transition-shadow duration-300',   // <-- transition-shadow
  'border border-gray-200 bg-white shadow-md hover:shadow-xl',
  'dark:border-slate-800 dark:bg-slate-900 dark:shadow-lg dark:hover:shadow-2xl',
  'transition-transform hover:-translate-y-1'                     // <-- transition-transform
)}
```

In Tailwind CSS, `transition-shadow` expands to `transition-property: box-shadow` and `transition-transform` expands to `transition-property: transform`. When both appear on the same element, whichever class appears last in the stylesheet (determined by Tailwind's generated order, not the source order in `cn()`) wins, and the other transition is silently dropped.

**Observed risk**: On most users' browsers the shadow hover effect (`hover:shadow-xl`) will not animate — it will snap instantaneously — because `transition-shadow` is overridden by `transition-transform` (or vice versa, depending on Tailwind build order).

**Recommended fix**: Merge into a single `transition-[box-shadow,transform]` or use `transition-all` (which covers all animatable properties):

```tsx
// Option A — explicit multi-property (preferred, avoids animating unintended properties)
'flex min-h-[480px] flex-col transition-[box-shadow,transform] duration-300',

// Option B — simple (fine here since no unintended animated properties)
'flex min-h-[480px] flex-col transition-all duration-300',
```

The same fix applies identically to both `EnrichmentCard.tsx` and `UnifiedEnrichmentCard.tsx`.

---

### HIGH-2 — Same CSS transition conflict in CourseCard (grid view variant)

**Severity**: HIGH
**File**: `/home/me/code/mc2/packages/web/app/[locale]/courses/_components/course-card.tsx` lines 521-528

```tsx
className={cn(
  'group relative cursor-pointer overflow-hidden rounded-2xl',
  'flex min-h-[480px] flex-col transition-shadow duration-300',   // <-- transition-shadow
  'border border-gray-200 bg-white shadow-md hover:shadow-xl',
  'dark:border-slate-800 dark:bg-slate-900 dark:shadow-lg dark:hover:shadow-2xl',
  'focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:outline-none',
  'transition-transform hover:-translate-y-1',                     // <-- transition-transform
  isDeleting && 'opacity-50'
)}
```

Same root cause as HIGH-1. The card has `AnimatePresence + motion.div` for its hover panel (correctly kept), and the outer card itself gains a CSS translate-on-hover. Both shadow and transform transitions will not reliably coexist with the current two separate `transition-*` classes.

**Recommended fix**: Same as HIGH-1 — replace the two separate transition utilities with `transition-[box-shadow,transform] duration-300`.

---

### HIGH-3 — LessonCard CSS transition conflict (`transition-all` already present, `transition-transform` added redundantly)

**Severity**: HIGH
**File**: `/home/me/code/mc2/packages/web/app/[locale]/courses/[orgSlug]/[courseSlug]/lessons/_components/lesson-card.tsx` lines 115-122

```tsx
className={cn(
  'group relative cursor-pointer overflow-hidden rounded-xl',
  'flex min-h-[280px] flex-col transition-all duration-300',  // <-- transition-all
  'border border-gray-200 bg-white shadow-sm hover:shadow-md',
  'dark:border-slate-800 dark:bg-slate-900 dark:shadow-lg dark:hover:shadow-xl',
  'hover:border-purple-300/60 dark:hover:border-purple-600/40',
  'focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:outline-none',
  'transition-transform hover:-translate-y-0.5',             // <-- transition-transform added
  className
)}
```

`transition-all` already covers `transform`. Adding `transition-transform` as a separate class is redundant and creates the same Tailwind overriding behaviour. In this specific case `transition-all` is the more permissive class (covers everything) so the `transition-transform` addition is strictly redundant rather than harmful — but it adds noise and could cause confusion when the file is edited next.

**Recommended fix**: Remove the separately added `'transition-transform hover:-translate-y-0.5'` line and instead add `hover:-translate-y-0.5` directly to the first transition line, e.g.:

```tsx
'flex min-h-[280px] flex-col transition-all duration-300 hover:-translate-y-0.5',
```

---

### HIGH-4 — `window.location.href` navigation used instead of Next.js router in `CoursesContentClient` empty state

**Severity**: HIGH
**File**: `/home/me/code/mc2/packages/web/app/[locale]/courses/_components/courses-content-client.tsx` line 290

```tsx
<Button
  onClick={() => (window.location.href = '/create')}
  ...
>
  Создать курс
</Button>
```

This causes a full page reload, bypassing Next.js's client-side navigation entirely. This defeats the purpose of the App Router and triggers a round-trip to the server. This is architecturally inconsistent with `CourseGrid`'s equivalent empty-state button (line 138) which correctly uses `router.push('/create')`.

Additionally, the URL `/create` is not locale-prefixed. On a Russian locale the correct path would be `/ru/create`. The `CourseGrid` equivalent also has this issue, but it is a pre-existing problem. The new button in `CoursesContentClient` should at minimum use the router.

**Recommended fix**:

```tsx
// Add router to component (already imported via useRouter at line 49)
<Button
  onClick={() => router.push('/create')}
  ...
>
  Создать курс
</Button>
```

For proper i18n, use `useRouter` from `@/src/i18n/navigation` instead of `next/navigation` if locale-aware routing is required.

---

## Improvements Suggested

### MEDIUM-1 — `handleTabChange` in LessonView reads `window.location.search` bare (safe but fragile)

**Severity**: MEDIUM
**File**: `/home/me/code/mc2/packages/web/components/course/viewer/components/LessonView.tsx` lines 122-124

```tsx
const handleTabChange = (nextTab: string) => {
  ...
  const params = new URLSearchParams(window.location.search)  // bare window access
  params.set('tab', normalizedTab)
  window.history.replaceState(null, '', `${pathname}?${params.toString()}`)
}
```

This is technically safe because `handleTabChange` is only called from a click handler (never during SSR or render). However, reading `window.location.search` directly means the params are derived from the live URL rather than from React's `useSearchParams()`. If another piece of code updates the URL between render and click (e.g., the `useViewerState` lesson sync in `useViewerState.ts`), a race condition could cause the tab param to overwrite a newly written lesson param because it read a stale `window.location.search`.

**Recommended fix**: Import `useSearchParams` from `next/navigation` and use it as the source of truth, the same way `useViewerState.ts` uses `usePathname`:

```tsx
import { usePathname, useSearchParams } from 'next/navigation'

const searchParams = useSearchParams()

const handleTabChange = (nextTab: string) => {
  ...
  const params = new URLSearchParams(searchParams.toString())
  params.set('tab', normalizedTab)
  window.history.replaceState(null, '', `${pathname}?${params.toString()}`)
}
```

This is exactly the pattern shown in the official Next.js App Router shallow routing documentation (SPA guide, `window.history.pushState` example).

---

### MEDIUM-2 — `useViewerState` reads `window.location.search` inside `useEffect` — pattern is correct but inconsistent with the rest of the codebase

**Severity**: MEDIUM
**File**: `/home/me/code/mc2/packages/web/components/course/viewer/hooks/useViewerState.ts` lines 241-243

The `useEffect` at line 230 correctly runs only in the browser (effects never run on the server), so `window.location.search` is SSR-safe. However, like MEDIUM-1, reading `window.location.search` directly inside a `useEffect` rather than using `useSearchParams()` can introduce stale-read issues if two effects race to update the URL.

**Recommended fix**: Use `useSearchParams()` from `next/navigation` as the source of truth when constructing the new params, consistent with the Next.js documentation examples:

```tsx
const searchParams = useSearchParams(); // add to hook

// In the useEffect:
const params = new URLSearchParams(searchParams.toString());
params.set('lesson', label);
window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
```

Note: `useSearchParams` must be added to the dependency array of the `useEffect` when used this way.

---

### MEDIUM-3 — `handlePageChange` in `CoursesContentClient` reads `window.location.search` then immediately calls `router.replace()`

**Severity**: MEDIUM
**File**: `/home/me/code/mc2/packages/web/app/[locale]/courses/_components/courses-content-client.tsx` lines 53-57

```tsx
const handlePageChange = (page: number) => {
  const searchParams = new URLSearchParams(window.location.search);
  searchParams.set('page', page.toString());
  router.replace(`?${searchParams.toString()}`);
};
```

This mixes two approaches: it reads from the live DOM URL (`window.location.search`) for parameter preservation, then pushes through `router.replace()` for navigation. While functional, the comment in the PR description says the goal was to _replace_ `router.replace()` with `window.history.replaceState()` for pagination to avoid full re-renders. The current code still calls `router.replace()`, which will trigger a Next.js navigation cycle (RSC re-render, scroll restoration, etc.) — partially defeating the stated goal.

If the intent was to avoid the navigation overhead, replace the body with the pure `window.history` approach:

```tsx
const handlePageChange = (page: number) => {
  const params = new URLSearchParams(window.location.search);
  params.set('page', page.toString());
  window.history.replaceState(null, '', `?${params.toString()}`);
  // Then trigger a data reload without full navigation, e.g. via a state setter
};
```

If server-driven pagination is required (data comes from RSC), then `router.replace()` is correct and the `window.location.search` read should be replaced with `useSearchParams().toString()` for consistency.

**The current code is not broken** but is inconsistent with stated intent. Clarify which approach is wanted.

---

### MEDIUM-4 — `CoursesContentClient` imports `motion` and `AnimatePresence` but the `motion` import is used for the grid/list switcher — verify this is intentional

**Severity**: MEDIUM
**File**: `/home/me/code/mc2/packages/web/app/[locale]/courses/_components/courses-content-client.tsx` lines 8, 238-278

The view-mode switcher (grid vs list) wraps each layout in a `motion.div` inside `AnimatePresence`. This is correct usage — `AnimatePresence` wraps `motion.div` children with unique `key` props, enabling exit animations. This is one of the explicitly preserved use cases.

However, the grid itself wraps each `CourseCard` in a plain `<div key={course.id}>`:

```tsx
<motion.div key="grid" ...>
  {coursesData.courses.map((course) => (
    <div key={course.id}>           {/* plain div — correct, not inside AnimatePresence */}
      <CourseCard ... />
    </div>
  ))}
</motion.div>
```

The plain `div` wrapping each card is NOT inside an `AnimatePresence` (the `AnimatePresence` is the outer switcher, not per-card). This is structurally correct. No bug here — raised to confirm the intent matches the implementation, because the redundant wrapper `div` around each card (rather than placing `key` directly on `CourseCard`) reduces clarity without benefit.

**Suggested improvement**: Pass `key` directly to `CourseCard` and eliminate the wrapper `div`:

```tsx
{coursesData.courses.map((course) => (
  <CourseCard
    key={course.id}
    course={course}
    ...
  />
))}
```

This is purely cosmetic but removes one DOM level per card.

---

### MEDIUM-5 — `LessonGrid` wraps each `LessonCard` in a plain `div` — same unnecessary wrapper pattern

**Severity**: MEDIUM
**File**: `/home/me/code/mc2/packages/web/app/[locale]/courses/[orgSlug]/[courseSlug]/lessons/_components/lesson-grid.tsx` lines 52-69

```tsx
<div key={lesson.id}>
  <LessonCard ... />
</div>
```

Same observation as MEDIUM-4. The `key` should live on the outermost rendered element. Since the cards are not inside an `AnimatePresence`, there is no reason for a wrapping `div`.

**Suggested improvement**:

```tsx
<LessonCard key={lesson.id} ... />
```

---

### MEDIUM-6 — `CourseGrid` and `CoursesContentClient` wrap each `CourseCard` in a plain `div` for no reason — consistency gap

**Severity**: MEDIUM
**Files**:

- `/home/me/code/mc2/packages/web/app/[locale]/courses/_components/course-grid.tsx` lines 96-106
- `/home/me/code/mc2/packages/web/app/[locale]/courses/_components/courses-content-client.tsx` lines 246-255, 266-275

Both files have the same `<div key={...}><Card /></div>` pattern. In `courses-content-client.tsx` the wrapper `div` is inside a `motion.div`, which itself is inside `AnimatePresence`. The card is NOT a direct child of `AnimatePresence`, so the wrapper `div` does not help with Framer Motion's exit tracking either. The wrapper is genuinely unused.

---

## Low Priority

### LOW-1 — `EnrichmentCardImage` 100ms `setTimeout` removal could affect cached-image detection

**Severity**: LOW
**File**: `/home/me/code/mc2/packages/web/components/course/viewer/components/EnrichmentCardImage.tsx` lines 68-83

The `setTimeout` was removed. The current `useEffect` calls `checkComplete()` synchronously and then stops. The removed `setTimeout` was acting as a fallback for the case where the browser's `complete` flag is set slightly after the element mounts. In `course-card.tsx` line 230, the equivalent `useEffect` still retains its `setTimeout(checkComplete, 100)` fallback. This inconsistency means `EnrichmentCardImage` may occasionally miss the "image already cached" detection, keeping the skeleton visible for an extra render cycle on cached images.

This is unlikely to be user-visible in practice (the `onLoad` event will fire shortly after), but the pattern divergence from `CourseCard`'s image handling could cause confusion.

---

### LOW-2 — `EnrichmentsPanel` loading skeleton condition is `isLoading && !enrichments`

**Severity**: LOW
**File**: `/home/me/code/mc2/packages/web/components/course/viewer/components/EnrichmentsPanel.tsx` lines 258-272

```tsx
if (isLoading && !enrichments) {
  return <skeleton />;
}
```

This is correct for the initial load (no data yet). However on a refetch (e.g., after `onRefreshEnrichments` triggers), `enrichments` will be non-null (stale data is present) and `isLoading` will be true — so the skeleton will not show, which is the correct behaviour (show stale data rather than a flash of skeleton). This is fine. Documenting here because the condition is subtle and worth a comment in code for future maintainers.

**Suggested**: Add a brief inline comment:

```tsx
// Only show skeleton on initial load; during refetch we show stale data
if (isLoading && !enrichments) {
```

---

### LOW-3 — `header.tsx` fragment wrapper is unnecessary

**Severity**: LOW
**File**: `/home/me/code/mc2/packages/web/components/layouts/header.tsx` lines 21-114

The `Header` component's return value is wrapped in `<>...</>` (a React fragment) with a single child `<header>`. This adds no value — the fragment can be removed:

```tsx
// Current
return (
  <>
    <header ...>
      ...
    </header>
  </>
)

// Simplified
return (
  <header ...>
    ...
  </header>
)
```

---

## Files OK

The following files passed all review criteria with no issues noted:

| File                                                | Notes                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LessonView.tsx` (lines 1-130)                      | `window.history.replaceState` usage is correct. `useState` initializer guards `typeof window === 'undefined'` correctly. No unused imports. `motion` and `AnimatePresence` imports are still used for content within this file (not shown in the reviewed range but confirmed present).                 |
| `useViewerState.ts` (lines 238-250)                 | `window` access is inside `useEffect` — SSR-safe. Dedup guard (`lastSyncedLabelRef`) correctly prevents loops.                                                                                                                                                                                          |
| `create-header.tsx`                                 | No motion imports. Plain `<header>` with correct `role="navigation"` and `aria-label`. Accessibility preserved.                                                                                                                                                                                         |
| `page-client.tsx`                                   | No motion imports. Static layout component, no interactivity changes. Clean.                                                                                                                                                                                                                            |
| `hero-content.tsx`                                  | No motion imports. Accessibility preserved (`hover:scale-105` on links via CSS is fine). No SSR issues.                                                                                                                                                                                                 |
| `lesson-content.tsx` (lines 1-10, 108-115, 258-263) | No motion imports. Plain `div` wrappers are appropriate — content is synchronously rendered.                                                                                                                                                                                                            |
| `EnrichmentCard.tsx` — AnimatePresence usage        | The audio player button inside `AnimatePresence` at line 411-426 correctly uses `motion.div` as the direct `AnimatePresence` child with a `key` prop. This is correct and was preserved.                                                                                                                |
| `UnifiedEnrichmentCard.tsx` — AnimatePresence usage | The hover reveal panel at lines 682-802 correctly uses `motion.div` as the direct `AnimatePresence` child. Inner `motion.h3`, `motion.p`, `motion.div` elements are appropriate for staggered sub-animations.                                                                                           |
| `course-card.tsx` — AnimatePresence usage           | The hover reveal panel at lines 631-874 correctly uses `motion.div` as the direct `AnimatePresence` child. Plain `div` outer card is not inside `AnimatePresence`. Accessibility attributes (`tabIndex`, `role`, `aria-labelledby`, `aria-describedby`, `onKeyDown`, `focus:ring-*`) are all preserved. |
| `lesson-card.tsx`                                   | Accessibility attributes (`tabIndex=0`, `role="article"`, `aria-labelledby`, `onKeyDown`) all preserved. No motion imports.                                                                                                                                                                             |
| `EnrichmentsPanel.tsx`                              | `isLoading` prop is now wired to skeleton (correctly). No unused imports.                                                                                                                                                                                                                               |
| `EnrichmentCardImage.tsx`                           | No motion imports. SSR-safe (all `window` access inside effects or callbacks).                                                                                                                                                                                                                          |

---

## Context7 Validation Summary

**Next.js App Router — `window.history.replaceState`**: CONFIRMED CORRECT PATTERN

The Next.js App Router documentation explicitly demonstrates `window.history.replaceState` as the recommended approach for cosmetic URL-only updates (locale switcher example, SPA shallow routing guide). It is documented to integrate with `usePathname` and `useSearchParams` hooks, which is exactly how it is used here. `router.replace()` triggers a full navigation cycle including RSC re-renders and is not appropriate for cosmetic-only updates.

**Framer Motion — `AnimatePresence` children requirement**: CONFIRMED CORRECT USAGE

Framer Motion documentation states: "AnimatePresence works by detecting when its **direct children** are removed from the React tree. Any `motion` components within the exiting component will fire animations defined on their `exit` props." All `AnimatePresence` usages in the reviewed files correctly use `motion.div` (not plain `div`) as direct children. Plain `div` wrappers used elsewhere in these files are not inside `AnimatePresence`.

---

## Recommended Action Plan

**Before merge (should fix):**

1. Fix duplicate `transition-shadow` + `transition-transform` conflict in `EnrichmentCard.tsx` and `UnifiedEnrichmentCard.tsx` (HIGH-1)
2. Fix same conflict in `CourseCard.tsx` grid-view variant (HIGH-2)
3. Remove redundant `transition-transform` addition from `LessonCard.tsx` where `transition-all` already exists (HIGH-3)
4. Replace `window.location.href = '/create'` with `router.push('/create')` in `CoursesContentClient` empty state (HIGH-4)

**Shortly after merge (should fix):** 5. Use `useSearchParams()` as source of truth in `handleTabChange` (MEDIUM-1) and `useViewerState` URL sync effect (MEDIUM-2) 6. Clarify and unify the `handlePageChange` approach in `CoursesContentClient` — either pure `window.history` or pure `router.replace`, not both (MEDIUM-3)

**Backlog (nice to have):** 7. Remove redundant `div` wrappers around list-rendered cards in `CourseGrid`, `LessonGrid`, and `CoursesContentClient` (MEDIUM-4/5/6) 8. Add comment to `EnrichmentsPanel` loading condition (LOW-2) 9. Remove unnecessary React fragment in `header.tsx` (LOW-3)

---

## Artifacts

- This report: `/home/me/code/mc2/docs/reports/code-review/2026-02/performance-fixes-review.md`
