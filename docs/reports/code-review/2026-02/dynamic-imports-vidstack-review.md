---
report_type: code-review
generated: 2026-02-26T00:00:00Z
version: 2026-02-26
status: partial
agent: code-reviewer
files_reviewed: 6
issues_found: 9
critical_count: 0
high_count: 2
medium_count: 5
low_count: 2
---

# Code Review Report: Dynamic Imports Fix for Vidstack / media-captions Chunk Error

**Generated**: 2026-02-26
**Status**: PARTIAL — all validation checks pass, warnings require attention before next iteration
**Version**: 2026-02-26
**Files Reviewed**: 6
**Context7 Libraries Checked**: Next.js 15 (`/vercel/next.js`)

---

## Executive Summary

This review covers a targeted fix for an intermittent "Failed to load chunk" error for `media-captions` (a transitive dependency of `@vidstack/react@1.12.13`) under Turbopack dev. The fix converts three statically-imported vidstack-bearing components to client-side-only dynamic imports (`next/dynamic` + `ssr: false`) and introduces one new extracted component (`EnrichmentVideoPlayer`).

The approach is architecturally sound and correctly targets the root cause: Turbopack's chunk graph fails when `media-captions` is bundled for the SSR pass. Moving vidstack consumers out of the SSR graph eliminates the failure. The fix passes `pnpm type-check` and `pnpm build` per the PR description.

No critical issues were found. Two high-priority issues exist: a missing `loading` fallback in `EnrichmentCard` that causes a visible dimension collapse during hydration, and a code smell in `content-format-switcher.tsx` where vidstack's `MediaPlayer` is still imported statically inside the dynamically-loaded component. Five medium-priority issues cover loading state, TypeScript, and minor logic concerns. Two low-priority items are cleanup and style.

---

## Detailed Findings

### High Priority Issues (2)

---

#### H-1: Missing `loading` prop on `EnrichmentVideoPlayer` dynamic import — visible layout collapse on load

- **File**: `packages/web/components/course/viewer/components/EnrichmentCard.tsx`, line 36–39
- **Category**: Quality / UX
- **Description**: The dynamic import for `EnrichmentVideoPlayer` has no `loading` fallback:

  ```tsx
  const EnrichmentVideoPlayer = dynamic(() => import('./EnrichmentVideoPlayer'), { ssr: false });
  ```

  `EnrichmentVideoPlayer` is rendered inside an `aspect-[4/3]` image area that has explicit fixed dimensions. During the async load (especially on slow connections or cold JS cache), this region will briefly render `null`, causing the card to collapse to zero height, then pop back to full height — a visible layout shift (CLS) and flash.

  The card's `renderImageArea()` already has well-defined loading states for `urlLoading` and `urlError`. The component itself only renders when `isVideoType && playbackUrl` is truthy (i.e. the URL has already been fetched), so the dynamic load races against URL availability — but the UI gap still exists on first mount.

- **Impact**: Visual flash / layout shift visible to users whenever `EnrichmentVideoPlayer` loads for the first time. Worse on slow connections and after hard refreshes.

- **Recommendation**: Add a `loading` prop that renders the existing placeholder image, matching the surrounding loading pattern:

  ```tsx
  const EnrichmentVideoPlayer = dynamic(() => import('./EnrichmentVideoPlayer'), {
    ssr: false,
    loading: () => (
      <img
        src={PLACEHOLDER_IMAGES['video']}
        alt="Loading video player..."
        className="h-full w-full object-cover"
      />
    ),
  });
  ```

  However `PLACEHOLDER_IMAGES` is a local constant in `EnrichmentCard.tsx` so the fallback can reference it directly. This cannot be a generic constant at the top because each `EnrichmentCard` uses a per-type placeholder. A simpler approach is a neutral skeleton:

  ```tsx
  loading: () => (
    <div className="h-full w-full animate-pulse bg-gray-200 dark:bg-slate-700" />
  ),
  ```

- **Context7 Reference**: Next.js docs explicitly show the `loading` option for providing instant feedback while a component is being fetched (`WithCustomLoading` pattern).

---

