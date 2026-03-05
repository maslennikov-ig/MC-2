# Code Review: Enrichments Viewer — Security & Performance

**Date**: 2026-03-04
**Scope**: `packages/web/components/course/viewer/enrichments/` — all 12 source files reviewed for XSS vulnerabilities, unsafe HTML rendering, React re-render performance, memoization gaps, and bundle size concerns.
**Files Reviewed**: 12
**Lines Changed**: N/A (full directory review, not a diff)

## Summary

| Category     | Critical | High  | Medium | Low   |
| ------------ | -------- | ----- | ------ | ----- |
| Issues       | 0        | 1     | 3      | 2     |
| Improvements | —        | 3     | 4      | 2     |
| **Total**    | **0**    | **4** | **7**  | **4** |

**Verdict**: NEEDS WORK — has high-priority issues and improvements that should be addressed.

## Issues

### Critical

No critical issues found. The codebase does not use `dangerouslySetInnerHTML`, all markdown is rendered via `react-markdown` (which sanitizes by default), and all user-facing text is rendered as React text nodes (inherently safe from XSS). Image URLs are validated by Zod schema (`z.string().url()`).

### High

#### 1. QuizPlayer localStorage deserialization trusts untrusted shape without validation

- **File**: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx:131-143`
- **Problem**: The quiz state is loaded from `localStorage` via `JSON.parse()` and cast as `QuizState` using a bare type assertion (`as QuizState`). If a malicious script or browser extension manipulates localStorage, the parsed object could have unexpected properties or types (e.g., `answers` could contain objects instead of strings, `currentQuestionIndex` could be negative or NaN), causing runtime crashes or logic bypass. The same pattern exists in `FlashcardViewer.tsx:65-83` but is slightly less severe because it validates card IDs against the current set.
- **Impact**: An attacker who gains script execution (even limited XSS on the same origin) could manipulate localStorage to: (1) crash the quiz player via unexpected types, (2) forge a passing score by setting `isSubmitted: true` with arbitrary `score`/`totalScore` values (though the code guards against restoring submitted state, the shape itself is not validated), or (3) inject negative `currentQuestionIndex` causing undefined behavior.
- **Fix**:

```typescript
// Before
const parsed = JSON.parse(saved) as QuizState;
if (!parsed.isSubmitted) {
  return parsed;
}

// After — validate shape before trusting
const parsed = JSON.parse(saved);
if (
  parsed &&
  typeof parsed === 'object' &&
  typeof parsed.currentQuestionIndex === 'number' &&
  parsed.currentQuestionIndex >= 0 &&
  parsed.currentQuestionIndex < content.questions.length &&
  typeof parsed.answers === 'object' &&
  !parsed.isSubmitted
) {
  return {
    ...defaultState,
    currentQuestionIndex: parsed.currentQuestionIndex,
    answers: parsed.answers,
  };
}
```

### Medium

#### 2. InfographicViewer uses raw `<img>` tag instead of `next/image`

- **File**: `packages/web/components/course/viewer/enrichments/InfographicViewer.tsx:80-85,153-166`
- **Problem**: Two `<img>` tags render `content.imageUrl` directly. While the URL is Zod-validated as a valid URL (`z.string().url()`), there is no domain allowlist check. A malformed or malicious image URL (e.g., pointing to an external tracking pixel or extremely large image) would be loaded by the browser. Using `next/image` would enforce the configured `remotePatterns` allowlist from `next.config.js` and provide automatic optimization.
- **Impact**: Potential for SSRF-like image loading from arbitrary domains, missing image optimization (no WebP/AVIF conversion, no responsive srcset, no lazy-loading optimization beyond `loading="lazy"` on the thumbnail), and no protection against oversized images that could cause memory pressure in the browser.
- **Fix**:

```typescript
// Before
<img
  src={content.imageUrl}
  alt={content.altText ?? t('viewer.infographic.defaultAlt')}
  className="h-auto max-h-48 w-full object-contain ..."
  loading="lazy"
/>

// After
import Image from 'next/image'

<Image
  src={content.imageUrl}
  alt={content.altText ?? t('viewer.infographic.defaultAlt')}
  width={content.dimensions?.width ?? 800}
  height={content.dimensions?.height ?? 600}
  className="h-auto max-h-48 w-full object-contain ..."
  loading="lazy"
