# Fix: Performance — Tab/Navigation Lag & Mount Animation Delays (Project-Wide)

## Context

Two UX problems: (1) tabs/navigation cause visible freeze due to `router.replace()` triggering middleware with `supabase.auth.getUser()` network round-trip, (2) Framer Motion mount animations (`initial={{ opacity: 0 }}`) on synchronously loaded content create perceived delays across the entire project.

---

## Part A: Replace `router.replace` with History API (cosmetic URL updates)

### A1. Tab switching — `LessonView.tsx`

**File**: `packages/web/components/course/viewer/components/LessonView.tsx`

- Add `useState` import, create local `activeTab` state initialized from `window.location.search`
- Replace `router.replace(...)` in `handleTabChange` with `setActiveTab()` + `window.history.replaceState()`
- Remove `useRouter`, `useSearchParams` imports (no longer needed; keep `usePathname`)

### A2. Lesson URL sync — `useViewerState.ts`

**File**: `packages/web/components/course/viewer/hooks/useViewerState.ts`

- Remove `useRouter` import and `const router = useRouter()` (line 41)
- Replace `router.replace(...)` (line 244) with `window.history.replaceState()`

### A3. Fix anti-pattern — `courses-content-client.tsx` pagination

**File**: `packages/web/app/[locale]/courses/_components/courses-content-client.tsx`

Lines 51-55 currently do `window.history.pushState(...)` + `window.location.reload()` — full page reload.

Replace with `useRouter` + `router.replace`:

```diff
+ import { useRouter } from 'next/navigation'
  ...
+ const router = useRouter()
  const handlePageChange = (page: number) => {
    const searchParams = new URLSearchParams(window.location.search)
    searchParams.set('page', page.toString())
-   window.history.pushState(null, '', `?${searchParams.toString()}`)
-   window.location.reload()
+   router.replace(`?${searchParams.toString()}`)
  }
```

**Note**: `courses-filters-improved.tsx` and `courses-filters.tsx` keep `router.push` — фильтры нуждаются в server re-fetch (Server Component читает searchParams).

---

## Part B: Remove mount animations on synchronous content

**Pattern**: Replace `motion.div` with `initial/animate` mount animation → plain `div`. Preserve `whileHover` as CSS `hover:-translate-y-*`. Preserve `AnimatePresence` for conditional show/hide and view switching.

### B1. Enrichment cards (курс-вьювер)

**File**: `packages/web/components/course/viewer/components/UnifiedEnrichmentCard.tsx`

Line 567: `<motion.div initial={{ opacity: 0, y: 20 }} whileHover={{ y: -4 }}>` → `<div>` с CSS `hover:-translate-y-1`
Line 816: `</motion.div>` → `</div>`
Inner `AnimatePresence` hover panel (lines 685-805) — оставить.

**File**: `packages/web/components/course/viewer/components/EnrichmentCard.tsx`

Line 456: `<motion.div initial={{ opacity: 0, y: 20 }}>` → `<div>` с CSS `hover:-translate-y-1`
Line 697: `</motion.div>` → `</div>`
Inner `AnimatePresence` play/pause (lines 411-426) — оставить.

### B2. Глобальный хедер

**File**: `packages/web/components/layouts/header.tsx`

Line 22: `<motion.header initial={{ opacity: 0, y: -20 }}>` → `<header>`
Line 115: `</motion.header>` → `</header>`
Если `motion` больше не используется, удалить импорт.

### B3. Create header

**File**: `packages/web/app/[locale]/create/_components/create-header.tsx`

Line 15: `<motion.header>` → `<header>` (аналогично B2)
Line 64: `</motion.header>` → `</header>`
Удалить импорт `motion`.

### B4. Create page — hero section

**File**: `packages/web/app/[locale]/create/page-client.tsx`

5 вложенных `motion.*` (lines 27, 34, 43, 54, 76) → заменить на обычные `div`, `h1`, `p`, `div`, `div`.
Удалить импорт `motion`.

### B5. Landing hero

**File**: `packages/web/components/common/hero-content.tsx`

7 `motion.*` элементов (lines 14, 21, 38, 48, 59, 71, 115) → заменить на `main`, `div`, `h1`, `span`, `p`, `div`, `div`.
Удалить импорт `motion`.

### B6. Lesson content wrapper

**File**: `packages/web/components/common/lesson-content.tsx`

Line 110: `<motion.div key={lesson.id} initial={{ opacity: 0 }}>` → `<div key={lesson.id}>`
Line 260: `</motion.div>` → `</div>`
Удалить импорт `motion`.

### B7. Course grid — staggered cards

**File**: `packages/web/app/[locale]/courses/_components/course-grid.tsx`

Lines 97-120: `AnimatePresence` + `motion.div` с staggered delay → обычный маппинг без обёртки:

```diff
- <AnimatePresence mode="popLayout">
-   {displayedCourses.map((course, index) => (
-     <motion.div key={course.id} initial={{ opacity: 0, y: 20 }} ...>
+   {displayedCourses.map((course) => (
+     <div key={course.id}>
        <CourseCard ... />
-     </motion.div>
+     </div>
    ))}
- </AnimatePresence>
```

Удалить импорт `motion, AnimatePresence`.

### B8. Course card — mount animation

