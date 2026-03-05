# Code Review: Flashcard Viewer Component Refactoring

**Date**: 2026-03-04
**Scope**: Refactored flashcard viewer components extracted from monolithic FlashcardViewer into sub-components
**Files**: 4 | **Changes**: +750 / -261 (net from commit 1d57148c)

## Summary

|              | Critical | High | Medium | Low |
| ------------ | -------- | ---- | ------ | --- |
| Issues       | 0        | 2    | 2      | 1   |
| Improvements | ---      | 2    | 3      | 2   |

**Verdict**: NEEDS WORK

## Issues

### High

#### 1. `onCardFlip` closure defined in render body defeats `React.memo` on FlashcardCard

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:237`
- **Problem**: `onCardFlip` is defined as an arrow function inside the render body (after the early returns, line 237), creating a new function reference every render. `FlashcardCard` is wrapped in `React.memo` (FlashcardCard.tsx:22), but since `onFlip` prop always changes, the memo is completely bypassed. Every state change in the parent (navigation, flip, assessment) causes `FlashcardCard` to re-render unnecessarily, including its Framer Motion spring animation setup.
- **Impact**: The entire point of extracting `FlashcardCard` into a memoized component is negated. On low-end mobile devices this will cause dropped frames during rapid interactions (swipe + flip + assessment).
- **Fix**: Wrap the drag-guard logic in `useCallback`:
  ```tsx
  const onCardFlip = useCallback(() => {
    if (!isDraggingRef.current) handleFlip();
  }, [handleFlip]);
  ```
  Move this above the early returns (after `handleFlip` definition, around line 111). Refs are stable across renders, so the dependency array only needs `handleFlip`.

#### 2. `handlePrevious` has a stale closure over `currentIndex`

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:112-117`
- **Problem**: `handlePrevious` uses `currentIndex` in the guard (`if (currentIndex > 0)`) but then updates with `setCurrentIndex((prev) => prev - 1)`. The functional updater is correct for the set, but the guard itself reads a potentially stale `currentIndex` from the closure. Because `handlePrevious` is in the dependency array of the keyboard effect (line 201), if a keydown fires between the state update and the re-render, the guard may allow navigation to index -1 or block a valid navigation. Same pattern exists for `handleNext` (line 122 guard reads `currentIndex`).
- **Impact**: In fullscreen mode, rapid ArrowLeft keypresses could navigate to `currentIndex = -1`, causing `cards[-1]` to be `undefined`. The `FlashcardCard` component defensively uses `card?.front`, so it renders blank rather than crashing, but the dots navigation and progress bar will display incorrectly.
- **Fix**: Use functional updater for the guard too:
  ```tsx
  const handlePrevious = useCallback(() => {
    setCurrentIndex(prev => {
      if (prev <= 0) return prev;
      setIsFlipped(false);
      return prev - 1;
    });
  }, []);
  ```
  This eliminates both the stale closure risk and removes `currentIndex` from the dependency array, reducing re-creation frequency. Apply the same pattern to `handleNext`.

### Medium

