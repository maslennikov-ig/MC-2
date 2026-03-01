# NotebookLM Bridge Service

FastAPI bridge service for Stage 7 NotebookLM artifact generation. It mirrors the TypeScript bridge client contract used by `notebooklm-bridge-client.ts`.

## Endpoints

- `GET /health`
- `POST /artifacts/generate-audio/start`
- `GET /artifacts/generate-audio/{task_id}/status`
- `GET /artifacts/generate-audio/{task_id}/result`
- `POST /video/generate-overview/start`
- `GET /video/generate-overview/{task_id}/status`
- `GET /video/generate-overview/{task_id}/result`
- `POST /artifacts/generate-audio`
- `POST /video/generate-overview`

## Authentication

All generation lifecycle endpoints require:

- `Authorization: Bearer <NOTEBOOKLM_BRIDGE_TOKEN>`

If the token is missing or invalid, the service returns `401 Unauthorized`.

## Request Contract

Both generation endpoints accept JSON:

```json
{
  "lesson_title": "Lesson title",
  "script": "Narration script",
  "language": "en",
  "course_id": "course-uuid-or-slug",
  "voice": "alloy",
  "target_duration_minutes": 5,
  "duration_range_min_minutes": 4,
  "duration_range_max_minutes": 7,
  "sources": [
    { "title": "Edited Script", "content": "..." },
    { "title": "Raw Lesson Content", "content": "..." },
    { "title": "Lesson Objectives & Metadata", "content": "..." }
  ],
  "audio_format": "deep_dive",
  "audio_length": "default",
  "video_format": "explainer",
  "video_style": "auto_select"
}
```

Optional fields:

- `course_id` (when set, bridge reuses one NotebookLM notebook per course; when omitted, per-request ephemeral notebook mode is used)
- `voice`
- `target_duration_minutes` (soft target; no hard trimming)
- `duration_range_min_minutes` (soft lower bound)
- `duration_range_max_minutes` (soft upper bound)
- `sources` (fallbacks to single script source when omitted)
- `audio_format`: `deep_dive | brief | critique | debate`
- `audio_length`: `short | default | long`
- `video_format`: `explainer | brief`
- `video_style`: `auto_select | custom | classic | whiteboard | kawaii | anime | watercolor | retro_print | heritage | paper_craft`

## Response Contract

### Async lifecycle (recommended)

`POST /artifacts/generate-audio/start` and `POST /video/generate-overview/start`:

```json
{
  "task_id": "a2b3c4...",
  "media_type": "audio",
  "status": "queued",
  "created_at": "2026-02-21T15:34:00.000000+00:00"
}
```

`GET .../{task_id}/status`:

```json
{
  "task_id": "a2b3c4...",
  "media_type": "audio",
  "status": "queued | in_progress | completed | failed",
  "created_at": "2026-02-21T15:34:00.000000+00:00",
  "updated_at": "2026-02-21T15:36:15.000000+00:00",
  "error": null
}
```

`GET .../{task_id}/result` returns `artifact: null` until completion and returns final media payload when ready.

### Blocking compatibility (legacy)

`POST /artifacts/generate-audio`

```json
{
  "audio_base64": "<base64-media>",
  "mime_type": "audio/mpeg",
  "extension": "mp3",
  "duration_seconds": 42.0,
  "metadata": {}
}
```

`POST /video/generate-overview`

```json
{
  "video_base64": "<base64-media>",
  "mime_type": "video/mp4",
  "extension": "mp4",
  "duration_seconds": 42.0,
  "metadata": {}
}
```

## Generation Modes

The service supports direct `notebooklm-py` generation with timeout/polling and fallback mode.

Environment variables:

- `NOTEBOOKLM_BRIDGE_TOKEN` (required)
- `NOTEBOOKLM_GENERATION_MODE` (`auto` | `notebooklm` | `fallback`, default `auto`)
- `NOTEBOOKLM_GENERATION_TIMEOUT_SECONDS` (default `3600`)
- `NOTEBOOKLM_HTTP_TIMEOUT_SECONDS` (per-request notebooklm-py HTTP timeout, default `60`)
- `NOTEBOOKLM_POLL_INTERVAL_SECONDS` (default `2`)
- `NOTEBOOKLM_POLL_HTTP_TIMEOUT_SECONDS` (timeout for a single `poll_status` RPC call, default `8`)
- `NOTEBOOKLM_POLL_ERROR_RETRY_LIMIT` (transient poll error retries before fail, default `12`)
- `NOTEBOOKLM_GLOBAL_GENERATION_CONCURRENCY` (default `4`)
- `NOTEBOOKLM_QUEUE_WAIT_TIMEOUT_SECONDS` (default `3600`)
- `NOTEBOOKLM_ALLOW_FALLBACK` (default `false`)
- `NOTEBOOKLM_AUTH_JSON` (optional, preferred for dev/stage/prod; raw `storage_state.json` payload; empty value is ignored)
- `NOTEBOOKLM_STORAGE_PATH` (optional file fallback path; if set, this is used for client initialization)
- `NOTEBOOKLM_HOME` (optional file fallback dir; defaults to parent dir of `NOTEBOOKLM_STORAGE_PATH`)

Behavior:

- `fallback`: always returns placeholder media that still matches the API contract.
- `auto`: tries `notebooklm-py` first, then falls back if allowed.
- `notebooklm`: tries `notebooklm-py`; falls back only when `NOTEBOOKLM_ALLOW_FALLBACK=true`.
- Audio + video generation requests share one in-process queue. Starts are capped by
  `NOTEBOOKLM_GLOBAL_GENERATION_CONCURRENCY`; requests waiting longer than
  `NOTEBOOKLM_QUEUE_WAIT_TIMEOUT_SECONDS` fail with a timeout.
- Per-course locking is keyed by `(course_id, media_type)`: audio and video for the
  same course can run in parallel, but two audios (or two videos) for the same course
  are serialized to prevent recovery artifact crossover.

## Authentication Prerequisite

`notebooklm-py` accepts browser auth state from either:

- `NOTEBOOKLM_AUTH_JSON` (preferred for dev/stage/prod), or
- `NOTEBOOKLM_HOME/storage_state.json` / `NOTEBOOKLM_STORAGE_PATH` (local file fallback)

Generate `storage_state.json` once:

```bash
mkdir -p ./secrets/notebooklm
notebooklm --storage ./secrets/notebooklm/storage_state.json login
```

Preferred wiring:

```bash
export NOTEBOOKLM_AUTH_JSON="$(cat ./secrets/notebooklm/storage_state.json)"
```

Local fallback wiring:

```bash
export NOTEBOOKLM_STORAGE_PATH=./secrets/notebooklm/storage_state.json
export NOTEBOOKLM_HOME=./secrets/notebooklm
```

When `NOTEBOOKLM_AUTH_JSON` is set, keep `NOTEBOOKLM_STORAGE_PATH` empty to avoid
forcing file mode.

## Local Run

```bash
cd packages/course-gen-platform/docker/notebooklm-bridge
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export NOTEBOOKLM_BRIDGE_TOKEN=dev-token
export NOTEBOOKLM_AUTH_JSON="$(cat ./secrets/notebooklm/storage_state.json)"
# Local fallback instead of NOTEBOOKLM_AUTH_JSON:
# export NOTEBOOKLM_STORAGE_PATH=./secrets/notebooklm/storage_state.json
# export NOTEBOOKLM_HOME=./secrets/notebooklm
uvicorn app.main:app --reload --port 8000
```

## Tests

```bash
cd packages/course-gen-platform/docker/notebooklm-bridge
python3 -m pytest -q tests
```
