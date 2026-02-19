# MVP Video Presentation Pipeline

## Context

MegaCampus AI auto-generates courses from user materials. Stage 7 (Enrichments) already generates quizzes, audio, presentations, covers, and cards. Video enrichment currently only generates a **script** (text) via LLM — actual video rendering (TTS, slides, composition) is not implemented.

Research is complete (`specs/video-presentation-pipeline/`): Azure TTS selected, MuseTalk for avatars (deferred), FFmpeg for composition. This plan covers **MVP without avatar**: script -> Azure TTS -> static slides -> FFmpeg -> MP4 video.

**Azure Speech Service is already configured** (user has API key and resource).

---

## Branch & Workspace Setup

```bash
# Create feature branch + worktree for parallel development
git worktree add ../mc2-video feature/video-presentation-pipeline -b feature/video-presentation-pipeline

# Install deps in new worktree
cd ../mc2-video && pnpm install
```

This allows continued bugfix work in `~/code/mc2/` (develop) while video pipeline work happens in `~/code/mc2-video/`.

---

## Phase 1: Types & Schema (foundation)

### 1.1 Extend `VideoEnrichmentContent`

**File:** `packages/shared-types/src/enrichment-content.ts`

Add to existing `videoEnrichmentContentSchema`:

- `video_url: z.string().url().optional()` — final MP4 URL
- `audio_url: z.string().url().optional()` — TTS audio URL
- `thumbnail_url: z.string().url().optional()` — poster image
- `duration_seconds: z.number().positive().optional()` — actual duration
- `voice_id: z.string().optional()` — Azure voice name
- `language: z.string().optional()` — e.g. 'ru-RU'
- `slide_count: z.number().int().positive().optional()`
- `resolution: z.object({ width, height }).optional()`
- `video_format: z.enum(['mp4', 'webm']).optional()`

Add new `wordTimestampSchema`:

```typescript
export const wordTimestampSchema = z.object({
  text: z.string(),
  audioOffsetMs: z.number().nonnegative(),
  durationMs: z.number().positive(),
});
```

All new fields **optional** for backwards compatibility.

### 1.2 Extend `Stage7ProgressUpdate`

**File:** `packages/course-gen-platform/src/stages/stage7-enrichments/types/index.ts`

Add progress phases: `'tts_synthesizing' | 'slides_generating' | 'video_composing'`

Add `onProgress` callback to `EnrichmentHandlerInput`:

```typescript
onProgress?: (phase: string, progress: number, message: string) => void;
```

### 1.3 Enable video in on-demand schema

**File:** `packages/shared-types/src/enrichment-on-demand.ts`

Add `'video'` to `onDemandEnrichmentTypeSchema`.

---

## Phase 2: Azure TTS Service (backend)

**New file:** `packages/course-gen-platform/src/stages/stage7-enrichments/services/azure-tts-service.ts`

### API: Azure Batch Synthesis

- PUT to create synthesis job (`wordBoundaryEnabled: true`, `inputKind: 'SSML'`)
- Poll GET with exponential backoff (2s interval, max 5 min)
- Download ZIP: audio file + `[nnnn].word.json`
- Parse word timestamps from JSON

### Key functions:

```typescript
export function buildSSML(text: string, voice: string, language: string): string;
export async function synthesizeWithTimestamps(input: AzureTTSInput): Promise<AzureTTSResult>;
export function getDefaultVoiceForLanguage(lang: string): string;
```

### Voice defaults:

- Russian: `ru-RU-DmitryNeural`
- English: `en-US-AndrewNeural`

### Config

**File:** `packages/course-gen-platform/src/stages/stage7-enrichments/config/index.ts`

```typescript
export const AZURE_TTS_CONFIG = {
  SPEECH_KEY: process.env.AZURE_SPEECH_KEY || '',
  SPEECH_REGION: process.env.AZURE_SPEECH_REGION || 'westeurope',
  OUTPUT_FORMAT: 'audio-24khz-160kbitrate-mono-mp3',
  VOICE_MAP: { ru: 'ru-RU-DmitryNeural', en: 'en-US-AndrewNeural' },
  API_VERSION: '2024-04-01',
  POLL_INTERVAL_MS: 2000,
  POLL_MAX_ATTEMPTS: 150,
};
```

No Azure SDK needed — direct REST API calls via `fetch()`.

---

## Phase 3: Slide Generator (backend)

**New file:** `packages/course-gen-platform/src/stages/stage7-enrichments/services/slide-generator-service.ts`

### Approach: Satori + Sharp

- Satori (by Vercel): React-like JSX -> SVG
- Sharp (already installed): SVG -> PNG
- No browser dependency (lighter than Playwright)

