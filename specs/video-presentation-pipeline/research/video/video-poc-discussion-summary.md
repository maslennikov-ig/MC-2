# Video Presentation Stage: Discussion Summary

> **Date**: 2024-12-24
> **Purpose**: Resume context for POC development
> **Status**: TTS provider selection in progress

---

## 1. Project Goal

Transform lesson content into professional webinar-style video presentations:
- Narrated slides with syntax-highlighted code
- Optional AI avatar presenter
- Multi-language support (18 languages)
- Production quality

---

## 2. Key Decisions Made

### 2.1 Architecture (from spec)

```
Lesson JSON → Script Generator → TTS → Slides (Remotion) → Avatar (MuseTalk) → FFmpeg → Video
```

### 2.2 Language Support

**Removed Bengali (bn)** — now 18 languages:
```typescript
['ru', 'en', 'zh', 'es', 'fr', 'de', 'ja', 'ko',
 'ar', 'pt', 'it', 'tr', 'vi', 'th', 'id', 'ms',
 'hi', 'pl']
```

Files updated:
- `packages/shared-types/src/common-enums.ts`
- `packages/shared-types/src/generation-result.ts`
- `packages/web/components/forms/create-course/_schemas/form-schema.ts`
- `packages/web/components/forms/create-course/components/BasicInfoSection.tsx`
- `packages/course-gen-platform/src/stages/stage5-generation/validators/*`
- `packages/course-gen-platform/src/stages/stage4-analysis/handler.ts`
- Various tests and docs

---

## 3. TTS Provider Analysis

### 3.1 Requirements

| Requirement | Priority |
|-------------|----------|
| Word/character-level timestamps | Critical (for slide sync) |
| All 18 languages | Critical |
| Production stability | Critical |
| SSML control (pauses, speed) | Nice to have |
| Low latency | Nice to have |
| Cost | Medium |

### 3.2 Providers Evaluated

| Provider | Timestamps | 18 Languages | SSML | Issues |
|----------|------------|--------------|------|--------|
| **Azure TTS** | SSML bookmarks | ✅ | ✅ Full | Connection issues in project |
| **OpenAI TTS + Whisper** | Via Whisper | ✅ | ❌ | 2 API calls, not production-grade |
| **ElevenLabs** | Character-level | ✅ All 18 | ❌ | Best quality, higher cost |
| **Google Cloud TTS** | `<mark>` tag | ✅ | ✅ | `<mark>` not on all voices |

### 3.3 ElevenLabs Details (Current Best Candidate)

**Pros:**
- Character-level timestamps built-in (most precise)
- Single API call (`/with-timestamps` endpoint)
- All 18 languages supported (Flash v2.5 model)
- Best voice quality in industry
- ~75ms latency

**Cons:**
- No SSML control
- Higher cost ($0.08-0.30/1K chars vs $0.016 Google)

**API Example:**
```typescript
const response = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
  {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: JSON.stringify({
      text: scriptText,
      model_id: 'eleven_flash_v2_5'
    })
  }
);

// Returns:
{
  "audio_base64": "...",
  "alignment": {
    "characters": ["W", "e", "l", "c", "o", "m", "e"],
    "character_start_times_seconds": [0.0, 0.05, 0.09, ...],
    "character_end_times_seconds": [0.05, 0.09, 0.14, ...]
  }
}
```

---

## 4. Providers TO RESEARCH (Next Session)

### 4.1 Play.ht
- **URL**: https://play.ht/
- **Research**: Timestamps support, languages, pricing, API quality

### 4.2 Minimax Audio
- **Research**: Timestamps support, languages, pricing, API availability

### 4.3 Cartesia Sonic-3
- **Note**: New TTS model from Cartesia
- **Research**: Timestamps support, languages, pricing, latency

### Research Questions for Each:
1. Does it support word/character-level timestamps?
2. Does it support all 18 languages?
3. What is the pricing model?
4. Is there SSML or prosody control?
5. What is the latency?
6. Is it production-ready?

---

## 5. POC Status

### 5.1 Created Files

```
.tmp/current/video-poc/
├── README.md
├── POC-PLAN.md
├── RESULTS.md
├── package.json
├── tsconfig.json
├── .env.example
└── scripts/
    ├── 01-azure-tts-test.ts   # Needs rewrite for new provider
    ├── 02-remotion-test.ts    # Ready (Shiki + HTML)
    ├── 03-ffmpeg-compose.ts   # Ready
    └── 04-e2e-pipeline.ts     # Needs rewrite for new provider
```

### 5.2 POC Components Status

| Component | Status | Notes |
|-----------|--------|-------|
| TTS Provider | **Pending** | Need to select provider first |
| Shiki highlighting | Ready | Tested in POC 2 |
| FFmpeg composition | Ready | Tested in POC 3 |
| Remotion slides | Conceptual | HTML preview ready, full Remotion TBD |
| Avatar (MuseTalk) | Phase 2 | After TTS validation |

---

## 6. Technical Spec Reference

Full spec: `docs/specs/video-presentation-stage-draft.md`

Key metrics from spec:
- Target cost: ~$0.14 per 5-min video
- Processing time: ~2.5-3 min
- Frame rate: 25 FPS (MuseTalk requirement)
- Resolution: 1920x1080
- Audio: -16 LUFS
- Sync tolerance: ±25ms

---

## 7. Next Steps

1. **Research additional TTS providers** (Play.ht, Minimax, Cartesia Sonic-3)
2. **Compare all options** in a decision matrix
3. **Select TTS provider**
4. **Rewrite POC scripts** for selected provider
5. **Run POC validation**
6. **Proceed with Phase 1 implementation**

---

## 8. Key Links

- [ElevenLabs Timestamps API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps)
- [ElevenLabs Languages](https://help.elevenlabs.io/hc/en-us/articles/13313366263441-What-languages-do-you-support)
- [Google Cloud TTS SSML](https://cloud.google.com/text-to-speech/docs/ssml)
- [Play.ht](https://play.ht/)
- [Cartesia](https://cartesia.ai/) (Sonic-3)
- Minimax Audio (need to find URL)

---

## 9. Questions to Resolve

1. Is SSML control (pauses, speed) critical for production?
2. What is the acceptable cost per video?
3. Any preference for specific voice styles?
4. Do we need real-time streaming or batch is OK?
