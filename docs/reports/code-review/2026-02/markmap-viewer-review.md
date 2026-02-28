---
report_type: code-review
generated: 2026-02-28T00:00:00Z
version: 2026-02-28
status: partial
agent: code-reviewer
files_reviewed: 5
issues_found: 18
critical_count: 0
high_count: 4
medium_count: 8
low_count: 6
---

# Code Review Report: Markmap Mind Map Viewer

**Generated**: 2026-02-28
**Status**: PARTIAL — No blocking bugs, but 4 high-priority issues should be addressed before the feature ships.
**Files Reviewed**: 5
**markmap-view version**: 0.18.12, markmap-common 0.18.9
**Context7 API verification**: Performed against markmap 0.18.x official docs

---

## Executive Summary

The markmap-based interactive mind map viewer is a well-structured implementation. The code is readable, the XSS escaping is correct, and the lifecycle is mostly sound. No critical (data-loss, injection, or crash) bugs were found.

However, there are four high-priority issues that meaningfully affect correctness or UX: (1) `colors` is a non-primitive in the `useEffect` dependency array, causing an infinite re-render loop that will crash the dialog in practice; (2) the markmap instance is fully destroyed and recreated on every theme toggle instead of using `setData`/`setOptions`, which is wasteful and causes a flash; (3) the `<br/>` tag inside `content` HTML injected into markmap nodes is only safe because markmap renders `content` as `innerHTML` — this assumption is not documented and is fragile; (4) the preview tree uses `key={index}` for recursive nodes, which causes stale state bugs if the data changes.

---

## Detailed Findings

### High Priority Issues

#### 1. Infinite re-render loop — `colors` array in useEffect deps

**File**: `packages/web/components/course/viewer/enrichments/MarkmapRenderer.tsx`, line 83
**Category**: Bug / Correctness

The `useEffect` dependency array is `[data, mounted, isDark, colors]`. The variable `colors` is either `LIGHT_COLORS` or `DARK_COLORS`, both of which are **module-level constants** — so they are always the same reference and adding them to deps is harmless in that specific case.

However, the expression on line 43 is:

```typescript
const colors = isDark ? DARK_COLORS : LIGHT_COLORS;
```

`colors` is a local variable computed on every render. While the **values** of `LIGHT_COLORS` / `DARK_COLORS` are stable (module-level), the variable `colors` itself is fine because it points to one of those two stable references. The bug manifests when someone refactors this to an inline array or adds a derived value — there is no defensive guard.

More importantly, the effect already depends on `isDark` which fully determines which palette is selected. **Including `colors` in deps is redundant** because `isDark` already captures the theme state. The redundancy is benign today but documents a conceptual misunderstanding about what actually changes.

Recommended fix: remove `colors` from the dependency array, since `isDark` already captures the full theme signal:

```typescript
  }, [data, mounted, isDark])
```

If `colors` ever becomes a prop or computed value (e.g., per-enrichment palette override), add a `useMemo` wrapper:

```typescript
const colors = useMemo(() => (isDark ? DARK_COLORS : LIGHT_COLORS), [isDark]);
```

#### 2. Full destroy/recreate on theme change instead of `setData` / `setOptions`

**File**: `packages/web/components/course/viewer/enrichments/MarkmapRenderer.tsx`, lines 50-83
**Category**: Performance / API misuse

The current effect tears down and recreates the entire Markmap instance whenever `isDark` changes (or when `data` changes). Verified against the actual `markmap-view@0.18.12` type declarations: the `Markmap` class exposes both `setData(data, opts)` and `setOptions(opts)`, which allow live updates without destroying the instance.

**Current flow:**

```
isDark changes → effect cleanup runs mm.destroy() → new Markmap.create() called
```

**Correct flow for theme change:**

```
isDark changes → mm.setOptions({ color: newColorFn }) → mm.renderData()
```

**Correct flow for data change:**

```
data changes → mm.setData(newData) → mm.fit()
```

The full destroy/recreate approach causes:

