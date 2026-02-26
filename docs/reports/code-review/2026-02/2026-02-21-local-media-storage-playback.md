# Code Review Report — Local Media Storage for NLM Audio/Video

Date: 2026-02-21
Owner: Codex (orchestrator)
Beads: `mc2-7ju8o`, `mc2-kmjs5`, `mc2-i1l8f`

## Scope

- Migrate Stage 7 media asset flow (`audio`, `nlm_audio`, `video`, `nlm_video`) to local-capable storage path.
- Fix `lesson_enrichments.asset_id` linkage to store valid UUID FK (`assets.id`) instead of storage path.
- Update playback URL flow for local storage compatibility.
- Remove direct web playback dependency on `supabase.storage.createSignedUrl` for media enrichments.
- Enable full local mode by default in `start-dev.sh`.

## Key Changes

### 1) Stage 7 Media Storage + Asset FK Linkage

- `packages/course-gen-platform/src/stages/stage7-enrichments/services/local-storage-service.ts`
  - Added support for `mp3` and `mp4` extensions.
  - Added media MIME mapping.
  - Increased local max file size from 50MB to 100MB.
  - Added `ENRICHMENTS_PUBLIC_BASE_URL` override for public URL generation.
- `packages/course-gen-platform/src/stages/stage7-enrichments/services/unified-storage-service.ts`
  - Added backward-compatible overloaded `uploadEnrichmentAsset(...)` API:
    - legacy image call preserved,
    - media-aware signature (`mimeType`, `extension`) added.
- `packages/course-gen-platform/src/stages/stage7-enrichments/services/database-service.ts`
  - Added `upsertAssetAndLinkEnrichment(...)`:
    - upserts `assets` row,
    - links `lesson_enrichments.asset_id` to `assets.id` UUID.
- `packages/course-gen-platform/src/stages/stage7-enrichments/services/job-processor.ts`
  - Switched upload path from direct Supabase storage service to unified storage service.
  - Replaced direct path-linking with `upsertAssetAndLinkEnrichment(...)`.

### 2) Playback URL Backend/Web Flow

- `packages/course-gen-platform/src/server/routers/enrichment/procedures/get-playback-url.ts`
  - Resolves `assets.file_path` by `enrichment.asset_id`.
  - Local mode: returns local URL (`buildPublicUrl`).
  - Supabase mode: returns signed URL (existing behavior).
  - Added guard for already-absolute asset URLs.
- `packages/web/lib/helpers/storage-helpers.ts`
  - Replaced direct Supabase signed URL logic with tRPC `enrichment.getPlaybackUrl`.
  - Added error-safe fallback to `null`.
- `packages/web/app/actions/enrichment-actions.ts`
  - For playback types, switched to backend playback endpoint instead of direct storage signed URL.
  - Non-playback fallback behavior preserved.
- `packages/web/components/course/viewer/components/EnrichmentCard.tsx`
  - Updated effect dependency from `asset_id` to `id` for helper signature alignment.

### 3) Local Serving + Dev Startup Defaults

- `packages/course-gen-platform/src/server/index.ts`
  - Added static route `/storage/enrichments/*` when `USE_LOCAL_STORAGE=true`.
- `start-dev.sh`
  - Defaults to full local mode:
    - `USE_LOCAL_STORAGE=true`
    - `ENRICHMENTS_LOCAL_PATH` default
    - `ENRICHMENTS_PUBLIC_URL` default
    - `ENRICHMENTS_PUBLIC_BASE_URL=http://127.0.0.1:3456`
  - Ensures local enrichments directory exists.
- `packages/course-gen-platform/.env.example`
  - Added local storage env var documentation.

## Tests Added

- `packages/course-gen-platform/tests/unit/stages/stage7-local-storage-service.test.ts`
- `packages/course-gen-platform/tests/unit/stages/stage7-unified-storage-service.test.ts`
- `packages/course-gen-platform/tests/unit/stages/stage7-database-service-asset-link.test.ts`
- `packages/course-gen-platform/tests/unit/stages/stage7-job-processor-media-storage.test.ts`
- `packages/course-gen-platform/tests/unit/enrichment-procedures/get-playback-url.test.ts`
- `packages/web/lib/helpers/__tests__/storage-helpers.test.ts`
- `packages/web/tests/unit/enrichment-actions.get-enrichment.test.ts`

## Verification Commands Run

- `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/enrichment-procedures/get-playback-url.test.ts tests/unit/stages/stage7-local-storage-service.test.ts tests/unit/stages/stage7-unified-storage-service.test.ts tests/unit/stages/stage7-database-service-asset-link.test.ts tests/unit/stages/stage7-job-processor-media-storage.test.ts`
- `pnpm --filter @megacampus/web test -- lib/helpers/__tests__/storage-helpers.test.ts tests/unit/enrichment-actions.get-enrichment.test.ts`
- `pnpm --filter @megacampus/course-gen-platform type-check`
- `pnpm --filter @megacampus/web type-check`
- `bash -n start-dev.sh`

All commands above passed.

## Reviewer Checklist

- Confirm `lesson_enrichments.asset_id` is always UUID FK in new media generations.
- Confirm local playback URL is returned from `enrichment.getPlaybackUrl` when `USE_LOCAL_STORAGE=true`.
- Confirm no direct web playback signed URL call remains for playback media types.
- Confirm `start-dev.sh` boots in full local mode and playback works from fresh run.

## Context7 Usage

- Consulted Context7 for Supabase JS Storage URL behavior (`createSignedUrl`, `getPublicUrl`) to validate path and URL handling decisions for mixed local/Supabase playback flow.
