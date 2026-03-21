# Fix: Long lesson titles cause horizontal scroll in course viewer

## Context

Long lesson titles (e.g. "Стандарт подготовки, проведения и контроля исполнения решений совещаний: корпоративная методология и практическое применение") cause a horizontal scrollbar to appear in the course viewer, breaking the layout. The issue affects breadcrumbs, focus mode header, and navigation buttons.

## Root Cause

The main content area (`motion.div` with `flex-1`) in the course viewer layout lacks `min-w-0`. In CSS flexbox, flex children default to `min-width: auto` — they won't shrink below their content's intrinsic width. Any long unbroken text inside pushes the entire page wider.

## Changes

### 1. `packages/web/components/course/course-viewer-enhanced.tsx` (line 350)

**Primary fix.** Add `min-w-0` to the main content `motion.div`:

```diff
- className="flex flex-1 flex-col"
+ className="flex min-w-0 flex-1 flex-col"
```

This allows the flex child to shrink below its content size, preventing horizontal overflow.

### 2. `packages/web/components/course/viewer/components/BreadcrumbNav.tsx` (line 46)

Add `min-w-0` to the breadcrumb `<ol>` so items can truncate within available space:

```diff
- <ol className="hidden items-center gap-2 text-sm text-gray-600 md:flex dark:text-gray-400">
+ <ol className="hidden min-w-0 items-center gap-2 text-sm text-gray-600 md:flex dark:text-gray-400">
```

### 3. `packages/web/components/course/viewer/components/LessonView.tsx`

**Focus mode header** (line 140): The `<div>` wrapping title + badge + button needs `min-w-0` and the `<h2>` needs `truncate`:

```diff
- <div className="flex items-center gap-4">
-   <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
+ <div className="flex min-w-0 items-center gap-4">
+   <h2 className="min-w-0 truncate text-lg font-semibold text-gray-800 dark:text-white/90" title={currentLesson.title ?? ''}>
```

**Prev/next navigation buttons** (lines 241-265): Add `max-w-[200px] truncate` to lesson title text:

```diff
- <div className="text-sm font-medium">
+ <div className="max-w-[200px] truncate text-sm font-medium">
    {allLessonsOrdered[currentIndex - 1].title}

- <div className="text-sm font-medium">
+ <div className="max-w-[200px] truncate text-sm font-medium">
    {allLessonsOrdered[currentIndex + 1].title}
```

### 4. `packages/web/components/course/viewer/components/Sidebar.tsx` (line 218, 225)

Add `min-w-0` to inner flex div and `truncate` to section title span:

```diff
- <div className="flex items-center gap-2">
+ <div className="flex min-w-0 items-center gap-2">
    <ChevronRight ... />
    <Layers ... />
-   <span className="text-sm font-semibold text-gray-800 dark:text-white/85">
+   <span className="truncate text-sm font-semibold text-gray-800 dark:text-white/85">
```

## Files Modified

| File                                                                 | Change                                  |
| -------------------------------------------------------------------- | --------------------------------------- |
| `packages/web/components/course/course-viewer-enhanced.tsx`          | Add `min-w-0` to flex-1 content div     |
| `packages/web/components/course/viewer/components/BreadcrumbNav.tsx` | Add `min-w-0` to `<ol>`                 |
| `packages/web/components/course/viewer/components/LessonView.tsx`    | Truncate focus mode title + nav buttons |
| `packages/web/components/course/viewer/components/Sidebar.tsx`       | Truncate section titles                 |

## Verification

1. `pnpm --filter web build` — ensure no build errors
2. Open the course with the long lesson title: `/courses/default-organization/standart-podgotovki-provedeniya-i-kontrolya-ispolneniya-resheniy-soveschaniy?lesson=1.1`
3. Verify: no horizontal scrollbar, breadcrumbs truncated with ellipsis, sidebar section titles truncated, focus mode title truncated
4. Check tooltip on hover shows full title text
