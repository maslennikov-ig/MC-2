---
report_type: code-review
generated: 2026-02-25T00:00:00Z
version: 2026-02-25
status: partial
agent: code-reviewer
files_reviewed: 2
issues_found: 12
critical_count: 0
high_count: 4
medium_count: 5
low_count: 3
---

# Code Review Report: Enrichment Card Video/Audio Playback UX

**Generated**: 2026-02-25
**Status**: PARTIAL — no critical blockers, but four high-priority issues need attention before shipping
**Files Reviewed**: 2
**Plan**: `docs/plans/swirling-inventing-sketch.md`

---

## Executive Summary

The rewrite achieves its stated goals: video now loads Vidstack with a poster on mount (single-click play), and audio shows a darkening overlay synced with player state. The implementation is structurally sound and consistent with the existing `persistent-video-player.tsx` pattern.

Four high-priority issues were found. The most impactful is a **state desync between the audio overlay icon and actual audio state** caused by cleanup effects that call `audio.pause()` without calling `onPlayingChange(false)`. This leaves the parent's `isAudioPlaying` stuck at `true` with a Pause icon showing, even though audio has stopped. There are also two `as any` type suppressions that should be resolved, a missing `urlError` state (planned but omitted), and a double `src` attribute on the `<audio>` element that causes a redundant network request.

No security vulnerabilities were found. No memory leaks in the new code. Overall a clean, well-structured implementation.

---

## Issues by Priority

### High Priority (4)

---

#### H1 — Audio overlay desync: `audio.pause()` in cleanup effects does not call `onPlayingChange`

**File**: `packages/web/components/course/viewer/enrichments/AudioPlayer.tsx`, lines 87, 111

**Category**: Bug / State management

**Description**: There are two `useEffect` cleanup functions that call `audio.pause()` imperatively. Neither fires `onPlayingChange?.(false)`. When these cleanups run (on `playbackUrl` change or on component unmount while audio is playing), the audio element pauses but the parent's `isAudioPlaying` state remains `true`. The overlay in `EnrichmentCard` will keep showing the Pause icon even though nothing is playing.

The `handleEnded` event handler (line 56-59) does call `onPlayingChange?.(false)`, so ending naturally is fine. The gap is only in the two cleanup paths.

**Cleanup #1** — first `useEffect`, runs when `playbackUrl` or `content?.duration_seconds` changes:

```typescript
// AudioPlayer.tsx lines 78-91
return () => {
  // ... removeEventListeners ...
  audio.pause(); // pauses audio
  audio.currentTime = 0;
  audio.src = '';
  // onPlayingChange?.(false) is NOT called here
};
```

**Cleanup #2** — second `useEffect`, runs when `playbackUrl` changes (URL reset):

```typescript
// AudioPlayer.tsx lines 110-114
return () => {
  audio.pause(); // pauses audio
  audio.currentTime = 0;
  audio.src = '';
  // onPlayingChange?.(false) is NOT called here
};
```

The parent's `EnrichmentCard` does reset `isAudioPlaying` to `false` when `!isActive` (line 120), so deactivating the card recovers the state. But any scenario where the URL changes mid-play (signed URL refresh, regenerate while playing) will leave the overlay desynced.

**Impact**: Visual bug — Pause icon shows in overlay when nothing is playing. User must click the overlay to recover.

**Recommended fix**: Add `onPlayingChange?.(false)` alongside `setIsPlaying(false)` in both cleanup returns. Note that cleanup functions run after render, so a ref-captured version of `onPlayingChange` is safer to avoid stale closure risk:

```typescript
// Pattern: capture callback in a ref so cleanup always calls the latest version
const onPlayingChangeRef = useRef(onPlayingChange);
useEffect(() => {
  onPlayingChangeRef.current = onPlayingChange;
}, [onPlayingChange]);

// In each cleanup:
return () => {
  audio.pause();
  audio.currentTime = 0;
  audio.src = '';
  onPlayingChangeRef.current?.(false);
};
```

Alternatively, the simpler fix (acceptable here since the component mounts/unmounts as a unit) is to just add `onPlayingChange?.(false)` directly. The stale closure risk is low because `onPlayingChange` is `setIsAudioPlaying` from `useState` in the parent, which is stable by React's guarantee.

---

#### H2 — `formatVideoSrc` return type requires `as any` — should be resolved properly

**File**: `packages/web/components/course/viewer/components/EnrichmentCard.tsx`, line 243

