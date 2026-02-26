# NLM Video Duration + Bridge Observability Hardening (2026-02-21)

## Scope

Address long-running `nlm_video` generation blind spots and improve diagnosability:

1. Ensure NLM video draft generation receives explicit duration target/range guidance.
2. Add detailed runtime logs in NotebookLM bridge for queue/source/task/poll stages.
3. Add a direct bridge smoke script for short audio/video checks.
4. Wire bridge logging level through env/start scripts.

## Root Cause Signals

Observed in local logs:

- Stage7 `nlm_video` draft frequently produced long scripts (example: `estimatedVideoDuration: 985s`).
- Final bridge call stayed in `generating` until 60-minute timeout.
- Previously there was little/no stage-level visibility between request submit and timeout.

## External Validation (Primary Sources)

- `notebooklm-py` CLI docs explicitly note async generation may take long:
  - `docs/cli-reference.md` line ~791: async operations can take minutes up to 30+ minutes.
  - Source: https://github.com/teng-lin/notebooklm-py/blob/main/docs/cli-reference.md
- `notebooklm-py` troubleshooting documents rate limits/quota constraints, especially for generation endpoints.
  - Source: https://github.com/teng-lin/notebooklm-py/blob/main/docs/troubleshooting.md
- Maintainer issue commentary confirms server-side capacity constraints for visual generation families.
  - Source: https://github.com/teng-lin/notebooklm-py/issues/42

## Code Changes

### 1) NLM video draft duration guidance

- `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/nlm-video-handler.ts`
  - `generateDraft()` now injects `target_duration_minutes`, `duration_range_min_minutes`, `duration_range_max_minutes` from NLM duration guidance into forwarded draft settings.

- `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/video-handler.ts`
  - Added optional parsing of duration settings from `settings.*` into `VideoScriptSettings`.

- `packages/course-gen-platform/src/stages/stage7-enrichments/prompts/video-prompt.ts`
  - Extended `VideoScriptSettings` with duration fields.
  - Added duration fields into `<SETTINGS>` user payload.
  - Updated system prompt duration section to treat explicit target/range as primary constraints.

### 2) Bridge observability

- `packages/course-gen-platform/docker/notebooklm-bridge/app/generator.py`
  - Promoted queue lifecycle logs (`enqueued/acquired/released`) to INFO.
  - Added INFO logs for:
    - generation start (source count/size, script words, format/style)
    - source add completion
    - source readiness
    - generation accepted (`task_id`)
    - periodic task poll with status/error/poll count/elapsed
    - artifact download and final completion metadata
  - Log messages now include key fields directly in text (`media`, `task_id`, `status`, `elapsed`) so they are visible with default uvicorn formatting.
  - Replaced opaque `wait_for_completion()` call with explicit polling helper:
    - `_wait_for_completion_with_progress(...)`
    - consistent timeout handling with last status context.

- `packages/course-gen-platform/docker/notebooklm-bridge/app/main.py`
  - Added `_configure_bridge_logging()`:
    - respects `NOTEBOOKLM_BRIDGE_LOG_LEVEL` fallback `NOTEBOOKLM_LOG_LEVEL`
    - configures `notebooklm_bridge.*` logger levels and handler.

### 3) Smoke tooling

- Added `scripts/nlm-bridge-smoke.sh`
  - Direct bridge smoke for `--type video|audio`
  - configurable target duration and curl max-time
  - prints compact metadata without dumping base64 payload.

### 4) Env plumbing

- `start-dev.sh`
  - exports `NOTEBOOKLM_LOG_LEVEL` default `INFO`
  - passes it into local bridge container.

- `docker-compose.dev.yml`
- `docker-compose.production.yml`
  - bridge service now receives `NOTEBOOKLM_LOG_LEVEL`.

- `.env.example`
- `packages/course-gen-platform/.env.example`
- `.env.production.example`
  - documented `NOTEBOOKLM_LOG_LEVEL`.

### 5) Tests

- `packages/course-gen-platform/tests/unit/stages/stage7-nlm-video-handler.test.ts`
  - Added test asserting `generateDraft()` forwards duration target/range into draft settings.

## Verification Performed

### Unit tests

- `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/stages/stage7-nlm-video-handler.test.ts`
- `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/stages/stage7-nlm-audio-handler.test.ts`
- `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/stages/stage7-notebooklm-bridge-client.test.ts`

All passed.

### Bridge Python compile check

- `python3 -m py_compile packages/course-gen-platform/docker/notebooklm-bridge/app/main.py packages/course-gen-platform/docker/notebooklm-bridge/app/generator.py packages/course-gen-platform/docker/notebooklm-bridge/app/config.py packages/course-gen-platform/docker/notebooklm-bridge/app/models.py`

Passed.

### Smoke runs (direct bridge)

- Short video smoke (`target=1`, `max-time=180s`) reached:
  - queue enqueue/acquire
  - source add + source ready
  - generation accepted + periodic task polling
  - but did not complete within 180s (client timeout).
- Short video smoke (`target=1`, `max-time=30s`) now clearly shows:
  - queue acquire,
  - notebook/source IDs,
  - accepted `task_id`,
  - first `in_progress` poll with elapsed/next interval.

- Short audio smoke (`target=1`, `max-time=180s`) showed the same behavior:
  - progressed through accepted + polling
  - not complete within 180s.

Interpretation: bridge pipeline/auth are functional; runtime bottleneck is upstream NotebookLM generation latency/capacity, not request wiring.

## Reviewer Focus Points

1. `video-prompt.ts`: duration-priority wording and compatibility with existing non-NLM video flow.
2. `nlm-video-handler.ts`: correctness of settings forwarding in draft stage.
3. `generator.py`: polling loop behavior and timeout semantics.
4. Logging volume at INFO in production and whether sampling/rate limits are needed.
5. Whether disconnected HTTP clients should cancel ongoing generation tasks (currently upstream task polling can continue server-side).