**File**: `packages/web/app/[locale]/courses/_components/course-card.tsx`

Line 507: `<motion.div initial={{ opacity: 0, y: 20 }} whileHover={{ y: -4 }}>` → `<div>` с CSS `hover:-translate-y-1`
Нужно пробросить `onMouseEnter`, `onMouseLeave`, `onClick`, `onKeyDown`, `tabIndex`, `role`, `aria-*` атрибуты на `div`.

Inner motion elements (lines 755-767 — hover menu divider/actions) — оставить, они внутри `AnimatePresence` на hover.

### B9. Lesson grid — staggered cards

**File**: `packages/web/app/[locale]/courses/[orgSlug]/[courseSlug]/lessons/_components/lesson-grid.tsx`

Lines 50-61: `AnimatePresence` + staggered `motion.div` → обычный маппинг:

```diff
- <AnimatePresence mode="popLayout">
-   {lessons.map((lesson, index) => (
-     <motion.div key={lesson.id} initial={{ opacity: 0, y: 20 }} delay={index*0.05} ...>
+   {lessons.map((lesson) => (
+     <div key={lesson.id}>
        <LessonCard ... />
-     </motion.div>
+     </div>
    ))}
- </AnimatePresence>
```

### B10. Lesson card — mount animation

**File**: `packages/web/app/[locale]/courses/[orgSlug]/[courseSlug]/lessons/_components/lesson-card.tsx`

Line 113: `<motion.div initial={{ opacity: 0, y: 20 }} whileHover={{ y: -2 }}>` → `<div>` с CSS `hover:-translate-y-0.5`
Line 229: `</motion.div>` → `</div>`

### B11. Courses content client — all motion wrappers

**File**: `packages/web/app/[locale]/courses/_components/courses-content-client.tsx`

9 `motion.div` обёрток (lines 178, 226, 245, 254, 277, 286, 311, 335, 368) → обычные `div`.

**Исключение**: `AnimatePresence mode="wait"` на lines 243-307 (переключение grid/list view) — оставить внешние `motion.div` для grid/list контейнеров (lines 245 и 277) чтобы сохранить плавный переход между режимами. Убрать только индивидуальные анимации карточек (lines 254-273 и 286-303).

---

## Part C: Secondary fixes

### C1. Wire up `isLoading` skeleton — `EnrichmentsPanel.tsx`

**File**: `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx`

- Line 125: `_isLoading` → `isLoading`
- После `enrichmentsLoadError` return (line 256), добавить skeleton при `isLoading && !enrichments`

### C2. Remove 100ms cached image timeout — `EnrichmentCardImage.tsx`

**File**: `packages/web/components/course/viewer/components/EnrichmentCardImage.tsx`

- Lines 82-86: удалить `setTimeout(checkComplete, 100)` и cleanup, оставить только `checkComplete()`

---

## Files Modified (16 total)

| #   | File                                          | Changes                                            |
| --- | --------------------------------------------- | -------------------------------------------------- |
| 1   | `viewer/components/LessonView.tsx`            | History API for tabs, local useState               |
| 2   | `viewer/hooks/useViewerState.ts`              | History API for lesson URL                         |
| 3   | `courses-content-client.tsx`                  | Fix reload anti-pattern + remove 9 motion wrappers |
| 4   | `viewer/components/UnifiedEnrichmentCard.tsx` | Outer motion.div → div                             |
| 5   | `viewer/components/EnrichmentCard.tsx`        | Outer motion.div → div                             |
| 6   | `components/layouts/header.tsx`               | motion.header → header                             |
| 7   | `create/_components/create-header.tsx`        | motion.header → header                             |
| 8   | `create/page-client.tsx`                      | Remove 5 motion wrappers                           |
| 9   | `components/common/hero-content.tsx`          | Remove 7 motion wrappers                           |
| 10  | `components/common/lesson-content.tsx`        | motion.div → div                                   |
| 11  | `courses/_components/course-grid.tsx`         | Remove AnimatePresence + stagger                   |
| 12  | `courses/_components/course-card.tsx`         | Outer motion.div → div, CSS hover                  |
| 13  | `lessons/_components/lesson-grid.tsx`         | Remove AnimatePresence + stagger                   |
| 14  | `lessons/_components/lesson-card.tsx`         | motion.div → div, CSS hover                        |
| 15  | `viewer/components/EnrichmentsPanel.tsx`      | Activate isLoading skeleton                        |
| 16  | `viewer/components/EnrichmentCardImage.tsx`   | Remove 100ms timeout                               |

---

## Verification

1. **Tab switching**: DevTools Network — no middleware calls on tab click
2. **Lesson navigation**: URL updates instantly, no freeze
3. **Курс-вьювер Media**: Cards appear instantly (no 300ms fade-in)
4. **Страница /courses**: Cards visible immediately, no stagger delay
5. **Страница /create**: Content instant, no 800ms stagger
6. **Глобальный хедер**: Visible on first paint, no fade-in
7. **Пагинация**: No full page reload
8. **Hover effects**: Cards lift on hover via CSS (preserved)
9. **Grid/List toggle**: Smooth transition preserved (AnimatePresence kept)
10. **Type-check**: `pnpm --filter web type-check`
11. **Build**: `pnpm --filter web build`