**Category**: Type safety

**Description**: `formatVideoSrc(playbackUrl)` is cast with `as any` to silence a TypeScript error on Vidstack's `src` prop. The same suppression exists in `persistent-video-player.tsx` (line 221). This means any type mismatch with Vidstack's `MediaSrc` type is invisible to the compiler.

```typescript
// EnrichmentCard.tsx line 243
src={formatVideoSrc(playbackUrl) as any}

// persistent-video-player.tsx line 221 — same pattern
src={formatVideoSrc(src) as any}
```

`formatVideoSrc` returns `string | { src: string; type: string } | undefined | null`. Vidstack's `src` prop accepts `MediaSrc | MediaSrc[]` where `MediaSrc` is `string | { src: string; type: string }`. The union is compatible except for `undefined | null`.

**Recommended fix**: Type `formatVideoSrc`'s return more narrowly (exclude `undefined`/`null` in the non-null branch) or add a null guard at the call site:

```typescript
// video-utils.ts: change return type to exclude undefined/null for non-null input
export function formatVideoSrc(src: string): string | { src: string; type: string };
export function formatVideoSrc(
  src: string | undefined | null
): string | { src: string; type: string } | undefined | null;
```

Or at the call site, since `playbackUrl` is already confirmed non-null by the `if (isVideoType && playbackUrl)` guard:

```typescript
src={formatVideoSrc(playbackUrl) as string | { src: string; type: string }}
```

Either removes the unsafe `as any`.

---

#### H3 — `urlError` state planned but not implemented — fetch failure is silent

**File**: `packages/web/components/course/viewer/components/EnrichmentCard.tsx`, lines 108-113

**Category**: UX / Error handling

**Description**: The plan document explicitly defined a `urlError` state and a `.catch(() => setUrlError(true))` path. The implementation has the `.catch()` block but it does nothing — no state is set, no error is surfaced to the user:

```typescript
// EnrichmentCard.tsx lines 108-113
getEnrichmentPlaybackUrl(enrichment)
  .then(setPlaybackUrl)
  .catch(() => {
    // URL fetch failed — card stays in placeholder state
  })
  .finally(() => setUrlLoading(false));
```

When the fetch fails, `urlLoading` flips to `false` and `playbackUrl` remains `null`. For a video card, the fallback is just the default placeholder image with a gradient — identical to a card that hasn't loaded yet. There is no indicator to the user that playback is unavailable, and no way to retry short of refreshing the page. The Regenerate button still works, but users won't know they need to use it.

**Recommended fix**: Add `urlError` state and render a distinct error state for the video image area. A minimal implementation:

```typescript
const [urlError, setUrlError] = useState(false)

// in the .catch():
.catch(() => { setUrlError(true) })

// in renderImageArea(), add a branch:
if (isVideoType && urlError) {
  return (
    <>
      <img src={placeholderImage} alt={enrichment.title || label} className="h-full w-full object-cover opacity-50" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm text-white/80">{t('viewer.videoUnavailable')}</span>
      </div>
    </>
  )
}
```

---

#### H4 — `togglePlay` is memoized with `isPlaying` in deps, causing ref staleness pattern

**File**: `packages/web/components/course/viewer/enrichments/AudioPlayer.tsx`, lines 117-142

**Category**: Bug / Stale closure

**Description**: `togglePlay` is a `useCallback` that closes over `isPlaying`. Every time `isPlaying` changes, a new `togglePlay` function is created. This new function is then synced into `togglePlayRef` via a separate `useEffect` (lines 133-142). The ref update is correct and React guarantees `useEffect` runs after paint, so there is a one-render window where `togglePlayRef.current` points to the previous version of `togglePlay`.

In practice this rarely causes a bug because the overlay's click handler fires user interactions, which happen well after render. However, the pattern is fragile and the unnecessary churn (new function + new effect run on every play/pause toggle) is inefficient.

**Recommended fix**: Use a ref-based `isPlaying` pattern to remove it from `useCallback` deps entirely:

```typescript
const isPlayingRef = useRef(isPlaying);
useEffect(() => {
  isPlayingRef.current = isPlaying;
}, [isPlaying]);

const togglePlay = useCallback(() => {
  const audio = audioRef.current;
  if (!audio || audio.readyState < 2) return;
  const newState = !isPlayingRef.current;
  if (newState) {
    audio.play().catch(e => console.error('Error playing audio:', e));
  } else {
    audio.pause();
  }
  setIsPlaying(newState);
  onPlayingChange?.(newState);
}, [onPlayingChange]); // stable — only re-created if onPlayingChange changes
```