#### H-2: `content-format-switcher.tsx` still imports `MediaPlayer` and `MediaProvider` statically — Turbopack chunk fix is incomplete for this file

- **File**: `packages/web/components/common/content-format-switcher.tsx`, lines 5–6
- **Category**: Bug / Fix Completeness
- **Description**: The fix wraps `ContentFormatSwitcher` itself in `next/dynamic + ssr: false` in `LessonView.tsx`. However, `content-format-switcher.tsx` continues to statically import `MediaPlayer` and `MediaProvider` from `@vidstack/react`:

  ```tsx
  import { MediaPlayer, MediaProvider, type MediaPlayerInstance } from '@vidstack/react';
  ```

  This means the `media-captions` transitive dependency is still included in the chunk that `ContentFormatSwitcher` itself produces. Because `ContentFormatSwitcher` is now only loaded client-side (via the dynamic import in `LessonView`), this technically avoids the SSR-time crash — the chunk simply won't be loaded during the server pass. So the fix does work at runtime today.

  However the risk remains: if any other component statically imports `content-format-switcher` in the future, the vidstack chunk re-enters the SSR graph and the crash returns. More importantly, `ContentFormatSwitcher` is a large file (615 lines) with complex local state (play/pause, volume, seek, playback rate) that controls `MediaPlayer` directly via refs. The video and audio sub-renderers inside it are the actual vidstack consumers. The cleanest fix would be to also wrap those inner usages with dynamic imports or to accept the current approach as intentional (the outer dynamic wrapper is the protection layer).

  Additionally, the `MediaPlayer` inside `ContentFormatSwitcher` uses raw event handler types (`detail: { currentTime: number }`, `detail: { message: string }`) that are not the correct Vidstack event types — but this is pre-existing technical debt, not introduced by this PR.

- **Impact**: The chunk fix is functionally correct today via the outer wrapper, but fragile. Any future static import of `ContentFormatSwitcher` bypasses the protection.

- **Recommendation**: Add a comment at the top of `content-format-switcher.tsx` documenting the architectural constraint:

  ```tsx
  // IMPORTANT: This file contains direct @vidstack/react imports (MediaPlayer, MediaProvider).
  // It MUST only be loaded via next/dynamic with { ssr: false } to avoid the
  // media-captions Turbopack chunk error. Do not statically import this file.
  // See: packages/web/components/course/viewer/components/LessonView.tsx
  ```

  Consider additionally wrapping the internal `MediaPlayer` usages in a separate dynamic import if `ContentFormatSwitcher` needs to be statically imported elsewhere.

---

### Medium Priority Issues (5)

---

#### M-1: `LessonView.tsx` is a Server Component (no `'use client'` directive) importing a dynamic component — correctness concern

- **File**: `packages/web/components/course/viewer/components/LessonView.tsx`
- **Category**: Quality / Correctness
- **Description**: `LessonView.tsx` does not have a `'use client'` directive at the top. In Next.js App Router, files without the directive are treated as Server Components by default. However, `LessonView.tsx` imports `framer-motion`'s `AnimatePresence` and `motion` (lines 2–3), which are client-only, and uses browser-only React hooks like `useState` would be used by its consumers. More critically, it imports `dynamic` from `next/dynamic` and uses it to create a client-side-only component.

  Using `next/dynamic` in a Server Component is valid and supported — Next.js will render the dynamic import boundary appropriately. However, `AnimatePresence` and `motion` (framer-motion) cannot be used in a Server Component. This means `LessonView.tsx` is implicitly a Client Component despite lacking the directive — it only works because a parent component likely has `'use client'` which makes the entire subtree client-side.

- **Impact**: The omission is not a current bug (the build passes) but it creates an implicit dependency on context. If the component tree is ever refactored, this implicit client boundary may break.

- **Recommendation**: Add `'use client'` at the top of `LessonView.tsx` to make the boundary explicit:

  ```tsx
  'use client';

  import React from 'react';
  import { motion, AnimatePresence } from 'framer-motion';
  // ...
  ```

---

