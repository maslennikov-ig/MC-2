# Security & Performance Code Review: Enrichment Components

**Directory:** `packages/web/components/course/viewer/enrichments/`
**Review Date:** 2026-03-04
**Focus Areas:** XSS, unsafe HTML rendering, React re-renders, memoization, bundle size

---

## Executive Summary

The enrichment components are **generally well-implemented** from a security perspective. No `dangerouslySetInnerHTML` usage exists within the enrichments directory. The most significant finding is a **medium-severity XSS vector in the InfographicViewer** through unvalidated image URLs, along with several performance optimization opportunities around missing memoization and bundle size concerns.

**Severity Counts:**

- Critical: 0
- High: 1
- Medium: 4
- Low: 6
- Informational: 4

---

## 1. Security Findings

### 1.1 [HIGH] InfographicViewer: Unvalidated `imageUrl` in `<img src>`

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/InfographicViewer.tsx`
**Lines:** 81, 154

```tsx
<img
  src={content.imageUrl}
  alt={content.altText ?? t('viewer.infographic.defaultAlt')}
  ...
/>
```

**Issue:** The `content.imageUrl` is rendered directly as an `<img src>` attribute. While the Zod schema (`infographicEnrichmentContentSchema`) validates this as `z.string().url()`, this validation only ensures the string is a valid URL format. It does not restrict the URL protocol or domain.

**Risk Scenarios:**

- If the schema validation is bypassed (e.g., data loaded from a corrupted JSONB column, or schema evolution leaves stale data), a `javascript:` URI could theoretically be injected. However, modern browsers generally block `javascript:` in `<img src>`.
- More realistically, an attacker-controlled URL could point to a tracking pixel or an external domain for SSRF-style data exfiltration (IP address, user-agent leakage).
- No Content Security Policy (CSP) `img-src` restriction was observed to limit image sources.

**Recommendation:**

- Validate that `imageUrl` begins with `https://` and matches expected Supabase Storage domains before rendering.
- Use Next.js `<Image>` component with `domains` configuration for allowlisting.
- Consider a URL allowlist pattern: `content.imageUrl.startsWith('https://your-supabase-project.supabase.co/')`.

---

### 1.2 [MEDIUM] StudyGuideViewer: Markdown Rendering Without Explicit Sanitization

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/StudyGuideViewer.tsx`
**Lines:** 69, 81, 132

```tsx
<MarkdownRendererFull content={section.content} preset="preview" />
<MarkdownRendererFull content={content.markdown} preset="preview" />
<MarkdownRendererFull content={content.markdown} preset="lesson" />
```

**Issue:** The `MarkdownRendererFull` component uses `react-markdown` with `remarkGfm` and `rehypeKatex` but does **not** use `rehype-sanitize`. By default, `react-markdown` does NOT render raw HTML from markdown source, which provides baseline safety. However:

1. The `rehypeKatex` plugin processes LaTeX and generates HTML output that is injected into the HAST. A malicious LaTeX expression could potentially exploit KaTeX parsing edge cases.
2. The `MarkdownRendererFull` renders content from LLM-generated study guides (stored in the `content` JSONB column). While this is not user-generated content in the traditional sense, it is LLM-generated and stored in the database, creating an indirect injection vector if the LLM is prompt-injected.

**Mitigating Factors:**

- `react-markdown` strips raw HTML by default (no `rehype-raw` plugin is used).
- The project has a separate `getRehypePluginsUntrusted()` function with `rehype-sanitize` that is available but NOT used by `MarkdownRendererFull`.
- KaTeX is configured with `strict: 'ignore'` which silences warnings but does not inherently create XSS vectors.

**Recommendation:**

- Consider adding `rehype-sanitize` to `MarkdownRendererFull` when rendering LLM-generated content, or at minimum document the trust boundary decision.
- The `preset` parameter could be extended to indicate trust level and conditionally apply sanitization.

---

### 1.3 [MEDIUM] MindMap: XSS-Safe via HTML Escaping (Verified)

**File:** `/home/me/code/mc2/packages/web/lib/helpers/mindmap-transform.ts`
**Lines:** 10-19, 34-44

```tsx
function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch] ?? ch)
}