With this approach, `togglePlay` is stable across play/pause toggles, `togglePlayRef.current` is always current, and the ref sync `useEffect` runs far less frequently.

---

### Medium Priority (5)

---

#### M1 — Double `src` on `<audio>` element causes redundant network request

**File**: `packages/web/components/course/viewer/enrichments/AudioPlayer.tsx`, lines 107, 212

**Category**: Performance

**Description**: The `<audio>` element is rendered with `src={playbackUrl}` as a JSX prop (line 212). The second `useEffect` (lines 93-115) also imperatively sets `audio.src = playbackUrl` and calls `audio.load()` (lines 107-108). When `playbackUrl` first becomes available, both React's reconciler (setting the attribute) and the effect (imperative assignment + `load()`) run, causing the browser to initiate two fetch requests for the same URL.

```typescript
// Effect fires imperatively:
audio.src = playbackUrl  // triggers fetch #1 via load()
audio.load()

// JSX also renders the src attribute:
<audio ref={audioRef} src={playbackUrl} preload="metadata" />  // triggers fetch #2
```

**Recommended fix**: Remove `src` from the JSX `<audio>` element and rely solely on the imperative effect, OR remove the imperative `audio.src =` assignment and use only the declarative attribute. The effect-based approach is already correct (it sets src + calls load and handles cleanup), so the JSX `src` prop is redundant:

```typescript
// Remove src from JSX, let the effect manage it:
<audio ref={audioRef} preload="metadata" />
```

---

#### M2 — `isAudioType` and `isVideoType` are plain booleans in `useEffect` deps — lint will warn

**File**: `packages/web/components/course/viewer/components/EnrichmentCard.tsx`, lines 106-116

**Category**: Code quality / ESLint

**Description**: `isAudioType` and `isVideoType` are derived synchronously from `type` on every render:

```typescript
const isVideoType = type === 'video' || type === 'nlm_video';
const isAudioType = type === 'audio' || type === 'nlm_audio';
```

These are included in the `useEffect` dependency array (line 116), which is correct for `exhaustive-deps`. However, since `type` is derived from `enrichment.enrichment_type` which is already captured via `enrichment.id` and `enrichment.status`, including `isAudioType` and `isVideoType` adds noise. If `enrichment_type` can change independently (unlikely for a completed enrichment, but possible via a refresh), the deps are also incomplete — `enrichment.enrichment_type` itself is not in the array.

**Recommended fix**: Either include `enrichment.enrichment_type` directly and remove the derived booleans from deps, or derive `isAudioType`/`isVideoType` inside the effect:

```typescript
useEffect(() => {
  const type = enrichment.enrichment_type as EnrichmentType;
  const isVideo = type === 'video' || type === 'nlm_video';
  const isAudio = type === 'audio' || type === 'nlm_audio';
  if ((isAudio || isVideo) && enrichment.status === 'completed') {
    // ...
  }
}, [enrichment.id, enrichment.status, enrichment.enrichment_type]);
```

---

#### M3 — `handleAudioOverlayToggle` wrapper function is unnecessary indirection

**File**: `packages/web/components/course/viewer/components/EnrichmentCard.tsx`, lines 228-230

**Category**: Code quality

**Description**: `handleAudioOverlayToggle` is a trivial wrapper:

```typescript
const handleAudioOverlayToggle = () => {
  audioToggleRef.current?.();
};
```

It is called in one place (line 293). This adds a named function for no benefit over inlining `audioToggleRef.current?.()` directly in the `onClick` handler (alongside the existing `e.stopPropagation()`). With the ref-based approach this is a no-op indirection.

**Recommended fix**: Inline at the call site and remove the wrapper:

```typescript
onClick={(e) => {
  e.stopPropagation()
  audioToggleRef.current?.()
}}
```

---

#### M4 — `vidstackTranslations` extraction pattern is duplicated across two components

**File**: `packages/web/components/course/viewer/components/EnrichmentCard.tsx`, lines 97-103
`packages/web/components/common/persistent-video-player.tsx`, lines 45-51

**Category**: Code quality / DRY

