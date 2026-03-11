# Code Review: Flashcard Viewer Components

**Date:** 2026-03-04
**Reviewer:** Claude Opus 4.6 (automated)
**Scope:** 4 files in `packages/web/components/course/viewer/enrichments/`
**Branch:** develop (latest commit: `1d57148c` — feat(flashcards): redesign FlashcardViewer UI with fullscreen study mode)

---

## Files Reviewed

| File                   | Lines | Role                                                                |
| ---------------------- | ----- | ------------------------------------------------------------------- |
| `FlashcardViewer.tsx`  | 495   | Orchestrator: state management, navigation, persistence, fullscreen |
| `FlashcardCard.tsx`    | 95    | Presentational: 3D flip card with front/back faces                  |
| `FlashcardDots.tsx`    | 56    | Presentational: progress dot navigation                             |
| `FlashcardSummary.tsx` | 105   | Presentational: end-of-session score summary                        |

---

## 1. Architecture & Component Decomposition

**Rating: Good**

The refactoring (commit `1d57148c`) decomposed the original monolithic `FlashcardViewer` into four well-separated components. The split follows a clean pattern:

- **FlashcardViewer** acts as the orchestrator, owning all state (current index, flip state, known/unknown sets, fullscreen mode, shuffle) and passing data/callbacks down.
- **FlashcardCard** is purely presentational, wrapped in `React.memo` for optimal re-render avoidance.
- **FlashcardDots** and **FlashcardSummary** are stateless presentational components that receive all data through props.

This separation improves testability, readability, and reusability. The i18n labels are passed as props rather than having child components import `useTranslations` directly, which keeps the presentational components framework-agnostic.

**Strengths:**

- Clean single-responsibility per component
- `React.memo` on `FlashcardCard` prevents unnecessary re-renders during navigation
- Labels object pattern in `FlashcardSummary` makes the component portable/testable without next-intl
- `FlashcardDots` gracefully degrades by returning `null` for large decks (> 30 cards)

---

## 2. State Management

**Rating: Good with minor concerns**

### 2.1 localStorage Persistence

The implementation correctly:

- Validates saved IDs against current card set (handles content regeneration)
- Uses `try/catch` around all localStorage calls (Safari private mode, quota exceeded)
- Clamps `currentIndex` to valid range with `Math.min`
- Uses a `cardsFingerprint` (joined card IDs) as a dependency for cache invalidation

**Concern — cardsFingerprint recomputation:**

```typescript
// Line 61 — FlashcardViewer.tsx
const cardsFingerprint = content.cards.map(c => c.id).join(',');
```

This runs on every render. For a typical deck of 10-50 cards, the cost is negligible, but it is technically unnecessary work on each render. A `useMemo` would be more idiomatic:

```typescript
const cardsFingerprint = useMemo(() => content.cards.map(c => c.id).join(','), [content.cards]);
```

**Severity: Low** (performance impact is negligible for expected card counts of 1-100)

### 2.2 Set Cloning Pattern

The `handleKnow`/`handleDontKnow` callbacks create new `Set` copies on each call:

```typescript
const newKnown = new Set(knownIds);
newKnown.add(currentCard.id);
const newUnknown = new Set(unknownIds);
newUnknown.delete(currentCard.id);
```

This is the correct approach for React state immutability. The pattern is consistent across both handlers.

### 2.3 Redundant State Tracking

Both `knownIds` and `unknownIds` are tracked separately. A card removed from "known" is added to "unknown" and vice versa. This is correct but creates a subtle invariant: a card must never be in both sets simultaneously. The code maintains this by always deleting from the opposite set before adding. This invariant is not enforced structurally (e.g., via a single `Map<string, 'known' | 'unknown'>`), but the current approach is clear and functions correctly.

**Suggestion (optional):** A single `Map<string, 'known' | 'unknown'>` or `Record<string, 'known' | 'unknown'>` would eliminate the dual-set invariant entirely and reduce state update code.

---

## 3. Accessibility

**Rating: Good**

The components demonstrate solid accessibility practices:

| Feature                              | Implementation                              | Status  |
| ------------------------------------ | ------------------------------------------- | ------- |
| Keyboard flip                        | `onKeyDown` handler for Enter/Space on card | Present |
| Keyboard navigation (fullscreen)     | ArrowLeft/Right, Space, Escape              | Present |
| `role="button"` on card              | Applied to clickable div                    | Present |
| `tabIndex={0}` on card               | Makes card focusable                        | Present |
| `aria-label` on card                 | Uses translated `flipCardLabel`             | Present |
| `aria-label` on dots                 | Uses `cardOfLabel` callback                 | Present |
| `aria-current` on active dot         | Correctly set as `"true"` / `undefined`     | Present |
| `aria-live="polite"` on counter      | Announces card position changes             | Present |
| `sr-only` on close button            | Screen reader label for X button            | Present |
| Focus management on fullscreen enter | Not implemented                             | Missing |