export function toMarkmapNode(node: MindMapNode, depth = 0): IPureNode {
  let content = escapeHtml(node.label)
  if (node.description) {
    content += `<br/><small style="opacity:0.7">${escapeHtml(node.description)}</small>`
  }
  ...
}
```

**Assessment:** This is a POSITIVE finding. The `markmap-view` library renders `content` as `innerHTML`, which would be an XSS vector. The `toMarkmapNode()` function correctly HTML-escapes all LLM-generated text (`label`, `description`) before inserting it into the HTML template. Only safe structural tags (`<br/>`, `<small>`) are added unescaped. The code includes clear security comments explaining the rationale.

**No action required.**

---

### 1.4 [MEDIUM] FlashcardCard: Text Content Rendered as React Children (Safe)

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/FlashcardCard.tsx`
**Lines:** 71, 89

```tsx
<p className="...">{card?.front}</p>
<p className="...">{card?.back}</p>
```

**Assessment:** The flashcard front/back text is rendered as React children (`{card?.front}`), which means React automatically escapes the content. This is safe against XSS. No `dangerouslySetInnerHTML` is used.

**No action required.**

---

### 1.5 [LOW] QuizPlayer: Question/Option Text Rendered Safely

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/QuizPlayer.tsx`
**Lines:** 432, 511, 631, 649

```tsx
<CardTitle className="text-xl">{currentQuestion.question}</CardTitle>
...
<Label htmlFor={option.id} className="flex-1 cursor-pointer text-base">
  {option.text}
</Label>
```

**Assessment:** All quiz question text, option text, and explanation text is rendered as React children. React's JSX rendering automatically escapes HTML entities. This is safe.

**No action required.**

---

### 1.6 [LOW] localStorage Usage Without Size Limits

**Files:**

- `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx` (lines 66, 90)
- `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/QuizPlayer.tsx` (lines 132, 160)

```tsx
const FLASHCARD_STORAGE_KEY = (id: string) => `flashcard_progress_${id}`;
const QUIZ_STORAGE_KEY = (id: string) => `quiz_progress_${id}`;
```

**Issue:** Both FlashcardViewer and QuizPlayer persist progress to `localStorage` using keys derived from `enrichmentId`. While the data stored is small (answer state), there is no cleanup mechanism for old entries. Over time, if a user interacts with many enrichments, localStorage could accumulate stale keys.

**Risk:** Minimal. The `enrichmentId` comes from a database UUID, so key injection is unlikely. The `catch` blocks properly suppress errors.

**Recommendation:**

- Consider adding a TTL-based cleanup mechanism or using `sessionStorage` instead.
- Add a maximum key count or expiry check.

---

### 1.7 [LOW] EnrichmentErrorBoundary: Error Details Logged to Console

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/EnrichmentErrorBoundary.tsx`
**Lines:** 30-38

```tsx
componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
  console.error('Enrichment error:', {
    type: this.props.enrichmentType,
    id: this.props.enrichmentId,
    error: error.message,
    stack: error.stack,
    componentStack: errorInfo.componentStack,
  })
}
```

**Issue:** Error details including stack traces are logged to `console.error`. In production, this exposes internal implementation details to anyone with browser dev tools open.

**Recommendation:**

- Send errors to a structured error reporting service (e.g., Sentry) instead of console.
- Suppress detailed stack traces in production builds.

---

## 2. Performance Findings

