# Fix: Scroll jump on lesson page first load

## Context

When a user loads a lesson page and scrolls down, the page jumps back up once. This happens only on the first load. The root cause is the Framer Motion entry animation on the lesson content wrapper in `lesson-content.tsx`:

```tsx
<motion.div
  key={lesson.id}
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5 }}
>
```

The `y: 20` -> `y: 0` translation over 0.5s, combined with `key={lesson.id}` causing React remount, triggers the browser's scroll position adjustment — the content shifts during the animation window and the browser "corrects" the viewport position, producing a visible jump.

## Fix

**File**: `packages/web/components/common/lesson-content.tsx`

Remove the `y` component from the animation. Keep only opacity fade-in which doesn't affect layout/scroll:

```tsx
<motion.div
  key={lesson.id}
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.3 }}
>
```

Changes:

- Remove `y: 20` from `initial` and `y: 0` from `animate` — eliminates the vertical translation that triggers scroll adjustment
- Reduce duration from `0.5` to `0.3` — opacity-only animation doesn't need as long, feels snappier

## Verification

1. `pnpm --filter web type-check` — passes
2. `pnpm --filter web build` — passes
3. Deploy to dev, open a lesson with content, scroll down immediately on load — no jump
4. Switch between lessons — smooth opacity fade transition still works