**Finding — Missing focus trap and focus management in fullscreen mode:**

When the user clicks "Study Mode" to enter fullscreen, focus is not trapped within the fullscreen overlay. Users of screen readers or keyboard-only navigation could tab out of the fullscreen container into hidden content behind the backdrop. Additionally, pressing Escape while focus is on a `<button>` inside the overlay works due to the global keydown listener, but opening/closing fullscreen does not programmatically move focus.

**Recommendation:** Consider adding a focus trap (e.g., `useFocusTrap` or a library like `focus-trap-react`) when `isFullscreen` is true, and restoring focus to the "Study Mode" button when fullscreen is exited.

**Severity: Medium** (accessibility regression for keyboard/screen reader users in fullscreen mode)

**Finding — Keyboard navigation buttons have `tabIndex={-1}`:**

The fullscreen left/right click zone buttons (lines 396-411, 412-424) use `tabIndex={-1}`, which removes them from the tab order. This is intentional since keyboard navigation uses arrow keys in fullscreen, but it means there is no visible focus indicator for these controls. This is acceptable given the arrow key alternative, but worth documenting.

---

## 4. Performance

**Rating: Good**

### 4.1 Re-render Optimization

- `FlashcardCard` is wrapped in `React.memo`, preventing re-renders when only navigation state changes in the parent.
- `FlashcardDots` and `FlashcardSummary` are not memoized. Given their small render cost and the fact that the parent re-renders on every state change anyway, this is appropriate — adding memo would add overhead for minimal benefit.

### 4.2 Callback Stability

All major callbacks in `FlashcardViewer` use `useCallback` with appropriate dependency arrays. This is important because:

- `handleFlip`, `handlePrevious`, `handleNext` are dependencies of the keyboard listener effect
- `handleKnow`, `handleDontKnow` are passed (indirectly) to event handlers in JSX

**Concern — `handlePrevious` dependency on `currentIndex`:**

```typescript
const handlePrevious = useCallback(() => {
  if (currentIndex > 0) {
    setCurrentIndex(prev => prev - 1);
    setIsFlipped(false);
  }
}, [currentIndex]);
```

The guard `currentIndex > 0` requires `currentIndex` in the dependency array, causing `handlePrevious` to be recreated on every index change, which in turn causes the keyboard effect to re-register. An alternative pattern using a ref for the guard condition would stabilize the callback, but the current approach is functionally correct and the effect cleanup/re-registration cost is trivial.

**Severity: Low** (micro-optimization opportunity, not a defect)

### 4.3 Drag Handling

The `isDraggingRef` pattern using `useRef` is well-implemented:

```typescript
onDragStart={() => { isDraggingRef.current = true }}
onDragEnd={(_, info) => {
  if (info.offset.x > 80) handlePrevious()
  else if (info.offset.x < -80) handleNext()
  requestAnimationFrame(() => { isDraggingRef.current = false })
})
```

Using `requestAnimationFrame` to reset the drag flag ensures the click handler (`onCardFlip`) does not fire immediately after a drag ends. This is a known Framer Motion pattern and is correctly implemented.

### 4.4 Animation Performance

The 3D flip animation uses CSS `perspective`, `backfaceVisibility`, and Framer Motion's spring animation. The `transformStyle: 'preserve-3d'` is applied via inline styles, which is appropriate since Tailwind CSS does not expose this property by default.

**Minor observation:** Both card faces use `absolute inset-0` positioning, which means the parent `motion.div` needs explicit `minHeight`. This is set to `220px` via inline style, and duplicated as a Tailwind class `min-h-[220px]` on each face. The inline style on the parent is the one that actually controls height since the children are absolutely positioned. The `min-h-[220px]` classes on the children are redundant (they are absolutely positioned and stretch to fill the parent).

**Severity: Cosmetic** (no functional impact)

---

## 5. Bug Analysis

### 5.1 Potential Bug: `currentCard` can be `undefined`

**File:** `FlashcardViewer.tsx`, line 106

```typescript
const currentCard = cards[currentIndex];
```

If `cards` is empty after a state restoration, `currentCard` will be `undefined`. The early return on line 212 (`if (cards.length === 0)`) guards against this for the initial render, but there is a timing concern: if `content.cards` changes to an empty array between renders while `isFinished` is `false`, the component could briefly render with `currentCard === undefined`.

