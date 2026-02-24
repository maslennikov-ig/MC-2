# NotebookLM Bridge `fetch failed` Timeout Fix (2026-02-21)

## Context

- Symptom in Stage 7 logs: `TypeError: fetch failed` after ~303s during `nlm_audio` / `nlm_video`.
- Root cause: Node `fetch` (Undici) applies default 300s header/body timeouts; long NotebookLM generations exceeded that window.

## What Was Changed

- Replaced transport in Stage 7 NotebookLM bridge client from `fetch + AbortController` to `axios.post` with explicit timeout from `NOTEBOOKLM_BRIDGE_TIMEOUT_MS`.
- Preserved explicit non-2xx error payload propagation (`NotebookLM bridge request failed (<status>): ...`).
- Added explicit Axios error mapping:
  - `ECONNABORTED` -> `NotebookLM bridge request timed out after <timeout>ms`
  - Other Axios transport failures -> `NotebookLM bridge network request failed: ...`
- Removed obsolete `draft_content` write during enrichment regeneration (column does not exist in `lesson_enrichments` schema).

## Files

- `packages/course-gen-platform/src/stages/stage7-enrichments/services/notebooklm-bridge-client.ts`
- `packages/course-gen-platform/tests/unit/stages/stage7-notebooklm-bridge-client.test.ts`
- `packages/course-gen-platform/src/server/routers/enrichment/procedures/regenerate.ts`

## Test Coverage Added/Updated

- Existing bridge-client tests migrated from `fetch` mocks to `axios.post` mocks.
- Added assertions for:
  - Default 30-minute timeout wiring.
  - Timeout error mapping (`ECONNABORTED`).
  - Network-level Axios failure mapping.
  - Non-2xx bridge status propagation.
- Verified regeneration path still works after removing `draft_content` assignment.

## Verification Run

- `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/stages/stage7-notebooklm-bridge-client.test.ts`
- `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/stages/stage7-notebooklm-bridge-client.test.ts tests/unit/stages/stage7-nlm-audio-handler.test.ts tests/unit/stages/stage7-nlm-video-handler.test.ts tests/unit/stages/stage7-enrichment-router.test.ts`
- `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/enrichment-procedures/regenerate.test.ts tests/unit/stages/stage7-notebooklm-bridge-client.test.ts`
- `pnpm --filter @megacampus/course-gen-platform type-check`

All commands passed.

## Runtime Check

- Executed smoke script without forced regeneration on existing completed enrichment:
  - `pnpm --filter @megacampus/course-gen-platform exec tsx scripts/nlm-stage7-smoke.ts --lesson-id 3d39c52e-929e-432c-b6e3-b3ae741edee5 --type nlm_audio --no-regenerate-if-exists --timeout-seconds 45 --poll-interval-seconds 5`
- Result: completed status confirmed.
- Report file: `logs/nlm-stage7-smoke/2026-02-21T10-02-48-228Z.json`
- Note: signed URL lookup returned `Object not found`, but local artifact path was resolved successfully (`data/enrichments/...mp3`), consistent with local-storage mode.

## Hidden-Problem Sweep

- Searched Stage 7 + enrichment router runtime code for additional `fetch` calls: none found in runtime path.
- Only match is `audio-prompt.example.ts` (non-runtime example file).
- Runtime smoke preflight also exposed DB contract mismatch in `regenerate`:
  - `Could not find the 'draft_content' column of 'lesson_enrichments' in the schema cache`
  - Fixed by removing `draft_content` update in regenerate procedure.

## Documentation Basis (Context7)

- Node/Undici docs via Context7 (`/nodejs/node`): default `headersTimeout` and `bodyTimeout` are `300e3`.
- Axios docs via Context7 (`/websites/axios-http_cn`): timeout config + `validateStatus` behavior.