### 2.1 [MEDIUM] QuizPlayer: Missing Memoization on Expensive Render Helpers

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/QuizPlayer.tsx`
**Lines:** 304-361

```tsx
const getDifficultyColor = (difficulty: string) => { ... }
const getBloomColor = (level: string) => { ... }
const getDifficultyLabel = (difficulty: string) => { ... }
const getBloomLabel = (level: string) => { ... }
```

**Issue:** These four functions are recreated on every render. While individually lightweight, they are called inside the `questions.map()` loop in the results review section (line 425), multiplying the overhead. The `handleAnswerChange`, `handleNext`, and `handlePrevious` functions (lines 214, 238, 247) are also not wrapped in `useCallback`.

**Recommendation:**

- Move `getDifficultyColor`, `getBloomColor`, `getDifficultyLabel`, `getBloomLabel` outside the component as pure utility functions (they only depend on their argument and the translation function `t`). For the label functions that use `t`, consider `useMemo` or extracting to a hook.
- Wrap `handleAnswerChange`, `handleNext`, `handlePrevious` in `useCallback`.

---

### 2.2 [LOW] FlashcardViewer: `onCardFlip` Created on Every Render

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx`
**Lines:** 237-239

```tsx
const onCardFlip = () => {
  if (!isDraggingRef.current) handleFlip();
};
```

**Issue:** `onCardFlip` is created as a new function reference on every render, which causes the memoized `FlashcardCard` (wrapped in `React.memo`) to receive a new `onFlip` prop and re-render unnecessarily. This defeats the purpose of the `React.memo` wrapper on `FlashcardCard`.

**Recommendation:**

```tsx
const onCardFlip = useCallback(() => {
  if (!isDraggingRef.current) handleFlip();
}, [handleFlip]);
```

---

### 2.3 [LOW] FlashcardDots: Not Memoized, Receives Unstable Callback Props

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/FlashcardDots.tsx`

**Issue:** `FlashcardDots` is a plain function component (not wrapped in `React.memo`). It receives `onNavigate` as an inline arrow function from `FlashcardViewer` (line 432):

```tsx
onNavigate={(i) => {
  setCurrentIndex(i)
  setIsFlipped(false)
}}
```

This inline function creates a new reference on every render, so even if `FlashcardDots` were memoized, it would still re-render. For a component that renders up to 30 button elements, this is a minor concern.

**Recommendation:**

- Wrap `FlashcardDots` in `React.memo`.
- Stabilize the `onNavigate` callback with `useCallback`.
- Similarly, stabilize `cardOfLabel` with `useCallback`.

---

### 2.4 [LOW] FlashcardSummary: Not Memoized

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/FlashcardSummary.tsx`

**Issue:** `FlashcardSummary` accepts simple primitive props and a stable `onReset` callback but is not wrapped in `React.memo`. Since it is rendered in the `isFinished` state, re-renders are less frequent, making this a low-priority optimization.

**Recommendation:** Wrap in `React.memo` for consistency with `FlashcardCard`.

---

### 2.5 [LOW] AudioPlayer: Multiple State Updates Not Batched (Pre-React 18 Pattern)

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/AudioPlayer.tsx`
**Lines:** 132-158

```tsx
useEffect(() => {
  const audio = audioRef.current
  if (!audio || !playbackUrl) {
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setIsMuted(false)
    setVolume(0.8)
    setPlaybackRate(1)
    setHasError(false)
    return
  }
  ...
}, [playbackUrl])
```

**Issue:** Seven separate `setState` calls in the same effect. In React 18+, these are automatically batched, so this is not a functional problem. However, the pattern suggests the state could be consolidated into a single `useReducer` for clarity and maintainability.

**Recommendation:** Consider refactoring to `useReducer` with a `RESET` action for cleaner state management.

---

### 2.6 [INFORMATIONAL] InfographicViewer: `useCallback` Wrappers on Simple Setters

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/InfographicViewer.tsx`
**Lines:** 40-58

```tsx
const handleZoomIn = useCallback(() => { setZoomLevel(...) }, [])
const handleZoomOut = useCallback(() => { setZoomLevel(...) }, [])
const handleZoomReset = useCallback(() => { setZoomLevel(1) }, [])
const handleDoubleClick = useCallback(() => { setZoomLevel(...) }, [])
const handleOpenDialog = useCallback(() => { ... }, [])
```

