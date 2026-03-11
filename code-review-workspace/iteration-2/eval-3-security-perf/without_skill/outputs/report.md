# Security & Performance Code Review: Enrichments Viewer Components

**Scope:** `packages/web/components/course/viewer/enrichments/`
**Date:** 2026-03-04
**Reviewer:** Claude Opus 4.6 (automated review)
**Focus Areas:** XSS, unsafe HTML rendering, React re-renders, memoization, bundle size

---

## Executive Summary

The enrichments directory contains 12 source files implementing interactive viewers for quizzes, flashcards, audio, mind maps, infographics, and study guides. Overall, the codebase demonstrates **solid security awareness** -- the most critical XSS vector (markmap innerHTML rendering) is properly mitigated with HTML escaping. However, several medium-severity issues were found around performance patterns, missing memoization, and bundle size concerns. No critical XSS vulnerabilities were identified, but there are defensive improvements worth making.

**Severity counts:**

- Critical: 0
- High: 1
- Medium: 6
- Low: 5
- Informational: 3

---

## 1. Security Findings

### 1.1 [HIGH] Markmap renders node content via d3 `.html()` (innerHTML equivalent)

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/MarkmapRenderer.tsx` (line 79)
**Related:** `/home/me/code/mc2/packages/web/lib/helpers/mindmap-transform.ts`

The markmap-view library renders `IPureNode.content` using d3's `.html()` method (confirmed in `markmap-view@0.18.12/dist/index.js` line 646), which sets innerHTML on the foreign object. This is a known architectural decision by markmap to support rich node labels.

**Current mitigation:** The `toMarkmapNode()` function in `mindmap-transform.ts` properly HTML-escapes all LLM-generated text via `escapeHtml()` before embedding it in the `content` property. The escape function handles `&`, `<`, `>`, `"`, and `'`. Only structural tags (`<br/>`, `<small>`) are added unescaped, which is safe.

**Remaining risk:** If any future code path constructs `IPureNode.content` without going through `toMarkmapNode()`, or if the `MindMapNode` type gains fields that are not escaped (e.g., a `url` field used in an `<a href="...">`), an XSS vector would open. The `escapeHtml` function is local and not exported for reuse.

**Recommendation:**

- Export `escapeHtml` from `mindmap-transform.ts` or move it to a shared utility for reuse.
- Add a code comment on `MarkmapRenderer`'s `data` prop explicitly warning that all text in the `IPureNode` tree must be pre-escaped.
- Consider adding a unit test that verifies `toMarkmapNode` escapes `<script>alert(1)</script>` in `label` and `description` fields.

---

### 1.2 [MEDIUM] InfographicViewer renders external image URL without domain validation

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/InfographicViewer.tsx` (lines 81, 154)

```tsx
<img src={content.imageUrl} ... />
```

The `imageUrl` is rendered directly in an `<img>` tag (not via Next.js `<Image>`, which would enforce `remotePatterns`). While the Zod schema validates it as `z.string().url()`, this only checks URL format -- it does not restrict the domain.

**Risk:** If an attacker or a misbehaving LLM pipeline injects a URL pointing to an external tracking pixel or a URL with a `javascript:` scheme (though `z.string().url()` rejects non-http schemes), the image tag will load it. The CSP header's `img-src` is `'self' data: https: blob:`, which allows any HTTPS domain.

**Recommendation:**

- Validate that `imageUrl` points to the expected Supabase Storage domain(s) before rendering. This can be done at the schema level or as a runtime check in the component.
- Consider using Next.js `<Image>` component instead of raw `<img>`, which provides domain whitelisting via `remotePatterns`, automatic optimization, and prevents loading from unauthorized origins.

---

### 1.3 [MEDIUM] AudioPlayer renders `playbackUrl` as audio source without validation

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/AudioPlayer.tsx` (lines 148, 239)

```tsx
audio.src = playbackUrl;
```

The `playbackUrl` prop is set directly as the audio element's `src`. If a malicious URL were injected, the browser would attempt to load it. The CSP `media-src` directive restricts sources to specific domains, providing partial mitigation.