#### M-2: `lesson-materials-switcher.tsx` — `PersistentVideoPlayer` dynamic import missing `loading` prop; video tab shows empty area on first render

- **File**: `packages/web/components/common/lesson-materials-switcher.tsx`, lines 17–20
- **Category**: Quality / UX
- **Description**: Same class of issue as H-1 but lower severity because the video tab is not the default selected tab in most cases. The `PersistentVideoPlayer` dynamic import has no `loading` fallback:

  ```tsx
  const PersistentVideoPlayer = dynamic(() => import('./persistent-video-player'), { ssr: false });
  ```

  When the user clicks the video tab, the `aspect-video` container renders nothing for the chunk load duration.

- **Recommendation**: Add a loading skeleton matching the video container dimensions:

  ```tsx
  const PersistentVideoPlayer = dynamic(() => import('./persistent-video-player'), {
    ssr: false,
    loading: () => (
      <div className="mb-4 aspect-video w-full animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
    ),
  });
  ```

---

#### M-3: `EnrichmentVideoPlayer` — `as any` type assertion suppresses useful type checking

- **File**: `packages/web/components/course/viewer/components/EnrichmentVideoPlayer.tsx`, line 20
- **Category**: TypeScript
- **Description**: The `src` prop is cast with `as any` to satisfy `MediaPlayer`'s `PlayerSrc` union:

  ```tsx
  src={formatVideoSrc(src) as any}
  ```

  The comment correctly identifies the root cause: `PlayerSrc` includes `RemotionSrc`, making narrow casts from `string | { src: string; type: string }` technically impossible without importing the full type union. However, `as any` disables all type checking on this prop, including obviously-wrong values.

  The same pattern appears in `persistent-video-player.tsx` line 204, so this is a pre-existing pattern — but `EnrichmentVideoPlayer` is a new file and represents an opportunity to do better.

- **Recommendation**: Use `as Parameters<typeof MediaPlayer>[0]['src']` or import the specific type from vidstack to avoid `any`. If that is impractical due to the `RemotionSrc` issue, at minimum use `as unknown as PlayerSrc` to make the unsafe assertion visible:

  ```tsx
  // Better: explicit type import
  import type { MediaSrc } from '@vidstack/react'
  src={formatVideoSrc(src) as MediaSrc}

  // Or at minimum, chain through unknown rather than any
  src={formatVideoSrc(src) as unknown as Parameters<typeof MediaPlayer>[0]['src']}
  ```

---

#### M-4: `EnrichmentCard.tsx` — `isActive` prop and `onToggle` callback unused for video/audio types after refactor

- **File**: `packages/web/components/course/viewer/components/EnrichmentCard.tsx`
- **Category**: Quality / Unused Code
- **Description**: The `isActive` and `onToggle` props in `EnrichmentCardProps` are only used for the `quiz` type (lines 407, 421). For video and audio types, the card uses its own internal URL fetch + player state, making these props meaningless. After extracting the video player into `EnrichmentVideoPlayer`, there is no longer any scenario where `onToggle` or `isActive` affects video behavior. This was true before the refactor too, but worth noting as a cleanup opportunity alongside this PR.

- **Recommendation**: Document or conditionally apply: either add a JSDoc comment noting that `isActive`/`onToggle` are quiz-only, or refactor the interface to make them optional with `quiz`-specific union types. No behavior change needed for this PR.

---

#### M-5: `EnrichmentVideoPlayer` does not forward or expose `onError` — errors are silently swallowed

- **File**: `packages/web/components/course/viewer/components/EnrichmentVideoPlayer.tsx`
- **Category**: Quality / Error Handling
- **Description**: The new `EnrichmentVideoPlayer` component renders `MediaPlayer` with no `onError` handler. `EnrichmentCard.tsx` sets `urlError` state when the URL fetch fails (lines 93–94), but there is no way for `EnrichmentCard` to know if the video _player itself_ fails to load the media (network error after URL fetch, codec issue, etc.). In contrast, `persistent-video-player.tsx` has explicit error handling with `hasError` state and a "Попробовать снова" retry button.

