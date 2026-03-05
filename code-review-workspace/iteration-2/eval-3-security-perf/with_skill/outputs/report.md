# Code Review: Enrichments Viewer Components -- Security & Performance

**Date**: 2026-03-04
**Scope**: `packages/web/components/course/viewer/enrichments/` -- all 13 files (12 .tsx + 1 .ts)
**Files**: 13 | **Lines**: 3,061
**Focus**: XSS, unsafe HTML rendering, React re-renders, memoization, bundle size

## Summary

|              | Critical | High | Medium | Low |
| ------------ | -------- | ---- | ------ | --- |
| Issues       | 1        | 2    | 3      | 2   |
| Improvements | --       | 3    | 4      | 2   |

**Verdict**: NEEDS WORK

The enrichments directory is generally well-structured with good TypeScript typing, Zod validation at the schema boundary, and solid accessibility practices. However, there is one critical XSS vector via unvalidated image URLs, several performance opportunities around memoization and re-renders, and a notable bundle size concern with the markmap library.

---

## Issues

### Critical (P0)

#### 1. InfographicViewer: Unvalidated `imageUrl` rendered in `<img src>` -- potential XSS via `javascript:` protocol

- **File**: `packages/web/components/course/viewer/enrichments/InfographicViewer.tsx:81`
- **Problem**: `content.imageUrl` is rendered directly as `<img src={content.imageUrl}>` in two locations (lines 81 and 153). While the Zod schema (`infographicEnrichmentContentSchema`) validates with `z.string().url()`, the Zod `.url()` validator accepts `javascript:` URIs and other non-http(s) schemes. If an LLM or a corrupted data source produces `javascript:void(0)` or a `data:` URI with SVG containing `<script>`, the `<img>` tag will render it. More critically, while modern browsers block `javascript:` in `<img src>`, a `data:image/svg+xml` URL containing embedded scripts could bypass protections in certain contexts.
- **Impact**: A malicious or corrupted `imageUrl` value in the database could execute arbitrary JavaScript in the user's browser session. This is an LLM-to-user trust boundary -- LLM-generated content must be treated as untrusted.
- **Fix**: Validate that `imageUrl` starts with `https://` (or the known Supabase Storage domain) before rendering. Add a utility:
  ```typescript
  function isSafeImageUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }
  ```
  Apply at render time: `src={isSafeImageUrl(content.imageUrl) ? content.imageUrl : ''}` and show a fallback if invalid. The same validation should also be applied in `StudyGuideViewer` if it ever renders user-provided images through the Markdown renderer.

### High (P1)

#### 2. FlashcardViewer: `onCardFlip` callback recreated every render, defeating `React.memo` on `FlashcardCard`

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:237`
- **Problem**: `onCardFlip` is defined as a plain arrow function inside the render body of `FlashcardViewer`:
  ```typescript
  const onCardFlip = () => {
    if (!isDraggingRef.current) handleFlip();
  };
  ```
  This creates a new function reference on every render. `FlashcardCard` is wrapped in `React.memo` (line 22 of FlashcardCard.tsx), but the `onFlip` prop receives a fresh reference each time, causing `FlashcardCard` to re-render on every parent state change (flip, navigate, assessment).
- **Impact**: `FlashcardCard` uses Framer Motion spring animations with `preserve-3d` transforms. Unnecessary re-renders during interaction cause layout recalculations and potential animation jank, especially on low-power mobile devices.
- **Fix**: Wrap in `useCallback`:
  ```typescript
  const onCardFlip = useCallback(() => {
    if (!isDraggingRef.current) handleFlip();
  }, [handleFlip]);
  ```
  Since `handleFlip` is already stabilized via `useCallback` (line 110), this makes `onCardFlip` stable too, and `React.memo` on `FlashcardCard` can properly skip re-renders.

#### 3. QuizPlayer: Multiple inline functions recreated every render in a large component (829 lines)

- **File**: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx:214,238,247,256,304-361`
- **Problem**: Several handler functions are defined as plain functions inside the component body without `useCallback`:
  - `handleAnswerChange` (line 214)
  - `handleNext` (line 238)
  - `handlePrevious` (line 247)
  - `handleSubmit` (line 256)
  - `handleRetry` (line 292)
  - `getDifficultyColor` (line 304)
  - `getBloomColor` (line 318)
  - `getDifficultyLabel` (line 334)
  - `getBloomLabel` (line 348)
  - `isAnswerCorrect` (line 364)

  Only `toggleMultiSelectOption` (line 224) uses `useCallback`. The color/label mapping functions in particular are pure functions that could be extracted outside the component entirely.

