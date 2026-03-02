# FlashcardViewer Code Review Report

## Date: 2026-03-02

## Summary

The `FlashcardViewer` component is well-structured and covers the core use case competently.
Dark mode styling is thorough, keyboard navigation is present, and the localStorage persistence
logic is solid. However, there are several real bugs and UX issues that need attention before
this can be considered production-ready:

- **One critical bug**: the body scroll-lock `useEffect` cleanup always runs (not just on
  unmount), creating a scroll-unlock on every `isFullscreen` → `false` transition even when
  there are multiple stacked fullscreen layers on the page.
- **One important bug**: `cardElement` is a plain JSX variable computed every render, not a
  memoized or stable component — it causes React to re-create the entire card subtree on every
  state change, breaking the flip animation during the swipe drag.
- **Several important UX issues**: the 1/3-width invisible click zones in fullscreen overlap
  the card area and intercept flip clicks; swipe is enabled on drag but flip requires a click
  on the same element with no threshold to distinguish them; dot navigation is rendered inside
  the fullscreen `position: fixed` container but never receives a `z-index` that puts it above
  the click-zone overlays.
- **i18n**: two keys referenced in the component (`viewer.flashcards.previousCard` and
  `viewer.flashcards.nextCard`) are defined in both locale files but never used. Conversely,
  the Russian `cardCount` key uses a non-plural form (`"{count} карточек"`) rather than ICU
  plural syntax, while the same key in English is also flat (`"{count} cards"`), despite the
  Russian locale using proper plural syntax for all similar keys.

---

## Critical Issues (must fix)

### CR-1: Body scroll-lock cleanup always restores overflow even on non-unmount transitions

- **File**: `FlashcardViewer.tsx:216-223`
- **Problem**: The `useEffect` cleanup function unconditionally sets
  `document.body.style.overflow = ''` whenever `isFullscreen` changes — including when it
  transitions from `false` to `true` and back. This is harmless in isolation, but if any
  ancestor component also sets `overflow: hidden` (e.g. a modal, drawer, or another fullscreen
  viewer on the same page), the cleanup will prematurely unlock scroll even while the ancestor
  overlay is still visible. The cleanup runs on the _previous_ render's effect teardown before
  the new one applies.
- **Fix**: Only clear the overflow lock when `isFullscreen` was `true` in the previous render,
  or use a ref to track whether _this component_ set the overflow lock:

```tsx
// Option A: only apply/remove when value actually changes
useEffect(() => {
  if (isFullscreen) {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }
  // do nothing when isFullscreen is false — no cleanup needed
}, [isFullscreen]);
```

This is actually the correct behaviour already _if_ the effect only returns a cleanup when
`isFullscreen` is truthy. The current code always returns a cleanup, which is the bug.
The fix is simply to move the `return` inside the `if`:

```tsx
useEffect(() => {
  if (isFullscreen) {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }
}, [isFullscreen]);
```

---

## Important Issues (should fix)

### IR-1: `cardElement` is a plain JSX variable, not a stable component — breaks flip animation on state change

- **File**: `FlashcardViewer.tsx:318-379`
- **Problem**: `cardElement` is computed as a raw JSX expression inside the render body of
  `FlashcardViewer`. Every time any piece of state changes (including `isFlipped`, `currentIndex`,
  `knownIds`, etc.), React evaluates this expression and produces a _new_ virtual DOM tree.
  Because it is not a separate React component with its own identity, the `motion.div` inside it
  has no stable `key` — React will reconcile it as the same node, which works for the flip
  animation. However, the outer wrapper `div` with `onClick={handleFlip}` re-creates its
  children on every render.

  More critically, when `isFlipped` flips to `true`, `handleKnow`/`handleDontKnow` call
  `handleNext()`, which updates `currentIndex` and `isFlipped` in the same event handler tick.
  Because `cardElement` is re-evaluated synchronously, the Framer Motion spring animation for
  the flip-back transitions while the card content is already showing the _next_ card's text —
  the user sees a visual flicker where the answer briefly shows the next question's back text
  while rotating back to 0°.

- **Fix**: Extract `cardElement` into a proper memoized sub-component or wrap it in
  `React.memo`:

```tsx
interface FlashCardProps {
  card: FlashcardItem | undefined;
  isFlipped: boolean;
  isFullscreen: boolean;
  onFlip: () => void;
  tapToFlipLabel: string;
  flipCardLabel: string;
}

const FlashCard = React.memo(function FlashCard({
  card,
  isFlipped,
  isFullscreen,
  onFlip,
  tapToFlipLabel,
  flipCardLabel,
}: FlashCardProps) {
  return (
    <div
      className={cn(
        'relative mx-auto w-full cursor-pointer',
        isFullscreen ? 'max-w-xl' : 'max-w-lg'
      )}
      style={{ perspective: '1200px' }}
      onClick={onFlip}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onFlip();
        }
      }}
      aria-label={flipCardLabel}
    >
      {/* ... front/back faces ... */}
    </div>
  );
});
```

### IR-2: Invisible 1/3-width click zones in fullscreen intercept flip clicks on the card

- **File**: `FlashcardViewer.tsx:526-552`
- **Problem**: The left and right `div` click zones each cover `w-1/3` of the full container
  height (`h-full`). The card is `max-w-xl` centered, and the zones use `absolute` positioning
  starting from the container edge. On a typical viewport (e.g. 1280px wide), the left zone
  extends from 0 to ~427px. The card itself starts at the left edge of its container. A user
  clicking anywhere in the left third of the card area will trigger `handlePrevious()` instead
  of `handleFlip()`, because the click zone's `z-index: 10` sits above the card. The
  `e.stopPropagation()` in the click zones prevents the click from reaching the card.
- **Fix**: Either constrain the click zones to narrow strips at the viewport edges (e.g.
  `w-16` or `w-24`) and not the full 1/3 width, or use explicit navigation arrow buttons
  outside the card area as MindMapViewer does. The arrow icons already have
  `group-hover:opacity-70` — make the clickable zone match the icon area:

```tsx
// Use narrow edge strips instead of 1/3 width
<div className="group absolute left-0 top-0 z-10 flex h-full w-16 cursor-pointer items-center justify-start pl-2" ...>
```

### IR-3: Drag-to-swipe and click-to-flip share the same element with no gesture disambiguation

- **File**: `FlashcardViewer.tsx:475-487`
- **Problem**: In fullscreen mode, the outer `motion.div` has `drag="x"` while the inner card
  `div` has `onClick={handleFlip}`. Framer Motion fires `onClick` even after a completed drag
  gesture because it does not suppress click after drag by default. After a user swipes
  slightly (less than the 80px threshold), the card will _both_ not advance AND flip, which is
  confusing.

  Per Framer Motion docs, drag gestures do not automatically suppress the subsequent click
  event. You need to track whether a drag occurred and cancel the click if so.

- **Fix**: Use the `onDragStart`/`onDragEnd` callbacks to set a ref that suppresses the flip
  on that cycle:

```tsx
const isDraggingRef = useRef(false)

<motion.div
  drag={isFullscreen ? 'x' : false}
  dragConstraints={{ left: 0, right: 0 }}
  dragElastic={0.3}
  onDragStart={() => { isDraggingRef.current = true }}
  onDragEnd={(_, info) => {
    const threshold = 80
    if (info.offset.x > threshold) handlePrevious()
    else if (info.offset.x < -threshold) handleNext()
    // Reset after a frame so the click fires first
    requestAnimationFrame(() => { isDraggingRef.current = false })
  }}
>
  <div
    ...
    onClick={() => { if (!isDraggingRef.current) handleFlip() }}
  >
```

### IR-4: `saveProgress` is called with stale `currentIndex` in `handleKnow`/`handleDontKnow`

- **File**: `FlashcardViewer.tsx:145-167`
- **Problem**: `handleKnow` calls `saveProgress(newKnown, newUnknown, currentIndex, false)` and
  then calls `handleNext()`. But `handleNext()` also calls
  `saveProgress(knownIds, unknownIds, currentIndex, true)` when on the last card. If the user
  clicks "Know" on the last card, `saveProgress` is called twice: once with `isFinished: false`
  (correct intent from `handleKnow`) and once with `isFinished: true` (from `handleNext`). The
  second call overwrites the first with the old `knownIds`/`unknownIds` (before the new card
  was added to `knownIds`), so the last card's self-assessment is lost from localStorage.

