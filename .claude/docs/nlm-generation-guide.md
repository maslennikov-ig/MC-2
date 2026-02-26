# NLM (NotebookLM) Generation Guide

Internal reference for NotebookLM audio/video generation pipeline.

## Architecture

```
Browser → tRPC API → BullMQ Stage 7 Queue → Stage 7 Worker
  → NLM Handler (draft + final) → NotebookLM Bridge (FastAPI)
    → notebooklm-py → Google NotebookLM → Audio/Video artifact
      → Stored to local filesystem → Served by nginx
```

### Components

| Component         | Location                                                             | Role                                   |
| ----------------- | -------------------------------------------------------------------- | -------------------------------------- |
| Bridge service    | `docker/notebooklm-bridge/app/`                                      | FastAPI wrapper around `notebooklm-py` |
| NLM audio handler | `src/stages/stage7-enrichments/handlers/nlm-audio-handler.ts`        | Draft script + call bridge             |
| NLM video handler | `src/stages/stage7-enrichments/handlers/nlm-video-handler.ts`        | Draft script + call bridge             |
| NLM shared utils  | `src/stages/stage7-enrichments/handlers/nlm-shared.ts`               | Duration, sources, strategy            |
| Bridge client     | `src/stages/stage7-enrichments/services/notebooklm-bridge-client.ts` | HTTP client for bridge API             |
| Shared types      | `packages/shared-types/src/enrichment-settings.ts`                   | Zod schemas, type definitions          |

## Audio Generation

### Formats (4)

| Format      | Description                           | Use case                         |
| ----------- | ------------------------------------- | -------------------------------- |
| `deep_dive` | Single narrator, thorough explanation | Default, best for complex topics |
| `brief`     | Concise overview                      | Quick summaries                  |
| `critique`  | Critical analysis                     | Analytical content               |
| `debate`    | Two-host discussion/debate            | Engaging, conversational         |

### Length Presets (3, auto-calculated)

| Preset    | Condition       | Range    |
| --------- | --------------- | -------- |
| `short`   | target <= 4 min | ~3-4 min |
| `default` | target 5-6 min  | ~5-6 min |
| `long`    | target >= 7 min | ~7+ min  |

Length is **not user-selectable** — auto-inferred from `lesson.duration_minutes` via `resolveNlmDurationGuidance()`.

### Duration Calculation

```
lesson.duration_minutes → clamp(round(value), 4, 7) → targetMinutes
targetMinutes → inferAudioLengthFromTarget() → 'short' | 'default' | 'long'
```

Constants: `NLM_MIN_DURATION_MINUTES = 4`, `NLM_MAX_DURATION_MINUTES = 7`

## Video Generation

### Formats (2)

| Format      | Description                           |
| ----------- | ------------------------------------- |
| `explainer` | Educational explainer video (default) |
| `brief`     | Short overview video                  |

### Visual Styles (10)

| Style         | Description           |
| ------------- | --------------------- |
| `auto_select` | Automatic (default)   |
| `custom`      | Custom style          |
| `classic`     | Classic look          |
| `whiteboard`  | Whiteboard animation  |
| `kawaii`      | Cute/kawaii style     |
| `anime`       | Anime-inspired        |
| `watercolor`  | Watercolor painting   |
| `retro_print` | Retro print aesthetic |
| `heritage`    | Heritage/classical    |
| `paper_craft` | Paper craft animation |

## Source Strategies

Controls what content is sent to NotebookLM as source material.

| Strategy      | What is sent                      | When to use                    |
| ------------- | --------------------------------- | ------------------------------ |
| `script_only` | Prepared narration script         | When script quality is high    |
| `raw_only`    | Raw lesson content + objectives   | When lesson is source of truth |
| `hybrid`      | Script + raw content + objectives | **Default, recommended**       |

Implemented in `buildNotebookLMSources()` in `nlm-shared.ts`.

## Bridge API Endpoints

Base URL: `NOTEBOOKLM_BRIDGE_URL` (default: `http://notebooklm-bridge:8000`)

### Audio

- `POST /artifacts/generate-audio/start` — Start async generation (202)
- `GET /artifacts/generate-audio/{taskId}/status` — Poll status
- `GET /artifacts/generate-audio/{taskId}/result` — Get completed audio

### Video

- `POST /video/generate-overview/start` — Start async generation (202)
- `GET /video/generate-overview/{taskId}/status` — Poll status
- `GET /video/generate-overview/{taskId}/result` — Get completed video

### Request Payload

```typescript
{
  lesson_title: string
  script: string
  language: string           // e.g., 'ru', 'en'
  course_id?: string
  voice?: string
  sources?: { title: string; content: string }[]
  audio_format?: NlmAudioFormat    // 'deep_dive' | 'brief' | 'critique' | 'debate'
  audio_length?: NlmAudioLength    // 'short' | 'default' | 'long'
  video_format?: NlmVideoFormat    // 'explainer' | 'brief'
  video_style?: NlmVideoStyle      // 10 options
  target_duration_minutes?: number
  duration_range_min_minutes?: number
  duration_range_max_minutes?: number
}
```

## Environment Variables

| Variable                                | Service             | Description                                                               |
| --------------------------------------- | ------------------- | ------------------------------------------------------------------------- |
| `NOTEBOOKLM_BRIDGE_URL`                 | API, Workers        | Bridge base URL                                                           |
| `NOTEBOOKLM_BRIDGE_TOKEN`               | Workers             | Bearer auth token                                                         |
| `NOTEBOOKLM_BRIDGE_TIMEOUT_MS`          | Workers             | Request timeout (default 3600000 = 1hr)                                   |
| `NOTEBOOKLM_GENERATION_TIMEOUT_SECONDS` | Bridge              | Generation timeout (default 3600)                                         |
| `NOTEBOOKLM_LOG_LEVEL`                  | Bridge              | Logging level (default INFO)                                              |
| `USE_LOCAL_STORAGE`                     | API, Workers        | Use local filesystem (not Supabase)                                       |
| `ENRICHMENTS_PUBLIC_BASE_URL`           | API                 | Base domain for absolute playback URLs (e.g., `https://ai.megacampus.ru`) |
| `ENRICHMENTS_LOCAL_PATH`                | Stage 7 Worker      | Local storage path                                                        |
| `ENRICHMENTS_PUBLIC_URL`                | API, Stage 7 Worker | Public URL prefix for nginx                                               |

## Playback Flow

1. Stage 7 worker generates audio/video → saves to `ENRICHMENTS_LOCAL_PATH`
2. Nginx serves files at `/storage/enrichments/...`
3. Browser calls `getPlaybackUrl` tRPC → API builds URL using `ENRICHMENTS_PUBLIC_URL`
4. Browser plays media from nginx-served URL

**Critical**: API must have `USE_LOCAL_STORAGE=true` to build correct playback URLs. Without it, API tries Supabase signed URLs (files don't exist there).