Looking at the JSX, the `FlashcardCard` component accepts `card: FlashcardItem | undefined` and uses optional chaining (`card?.front`, `card?.back`), so this would render empty text rather than crash. The `handleKnow`/`handleDontKnow` callbacks also have early `if (!currentCard) return` guards.

**Verdict:** Defensively coded. Not a crash-inducing bug, but the empty card render would be a confusing UX if it occurred. The risk is very low since `content.cards` is validated by the Zod schema to have `min(1)`.

**Severity: Low**

### 5.2 Potential Bug: Shuffle state inconsistency on reset

**File:** `FlashcardViewer.tsx`, line 164

```typescript
const handleReset = useCallback(() => {
  setKnownIds(new Set());
  setUnknownIds(new Set());
  setCurrentIndex(0);
  setIsFlipped(false);
  setIsFinished(false);
  setCards(isShuffled ? shuffleArray(content.cards) : content.cards);
  // ...
}, [isShuffled, content.cards, enrichmentId]);
```

When reset is called with shuffle ON, it re-shuffles the cards into a new random order. This is intentional behavior, but the user might expect the same shuffled order as before. This is a UX decision, not a bug.

### 5.3 Observation: `handleNext` skip-save parameter

The `handleNext` function accepts an optional `skipSave` parameter:

```typescript
const handleNext = useCallback(
  (skipSave?: boolean) => {
    if (currentIndex < totalCards - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
    } else {
      setIsFinished(true);
      if (!skipSave) saveProgress(knownIds, unknownIds, currentIndex, true);
    }
  },
  [currentIndex, totalCards, knownIds, unknownIds, saveProgress]
);
```

When called from `handleKnow`/`handleDontKnow`, `skipSave=true` is passed because those callers handle their own persistence. When called directly (via navigation buttons or keyboard), `skipSave` is `undefined` (falsy), so persistence occurs at finish.

**However:** When navigating forward with the arrow button and reaching the last card without rating it, `handleNext()` fires with `skipSave=undefined`, which sets `isFinished=true` and saves progress. The save at this point captures the current `knownIds`/`unknownIds` state, which does NOT include the current card's rating. This means the final card is always "unrated" if the user skips to finish via the next button rather than using Know/Don't Know. This appears to be intentional behavior (you can navigate past without rating), but it is worth noting.

**Severity: Low** (intentional UX behavior)

---

## 6. Security

**Rating: Good**

### 6.1 localStorage Key Construction

```typescript
const FLASHCARD_STORAGE_KEY = (id: string) => `flashcard_progress_${id}`;
```

The `enrichmentId` is a UUID from the database, so there is no risk of key injection. The localStorage usage is read-only from a security perspective (client-side only, no sensitive data).

### 6.2 JSON Parsing from localStorage

```typescript
const parsed = JSON.parse(saved) as { ... }
```

The `as` cast does not validate the shape. If the localStorage data is corrupted or tampered with, `parsed.known` might not be an array, causing `filter` to throw. The `try/catch` wrapping the entire block catches this, but it means any localStorage corruption silently resets the user's progress.

**Recommendation:** Consider adding a lightweight runtime check (e.g., `Array.isArray(parsed.known)`) before using parsed values, or use Zod for localStorage payload validation to match the project's validation patterns.

**Severity: Low** (existing try/catch prevents crashes; only impact is silent progress loss)

### 6.3 XSS Concerns

The card content (`card?.front`, `card?.back`) is rendered as text content inside `<p>` tags, not via `dangerouslySetInnerHTML`. React's default escaping prevents XSS. No vulnerability here.

---

## 7. i18n & Localization

**Rating: Good**

All user-visible strings use `useTranslations('enrichments')` with keys under `viewer.flashcards.*`. Both English and Russian translation files include comprehensive flashcard translations.

**Translation keys used in components:**

