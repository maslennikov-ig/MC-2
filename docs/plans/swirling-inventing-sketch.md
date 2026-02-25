# Plan: Single-Click Video Playback & Audio Active Overlay

## Context

After the enrichment card redesign (mc2-n23gt), video playback requires **two clicks**: (1) our Play button activates the card and fetches the URL, (2) Vidstack's built-in play button starts the video. Audio cards show no visual feedback on the image area when playing. The user wants:

- Video: single-click play, or show the player immediately with poster
- Audio: darkening overlay with play/pause icon on the image area

## Approach

### Video: Pre-fetch URL + Vidstack with Poster

1. Fetch `playbackUrl` **eagerly on mount** (not on click) for completed video enrichments
2. When URL available: render `MediaPlayer` with `<Poster>` (placeholder image) in the image area — Vidstack shows its native big play button
3. When URL loading: placeholder image + spinner overlay
4. **Remove** our custom Play/Close button for video types — Vidstack has its own controls
5. Single click → video plays

**Why not autoplay?** Browser autoplay policies require a user gesture in the same synchronous call stack. The async URL fetch breaks the gesture chain. Pre-fetch + native Vidstack play button is reliable.

**Pre-fetch cost:** 0-2 video enrichments per lesson. Signed URL fetch is cheap (DB lookup + URL signing). Already precedented in `lesson-materials-switcher.tsx`.

### Audio: Darkening overlay synced with AudioPlayer state

1. Add `onPlayingChange` callback prop to `AudioPlayer` — fires when internal `isPlaying` changes
2. Add `togglePlayRef` prop to `AudioPlayer` — exposes `togglePlay()` for external control
3. In `EnrichmentCard`: track `isAudioPlaying` state from callback
4. When active: render dark overlay on image area with animated play/pause icon
5. Clicking overlay toggles play/pause via ref

## Files to Modify

| File                                                                  | Change                                                                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `packages/web/components/course/viewer/components/EnrichmentCard.tsx` | Pre-fetch URL on mount, Vidstack+Poster for video, audio overlay, remove video Play button |
| `packages/web/components/course/viewer/enrichments/AudioPlayer.tsx`   | Add `onPlayingChange` + `togglePlayRef` props                                              |

## Implementation Steps

### Step 1: AudioPlayer — add state sync props

In `AudioPlayer.tsx`:

- Add optional props: `onPlayingChange?: (isPlaying: boolean) => void`, `togglePlayRef?: React.MutableRefObject<(() => void) | null>`
- In `togglePlay()` (line 114): call `onPlayingChange?.(newState)` after state change
- In `handleEnded` (line 53): call `onPlayingChange?.(false)`
- Expose `togglePlay` via `togglePlayRef.current = togglePlay` in a useEffect
- Both props optional — backward compatible, no other callers affected

### Step 2: EnrichmentCard — pre-fetch URL on mount

Replace the current lazy fetch (line 101-105):

```tsx
// BEFORE: gated by isActive
useEffect(() => {
  if (isActive && (isAudioType || isVideoType) && enrichment.status === 'completed') {
    void getEnrichmentPlaybackUrl(enrichment).then(setPlaybackUrl)
  }
}, [isActive, ...])

// AFTER: eager fetch on mount
useEffect(() => {
  if ((isAudioType || isVideoType) && enrichment.status === 'completed') {
    setUrlLoading(true)
    getEnrichmentPlaybackUrl(enrichment)
      .then(setPlaybackUrl)
      .catch(() => setUrlError(true))
      .finally(() => setUrlLoading(false))
  }
}, [enrichment.id, enrichment.status, isAudioType, isVideoType])
```

Add new state: `urlLoading`, `urlError`.

### Step 3: EnrichmentCard — video image area with Vidstack + Poster

Replace the image area rendering (lines 230-254):

```tsx
{isVideoType && playbackUrl ? (
  // Always-visible Vidstack player with poster
  <MediaPlayer src={formatVideoSrc(playbackUrl)} playsInline className="h-full w-full">
    <MediaProvider>
      <Poster src={placeholderImage} alt={enrichment.title || label} />
    </MediaProvider>
    <DefaultVideoLayout ... />
  </MediaPlayer>
) : isVideoType && urlLoading ? (
  // Loading: placeholder + spinner
  <> <img src={placeholderImage} ... /> <Loader2 spinner overlay /> </>
) : isActive && isAudioType ? (
  // Audio active: darkened overlay with play/pause
  <> <img ... /> <dark overlay + animated play/pause icon /> </>
) : (
  // Default: placeholder image
  <> <img ... /> <gradient overlay /> </>
)}
```

Import `Poster` from `@vidstack/react` (add to existing import line 16).

### Step 4: EnrichmentCard — audio overlay

Add state + ref:

```tsx
const [isAudioPlaying, setIsAudioPlaying] = useState(false);
const audioToggleRef = useRef<(() => void) | null>(null);
```

Reset when deactivated:

```tsx
useEffect(() => {
  if (!isActive) setIsAudioPlaying(false);
}, [isActive]);
```

Overlay in image area (when `isActive && isAudioType`):

- `bg-black/40` darkening overlay
- Centered circle with `Play`/`Pause` icon (animated via `motion.div`)
- Click → `audioToggleRef.current?.()`
- Add `Pause` to lucide imports

Pass to AudioPlayer:

```tsx
<AudioPlayer
  enrichment={enrichment}
  playbackUrl={playbackUrl ?? undefined}
  onPlayingChange={setIsAudioPlaying}
  togglePlayRef={audioToggleRef}
/>
```

### Step 5: Remove Play/Close button for video types

Change line 311 condition from `isPlayableType` to `(isAudioType || type === 'quiz')`.

Video cards rely entirely on Vidstack's built-in controls.

## Edge Cases

| Case                            | Handling                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| URL fetch fails                 | Show placeholder image, no player. Regenerate button still works                   |
| URL fetch slow                  | `urlLoading` state shows spinner over placeholder                                  |
| Signed URL expires (1hr)        | Vidstack `onError` triggers — rare edge case, follow-up if needed                  |
| Audio deactivated while playing | AudioPlayer unmounts → cleanup pauses audio → `isAudioPlaying` reset via useEffect |
| Multiple video enrichments      | Max 2 per lesson, pre-fetch cost negligible                                        |

## Verification

1. `pnpm type-check` — no errors
2. `pnpm build` — successful
3. Visual check:
   - Video card shows Vidstack player with poster immediately (no click needed)
   - Click Vidstack play button → video plays (single click)
   - Audio card: click Play → image darkens with play/pause overlay
   - Audio overlay icon syncs with AudioPlayer state
   - Regenerate/Delete still work on all card types
   - Quiz/Presentation/Document cards unaffected
