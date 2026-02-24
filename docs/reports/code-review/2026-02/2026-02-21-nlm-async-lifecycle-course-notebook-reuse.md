# NLM Async Lifecycle + Course Notebook Reuse (2026-02-21)

## Scope

Implemented async NotebookLM orchestration for both `nlm_audio` and `nlm_video` plus course-scoped notebook reuse to avoid creating a new NotebookLM notebook per generation.

Beads:

- Parent: `mc2-yuhag`
- Subtasks: `mc2-yuhag.1`, `mc2-yuhag.2`, `mc2-yuhag.3`, `mc2-yuhag.4`

## What changed

### 1) Bridge API: async lifecycle endpoints

Files:

- `packages/course-gen-platform/docker/notebooklm-bridge/app/main.py`
- `packages/course-gen-platform/docker/notebooklm-bridge/app/models.py`

Added first-class async endpoints:

- `POST /artifacts/generate-audio/start`
- `GET /artifacts/generate-audio/{task_id}/status`
- `GET /artifacts/generate-audio/{task_id}/result`
- `POST /video/generate-overview/start`
- `GET /video/generate-overview/{task_id}/status`
- `GET /video/generate-overview/{task_id}/result`

Bridge keeps legacy blocking endpoints for compatibility:

- `POST /artifacts/generate-audio`
- `POST /video/generate-overview`

Implemented in-memory task store with states:

- `queued` -> `in_progress` -> `completed|failed`

### 2) Bridge generator hardening

Files:

- `packages/course-gen-platform/docker/notebooklm-bridge/app/generator.py`
- `packages/course-gen-platform/docker/notebooklm-bridge/app/config.py`

Added/kept:

- shared global queue for audio+video starts
- short per-poll RPC timeout + transient poll retry limit
- robust logging around poll transitions and failures

### 3) Course-scoped notebook reuse

File:

- `packages/course-gen-platform/docker/notebooklm-bridge/app/generator.py`

Behavior:

- If `course_id` is provided: use one notebook per course (`title = course:<course_id>`), reused across requests.
- On cold start/restart, bridge attempts to find existing course notebook by title before creating new one.
- If `course_id` is not provided: preserve ephemeral notebook behavior.

### 4) Stage7 TypeScript migration to async flow

Files:

- `packages/course-gen-platform/src/stages/stage7-enrichments/services/notebooklm-bridge-client.ts`
- `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/nlm-audio-handler.ts`
- `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/nlm-video-handler.ts`

Bridge client now supports:

- `startAudio` / `startVideo`
- `getTaskStatus(taskId, mediaType)`
- `getTaskResult(taskId, mediaType)`
- `waitForTaskMedia(taskId, mediaType, options)`

Important fixes done during manual review:

- corrected status/result calls to proper async endpoint contract
- added GET support for task endpoints
- switched defaults to async start/status/result paths
- added legacy fallback from async start path to old blocking path on 404
- added dedicated short poll-request timeout (`NOTEBOOKLM_BRIDGE_POLL_REQUEST_TIMEOUT_MS`, default 30s)

Handlers now:

- pass `courseId` (`course_id`) to bridge for notebook reuse
- use async start->wait lifecycle for both audio and video
- preserve existing Stage7 storage contract (buffer/mime/ext metadata)

### 5) Docs/config updates

Files:

- `packages/course-gen-platform/docker/notebooklm-bridge/README.md`
- `.env.example`
- `packages/course-gen-platform/.env.example`
- `start-dev.sh`

Added documentation and env notes for async behavior and poll timeout.

## Tests and verification

### Python bridge tests

Command:

```bash
cd packages/course-gen-platform/docker/notebooklm-bridge
PYTHONPATH=. .venv/bin/pytest -q tests/test_api.py tests/test_queue.py
```

Result:

- `24 passed`

### TypeScript stage7 tests

Command:

```bash
pnpm --filter @megacampus/course-gen-platform test -- \
  tests/unit/stages/stage7-notebooklm-bridge-client.test.ts \
  tests/unit/stages/stage7-nlm-audio-handler.test.ts \
  tests/unit/stages/stage7-nlm-video-handler.test.ts
```

Result:

- `3 files passed`, `20 tests passed`

### Type-check

Command:

```bash
pnpm --filter @megacampus/course-gen-platform type-check
```

Result:

- passed

### Python compile

Command:

```bash
python3 -m py_compile \
  packages/course-gen-platform/docker/notebooklm-bridge/app/config.py \
  packages/course-gen-platform/docker/notebooklm-bridge/app/generator.py \
  packages/course-gen-platform/docker/notebooklm-bridge/app/main.py \
  packages/course-gen-platform/docker/notebooklm-bridge/app/models.py
```

Result:

- passed

### Runtime async smoke (HTTP)

Built and ran bridge container in fallback mode and verified:

- `POST /artifacts/generate-audio/start` returns `task_id`
- `GET /artifacts/generate-audio/{task_id}/status` reaches `completed`
- `GET /artifacts/generate-audio/{task_id}/result` returns artifact

Observed output:

- `poll[1]=completed`
- `result_status=completed`
- `has_artifact=True`

## Known limitations

- Bridge task store is in-memory (task state does not survive bridge restart).
- Notebook ID cache is in-memory, but course notebook reuse persists across restarts via title lookup (`course:<course_id>`).

## Reviewer focus checklist

1. Confirm async task endpoint contract and method semantics in `app/main.py`.
2. Confirm Stage7 client calls correct endpoints and media-type-specific status/result routing.
3. Confirm fallback compatibility path and timeout handling in `notebooklm-bridge-client.ts`.
4. Confirm course notebook reuse behavior and restart path in `_resolve_notebook`.
5. Re-run listed tests and smoke script to validate.
