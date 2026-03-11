# Code Review: Flashcard Viewer Components Refactor

**Date**: 2026-03-04
**Scope**: Review of flashcard viewer components after refactoring — FlashcardViewer.tsx (parent orchestrator), FlashcardCard.tsx (flip card), FlashcardDots.tsx (progress dots), FlashcardSummary.tsx (completion screen)
**Files Reviewed**: 4
**Lines Changed**: +750 / -0 (full file review, not a diff)

## Summary

| Category     | Critical | High  | Medium | Low   |
| ------------ | -------- | ----- | ------ | ----- |
| Issues       | 0        | 2     | 3      | 2     |
| Improvements | —        | 2     | 3      | 2     |
| **Total**    | **0**    | **4** | **6**  | **4** |

**Verdict**: NEEDS WORK — has high-severity issues that should be addressed before this code ships to production.

## Issues

### Critical

_None found._

### High

#### 1. Potential crash when `currentCard` is `undefined` — card passed to FlashcardCard without guard

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:106`
- **Problem**: `currentCard` is derived as `cards[currentIndex]` which can be `undefined` if state gets out of sync (e.g., after shuffle resets `cards` but a stale `currentIndex` is still in-flight from a batched setState). The value is passed directly to `<FlashcardCard card={currentCard}>` without a guard. While `FlashcardCard` uses optional chaining (`card?.front`, `card?.back`), the parent component accesses `currentCard.id` at lines 136, 148, 297, and 453 inside `handleKnow`, `handleDontKnow`, inline JSX checks, and those calls are guarded — but the `onCardFlip` callback at line 237 and the `handleKnow`/`handleDontKnow` early returns only check the card within callbacks. The real risk is a race: if `handleShuffle` sets a new `cards` array while `handleKnow` was already captured in a closure with the old `currentCard`, the `currentCard.id` reference could be stale or point to the wrong card, leading to incorrect progress tracking.
- **Impact**: Could mark the wrong card as known/unknown after a shuffle, silently corrupting user progress. In an extreme edge case (shuffle reducing `cards` array length while `currentIndex` is at the end), `currentCard` could be `undefined`, crashing the component.
- **Fix**:

```typescript
// Before (line 106)
const currentCard = cards[currentIndex];

// After — add defensive guard and use the card from state at call-time
const currentCard = cards[currentIndex];