| Key                                    | Used In                       | Present in en | Present in ru |
| -------------------------------------- | ----------------------------- | :-----------: | :-----------: |
| `viewer.flashcards.cardOf`             | FlashcardViewer               |      Yes      |      Yes      |
| `viewer.flashcards.title`              | FlashcardViewer               |      Yes      |      Yes      |
| `viewer.flashcards.tapToFlip`          | FlashcardCard (via prop)      |      Yes      |      Yes      |
| `viewer.flashcards.flipCard`           | FlashcardCard (via prop)      |      Yes      |      Yes      |
| `viewer.flashcards.know`               | FlashcardViewer               |      Yes      |      Yes      |
| `viewer.flashcards.dontKnow`           | FlashcardViewer               |      Yes      |      Yes      |
| `viewer.flashcards.summary`            | FlashcardSummary (via labels) |      Yes      |      Yes      |
| `viewer.flashcards.greatJob`           | FlashcardSummary (via labels) |      Yes      |      Yes      |
| `viewer.flashcards.keepPracticing`     | FlashcardSummary (via labels) |      Yes      |      Yes      |
| `viewer.flashcards.score`              | FlashcardSummary (via labels) |      Yes      |      Yes      |
| `viewer.flashcards.total`              | FlashcardSummary (via labels) |      Yes      |      Yes      |
| `viewer.flashcards.known`              | FlashcardSummary (via labels) |      Yes      |      Yes      |
| `viewer.flashcards.unknown`            | FlashcardSummary (via labels) |      Yes      |      Yes      |
| `viewer.flashcards.restart`            | FlashcardSummary (via labels) |      Yes      |      Yes      |
| `viewer.flashcards.shuffle`            | FlashcardViewer               |      Yes      |      Yes      |
| `viewer.flashcards.enterFullscreen`    | FlashcardViewer               |      Yes      |      Yes      |
| `viewer.flashcards.previousCard`       | FlashcardViewer               |      Yes      |      Yes      |
| `viewer.flashcards.nextCard`           | FlashcardViewer               |      Yes      |      Yes      |
| `viewer.flashcards.fullscreenHint`     | FlashcardViewer               |      Yes      |      Yes      |
| `viewer.flashcards.finish`             | FlashcardViewer               |      Yes      |      Yes      |
| `viewer.difficulty.{easy,medium,hard}` | FlashcardViewer               |      Yes      |      Yes      |
| `viewer.noMaterials`                   | FlashcardViewer               |      Yes      |      Yes      |
| `viewer.close`                         | FlashcardViewer               |      Yes      |      Yes      |
| `viewer.back`                          | FlashcardViewer               |      Yes      |      Yes      |
| `viewer.next`                          | FlashcardViewer               |      Yes      |      Yes      |

The `FlashcardSummary` component receives all labels via a `labels` prop object rather than calling `useTranslations` itself. This is a deliberate design choice that keeps the component independent of next-intl and is the same pattern used by the previous code review findings (commit `a56958ce`).

---

## 8. Error Handling

**Rating: Adequate**

- All `localStorage` operations are wrapped in `try/catch` blocks with silent failures.
- The `FlashcardCard` component handles `undefined` card via optional chaining.
- The parent `EnrichmentCard` wraps flashcard viewer rendering behind an `isFlashcardsContent` type guard.
- An `EnrichmentErrorBoundary` component exists in the same directory but is **not** used to wrap the `FlashcardViewer` at either usage site (`EnrichmentCard.tsx` or `lesson-materials-switcher.tsx`).

**Finding — No error boundary wrapping:**

If the `FlashcardViewer` or any of its children throw during render (e.g., unexpected content shape, framer-motion error), the error will propagate up and may crash the entire lesson page.

**Recommendation:** Wrap `FlashcardViewer` usage in `EnrichmentErrorBoundary`:

```tsx
<EnrichmentErrorBoundary enrichmentType="nlm_flashcards" enrichmentId={enrichment.id}>
  <FlashcardViewer content={enrichment.content} enrichmentId={enrichment.id} />
</EnrichmentErrorBoundary>
```

**Severity: Medium** (unhandled render errors could take down the parent page)

---

## 9. Code Quality & Style

**Rating: Very Good**

### Strengths

- Consistent use of TypeScript throughout with proper typing
- JSDoc comments on the main component and module-level constants
- Clean conditional rendering patterns using `&&` and ternaries
- Consistent Tailwind CSS class organization (layout, spacing, colors, dark mode)
- Dark mode support across all components
- Proper `'use client'` directives on all files

### Minor Style Issues

1. **Inconsistent export style:**
   - `FlashcardCard` uses `export const ... = React.memo(function ...)`
   - `FlashcardDots` and `FlashcardSummary` use `export function ...`
   - `FlashcardViewer` uses `export function ...`

   The `React.memo` wrapper on `FlashcardCard` justifies the `const` export, but it creates visual inconsistency. This is acceptable.

