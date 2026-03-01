# Mind Map: Unify Display + Fix Interactivity

## Context

Mind map enrichment has **два стиля отображения**:

1. **Inline preview** (Lesson Materials tab, EnrichmentCard) — CSS-дерево (`MindMapTreeNode`), maxDepth=2
2. **View Full Map** (Dialog) — SVG markmap через `MarkmapRenderer` (markmap-view@0.18.12)

Пользователь хочет: **один стиль** (markmap SVG) везде. Плюс dialog полностью неинтерактивен — zoom, pan, click не работают.

## Root Cause

| Баг               | Причина                                                                                                                              | Файл                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| Всё раскрыто      | `AUTO_FOLD_DEPTH=3` → `initialExpandLevel:3` раскрывает уровни 0-3, fold только на 4+                                                | `mindmap-transform.ts:8`      |
| Сильно отдалено   | Много раскрытых нод + `autoFit:true` → zoom out, чтобы вместить всё                                                                  | Следствие #1                  |
| Zoom не работает  | SVG `h-full w-full` внутри flex-контейнера Dialog — CSS `height:100%` не резолвится от flex-computed height → SVG имеет 0 event area | `MarkmapRenderer.tsx:119-125` |
| Клики не работают | Та же причина — D3 zoom/click handlers привязаны к SVG, 0-height SVG не получает pointer events                                      | `MarkmapRenderer.tsx:119-125` |
| Два стиля         | `MindMapViewer` показывает CSS-tree preview + кнопку "View Full Map" для Dialog                                                      | `MindMapViewer.tsx:78-157`    |

## Plan

### Task 1: Fix fold depth — `mindmap-transform.ts`

**File:** `packages/web/lib/helpers/mindmap-transform.ts`

```diff
- export const AUTO_FOLD_DEPTH = 3
+ export const AUTO_FOLD_DEPTH = 1
```

Эффект: `initialExpandLevel:1` раскрывает root + level 1. `payload.fold:1` на depth>1 сворачивает level 2+. Меньше нод видно → `autoFit` не zoom out так сильно.

### Task 2: Fix SVG sizing + interactivity — `MarkmapRenderer.tsx`

**File:** `packages/web/components/course/viewer/enrichments/MarkmapRenderer.tsx`

1. Добавить `className` prop для контейнера (разная высота inline vs dialog)
2. SVG: `absolute inset-0` вместо `h-full w-full` (надёжное позиционирование)
3. Добавить `touchAction: 'none'` на SVG (touch events для мобильных)
4. Добавить `onWheel` stopPropagation (предотвратить scroll dialog при zoom)
5. Not-mounted skeleton: использовать `className` вместо hardcoded `min-h-[60vh]`
6. Добавить import `cn` from `@/lib/utils`

```tsx
// Interface
interface MarkmapRendererProps {
  data: IPureNode
  fitToViewLabel?: string
  className?: string
}

// Not-mounted branch
if (!mounted) {
  return (
    <div className={cn('flex items-center justify-center', className ?? 'min-h-[60vh]')}>
      <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
    </div>
  )
}

// Mounted JSX
<div className={cn('relative', className)}>
  <svg
    ref={svgRef}
    className="absolute inset-0 h-full w-full"
    style={{ color: isDark ? '#e2e8f0' : '#1e293b', touchAction: 'none' }}
    onWheel={(e) => e.stopPropagation()}
  />
  {fitToViewLabel && <Button .../>}
</div>
```

### Task 3: Unify display — `MindMapViewer.tsx`

**File:** `packages/web/components/course/viewer/enrichments/MindMapViewer.tsx`

**Удалить:**

- `MindMapTreeNode` component (lines 78-157)
- `DEPTH_COLORS` array, `getDepthColor`, `MindMapTreeNodeProps` (lines 34-72)
- Import `ChevronRight` из lucide-react
- `topLevelChildrenCount` variable

**Заменить inline preview:**

```tsx
{
  /* Было: CSS tree + previewHint */
}
{
  /* Стало: Inline markmap */
}
<div className="overflow-hidden rounded-lg border border-sky-200 bg-sky-50/50 dark:border-sky-800/30 dark:bg-sky-900/10">
  <MarkmapRenderer data={markmapData} className="h-[280px]" />
</div>;
```

**Fix dialog container:**

```diff
- <div className="min-h-[60vh] flex-1">
+ <div className="relative h-[60vh] shrink-0">
    {isDialogOpen && (
      <MarkmapRenderer
        data={markmapData}
        fitToViewLabel={t('viewer.mindMap.fitToView')}
+       className="h-full"
      />
    )}
  </div>
```

**Fix loading skeleton:**

```diff
  const MarkmapRenderer = dynamic(() => import('./MarkmapRenderer'), {
    ssr: false,
    loading: () => (
-     <div className="flex min-h-[60vh] items-center justify-center">
+     <div className="flex min-h-[280px] items-center justify-center">
```

**Сохранить:** Dialog, stats badges, "View Full Map" button, DialogHeader/Footer.

### Файлы БЕЗ изменений

- `EnrichmentCard.tsx` — рендерит `<MindMapViewer>`, работает автоматически
- `lesson-materials-switcher.tsx` — рендерит `<MindMapViewer>`, работает автоматически
- i18n JSON — неиспользуемые ключи (`previewHint`, `expand`, `collapse`) можно удалить позже

## Verification

```bash
# 1. Type-check
pnpm --filter web type-check

# 2. Build
pnpm --filter web build

# 3. Visual testing — open course viewer with mind map enrichment
# - Lesson Materials tab: should show markmap SVG (not CSS tree)
# - EnrichmentCard "View Map": should show markmap SVG (not CSS tree)
# - "View Full Map" dialog: nodes collapsed (only root+level1), zoom works, click to expand works
# - Both inline and dialog: dark mode theme switch works

# 4. Check for regressions
pnpm --filter web test
```

## Beads

Create issue `mind-map-unify-fix` with tasks for each file change.