/>
```

#### 3. QuizPlayer re-creates handler functions on every render

- **File**: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx:214-254,304-361`
- **Problem**: Several handler functions (`handleAnswerChange`, `handleNext`, `handlePrevious`, `handleRetry`, `getDifficultyColor`, `getBloomColor`, `getDifficultyLabel`, `getBloomLabel`, `isAnswerCorrect`) are declared as plain functions inside the component body, not wrapped in `useCallback` or `useMemo`. While `toggleMultiSelectOption` is correctly memoized, the others are not. Each render creates new function references.
- **Impact**: These functions are passed as props or used in callbacks. While the performance impact is moderate for a quiz (low re-render frequency), it creates unnecessary work during AnimatePresence transitions and could cause child component re-renders if any of these are passed to memoized children. The `getDifficultyColor`, `getBloomColor`, `getDifficultyLabel`, and `getBloomLabel` helper functions are pure (no dependencies) and should be extracted outside the component entirely.
- **Fix**:

```typescript
// Before (inside component)
const getDifficultyColor = (difficulty: string) => {
  switch (difficulty) { ... }
}

// After (outside component — zero cost)
function getDifficultyColor(difficulty: string): string {
  switch (difficulty) { ... }
}

// For handlers with state dependencies:
const handleAnswerChange = useCallback((questionId: string, answer: string | boolean) => {
  setState((prev) => ({
    ...prev,
    answers: { ...prev.answers, [questionId]: answer },
  }))
}, [])
```

#### 4. MarkmapRenderer Effect 1 dependency array omits `data` and `isDark`

- **File**: `packages/web/components/course/viewer/enrichments/MarkmapRenderer.tsx:52-90`
- **Problem**: Effect 1 creates the Markmap instance with `data` and uses `isDark` for initial colors, but the dependency array is `[mounted]`. This is intentional per the comment ("Data and theme updates are handled by separate effects below"), and Effects 2 and 3 do handle updates. However, this creates a subtle timing bug: if `data` changes while `mounted` is false (e.g., during SSR hydration), the stale initial data is used when the effect finally fires, and Effect 2 may not run because `mmRef.current` is still null at that point. Also, the React linting rule `react-hooks/exhaustive-deps` would flag this.
- **Impact**: Low probability in practice because `mounted` typically becomes true before data changes, but this is a correctness concern that could manifest as stale mind map data on initial render in edge cases (e.g., slow hydration + fast data update).
- **Fix**: Add `data` and `isDark` to the dependency array of Effect 1, or restructure to use a single effect.

### Low

#### 5. FlashcardViewer creates new `onNavigate` callback on every render

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:432-435`
- **Problem**: The `onNavigate` prop passed to `FlashcardDots` is an inline arrow function `(i) => { setCurrentIndex(i); setIsFlipped(false) }`. This means `FlashcardDots` receives a new function reference on every render, forcing it to re-render even though its content hasn't changed. `FlashcardDots` is not wrapped in `React.memo`, so this isn't currently causing extra renders, but it prevents future memoization.
- **Impact**: Minor. `FlashcardDots` already returns null for >30 cards, limiting the render cost. But wrapping it in `React.memo` and stabilizing the callback would be a clean optimization.

#### 6. EnrichmentErrorBoundary concatenates `enrichmentType` prop into error message

- **File**: `packages/web/components/course/viewer/enrichments/EnrichmentErrorBoundary.tsx:48`
- **Problem**: `'Failed to load ' + this.props.enrichmentType` directly concatenates the prop value into the UI text. Since this is rendered as a React text node (not innerHTML), there is no XSS risk. However, if `enrichmentType` contained unexpected characters (e.g., very long strings), it could cause layout issues.
- **Impact**: Cosmetic only. No security risk because React escapes text node content.

## Improvements

### High

#### 7. `markmap-view` is a heavy dependency loaded synchronously on import

- **File**: `packages/web/components/course/viewer/enrichments/MarkmapRenderer.tsx:5`
- **Problem**: `markmap-view` (and its dependency `d3`) is imported statically at the top of `MarkmapRenderer.tsx`. While `MindMapViewer.tsx` correctly uses `next/dynamic` to lazy-load `MarkmapRenderer`, the `markmap-common` type import in `MarkmapRenderer.tsx` still pulls in the full module at the component level. The `markmap-view` package bundles ~150KB+ (minified) of D3 code.
- **Impact**: The dynamic import in `MindMapViewer` mitigates the bundle impact for the initial page load. However, if any other component imports `MarkmapRenderer` directly (bypassing `MindMapViewer`), the full D3 bundle would be included in the main chunk. This is well-handled currently but fragile.
- **Recommended**: Add a comment to `MarkmapRenderer.tsx` warning against direct imports, or make it a private module by removing the default export and only exporting from `MindMapViewer`.

```typescript
// Current — default export allows direct import
export default MarkmapRenderer;