2. **`onCardFlip` defined inside render:**

   ```typescript
   const onCardFlip = () => {
     if (!isDraggingRef.current) handleFlip();
   };
   ```

   This function is defined below the early returns (lines 237-239), meaning it is recreated on every render. Since it is only used as an onClick handler for `FlashcardCard` (which is `React.memo`'d), the new reference will cause `FlashcardCard` to re-render on every parent render, partially defeating the `React.memo` optimization.

   **Recommendation:** Wrap in `useCallback`:

   ```typescript
   const onCardFlip = useCallback(() => {
     if (!isDraggingRef.current) handleFlip();
   }, [handleFlip]);
   ```

   **Severity: Low** (minor performance concern; `FlashcardCard` re-renders are cheap)

3. **`cn` import unused in `FlashcardSummary.tsx`:** Actually, `cn` IS used on lines 49 and 55. No issue.

---

## 10. Testing

**Rating: Gap identified**

No test files exist for any of the four flashcard components:

- No unit tests for state logic (shuffle, known/unknown tracking, localStorage persistence)
- No component tests for render output
- No integration tests for keyboard navigation or fullscreen behavior

Given the complexity of the state management (especially localStorage persistence with validation, shuffle state, and the finished/reset flow), unit tests would provide significant value.

**Priority test scenarios:**

1. localStorage save/restore with valid data
2. localStorage restore with stale card IDs (regeneration scenario)
3. Known/unknown toggle behavior (mutual exclusion)
4. Shuffle and reset behavior
5. Keyboard navigation in fullscreen
6. Progress calculation edge cases (0 cards, all known, all unknown)
7. Dots component: hidden for > 30 cards
8. Summary component: score calculation and threshold (80% boundary)

**Severity: Medium** (no test coverage for non-trivial client-side logic)

---

## 11. Summary of Findings

### Critical (0)

None.

### Medium Severity (3)

| #   | Finding                                   | File                                              | Line(s)          |
| --- | ----------------------------------------- | ------------------------------------------------- | ---------------- |
| M1  | No focus trap in fullscreen mode          | FlashcardViewer.tsx                               | 244-254, 393-425 |
| M2  | No error boundary wrapping at usage sites | EnrichmentCard.tsx, lesson-materials-switcher.tsx | 524-528, 387-393 |
| M3  | No test coverage for flashcard components | N/A                                               | N/A              |

### Low Severity (5)

| #   | Finding                                                                          | File                | Line(s) |
| --- | -------------------------------------------------------------------------------- | ------------------- | ------- |
| L1  | `cardsFingerprint` recomputed every render (should be `useMemo`)                 | FlashcardViewer.tsx | 61      |
| L2  | `handlePrevious` recreated on every index change                                 | FlashcardViewer.tsx | 112-117 |
| L3  | `onCardFlip` defined inside render body, defeats `React.memo` on `FlashcardCard` | FlashcardViewer.tsx | 237-239 |
| L4  | No runtime validation of localStorage JSON shape                                 | FlashcardViewer.tsx | 68-69   |
| L5  | Redundant `min-h-[220px]` on absolutely-positioned card faces                    | FlashcardCard.tsx   | 66, 84  |

### Informational (2)

| #   | Finding                                                             | File                |
| --- | ------------------------------------------------------------------- | ------------------- |
| I1  | Dual-set state (`knownIds` + `unknownIds`) could be a single `Map`  | FlashcardViewer.tsx |
| I2  | `exitFullscreen` translation key exists but is not used in the code | enrichments.json    |

---

## 12. Recommendations (Prioritized)

1. **Add error boundary wrapping** at both usage sites (`EnrichmentCard.tsx` and `lesson-materials-switcher.tsx`). The `EnrichmentErrorBoundary` component already exists and is purpose-built for this.

2. **Add focus trap** for fullscreen mode using a lightweight solution (e.g., `focus-trap-react`). This improves keyboard accessibility significantly.

3. **Write unit tests** for the core state logic. Start with localStorage persistence (save/restore/validation) and known/unknown toggling, as these are the most complex flows.

4. **Wrap `onCardFlip` in `useCallback`** to preserve `React.memo` effectiveness on `FlashcardCard`.

5. **Use `useMemo` for `cardsFingerprint`** to avoid unnecessary string join computation on every render.

---

## 13. Overall Assessment

The flashcard viewer refactoring is well-executed. The decomposition from a single monolithic component into four focused components follows React best practices. State management is clean and correct, localStorage persistence is robust with proper validation of stale data, and the accessibility foundation is strong. The fullscreen study mode with keyboard navigation and swipe support adds meaningful UX value.

The main areas for improvement are: (1) wrapping usage sites with the existing error boundary, (2) adding a focus trap for fullscreen accessibility, and (3) establishing test coverage for the non-trivial client-side state logic. None of the findings represent critical defects or security vulnerabilities.

**Overall Quality: Good** -- ready for production with the medium-severity items tracked as follow-up tasks.
