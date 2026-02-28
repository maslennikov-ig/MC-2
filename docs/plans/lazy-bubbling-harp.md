# Plan: Replace MindMapViewer with interactive markmap-view

## Context

The current `MindMapViewer` renders a nested HTML list with indentation — not a real mind map. It lacks proper visualization (no radial branches, no spatial layout), has primitive CSS-transform zoom (50%-200%), and poor UX for large trees. The user wants a proper interactive mind map that opens in a modal dialog, with expand/collapse, zoom/pan, and a classic mind map layout (root centered, branches radiating).

The mind map must be accessible from **both** places:

1. **Lesson materials** (lesson-materials-switcher.tsx — tab "Mind Map")
2. **Media section** (EnrichmentCard.tsx — toggle "View Map")

## Chosen Library: `markmap-view`

**Why markmap-view over alternatives:**

- Classic mind map visual (root centered, branches left/right, curved connections)
- D3-based smooth animations, built-in zoom/pan (scroll + drag)
- Click-to-fold/unfold nodes
- `fit()` method auto-centers the view
- Only `markmap-view` needed (skip `markmap-lib` — we have JSON data, not markdown)
- ~80KB bundle, no conflicts with existing `@xyflow/react`

**Alternatives considered:**

- `@xyflow/react` (React Flow) — already in project but overkill for read-only viewer, needs custom layout engine
- `react-d3-tree` — good tree viz, but org-chart style (top-down/left-right), not classic mind map
- `simple-mind-map` — full-featured but heavy (~300KB+), framework-agnostic wrapper needed

## Data Transform

Our `MindMapNode` → markmap's `IPureNode` (minimal mapping):

```typescript
// Our data: { label, children?, description? }
// markmap expects: { content (HTML string), children?, payload?: { fold? } }

function toMarkmapNode(node: MindMapNode, depth = 0): IPureNode {
  let content = escapeHtml(node.label);
  if (node.description) {
    content += `<br/><small style="opacity:0.7">${escapeHtml(node.description)}</small>`;
  }
  return {
    content,
    children: node.children?.map(c => toMarkmapNode(c, depth + 1)),
    payload: depth > 3 ? { fold: 1 } : undefined, // auto-fold deep nodes
  };
}
```

## Changes

### 1. Install dependency

```bash
pnpm --filter @megacampus/web add markmap-view markmap-common
```

`markmap-common` provides `IPureNode` type for type-safe transform.

### 2. New file: `packages/web/lib/helpers/mindmap-transform.ts`

Pure function `toMarkmapNode()` — transforms `MindMapNode` → `IPureNode`.

- HTML-escapes labels (LLM-generated content → XSS safety)
- Renders description as `<small>` under label
- Auto-folds nodes deeper than level 3

### 3. New file: `packages/web/components/course/viewer/enrichments/MarkmapRenderer.tsx`

Browser-only component (loaded via `next/dynamic` with `ssr: false`):

- `useRef<SVGSVGElement>` + `useEffect` to create/destroy `Markmap` instance
- `Markmap.create(svg, options, data)` on mount, `mm.destroy()` on unmount
- Depth-based branch color palette (light + dark variants)
- Dark mode: uses `useThemeSync()` hook (`packages/web/lib/hooks/use-theme-sync.tsx`) to detect theme and apply appropriate colors
- CSS: `text { fill: currentColor }` so SVG text inherits theme color
- Options: `autoFit: true`, `duration: 300`, `zoom: true`, `pan: true`

### 4. Rewrite: `packages/web/components/course/viewer/enrichments/MindMapViewer.tsx`

**Keep unchanged:**

- Compact preview (nested `MindMapTreeNode` with 2-level depth) — good for card context
- Stats badges (nodeCount, depth)
- Props interface `{ content: MindMapEnrichmentContent }` — same API, no callsite changes needed

**Replace:**

- Dialog content: remove manual zoom controls + CSS-transform tree → use `MarkmapRenderer`
- Dialog size: `max-w-4xl` → `max-w-6xl` (more space for mind map)
- Remove: `ZoomIn`, `ZoomOut`, `RotateCcw` imports, `zoomLevel` state, zoom handlers
- Add: `next/dynamic` import of `MarkmapRenderer`, `useMemo` for transformed data
- Add: interaction hint text at dialog bottom ("Scroll to zoom, drag to pan, click to expand/collapse")

### 5. Callsites — NO changes needed

Both callsites use the same `<MindMapViewer content={...} />` interface:

- **EnrichmentCard.tsx:531** — `{isActive && type === 'nlm_mind_map' && ... <MindMapViewer content={...} />}`
- **lesson-materials-switcher.tsx:400** — `const renderMindMap = () => <MindMapViewer content={...} />`

Props interface is unchanged, dialog is self-contained within MindMapViewer.

### 6. i18n — minor additions

**Files:** `packages/web/messages/{en,ru}/enrichments.json`

Add keys under `viewer.mindMap`:

- `fitToView`: "Fit to view" / "Вписать в экран"
- `interactionHint`: "Scroll to zoom, drag to pan, click nodes to expand/collapse" / "Прокрутка для масштаба, перетаскивание для навигации, клик по узлам для раскрытия"

Existing keys `zoomIn`, `zoomOut`, `zoomReset` — keep (no breakage), just unused now.

## NOT changing

- Data structure (`MindMapEnrichmentContent` in shared-types) — unchanged
- Type guards (`isMindMapContent` in enrichment-type-guards.ts) — unchanged
- Generation options (depth selector: shallow/standard/deep) — unchanged
- Backend enrichment handlers — unchanged
- Database — no migration

## Verification

1. `pnpm --filter @megacampus/web type-check` passes
2. `pnpm --filter @megacampus/web build` passes
3. Open lesson with mind map enrichment on dev:
   - **From Media tab**: click enrichment card → see compact preview → click "View Full Map" → dialog opens with real mind map
   - **From lesson materials**: switch to Mind Map tab → see compact preview → click "View Full Map" → dialog opens
4. In dialog: scroll-zoom works, drag-to-pan works, click node to fold/unfold
5. Toggle dark mode — text readable, branch colors appropriate
6. Open/close dialog multiple times — no memory leaks (check DevTools)
