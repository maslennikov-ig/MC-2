# NotebookLM Bridge Service

FastAPI bridge service for Stage 7 NotebookLM artifact generation. It mirrors the TypeScript bridge client contract used by `notebooklm-bridge-client.ts`.

## Endpoints

- `GET /health`
- `POST /artifacts/generate-audio`
- `POST /video/generate-overview`

## Authentication

Both POST endpoints require:

- `Authorization: Bearer <NOTEBOOKLM_BRIDGE_TOKEN>`

If the token is missing or invalid, the service returns `401 Unauthorized`.

## Request Contract

Both generation endpoints accept JSON:

```json
{
  "lesson_title": "Lesson title",
  "script": "Narration script",
  "language": "en",
  "voice": "alloy",
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

- `voice`
- `sources` (fallbacks to single script source when omitted)
- `audio_format`: `deep_dive | brief | critique | debate`
- `audio_length`: `short | default | long`
- `video_format`: `explainer | brief`
- `video_style`: `auto_select | custom | classic | whiteboard | kawaii | anime | watercolor | retro_print | heritage | paper_craft`

## Response Contract

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
- `NOTEBOOKLM_GENERATION_TIMEOUT_SECONDS` (default `240`)
- `NOTEBOOKLM_POLL_INTERVAL_SECONDS` (default `2`)
- `NOTEBOOKLM_ALLOW_FALLBACK` (default `false`)
- `NOTEBOOKLM_STORAGE_PATH` (optional, path to NotebookLM `storage_state.json`)

Behavior:

- `fallback`: always returns placeholder media that still matches the API contract.
- `auto`: tries `notebooklm-py` first, then falls back if allowed.
- `notebooklm`: tries `notebooklm-py`; falls back only when `NOTEBOOKLM_ALLOW_FALLBACK=true`.

## Authentication Prerequisite

`notebooklm-py` uses browser auth state. Generate `storage_state.json` first:

```bash
mkdir -p ./secrets/notebooklm
notebooklm --storage ./secrets/notebooklm/storage_state.json login
```

Then provide this file path to the service via `NOTEBOOKLM_STORAGE_PATH`.

## Local Run

```bash
cd packages/course-gen-platform/docker/notebooklm-bridge
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export NOTEBOOKLM_BRIDGE_TOKEN=dev-token
export NOTEBOOKLM_STORAGE_PATH=./secrets/notebooklm/storage_state.json
uvicorn app.main:app --reload --port 8000
```

## Tests

```bash
cd packages/course-gen-platform/docker/notebooklm-bridge
python3 -m pytest -q tests/test_api.py
```
