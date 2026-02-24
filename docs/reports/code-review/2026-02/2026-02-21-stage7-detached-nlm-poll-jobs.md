# Stage7 Detached NotebookLM Poll Jobs (2026-02-21)

## Scope

Implemented detached async orchestration in Stage7 for `nlm_audio` and `nlm_video`:

- start NotebookLM task
- persist async task state
- schedule short delayed poll jobs
- finalize/upload only when media is ready

Beads:

- `mc2-83jkk` (epic)
- `mc2-83jkk.1` tests
- `mc2-83jkk.2` smoke/report
- `mc2-83jkk.3` implementation

## Changed files

- `packages/course-gen-platform/src/stages/stage7-enrichments/types/index.ts`
- `packages/course-gen-platform/src/stages/stage7-enrichments/services/notebooklm-bridge-client.ts`
- `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/nlm-audio-handler.ts`
- `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/nlm-video-handler.ts`
- `packages/course-gen-platform/src/stages/stage7-enrichments/services/database-service.ts`
- `packages/course-gen-platform/src/stages/stage7-enrichments/services/job-processor.ts`
- `packages/course-gen-platform/tests/unit/stages/stage7-nlm-audio-handler.test.ts`
- `packages/course-gen-platform/tests/unit/stages/stage7-nlm-video-handler.test.ts`
- `packages/course-gen-platform/tests/unit/stages/stage7-job-processor-media-storage.test.ts`

## Implementation details

### 1) Stage7 job payload/state

- Added `nlmAsyncState` to Stage7 job input.
- Added progress phases: `pending_async`, `polling_async`.
- Added deferred result contract (`deferredTask`) in `GenerateResult`.

### 2) Bridge client contract

- Added explicit status helpers:
  - `isNotebookLMTaskSuccessfulStatus`
  - `isNotebookLMTaskFailedStatus`
- Added one-shot media fetch:
  - `getTaskMedia(taskId, mediaType)`

### 3) NLM handlers

- `nlm_audio` and `nlm_video` now support two internal async modes:
  - `start` mode: start task, return `deferredTask` if no immediate media
  - `poll` mode: check status and either re-defer or fetch final media
- Failed bridge task status now throws explicit final error.

### 4) Durable async metadata

- Added `saveNotebookLMAsyncMetadataState(...)` in DB service.
- Persists `metadata.additional_info.notebooklm_async_state` with:
  - task id/media type/status
  - poll attempt
  - started/last-polled timestamps
  - bridge response metadata

### 5) Detached poll orchestration in processor

- Initial NLM run:
  - generates draft
  - starts bridge task
  - saves async metadata
  - enqueues delayed poll job
  - returns `status=generating` (without long blocking wait)
- Poll runs:
  - re-use draft + task id from payload
  - if still pending/in_progress: re-enqueue next poll with backoff
  - if ready: fetch media, upload asset, mark enrichment completed
- Added stale poll guard:
  - skips processing if enrichment already terminal.
- Added cancelled guard:
  - exits without new scheduling if enrichment already cancelled.

## Verification

### Unit tests

```bash
pnpm --filter @megacampus/course-gen-platform test -- \
  tests/unit/stages/stage7-nlm-audio-handler.test.ts \
  tests/unit/stages/stage7-nlm-video-handler.test.ts \
  tests/unit/stages/stage7-job-processor-media-storage.test.ts \
  tests/unit/stages/stage7-notebooklm-bridge-client.test.ts
```

Result: passed (`4 files`, `27 tests`).

### Regression + type-check

```bash
pnpm --filter @megacampus/course-gen-platform test -- \
  tests/unit/enrichment-procedures/generate-on-demand.test.ts \
  tests/unit/enrichment-procedures/regenerate.test.ts \
  tests/unit/stages/stage7-enrichment-router.test.ts
pnpm --filter @megacampus/course-gen-platform type-check
```

Result: passed.

### Runtime smoke evidence (local)

Triggered `nlm_audio` regeneration via:

```bash
pnpm --filter @megacampus/course-gen-platform exec tsx scripts/nlm-stage7-smoke.ts --type nlm_audio
```

Observed in `logs/dev/worker-stage7-20260221-185239.log`:

- initial job starts NotebookLM task and schedules `poll-1`
- `poll-1`, `poll-2`, `poll-3` processed as short jobs
- each poll reschedules next poll with backoff
- no single long-running Stage7 job lock-holding

Sample job chain:

- `enrich-d707e3aa-ce1c-4565-a65a-fcb68e119563-7`
- `enrich-ondemand-d707e3aa-ce1c-4565-a65a-fcb68e119563-poll-1`
- `...-poll-2`
- `...-poll-3`
- `...-poll-4`

Triggered `nlm_video` generation via:

```bash
pnpm --filter @megacampus/course-gen-platform exec tsx scripts/nlm-stage7-smoke.ts --type nlm_video
```

Observed in same worker log:

- initial video job generated draft and started bridge task
- detached scheduling to `enrich-ondemand-30f93d2b-822c-4e3c-b1cf-46c177594985-poll-1`
- Stage7 job returned quickly with `status=generating` after scheduling poll

Note:

- Both smoke runs were intentionally interrupted after detached poll behavior was confirmed in logs (to avoid waiting full provider runtime).

## Known limitations / follow-up

- Live completion time still depends on NotebookLM provider latency.
- Progress percentage for async waiting is currently static on API side (`generating`), while poll jobs continue in background.
- If needed, add separate UI progress smoothing derived from elapsed async wait window.

## Reviewer checklist

1. Confirm no long synchronous wait remains in Stage7 NLM paths.
2. Confirm poll job IDs/delay/backoff and stale/cancel guards.
3. Confirm DB metadata merge logic is safe for existing metadata.
4. Re-run listed tests and inspect runtime poll logs.