### Slide types:

- **Intro slide**: lesson title + "What you'll learn" + objectives
- **Section slide**: section title + key points as bullets
- **Conclusion slide**: key takeaways + next steps

### Resolution: 1920x1080 (16:9)

### Themes: default / dark / academic (matching existing `PresentationTheme`)

### Fonts: Inter (Latin) + Noto Sans (Cyrillic) bundled as static files

### New dependency: `satori` (~200KB)

---

## Phase 4: FFmpeg Composition (backend)

**New file:** `packages/course-gen-platform/src/stages/stage7-enrichments/services/ffmpeg-composition-service.ts`

### Key functions:

```typescript
export function calculateSlideTimestamps(
  scriptOutput: VideoScriptOutput,
  wordTimestamps: WordTimestamp[],
  audioDurationSeconds: number
): SlideTimestamp[];

export async function composeVideo(input: CompositionInput): Promise<CompositionResult>;
```

### Slide timing algorithm:

1. Find first word of each section's narration in word timestamps array
2. Use `audioOffsetMs` as slide start time
3. Slide duration extends until next section starts

### FFmpeg pipeline:

- Audio (MP3) + slide PNGs (looped per duration) -> concat filter -> MP4
- Settings: libx264, CRF 23, AAC 128k, yuv420p, `-movflags +faststart`
- Temp files in `os.tmpdir()`, cleaned up after composition

### New dependencies: `fluent-ffmpeg`, `@types/fluent-ffmpeg`

### System dependency: `ffmpeg` binary

```dockerfile
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
```

---

## Phase 5: Pipeline Integration (backend)

**Modified file:** `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/video-handler.ts`

### Architecture decision: sequential steps within single BullMQ job

No new queues for MVP. Matches existing `audio-handler.ts` pattern.

### Modified `generateFinal` flow:

```
1. Extract approved script (VideoScriptOutput)
2. Build full narration text from script sections
3. Azure TTS: narration -> audio buffer + word timestamps
4. Slide generation: script sections -> PNG images
5. Calculate slide timestamps from word timestamps
6. FFmpeg composition: audio + slides + timestamps -> MP4
7. Upload audio to Supabase Storage (secondary asset)
8. Generate thumbnail from first slide
9. Return GenerateResult with { content, assetBuffer (MP4), metadata }
```

### Storage paths:

| Asset     | Path                                             | MIME         |
| --------- | ------------------------------------------------ | ------------ |
| Video     | `{courseId}/{lessonId}/{enrichmentId}.mp4`       | `video/mp4`  |
| Audio     | `{courseId}/{lessonId}/{enrichmentId}-audio.mp3` | `audio/mpeg` |
| Thumbnail | `{courseId}/{lessonId}/{enrichmentId}-thumb.png` | `image/png`  |

### Job timeout override:

**File:** `packages/course-gen-platform/src/stages/stage7-enrichments/config/index.ts`

```typescript
export const VIDEO_CONFIG = {
  JOB_TIMEOUT_MS: 900_000, // 15 minutes
  SLIDE_WIDTH: 1920,
  SLIDE_HEIGHT: 1080,
  FFMPEG_CRF: 23,
  FFMPEG_PRESET: 'medium',
};
```

### Progress reporting through `onProgress` callback:

- `tts_synthesizing` (20%) -> `slides_generating` (50%) -> `video_composing` (80%) -> `uploading` (95%)

---

## Phase 6: Frontend — Admin Panel

### 6.1 Video Player Component

**New file:** `packages/web/components/generation-graph/panels/stage7/VideoPlayer.tsx`

Simple HTML5 `<video>` with `poster`, `controls`, fullscreen. Not Mux — overkill for admin preview.

### 6.2 VideoScriptPanel Enhancement

**File:** `packages/web/components/generation-graph/panels/stage7/VideoScriptPanel.tsx`

- When `status === 'completed'` and `video_url` exists: add "Video" tab (default) alongside "Script" and "Metadata"
- When `status === 'generating'`: show pipeline progress stepper (Script -> Audio -> Slides -> Video)
- Add translations for new UI elements

### 6.3 DetailView wiring

**File:** `packages/web/components/generation-graph/panels/stage7/views/DetailView.tsx`

Wire `asset_url` through `toVideoPreviewProps` to `VideoScriptPanel`.

---

## Phase 7: Frontend — Lesson Viewer

### 7.1 LessonVideoPlayer

**New file:** `packages/web/components/course/viewer/enrichments/LessonVideoPlayer.tsx`

Student-facing video player. Card-wrapped, "Show Script" toggle, styled to match viewer design system.

### 7.2 EnrichmentCard update