**Recommendation:** Add a URL validation check (domain whitelist) before setting `audio.src`, especially since `playbackUrl` comes from an optional prop rather than validated schema content.

---

### 1.4 [LOW] StudyGuideViewer passes LLM-generated markdown to MarkdownRendererFull

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/StudyGuideViewer.tsx` (lines 69, 81, 132)

```tsx
<MarkdownRendererFull content={content.markdown} preset="preview" />
<MarkdownRendererFull content={section.content} preset="preview" />
```

`react-markdown` is used to render LLM-generated markdown content. `react-markdown` does NOT use `dangerouslySetInnerHTML` -- it builds a React element tree from the AST, which is inherently safe against raw HTML injection. Raw HTML in the markdown source is rendered as plain text by default (unless `rehype-raw` is enabled, which it is NOT in this codebase).

**Assessment:** This is safe. No `dangerouslySetInnerHTML` usage was found in `MarkdownRendererFull.tsx`. The only `innerHTML` usage in the markdown subsystem is in `MermaidDirect.tsx`, which uses Mermaid's `securityLevel: 'strict'` mode for SVG sanitization.

---

### 1.5 [LOW] FlashcardCard renders `card.front` and `card.back` as text content

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/FlashcardCard.tsx` (lines 71, 89)

```tsx
<p ...>{card?.front}</p>
<p ...>{card?.back}</p>
```

**Assessment:** Safe. React's JSX text interpolation (`{card?.front}`) automatically escapes HTML entities. No XSS risk.

---

### 1.6 [LOW] QuizPlayer renders question text, option text, and explanations as text content

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/QuizPlayer.tsx` (lines 431-432, 511, 631, 649)

```tsx
<CardTitle ...>{currentQuestion.question}</CardTitle>
<p ...>{question.explanation}</p>
{option.text}
```

**Assessment:** Safe. All LLM-generated content is rendered via React JSX text interpolation, which auto-escapes.

---

### 1.7 [LOW] localStorage data is parsed without schema validation

**Files:**

- `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx` (lines 65-83)
- `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/QuizPlayer.tsx` (lines 131-143)

Both components read progress from `localStorage` and parse it with `JSON.parse()`, then use a TypeScript `as` cast without runtime validation:

```tsx
const parsed = JSON.parse(saved) as { known: string[]; unknown: string[]; ... }
```

If another script or extension writes malformed data to these keys, the component could crash or behave unexpectedly.

**Recommendation:** Add lightweight Zod schemas or manual field checks for deserialized localStorage data. Alternatively, wrap the post-parse logic in try/catch (the FlashcardViewer does wrap the entire block in try/catch, which is adequate; the QuizPlayer also has a try/catch, which is adequate).

---

### 1.8 [LOW] EnrichmentErrorBoundary concatenates `enrichmentType` into error text

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/EnrichmentErrorBoundary.tsx` (lines 48-49)

```tsx
loadFailed: 'Failed to load ' + this.props.enrichmentType,
```

**Assessment:** Safe. The string is rendered as React text content within a `<p>` element, so HTML entities are auto-escaped. No XSS risk even if `enrichmentType` contained malicious content.

---

## 2. Performance Findings

### 2.1 [MEDIUM] QuizPlayer: Missing memoization on numerous handler functions and inline computations

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/QuizPlayer.tsx`

The following functions are defined inside the render body and recreated on every render:

- `handleAnswerChange` (line 214) -- not wrapped in `useCallback`
- `handleNext` (line 238) -- not wrapped in `useCallback`
- `handlePrevious` (line 247) -- not wrapped in `useCallback`
- `handleSubmit` (line 256) -- not wrapped in `useCallback`
- `handleRetry` (line 292) -- not wrapped in `useCallback`
- `getDifficultyColor` (line 304) -- recreated every render
- `getBloomColor` (line 318) -- recreated every render
- `getDifficultyLabel` (line 334) -- recreated every render
- `getBloomLabel` (line 348) -- recreated every render
- `isAnswerCorrect` (line 364) -- recreated every render
- `getShuffledOptions` (line 190) -- recreated every render

While only `toggleMultiSelectOption` is wrapped with `useCallback`, the remaining handlers cause unnecessary reference changes that could trigger re-renders in child components.

**Impact:** Moderate. The QuizPlayer is the largest component (830 lines). Each handler reference change could cascade to child component props, defeating React's bailout optimization. The `getDifficultyColor`/`getBloomColor` pure mapping functions should be defined outside the component entirely.

**Recommendation:**

- Move pure mapping functions (`getDifficultyColor`, `getBloomColor`, `getDifficultyLabel`, `getBloomLabel`) outside the component body since they do not depend on component state or props (except translations, which could be passed as args).
- Wrap `handleAnswerChange`, `handleNext`, `handlePrevious`, `handleRetry` in `useCallback`.
- `handleSubmit` uses `state.answers` and `questions` closures, so it needs careful dependency management if wrapped.

---

### 2.2 [MEDIUM] FlashcardViewer: `onCardFlip` and anonymous inline callbacks recreated every render

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx`