// Recommended — remove default export, keep it internal
// Only MindMapViewer.tsx should import this via dynamic()
export { MarkmapRenderer };
```

#### 8. FlashcardDots is not memoized despite receiving stable primitive props

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardDots.tsx`
- **Problem**: `FlashcardDots` re-renders on every parent state change (card flip, navigation, assessment). The `cards` array, `knownIds` Set, and `unknownIds` Set are reconstructed on most interactions in `FlashcardViewer`. The component renders up to 30 dot buttons.
- **Impact**: Each parent interaction (flip, know/don't-know) triggers a re-render of all dots. With `React.memo` and stabilized `onNavigate` callback, these re-renders could be eliminated for interactions that don't change the dots' visual state.
- **Recommended**:

```typescript
// Wrap in React.memo (like FlashcardCard already does)
export const FlashcardDots = React.memo(function FlashcardDots({ ... }) {
  ...
})
```

#### 9. QuizPlayer component is 830 lines — should be decomposed

- **File**: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx`
- **Problem**: At 830 lines, `QuizPlayer` is the largest component in this directory and handles: state management, localStorage persistence, score calculation, results view, question rendering (4 types), navigation, and metadata display. This makes it difficult to maintain, test, and optimize. Compare with `FlashcardViewer` which properly decomposed into `FlashcardCard`, `FlashcardDots`, and `FlashcardSummary`.
- **Impact**: The monolithic structure means every state change re-renders the entire quiz UI. Extracting `QuizResultsView`, `QuestionCard`, and `QuizNavigation` as separate components would enable targeted memoization and reduce cognitive complexity.
- **Recommended**: Extract sub-components following the FlashcardViewer pattern:
  - `QuizResultsView` — the submitted state results summary
  - `QuizQuestionCard` — individual question rendering
  - `QuizNavigation` — prev/next/submit buttons
  - Move `getDifficultyColor`, `getBloomColor`, `getDifficultyLabel`, `getBloomLabel` to a shared util file

### Medium

#### 10. `framer-motion` AnimatePresence in FlashcardViewer wraps self-assessment buttons

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:357-390`
- **Problem**: `AnimatePresence` is used for the know/don't-know buttons that appear after flipping. This is fine for UX, but the `motion.div` with `initial/animate/exit` transitions triggers layout recalculations on every flip. Combined with the `motion.div` drag wrapper (lines 330-344) and `FlashcardCard`'s spring animation, there are 3 concurrent animation layers.
- **Impact**: On low-end mobile devices, the simultaneous 3D card flip (spring animation) + drag constraints + AnimatePresence fade could cause frame drops. Consider using CSS transitions for the simpler fade-in/out of assessment buttons.
- **Recommended**: Replace `AnimatePresence` with CSS `transition` + conditional `opacity`/`transform` classes for the assessment buttons.

#### 11. AudioPlayer has multiple sequential state resets in the URL-change effect

- **File**: `packages/web/components/course/viewer/enrichments/AudioPlayer.tsx:132-158`
- **Problem**: When `playbackUrl` changes, the effect calls 7 sequential `setState` calls (`setIsPlaying`, `setCurrentTime`, `setDuration`, `setIsMuted`, `setVolume`, `setPlaybackRate`, `setHasError`). React 18 batches these in effects, so they become a single re-render. However, the same effect exists at lines 132-158 AND lines 71-130, both depending on `playbackUrl`, which means two effects run on URL change with overlapping cleanup logic (both pause audio and set `src = ''`).
- **Impact**: Redundant cleanup when `playbackUrl` changes — both effects' cleanup functions fire, both calling `audio.pause()`, `audio.currentTime = 0`, `audio.src = ''`, and `onPlayingChangeRef.current?.(false)`. This is harmless but wasteful. Consider consolidating into a single effect.
- **Recommended**: Merge the two `playbackUrl`-dependent effects into one, or use a `useReducer` for the AudioPlayer state to batch all resets atomically.

#### 12. FlashcardViewer `onCardFlip` is recreated on every render

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:237-239`
- **Problem**: `onCardFlip` is defined as a plain function inside the render body (not in a `useCallback`). It references `isDraggingRef` (stable ref) and `handleFlip` (memoized callback), so it could safely be wrapped in `useCallback([handleFlip])`. Since it is passed to `FlashcardCard` (which IS `React.memo`'d), this causes unnecessary re-renders of the card component on every parent state change.
- **Impact**: `FlashcardCard` re-renders on every parent state change (navigation dot click, know/don't-know assessment, shuffle toggle) even when its visual props (`card`, `isFlipped`, `isFullscreen`, labels) haven't changed, because `onFlip` is a new reference each time.
- **Recommended**:

```typescript
// Before
const onCardFlip = () => {
  if (!isDraggingRef.current) handleFlip();
};

// After
const onCardFlip = useCallback(() => {
  if (!isDraggingRef.current) handleFlip();
}, [handleFlip]);
```

#### 13. StudyGuideViewer does not memoize MarkdownRendererFull content

- **File**: `packages/web/components/course/viewer/enrichments/StudyGuideViewer.tsx:69,81,132`
- **Problem**: `MarkdownRendererFull` is rendered 3 times in the component (section content, preview, and dialog). The `content` prop for the preview and dialog are `content.markdown` (same string), but React will re-render both instances whenever `StudyGuideViewer` re-renders (e.g., when toggling a section or opening the dialog). `MarkdownRendererFull` likely does expensive parsing (remark/rehype pipelines).
- **Impact**: Opening the dialog triggers a re-render that re-parses the same markdown content. The dialog's `MarkdownRendererFull` with `preset="lesson"` is heavier than the preview's `preset="preview"`.
- **Recommended**: Wrap `StudyGuideViewer` sections in `React.memo` or memoize the markdown processing result.

### Low

#### 14. QuizPlayer `handleSubmit` uses artificial delay for UX

- **File**: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx:259`
- **Problem**: `await new Promise((resolve) => setTimeout(resolve, 300))` adds a 300ms artificial delay before score calculation. Score calculation is synchronous and instant (simple loop over questions). The `isCalculating` state + loading overlay is shown during this artificial delay.
- **Impact**: 300ms of unnecessary waiting. The loading overlay may confuse users since the actual computation is instant. If UX feedback is desired, a shorter delay (100ms) or a transition animation would be more appropriate.

#### 15. Unused `content` import type in QuizPlayer

- **File**: `packages/web/components/course/viewer/enrichments/QuizPlayer.tsx:558`
- **Problem**: The `content.quiz_title` and `content.instructions` are rendered directly as text nodes in the quiz header. These come from LLM-generated content stored in the database. While React text nodes are XSS-safe, there is no length or content validation — an extremely long title could break the layout.
- **Impact**: Cosmetic only. No security risk. Consider adding `line-clamp` CSS classes for very long titles.

## Validation

- Type Check: SKIPPED (per task instructions)
- Build: SKIPPED (per task instructions)

## Files Reviewed

| File                          | Lines | Notes                                                |
| ----------------------------- | ----- | ---------------------------------------------------- |
| `index.ts`                    | 18    | Barrel exports, clean                                |
| `AudioPlayer.tsx`             | 456   | Well-structured, good ref patterns                   |
| `EnrichmentErrorBoundary.tsx` | 90    | Class component (required for error boundary), clean |
| `FlashcardCard.tsx`           | 95    | Properly `React.memo`'d                              |
| `FlashcardDots.tsx`           | 56    | Missing `React.memo`                                 |
| `FlashcardSummary.tsx`        | 105   | Clean, no issues                                     |
| `FlashcardViewer.tsx`         | 494   | Good decomposition, minor callback issues            |
| `InfographicViewer.tsx`       | 181   | Uses raw `<img>` instead of `next/image`             |
| `MarkmapRenderer.tsx`         | 158   | Heavy dependency, well-isolated via dynamic import   |
| `MindMapViewer.tsx`           | 128   | Good use of `useMemo` and `dynamic`                  |
| `QuizPlayer.tsx`              | 829   | Largest file, needs decomposition                    |
| `StudyGuideViewer.tsx`        | 139   | Clean, minor memoization gap                         |

## Security Assessment Summary

**XSS Risk: LOW.** All user/LLM-generated content is rendered as React text nodes or via `react-markdown` (which sanitizes HTML by default). No `dangerouslySetInnerHTML` usage. No raw HTML injection vectors. Image URLs are Zod-validated.

**Unsafe HTML Rendering: NONE.** The `MarkdownRendererFull` component uses `react-markdown` with `remarkGfm`/`rehypeKatex` plugins, which do not allow raw HTML passthrough by default.

**localStorage Trust: MEDIUM CONCERN.** Both QuizPlayer and FlashcardViewer deserialize localStorage data with type assertions rather than runtime validation. FlashcardViewer partially validates (filters card IDs), but QuizPlayer trusts the full shape.

## Performance Assessment Summary

**Re-render Efficiency: MODERATE.** `FlashcardCard` is properly memoized. `FlashcardDots` and `FlashcardSummary` are not. `QuizPlayer` is monolithic with no sub-component memoization. Key callbacks (`onCardFlip` in FlashcardViewer, handlers in QuizPlayer) are not stabilized with `useCallback`.

**Bundle Size: WELL-MANAGED.** The heaviest dependency (`markmap-view` + D3, ~150KB) is correctly code-split via `next/dynamic`. `framer-motion` is tree-shakeable and already a top-level dependency. `lucide-react` uses per-icon imports (tree-shakeable).

**Memoization: PARTIAL.** `useMemo` is used for `markmapData` in MindMapViewer. `useCallback` is used extensively in FlashcardViewer and AudioPlayer. QuizPlayer has significant memoization gaps. Pure helper functions inside QuizPlayer should be extracted to module scope.