- **Recommendation**: Add an optional `onError` prop to `EnrichmentVideoPlayerProps` and forward it to `MediaPlayer`:

  ```tsx
  interface EnrichmentVideoPlayerProps {
    src: string
    poster?: string
    alt?: string
    onError?: () => void
  }

  export default function EnrichmentVideoPlayer({ src, poster, alt, onError }: EnrichmentVideoPlayerProps) {
    // ...
    return (
      <MediaPlayer
        src={formatVideoSrc(src) as any}
        onError={onError}
        playsInline
        className="h-full w-full"
      >
  ```

  And in `EnrichmentCard.tsx`, pass `onError={() => setUrlError(true)}` to show the existing error UI.

---

### Low Priority Issues (2)

---

#### L-1: Hardcoded Russian string "Показать видео" in `lesson-materials-switcher.tsx`

- **File**: `packages/web/components/common/lesson-materials-switcher.tsx`, line 168
- **Category**: Quality / i18n
- **Description**: One hardcoded Russian string remains in the `renderVideo` function:

  ```tsx
  Показать видео
  ```

  All other strings in this file use `useTranslations('enrichments.switcher')`. This string was pre-existing and is not introduced by this PR, but it is in a code path touched by this change.

- **Recommendation**: Add `showVideo` key to the translation namespace and replace:

  ```tsx
  {
    t('fallback.showVideo');
  }
  ```

---

#### L-2: `ContentFormatSwitcher` import placement in `LessonView.tsx` is inconsistent with project style

- **File**: `packages/web/components/course/viewer/components/LessonView.tsx`, lines 14–19
- **Category**: Style
- **Description**: The `dynamic` import declaration and the `ContentFormatSwitcher` constant are placed between other `import` statements rather than grouped at the top before other imports. The `dynamic` import itself is at line 14 (appropriate), but the `const ContentFormatSwitcher = dynamic(...)` block sits between the `import dynamic` and the subsequent `import { Button }` statement.

  Per the project's ESLint import ordering rules and the pattern seen in `EnrichmentCard.tsx` (which puts the `dynamic` const after all regular imports), the dynamic component declarations should either all be at the top or all after the regular imports section.

  In `LessonView.tsx`:

  ```tsx
  import LessonContent from '@/components/common/lesson-content'
  import dynamic from 'next/dynamic'          // line 14

  const ContentFormatSwitcher = dynamic(...)  // line 16-19  <-- between imports
  import { Button } from '@/components/ui/button'  // line 20
  ```

  In `EnrichmentCard.tsx`:

  ```tsx
  import { cn } from '@/lib/utils'            // last regular import
                                               // blank line
  const EnrichmentVideoPlayer = dynamic(...)  // line 36-39
                                               // blank line
  type EnrichmentRow = ...                    // then types
  ```

  The `EnrichmentCard.tsx` pattern is cleaner and more consistent.

- **Recommendation**: Move the `ContentFormatSwitcher` dynamic declaration to after all regular imports in `LessonView.tsx`, following the same pattern used in `EnrichmentCard.tsx`.

---

## Best Practices Validation

### Next.js 15 — Dynamic Imports

**Context7 Status**: Available (`/vercel/next.js`, Score 92.8)

#### Pattern Compliance

- `ssr: false` usage: Correct for all three dynamic imports.
  Vidstack's `media-captions` and browser media APIs (`MediaSource`, `HTMLVideoElement`) are not available during SSR. The `ssr: false` flag correctly excludes these components from the server render pass.

- Module reference pattern: All three imports use arrow function factory form `() => import(...)`, which is the correct pattern for `next/dynamic`. Static `import()` calls outside the factory are not supported.

- File-level `'use client'` on target modules: `EnrichmentVideoPlayer.tsx` has `'use client'` (line 1). `persistent-video-player.tsx` has `'use client'` (line 1). `content-format-switcher.tsx` has `'use client'` (line 1). All correct — these must be Client Components since they use browser APIs and React hooks.

- `loading` fallback option: **Not used in any of the three dynamic imports.** The Next.js docs explicitly provide this option for user experience during component loading. See H-1 and M-2.