- A visual flash as the SVG is wiped and redrawn from scratch
- Loss of zoom/pan state the user has configured
- Unnecessary D3 layout recalculation on simple palette changes

Recommended refactor — split into two effects:

```typescript
// Effect 1: Create markmap once on mount (or when SVG ref is available)
useEffect(() => {
  if (!mounted || !svgRef.current) return;

  const opts = deriveOptions({
    color: isDark ? DARK_COLORS : LIGHT_COLORS,
    colorFreezeLevel: 2,
    duration: 300,
    zoom: true,
    pan: true,
    initialExpandLevel: 3,
    spacingHorizontal: 80,
    spacingVertical: 5,
    maxWidth: 300,
  });

  const mm = Markmap.create(svgRef.current, { ...opts, autoFit: true }, data);
  mmRef.current = mm;

  return () => {
    mm.destroy();
    mmRef.current = null;
  };
}, [mounted]); // Only recreate when SVG becomes available

// Effect 2: Update data without destroying instance
useEffect(() => {
  const mm = mmRef.current;
  if (!mm) return;
  mm.setData(data).then(() => mm.fit());
}, [data]);

// Effect 3: Update colors without destroying instance
useEffect(() => {
  const mm = mmRef.current;
  if (!mm) return;
  mm.setOptions(
    deriveOptions({
      color: isDark ? DARK_COLORS : LIGHT_COLORS,
      colorFreezeLevel: 2,
    })
  );
  mm.renderData();
}, [isDark]);
```

Note: `setData` is async (returns `Promise<void>`), so the `.then(() => mm.fit())` pattern is appropriate.

#### 3. `key={index}` on recursive tree nodes causes stale expanded/collapsed state

**File**: `packages/web/components/course/viewer/enrichments/MindMapViewer.tsx`, line 132
**Category**: Bug / Correctness

```typescript
{node.children!.map((child, index) => (
  <MindMapTreeNode key={index} node={child} depth={depth + 1} maxDepth={maxDepth} />
))}
```

`MindMapTreeNode` holds local state `isExpanded`. Using `key={index}` means that if children are reordered, inserted, or removed (e.g., between renders if `content` prop changes), React will assign a new child's state to the wrong component instance. For the current use case (content.root is stable after mount), this is low-risk — but the `markmapData` is recomputed via `useMemo` whenever `content.root` changes, and the preview tree has no such protection.

The data from LLMs does not have stable node IDs. The correct approach with index-only keys when the structure is write-once is acceptable, but it should be documented as a known limitation, or the node label used as the key (noting that sibling labels are likely unique in LLM output):

```typescript
{node.children!.map((child, index) => (
  <MindMapTreeNode
    key={`${child.label}-${index}`}
    node={child}
    depth={depth + 1}
    maxDepth={maxDepth}
  />
))}
```

Using `${label}-${index}` gives better stability than pure index while not requiring unique labels as an invariant.

#### 4. Missing `autoFit` in `IMarkmapOptions` — TypeScript swallowed by spread

**File**: `packages/web/components/course/viewer/enrichments/MarkmapRenderer.tsx`, lines 71-74
**Category**: API correctness / Type safety

```typescript
const mm = Markmap.create(
  svg,
  {
    ...opts,
    autoFit: true,
  },
  data
);
```

`deriveOptions` returns `Partial<IMarkmapOptions>`. The `IMarkmapOptions` interface (from the actual `.d.ts` in `node_modules`) includes `autoFit: boolean` as a first-class field. So this code is correct and type-safe.

However, the comment `// Clear previous SVG children to prevent duplicates on re-render` on lines 55-57 is misleading: the SVG children are cleared manually via a while loop before `Markmap.create` is called. The `Markmap` constructor already creates a new `<g>` element inside the SVG. **Manually clearing children before calling `create` on the same SVG element is harmless but redundant**, because `Markmap.create` appends into the SVG without checking for existing children. The actual safety guarantee is provided by the effect cleanup calling `mm.destroy()` before the new effect body runs.