```tsx
// Line 237 - recreated every render
const onCardFlip = () => {
  if (!isDraggingRef.current) handleFlip()
}

// Line 432 - inline closure
onNavigate={(i) => {
  setCurrentIndex(i)
  setIsFlipped(false)
}}

// Line 436 - inline closure
cardOfLabel={(cur, tot) => t('viewer.flashcards.cardOf', { current: cur, total: tot })}
```

**Impact:** The `onCardFlip` callback is passed to the memoized `FlashcardCard` component, but since `onCardFlip` creates a new reference on every render, the `React.memo` on `FlashcardCard` is completely defeated. The card will re-render on every parent state change.

Similarly, the `onNavigate` and `cardOfLabel` closures passed to `FlashcardDots` are new references each render.

**Recommendation:**

- Wrap `onCardFlip` in `useCallback` with `[handleFlip]` dependency.
- Wrap the `onNavigate` handler in `useCallback`.
- Wrap `cardOfLabel` in `useCallback` (or memoize with `useMemo` since it returns a string).
- The `FlashcardDots` component should be wrapped in `React.memo` for the memoization to be effective.

---

### 2.3 [MEDIUM] FlashcardViewer: `handlePrevious` has `currentIndex` in its dependency array unnecessarily

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx` (line 112-117)

```tsx
const handlePrevious = useCallback(() => {
  if (currentIndex > 0) {
    setCurrentIndex(prev => prev - 1);
    setIsFlipped(false);
  }
}, [currentIndex]); // <-- currentIndex in deps causes new reference on every navigation
```

The function reads `currentIndex` only for the guard condition, but uses the functional updater `(prev) => prev - 1` for the actual update. This could be refactored to use a ref for the guard, or simply let the functional updater handle the bounds check:

```tsx
const handlePrevious = useCallback(() => {
  setCurrentIndex(prev => {
    if (prev <= 0) return prev;
    setIsFlipped(false);
    return prev - 1;
  });
}, []);
```

**Impact:** `handlePrevious` gets a new reference on every card navigation, which cascades to keyboard event listener teardown/rebinding (line 199) and to child component props.

---

### 2.4 [MEDIUM] FlashcardViewer: Multiple new `Set` objects created on every Know/DontKnow action

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx` (lines 133-155)

```tsx
const handleKnow = useCallback(() => {
  const newKnown = new Set(knownIds)      // copy 1
  newKnown.add(currentCard.id)
  const newUnknown = new Set(unknownIds)  // copy 2
  newUnknown.delete(currentCard.id)
  setKnownIds(newKnown)
  setUnknownIds(newUnknown)
  ...
}, [currentCard, knownIds, unknownIds, ...])
```

Both `handleKnow` and `handleDontKnow` have `knownIds` and `unknownIds` in their dependency arrays, causing new callback references on every state change. Since these callbacks are the primary state mutators, each invocation triggers a cascade: state change -> new Sets -> new callback refs -> re-render -> new callback refs again.

**Recommendation:** Consider using `useReducer` to consolidate `knownIds`, `unknownIds`, `currentIndex`, `isFlipped`, and `isFinished` into a single state object. This eliminates multiple `useState` updates per action and removes the dependency cycle.