#### 3. Body scroll lock cleanup may not restore original overflow value

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:204-210`
- **Problem**: The fullscreen scroll-lock effect sets `document.body.style.overflow = 'hidden'` and restores it to `''` on cleanup. If another component (e.g., a modal, sheet, or the MindMapViewer) had already set `overflow: hidden` before fullscreen was activated, this cleanup will remove that constraint. This is a common issue in stacking overlay contexts.
- **Impact**: If a user opens flashcard fullscreen from within a scrollable modal (unlikely but possible in the EnrichmentCard layout), exiting fullscreen will inadvertently restore scroll on the body while the modal should still be preventing it.
- **Fix**: Capture the previous value before overwriting:
  ```tsx
  useEffect(() => {
    if (!isFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isFullscreen]);
  ```

#### 4. `cardsFingerprint` computed every render for all cards

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:61`
- **Problem**: `content.cards.map((c) => c.id).join(',')` runs on every render to produce a string used only as a `useEffect` dependency. For a 100-card deck (the schema max), this creates 100 string allocations + a join every render cycle.
- **Impact**: Minor CPU overhead per render. Not a production bug, but wasteful for a value that changes only when `content.cards` reference changes.
- **Fix**: Wrap in `useMemo`:
  ```tsx
  const cardsFingerprint = useMemo(() => content.cards.map(c => c.id).join(','), [content.cards]);
  ```

### Low

#### 5. Fullscreen click zones have `tabIndex={-1}` preventing keyboard accessibility

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:403,420`
- **Problem**: The left/right fullscreen click zone buttons use `tabIndex={-1}`, removing them from the tab order. While keyboard navigation exists via ArrowLeft/ArrowRight in fullscreen mode, the `tabIndex={-1}` means screen reader users cannot discover these controls through standard tab navigation. The keyboard effect only fires in fullscreen mode (line 179), which is correct.
- **Impact**: Reduced discoverability for keyboard-only users in fullscreen. Arrow key navigation does work, but it is not discoverable without reading the hint text at the bottom.
- **Fix**: This appears intentional (the hint text at line 473 tells users about arrow keys), but consider adding `tabIndex={0}` if full WCAG 2.1 AA compliance is a goal. Alternatively, add `role="navigation"` to the click zone container with an `aria-label` describing the arrow key shortcuts.

## Improvements

### High

#### 1. FlashcardDots is not memoized despite receiving stable-ish props

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardDots.tsx:17`
- **Current**: `FlashcardDots` is a plain function component. It re-renders every time `FlashcardViewer` re-renders, even if the card hasn't changed (e.g., when the card is flipped — `isFlipped` changes but none of the dots props change, except that `onNavigate` is an inline arrow at line 432).
- **Recommended**: Wrap in `React.memo` (same as `FlashcardCard`), and stabilize `onNavigate` with `useCallback` in the parent:

  ```tsx
  // In FlashcardViewer.tsx
  const handleDotNavigate = useCallback((i: number) => {
    setCurrentIndex(i)
    setIsFlipped(false)
  }, [])

  // In FlashcardDots.tsx
  export const FlashcardDots = React.memo(function FlashcardDots(...) { ... })
  ```

  With Set objects (`knownIds`, `unknownIds`), `React.memo` will still re-render when assessments happen (since new Set objects are created), which is correct behavior.

#### 2. FlashcardSummary receives 8 label strings as individual props instead of using `useTranslations` directly

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardSummary.tsx:14-23` and `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:222-231`
- **Current**: The parent passes a `labels` object with 8 translated strings. This creates a new object literal every render (lines 222-231), and couples the parent to all the summary's i18n key requirements.
- **Recommended**: Have `FlashcardSummary` call `useTranslations('enrichments')` directly (it's already a `'use client'` component). This removes the object allocation per render, eliminates the labels prop, and follows the same pattern used by `FlashcardViewer` itself. The component becomes self-contained:
  ```tsx
  export function FlashcardSummary({ totalCards, knownCount, unknownCount, onReset }) {
    const t = useTranslations('enrichments');
    // use t('viewer.flashcards.summary') etc. directly
  }
  ```

### Medium

#### 3. `handleKnow` and `handleDontKnow` are near-identical -- DRY violation

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:133-155`
- **Current**: Both functions follow the same pattern: clone `knownIds` and `unknownIds`, add to one / delete from other, save, advance. The only difference is which set gets the add vs delete.
- **Recommended**: Extract a shared handler:
  ```tsx
  const handleAssess = useCallback(
    (known: boolean) => {
      if (!currentCard) return;
      const newKnown = new Set(knownIds);
      const newUnknown = new Set(unknownIds);
      if (known) {
        newKnown.add(currentCard.id);
        newUnknown.delete(currentCard.id);
      } else {
        newUnknown.add(currentCard.id);
        newKnown.delete(currentCard.id);
      }
      setKnownIds(newKnown);
      setUnknownIds(newUnknown);
      saveProgress(newKnown, newUnknown, currentIndex, currentIndex >= totalCards - 1);
      handleNext(true);
    },
    [currentCard, knownIds, unknownIds, currentIndex, totalCards, saveProgress, handleNext]
  );
  ```
  Then: `onClick={() => handleAssess(true)}` and `onClick={() => handleAssess(false)}`.

#### 4. FlashcardCard minHeight set in both inline style and className

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardCard.tsx:53,66,84`
- **Current**: `minHeight: '220px'` is set as an inline style on the `motion.div` (line 53), and `min-h-[220px]` is also applied to both the front and back face divs (lines 66, 84). The inline style on the parent and the Tailwind class on children are redundant -- the children are `absolute inset-0` so they fill the parent, and the parent's `minHeight` already constrains the minimum.
- **Recommended**: Remove `min-h-[220px]` from the front and back face divs, keeping only the parent's inline `minHeight: '220px'`. Or better, move to a Tailwind class `min-h-[220px]` on the parent and remove the inline style to keep all sizing in one system.

#### 5. `localStorage` progress can become stale if cards are regenerated while user has saved state

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:64-83`
- **Current**: The `useEffect` validates saved IDs against current cards (lines 74-76), which is good. However, if the card deck shrinks (e.g., from 20 cards to 10), `currentIndex` is clamped to `content.cards.length - 1` (line 79), but `isFinished` is restored from the saved value without checking if all new cards have been reviewed. A user could see the summary screen for a deck they haven't fully reviewed.
- **Recommended**: After validation, recompute `isFinished` based on whether `validKnown.length + validUnknown.length >= content.cards.length`:
  ```tsx
  const shouldBeFinished =
    parsed.isFinished && validKnown.length + validUnknown.length >= content.cards.length;
  setIsFinished(shouldBeFinished);
  ```

### Low

#### 6. `shuffleArray` uses Fisher-Yates but is defined at module scope without documentation

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:33-40`
- **Current**: The shuffle utility is correct (Fisher-Yates) and efficient. It's at module scope which is fine. However, it could be reused by other enrichment viewers (e.g., quiz question shuffle) if moved to a shared utility.
- **Recommended**: Consider moving to `packages/web/lib/utils.ts` or a `packages/web/lib/array-utils.ts` for reusability. Low priority since there's only one consumer currently.

#### 7. FlashcardSummary score circle uses border-only styling that may be hard to see in some themes

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardSummary.tsx:72`
- **Current**: The score circle uses `border-primary border-4` with `text-primary` text. In themes where the primary color is subtle, the 4px border circle might lack visual prominence against the gradient background.
- **Recommended**: Consider adding a subtle background fill (e.g., `bg-primary/5`) to improve visibility across theme variants.

## Positive Patterns

1. **Solid component extraction**: The split of the monolithic 396-line viewer into 4 focused components (Viewer: 494, Card: 95, Dots: 56, Summary: 105) is well-structured. Each sub-component has a clear single responsibility and a clean props interface. The `FlashcardCard` is correctly wrapped in `React.memo`.

2. **Defensive localStorage handling**: All `localStorage` operations are wrapped in try/catch, saved IDs are validated against current card IDs (handling deck regeneration), and `currentIndex` is clamped. The `cardsFingerprint` dependency ensures reload when cards change identity. The pre-refactor version lacked the ID validation.

3. **Comprehensive accessibility**: The card has `role="button"`, `tabIndex={0}`, keyboard flip support (Enter/Space), `aria-label` on all controls, `aria-live="polite"` on the counter, and `aria-current` on dots. Fullscreen adds keyboard navigation (Arrow/Space/Esc). The `'use client'` directive is correctly placed on all components.

4. **Well-designed fullscreen mode**: The drag/click conflict resolution using `isDraggingRef` + `requestAnimationFrame` is a thoughtful pattern that prevents accidental flips during swipe gestures. The `skipSave` parameter on `handleNext` correctly prevents double-persistence when assessment handlers call it.

## Escalation

No items requiring senior review. These components are self-contained UI with no auth, database, API, or shared utility changes.

## Validation

- Type Check: SKIPPED (per review instructions)
- Build: SKIPPED (per review instructions)