**Description**: The `useMemo` block for extracting Vidstack translations from `useMessages()` is copy-pasted identically in both `EnrichmentCard.tsx` and `persistent-video-player.tsx`. Any future change to the message key structure or the extraction logic must be updated in two places.

```typescript
// Identical block in both files:
const vidstackTranslations = useMemo(() => {
  const raw = (messages as Record<string, unknown>)?.enrichments;
  if (!raw || typeof raw !== 'object') return undefined;
  const vp = (raw as Record<string, unknown>)?.videoPlayer;
  if (!vp || typeof vp !== 'object') return undefined;
  return vp as Partial<DefaultLayoutTranslations>;
}, [messages]);
```

**Recommended fix**: Extract to a custom hook in `packages/web/hooks/` or a shared utility:

```typescript
// packages/web/hooks/useVidstackTranslations.ts
export function useVidstackTranslations(): Partial<DefaultLayoutTranslations> | undefined {
  const messages = useMessages();
  return useMemo(() => {
    const raw = (messages as Record<string, unknown>)?.enrichments;
    if (!raw || typeof raw !== 'object') return undefined;
    const vp = (raw as Record<string, unknown>)?.videoPlayer;
    if (!vp || typeof vp !== 'object') return undefined;
    return vp as Partial<DefaultLayoutTranslations>;
  }, [messages]);
}
```

---

#### M5 — Audio overlay not shown when card is deactivated mid-play (correct behavior) but UX can confuse

**File**: `packages/web/components/course/viewer/components/EnrichmentCard.tsx`, lines 282-316

**Category**: UX edge case

**Description**: The audio overlay is rendered only when `isActive && isAudioType` (line 282). When the user clicks the Play/Close button to collapse an active audio card, `isActive` becomes `false` and the card collapses. The `AudioPlayer` component unmounts, which triggers cleanup and pauses audio. This is intentional and correct.

However, there is no visual "closing while playing" indicator. If the audio is playing and the user hits Close, the card collapses instantly with no transition for audio state. Additionally, the `isAudioPlaying` reset via `useEffect` (line 119-121) runs one render after `isActive` becomes `false`, meaning there is a single frame where `isActive=false` but `isAudioPlaying=true`. This is harmless since the overlay branch requires `isActive`, but it is a subtle timing dependency.

**Recommended fix**: No code change strictly required, but note this edge case in a comment for future maintainers. If the UX requirement changes (e.g., pausing audio on close rather than stopping), the cleanup in `AudioPlayer` would need to distinguish pause from full teardown.

---

### Low Priority (3)

---

#### L1 — `PLACEHOLDER_IMAGES` map duplicates data already in `ENRICHMENT_CONFIG`

**File**: `packages/web/components/course/viewer/components/EnrichmentCard.tsx`, lines 53-62

**Category**: Code quality / DRY

**Description**: The comment "same as UnifiedEnrichmentCard" acknowledges this is a copy. Maintaining two maps means a new enrichment type requires updating both files. This is an existing issue (pre-dates this PR) but was made worse by the rewrite adding more explicit usage of `placeholderImage`.

**Recommended fix**: Export the placeholder map from a shared location (e.g., `enrichment-config.ts` or a dedicated `enrichment-placeholders.ts` in the same directory), import it in both consumers.

---

#### L2 — `content` type cast in `AudioPlayer` is broad and bypasses type guards

**File**: `packages/web/components/course/viewer/enrichments/AudioPlayer.tsx`, lines 32-38

**Category**: Type safety

**Description**: `enrichment.content` is cast to an inline type union with `| null` directly:

```typescript
const content = enrichment.content as {
  type: 'audio';
  script?: string;
  duration_seconds: number;
  voice_id: string;
  format?: string;
} | null;
```

The codebase already has `isAudioContent()` type guard imported in other files. The direct cast bypasses the guard and may silently succeed even if the shape doesn't match (e.g., a malformed DB row). The `content?.duration_seconds` usage on line 49 would then access `undefined` on a non-audio row rather than using the guard's type narrowing.

**Recommended fix**: Use `isAudioContent()` from `../components/enrichment-type-guards` (already imported in `EnrichmentCard.tsx`) and let TypeScript narrow the type:

```typescript
import { isAudioContent } from '../components/enrichment-type-guards';

const audioContent = isAudioContent(enrichment.content) ? enrichment.content : null;
// Then use audioContent?.duration_seconds
```

---

#### L3 — `handleAudioOverlayToggle` skips the not-yet-loaded state check

