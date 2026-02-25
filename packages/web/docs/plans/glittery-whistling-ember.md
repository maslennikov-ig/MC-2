# Plan: Redesign Enrichment Cards for Completed Video/Audio

## Context

After enrichment generation completes, the card switches from `UnifiedEnrichmentCard` (nice grid layout, 480px height, image area, hover panel) to `EnrichmentCard` (full-width stretched card with colored header). This creates a jarring UX:

1. **Layout mismatch** — completed cards are full-width stacked, placeholders are in a 2-3 column grid
2. **No video playback** — video card has a "Play" button but clicking it does nothing (no player embedded)
3. **No management actions** — no way to regenerate or delete from the viewer card
4. **Visual inconsistency** — completed cards look square/stretched vs the polished placeholder design

## Goal

Completed video/audio enrichment cards should:

- Match the visual style and grid position of `UnifiedEnrichmentCard` (same rounded-2xl, min-h, hover panel)
- Support **inline** video playback — Vidstack `DefaultVideoLayout` opens directly inside the card
- Have action buttons: **Play**, **Regenerate**, **Delete** (with confirmation)
- Audio already works inline — preserve that behavior, just restyle into grid card format

## Files to Modify

| File                                                                    | Action                                                                       |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `packages/web/components/course/viewer/components/EnrichmentCard.tsx`   | Redesign for video/audio — embed video player, add actions, match grid style |
| `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx` | Move completed enrichments into the same grid as placeholders                |
| `packages/web/messages/ru/enrichments.json`                             | Add translation keys for new actions                                         |
| `packages/web/messages/en/enrichments.json`                             | Add translation keys for new actions                                         |

## Reference Files (read-only)

- `packages/web/components/course/viewer/components/UnifiedEnrichmentCard.tsx` — visual style target (grid card, 480px min-height, image area, hover panel)
- `packages/web/components/course/viewer/components/enrichment-config.ts` — type → color/icon mapping
- `packages/web/components/common/persistent-video-player.tsx` — Vidstack DefaultVideoLayout integration
- `packages/web/components/course/viewer/enrichments/AudioPlayer.tsx` — working audio player
- `packages/web/app/actions/enrichment-actions.ts` — `deleteEnrichment()`, `regenerateEnrichment()` server actions
- `packages/web/lib/helpers/storage-helpers.ts` — `getEnrichmentPlaybackUrl()`

## Implementation Steps

### Step 1: Move completed enrichments into the grid

In `EnrichmentsPanel.tsx`:

**Current layout:**

```
[EnrichmentCard video]          ← full-width, stacked
[EnrichmentCard nlm_video]      ← full-width, stacked
[EnrichmentCard audio]          ← full-width, stacked
──────────────────────────────
[grid 3-col]
  [UnifiedCard placeholder1]
  [UnifiedCard placeholder2]
  [UnifiedCard placeholder3]
```

**Target layout:**

```
[grid 3-col]
  [CompletedCard video]         ← same grid cell as placeholders
  [CompletedCard audio]
  [UnifiedCard placeholder1]
  [UnifiedCard placeholder2]
  ...
```

- Remove the separate sections for each type (lines 213-334 — all the individual `groupedEnrichments.video?.map()` etc.)
- Instead, combine completed enrichments + placeholders into a single array and render them all in one grid
- Completed enrichments sorted first (video, nlm_video, audio, nlm_audio, presentation, quiz, document), then placeholders

### Step 2: Redesign `EnrichmentCard` to match grid style

Transform `EnrichmentCard` from a full-width `<Card>` into a grid-sized card matching `UnifiedEnrichmentCard` visual style:

**Current:** `<Card>` with `<CardHeader>` + `<CardContent>` (flat, wide)

**New structure:**

```tsx
<motion.div className="group relative flex min-h-[480px] flex-col overflow-hidden rounded-2xl ...">
  {/* Image/Preview Area — show placeholder image or video thumbnail */}
  <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
    {/* For video: show thumbnail or embedded player when active */}
    {/* For audio: show placeholder image */}
    {/* Badge overlay with duration */}
  </div>

  {/* Info area */}
  <div className="p-4">
    <h3>{title}</h3>
    <p>{description}</p>
  </div>

  {/* Hover Reveal Panel with actions */}
  <AnimatePresence>
    {shouldShowPanel && (
      <motion.div className="absolute inset-x-0 bottom-0 ...">
        {/* Play button (video) or Play/Pause (audio) */}
        {/* Regenerate button */}
        {/* Delete button */}
      </motion.div>
    )}
  </AnimatePresence>
</motion.div>
```

### Step 3: Add inline video playback

