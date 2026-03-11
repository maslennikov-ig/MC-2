# Code Review: Flashcard Viewer Components

**Reviewed files:**

- `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx` (494 lines)
- `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/FlashcardCard.tsx` (95 lines)
- `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/FlashcardDots.tsx` (56 lines)
- `/home/me/code/mc2/packages/web/components/course/viewer/enrichments/FlashcardSummary.tsx` (105 lines)

**Refactoring commit:** `1d57148c` -- "feat(flashcards): redesign FlashcardViewer UI with fullscreen study mode"

**Reviewer:** Claude Opus 4.6
**Date:** 2026-03-04

---

## Executive Summary

The flashcard viewer was refactored from a single monolithic component into four well-separated components: a parent orchestrator (`FlashcardViewer`), a flip-card visual (`FlashcardCard`), progress dot indicators (`FlashcardDots`), and a completion summary screen (`FlashcardSummary`). The refactoring adds fullscreen study mode, swipe/keyboard navigation, localStorage persistence, self-assessment tracking, and animated transitions.

Overall the code is well-structured, follows project conventions (shared types, `cn()` utility, `next-intl`, shadcn/ui), and has good accessibility foundations. However, there are several issues ranging from potential runtime bugs to performance concerns and accessibility gaps.

---

## Critical Issues

### 1. `currentCard` can be `undefined` -- potential crash in handlers (FlashcardViewer.tsx, line 106)

```typescript
const currentCard = cards[currentIndex];
```

`currentCard` is derived from `cards[currentIndex]` but `currentIndex` can become out of bounds in race conditions. While `handleKnow` and `handleDontKnow` guard with `if (!currentCard) return`, the `FlashcardCard` component receives `card: FlashcardItem | undefined` and only uses optional chaining (`card?.front`, `card?.back`) -- so the card renders empty content silently rather than showing a meaningful fallback.

**More critically**, the difficulty badge section at line 297-311 uses `currentCard?.difficulty` which is fine, but the `knownIds.has(currentCard.id)` at line 453 does NOT guard against `undefined`:

```typescript
{currentCard && knownIds.has(currentCard.id) && (
```

This is guarded. However, `saveProgress` at line 141 is called with `currentIndex >= totalCards - 1` to determine `finished`, and if `currentIndex` is stale relative to `totalCards`, this could produce incorrect `isFinished` state.

**Recommendation:** Add a guard at the top of the render section (after the `isFinished` check) that returns an error fallback if `currentCard` is undefined when `cards.length > 0`.

### 2. Stale closure in `handleNext` callback dependency chain (FlashcardViewer.tsx, lines 120-131, 133-155)

`handleNext` depends on `knownIds` and `unknownIds` in its `useCallback` dependency array. `handleKnow` and `handleDontKnow` both compute new sets _then_ call `handleNext(true)`. However, `handleNext` captures `knownIds` and `unknownIds` at closure time -- not the freshly computed sets passed to `saveProgress`. Currently this is safe because `handleNext` only uses these for the `!skipSave` path, and both callers pass `skipSave=true`. But this is fragile: if someone removes the `skipSave` parameter or refactors these callbacks, the stale closure will cause bugs.

**Recommendation:** Either:

- Remove `knownIds`/`unknownIds` from `handleNext`'s dependency array and body entirely (they are only needed in the `!skipSave` branch which is only used from the inline Next button click).
- Or restructure so `handleNext` only handles navigation, with persistence handled separately.

### 3. localStorage persistence uses `content.cards` in effect dependency but is not stable (FlashcardViewer.tsx, line 84)

```typescript
}, [enrichmentId, cardsFingerprint, content.cards])
```

The effect at lines 64-84 depends on `content.cards`, which is derived from props. If the parent re-renders with a new `content` object reference (but same card data), this effect re-runs and reloads from localStorage. This is mostly benign (it reloads the same data), but it triggers unnecessary state updates. The `cardsFingerprint` string should be sufficient without also including `content.cards`.

**Recommendation:** Remove `content.cards` from the dependency array since `cardsFingerprint` already captures the identity. Use a ref or memoized value for the card lookup inside the effect:

```typescript
}, [enrichmentId, cardsFingerprint])
```

---

## Major Issues

### 4. Fragment wrapper causes layout issues (FlashcardViewer.tsx, lines 241-493)

The component returns a React Fragment (`<>...</>`) containing two sibling blocks: the main viewer `<div>` and the fullscreen button `<div>`. This means the parent layout must handle two adjacent children rather than one. In `EnrichmentCard.tsx` (line 524-528) and `lesson-materials-switcher.tsx`, the FlashcardViewer is placed inside `<div className="mt-3">`, so both children are in a block context. This works, but it breaks the implicit contract that a component returns a single root element, and could cause unexpected layout behavior if the parent uses flexbox or grid.

**Recommendation:** Wrap in a single root `<div>` or use the fullscreen button conditionally inside the main `<div>`.

### 5. No test coverage

There are zero test files for any of the four flashcard components. Given the complexity of state management (navigation, self-assessment, localStorage persistence, shuffle, fullscreen mode), this is a significant gap. The localStorage load/save logic, shuffle, and navigation edge cases (first card, last card, beyond bounds) are all ripe for unit testing.

**Recommendation:** Add unit tests covering:

- Navigation (next/previous at boundaries)
- Self-assessment (know/don't know updates sets correctly)
- localStorage persistence (save and reload)
- Shuffle (preserves card count, changes order)
- Summary display conditions
- Empty cards array edge case

### 6. FlashcardCard does not handle long text content (FlashcardCard.tsx)

Both front and back faces use `absolute inset-0` positioning with `min-h-[220px]`, but the parent `motion.div` uses `minHeight: '220px'` as an inline style. If a flashcard has very long text, the text will overflow the fixed-height container because the inner divs are absolutely positioned and cannot push the parent to grow.

**Recommendation:** Consider:

- Adding `overflow-y-auto` to the face divs for very long content
- Or using a dynamic height approach where the taller face dictates the container height (e.g., render both faces in normal flow but hide with opacity/visibility rather than `absolute`)

### 7. Shuffle does not preserve assessment state correctly (FlashcardViewer.tsx, lines 157-162)

When shuffling, the component resets `currentIndex` to 0 but does NOT reset `knownIds`/`unknownIds`. This means the dot indicators and the "already assessed" icons will correctly reflect previous assessments (since they use card IDs, not indices). However, the progress percentage (`progressPercent`) is based on `currentIndex`, not on how many cards have been assessed. After shuffling, the user jumps back to card 0, seeing a progress bar that suggests they are at the beginning, even if they have assessed 80% of cards.

**Recommendation:** Consider basing the progress bar on `(knownIds.size + unknownIds.size) / totalCards * 100` rather than `(currentIndex + 1) / totalCards * 100`, at least when assessment mode is active.

---

## Minor Issues

### 8. `isDraggingRef` timing with `requestAnimationFrame` (FlashcardViewer.tsx, lines 341-343)

```typescript
onDragEnd={(_, info) => {
  if (info.offset.x > 80) handlePrevious()
  else if (info.offset.x < -80) handleNext()
  requestAnimationFrame(() => {
    isDraggingRef.current = false
  })
}}
```

Using `requestAnimationFrame` to delay resetting the drag ref is a reasonable heuristic, but it is not guaranteed to fire after the click event from the drag release. This could cause occasional spurious flips after swipe gestures, especially on slower devices.

**Recommendation:** Use a short `setTimeout` (e.g., 100ms) instead of `requestAnimationFrame` for more reliable prevention of post-drag clicks, or use Framer Motion's `onDrag` and `onDragEnd` to set a flag that persists through the synthetic click cycle.

### 9. FlashcardDots silently disappears for 30+ cards (FlashcardDots.tsx, line 25)

```typescript
if (cards.length > 30) return null;
```

This is a reasonable performance/UX optimization, but it is invisible to the user. With 31+ cards, the dot navigation simply vanishes with no explanation. Users of large decks lose a navigation feature without knowing why.

**Recommendation:** For 30+ cards, render a compact indicator (e.g., "Card 15 of 45") or a mini scrollbar instead of dots.

### 10. Keyboard navigation does not intercept Arrow keys on focusable elements (FlashcardViewer.tsx, lines 182-201)

The Space/Enter key handler checks for focusable elements (`BUTTON`, `A`, `INPUT`, etc.) and bails out, but the ArrowLeft/ArrowRight handlers do not. If a user is focused on a button and presses ArrowLeft, both the browser's native behavior (moving focus) and the card navigation will fire.

**Recommendation:** Add the same focusable-element check for arrow keys, or use `e.preventDefault()` for arrow keys to prevent dual behavior.

### 11. Hardcoded swipe threshold of 80px (FlashcardViewer.tsx, line 339)

```typescript
if (info.offset.x > 80) handlePrevious();
else if (info.offset.x < -80) handleNext();
```

The 80px threshold is absolute, not relative to viewport or card width. On small mobile screens, 80px might be a large portion of the screen, making swipes hard to trigger. On large screens, it might be too easy to trigger accidentally.

**Recommendation:** Use a relative threshold (e.g., 15% of card width) or expose as a constant with a comment explaining the choice.

### 12. `aria-current="true"` should use the proper value (FlashcardDots.tsx, line 50)

```typescript
aria-current={index === currentIndex ? 'true' : undefined}
```

For navigation dots, `aria-current="step"` would be more semantically appropriate than `"true"`, since the dots represent steps in a sequence.

### 13. Unused `cn` import in FlashcardSummary.tsx (line 8)

The `cn` utility is imported and used only on lines 49-51 for the trophy background -- this is a legitimate use. No issue here on reflection.

### 14. FlashcardCard `React.memo` effectiveness (FlashcardCard.tsx, line 22)

The component is wrapped in `React.memo`, but it receives `onFlip` as a prop. In FlashcardViewer, `onCardFlip` is defined as a local function (line 237-239) inside the render body, not wrapped in `useCallback`:

```typescript
const onCardFlip = () => {
  if (!isDraggingRef.current) handleFlip();
};
```

This creates a new function reference every render, defeating `React.memo`. Every time any state changes in FlashcardViewer (e.g., `isFlipped`, `currentIndex`, `knownIds`), the FlashcardCard will re-render despite the memo wrapper.

**Recommendation:** Wrap `onCardFlip` in `useCallback`:

```typescript
const onCardFlip = useCallback(() => {
  if (!isDraggingRef.current) handleFlip();
}, [handleFlip]);
```

### 15. Body scroll lock does not restore correctly if unmounted while fullscreen (FlashcardViewer.tsx, lines 204-210)

```typescript
useEffect(() => {
  if (!isFullscreen) return;
  document.body.style.overflow = 'hidden';
  return () => {
    document.body.style.overflow = '';
  };
}, [isFullscreen]);
```

If the component unmounts while `isFullscreen` is true (e.g., navigating to another page), the cleanup runs and sets `overflow = ''`. This is correct. However, if some other component also sets `document.body.style.overflow`, this cleanup will clobber that value. This is a general problem with direct DOM manipulation in React.

**Recommendation:** Save and restore the previous value:

```typescript
useEffect(() => {
  if (!isFullscreen) return;
  const prev = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  return () => {
    document.body.style.overflow = prev;
  };
}, [isFullscreen]);
```

### 16. `handleShuffle` toggles shuffle but does not persist shuffle state (FlashcardViewer.tsx, lines 157-162)

When a user shuffles and then leaves/returns, the saved localStorage data restores `knownIds`, `unknownIds`, `currentIndex`, and `isFinished`, but NOT the shuffle state or the shuffled card order. The user will see the original card order with a potentially stale `currentIndex` that pointed to a different card in the shuffled deck.

**Recommendation:** Either persist the shuffled card order (or a seed) in localStorage, or reset `currentIndex` to 0 when loading saved progress (which is already done via `Math.min` but should arguably be 0 if shuffle state is lost).

---

## Accessibility Review

### Strengths

- `role="button"` and `tabIndex={0}` on the card container
- `onKeyDown` handler for Enter/Space on the card
- `aria-label` on navigation buttons and card
- `aria-live="polite"` on the card counter
- `aria-current` on active dot
- `sr-only` label for close button in fullscreen
- Fullscreen hint text for keyboard shortcuts

### Gaps

- The card flip state change is not announced to screen readers. When flipped, the answer appears but there is no `aria-live` region to announce it. Screen reader users will not know the card flipped.
- The self-assessment buttons (Know it / Still learning) appear with `AnimatePresence` animation but are not announced.
- Dot indicators are tiny (8x8px / `h-2 w-2`), below the WCAG minimum touch target of 44x44px. While they have padding from `gap-1.5`, the actual interactive area is very small for touch users.
- Color-only status indication: dots use green/amber/grey to indicate known/unknown/unassessed, with no shape or pattern difference. This fails WCAG 1.4.1 (Use of Color).
- The fullscreen overlay backdrop click handler (`onClick={() => setIsFullscreen(false)}`) has no keyboard equivalent beyond the Escape key, which is fine for keyboard users but the backdrop `<div>` is not a focusable or labeled element.

---

## Performance Review

### Strengths

- `React.memo` on `FlashcardCard` (though defeated by non-memoized callback, see issue #14)
- Dots hidden for 30+ cards
- Spring animations use Framer Motion's GPU-accelerated transforms

### Concerns

- Every state change (flip, navigate, assess) triggers re-render of the entire `FlashcardViewer`, which recalculates all derived values and re-renders all children.
- `shuffleArray` creates a full copy using Fisher-Yates, which is O(n) -- fine for up to 100 cards.
- `Set` operations in `handleKnow`/`handleDontKnow` create new Set instances every call. This is correct for immutability but creates garbage for GC on every assessment action.
- `localStorage.setItem` is synchronous and called on every assessment. For very fast clicking, this could cause jank. Consider debouncing the save.

---

## Code Quality and Style

### Strengths

- Clean extraction of sub-components with clear interfaces
- Consistent use of `cn()` for conditional class composition
- Good JSDoc comments on components and key functions
- Translation keys are externalized via `next-intl` for both English and Russian
- `FlashcardSummary` receives labels as a flat object, avoiding translation coupling in the child
- The `FLASHCARD_STORAGE_KEY` pattern is clean and prevents key collisions
- Error handling around localStorage operations (try/catch with empty catch blocks)
- TypeScript types from shared package ensure consistency between backend and frontend

### Concerns

- `FlashcardViewer` is still 494 lines and manages 8 pieces of state. Consider extracting state management into a custom hook (`useFlashcardSession`).
- Empty `catch` blocks (lines 81, 99, 173) silently swallow errors. At minimum, add a comment or `console.debug` for development.
- The `skipSave` parameter on `handleNext` is a code smell -- it couples navigation with persistence. Better to separate these concerns.
- The `labels` prop pattern used in `FlashcardSummary` is good for decoupling, but inconsistent -- `FlashcardCard` takes individual label props (`tapToFlipLabel`, `flipCardLabel`) instead of a `labels` object. Consider standardizing.

---

## Summary of Findings

| Severity | Count | Key Items                                                                                      |
| -------- | ----- | ---------------------------------------------------------------------------------------------- |
| Critical | 3     | Stale closure risk in handleNext, undefined currentCard edge cases, unnecessary effect re-runs |
| Major    | 4     | Fragment wrapper, no tests, text overflow in cards, misleading progress after shuffle          |
| Minor    | 9     | Memo defeated by callback, body scroll restore, swipe threshold, dot accessibility, etc.       |

### Top 5 Actionable Items (prioritized)

1. **Add unit tests** for navigation, assessment, localStorage, and shuffle logic
2. **Wrap `onCardFlip` in `useCallback`** to make `React.memo` on `FlashcardCard` effective
3. **Extract state into `useFlashcardSession` hook** to reduce FlashcardViewer complexity
4. **Fix text overflow** in FlashcardCard for long content (add `overflow-y-auto`)
5. **Add screen reader announcements** for card flip and assessment state changes