- **Fix**: Have `handleNext` not save progress internally. Progress saving should happen
  exclusively in `handleKnow` / `handleDontKnow` / navigation handlers. Or alternatively, have
  `handleKnow`/`handleDontKnow` compute the next index themselves and save with the final state
  before calling the navigate logic.

### IR-5: Dot indicators render inside the `position: fixed` fullscreen container but are behind the click-zone overlays

- **File**: `FlashcardViewer.tsx:554-579`
- **Problem**: In fullscreen mode, dot indicators are rendered inside the card area `div`
  (which is `position: relative`). The click-zone overlays have `z-index: 10`. The dots have
  no explicit `z-index` set, so they sit at `z-index: auto` (below `z-index: 10`). Clicking
  a dot in the left 1/3 or right 1/3 of the dot row will actually trigger the nav click zone
  rather than the dot.
- **Fix**: Add `relative z-20` to the dots container to ensure it sits above the navigation
  overlays:

```tsx
<div className="relative z-20 mx-auto flex max-w-lg flex-wrap justify-center gap-1.5">
```

### IR-6: `useEffect` for localStorage loading suppresses `content.cards` from its dependency array with a stale-closure comment

- **File**: `FlashcardViewer.tsx:72-100`
- **Problem**: The comment explains the omission of `content.cards` from dependencies as
  intentional ("avoid re-triggering on reference changes caused by shuffle"). However, the
  saved `currentIndex` is validated against `content.cards.length - 1`, and `content.cards` is
  used to build `currentCardIds` for ID validation. If `enrichmentId` stays the same but
  `content.cards` changes (e.g. the parent re-fetches with updated card content), the effect
  won't re-run, leaving stale IDs in `knownIds`/`unknownIds`. Using `content.cards.length` as
  a proxy is fragile — if a card is replaced (same count, different IDs), the IDs won't be
  re-validated.
- **Fix**: Use a stable fingerprint of the cards array as the dependency:

```tsx
const cardsFingerprint = content.cards.map(c => c.id).join(',');

useEffect(() => {
  // ... load from localStorage
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [enrichmentId, cardsFingerprint]);
```

### IR-7: Missing `aria-label` on shuffle button; uses only `title` attribute

- **File**: `FlashcardViewer.tsx:458-468`
- **Problem**: The shuffle button uses `title={t('viewer.flashcards.shuffle')}` but no
  `aria-label`. Screen readers use `aria-label` (not `title`) for button announcements. The
  `title` attribute is only shown as a tooltip on hover.
- **Fix**: Add `aria-label={t('viewer.flashcards.shuffle')}` to the shuffle button.

### IR-8: Fullscreen keyboard handler captures Space/Enter globally, interfering with focusable elements inside the viewer

- **File**: `FlashcardViewer.tsx:191-213`
- **Problem**: When fullscreen is active, the `keydown` event listener on `document` intercepts
  Space and Enter keypresses without checking `e.target`. If focus lands on the "Know it" or
  "Still learning" buttons (which it should after appearing, per IR-10), pressing Space or
  Enter would fire `handleFlip()` _and_ the button's own click handler simultaneously.
- **Fix**: Check that the event target is not a button, anchor, or input before handling:

```tsx
case ' ':
case 'Enter':
  if (
    e.target instanceof HTMLElement &&
    ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)
  ) break
  e.preventDefault()
  handleFlip()
  break
```

---

## Minor Issues (nice to have)

### MN-1: `cardCount` i18n key uses flat string; Russian locale should use ICU plural

- **File**: `messages/ru/enrichments.json:424`, `messages/en/enrichments.json:424`
- **Problem**: `"cardCount": "{count} карточек"` is always in the genitive plural form
  ("карточек"). For 1 card it should be "1 карточка", for 2-4 "2 карточки", for 5+ "5 карточек".
  The Russian locale consistently uses ICU plural syntax for all other count keys
  (`questionsCount`, `slidesCount`, `questionsLabel`, `pointsLabel`, etc.). The English key
  similarly uses a flat string (`"{count} cards"`) rather than the project-standard
  `"{count, plural, one {# card} other {# cards}}"`.
- **Fix**:
  - EN: `"cardCount": "{count, plural, one {# card} other {# cards}}"`
  - RU: `"cardCount": "{count, plural, one {# карточка} few {# карточки} many {# карточек} other {# карточек}}"`