When user clicks Play on video enrichment card, the thumbnail area is replaced by an inline Vidstack player:

```tsx
import { MediaPlayer, MediaProvider } from '@vidstack/react'
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default'
import { useMessages } from 'next-intl'
import { formatVideoSrc } from '@/components/common/video-utils'

// Fetch playbackUrl when card becomes active (same as audio pattern):
useEffect(() => {
  if (isActive && isVideoType && enrichment.status === 'completed') {
    void getEnrichmentPlaybackUrl(enrichment).then(setPlaybackUrl)
  }
}, [isActive, enrichment.id, enrichment.status])

// In the image area, when isActive:
<MediaPlayer src={formatVideoSrc(playbackUrl)} playsInline className="h-full w-full">
  <MediaProvider />
  <DefaultVideoLayout
    icons={defaultLayoutIcons}
    translations={vidstackTranslations}
    playbackRates={[0.5, 0.75, 1, 1.25, 1.5, 2]}
    seekStep={10}
  />
</MediaPlayer>
```

- Uses same `DefaultVideoLayout` + i18n pattern as `persistent-video-player.tsx`
- `getEnrichmentPlaybackUrl()` fetches signed URL from Supabase Storage
- `formatVideoSrc()` handles YouTube/direct URL format detection
- Player fills the image area (`aspect-[4/3]`) keeping the card dimensions intact
- Close button (X) returns to thumbnail view

### Step 4: Add regenerate & delete actions

On the hover panel (same pattern as UnifiedEnrichmentCard), show action buttons:

```tsx
// Always visible in the info area (not just on hover):
<div className="mt-3 flex items-center gap-2">
  <Button size="sm" className="flex-1 gap-2" onClick={onToggle}>
    {isActive ? (
      <>
        <X /> {t('viewer.close')}
      </>
    ) : (
      <>
        <Play /> {t('viewer.play')}
      </>
    )}
  </Button>
  <Button
    variant="outline"
    size="icon-sm"
    onClick={handleRegenerate}
    title={t('actions.regenerate')}
  >
    <RefreshCw className="h-4 w-4" />
  </Button>
  <Button
    variant="outline"
    size="icon-sm"
    onClick={handleDelete}
    className="text-red-500"
    title={t('actions.delete')}
  >
    <Trash2 className="h-4 w-4" />
  </Button>
</div>
```

**Regenerate flow:**

1. Call `regenerateEnrichment({ enrichmentId, courseId })` server action
2. Toast success → card switches to generating state
3. `onRefreshEnrichments()` callback refreshes the list

**Delete flow:**

1. Show confirmation dialog (AlertDialog): "Удалить это дополнение?"
2. On confirm → call `deleteEnrichment({ enrichmentId, courseId })` server action
3. Toast success → `onRefreshEnrichments()` removes card from list

### Step 5: Add i18n keys

Add to `enrichments.viewer` in both locale files:

**Russian (`messages/ru/enrichments.json`):**

```json
"confirmDeleteTitle": "Удалить дополнение?",
"confirmDeleteDescription": "Это действие нельзя отменить. Медиафайл будет удалён.",
"deleteSuccess": "Дополнение удалено",
"deleteFailed": "Не удалось удалить дополнение",
"regenerateSuccess": "Перегенерация запущена",
"regenerateFailed": "Не удалось запустить перегенерацию",
"confirm": "Удалить",
"cancel": "Отмена"
```

**English (`messages/en/enrichments.json`):**

```json
"confirmDeleteTitle": "Delete enrichment?",
"confirmDeleteDescription": "This action cannot be undone. The media file will be deleted.",
"deleteSuccess": "Enrichment deleted",
"deleteFailed": "Failed to delete enrichment",
"regenerateSuccess": "Regeneration started",
"regenerateFailed": "Failed to start regeneration",
"confirm": "Delete",
"cancel": "Cancel"
```

## New Props for EnrichmentCard

```typescript
interface EnrichmentCardProps {
  enrichment: EnrichmentRow
  isActive: boolean
  onToggle: () => void
  courseId?: string // NEW: for regenerate/delete server actions
  onRefreshEnrichments?: () => void // NEW: callback after delete/regenerate
}
```

## Verification

1. `pnpm type-check` — no errors in web package
2. `pnpm test --filter @megacampus/web` — existing tests pass
3. Visual check on lesson page:
   - Completed video/audio cards are in the same grid as placeholders
   - Cards have same size/style as `UnifiedEnrichmentCard`
   - Video plays inline when clicking Play
   - Regenerate button triggers regeneration
   - Delete button shows confirmation, then removes card
   - Audio still works (regression check)
   - Quiz and presentation cards still work
4. `pnpm build` — successful