**Assessment:** These `useCallback` wrappers are technically correct but provide marginal benefit since the child components (`Button`, `img`) are native HTML elements that do not implement `React.memo`. The callbacks are stable (empty dependency arrays), so there is no harm, but they add slight code overhead.

**No action required.** This is acceptable defensive coding.

---

## 3. Bundle Size Findings

### 3.1 [MEDIUM] Heavy Dependencies Not Code-Split

**Affected files and dependencies:**

| Component              | Heavy Dependencies                                                | Approx. Size (gzipped) |
| ---------------------- | ----------------------------------------------------------------- | ---------------------- |
| `AudioPlayer.tsx`      | `framer-motion`                                                   | ~40-50 kB              |
| `FlashcardViewer.tsx`  | `framer-motion`, `AnimatePresence`                                | ~40-50 kB              |
| `FlashcardCard.tsx`    | `framer-motion`                                                   | (shared)               |
| `FlashcardSummary.tsx` | `framer-motion`                                                   | (shared)               |
| `QuizPlayer.tsx`       | `framer-motion`, `AnimatePresence`                                | (shared)               |
| `MarkmapRenderer.tsx`  | `markmap-view`, `markmap-common`                                  | ~80-100 kB             |
| `StudyGuideViewer.tsx` | `MarkdownRendererFull` (react-markdown + rehypeKatex + KaTeX CSS) | ~100+ kB               |

**Positive Finding:** `MindMapViewer.tsx` correctly uses `next/dynamic` to lazy-load `MarkmapRenderer`:

```tsx
const MarkmapRenderer = dynamic(() => import('./MarkmapRenderer'), {
  ssr: false,
  loading: () => ( ... ),
})
```

This is the correct pattern for heavy client-only dependencies.

**Issue:** The following heavy components are NOT lazy-loaded:

1. `QuizPlayer` (31 kB source, imports framer-motion + many UI components)
2. `StudyGuideViewer` (imports `MarkdownRendererFull` which pulls in react-markdown, remarkGfm, remarkMath, rehypeKatex, and katex CSS)
3. `AudioPlayer` (15 kB source, imports framer-motion)

All are exported from `index.ts` and likely imported eagerly by the parent viewer component.

**Recommendation:**

- Apply the same `next/dynamic` pattern to `QuizPlayer`, `StudyGuideViewer`, and `AudioPlayer` at their import sites.
- Especially `StudyGuideViewer` which transitively imports KaTeX CSS (~28 kB gzipped) and the full react-markdown pipeline.
- If `framer-motion` is already used elsewhere in the app bundle, the shared cost is amortized. Verify with `next build --analyze`.

---

### 3.2 [INFORMATIONAL] InfographicViewer: Uses Native `<img>` Instead of Next.js `<Image>`

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/InfographicViewer.tsx`
**Lines:** 80-85, 153-166

```tsx
<img
  src={content.imageUrl}
  alt={content.altText ?? t('viewer.infographic.defaultAlt')}
  className="h-auto max-h-48 w-full object-contain ..."
  loading="lazy"
/>
```

**Issue:** Using native `<img>` instead of Next.js `<Image>` means:

1. No automatic image optimization (WebP/AVIF conversion, responsive srcsets).
2. No automatic lazy loading with intersection observer (though `loading="lazy"` is used as a fallback).
3. No layout shift prevention (width/height are not specified).

**Recommendation:**

- If the image URLs come from Supabase Storage, configure `next.config.js` `remotePatterns` and use `<Image>` for automatic optimization.
- If URLs are dynamic and cannot be allowlisted, the current approach with `loading="lazy"` is acceptable.

---

### 3.3 [INFORMATIONAL] QuizPlayer: Large Component (830 lines)

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/QuizPlayer.tsx`

**Issue:** At 830 lines and 31 kB, `QuizPlayer` is the largest single component. It contains both the quiz-taking view and the results review view in one file. This makes it harder to tree-shake and increases the initial parse cost.