// And add a guard before the card area render (before line 330):
if (!currentCard) {
  setCurrentIndex(0);
  return null;
}
```

Additionally, in `handleKnow` and `handleDontKnow`, read the card from the current state rather than the closure:

```typescript
// Before (handleKnow, line 133)
const handleKnow = useCallback(() => {
  if (!currentCard) return
  const newKnown = new Set(knownIds)
  newKnown.add(currentCard.id)
  ...

// After — use functional state setter pattern to avoid stale closure
const handleKnow = useCallback(() => {
  setCards(prevCards => {
    const card = prevCards[currentIndex]
    if (!card) return prevCards
    // ... operate on `card` instead of closure `currentCard`
    return prevCards
  })
  ...
```

#### 2. `handlePrevious` uses stale closure for boundary check

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:112-117`
- **Problem**: `handlePrevious` checks `currentIndex > 0` using the closure value but then uses `setCurrentIndex((prev) => prev - 1)` with the functional updater. The guard condition and the state update are operating on potentially different values. If `handlePrevious` is invoked rapidly (keyboard ArrowLeft held down, or swipe gesture triggering multiple times), the closure-captured `currentIndex` might be stale, allowing the functional setter to decrement below 0, producing `cards[-1]` which is `undefined`.
- **Impact**: Rapid arrow-key presses in fullscreen mode could navigate to index -1, causing `currentCard` to be `undefined` and the component to render blank content or crash.
- **Fix**:

```typescript
// Before
const handlePrevious = useCallback(() => {
  if (currentIndex > 0) {
    setCurrentIndex(prev => prev - 1);
    setIsFlipped(false);
  }
}, [currentIndex]);

// After — move the guard inside the functional setter
const handlePrevious = useCallback(() => {
  setCurrentIndex(prev => {
    if (prev <= 0) return prev;
    setIsFlipped(false);
    return prev - 1;
  });
}, []);
```

Note: Calling `setIsFlipped` inside `setCurrentIndex`'s updater is technically a side effect in a state updater, which React discourages. A cleaner approach uses `useReducer` to batch index + flip state atomically. But for pragmatic fix, the guard-inside-setter approach prevents the out-of-bounds bug.

### Medium

#### 3. `shuffleArray` has no seed — results are non-deterministic and untestable

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:33-40`
- **Problem**: The Fisher-Yates shuffle uses `Math.random()` which cannot be seeded. This makes unit testing impossible (cannot assert a specific shuffle order) and means shuffle behavior is not reproducible.
- **Impact**: Testing difficulty. Not a runtime bug but blocks test coverage for shuffle-related flows.
- **Fix**:

```typescript
// Recommended — accept optional random function for testability
function shuffleArray<T>(arr: T[], randomFn = Math.random): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
```

#### 4. `saveProgress` persists on every single card interaction — no debouncing

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:87-104`
- **Problem**: `saveProgress` calls `localStorage.setItem` synchronously on every "Know" / "Don't Know" click and on every card advance. For a 100-card deck, this means 100+ serialization + write calls. While localStorage is fast in modern browsers, this is wasteful and could cause micro-jank on low-end devices (especially with large Sets serialized via `Array.from` + `JSON.stringify`).
- **Impact**: Minor performance overhead per interaction. On low-end mobile devices this could contribute to frame drops during card transition animations.
- **Fix**:

```typescript
// Recommended — debounce localStorage writes
import { useDebouncedCallback } from 'use-debounce';

const debouncedSave = useDebouncedCallback(
  (known: Set<string>, unknown: Set<string>, index: number, finished: boolean) => {
    try {
      localStorage.setItem(
        FLASHCARD_STORAGE_KEY(enrichmentId),
        JSON.stringify({
          known: Array.from(known),
          unknown: Array.from(unknown),
          currentIndex: index,
          isFinished: finished,
        })
      );
    } catch {
      /* ignore */
    }
  },
  300
);
```

Alternatively, save only on unmount and on finish, which would be simpler and more performant.

#### 5. Empty `catch` blocks silently swallow errors without logging

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:81,99,173`
- **Problem**: Three `catch` blocks catch all errors and do nothing — no logging, no user feedback, no metrics. If localStorage is full (quota exceeded), the user's progress silently stops persisting with no indication.
- **Impact**: User could study a 100-card deck, close the tab, and lose all progress without knowing. Difficult to debug in production.
- **Fix**:

```typescript
// Before
catch {
  // Ignore localStorage errors
}

// After — at least log for observability
catch (error) {
  console.warn('[FlashcardViewer] localStorage error:', error)
}
```

### Low

#### 6. Unused import: `AnimatePresence` imported but could be removed if assessment buttons were refactored

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:5`
- **Problem**: `AnimatePresence` is imported and used for the self-assessment buttons fade-in, which is correct. However, the same file also imports `motion` and uses it for the swipe wrapper. This is fine — no actual unused import. _Upon closer inspection, all imports are used._ Retracted.

#### 7. `FlashcardDots` renders raw `<button>` elements without `type="button"`

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardDots.tsx:37`
- **Problem**: The dot `<button>` elements lack `type="button"`. In some contexts (e.g., if the flashcard viewer were ever placed inside a `<form>`), these buttons would default to `type="submit"` and trigger form submission.
- **Impact**: Extremely unlikely given current usage context, but it is a defensive HTML best practice to always specify `type="button"` on non-submit buttons.
- **Fix**:

```typescript
// Before
<button
  key={card.id}
  className={cn(...)}

// After
<button
  type="button"
  key={card.id}
  className={cn(...)}
```

#### 8. Inline function in JSX creates a new reference on every render

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:237-239`
- **Problem**: `onCardFlip` is defined as a regular function inside the render body (line 237), creating a new reference every render. This breaks the `React.memo` optimization on `FlashcardCard` since it receives a new `onFlip` prop each time.
- **Impact**: `FlashcardCard` is wrapped in `React.memo` but the optimization is defeated because `onFlip` changes every render, causing the card to re-render unnecessarily.
- **Fix**:

```typescript
// Before (line 237-239, inside render body)
const onCardFlip = () => {
  if (!isDraggingRef.current) handleFlip();
};

// After — wrap in useCallback
const onCardFlip = useCallback(() => {
  if (!isDraggingRef.current) handleFlip();
}, [handleFlip]);
```

## Improvements

### High

#### 1. FlashcardViewer is a 494-line monolith — extract state management into a custom hook

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx`
- **Current**: All state (10 `useState` calls), all callbacks (8 `useCallback` calls), localStorage persistence, keyboard handling, and scroll locking are in a single component function. This makes the component hard to test, hard to reason about, and hard to extend.
- **Recommended**: Extract the state logic into a `useFlashcardState` custom hook:

```typescript
// hooks/useFlashcardState.ts
export function useFlashcardState(content: FlashcardsEnrichmentContent, enrichmentId: string) {
  // All useState, useCallback, useEffect for persistence
  // Returns: { cards, currentCard, currentIndex, isFlipped, isFinished, ... handlers }
}

// FlashcardViewer.tsx — now purely presentational
export function FlashcardViewer({ content, enrichmentId }: FlashcardViewerProps) {
  const state = useFlashcardState(content, enrichmentId);
  const t = useTranslations('enrichments');
  // Only JSX rendering, no business logic
}
```

- **Impact**: Enables unit testing of flashcard logic without rendering. Reduces cognitive load. Follows React best practice of separating concerns.

#### 2. No test coverage for any of the four components

- **File**: `packages/web/components/course/viewer/enrichments/Flashcard*.tsx`
- **Current**: Zero test files found for `FlashcardViewer`, `FlashcardCard`, `FlashcardDots`, or `FlashcardSummary`. These components contain non-trivial logic: progress tracking, localStorage persistence, navigation state machine, keyboard shortcuts, and drag gestures.
- **Recommended**: Create test files covering at minimum:
  - Navigation: forward/backward/boundary behavior
  - Know/Don't Know: correct Set mutations and progress calculation
  - localStorage: save/restore/reset round-trip
  - Summary: score calculation (0%, 50%, 100%, edge case: 0 cards)
  - Keyboard: arrow keys, space, escape
  - Shuffle: verify all cards are preserved (no duplicates/losses)
- **Impact**: Critical user-facing feature without any regression protection. Any future refactor could break flashcard progress silently.

### Medium

#### 3. `FlashcardDots` is not memoized — re-renders on every parent state change

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardDots.tsx:17`
- **Current**: `FlashcardDots` is a plain function component. It receives `cards`, `currentIndex`, `knownIds`, `unknownIds`, and `onNavigate` as props. Since `knownIds` and `unknownIds` are `Set` objects that get replaced (new Set()) on every know/don't-know action, and `onNavigate` is an inline arrow function, this component re-renders on every interaction.
- **Recommended**:

```typescript
// Wrap in React.memo and stabilize the onNavigate callback in the parent
export const FlashcardDots = React.memo(function FlashcardDots({...}: FlashcardDotsProps) {
  // ...
})
```

Combined with stabilizing `onNavigate` via `useCallback` in the parent:

```typescript
const handleDotNavigate = useCallback((i: number) => {
  setCurrentIndex(i);
  setIsFlipped(false);
}, []);
```

- **Impact**: Prevents unnecessary re-renders of up to 30 dot buttons on every card flip and assessment action.

#### 4. `FlashcardSummary` is not memoized — could benefit from `React.memo`

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardSummary.tsx:31`
- **Current**: Plain function component receiving primitive props and a callback. While it only renders when `isFinished` is true (so re-renders are less frequent), wrapping it in `React.memo` is cheap insurance.
- **Recommended**:

```typescript
export const FlashcardSummary = React.memo(function FlashcardSummary({...}: FlashcardSummaryProps) {
  // ...
})
```

- **Impact**: Minor optimization. Low effort, good practice for consistency with `FlashcardCard` which is already memoized.

#### 5. Hardcoded swipe threshold (80px) does not account for screen size

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:339-340`
- **Current**: `if (info.offset.x > 80)` and `if (info.offset.x < -80)` use a fixed pixel threshold for swipe navigation. On a 320px-wide mobile screen, 80px is 25% of screen width — reasonable. On a 2560px-wide desktop, 80px is 3% — too sensitive, likely to trigger on accidental mouse drags.
- **Recommended**: Use a percentage of container width or velocity-based detection:

```typescript
// Recommended — use velocity instead of (or combined with) offset
onDragEnd={(_, info) => {
  const swipeThreshold = 80
  const velocityThreshold = 500
  if (info.offset.x > swipeThreshold || info.velocity.x > velocityThreshold) handlePrevious()
  else if (info.offset.x < -swipeThreshold || info.velocity.x < -velocityThreshold) handleNext()
  requestAnimationFrame(() => { isDraggingRef.current = false })
}}
```

- **Impact**: Better UX on wide screens. Prevents accidental navigation.

### Low

#### 6. `cardsFingerprint` computed on every render — could be memoized

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx:61`
- **Current**: `const cardsFingerprint = content.cards.map((c) => c.id).join(',')` runs on every render to produce a string used only as a `useEffect` dependency. For 100 cards, this creates a temporary array and a joined string on every render.
- **Recommended**:

```typescript
const cardsFingerprint = useMemo(() => content.cards.map(c => c.id).join(','), [content.cards]);
```

- **Impact**: Negligible performance gain (array map + join is fast), but follows the principle of not doing unnecessary work in render.

#### 7. Magic number 30 in FlashcardDots with no explanation

- **File**: `packages/web/components/course/viewer/enrichments/FlashcardDots.tsx:25`
- **Current**: `if (cards.length > 30) return null` — silently hides the dots navigation if there are more than 30 cards. The threshold is undocumented and could confuse users who expect to see dot navigation.
- **Recommended**:

```typescript
/** Maximum number of cards for which dot navigation is shown.
 * Beyond this, dots become too small to be useful and hurt layout. */
const MAX_DOT_CARDS = 30;

// ...
if (cards.length > MAX_DOT_CARDS) return null;
```

Also consider showing a condensed indicator (e.g., "12/45") instead of hiding navigation entirely.

- **Impact**: Readability and discoverability. Users with 31+ card decks lose dot navigation without explanation.

## Validation

- Type Check: SKIPPED (per task instructions)
- Build: SKIPPED (per task instructions)

## Files Reviewed

| File                                                                     | Lines   |
| ------------------------------------------------------------------------ | ------- |
| `packages/web/components/course/viewer/enrichments/FlashcardViewer.tsx`  | 494     |
| `packages/web/components/course/viewer/enrichments/FlashcardCard.tsx`    | 95      |
| `packages/web/components/course/viewer/enrichments/FlashcardDots.tsx`    | 56      |
| `packages/web/components/course/viewer/enrichments/FlashcardSummary.tsx` | 105     |
| **Total**                                                                | **750** |

### Supporting files read for context

| File                                                                         | Purpose                                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `packages/shared-types/src/enrichment-content.ts`                            | Type definitions for `FlashcardItem`, `FlashcardsEnrichmentContent` |
| `packages/web/components/course/viewer/components/enrichment-type-guards.ts` | Type guard `isFlashcardsContent` used before rendering              |
| `packages/web/components/course/viewer/components/EnrichmentCard.tsx`        | Parent consumer of `FlashcardViewer`                                |
| `packages/web/components/common/lesson-materials-switcher.tsx`               | Alternate parent consumer of `FlashcardViewer`                      |
| `packages/web/components/course/viewer/enrichments/index.ts`                 | Barrel export                                                       |