**File:** `packages/web/components/course/viewer/components/EnrichmentCard.tsx`

Add active-state video player when `type === 'video'` and `status === 'completed'`.

### 7.3 Enable video generation

**File:** `packages/web/components/course/viewer/components/EnrichmentsPanel.tsx`

Remove the guard at line 327-333 that disables video generation:

```typescript
if (type === 'video') {
  return;
} // REMOVE
```

### 7.4 ContentFormatSwitcher

**File:** `packages/web/components/course/viewer/components/LessonView.tsx`

Wire video enrichment URL into `availableFormats.video`.

### 7.5 Rotating status messages

**File:** `packages/web/lib/hooks/useRotatingStatusMessage.ts`

Add video-specific message categories: `video_tts`, `video_slides`, `video_composing`.

---

## Environment Variables

Add to `.env` / `.env.example`:

```env
AZURE_SPEECH_KEY=<key>
AZURE_SPEECH_REGION=westeurope
AZURE_TTS_VOICE_RU=ru-RU-DmitryNeural
AZURE_TTS_VOICE_EN=en-US-AndrewNeural
FFMPEG_PATH=ffmpeg
```

---

## New Dependencies

| Package                | Purpose                    |
| ---------------------- | -------------------------- |
| `satori`               | JSX -> SVG slide rendering |
| `fluent-ffmpeg`        | FFmpeg Node.js wrapper     |
| `@types/fluent-ffmpeg` | TypeScript types (dev)     |

System: `ffmpeg` in Docker image.

---

## File Summary

### New files (6):

- `stages/stage7-enrichments/services/azure-tts-service.ts`
- `stages/stage7-enrichments/services/slide-generator-service.ts`
- `stages/stage7-enrichments/services/ffmpeg-composition-service.ts`
- `web/components/generation-graph/panels/stage7/VideoPlayer.tsx`
- `web/components/course/viewer/enrichments/LessonVideoPlayer.tsx`
- `.env.example` updates

### Modified files (10):

- `shared-types/src/enrichment-content.ts` — extend VideoEnrichmentContent
- `shared-types/src/enrichment-on-demand.ts` — add video to on-demand types
- `stages/stage7-enrichments/types/index.ts` — progress phases, onProgress
- `stages/stage7-enrichments/config/index.ts` — VIDEO_CONFIG, AZURE_TTS_CONFIG
- `stages/stage7-enrichments/handlers/video-handler.ts` — full pipeline in generateFinal
- `web/components/generation-graph/panels/stage7/VideoScriptPanel.tsx` — video tab, progress
- `web/components/generation-graph/panels/stage7/views/DetailView.tsx` — wire asset_url
- `web/components/course/viewer/components/EnrichmentCard.tsx` — video player
- `web/components/course/viewer/components/EnrichmentsPanel.tsx` — enable video
- `web/lib/hooks/useRotatingStatusMessage.ts` — video messages
- `Dockerfile` — add ffmpeg

---

## Implementation Order

```
Phase 1: Types & Schema          (foundation, everything depends on this)
Phase 2: Azure TTS Service       (can start immediately after Phase 1)
Phase 3: Slide Generator         (independent of Phase 2)
Phase 4: FFmpeg Composition      (depends on Phase 2 & 3 interfaces)
Phase 5: Pipeline Integration    (depends on 2, 3, 4)
Phase 6: Frontend Admin Panel    (depends on Phase 1, parallel with backend)
Phase 7: Frontend Lesson Viewer  (depends on Phase 1, parallel with backend)
```

Phases 2+3 can run in parallel. Phases 6+7 can run in parallel with 2-5.

---

## Verification

1. **Type check**: `pnpm type-check` — all packages compile
2. **Unit tests**: Azure TTS mock, slide generation, FFmpeg mock
3. **Integration test**: Generate video for one lesson (RU + EN)
4. **Manual test**:
   - Admin panel: trigger video generation, see progress, play video
   - Lesson viewer: see video in enrichment card, content format switcher
5. **Edge cases**: missing Azure key (graceful error), very long lesson (15+ min), empty lesson content
6. **Performance target**: <5 min processing for a 5-min video

---

## Risks & Mitigations

| Risk                             | Mitigation                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------- |
| Azure TTS batch too slow         | Poll with 2s interval, 5min max. Fallback to real-time API for short texts       |
| FFmpeg not installed             | Docker image includes it. Startup check in worker-entrypoint                     |
| Large video files                | 100MB limit sufficient for MVP (~10 min videos). Stream to temp files            |
| Satori font issues with Cyrillic | Bundle Noto Sans explicitly. Test Russian first                                  |
| Word timestamp accuracy          | Use sentence-level fallback; first word of each section maps to slide transition |
