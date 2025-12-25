# Automated Video Pipeline: Slide Generation and Audio-Visual Synchronization

Building a production-ready e-learning video pipeline requires solving two interconnected problems: generating slides programmatically from lesson content, and synchronizing them precisely with TTS-generated narration. **The optimal architecture uses an SSML-controlled TTS pipeline with Azure bookmarks for timing, Remotion with Code Hike for slide composition, and FFmpeg for final assembly**—achieving sub-100ms sync accuracy at scale.

This research evaluates synchronization architectures, slide generation tools, and code presentation techniques to deliver a complete, production-ready solution for your 19-language, 100+ videos/day requirements.

---

## The synchronization problem has a clear winner

The core challenge—ensuring "Slide 3 appears exactly when the narrator says 'Let's look at the third concept'"—can be solved through four distinct architectures. After evaluating each against your requirements, **the SSML-controlled pipeline with Azure TTS bookmarks emerges as the optimal choice**.

| Architecture | Sync Precision | Implementation Complexity | Best For |
|--------------|----------------|--------------------------|----------|
| **SSML Bookmarks** | 100ns (0.0001ms) | Low | Production pipelines with slide-level sync |
| Audio-First | ~20-50ms | Low-Medium | Word-level highlighting, captions |
| Segment-Based | Frame-accurate | High | Independent segment regeneration |
| Dynamic Duration | Variable | Medium | Fixed slide durations |

**Azure TTS SSML bookmarks** provide the most elegant solution: insert `<bookmark mark="slide_2"/>` tags in your script, and Azure fires `BookmarkReached` events with 100-nanosecond precision. This eliminates post-processing entirely—timing data arrives with the audio.

```python
# Azure TTS with SSML bookmarks for slide synchronization
ssml = """
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis">
  <voice name="en-US-AvaNeural">
    <bookmark mark="slide_intro"/>
    Welcome to this course on machine learning.
    <bookmark mark="slide_overview"/>
    Today we will cover three main concepts.
    <bookmark mark="slide_concept_1"/>
    Let's start with supervised learning.
  </voice>
</speak>
"""

slide_timings = {}
synthesizer.bookmark_reached.connect(
    lambda evt: slide_timings.update({evt.text: evt.audio_offset / 10000})  # Convert to ms
)
result = synthesizer.speak_ssml_async(ssml).get()
# slide_timings = {"slide_intro": 0, "slide_overview": 2340, "slide_concept_1": 5120}
```

**For ElevenLabs or XTTS-v2**, which lack SSML support, use **WhisperX for forced alignment** as a post-processing step. WhisperX achieves 70x realtime speed with word-level accuracy of ±20-50ms—more than sufficient for slide transitions.

```python
import whisperx

# After generating TTS audio with any provider
audio = whisperx.load_audio("narration.wav")
model = whisperx.load_model("large-v2", device="cuda")
result = model.transcribe(audio, batch_size=16)

# Forced alignment for word-level timestamps
model_a, metadata = whisperx.load_align_model(language_code="en", device="cuda")
aligned = whisperx.align(result["segments"], model_a, metadata, audio, device)
# Returns: {"segments": [{"words": [{"word": "Welcome", "start": 0.5, "end": 0.8}]}]}
```

---

## AI slide generation tools face a critical gap for code content

Evaluating five major AI slide generation platforms reveals a significant finding: **only Gamma.app offers a production-ready API**, and **none provide native syntax highlighting for code blocks**.

| Platform | API Status | Code Support | 100+ Videos/Day | Recommendation |
|----------|------------|--------------|-----------------|----------------|
| **Gamma.app** | ✅ GA (Nov 2025) | ⚠️ Plain text only | ✅ Yes | Best available option |
| SlidesAI.io | ❌ None | Via add-ons | ❌ | Not suitable |
| Tome | ❌ Discontinued | N/A | ❌ | Pivoted to sales AI |
| Canva | ⚠️ Template-only | ❌ | ❌ | No AI generation API |
| Beautiful.ai | ❌ None | ❌ | ❌ | Not suitable |

Gamma.app's API accepts markdown-style input with headers and slide separators, exports to PDF/PPTX, and supports 60+ languages. Pricing starts at **$18/month for Pro** with API access, and rate limits accommodate "thousands of requests per day."

```python
# Gamma.app API example
import requests

response = requests.post(
    "https://public-api.gamma.app/v1.0/generate",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={
        "prompt": lesson_content,  # Markdown with ### headers
        "themeId": "your-brand-theme-id",
        "exportAs": "pdf",
        "options": {"tone": "educational", "audience": "beginners"}
    }
)
```

**The code block solution**: Pre-generate syntax-highlighted code images using Carbon, Shiki, or Pygments, then include them as image URLs in your Gamma input. This workaround adds a processing step but ensures consistent code styling across all languages.

---

## Remotion dominates programmatic video generation for your stack

For TypeScript-based pipelines requiring precise timing control and code animations, **Remotion with Code Hike** provides the most complete solution. Motion Canvas offers superior built-in code animation but lacks cloud rendering infrastructure.