- **Impact**: Every keystroke, option selection, or navigation triggers a re-render that recreates ~10 functions. While React handles this efficiently for small components, at 829 lines with Framer Motion `AnimatePresence` transitions, this adds measurable overhead, particularly during the question transition animation where `motion.div` re-evaluates all props.
- **Fix**:
  1. Extract pure mapping functions (`getDifficultyColor`, `getBloomColor`, `getDifficultyLabel`, `getBloomLabel`) outside the component -- they don't depend on component state, only on `t()` for labels. The label functions can use `t` as a parameter or be defined as a map.
  2. Wrap `handleNext`, `handlePrevious`, `handleAnswerChange` in `useCallback`.
  3. Consider extracting the results view (line 370-536) into a separate `QuizResults` component to reduce the main component size and isolate re-render boundaries.

### Medium (P2)

#### 4. MarkmapRenderer: Effect dependency array missing `data` and `isDark` in creation effect

- **File**: `packages/web/components/course/viewer/enrichments/MarkmapRenderer.tsx:90`
- **Problem**: The markmap instance creation effect (Effect 1, line 52) has `[mounted]` as its only dependency, but uses `data` and `isDark` in the initial creation:
  ```typescript
  const mm = Markmap.create(svg, { ...opts, autoFit: true }, data);
  ```
  While Effects 2 and 3 update data and colors separately, the initial creation on mount uses stale closures if `data` or `isDark` change before `mounted` becomes true (race condition during hydration). The comment at line 88-90 acknowledges this is intentional, but the `eslint-disable` for exhaustive-deps is implicit.
- **Impact**: If theme or data changes during the hydration window (between first render and `mounted = true`), the initial markmap instance will use stale values. In practice, this is rare but could cause a brief flash of wrong colors.
- **Fix**: Add a comment with `// eslint-disable-next-line react-hooks/exhaustive-deps` if this is truly intentional. Better yet, include `data` and `isDark` in the dependency array and use a ref to track the first mount to avoid destroy/recreate cycles:
  ```typescript
  const initialRenderRef = useRef(true);
  useEffect(() => {
    if (!mounted || !svgRef.current) return;
    // ... create markmap with current data and isDark
    initialRenderRef.current = false;
    return () => {
      mm.destroy();
      mmRef.current = null;
    };
  }, [mounted, data, isDark]);
  ```

#### 5. AudioPlayer: Type import from local `@/types/database.generated` instead of `@megacampus/shared-types`

- **File**: `packages/web/components/course/viewer/enrichments/AudioPlayer.tsx:20`
- **Problem**: `AudioPlayer` imports `Database` from `@/types/database.generated`, while the project convention (per CLAUDE.md) is to always import from `@megacampus/shared-types`. Every other enrichment component correctly imports types from `@megacampus/shared-types`.
  ```typescript
  import type { Database } from '@/types/database.generated';
  type EnrichmentRow = Database['public']['Tables']['lesson_enrichments']['Row'];
  ```
- **Impact**: This creates a maintenance divergence. When types are regenerated, `@/types/database.generated` may be stale while `@megacampus/shared-types` is rebuilt via the monorepo pipeline. This could cause silent type mismatches.
- **Fix**: Replace with the shared-types import if `EnrichmentRow` or an equivalent is exported from there. If not, export it from `@megacampus/shared-types` and import from there. Alternatively, the `AudioPlayer` props should accept typed content directly (like the other enrichment components do) rather than accepting a raw database row.

#### 6. FlashcardDots: `onNavigate` callback is an inline arrow in parent, causing re-renders

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:432-435`
- **Problem**: The `onNavigate` prop passed to `FlashcardDots` is an inline arrow function:
  ```typescript
  onNavigate={(i) => {
    setCurrentIndex(i)
    setIsFlipped(false)
  }}
  ```
  `FlashcardDots` is not wrapped in `React.memo`, so this alone does not cause extra renders. However, if `FlashcardDots` were memoized in the future (it renders up to 30 dot buttons), this inline function would defeat memoization.
- **Impact**: Currently low, but blocks future optimization. With 30 cards, each dot re-renders on every parent state change.
- **Fix**: Extract as a `useCallback`:
  ```typescript
  const handleDotNavigate = useCallback((i: number) => {
    setCurrentIndex(i);
    setIsFlipped(false);
  }, []);
  ```
  Then wrap `FlashcardDots` in `React.memo`.

### Low (P3)

#### 7. QuizPlayer: `console.warn` left in production code

- **File**: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx:79-84`
- **Problem**: `computeIsCorrect` contains a `console.warn` that fires for unexpected `correct_answer` types on `multi_select` questions:
  ```typescript
  console.warn('[QuizPlayer] multi_select correct_answer has unexpected type:', ...)
  ```