---

### 2.5 [MEDIUM] InfographicViewer: Unnecessary `useCallback` on trivial state setters

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/InfographicViewer.tsx` (lines 40-58)

```tsx
const handleZoomIn = useCallback(() => {
  setZoomLevel(prev => Math.min(prev + ZOOM_STEP, ZOOM_MAX));
}, []);
```

Five `useCallback` wrappers are used on functions that have empty dependency arrays and are only passed as `onClick` handlers to native HTML elements / UI components that do not use `React.memo`. Since these callbacks have stable references anyway (empty deps) and the child elements are not memoized, the `useCallback` wrappers add marginal overhead without measurable benefit.

**Assessment:** This is a nitpick. The pattern is not harmful -- it is simply unnecessary. No action required, but worth noting for consistency.

---

### 2.6 [INFORMATIONAL] AudioPlayer: High number of `useState` calls (8 state variables)

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/AudioPlayer.tsx` (lines 42-49)

The component uses 8 independent `useState` hooks. Each setter call triggers a separate re-render during non-batched contexts (though React 18+ batches state updates automatically in event handlers and effects).

**Assessment:** No immediate concern with React 18+ automatic batching. However, grouping related state (e.g., `isPlaying`, `isLoading`, `hasError` as a playback state machine) would improve readability and prevent impossible states.

---

## 3. Bundle Size Findings

### 3.1 [MEDIUM] Framer Motion imported by 4 components -- significant bundle cost

**Files:**

- `AudioPlayer.tsx` -- `motion`
- `FlashcardCard.tsx` -- `motion`
- `FlashcardSummary.tsx` -- `motion`
- `FlashcardViewer.tsx` -- `motion`, `AnimatePresence`
- `QuizPlayer.tsx` -- `motion`, `AnimatePresence`

Framer Motion adds approximately 30-40KB gzipped to the client bundle. It is imported by 5 of the 12 files in this directory. While tree-shaking reduces this when only specific features are used, the `AnimatePresence` + `motion` combination pulls in a substantial portion of the library.

**Recommendation:**

- Consider whether the `motion.div` wrappers in `AudioPlayer` (only used for the play button hover/tap scale effect) justify the import. CSS `transform: scale()` with `:hover`/`:active` pseudo-classes would achieve the same effect with zero JS cost.
- For `FlashcardSummary`, the trophy entrance animation (`initial={{ scale: 0 }}, animate={{ scale: 1 }}`) could be replaced with a CSS `@keyframes` animation.
- `FlashcardCard`'s 3D flip animation and `QuizPlayer`'s `AnimatePresence` slide transitions are more justifiable uses of Framer Motion.
- If the overall bundle is a concern, consider the `motion/react` "lite" import path (available in Framer Motion v11+) or CSS-based alternatives for simple animations.

---

### 3.2 [INFORMATIONAL] Markmap dynamically imported -- good practice

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/MindMapViewer.tsx` (line 13)

```tsx
const MarkmapRenderer = dynamic(() => import('./MarkmapRenderer'), {
  ssr: false,
  loading: () => (
    <div className="...">
      <div className="... animate-spin ..." />
    </div>
  ),
});
```

The `markmap-view` and `markmap-common` libraries are dynamically imported via Next.js `dynamic()`, which splits them into a separate chunk loaded only when a mind map is actually rendered. This is excellent practice for a heavy dependency.

---

### 3.3 [INFORMATIONAL] Lucide-react icons imported per-icon -- good practice

All components import specific icons from `lucide-react` (e.g., `import { Play, Pause } from 'lucide-react'`), which enables tree-shaking. No barrel-import concerns.

---

## 4. Additional Observations

### 4.1 [LOW] MarkmapRenderer: Effect dependency array excludes `data` and `isDark`

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/MarkmapRenderer.tsx` (line 90)

```tsx
// Effect 1: Create markmap instance
useEffect(() => { ... }, [mounted])  // data and isDark not in deps
```

This is intentional (documented with a comment on line 88-89), as data and theme updates are handled by separate effects (Effects 2 and 3). However, this means the initial render uses whatever `data` and `isDark` values are available at mount time, and the separate effects then update them. This is a valid pattern but could cause a brief visual flicker if `data` changes synchronously between mount and the next effect cycle.