| Feature | Remotion | Motion Canvas | Slidev | RevealJS |
|---------|----------|---------------|--------|----------|
| TTS timing integration | ✅ calculateMetadata | ✅ waitUntil | ❌ | ❌ |
| Code animation | Via Code Hike | Built-in (excellent) | Limited | Limited |
| Cloud rendering | ✅ AWS Lambda | ❌ Local only | ❌ | ❌ |
| 100+/day scalability | ✅ Designed for this | ⚠️ Custom infra | ❌ | ❌ |
| License cost | $100+/mo (>3 devs) | MIT (free) | MIT | MIT |

**Remotion's timing system** integrates directly with TTS timing data through `calculateMetadata()`, which runs before rendering to determine video duration from audio:

```tsx
// Remotion composition with TTS timing integration
import { useCurrentFrame, interpolate, Sequence, Audio, Img } from 'remotion';

export const LessonVideo: React.FC<{
  audioUrl: string;
  slides: Array<{imageUrl: string; startMs: number; endMs: number}>;
  durationInFrames: number;
}> = ({audioUrl, slides, durationInFrames}) => {
  const frame = useCurrentFrame();
  const fps = 30;
  
  return (
    <>
      <Audio src={audioUrl} />
      {slides.map((slide, i) => (
        <Sequence 
          key={i}
          from={Math.floor(slide.startMs / 1000 * fps)}
          durationInFrames={Math.floor((slide.endMs - slide.startMs) / 1000 * fps)}
        >
          <Img src={slide.imageUrl} style={{width: '100%', height: '100%'}} />
        </Sequence>
      ))}
    </>
  );
};

// calculateMetadata determines duration from audio
export const calculateMetadata = async ({props}) => {
  const audioDuration = await getAudioDurationInSeconds(props.audioUrl);
  return {
    durationInFrames: Math.ceil(audioDuration * 30),
    fps: 30,
  };
};
```

**AWS Lambda rendering** achieves ~$0.02 per video with parallel function execution, rendering a 2-hour video in approximately 8 minutes.

---

## Code presentation requires specialized tooling

For programming tutorials, four techniques address different animation needs:

**1. Static syntax highlighting** with Shiki (VS Code's engine) provides pixel-perfect accuracy:
```tsx
import { codeToHtml } from 'shiki';

const highlightedCode = await codeToHtml(code, {
  lang: 'typescript',
  theme: 'github-dark'
});
```

**2. Animated code typing** in Remotion uses frame-based character reveal:
```tsx
const frame = useCurrentFrame();
const visibleChars = Math.floor(interpolate(frame, [0, 90], [0, code.length]));
return <CodeBlock>{code.slice(0, visibleChars)}</CodeBlock>;
```

**3. Line-by-line highlighting** with Code Hike annotations:
```tsx
// Code Hike provides annotation-based highlighting
<Code>
  {`function example() {
    // focus
    const important = true;
    return important;
  }`}
</Code>
```

**4. Motion Canvas built-in Code node** offers the most sophisticated code animation:
```typescript
// Motion Canvas - automatic diff-based transitions
yield* code().code.replace(
  code().findFirstRange('oldVariable'), 
  'newVariable', 
  0.6  // 0.6 second transition
);
yield* code().selection(lines(2, 4), 0.3);  // Highlight lines 2-4
```

---

## Complete pipeline architecture for production

The recommended architecture processes lessons through five stages with BullMQ orchestration:

```
┌─────────────────────────────────────────────────────────────┐
│  Stage 1: SCRIPT PARSING                                     │
│  Input: Lesson Markdown/JSON                                 │
│  Process: Split into segments, extract slide markers         │
│  Output: segments[], slideMarkers[]                          │
│  Queue: lesson.script.ready                                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Stage 2: TTS GENERATION (Parallel by segment)               │
│  Input: segment.text, language, voice                        │
│  Process: Azure TTS with SSML bookmarks                      │
│  Output: audio.mp3, timing.json (slide timestamps)           │
│  Storage: s3://bucket/lessons/{id}/audio/                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Stage 3: SLIDE GENERATION (Parallel, cached)                │
│  Input: segment.content, timing.json, codeBlocks[]           │
│  Process:                                                    │
│    - Code blocks → Shiki → PNG images                        │
│    - Content → Gamma API or Remotion composition             │
│    - Duration matched to audio timing                        │
│  Output: slide_{n}.png                                       │
│  Caching: Hash-based deduplication                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Stage 4: AVATAR GENERATION (If needed)                      │
│  Input: audio.mp3, avatarConfig                              │
│  Process: LatentSync or HeyGen API                           │
│  Output: avatar_{n}.mp4                                      │
│  Infrastructure: RunPod GPU (RTX 4090)                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Stage 5: FINAL COMPOSITION                                  │
│  Input: slides[], audio[], avatar[], timing.json             │
│  Process: FFmpeg filter_complex composition                  │
│  Output: final.mp4 (1080p, H.264)                            │
│  QA: Sync drift detection, audio levels, resolution check    │
└─────────────────────────────────────────────────────────────┘
```

### FFmpeg composition for slide + avatar overlay

```bash
# Compose slide with avatar overlay and audio
ffmpeg -loop 1 -i slide.png -i avatar.mp4 -i audio.mp3 \
  -filter_complex \
  "[0:v]scale=1920:1080[bg]; \
   [1:v]scale=400:-1[avatar]; \
   [bg][avatar]overlay=x=1450:y=600[v]" \
  -map "[v]" -map 2:a \
  -t 30 -c:v libx264 -preset fast -crf 23 \
  -c:a aac -b:a 128k segment.mp4

# Concatenate segments with crossfade
ffmpeg -i seg1.mp4 -i seg2.mp4 -i seg3.mp4 \
  -filter_complex \
  "[0:v][1:v]xfade=transition=fade:duration=0.5:offset=29.5[v01]; \
   [v01][2:v]xfade=transition=fade:duration=0.5:offset=58.5[v]; \
   [0:a][1:a]acrossfade=d=0.5[a01]; \
   [a01][2:a]acrossfade=d=0.5[a]" \
  -map "[v]" -map "[a]" final.mp4
```

---

## Cost analysis reveals self-hosted FFmpeg as the clear winner

For 100 videos/day (5 minutes each), monthly costs vary dramatically by approach:

| Component | Self-Hosted FFmpeg | Remotion Lambda | Cloud APIs (Synthesia) |
|-----------|-------------------|-----------------|------------------------|
| Composition | $150 (RunPod) | $60-90 | $90,000+ |
| TTS (Azure) | $1,500 | $1,500 | Included |
| Slide Generation | $0 (python-pptx) | $0 (React) | Included |
| Storage (S3) | $50 | $50 | Included |
| License | $0 | $100-200 | Per-video |
| **Monthly Total** | **~$1,700** | **~$1,750-1,850** | **~$90,000+** |
| **Per Video** | **~$0.57** | **~$0.60** | **~$30+** |

**Recommendation**: Use self-hosted FFmpeg on RunPod spot instances for composition, Azure TTS for timing-aware audio generation, and Remotion only if your team prefers React-based video development.

---

## Critical risk factors and mitigations

### Synchronization drift detection
Implement automated QA before publishing:

```typescript
async function detectSyncDrift(videoPath: string, expectedTimings: Timing[]): Promise<DriftReport> {
  const videoDuration = await getVideoDuration(videoPath);
  const audioDuration = await getAudioDuration(videoPath);
  
  const driftMs = Math.abs(videoDuration - audioDuration) * 1000;
  
  return {
    passed: driftMs < 100,  // 100ms tolerance
    driftMs,
    recommendation: driftMs > 100 ? 'Regenerate with setpts=PTS-STARTPTS' : null
  };
}
```

### TTS failure recovery
Use segment-based architecture with independent retry:

```typescript
async function generateWithRetry(segment: Segment, maxRetries = 3): Promise<AudioResult> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await generateTTS(segment);
    } catch (error) {
      if (attempt === maxRetries - 1) {
        // Fall back to alternative TTS provider
        return await fallbackTTS(segment);
      }
      await delay(Math.pow(2, attempt) * 1000);  // Exponential backoff
    }
  }
}
```

### Partial regeneration for efficiency
Hash-based caching enables regenerating only changed sections:

```typescript
async function regenerateLesson(lessonId: string, changes: ChangeSet) {
  const cachedSegments = await getCachedSegments(lessonId);
  
  for (const segment of changes.modifiedSegments) {
    const newHash = hash(segment.content);
    if (cachedSegments[segment.id]?.hash !== newHash) {
      await regenerateSegment(segment);
    }
  }
  
  // Recompose from first changed segment forward
  await recomposeFromSegment(lessonId, changes.firstModifiedIndex);
}
```

---

## Concrete recommendations for your stack

**1. Synchronization Architecture**: Use **Azure TTS with SSML bookmarks** for 14 of your 19 languages that Azure supports well. For remaining languages or when using XTTS-v2, implement **WhisperX forced alignment** as a post-processing step.

**2. Slide Generation**: Adopt a **hybrid approach**—use **Gamma.app API** for general slides, but generate code block images separately using **Shiki** and insert them as images. For maximum control, use **Remotion compositions** directly.

**3. Code Presentation**: Implement **Code Hike with Remotion** for animated code that syncs with narration. For simpler needs, pre-render code blocks with Shiki and treat them as static images.

**4. Video Composition**: Use **FFmpeg with filter_complex** for final composition—it's more reliable than MoviePy at scale and integrates seamlessly with your TypeScript pipeline via child processes.

**5. Infrastructure**: Deploy on **RunPod serverless** with RTX 4090 spot instances for avatar generation, standard CPU instances for FFmpeg composition, and **BullMQ** for job orchestration with your existing TypeScript/Supabase stack.

The complete pipeline—from markdown lesson input to synchronized MP4 output—can achieve **sub-100ms audio-visual sync accuracy** at a cost of approximately **$0.57 per 5-minute video** at your target volume of 100+ videos/day.