### MN-2: Declared i18n keys `previousCard`/`nextCard` are never used in the component

- **File**: `messages/en/enrichments.json:427-428`, `messages/ru/enrichments.json:427-428`
- **Problem**: Both locale files define `viewer.flashcards.previousCard` and
  `viewer.flashcards.nextCard`. The component uses `viewer.back` and `viewer.next` for the
  inline navigation arrows instead (lines 590, 608), and the fullscreen click zones have no
  `aria-label` at all. This is dead i18n key clutter and indicates the accessible labels for
  the fullscreen zones were forgotten.
- **Fix**: Either use these keys as `aria-label` on the fullscreen click-zone divs (converting
  them to `button` elements — see MN-5), or delete the unused keys.

### MN-3: `knownIds.has(currentCard?.id ?? '')` uses empty string as fallback — misleading

- **File**: `FlashcardViewer.tsx:596`
- **Problem**: When `currentCard` is `undefined` (can't happen in normal flow, but possible if
  the `cards` array is empty), `knownIds.has('')` would return false silently. More importantly
  the `?? ''` pattern suggests an empty string is a safe fallback ID, but an empty string
  could theoretically match a card with `id: ''` in pathological data.
- **Fix**: Guard the whole expression:

```tsx
{
  currentCard && knownIds.has(currentCard.id) && <Layers className="h-4 w-4 text-amber-400" />;
}
```

### MN-4: `Layers` icon used for both "known card" indicator and the fullscreen title/start button — confusing semantics

- **File**: `FlashcardViewer.tsx:597`, `FlashcardViewer.tsx:401`
- **Problem**: `Layers` is used as the "this card is known" indicator in the inline nav row
  (line 597), as the fullscreen header icon (line 401), and in `EnrichmentCard.tsx` as the
  "Start flashcards" button icon. In the context of a progress indicator, a checkmark or
  similar would be more meaningful. This is a UX semantics issue, not a functional bug.
- **Fix**: Use `CheckCircle2` or `BookmarkCheck` from lucide-react for the "known" indicator.

### MN-5: Fullscreen click-zone `div` elements should be `button` for accessibility

- **File**: `FlashcardViewer.tsx:528-551`
- **Problem**: The invisible prev/next click zones use `div` elements with `onClick`. They are
  not keyboard-focusable and have no ARIA role. Screen reader users and keyboard-only users
  cannot trigger them. In fullscreen mode keyboard arrows work, but the visual affordance
  (hover chevrons) suggests they are interactive elements.
- **Fix**: Change to `button` elements with `aria-label` using the already-defined
  `viewer.flashcards.previousCard` / `viewer.flashcards.nextCard` keys.

### MN-6: Summary screen `knownCount + unknownCount` can be less than `totalCards`

- **File**: `FlashcardViewer.tsx:226-229`
- **Problem**: `scorePercent` is computed as `knownCount / totalCards`, but if the user
  skipped cards without clicking "Know" or "Still learning" (navigated with arrows only), those
  cards are in neither set. The stats grid shows "Known: 3 | Learning: 2 | Total: 10" — the
  numbers don't add up to total, which looks like a bug to the user.
- **Fix**: Add an "Unanswered" or "Skipped" stat to the grid, or clarify in the UI that the
  score only counts answered cards. Alternatively, compute score over answered cards:
  `knownCount / (knownCount + unknownCount)` and show a separate "Cards reviewed" count.

### MN-7: `isFullscreen` state is local — navigating away (tab switch in `LessonMaterialsSwitcher`) leaves fullscreen open

- **File**: `FlashcardViewer.tsx:67`, `lesson-materials-switcher.tsx:509-518`
- **Problem**: In `LessonMaterialsSwitcher`, switching to another tab (`TabsContent` hides the
  flashcards tab with `display: none`). The `FlashcardViewer` is not unmounted — it stays in
  the DOM. If the user entered fullscreen mode and then switched tabs, the fullscreen overlay
  remains visible (it is `position: fixed`) and `document.body.overflow` stays `hidden`. The
  user is locked out of scrolling with no way to dismiss the overlay since the fullscreen
  header close button is behind the other tab content.