### 4.2 QuizPlayer: `handleSubmit` uses artificial 300ms delay

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/QuizPlayer.tsx` (line 259)

```tsx
await new Promise(resolve => setTimeout(resolve, 300));
```

This is explicitly for UX feedback (showing a loading spinner), which is acceptable. However, if score calculation is instantaneous (which it always is -- it is a simple loop), the spinner creates a perceptible delay for no computational reason.

### 4.3 FlashcardViewer: `cardsFingerprint` recomputed every render

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx` (line 61)

```tsx
const cardsFingerprint = content.cards.map(c => c.id).join(',');
```

This string is recomputed on every render. It should be wrapped in `useMemo(() => content.cards.map(c => c.id).join(','), [content.cards])`.

---

## 5. Summary of Recommendations

| Priority | Item                           | Component                           | Action                                                              |
| -------- | ------------------------------ | ----------------------------------- | ------------------------------------------------------------------- |
| High     | Markmap XSS defense            | MarkmapRenderer / mindmap-transform | Export escapeHtml, add unit test for script injection in labels     |
| Medium   | Image URL domain validation    | InfographicViewer                   | Validate imageUrl against allowed domains, or use Next.js Image     |
| Medium   | Audio URL validation           | AudioPlayer                         | Add domain whitelist check for playbackUrl                          |
| Medium   | Defeat of React.memo           | FlashcardViewer -> FlashcardCard    | Wrap onCardFlip in useCallback                                      |
| Medium   | Missing memoization            | QuizPlayer                          | Move pure functions outside component, wrap handlers in useCallback |
| Medium   | Dependency cycle in callbacks  | FlashcardViewer                     | Consider useReducer for consolidated state                          |
| Medium   | Framer Motion bundle cost      | AudioPlayer, FlashcardSummary       | Replace simple animations with CSS alternatives                     |
| Low      | localStorage parse safety      | FlashcardViewer, QuizPlayer         | Already wrapped in try/catch -- adequate                            |
| Low      | cardsFingerprint recomputation | FlashcardViewer                     | Wrap in useMemo                                                     |
| Low      | handlePrevious stale dep       | FlashcardViewer                     | Refactor to use functional updater only                             |

---

## 6. Files Reviewed

| File                          | Lines | Findings                                           |
| ----------------------------- | ----- | -------------------------------------------------- |
| `index.ts`                    | 19    | None                                               |
| `AudioPlayer.tsx`             | 457   | 1 security (medium), 1 bundle (low)                |
| `EnrichmentErrorBoundary.tsx` | 91    | 1 security (low)                                   |
| `FlashcardCard.tsx`           | 96    | 1 security (low, safe)                             |
| `FlashcardDots.tsx`           | 57    | None                                               |
| `FlashcardSummary.tsx`        | 106   | 1 bundle (low)                                     |
| `FlashcardViewer.tsx`         | 495   | 3 performance (medium)                             |
| `InfographicViewer.tsx`       | 182   | 1 security (medium), 1 performance (informational) |
| `MarkmapRenderer.tsx`         | 159   | 1 security (high, mitigated), 1 performance (low)  |
| `MindMapViewer.tsx`           | 129   | 1 bundle (informational, good)                     |
| `QuizPlayer.tsx`              | 830   | 1 security (low, safe), 1 performance (medium)     |
| `StudyGuideViewer.tsx`        | 140   | 1 security (low, safe)                             |

**Supporting files reviewed:**

- `/home/me/code/mc2/packages/web/lib/helpers/mindmap-transform.ts` -- XSS escaping logic
- `/home/me/code/mc2/packages/web/components/markdown/MarkdownRendererFull.tsx` -- Markdown rendering safety
- `/home/me/code/mc2/packages/shared-types/src/enrichment-content.ts` -- Zod schemas for content validation
- `/home/me/code/mc2/packages/web/next.config.ts` -- CSP headers
- `markmap-view@0.18.12/dist/index.js` -- innerHTML usage confirmation