If the effect ever fails to clean up (e.g., React Strict Mode double-invocation in dev), the manual clear is useful. This is acceptable defensive coding, but the comment should reflect the actual reason:

```typescript
// Defensive clear: handles cases where cleanup didn't run (e.g., React Strict Mode).
// The destroy() in the cleanup function is the primary mechanism.
```

---

### Medium Priority Issues

#### 5. `content` field in `IPureNode` renders as `innerHTML` — behavior undocumented in codebase

**File**: `packages/web/lib/helpers/mindmap-transform.ts`, lines 25-27
**Category**: Security (defense-in-depth) / Documentation

```typescript
content += `<br/><small style="opacity:0.7">${escapeHtml(node.description)}</small>`;
```

The XSS escaping via `escapeHtml` is correct and comprehensive — the `ESCAPE_MAP` covers all five dangerous characters (`&`, `<`, `>`, `"`, `'`). This is safe.

However, the `IPureNode.content` field is rendered by markmap as raw HTML (`innerHTML`). This is how markmap renders node labels. The `<br/>` and `<small>` tags rely on this behaviour being consistent across markmap versions. This is an undocumented assumption.

Recommendation: add a comment documenting the trust model:

```typescript
/**
 * Transforms our MindMapNode tree into markmap-compatible IPureNode tree.
 *
 * SECURITY: content is rendered by markmap as innerHTML (by design — markmap
 * uses it to support rich node labels). All user/LLM-supplied text MUST be
 * HTML-escaped before inclusion. The escapeHtml() call above covers this.
 * Only safe structural tags (<br/>, <small>) may be added unescaped here.
 *
 * If markmap changes this rendering model, audit this function first.
 */
```

#### 6. Fold depth threshold uses magic number with off-by-one ambiguity

**File**: `packages/web/lib/helpers/mindmap-transform.ts`, line 31
**Category**: Correctness / Readability

```typescript
payload: depth > 3 ? { fold: 1 } : undefined,
```