- **Fix**: The component should reset `isFullscreen` to `false` when it becomes invisible.
  Either pass an `isVisible` prop from the parent, or use an `IntersectionObserver` / the
  Page Visibility API. A simpler alternative is to use `useEffect` with a cleanup that always
  resets fullscreen:

```tsx
// Reset fullscreen when component unmounts (e.g. switching tabs in Tabs component)
useEffect(() => {
  return () => {
    setIsFullscreen(false);
    document.body.style.overflow = '';
  };
}, []);
```

Note that with Radix UI `Tabs`, the inactive `TabsContent` is hidden with CSS but _not_
unmounted by default, so this alone doesn't solve the problem. The correct fix is to listen
for a visibility change event or an `onActiveChange` callback from the parent.

### MN-8: Dark mode inconsistency — fullscreen container uses `dark:bg-slate-950` but MindMapViewer uses `dark:bg-gray-900`

- **File**: `FlashcardViewer.tsx:394`, `MindMapViewer.tsx:49`
- **Problem**: Minor palette inconsistency between the two fullscreen viewers. `FlashcardViewer`
  uses `slate-950` while `MindMapViewer` uses `gray-900`. In Tailwind these are nearly
  identical but not the same token. For visual consistency between enrichment viewers they
  should use the same dark background.
- **Fix**: Align both to `dark:bg-slate-900` (or `dark:bg-gray-900`) — whichever is the
  project standard.

### MN-9: `handleShuffle` and `handleReset` do not reset `isFinished` visually when called from summary screen

- **File**: `FlashcardViewer.tsx:176-188`
- **Problem**: `handleReset` does set `setIsFinished(false)`, so this is functionally correct.
  However, the summary screen (rendered when `isFinished`) has only a "Start Over" button that
  calls `handleReset`. There is no "Study unlearned only" option. After a session where 8/10
  cards were known, the user must re-study all 10. This is a UX gap rather than a bug, but
  worth noting for a flashcard app.
- **Fix** (optional): Add a "Retry unknown only" button on the summary screen that resets
  only `unknownIds`, sets `cards` to only the unknown cards subset, and resumes from index 0.

### MN-10: No empty-state handling if `content.cards` is empty

- **File**: `FlashcardViewer.tsx:60`, `FlashcardViewer.tsx:120`
- **Problem**: The schema enforces `cards.min(1)`, but the component itself does not guard
  against an empty array. `currentCard` would be `undefined` on first render, and
  `progressPercent` would be `NaN` (0/0 before the ternary check, which is actually guarded
  at line 122). However, `cardOf` would render "Card 1 of 0" which is nonsensical.
- **Fix**: Add a guard at the top of the render:

```tsx
if (cards.length === 0) {
  return <p className="text-muted-foreground text-sm">{t('viewer.noMaterials')}</p>;
}
```

---

## Positive Aspects

- **Solid state architecture**: The separation of `knownIds`/`unknownIds` as `Set<string>` with
  ID-based validation on load is robust and handles card regeneration gracefully.
- **localStorage persistence** is well-implemented — validation against current card IDs,
  index clamping, and try/catch around both read and write.
- **Dark mode coverage is thorough**: Almost every element has a `dark:` variant. The gradient
  combinations for front/back faces are visually polished.
- **Framer Motion usage is idiomatic**: `AnimatePresence` around the self-assessment buttons,
  spring physics for the flip, and the trophy entrance animation are all correct uses of the API.
- **Keyboard navigation in fullscreen** correctly listens on `document` and cleans up the
  listener on both `isFullscreen` change and unmount.
- **Fullscreen pattern matches MindMapViewer**: the `<> backdrop / fixed container </>` structure,
  the header with close button, and the footer hint are all consistent with the project's
  established pattern.
- **`shuffleArray` is correct**: Fisher-Yates in-place shuffle on a copy — no mutation of
  `content.cards`.
- **`handleShuffle` correctly returns to original order**: `setCards(isShuffled ? content.cards : shuffleArray(...))` properly inverts the toggle.
- **Difficulty badge** uses the shared `viewer.difficulty` namespace already used by the quiz
  viewer — good reuse.
- **`useCallback` is applied appropriately** to all event handlers — no unnecessary memoization
  and no missing memoization for functions passed as props.