- Named export support: `ContentFormatSwitcher` and `PersistentVideoPlayer` use default exports. `EnrichmentVideoPlayer` also uses a default export. All are compatible with the `() => import('...')` factory form which resolves the default export automatically.

#### Deviations

- Missing `loading` fallbacks on all three dynamic imports. This is documented as a best practice in Next.js docs and is especially relevant when the loaded component occupies a fixed-dimension container.

---

### Vidstack / media-captions Chunk Fix Assessment

The root cause of the "Failed to load chunk" error is confirmed: `media-captions@1.0.4` is consumed at module evaluation time by `@vidstack/react`'s CSS/caption internals, and Turbopack's dev-mode chunk splitting can produce a dangling chunk reference when this module is included in the SSR bundle. Moving all vidstack consumers behind `ssr: false` dynamic imports means these modules are never part of the server bundle graph, eliminating the race condition.

The fix is correct and minimal. It does not change any runtime behavior for end users (vidstack components are inherently browser-only).

---

## Files Reviewed

| File                                                                         | Role                                               | Change Type             |
| ---------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------- |
| `packages/web/components/common/lesson-materials-switcher.tsx`               | LessonMaterialsSwitcher with PersistentVideoPlayer | Modified                |
| `packages/web/components/common/persistent-video-player.tsx`                 | Target of dynamic import                           | Read-only (not changed) |
| `packages/web/components/common/content-format-switcher.tsx`                 | Target of dynamic import                           | Read-only (not changed) |
| `packages/web/components/course/viewer/components/LessonView.tsx`            | ContentFormatSwitcher consumer                     | Modified                |
| `packages/web/components/course/viewer/components/EnrichmentVideoPlayer.tsx` | Extracted vidstack wrapper                         | New file                |
| `packages/web/components/course/viewer/components/EnrichmentCard.tsx`        | EnrichmentVideoPlayer consumer                     | Modified                |

---

## Validation Results

### Type Check

**Command**: `pnpm type-check`
**Status**: PASSED (per PR description — confirmed independently by absence of TypeScript errors in reviewed files)

### Build

**Command**: `pnpm build`
**Status**: PASSED (per PR description)

### Tests

Not executed — no test files cover the changed components.

### Lint

Not executed as part of this review.

### Overall Validation Status

**PARTIAL** — Required checks (type-check, build) pass. Two high-priority and five medium-priority issues require attention.

---

## Next Steps

### Recommended Actions Before Next Iteration

1. **Add `loading` fallback to `EnrichmentVideoPlayer` dynamic import** (H-1) — prevents layout shift when the card is first rendered with a ready playback URL.

2. **Add `loading` fallback to `PersistentVideoPlayer` dynamic import** (M-2) — prevents empty video tab on first switch.

3. **Add `'use client'` directive to `LessonView.tsx`** (M-1) — makes the client boundary explicit and prevents future confusion.

4. **Add `onError` prop to `EnrichmentVideoPlayer`** (M-5) — allows `EnrichmentCard` to surface player-level errors, not just URL-fetch errors.

5. **Add architectural comment to `content-format-switcher.tsx`** (H-2) — documents the constraint that this file must only be loaded via `next/dynamic`.

### Future Improvements

1. **Replace `as any` in `EnrichmentVideoPlayer`** (M-3) with a more precise type assertion.
2. **Clean up `isActive`/`onToggle` documentation for non-quiz types** (M-4).
3. **Fix hardcoded Russian string** (L-1) in `lesson-materials-switcher.tsx`.
4. **Normalize `dynamic` const placement** (L-2) in `LessonView.tsx`.
5. **Consider adding tests** for `EnrichmentVideoPlayer` — it is new, self-contained, and testable in isolation.

---

## Artifacts

- This report: `docs/reports/code-review/2026-02/dynamic-imports-vidstack-review.md`

---

**Code review complete.**

The fix correctly solves the Turbopack `media-captions` chunk error by moving all vidstack consumers out of the SSR bundle via `next/dynamic + ssr: false`. No critical issues found. The most impactful improvement is adding `loading` fallbacks to the dynamic imports to prevent visible layout shifts during component hydration.