- **Impact**: Minor console noise in production. Could leak internal data structure details to users who open DevTools.
- **Fix**: Remove or gate behind `process.env.NODE_ENV === 'development'`.

#### 8. EnrichmentErrorBoundary: Hardcoded Russian strings instead of using i18n

- **File**: `packages/web/components/course/viewer/enrichments/EnrichmentErrorBoundary.tsx:46-57`
- **Problem**: The error boundary uses inline Russian/English translation objects instead of `next-intl`. This is noted as a class component limitation (cannot use hooks), but the locale prop fallback approach is fragile.
- **Impact**: If the `locale` prop is not passed, defaults to English. This is inconsistent with the rest of the enrichment components which all use `useTranslations`.
- **Fix**: Accept pre-built translation strings as props (like `FlashcardSummary` does with its `labels` prop), letting the parent pass `t()` results. This avoids hooks in a class component while staying consistent.

---

## Improvements

### High

#### 1. Bundle size: `markmap-view` + `markmap-common` are heavy dependencies loaded client-side

- **File**: `packages/web/components/course/viewer/enrichments/MarkmapRenderer.tsx:5`
- **Current**: `markmap-view` (^0.18.12) and `markmap-common` (^0.18.9) are direct dependencies. `MarkmapRenderer` is already dynamically imported via `next/dynamic` in `MindMapViewer.tsx:13`, which is good. However, `markmap-view` itself bundles `d3` (or significant d3 sub-modules) internally.
- **Recommended**: Verify the actual bundle impact using `@next/bundle-analyzer`. If the markmap chunk exceeds ~100KB gzipped, consider:
  1. Confirming the dynamic import includes `{ ssr: false }` (already done -- good).
  2. Adding a loading skeleton that matches the final layout to prevent CLS.
  3. If only a fraction of users view mind maps, consider route-level code splitting or lazy loading the entire `MindMapViewer` at the enrichment panel level.

#### 2. QuizPlayer: 829 lines -- should be decomposed into sub-components

- **File**: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx`
- **Current**: The entire quiz -- header, progress, question rendering (4 types), navigation, results summary -- lives in a single 829-line component. This is the largest file in the directory by a significant margin.
- **Recommended**: Extract into focused sub-components:
  - `QuizHeader` -- title, instructions, metadata badges
  - `QuizQuestion` -- question card with type-specific rendering
  - `QuizNavigation` -- previous/next/submit buttons
  - `QuizResults` -- results summary (lines 370-536)

  This enables per-section memoization and reduces cognitive load. The `FlashcardViewer` (494 lines) already follows this pattern well with `FlashcardCard`, `FlashcardDots`, and `FlashcardSummary`.

#### 3. FlashcardViewer: `cardOfLabel` callback is an inline arrow, recreated every render

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:436`
- **Current**:
  ```typescript
  cardOfLabel={(cur, tot) => t('viewer.flashcards.cardOf', { current: cur, total: tot })}
  ```
- **Recommended**: Wrap in `useCallback`:
  ```typescript
  const cardOfLabel = useCallback(
    (cur: number, tot: number) => t('viewer.flashcards.cardOf', { current: cur, total: tot }),
    [t]
  );
  ```

### Medium

#### 4. QuizPlayer: `JSON.stringify` comparison for multi-select answers is fragile

- **File**: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx:86`
- **Current**:
  ```typescript
  return JSON.stringify(userArr) === JSON.stringify(correctArr);
  ```
  Both arrays are sorted before comparison, so the result is correct. However, `JSON.stringify` comparison is an anti-pattern that is slower than element-wise comparison and harder to debug.
- **Recommended**: Use element-wise comparison:
  ```typescript
  return userArr.length === correctArr.length && userArr.every((v, i) => v === correctArr[i]);
  ```

#### 5. FlashcardViewer: Six separate `useState` calls where a reducer would be cleaner

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:51-57`
- **Current**: Six interdependent state variables (`cards`, `currentIndex`, `isFlipped`, `isShuffled`, `knownIds`, `unknownIds`, `isFinished`) with complex update logic spread across multiple callbacks.
- **Recommended**: Consolidate into a `useReducer` for clearer state transitions and easier testing:
  ```typescript
  type FlashcardAction =
    | { type: 'FLIP' }
    | { type: 'NEXT' }
    | { type: 'PREVIOUS' }
    | { type: 'KNOW'; cardId: string }
    | { type: 'SHUFFLE' }
    | { type: 'RESET' };
  ```