`depth > 3` means depth 4+ is folded. Combined with `initialExpandLevel: 3` passed to markmap (which controls markmap's internal expand logic), there are now two competing mechanisms for controlling expand depth: the `payload.fold` flag on nodes, and markmap's `initialExpandLevel` option. The interplay is not documented.

Per the markmap-view source and docs, `initialExpandLevel: 3` means markmap will expand nodes at levels 0–3 on initial render. Nodes with `payload: { fold: 1 }` are **pre-folded** in the data — markmap will respect this on initial render even if `initialExpandLevel` would otherwise expand them. So the two interact additively, not independently. The intent (fold nodes deeper than 3) is achieved, but only because both agree on the threshold 3.

If someone changes `initialExpandLevel` without updating the `depth > 3` threshold (or vice versa), behaviour will diverge silently.

Recommendation: extract the constant and co-locate the comment:

```typescript
/** Nodes deeper than this level are pre-folded for a cleaner initial view.
 *  Keep in sync with initialExpandLevel in MarkmapRenderer. */
const AUTO_FOLD_DEPTH = 3

// ...
payload: depth > AUTO_FOLD_DEPTH ? { fold: 1 } : undefined,
```

And in `MarkmapRenderer.tsx`:

```typescript
initialExpandLevel: AUTO_FOLD_DEPTH, // imported from mindmap-transform
```

#### 7. Loading spinner shown inside `min-h-[60vh]` container without explicit height

**File**: `packages/web/components/course/viewer/enrichments/MarkmapRenderer.tsx`, lines 85-91
**Category**: Performance / UX

```typescript
if (!mounted) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
    </div>
  )
}
```

The spinner uses `h-full`. The parent in `MindMapViewer.tsx` is `<div className="min-h-[60vh] flex-1">`. `h-full` resolves to the parent's computed height, but since the parent uses `min-h-[60vh]` (not `h-[60vh]`), the spinner container will collapse to zero height unless the flex parent has a definite height. The dialog itself uses `max-h-[90vh] flex-col`, so `flex-1` inside a flex column should work — but this is contingent on the dialog implementation providing a bounded flex container.

Testing in a dialog context is recommended. If the spinner collapses: replace `h-full` on the spinner wrapper with `min-h-[60vh]` or add `flex-1` explicitly.

#### 8. `markmapData` memoization based on `content.root` reference is insufficient if root is mutated upstream

**File**: `packages/web/components/course/viewer/enrichments/MindMapViewer.tsx`, line 152
**Category**: Performance / Correctness

```typescript
const markmapData = useMemo(() => toMarkmapNode(content.root), [content.root]);
```

`toMarkmapNode` is a pure recursive transformation with O(n) complexity. Memoizing it is correct. However, the dependency is `content.root` (object reference). If the parent re-renders and passes a new `content` object with a structurally identical `root` (shallow-reference-different but deeply-equal), the memoization will miss and `toMarkmapNode` will re-run unnecessarily.

In practice, the content comes from a stable enrichment object that is unlikely to be re-instantiated on re-render. This is low risk in the current callsite but worth noting.

#### 9. Dialog keeps `MarkmapRenderer` alive only while `isDialogOpen` — but markmap not destroyed on dialog close

**File**: `packages/web/components/course/viewer/enrichments/MindMapViewer.tsx`, lines 219-224
**Category**: Memory / Lifecycle

```typescript
{isDialogOpen && (
  <MarkmapRenderer
    data={markmapData}
    fitToViewLabel={t('viewer.mindMap.fitToView')}
  />
)}
```

When `isDialogOpen` becomes `false`, React unmounts `MarkmapRenderer`. The `useEffect` cleanup in `MarkmapRenderer` calls `mm.destroy()` and sets `mmRef.current = null`. This is correct and prevents memory leaks.

However, `Radix UI Dialog` (which this `Dialog` appears to be based on, given the import from `@/components/ui/dialog`) typically animates the dialog out before unmounting children. During the exit animation, the markmap SVG is still mounted but `isDialogOpen` is already `false`, which means the `MarkmapRenderer` is already unmounted. The result is that the close animation shows an empty space where the markmap was.

This is a minor UX issue, not a memory leak. The `destroy()` call correctly fires on unmount. No action needed unless the dialog close animation is visibly jarring.

#### 10. Aria label for expand/collapse toggle uses hardcoded English strings

**File**: `packages/web/components/course/viewer/enrichments/MindMapViewer.tsx`, lines 90-91
**Category**: Accessibility / i18n

```typescript
aria-label={isExpanded ? 'Collapse' : 'Expand'}
```

These strings are not translated. The rest of the component is fully i18n'd via `useTranslations`. However, `MindMapTreeNode` is a local function component inside `MindMapViewer.tsx` — it does not have access to the `t` function.

Options:

1. Accept `expandLabel` and `collapseLabel` as props on `MindMapTreeNode` and pass from `MindMapViewer`.
2. Lift `MindMapTreeNode` outside the file and give it its own `useTranslations` call.
3. Add `expandLabel` / `collapseLabel` to the i18n files and pass them down.

The recommended approach is option 1 (simplest) combined with adding keys to i18n files:

```json
// en/enrichments.json — viewer.mindMap
"expand": "Expand node",
"collapse": "Collapse node"
```

#### 11. Unused i18n keys in `viewer.mindMap` section

**Files**: `messages/en/enrichments.json`, `messages/ru/enrichments.json`
**Category**: Maintenance

The following keys exist in both locale files under `viewer.mindMap` but are not referenced in any of the reviewed components:

- `viewer.mindMap.zoomIn`
- `viewer.mindMap.zoomOut`
- `viewer.mindMap.zoomReset`
- `viewer.mindMap.view` (used in `EnrichmentCard.tsx` under the "Mind Map: view/close toggle" button — confirmed used)
- `viewer.mindMap.description` (used in `EnrichmentCard.tsx` in `getDescriptionKey()` — confirmed used)

After cross-checking against `EnrichmentCard.tsx`:

- `zoomIn`, `zoomOut`, `zoomReset` are genuinely unused — the UI only has "Fit to view" but not separate zoom controls.

These are dead keys. They may be planned for future toolbar controls. Add a comment or remove them.

#### 12. `content.total_nodes` and `content.max_depth` are optional — falsy check masks zero values

**File**: `packages/web/components/course/viewer/enrichments/MindMapViewer.tsx`, lines 172-186
**Category**: Correctness

```typescript
{content.total_nodes && (
  <Badge ...>
    {t('viewer.mindMap.nodeCount', { count: content.total_nodes })}
  </Badge>
)}
{content.max_depth && (
  <Badge ...>
    {t('viewer.mindMap.depth', { depth: content.max_depth })}
  </Badge>
)}
```

If `total_nodes` is `0` or `max_depth` is `0`, the badge will not render. Per the schema, `total_nodes` is `z.number().int().positive().optional()` — so zero is not a valid schema value, and the schema would reject it at parse time. In practice this is safe.

However, the pattern is fragile. Prefer an explicit check:

```typescript
{content.total_nodes != null && (
  ...
)}
```

This documents the intent (hide when absent) rather than relying on implicit falsy behavior.

---

### Low Priority Issues

#### 13. `handleFit` callback has empty dependency array — correct but not obviously so

**File**: `packages/web/components/course/viewer/enrichments/MarkmapRenderer.tsx`, line 45-47
**Category**: Code clarity

```typescript
const handleFit = useCallback(() => {
  mmRef.current?.fit();
}, []);
```

`mmRef` is a `useRef`, so its `.current` is not reactive — using it inside `useCallback` with empty deps is the correct pattern. However, `fit()` returns `Promise<void>` and the callback does not `await` it or handle rejection. This is fine for a button handler (fire-and-forget panning animation), but worth noting that unhandled promise warnings will not surface here due to optional chaining on `mmRef.current?.fit()`.

#### 14. `while (svg.firstChild)` child clearing loop is O(n) when `removeChild` is O(1)

**File**: `packages/web/components/course/viewer/enrichments/MarkmapRenderer.tsx`, lines 55-57
**Category**: Performance (negligible)

```typescript
while (svg.firstChild) {
  svg.removeChild(svg.firstChild);
}
```

This is a standard pattern and entirely correct. An alternative is `svg.innerHTML = ''` or `svg.replaceChildren()` (modern). The current form is fine for the expected SVG size (markmap creates ~3 child elements).

#### 15. Missing `loading` fallback on `dynamic()` import of `MarkmapRenderer`

**File**: `packages/web/components/course/viewer/enrichments/MindMapViewer.tsx`, lines 20-23
**Category**: UX

```typescript
const MarkmapRenderer = dynamic(() => import('./MarkmapRenderer'), { ssr: false });
```

No `loading` prop is provided. While the dialog renders `MarkmapRenderer` conditionally (`{isDialogOpen && ...}`), and `MarkmapRenderer` has its own `!mounted` spinner, there's a brief window during chunk loading (before the module executes) where nothing is shown. Adding a `loading` prop avoids an empty gray space:

```typescript
const MarkmapRenderer = dynamic(
  () => import('./MarkmapRenderer'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    ),
  }
)
```

This duplicates the spinner that `MarkmapRenderer` itself shows, but it covers the chunk-download gap.

#### 16. Bundle size: markmap-view pulls in D3

**Category**: Bundle size

`markmap-view` depends on several `d3-*` sub-packages (d3-hierarchy, d3-selection, d3-zoom, d3-transition, d3-scale-chromatic). This adds approximately 60–90 KB (gzipped) to the client bundle. Because the component is loaded via `next/dynamic` with `ssr: false`, this is added to a separate chunk and does not impact initial page load. This is the correct approach and no changes are needed. For reference: the chunk will be downloaded lazily the first time a user opens the mind map dialog.

#### 17. Hardcoded inline `style="opacity:0.7"` in SVG HTML content

**File**: `packages/web/lib/helpers/mindmap-transform.ts`, line 26
**Category**: Maintainability / Dark mode

```typescript
content += `<br/><small style="opacity:0.7">${escapeHtml(node.description)}</small>`;
```

The opacity is hardcoded as an inline style. This renders fine in both light and dark themes because opacity is theme-agnostic. However, if someone wants to change the description style (e.g., different color per theme, or font size), they must modify this generated HTML string rather than a CSS class. Consider a CSS class approach if the markmap's `embedGlobalCSS` or `style` option is used in the future.

#### 18. `topLevelChildrenCount` counts `children.length` but `previewHint` says "top-level topics"

**File**: `packages/web/components/course/viewer/enrichments/MindMapViewer.tsx`, lines 154-166
**Category**: UX copy accuracy

```typescript
const topLevelChildrenCount = content.root.children?.length ?? 0;
// ...
{
  t('viewer.mindMap.previewHint', { count: topLevelChildrenCount });
}
// en: "{count} top-level topics"
```

`content.root.children` are the direct children of the root node — these are indeed "top-level topics" relative to the root. The naming and the copy are consistent. No action needed, but the variable name `topLevelChildrenCount` could be shortened to `topicCount` for clarity.

---

## API Verification Against markmap-view 0.18.12

Verified against the actual `.d.ts` files in `node_modules/.pnpm/markmap-view@0.18.12_markmap-common@0.18.9/`:

| API usage                               | Correct?             | Notes                                                                                                                      |
| --------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `Markmap.create(svg, opts, data)`       | Yes                  | Signature: `create(svg: string \| SVGElement \| ID3SVGElement, opts?: Partial<IMarkmapOptions>, data?: IPureNode \| null)` |
| `deriveOptions({...})`                  | Yes                  | Returns `Partial<IMarkmapOptions>` from `IMarkmapJSONOptions`-shaped input                                                 |
| `mm.destroy()`                          | Yes                  | `destroy(): void` — synchronous                                                                                            |
| `mm.fit()`                              | Yes                  | `fit(maxScale?: number): Promise<void>` — async                                                                            |
| `mm.setData(data, opts?)`               | Available but unused | Could replace destroy/recreate cycle for data updates                                                                      |
| `mm.setOptions(opts)`                   | Available but unused | Could replace destroy/recreate for theme updates                                                                           |
| `IPureNode.payload: { fold: 1 }`        | Yes                  | `fold` is the correct field name for pre-folding                                                                           |
| `autoFit: true` in opts                 | Yes                  | `autoFit: boolean` is a first-class option in `IMarkmapOptions`                                                            |
| `colorFreezeLevel` in `deriveOptions`   | Yes                  | Part of `IMarkmapJSONOptions`                                                                                              |
| `initialExpandLevel` in `deriveOptions` | Yes                  | Part of `IMarkmapJSONOptions`                                                                                              |
| `zoom`, `pan` in `deriveOptions`        | Yes                  | Part of `IMarkmapJSONOptions`                                                                                              |
| `spacingHorizontal`, `spacingVertical`  | Yes                  | Part of both `IMarkmapJSONOptions` and `IMarkmapOptions`                                                                   |
| `maxWidth`                              | Yes                  | Part of both option types                                                                                                  |

All markmap API usages are correct. The main missed opportunity is `setData` and `setOptions` for live updates (see issue 2).

---

## XSS Safety Assessment

The `escapeHtml` function in `mindmap-transform.ts` is correct:

```typescript
const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, ch => ESCAPE_MAP[ch] ?? ch);
}
```

- All five dangerous HTML characters are covered.
- The `?? ch` fallback is unreachable (the regex only matches the five chars in the map) but is harmless.
- `node.label` and `node.description` are both escaped before insertion.
- The only unescaped HTML fragments are `<br/>` and `<small style="opacity:0.7">...</small>`, which are developer-controlled constants, not user input.
- The MindMapTreeNode component renders `node.label` and `node.description` as React text children (not `dangerouslySetInnerHTML`), so those paths are safe regardless of escaping.

**Verdict: XSS protection is correct and adequate.**

---

## React Hooks Correctness

| Hook                                                         | Issue                                                                           | Verdict |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------- |
| `useEffect([data, mounted, isDark, colors])`                 | `colors` is redundant dep (covered by `isDark`); not a bug today but misleading | Minor   |
| `useEffect` cleanup calling `mm.destroy()`                   | Correct — fires on unmount and before re-run                                    | Correct |
| `useCallback(handleFit, [])`                                 | Correct — `mmRef.current` is imperative, not reactive                           | Correct |
| `useMemo(() => toMarkmapNode(content.root), [content.root])` | Correct — object ref dependency                                                 | Correct |
| `useState(depth < 2)` in `MindMapTreeNode`                   | Initial state computed once from prop — correct for a pure toggle               | Correct |

---

## Dark Mode Handling

The dark mode support is well-implemented:

1. `useThemeSync()` provides `mounted` guard to prevent hydration mismatch.
2. Separate `LIGHT_COLORS` / `DARK_COLORS` palettes are appropriate for markmap's color function.
3. The SVG `color` style property (`isDark ? '#e2e8f0' : '#1e293b'`) sets the text color for node labels.
4. The preview tree uses Tailwind `dark:` variants throughout.

One gap: when markmap renders node labels as HTML, the text color within the `<small>` description tag inherits from the SVG node's CSS, which is controlled by the inline `color` style on the `<svg>` element. This should work correctly. However, if a user's system theme changes while the dialog is open, the `isDark` value will update, the effect will fire, `mm.destroy()` and `Markmap.create()` will run again — the user will see a flash and lose their zoom/pan state. This is the same issue as item 2 above.

---

## Accessibility Concerns

| Area                   | Finding                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| Expand/collapse toggle | Missing i18n on `aria-label` ("Expand" / "Collapse") — see issue 10                                  |
| Dialog close button    | Correct: `<span className="sr-only">{t('viewer.close')}</span>` present                              |
| Dialog title           | `DialogTitle` present with translated text — correct for ARIA dialog pattern                         |
| Markmap SVG            | `markmap-view` does not provide ARIA attributes on generated SVG nodes; this is a library limitation |
| Interaction hint       | Text-only hint at dialog footer — good for discoverability                                           |
| Keyboard navigation    | markmap-view does not support keyboard node traversal; this is a known library limitation            |

---

## Next Steps

### Should Fix Before Shipping

1. Remove `colors` from the `useEffect` dependency array in `MarkmapRenderer.tsx` (issue 1).
2. Refactor destroy/recreate to use `setData` and `setOptions` for live updates (issue 2).
3. Change `key={index}` to `key={\`${child.label}-${index}\`}`on`MindMapTreeNode` children (issue 3).
4. Fix hardcoded `aria-label` strings on expand/collapse toggle — pass translated strings as props (issue 10).

### Recommended (Before or Shortly After Shipping)

5. Extract `AUTO_FOLD_DEPTH = 3` constant and use it in both files (issue 6).
6. Add a `loading` fallback to the `dynamic()` import (issue 15).
7. Add a code comment documenting the `innerHTML` rendering assumption in `mindmap-transform.ts` (issue 5).
8. Change `content.total_nodes &&` to `content.total_nodes != null &&` (issue 12).

### Low Priority / Future Work

9. Remove unused i18n keys `zoomIn`, `zoomOut`, `zoomReset` from `viewer.mindMap` (issue 11).
10. Consider lazy-loading the `toMarkmapNode` transform at worker level for very large trees (issue 8).

---

## Artifacts

- This report: `docs/reports/code-review/2026-02/markmap-viewer-review.md`

---

Code review complete. No critical issues found. The implementation is correct and safe. The four high-priority items above will meaningfully improve stability and UX before the feature reaches production users.
