# Code Review Report: Global NotebookLM Queue + Shiki Version Unification

Date: 2026-02-20  
Author: Codex (orchestrated with subagents + manual verification)

## Scope

Implemented two items requested in the current iteration:

1. Global in-process queue/backpressure for NotebookLM bridge generation (audio + video).
2. Shiki dependency unification to remove Turbopack warning caused by mixed major versions.

## Beads Orchestration

Created and executed:

- `mc2-6ye5z.11` — Bridge global queue/backpressure
- `mc2-6ye5z.12` — Shiki version unification

Both tasks were delegated to workers and then independently re-verified manually. Both tasks are now closed.

## Context7 Notes Used

- FastAPI guidance for shared in-process state and lifespan/process caveats:
  - `/fastapi/fastapi` docs on lifespan and multi-worker process separation.

Implication for this implementation:

- Queue/backpressure is in-process per FastAPI worker process (as intended for current single-worker bridge runtime).

## Changes

### 1) Bridge global queue/backpressure

#### Files

- `packages/course-gen-platform/docker/notebooklm-bridge/app/config.py`
- `packages/course-gen-platform/docker/notebooklm-bridge/app/generator.py`
- `packages/course-gen-platform/docker/notebooklm-bridge/tests/test_queue.py` (new)
- `packages/course-gen-platform/docker/notebooklm-bridge/README.md`

#### Behavior

- Added shared global admission controller for generation starts (`audio` and `video` share same queue).
- Requests wait in FIFO queue when all slots are busy.
- If waiting exceeds configured timeout, raises `MediaGenerationTimeoutError` with queue context (`media_type`, `active`, `queued`, `max_concurrency`).
- API contract unchanged; existing HTTP mapping remains intact.

#### New env knobs

- `NOTEBOOKLM_GLOBAL_GENERATION_CONCURRENCY` (default `2`)
- `NOTEBOOKLM_QUEUE_WAIT_TIMEOUT_SECONDS` (default `1800`)

#### Existing timeout baseline (already in branch)

- `NOTEBOOKLM_GENERATION_TIMEOUT_SECONDS` default `1800`.

### 2) Shiki unification

#### Files

- `packages/web/package.json`
- `package.json` (root override)
- `pnpm-lock.yaml`

#### Behavior

- Web dependency aligned to `shiki ^3.19.0`.
- Root `pnpm.overrides` pins `shiki` to `^3.19.0` to prevent re-divergence.
- `pnpm why shiki -r` now shows single effective major in web path.

## Validation Executed

### Bridge

- `cd packages/course-gen-platform/docker/notebooklm-bridge && .venv/bin/python -m pytest -q tests`  
  Result: `11 passed`
- `cd packages/course-gen-platform/docker/notebooklm-bridge && .venv/bin/python -m compileall -q app tests`  
  Result: success

### Web / Dependencies

- `pnpm why shiki -r`  
  Result: `rehype-pretty-code`, direct `shiki`, and `streamdown` all resolved to `shiki 3.19.0`.
- `pnpm --filter @megacampus/web type-check`  
  Result: success
- `pnpm --filter @megacampus/web exec vitest run components/markdown/__tests__/MarkdownRenderer.test.tsx`  
  Result: passed

### Additional regression check

- `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/stages/stage7-notebooklm-bridge-client.test.ts`  
  Result: passed

## Reviewer Checklist

1. Verify queue behavior in `app/generator.py`:
   - FIFO waiting and bounded concurrent starts.
   - Timeout path returns `MediaGenerationTimeoutError` with diagnostic message.
2. Verify defaults in `app/config.py` match intended production posture (`2` and `1800`).
3. Verify new tests in `tests/test_queue.py` cover:
   - Shared cap across audio/video.
   - Queue wait timeout.
4. Verify shiki unification in `packages/web/package.json`, root `package.json`, and `pnpm-lock.yaml`.
5. Confirm warning no longer appears in local dev logs after restart.

## Operational Note

- Queue is in-memory per bridge process. If bridge is later scaled to multiple workers/processes, concurrency control becomes per-process unless moved to distributed coordination.