#### 6. MarkmapRenderer: ResizeObserver callback fires on every pixel change during resize

- **File**: `packages/web/components/course/viewer/enrichments/MarkmapRenderer.tsx:117-118`
- **Current**:
  ```typescript
  const ro = new ResizeObserver(() => {
    void mmRef.current?.fit();
  });
  ```
  `fit()` is called on every ResizeObserver notification, which fires at high frequency during window resize.
- **Recommended**: Debounce the `fit()` call:
  ```typescript
  let rafId: number;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      void mmRef.current?.fit();
    });
  });
  ```
  Using `requestAnimationFrame` as a simple debounce aligns the fit to the browser's paint cycle.

#### 7. InfographicViewer: Zoom level not keyboard-accessible

- **File**: `packages/web/components/course/viewer/enrichments/InfographicViewer.tsx:149-166`
- **Current**: The dialog's zoomable image area only supports mouse-based zoom (buttons + double-click). There is no keyboard shortcut for zoom (e.g., `+`/`-` keys) and no pinch-zoom for touch devices.
- **Recommended**: Add keyboard event handler on the dialog for `+`/`-`/`0` keys to zoom in/out/reset. For touch, consider adding CSS `touch-action: pinch-zoom` or a gesture handler.

### Low

#### 8. FlashcardSummary: Not memoized, re-renders unnecessarily if parent state changes

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardSummary.tsx:31`
- **Current**: `FlashcardSummary` is a plain function component. It only renders when `isFinished` is true, but if the parent re-renders for any reason while finished, the summary re-renders too.
- **Recommended**: Wrap in `React.memo` for consistency with `FlashcardCard`:
  ```typescript
  export const FlashcardSummary = React.memo(function FlashcardSummary(...) { ... })
  ```

#### 9. QuizPlayer: `getShuffledOptions` could be memoized or extracted

- **File**: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx:190-195`
- **Current**: `getShuffledOptions` is defined as a plain function inside render. While the shuffled options are computed once in `useState`, the lookup function itself is recreated every render.
- **Recommended**: Wrap in `useCallback` or extract outside the component as a pure function taking the map and question as arguments.

---

## Positive Patterns

1. **Zod validation at the trust boundary**: All enrichment content types are validated via Zod schemas in `@megacampus/shared-types/enrichment-content.ts` before reaching the UI. The `z.string().url()` validation on image URLs, the depth-safe mind map validation with iterative BFS, and the `createLLMEnumSchema` fuzzy matching all demonstrate defense-in-depth against LLM-generated content.

2. **Proper `React.memo` on `FlashcardCard`**: The most animation-heavy component (3D flip with spring physics) is correctly memoized, and props are mostly stabilized via `useCallback` in the parent -- the `onCardFlip` issue is the only gap.

3. **Dynamic import for MarkmapRenderer**: `MindMapViewer` uses `next/dynamic` with `ssr: false` to code-split the heavy `markmap-view` library. This avoids loading d3-based visualization code for users who never open a mind map, keeping the initial bundle lean.

4. **Accessibility throughout**: All interactive elements have `aria-label`, `aria-live`, `role`, and keyboard handlers. The `FlashcardCard` supports keyboard flip (Enter/Space), the quiz uses proper `RadioGroup` semantics with `Label/htmlFor`, and the `AudioPlayer` includes `aria-valuetext` on sliders.

5. **Error boundary isolation**: `EnrichmentErrorBoundary` catches rendering errors per-enrichment, preventing a single broken quiz or flashcard deck from crashing the entire lesson viewer. Error state is recoverable via retry button.

---

## Escalation

- **None required**: No database schema changes, no API contract modifications, no auth changes, no new external dependencies beyond what is already in use. The security finding (P0 #1) should be prioritized but does not require senior architectural review -- it is a straightforward URL validation fix.

---

## Validation

- Type Check: SKIPPED (per task instructions)
- Build: SKIPPED (per task instructions)