**Recommendation:**

- Extract the results summary view (lines 370-535) into a separate `QuizResults.tsx` component.
- Extract `computeIsCorrect()` and the color/label helper functions into a separate utility file.
- This would improve code maintainability and could enable lazy-loading the results view.

---

### 3.4 [INFORMATIONAL] MarkmapRenderer: Effect Dependencies May Cause Unnecessary Recreations

**File:** `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/MarkmapRenderer.tsx`
**Lines:** 52-90

```tsx
// Effect 1: Create markmap instance on mount
useEffect(() => {
  ...
  const mm = Markmap.create(svg, { ...opts, autoFit: true }, data)
  ...
}, [mounted])  // <-- only depends on `mounted`, not `data` or `isDark`
```

**Assessment:** The effect dependency design is intentional and documented with comments. Effect 1 creates the instance once, Effect 2 updates data, Effect 3 updates colors. This is a correct optimization pattern that avoids destroying and recreating the markmap instance on every data or theme change.

**No action required.** The pattern is sound.

---

## 4. Summary of Recommendations

### Priority 1 (Address Soon)

1. **InfographicViewer image URL validation** - Add protocol and domain allowlisting for `content.imageUrl` before rendering in `<img src>`.
2. **Lazy-load heavy enrichment components** - Apply `next/dynamic` to `QuizPlayer`, `StudyGuideViewer`, and `AudioPlayer` at their import sites.

### Priority 2 (Should Fix)

3. **FlashcardViewer `onCardFlip`** - Wrap in `useCallback` to preserve `React.memo` effectiveness on `FlashcardCard`.
4. **QuizPlayer helper functions** - Move pure color/label mappers outside the component; wrap remaining handlers in `useCallback`.
5. **Consider `rehype-sanitize` for LLM content** - Evaluate adding sanitization to `MarkdownRendererFull` when rendering LLM-generated content (study guide markdown).

### Priority 3 (Nice to Have)

6. **Memoize `FlashcardDots` and `FlashcardSummary`** with `React.memo`.
7. **Stabilize inline callbacks** passed to `FlashcardDots` (`onNavigate`, `cardOfLabel`).
8. **Replace native `<img>` with Next.js `<Image>`** in InfographicViewer for automatic optimization.
9. **Extract QuizPlayer results view** into a separate component for maintainability.
10. **Add localStorage cleanup** for stale flashcard/quiz progress entries.
11. **Replace console.error in error boundary** with structured error reporting.

---

## 5. Positive Patterns Observed

The codebase demonstrates several security and performance best practices worth noting:

1. **No `dangerouslySetInnerHTML`** anywhere in the enrichments directory.
2. **Mind map HTML escaping** is thorough with clear security documentation in `mindmap-transform.ts`.
3. **React children rendering** consistently used for all text content, providing automatic XSS protection.
4. **`React.memo` on `FlashcardCard`** - correct optimization for an animation-heavy component.
5. **`useMemo` for `markmapData`** in `MindMapViewer` prevents unnecessary tree transformations.
6. **`next/dynamic` SSR-disabled import** for `MarkmapRenderer` correctly handles client-only dependencies.
7. **Stable ref patterns** in `AudioPlayer` (`isPlayingRef`, `onPlayingChangeRef`) to avoid stale closures.
8. **Error boundary** wrapping enrichment components with graceful fallback UI and retry capability.
9. **localStorage error handling** with try/catch blocks in both FlashcardViewer and QuizPlayer.
10. **Keyboard accessibility** implemented across FlashcardCard, FlashcardViewer, InfographicViewer, and AudioPlayer.
11. **ARIA attributes** used consistently (aria-label, aria-live, aria-valuetext, aria-pressed).
12. **Mind map depth validation** (`MIND_MAP_MAX_DEPTH = 50`) with iterative BFS prevents stack overflow from malicious deeply-nested trees.