**File**: `packages/web/components/course/viewer/components/EnrichmentCard.tsx`, lines 228-230
**File**: `packages/web/components/course/viewer/enrichments/AudioPlayer.tsx`, line 120

**Category**: UX edge case

**Description**: When the user clicks the audio overlay before the audio has buffered (`audio.readyState < 2`), `togglePlay` in `AudioPlayer` returns early (line 120) without toggling or calling `onPlayingChange`. The overlay icon stays on Play and the loading spinner inside `AudioPlayer` remains visible. This is correct behavior, but the overlay button has no visual disabled state for this condition, so clicks silently fail.

**Recommended fix**: Pass an `isAudioLoading` prop from `AudioPlayer` up to `EnrichmentCard` (similar to how `isPlaying` is propagated) and apply `cursor-not-allowed` or a spinner to the overlay button when audio is loading. Or disable the overlay click handler when `playbackUrl` is not yet available.

---

## Best Practices Validation

### React (Next.js 15 / React 19 compatible)

Pattern compliance review based on the changes:

- Correct: `useCallback` added for `togglePlay` to stabilize ref assignment
- Correct: `useRef` used for `audioToggleRef` (mutable, no re-render on change)
- Correct: Cleanup functions in effects (audio.pause + src reset)
- Correct: `AnimatePresence mode="wait"` for Play/Pause icon swap
- Deviation (H4): `useCallback` deps include `isPlaying` state — creates unnecessary recreation
- Deviation (H1): Cleanup effects don't fire `onPlayingChange` callback on teardown

### Vidstack (MediaPlayer / DefaultVideoLayout)

- Correct: `Poster` component used with `data-[visible]:opacity-100` pattern (matches Vidstack docs)
- Correct: `playsInline` set (required for mobile browsers)
- Correct: `playbackRates` and `seekStep` passed consistently with `persistent-video-player`
- Correct: `defaultLayoutIcons` passed
- Acceptable: `as any` on `src` prop — but see H2 for resolution path

---

## Validation Results

No automated checks were run as part of this review (no plan file in `.tmp/current/plans/`). The plan document specifies:

```
1. pnpm type-check — no errors
2. pnpm build — successful
```

These should be verified before merge. Given the `as any` suppressions (H2), `pnpm type-check` will pass but the underlying type unsafety is not caught by it.

---

## Files Reviewed

```
packages/web/components/course/viewer/components/EnrichmentCard.tsx  (full rewrite)
packages/web/components/course/viewer/enrichments/AudioPlayer.tsx     (+32 lines net)
```

Supporting files read for context (not changed, not reviewed):

```
packages/web/components/common/video-utils.ts
packages/web/components/common/persistent-video-player.tsx
packages/web/lib/helpers/storage-helpers.ts
packages/web/components/course/viewer/components/enrichment-config.ts
packages/web/components/course/viewer/components/EnrichmentsPanel.tsx
```

---

## Next Steps

### Should Fix Before Merge

1. **H1** — Add `onPlayingChange?.(false)` to both cleanup effects in `AudioPlayer.tsx` (lines 87, 111). One-line fix each.
2. **H3** — Add `urlError` state and a visible error branch in `renderImageArea` for video cards. Prevents silent playback failure.
3. **M1** — Remove `src={playbackUrl}` from the `<audio>` JSX element (line 212) to eliminate the double-fetch.

### Consider Before Merge

4. **H4** — Refactor `togglePlay` to use a `isPlayingRef` pattern to stabilize the callback.
5. **H2** — Replace `as any` on Vidstack `src` prop with a narrower cast or updated `formatVideoSrc` overload.

### Future Improvements

6. **M4** — Extract `useVidstackTranslations` hook to eliminate the duplicated `useMemo` block.
7. **L1** — Consolidate `PLACEHOLDER_IMAGES` into `enrichment-config.ts`.
8. **L2** — Replace inline content cast in `AudioPlayer` with `isAudioContent()` type guard.
9. **L3** — Add loading state indicator to audio overlay button.
10. **M2** — Include `enrichment.enrichment_type` directly in `useEffect` deps.

---

## Artifacts

- Plan file: `docs/plans/swirling-inventing-sketch.md`
- This report: `docs/reports/code-review/2026-02/enrichment-card-playback-review.md`

---

Code review complete. No critical blockers. H1 (overlay desync) and H3 (silent error) are the two issues most likely to be noticed by users and should be fixed before this ships.
