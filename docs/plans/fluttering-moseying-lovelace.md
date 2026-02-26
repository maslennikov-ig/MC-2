# Fix: Audio playback and Media tab broken on Dev server

## Context

On the Dev server (dev.ai.megacampus.ru), three issues exist:

1. **Audio in lesson content**: infinite "loading audio" spinner, never plays
2. **Media tab**: enrichment cards show briefly as loading, then appear without play buttons
3. **Video in lesson content**: works fine (accidentally, via legacy fallback)

Everything works locally because local dev uses Supabase Storage (not local filesystem).

## Root Cause: Missing `USE_LOCAL_STORAGE` on API container

**Verified via SSH to server.**

In `docker-compose.dev.yml`:

- `worker-stage7-dev` has `USE_LOCAL_STORAGE=true` → saves enrichment files to local filesystem
- `api-dev` does **NOT** have `USE_LOCAL_STORAGE` → defaults to `false` → tries Supabase signed URLs

When the browser calls `getPlaybackUrl` tRPC endpoint:

1. `api-dev` receives the request
2. `useLocalStorage()` returns `false` (env var not set)
3. Calls `getSignedUrl(assetPath)` → Supabase Storage → file doesn't exist there → throws error
4. Returns `{ url: null }` to the client
5. Client shows no play button (video/audio)

**Why video works in lesson content tab despite this:**

`LessonMaterialsSwitcher` has a legacy asset fallback (lines 189-237) that bypasses the API entirely. It reads `asset.file_path` from SSR data and constructs a direct URL:

```
/storage/enrichments/${legacyVideoAsset.file_path}
```

Browser resolves this to `https://dev.ai.megacampus.ru/storage/enrichments/...` → nginx serves the file from disk. No API server involved.

Audio has no such fallback → depends entirely on the broken `getPlaybackUrl` API path → infinite loader.

## Fix Plan

### Step 1: Add `USE_LOCAL_STORAGE` to `api-dev` service (root cause fix)

**File**: `docker-compose.dev.yml` (on server at `/opt/megacampus/docker-compose.dev.yml`)
**Also in repo**: `deploy/docker/docker-compose.dev.yml` (if exists) or create from server copy

Add to `api-dev.environment`:

```yaml
api-dev:
  environment:
    # ... existing vars ...
    # Local storage for enrichment playback URLs (must match worker-stage7-dev)
    - USE_LOCAL_STORAGE=true
    - ENRICHMENTS_PUBLIC_URL=/storage/enrichments
    - ENRICHMENTS_PUBLIC_BASE_URL=https://dev.ai.megacampus.ru
```

The API server doesn't need a volume mount for enrichments — it only builds the public URL. Nginx serves the actual files.

### Step 2: Add `USE_LOCAL_STORAGE` to production API services

Check `docker-compose.production.yml` / blue/green configs — if production also uses local storage, the API services need the same env vars. Otherwise the same bug exists on staging.

**Files to check on server**:

- `/opt/megacampus/docker-compose.production.yml`
- `/opt/megacampus/docker-compose.app.yml`

### Step 3: AudioPlayer — add `error` event listener (code robustness)

**File**: `packages/web/components/course/viewer/enrichments/AudioPlayer.tsx`

Currently: no `error` event listener on `<audio>`. If source fails → `loadstart` fires (spinner on) → `canplay` never fires → spinner forever.

Fix:

1. Add `hasError` state
2. Add `error` event listener → `setIsLoading(false); setHasError(true)`
3. Reset `hasError` when `playbackUrl` changes
4. Show error UI instead of infinite loader when `hasError` is true

### Step 4: EnrichmentCard — proper "unavailable" state (code robustness)

**File**: `packages/web/components/course/viewer/components/EnrichmentCard.tsx`

Currently: when `getPlaybackUrl` returns null, `playbackUrl` stays null, `urlLoading` becomes false, card falls to default placeholder — no play button, no error message.

Fix: When URL fetch completes and `playbackUrl` is null → set `urlError = true` so the existing error UI renders ("Video unavailable" / "Audio unavailable").

In the `useEffect` (line 88-98):

```typescript
.then((url) => {
  setPlaybackUrl(url)
  if (!url) setUrlError(true)  // null URL = unavailable
})
```

## Files to Modify

1. `docker-compose.dev.yml` (on server) — Add USE_LOCAL_STORAGE to api-dev (Step 1)
2. Production docker-compose (on server) — Add USE_LOCAL_STORAGE to API services (Step 2)
3. `packages/web/components/course/viewer/enrichments/AudioPlayer.tsx` — Error handling (Step 3)
4. `packages/web/components/course/viewer/components/EnrichmentCard.tsx` — Null URL → error state (Step 4)

## Verification

1. SSH to server, add env vars to `api-dev`, restart: `docker compose -f docker-compose.dev.yml restart api-dev`
2. Test on `dev.ai.megacampus.ru`: open a lesson with audio/video enrichments
3. **Audio in content tab**: should play (not infinite loader)
4. **Media tab**: should show play buttons on completed enrichments
5. **Video in content tab**: should still work (now via main path, not fallback)
6. Deploy code fixes → `pnpm type-check && pnpm build`
7. Verify AudioPlayer shows error state when source is broken (not infinite loader)
