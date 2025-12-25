# Video Presentation Stage: Technical Specification Draft

> **Status:** Draft v0.3 (Comprehensive update from all 5 Deep Research documents)
> **Last Updated:** 2024-12-24
> **Research Base:** 5 Deep Research documents + 2 DeepThink analyses

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [**FINAL STRATEGY DECISION**](#2-final-strategy-decision)
3. [Requirements](#3-requirements)
4. [Architecture Overview](#4-architecture-overview)
5. [Pipeline Design](#5-pipeline-design)
6. [Component Specifications](#6-component-specifications)
7. [Multi-Language Support](#7-multi-language-support)
8. [Quality Assurance](#8-quality-assurance)
9. [Cost Analysis](#9-cost-analysis)
10. [Database Schema](#10-database-schema)
11. [Frontend Integration](#11-frontend-integration)
12. [Phased Implementation](#12-phased-implementation)
13. [Risk Mitigation](#13-risk-mitigation)
14. [Research References](#14-research-references)

---

## 1. Executive Summary

### 1.1 Goal

Transform generated lesson content into professional webinar-style video presentations with:
- Narrated slides with syntax-highlighted code
- Optional AI avatar presenter ("talking head")
- Multi-language support (19 languages)
- Corporate training quality

### 1.2 Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Architecture** | Parallel Enrichment | Doesn't block main course generation pipeline |
| **TTS Engine** | Azure Cognitive Services | Only provider with SSML bookmarks for all 19 languages |
| **Avatar Model** | MuseTalk 1.5 | MIT license, real-time capable, good quality |
| **Slide Rendering** | Remotion | React-based, integrates with our Next.js stack |
| **Composition** | FFmpeg | Cost-effective, reliable at scale |
| **Layout Strategy** | Smart Switching | Full avatar intro/outro, PiP for content |

### 1.3 Target Metrics

| Metric | Target | Achieved |
|--------|--------|----------|
| Cost per 5-min video | ~$0.50 | **$0.14** |
| Processing time | < 10 min | ~2.5-3 min |
| Quality | Corporate training | Yes |
| Languages | 19 | 19 (with caveats for RTL) |

---

## 2. FINAL STRATEGY DECISION

### 2.1 The Chosen Architecture

After 5 Deep Research sessions and 2 DeepThink architectural analyses, we have converged on a **Hybrid Self-Hosted Pipeline** strategy:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FINAL ARCHITECTURE DECISION                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   LESSON CONTENT (JSON)                                                      │
│          │                                                                   │
│          ▼                                                                   │
│   ┌─────────────────┐                                                        │
│   │ Script Generator │  ◄── GPT-4o-mini ($0.001/video)                      │
│   │ (LLM + Templates)│      Hybrid: LLM for narration, templates for code   │
│   └────────┬────────┘                                                        │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐                                                        │
│   │  Azure TTS      │  ◄── SSML with <bookmark> tags ($0.07/video)          │
│   │  (19 languages) │      Sub-millisecond timing precision                 │
│   └────────┬────────┘                                                        │
│            │                                                                 │
│            ├──────────────────┬──────────────────┐                          │
│            │                  │                  │                          │
│            ▼                  ▼                  ▼                          │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐                 │
│   │  Remotion   │    │  MuseTalk   │    │  Timing Map     │                 │
│   │  (Slides)   │    │  (Avatar)   │    │  (JSON)         │                 │
│   │  CPU Worker │    │  GPU Worker │    │                 │                 │
│   │  $0.02      │    │  RunPod     │    │                 │                 │
│   │             │    │  $0.02      │    │                 │                 │
│   └──────┬──────┘    └──────┬──────┘    └────────┬────────┘                 │
│          │                  │                    │                          │
│          └──────────────────┼────────────────────┘                          │
│                             │                                                │
│                             ▼                                                │
│                    ┌─────────────────┐                                       │
│                    │    FFmpeg       │  ◄── Composition ($0.005/video)      │
│                    │    Assembly     │      Smart Switching layout          │
│                    └────────┬────────┘                                       │
│                             │                                                │
│                             ▼                                                │
│                    ┌─────────────────┐                                       │
│                    │  Final Video    │  ◄── 1080p, 25 FPS, H.264            │
│                    │  (MP4)          │      ~$0.14 total per 5-min          │
│                    └─────────────────┘                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Why This Strategy?

| Alternative | Cost | Quality | Why NOT chosen |
|-------------|------|---------|----------------|
| **Full SaaS (HeyGen/Synthesia)** | $2.50-$11/video | 9/10 | 5-22x over budget |
| **Cloud APIs only** | $1.80/video | 8/10 | 3.6x over budget |
| **Fully self-hosted** | $0.08/video | 7/10 | Higher complexity, TTS quality issues |
| **✅ Hybrid (chosen)** | **$0.14/video** | **8/10** | Best quality/cost ratio |

### 2.3 Critical Technical Standards

Based on all research, these are **non-negotiable** specifications:

| Parameter | Value | Reason |
|-----------|-------|--------|
| **Frame Rate** | **25 FPS** (NOT 30!) | MuseTalk trained on 25 FPS; other rates cause artifacts |
| **Face Size** | 30-40% of frame height | Optimal for 256×256 face crop |
| **TTS** | Azure Neural with SSML | Only provider with bookmark timing for all 19 languages |
| **Driving Video** | Real background (NOT green screen) | MuseTalk blurs jawline edges; green screen causes spill |
| **Audio Standard** | -16 LUFS | E-learning loudness standard |
| **Sync Tolerance** | ±25ms | Human perception threshold |

### 2.4 Driving Video Strategy: FREE Sources

**Stock footage platforms (Shutterstock, Getty) prohibit AI face modification.** Instead:

| Source | License | Cost | Quality |
|--------|---------|------|---------|
| **Pexels** | Free commercial | $0 | High |
| **Pixabay** | Free commercial | $0 | Medium-High |
| **Mixkit** | Free commercial | $0 | High |
| **DIY Recording** | Full ownership | Setup cost only | Highest control |

**Search terms:** "business person talking", "presenter", "spokesperson"

**Requirements for driving videos:**
- 1080p, **25 FPS**
- Face 30-40% of frame height
- Neutral mouth position (mouth closed)
- Real blurred background (NOT green screen)
- 15-30 second loops
- Minimal head movement (<15° rotation)

### 2.5 Phased Rollout Decision

```
PHASE 1 (Weeks 1-3): "Narrated Deck"
├── Slides + Voice only
├── Cost: ~$0.09/video
├── Risk: Low
└── Validates: TTS sync, Remotion pipeline, all 19 languages

PHASE 2 (Weeks 4-6): "The Presenter"  ◄── TARGET MVP
├── + MuseTalk avatar (Smart Switching)
├── Cost: ~$0.14/video
├── Risk: Medium
└── Validates: Avatar quality, GPU infrastructure

PHASE 3 (Weeks 7-9): "Studio Quality"
├── + Partial regeneration
├── + Storyboard preview
├── + QA automation
└── Cost optimization to ~$0.10/video
```

**Recommendation:** Start with Phase 1 for fast validation (2-3 weeks), then Phase 2.

### 2.6 Key Risk Mitigations

| Risk | Mitigation |
|------|------------|
| MuseTalk quality degrades | Fork repo, pin model weights v1.5 |
| Azure TTS outage | Fallback to Google Cloud TTS |
| GPU capacity shortage | RunPod + Vast.ai spot instances |
| Stock footage licensing issues | Use only Pexels/Pixabay (verified free) |
| Arabic/Hebrew lip-sync issues | Slides-only mode for RTL in Phase 1 |

---

## 3. Requirements

### 3.1 Functional Requirements

#### Input
- Lesson content from Stage 6 (JSON with structured content blocks)
- Course language setting
- User preferences (avatar, voice, layout mode)

#### Output
- MP4 video file (1080p, H.264)
- Chapter markers (for player seeking)
- Thumbnail image
- Optional: Multiple quality levels (HLS)

### 3.2 Supported Languages

```typescript
const SUPPORTED_LANGUAGES = [
  'ru', 'en', 'zh', 'es', 'fr', 'de', 'ja', 'ko', 'ar',
  'pt', 'it', 'tr', 'vi', 'th', 'id', 'ms', 'hi', 'bn', 'pl'
] as const;
```

### 3.3 Video Duration Options

Based on lesson `duration_minutes` setting:
- 3 min (microlearning)
- 5 min (standard, default)
- 10 min (standard lesson)
- 15 min (in-depth)
- 20 min (deep dive)
- 30 min (complex topics)
- 45 min (extreme, not recommended)

### 3.4 Layout Modes

1. **Slides Only** - Narrated slides, no avatar (cheapest)
2. **PiP (Picture-in-Picture)** - Avatar in corner, slides main
3. **Smart Switching** - Full avatar for intro/outro, PiP for content (recommended)
4. **Full Presenter** - Avatar full screen with slides as overlay

---

## 4. Architecture Overview

### 4.1 System Context

```
┌─────────────────────────────────────────────────────────────────┐
│                     MegaCampus Platform                          │
├─────────────────────────────────────────────────────────────────┤
│  Stage 1-6: Course Generation Pipeline                          │
│       ↓                                                          │
│  [Lesson Content Ready]                                          │
│       ↓                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  VIDEO PRESENTATION ENRICHMENT (This System)            │    │
│  │                                                          │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │    │
│  │  │ Script   │→ │ TTS      │→ │ Assets   │→ │ Compose │ │    │
│  │  │ Generator│  │ (Azure)  │  │ (Parallel)│  │ (FFmpeg)│ │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │    │
│  │                     ↓              ↓                    │    │
│  │               [Audio.mp3]    [Slides.mp4]              │    │
│  │               [Timestamps]   [Avatar.mp4]              │    │
│  └─────────────────────────────────────────────────────────┘    │
│       ↓                                                          │
│  [Video Asset] → Supabase Storage → Video Player                │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Integration Points

| System | Integration | Purpose |
|--------|-------------|---------|
| **BullMQ** | Job orchestration | Pipeline stages, retries, progress |
| **Supabase** | Database + Storage | Job tracking, video assets |
| **RunPod** | GPU compute | Avatar generation (MuseTalk) |
| **Azure** | TTS API | Audio generation with timestamps |

---

## 5. Pipeline Design

### 5.1 Corrected Pipeline Flow (Serial-Parallel)

```
Lesson Approved
       ↓
┌──────────────────────────────────────────────────────┐
│  STAGE 1: Time Map Generation (Serial, CPU/API)      │
│                                                       │
│  Job 1.1: Script Generation (LLM)                    │
│     Input: Lesson content JSON                        │
│     Output: Script with slide markers                 │
│     Duration: ~10s                                    │
│            ↓                                          │
│  Job 1.2: Azure TTS Synthesis                        │
│     Input: Script with SSML bookmarks                 │
│     Output: Audio.mp3 + Timestamp JSON                │
│     Duration: ~15s                                    │
└──────────────────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────────────────┐
│  STAGE 2: Asset Generation (Parallel)                │
│                                                       │
│  Job 2.1: Remotion Slide Render (CPU)    ←┐          │
│     Input: Slide definitions + Timestamps │ PARALLEL │
│     Output: slide_N.mp4 segments          │          │
│     Duration: ~45s                        │          │
│                                           │          │
│  Job 2.2: Avatar Generation (GPU)        ←┘          │
│     Input: Audio.mp3 + Driving video                 │
│     Output: avatar_N.mp4 segments                    │
│     Duration: ~90s (for 1-min avatar)                │
│     Infrastructure: RunPod RTX 4090                  │
└──────────────────────────────────────────────────────┘
       ↓
┌──────────────────────────────────────────────────────┐
│  STAGE 3: Composition (Serial, CPU)                  │
│                                                       │
│  Job 3.1: FFmpeg Stitch                              │
│     Input: All segments + Audio + Timing             │
│     Output: Final_Video.mp4                          │
│     Duration: ~15s                                    │
└──────────────────────────────────────────────────────┘
       ↓
[Upload to Supabase Storage]
       ↓
[Update Database: lesson.video_asset_id]
```

### 5.2 Total Processing Time

| Video Length | Script | TTS | Slides | Avatar | Compose | **Total** |
|--------------|--------|-----|--------|--------|---------|-----------|
| 5 min | 10s | 15s | 45s | 90s | 15s | **~2.5 min** |
| 10 min | 15s | 25s | 90s | 180s | 25s | **~5 min** |
| 30 min | 30s | 60s | 180s | 300s | 45s | **~10 min** |

### 5.3 BullMQ Flow Structure

```typescript
// Parent-child job structure
const videoGenerationFlow = {
  name: 'video-generation',
  queueName: 'video-enrichment',
  data: { lessonId, config },
  children: [
    {
      name: 'script-generation',
      queueName: 'video-script',
      data: { lessonId }
    },
    {
      name: 'tts-synthesis',
      queueName: 'video-tts',
      opts: {
        parent: { waitFor: 'script-generation' }
      }
    },
    {
      name: 'slide-render',
      queueName: 'video-slides',
      opts: {
        parent: { waitFor: 'tts-synthesis' }
      }
    },
    {
      name: 'avatar-generation',
      queueName: 'video-avatar',
      opts: {
        parent: { waitFor: 'tts-synthesis' }
      }
    },
    {
      name: 'composition',
      queueName: 'video-compose',
      opts: {
        parent: { waitFor: ['slide-render', 'avatar-generation'] }
      }
    }
  ]
};
```

---

## 6. Component Specifications

### 6.1 Script Generation

#### Approach: Hybrid (LLM + Templates)

Use LLM for natural narration while preserving content blocks as immutable payloads.

#### Input Format

```typescript
interface LessonContent {
  id: string;
  title: string;
  duration_minutes: number;
  objectives: string[];
  content: ContentBlock[];
}

type ContentBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'code'; language: string; code: string }
  | { type: 'callout'; variant: 'tip' | 'warning' | 'info'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'image'; url: string; alt: string }
  | { type: 'quote'; text: string; author?: string };
```

#### Output Format

```typescript
interface VideoScript {
  lessonId: string;
  language: string;
  estimatedDuration: number; // seconds
  segments: ScriptSegment[];
}

interface ScriptSegment {
  id: string; // e.g., "slide_04_part1"
  slideType: 'title' | 'content' | 'code' | 'summary';
  visualPayload: {
    // Content for Remotion to render
    heading?: string;
    bullets?: string[];
    code?: { language: string; code: string; highlightLines?: number[] };
    image?: { url: string; alt: string };
  };
  narrationText: string; // Text for TTS
  narrationSSML?: string; // SSML markup if needed
  pauseAfterMs: number; // Pause after this segment
}
```

#### LLM Prompt (GPT-4o-mini)

```
You are a senior instructor creating a video script. Convert the lesson content into a narration script.

RULES:
1. CODE BLOCKS: Do NOT read syntax (semicolons, brackets). Explain the logic/intent.
   - Bad: "var x equals 5 semicolon"
   - Good: "We initialize a variable named x with a value of 5"

2. PACING: Add natural pauses after complex concepts.

3. TRANSITIONS: Use smooth transitions between sections:
   - "Now let's look at..."
   - "Moving on to..."
   - "Here's an important concept..."

4. SLIDE BOUNDARIES: Create a new slide for:
   - Each heading
   - Each code block
   - Every 2-3 paragraphs of text
   - Each image or diagram

5. OUTPUT: Return valid JSON matching the ScriptSegment[] schema.
```

### 6.2 TTS (Azure Cognitive Services)

#### SSML with Bookmarks

```xml
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
       xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
  <voice name="en-US-JennyNeural">
    <bookmark mark="slide_intro"/>
    Welcome to this lesson on Python variables.
    <break time="500ms"/>

    <bookmark mark="slide_01"/>
    Variables are fundamental building blocks in programming.
    They act as containers that store data values.
    <break time="300ms"/>

    <bookmark mark="slide_02_code"/>
    <prosody rate="0.9">
      Let's look at a simple example.
      Here, we create a variable named x and assign it the integer value five.
    </prosody>
    <break time="1000ms"/>

    <bookmark mark="slide_03"/>
    Now let's see what happens when we print this value.
  </voice>
</speak>
```

#### Timestamp Extraction (TypeScript)

```typescript
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

interface BookmarkTiming {
  mark: string;
  offsetMs: number;
}

async function synthesizeWithBookmarks(
  ssml: string,
  outputPath: string
): Promise<{ audioPath: string; timings: BookmarkTiming[] }> {
  const speechConfig = sdk.SpeechConfig.fromSubscription(
    process.env.AZURE_SPEECH_KEY!,
    process.env.AZURE_SPEECH_REGION!
  );

  const audioConfig = sdk.AudioConfig.fromAudioFileOutput(outputPath);
  const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

  const timings: BookmarkTiming[] = [];

  // CRITICAL BUG WORKAROUND: Azure returns incorrect offset for first bookmark
  // (includes following break time). Adding +5000 ticks for correction.
  // See: Microsoft marked as "wontfix"
  synthesizer.bookmarkReached = (_, event) => {
    timings.push({
      mark: event.text,
      offsetMs: (event.audioOffset + 5000) / 10000 // +5000 for bug correction, /10000 for ms
    });
  };

  return new Promise((resolve, reject) => {
    synthesizer.speakSsmlAsync(
      ssml,
      (result) => {
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          resolve({ audioPath: outputPath, timings });
        } else {
          reject(new Error(result.errorDetails));
        }
        synthesizer.close();
      },
      (error) => {
        reject(error);
        synthesizer.close();
      }
    );
  });
}
```

#### Voice Recommendations by Language

| Language | Recommended Voice | Style | Notes |
|----------|------------------|-------|-------|
| en | en-US-JennyNeural | friendly | Best quality |
| ru | ru-RU-SvetlanaNeural | friendly | Natural |
| zh | zh-CN-XiaoxiaoNeural | friendly | Mandarin |
| es | es-ES-ElviraNeural | friendly | Castilian |
| de | de-DE-KatjaNeural | friendly | Standard |
| fr | fr-FR-DeniseNeural | friendly | Parisian |
| ja | ja-JP-NanamiNeural | friendly | Standard |
| ko | ko-KR-SunHiNeural | friendly | Standard |
| ar | ar-SA-ZariyahNeural | friendly | Saudi |
| pt | pt-BR-FranciscaNeural | friendly | Brazilian |
| it | it-IT-ElsaNeural | friendly | Standard |
| tr | tr-TR-EmelNeural | friendly | Standard |
| vi | vi-VN-HoaiMyNeural | friendly | Standard |
| th | th-TH-PremwadeeNeural | friendly | Standard |
| id | id-ID-GadisNeural | friendly | Standard |
| ms | ms-MY-YasminNeural | friendly | Standard |
| hi | hi-IN-SwaraNeural | friendly | Standard |
| bn | bn-IN-TanishaaNeural | friendly | Indian Bengali |
| pl | pl-PL-ZofiaNeural | friendly | Standard |

### 6.3 Slide Rendering (Remotion)

#### Alternative: Gamma.app AI Slide API

For rapid prototyping or when design resources are limited, **Gamma.app** offers AI-powered slide generation:

```typescript
// Gamma.app API for AI slide generation
const response = await fetch('https://public-api.gamma.app/v1.0/generate', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${GAMMA_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    prompt: lessonContent,  // Markdown with ### headers
    themeId: 'your-brand-theme-id',
    exportAs: 'pdf',        // or 'pptx', 'png'
    options: {
      tone: 'educational',
      audience: 'beginners',
      slideCount: 'auto'
    }
  })
});

// Export as PNG images for video composition
const slides = await response.json();
```

| Feature | Gamma.app | Remotion |
|---------|-----------|----------|
| Approach | AI-generated from text | Programmatic React |
| Code Highlighting | ⚠️ Plain text only | ✅ Full Shiki support |
| Customization | Theme-based | Pixel-perfect |
| API Pricing | $18/mo Pro | License fee (>3 devs) |
| Languages | 60+ | Any (React i18n) |

**Workaround for code blocks:** Pre-render syntax-highlighted code as PNG images using Shiki/Carbon, include as image URLs in Gamma input.

**Recommendation:** Use Remotion for code-heavy content, Gamma for text-heavy marketing/overview videos.

#### Project Structure

```
packages/video-renderer/
├── src/
│   ├── compositions/
│   │   ├── LessonVideo.tsx      # Main composition
│   │   ├── TitleSlide.tsx       # Intro/outro slides
│   │   ├── ContentSlide.tsx     # Text/bullet slides
│   │   ├── CodeSlide.tsx        # Code with highlighting
│   │   └── SummarySlide.tsx     # Recap slides
│   ├── components/
│   │   ├── CodeBlock.tsx        # Shiki-powered code
│   │   ├── Avatar.tsx           # PiP avatar overlay
│   │   └── ProgressBar.tsx      # Timeline indicator
│   ├── utils/
│   │   └── timing.ts            # Duration calculations
│   └── Root.tsx                 # Remotion root
├── remotion.config.ts
└── package.json
```

#### Main Composition

```tsx
import { Composition, Sequence, Audio, useCurrentFrame, interpolate } from 'remotion';
import { TitleSlide } from './compositions/TitleSlide';
import { ContentSlide } from './compositions/ContentSlide';
import { CodeSlide } from './compositions/CodeSlide';

interface LessonVideoProps {
  audioUrl: string;
  segments: RenderedSegment[];
  timings: BookmarkTiming[];
  fps: number;
}

export const LessonVideo: React.FC<LessonVideoProps> = ({
  audioUrl,
  segments,
  timings,
  fps
}) => {
  return (
    <>
      <Audio src={audioUrl} />

      {segments.map((segment, index) => {
        const startFrame = Math.floor(timings[index].offsetMs / 1000 * fps);
        const endFrame = timings[index + 1]
          ? Math.floor(timings[index + 1].offsetMs / 1000 * fps)
          : undefined;
        const duration = endFrame ? endFrame - startFrame : undefined;

        return (
          <Sequence
            key={segment.id}
            from={startFrame}
            durationInFrames={duration}
          >
            {segment.slideType === 'code' ? (
              <CodeSlide {...segment.visualPayload} />
            ) : (
              <ContentSlide {...segment.visualPayload} />
            )}
          </Sequence>
        );
      })}
    </>
  );
};
```

#### Code Slide with Shiki

```tsx
import { useEffect, useState } from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { codeToHtml } from 'shiki';

interface CodeSlideProps {
  code: string;
  language: string;
  highlightLines?: number[];
}

export const CodeSlide: React.FC<CodeSlideProps> = ({
  code,
  language,
  highlightLines = []
}) => {
  const [html, setHtml] = useState('');
  const frame = useCurrentFrame();

  useEffect(() => {
    codeToHtml(code, {
      lang: language,
      theme: 'github-dark',
    }).then(setHtml);
  }, [code, language]);

  // Calculate which line to highlight based on frame
  const totalLines = code.split('\n').length;
  const currentHighlight = highlightLines.length > 0
    ? highlightLines[Math.floor(frame / 30) % highlightLines.length]
    : -1;

  return (
    <div className="code-slide">
      <style>{`
        .code-slide .line:not(.highlighted) {
          opacity: ${currentHighlight >= 0 ? 0.4 : 1};
        }
        .code-slide .line.highlighted {
          opacity: 1;
          background: rgba(255, 255, 0, 0.1);
        }
      `}</style>
      <div
        dangerouslySetInnerHTML={{ __html: html }}
        className="code-container"
      />
    </div>
  );
};
```

#### Shiki Magic Move for Code Animation

For smooth animated transitions between code states (e.g., adding new lines, refactoring), integrate **Shiki Magic Move**:

```tsx
import { ShikiMagicMove } from 'shiki-magic-move/react';
import { useCurrentFrame, interpolate } from 'remotion';

const AnimatedCodeSlide: React.FC<{
  codeSteps: string[];
  stepDurationFrames: number;
}> = ({ codeSteps, stepDurationFrames }) => {
  const frame = useCurrentFrame();
  const currentStep = Math.min(
    Math.floor(frame / stepDurationFrames),
    codeSteps.length - 1
  );

  return (
    <ShikiMagicMove
      code={codeSteps[currentStep]}
      lang="typescript"
      theme="github-dark"
      options={{
        duration: 600,           // Animation duration in ms
        stagger: 0.3,            // Delay between token animations
        lineNumbers: true,
        animateContainer: true   // Smooth height transitions
      }}
    />
  );
};

// Example: Function evolution
const codeSteps = [
  `function greet() {\n  return "Hello";\n}`,
  `function greet(name) {\n  return "Hello, " + name;\n}`,
  `function greet(name: string): string {\n  return \`Hello, \${name}\`;\n}`
];
```

**Benefits:**
- Tokens animate smoothly between positions
- Added/removed lines fade in/out
- Height adjusts automatically
- Maintains syntax highlighting during animation

#### Alternative: Motion Canvas (MIT License)

For projects requiring MIT license without Remotion fees, **Motion Canvas** offers built-in code animation:

```typescript
// Motion Canvas - automatic diff-based transitions
import { Code, lines } from '@motion-canvas/2d/lib/components';

yield* code().code.replace(
  code().findFirstRange('oldVariable'),
  'newVariable',
  0.6  // 0.6 second transition
);
yield* code().selection(lines(2, 4), 0.3);  // Highlight lines 2-4
```

| Feature | Remotion + Code Hike | Motion Canvas |
|---------|---------------------|---------------|
| License | Paid (>3 devs) | MIT (free) |
| Code Animation | Via Shiki Magic Move | Built-in |
| Cloud Rendering | AWS Lambda | Self-hosted only |
| React Integration | Native | Separate syntax |

**Recommendation:** Use Remotion for scale, Motion Canvas for budget-conscious MVP.

### 6.4 Avatar Generation (MuseTalk)

#### Technical Requirements

| Parameter | Requirement |
|-----------|-------------|
| Driving Video Resolution | 512x512 minimum, 1080p recommended |
| Frame Rate | 25 or 30 FPS (must match output) |
| Duration | 30-60 seconds (will loop) |
| Background | **Real blurred background** (NOT green screen) |
| Face Position | Centered, 40-60% of frame height |
| Expression | Neutral mouth, natural blinking |

#### Why NOT Green Screen

> MuseTalk modifies pixels around the mouth region. With green screen:
> - AI blurs the sharp jawline edge
> - Creates "green spill" artifacts when keyed out
> - Looks unprofessional
>
> **Solution:** Use footage with real, blurred office/studio background. MuseTalk blends lip movements into existing pixels, hiding artifacts.

#### Driving Video Sources (FREE OPTIONS)

| Source | License | Quality | Notes |
|--------|---------|---------|-------|
| **Pexels** | Free commercial use | High | Search "business person talking", filter by portrait |
| **Pixabay** | Free commercial use | Medium-High | Similar to Pexels |
| **Mixkit** | Free commercial use | High | Curated collection |
| **Coverr** | Free commercial use | High | Focus on B-roll but has talking heads |
| **Generated.Photos** | Free tier available | AI-generated | Static images only (need Hallo3 for video) |
| **This Person Does Not Exist** | Free | AI-generated | Static images only |

**Search Terms for Stock Sites:**
- "business person speaking"
- "presenter talking to camera"
- "corporate spokesperson"
- "person explaining"
- "teacher talking"

#### Pexels API Integration

```typescript
import { createClient } from 'pexels';

const client = createClient(process.env.PEXELS_API_KEY!);

async function findDrivingVideos(query = 'business person talking') {
  const response = await client.videos.search({
    query,
    orientation: 'portrait',
    size: 'medium',
    per_page: 10
  });

  return response.videos.filter(video => {
    // Filter for suitable videos
    const hasPortraitOrientation = video.width < video.height;
    const isSuitableDuration = video.duration >= 10 && video.duration <= 60;
    return hasPortraitOrientation && isSuitableDuration;
  });
}
```

#### RunPod Deployment

```python
# MuseTalk inference on RunPod
import runpod

def handler(event):
    audio_path = event['input']['audio_path']
    driving_video_path = event['input']['driving_video_path']
    output_path = event['input']['output_path']

    # Load MuseTalk model
    from musetalk import MuseTalkInference

    model = MuseTalkInference(
        model_path="/models/musetalk_v1.5",
        device="cuda"
    )

    result = model.generate(
        audio_path=audio_path,
        driving_video=driving_video_path,
        output_path=output_path,
        fps=30
    )

    return {"output_path": output_path, "duration": result.duration}

runpod.serverless.start({"handler": handler})
```

#### Alternative Avatar Models (2025)

| Model | License | VRAM | Speed | Quality | API Availability |
|-------|---------|------|-------|---------|------------------|
| **MuseTalk 1.5** | MIT | 4-8 GB | **Real-time** | ★★★★☆ | Sieve (~$0.14/min) |
| **LatentSync 1.6** | Apache 2.0 | 6.5 GB | ~10-15 FPS | ★★★★★ | fal.ai ($0.20/40s) |
| **Tavus Hummingbird-0** | Commercial | Cloud | Cloud | ★★★★★ | fal.ai ($2.10/min) |
| **Hallo3** | CogVideo | 40+ GB | Slow | ★★★★★ | Self-host only |
| **SadTalker** | MIT | 4-6 GB | Fast | ★★★☆☆ | Replicate ($0.07/run) |

**Tavus Hummingbird-0 (April 2025):**
- Best-in-class FID/LSE benchmarks
- Highest quality lip-sync available via API
- Premium pricing ($2.10/minute) limits to high-value content

**Hallo3 (CVPR 2025):**
- Uses CogVideoX Video Diffusion Transformer
- Most dynamic/expressive results
- Requires 40+ GB VRAM (A100/H100)
- No hosted API — self-hosting only

**Recommendation:** MuseTalk for volume, LatentSync for quality, Tavus for premium flagship content.

### 6.5 Video Composition (FFmpeg)

#### PiP Layout

```bash
# Avatar in bottom-right corner over slides
ffmpeg -i slides.mp4 -i avatar.mp4 -i audio.mp3 \
  -filter_complex "
    [0:v]scale=1920:1080[bg];
    [1:v]scale=400:-1[avatar];
    [bg][avatar]overlay=x=W-w-40:y=H-h-40[v]
  " \
  -map "[v]" -map 2:a \
  -c:v libx264 -preset fast -crf 23 \
  -c:a aac -b:a 128k \
  output.mp4
```

#### Smart Switching (Full → PiP → Full)

```bash
# Segment-based approach
# 1. Intro (full avatar): 0-30s
# 2. Content (PiP): 30s-4m30s
# 3. Outro (full avatar): 4m30s-5m

ffmpeg -i intro_full.mp4 -i content_pip.mp4 -i outro_full.mp4 \
  -filter_complex "
    [0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[v][a];
    [v][a]setpts=PTS-STARTPTS[vout]
  " \
  -map "[vout]" \
  output.mp4
```

#### Segment Concatenation (for Partial Regen)

```bash
# playlist.txt
file 'segments/slide_01.mp4'
file 'segments/slide_02.mp4'
file 'segments/slide_03.mp4'
# ... etc

ffmpeg -f concat -safe 0 -i playlist.txt \
  -c copy output.mp4
```

---

## 7. Multi-Language Support

### 7.1 Speech Rate Variations

| Language | Words/Min | Relative to English | Duration Adjustment |
|----------|-----------|---------------------|---------------------|
| English | 150 | 1.0x | baseline |
| Spanish | 180 | 0.83x | -17% |
| German | 120 | 1.25x | +25% |
| Russian | 130 | 1.15x | +15% |
| Japanese | 200 (syllables) | 0.9x | -10% |
| Chinese | 160 (characters) | 1.1x | +10% |

**Solution:** Dynamic timing based on actual audio duration from Azure TTS.

### 7.2 RTL Languages (Arabic, Hebrew)

```tsx
// Remotion composition for RTL
const RTLWrapper: React.FC<{ children: React.ReactNode; isRTL: boolean }> = ({
  children,
  isRTL
}) => (
  <div style={{
    direction: isRTL ? 'rtl' : 'ltr',
    textAlign: isRTL ? 'right' : 'left'
  }}>
    {children}
  </div>
);
```

#### Critical: Code Block Isolation in RTL

**Problem:** Programming code is always LTR (English-based syntax). Applying `direction: rtl` to an entire slide will break code rendering.

**Solution:** Isolate code blocks with explicit LTR direction:

```tsx
// CodeBlock wrapper for RTL-safe rendering
const CodeBlockRTL: React.FC<{ code: string; language: string }> = ({ code, language }) => (
  <div style={{
    direction: 'ltr',           // CRITICAL: Force LTR for code
    textAlign: 'left',
    unicodeBidi: 'isolate',     // Prevent RTL context leaking
    fontFamily: 'JetBrains Mono, monospace'
  }}>
    <SyntaxHighlighter language={language}>
      {code}
    </SyntaxHighlighter>
  </div>
);

// Usage in Arabic slide
const ArabicSlideWithCode: React.FC = () => (
  <RTLWrapper isRTL={true}>
    <h2>مقدمة في البرمجة</h2>  {/* RTL heading */}
    <p>هذا مثال على دالة:</p>   {/* RTL description */}
    <CodeBlockRTL              {/* LTR code block */}
      language="javascript"
      code="function hello() { return 'مرحبا'; }"
    />
  </RTLWrapper>
);
```

**Testing:** Always verify that `{}`, `()`, `=>` render correctly in RTL context.

### 7.3 Font Stack

```css
/* Global font stack for all languages */
.video-text {
  font-family:
    'Inter',           /* Latin */
    'Noto Sans JP',    /* Japanese */
    'Noto Sans SC',    /* Simplified Chinese */
    'Noto Sans KR',    /* Korean */
    'Noto Sans Arabic', /* Arabic */
    'Noto Sans Hebrew', /* Hebrew */
    'Noto Sans Thai',   /* Thai */
    'Noto Sans Bengali', /* Bengali */
    'Noto Sans Devanagari', /* Hindi */
    sans-serif;
}
```

### 7.4 Language-Specific Avatar Handling

| Language | Avatar Support | Notes |
|----------|---------------|-------|
| Latin-based (en, es, fr, de, it, pt, pl) | Full | Works well |
| Cyrillic (ru) | Full | Works well |
| CJK (zh, ja, ko) | Full | Works well |
| Thai, Vietnamese, Indonesian, Malay | Full | Works well |
| Arabic, Hebrew | **Slides only** | Lip-sync struggles with guttural phonemes |
| Hindi, Bengali | Partial | Test quality before enabling |

---

## 8. Quality Assurance

### 8.1 Automated Quality Metrics

Based on research (edX/MIT analysis of 6.9M video sessions), these are the target metrics:

| Metric | Tool | Target | Alert Threshold | Action |
|--------|------|--------|-----------------|--------|
| **A/V Sync Drift** | SyncNet, ffsubsync | ±25ms | >40ms | Regenerate segment |
| **Audio Loudness** | FFmpeg loudnorm | -16 LUFS | ±2 LUFS | Re-normalize |
| **Video Quality** | VMAF | ≥85 | <80 | Re-encode with lower CRF |
| **Structural Similarity** | SSIM | ≥0.95 | <0.90 | Check compression |
| **Lip-Sync Confidence** | SyncNet | ≥0.85 | <0.70 | Flag for review |

### 8.2 FFmpeg Quality Check Commands

```bash
# VMAF score (video quality)
ffmpeg -i reference.mp4 -i test.mp4 -lavfi libvmaf -f null -

# Audio loudness analysis
ffmpeg -i input.mp4 -af "loudnorm=print_format=json" -f null - 2>&1 | \
  grep -A 12 "Parsed_loudnorm"

# SSIM comparison
ffmpeg -i reference.mp4 -i test.mp4 -lavfi ssim -f null -

# Silence detection (catch TTS failures)
ffmpeg -i input.mp4 -af silencedetect=noise=-30dB:d=3 -f null -
```

### 8.3 Sync Drift Detection

```typescript
interface SyncValidation {
  videoDuration: number;
  audioDuration: number;
  driftMs: number;
  passed: boolean;
}

async function validateSync(videoPath: string): Promise<SyncValidation> {
  const videoDuration = await getVideoDuration(videoPath);
  const audioDuration = await getAudioDuration(videoPath);
  const driftMs = Math.abs(videoDuration - audioDuration) * 1000;

  return {
    videoDuration,
    audioDuration,
    driftMs,
    passed: driftMs < 40, // 40ms threshold
    recommendation: driftMs > 40
      ? 'Regenerate with setpts=PTS-STARTPTS filter'
      : null
  };
}
```

### 8.4 Human Review Triggers

Videos are flagged for manual review when:

- [ ] VMAF score < 75 or SSIM < 0.88
- [ ] Lip-sync offset > 60ms
- [ ] Multiple artifact detection flags
- [ ] Audio clipping detected
- [ ] > 3 consecutive QA failures
- [ ] First video in a new language
- [ ] Unusual content (heavy code, formulas)

### 8.5 Optimal Slide Duration (Research-Based)

From edX/MIT study:
- **Maximum segment:** ≤6 minutes for engagement
- **Optimal slide duration:** 20-45 seconds
- **Words per slide:** ~75 (35 sec at 130 WPM)
- **Code blocks:** dedicated slide, extra time

```typescript
const OPTIMAL_SLIDE_WORDS = 75;     // ~35 seconds at 130 WPM
const MAX_SEGMENT_WORDS = 780;      // ~6 minutes maximum

function calculateCodeDisplayTime(code: string): number {
  const lines = code.split('\n');
  let totalSeconds = 0;

  for (const line of lines) {
    const baseTime = 2; // Base 2 seconds per line
    const charComplexity = line.length / 40;
    const symbolCount = (line.match(/[{}()[\]<>=!&|]/g) || []).length;
    const symbolFactor = symbolCount * 0.3;
    totalSeconds += baseTime + charComplexity + symbolFactor;
  }

  return totalSeconds;
}
```

### 8.6 Accessibility (Auto-Generated)

For WCAG 2.1 AA compliance and broader accessibility:

#### Automatic Captions via Whisper

```typescript
import whisper from 'whisper-node';

async function generateCaptions(audioPath: string, language: string): Promise<VTTCaptions> {
  const transcript = await whisper.transcribe(audioPath, {
    model: 'large-v3',
    language,
    word_timestamps: true,
    output_format: 'vtt'
  });

  return transcript;
}

// Cost: ~$0.001 per minute on GPU
// Accuracy: 95%+ for supported languages
```

#### Caption Embedding in FFmpeg

```bash
# Embed WebVTT captions
ffmpeg -i video.mp4 -i captions.vtt \
  -c copy -c:s webvtt \
  -metadata:s:s:0 language=en \
  output_with_captions.mp4

# Burn-in captions (for compatibility)
ffmpeg -i video.mp4 -vf "subtitles=captions.vtt:force_style='FontSize=24'" \
  output_burned.mp4
```

#### Accessibility Deliverables

| Asset | Format | Purpose | Cost Impact |
|-------|--------|---------|-------------|
| Closed Captions | WebVTT | Deaf/HoH viewers | +$0.005/video |
| Transcript | TXT/PDF | Screen readers, SEO | +$0.001/video |
| Audio Description | MP3 (separate track) | Blind/VI viewers | +$0.02/video (optional) |

**Recommendation:** Enable captions by default (+$0.005/video). Audio descriptions optional for Phase 3.

---

## 9. Cost Analysis

### 9.1 Per-Video Cost Breakdown (5 minutes)

| Component | Service | Calculation | Cost |
|-----------|---------|-------------|------|
| Script Generation | GPT-4o-mini | ~1000 tokens | $0.001 |
| TTS Audio | Azure Neural | ~750 words × $16/1M chars | $0.08 |
| Avatar (1 min) | RunPod RTX 4090 | 90s × $0.44/hr | $0.02 |
| Slide Render | CPU (spot) | 45s × $0.10/hr | $0.01 |
| FFmpeg Compose | CPU | 15s | $0.005 |
| Storage | Supabase/S3 | ~100MB | $0.01 |
| **TOTAL** | | | **$0.126** |

### 9.2 Volume Pricing

| Monthly Volume | Cost/Video | Monthly Total |
|----------------|------------|---------------|
| 100 videos | $0.14 | $14 |
| 1,000 videos | $0.12 | $120 |
| 10,000 videos | $0.10 | $1,000 |

### 9.3 Cost by Layout Mode

| Mode | Avatar Time | Cost/5min |
|------|-------------|-----------|
| Slides Only | 0 | $0.09 |
| Smart Switching | 1 min | $0.14 |
| Full PiP | 5 min | $0.20 |
| Full Presenter | 5 min | $0.25 |

### 9.4 Azure TTS Volume Discounts

Azure offers commitment tiers that significantly reduce TTS costs at scale:

| Tier | Commitment | Price per 1M chars | Savings |
|------|------------|-------------------|---------|
| Pay-as-you-go | None | $16.00 | Baseline |
| Commitment 5M | 5M chars/mo | $14.40 | 10% |
| Commitment 20M | 20M chars/mo | $13.60 | 15% |
| **Commitment 80M** | 80M chars/mo | **$12.16** | **24%** |
| Commitment 200M | 200M chars/mo | $11.20 | 30% |

**At 10,000 videos/month (5 min each):**
- ~750 words × 5 chars × 10,000 = 37.5M characters
- Pay-as-you-go: $600/mo
- Commitment 80M tier: **$456/mo** (saves $144/mo)

**Recommendation:** Negotiate commitment tier when exceeding 5,000 videos/month.

### 9.5 Alternative TTS Pricing (ElevenLabs)

For premium voice quality requirements:

| Tier | Monthly Cost | Characters | Per 5-min Video |
|------|-------------|------------|-----------------|
| Starter | $5 | 30K | $0.83 |
| Creator | $22 | 100K | $0.11 |
| Pro | $99 | 500K | $0.10 |
| **Scale** | $330 | 2M | **$0.08** |
| Business | $1,320 | 11M | $0.06 |

**ElevenLabs advantages:**
- Best-in-class voice quality
- Voice cloning from 6-second sample
- Character-level timestamps (alternative to Azure bookmarks)

```typescript
// ElevenLabs character-level timestamp extraction
const response = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
  {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: JSON.stringify({
      text: scriptText,
      model_id: 'eleven_multilingual_v2'
    })
  }
);

const { alignment } = await response.json();
// alignment.character_start_times_seconds[]
// alignment.character_end_times_seconds[]
```

**Limitation:** Missing Thai, Bengali support (16 of 19 languages).

---

## 10. Database Schema

### 10.1 New Tables

```sql
-- Video generation jobs
CREATE TABLE video_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  status video_job_status NOT NULL DEFAULT 'pending',

  -- Configuration
  config JSONB NOT NULL DEFAULT '{}',
  -- {
  --   "voice_id": "en-US-JennyNeural",
  --   "avatar_id": "stock_female_01",
  --   "layout_mode": "smart_switch",
  --   "language": "en"
  -- }

  -- Progress tracking
  progress JSONB DEFAULT '{}',
  -- {
  --   "stage": "tts",
  --   "percent": 45,
  --   "current_segment": 3,
  --   "total_segments": 10
  -- }

  -- Intermediate assets (for partial regen)
  assets JSONB DEFAULT '{}',
  -- {
  --   "script_path": "s3://.../script.json",
  --   "audio_path": "s3://.../audio.mp3",
  --   "timings_path": "s3://.../timings.json",
  --   "segments": {
  --     "slide_01": { "path": "s3://.../slide_01.mp4", "hash": "abc123" },
  --     "slide_02": { "path": "s3://.../slide_02.mp4", "hash": "def456" }
  --   }
  -- }

  -- Final output
  output_path TEXT,
  output_url TEXT,
  duration_seconds INTEGER,
  file_size_bytes BIGINT,

  -- Metadata
  cost_cents INTEGER,
  error_message TEXT,
  error_details JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enum for job status
CREATE TYPE video_job_status AS ENUM (
  'pending',
  'script_generating',
  'tts_synthesizing',
  'assets_generating',
  'composing',
  'uploading',
  'completed',
  'failed',
  'cancelled'
);

-- Avatar configurations
CREATE TABLE video_avatars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,

  -- Source video
  driving_video_url TEXT NOT NULL,
  driving_video_duration_seconds INTEGER,

  -- Metadata
  gender TEXT CHECK (gender IN ('male', 'female', 'neutral')),
  style TEXT CHECK (style IN ('formal', 'casual', 'friendly')),
  ethnicity TEXT,

  -- Compatibility
  supported_languages TEXT[] DEFAULT ARRAY['en'],

  -- Licensing
  source TEXT, -- 'pexels', 'pixabay', 'custom', etc.
  license_type TEXT,
  attribution TEXT,

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Voice configurations (cache Azure voice metadata)
CREATE TABLE video_voices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  azure_voice_id TEXT UNIQUE NOT NULL, -- e.g., "en-US-JennyNeural"
  language TEXT NOT NULL,
  language_name TEXT,
  gender TEXT,
  style_list TEXT[],
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_video_jobs_lesson_id ON video_generation_jobs(lesson_id);
CREATE INDEX idx_video_jobs_status ON video_generation_jobs(status);
CREATE INDEX idx_video_avatars_active ON video_avatars(is_active) WHERE is_active = true;
CREATE INDEX idx_video_voices_language ON video_voices(language);
```

### 10.2 Lesson Table Updates

```sql
-- Add video-related columns to lessons table
ALTER TABLE lessons
  ADD COLUMN video_job_id UUID REFERENCES video_generation_jobs(id),
  ADD COLUMN video_status TEXT DEFAULT 'none',
  ADD COLUMN video_url TEXT,
  ADD COLUMN video_duration_seconds INTEGER,
  ADD COLUMN video_thumbnail_url TEXT;
```

---

## 11. Frontend Integration

### 11.1 Video Generation UI Flow

```
┌─────────────────────────────────────────────────────────┐
│  Lesson View                                            │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Lesson Title                                       │ │
│  │ Duration: 5 min                                    │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  [Text Content] [Video] [Quiz]  ← Tab navigation        │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │  🎬 Video not generated                           │ │
│  │                                                    │ │
│  │  [Configure & Generate Video]                     │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 11.2 Configuration Modal

```tsx
interface VideoConfigModalProps {
  lessonId: string;
  language: string;
  onGenerate: (config: VideoConfig) => void;
}

interface VideoConfig {
  voiceId: string;
  avatarId: string | null; // null = slides only
  layoutMode: 'slides_only' | 'pip' | 'smart_switch' | 'full_presenter';
  includeChapters: boolean;
  generateThumbnail: boolean;
}
```

### 11.3 Storyboard Preview (Cost Saver!)

Before running GPU-intensive avatar generation, show a preview:

```tsx
const StoryboardPreview: React.FC<{ script: VideoScript; audioUrl: string }> = ({
  script,
  audioUrl
}) => {
  // Play audio with static slide images
  // User can validate content before spending on GPU

  return (
    <div className="storyboard-preview">
      <audio src={audioUrl} controls />
      <div className="slides-timeline">
        {script.segments.map(segment => (
          <SlidePreview
            key={segment.id}
            segment={segment}
            // Static image render, no video
          />
        ))}
      </div>
      <div className="actions">
        <Button variant="outline" onClick={onEdit}>Edit Script</Button>
        <Button onClick={onProceed}>Generate Full Video ($0.14)</Button>
      </div>
    </div>
  );
};
```

### 11.4 Progress Display

```tsx
const VideoGenerationProgress: React.FC<{ jobId: string }> = ({ jobId }) => {
  const { data: job } = useVideoJob(jobId);

  const stages = [
    { key: 'script', label: 'Generating Script', icon: FileText },
    { key: 'tts', label: 'Creating Voiceover', icon: Mic },
    { key: 'slides', label: 'Rendering Slides', icon: Presentation },
    { key: 'avatar', label: 'Generating Avatar', icon: User },
    { key: 'compose', label: 'Assembling Video', icon: Film },
  ];

  return (
    <div className="progress-stages">
      {stages.map(stage => (
        <ProgressStage
          key={stage.key}
          {...stage}
          status={getStageStatus(job, stage.key)}
        />
      ))}
    </div>
  );
};
```

---

## 12. Phased Implementation

### Phase 1: "Narrated Deck" (Weeks 1-3)

**Goal:** Audio + Slides only (no avatar)

**Deliverables:**
- Script generation with LLM
- Azure TTS integration with SSML bookmarks
- Remotion slide renderer with code highlighting
- FFmpeg composition
- Basic UI for generation trigger

**Cost:** ~$0.09 per 5-min video

**Success Criteria:**
- Audio syncs with slides within 200ms
- Code blocks render with syntax highlighting
- All 19 languages work for TTS

### Phase 2: "The Presenter" (Weeks 4-6)

**Goal:** Add avatar with Smart Switching

**Deliverables:**
- MuseTalk deployment on RunPod
- Driving video sourcing (Pexels free)
- Smart Switching layout (full intro/outro, PiP content)
- Avatar selection UI

**Cost:** ~$0.14 per 5-min video

**Success Criteria:**
- Avatar lip-sync looks natural
- No visible artifacts on face
- Smooth transitions between layouts

### Phase 3: "Studio Quality" (Weeks 7-9)

**Goal:** Polish and optimize

**Deliverables:**
- Partial regeneration (edit single slide)
- Storyboard preview
- Quality metrics and alerts
- HLS streaming support
- Admin dashboard for monitoring

**Cost:** Optimized to ~$0.10 at scale

### Phase 4: "Enterprise" (Future)

**Potential Features:**
- Custom avatar training (user uploads their video)
- Voice cloning (ElevenLabs integration)
- Interactive video elements
- Real-time avatar for live features
- **Video personalization** (see below)

#### Video Personalization (Student Name Insertion)

For personalized learning experiences, insert student-specific elements:

```typescript
interface PersonalizationConfig {
  studentName: string;
  courseName: string;
  completionDate?: string;
}

async function generatePersonalizedVideo(
  baseVideoId: string,
  config: PersonalizationConfig
): Promise<string> {
  // 1. Generate personalized audio snippet
  const personalizedAudio = await generateTTS(
    `Congratulations, ${config.studentName}!`,
    { voice: 'en-US-JennyNeural' }
  );

  // 2. Generate personalized title card
  const titleCard = await renderRemotionFrame({
    component: 'PersonalizedTitle',
    props: { name: config.studentName, course: config.courseName }
  });

  // 3. Splice into base video at marked positions
  const output = await ffmpeg([
    '-i', baseVideo,
    '-i', personalizedAudio,
    '-i', titleCard,
    '-filter_complex', `[0:v][2:v]overlay=enable='between(t,0,3)'...`
  ]);

  return output;
}
```

**Cost impact:** +$0.01-0.02 per personalized element

**Use cases:**
- Certificate videos with student name
- Welcome messages in onboarding
- Progress milestone celebrations

---

## 13. Open Questions

### 13.1 Decisions Needed

| Question | Options | Recommendation | Status |
|----------|---------|----------------|--------|
| Start with Phase 1 or 2? | 1 (slides only) / 2 (with avatar) | Phase 1 for faster validation | **PENDING** |
| Avatar diversity | 4 personas / 8 personas / AI-generated | 4 free from Pexels | **PENDING** |
| Remotion license | Self-host / Lambda | Lambda for scale | **PENDING** |
| Storage location | Supabase Storage / S3 + CloudFront | Supabase (simplicity) | **PENDING** |

### 13.2 Technical Uncertainties

| Question | Impact | Research Needed |
|----------|--------|-----------------|
| MuseTalk quality on non-English | High | Test with 5+ languages |
| Remotion render time at scale | Medium | Benchmark with real content |
| Azure TTS quality for all 19 langs | High | Sample each language |
| Long video handling (30+ min) | Medium | Test chunking strategy |

### 13.3 Awaiting Deep Research Results

- Detailed MuseTalk driving video specs
- Complete voice quality matrix for all 19 languages
- FFmpeg filter chains for complex layouts
- Partial regeneration implementation patterns

---

## 14. Research References

### 14.1 Completed Research Documents

| Document | Location | Key Findings |
|----------|----------|--------------|
| AI Video Presentation Generation | `docs/research/AI Video Presentation Generation for E-Learning State-of-the-Art Analysis 2024-2025.md` | TTS comparison, avatar models, cost analysis |
| Video Models on Platforms | `docs/research/AI video generation models on hosting platforms (December 2025).md` | API pricing, MuseTalk 1.5 details, deployment options |
| Slide Generation & Sync | `docs/research/Automated Video Pipeline Slide Generation and Audio-Visual Synchronization.md` | SSML bookmarks, Remotion integration, FFmpeg techniques |

### 14.2 Pending Research

| Topic | Prompt Location |
|-------|-----------------|
| Comprehensive Deep Research | `docs/research/prompts/deep-research-video-presentation-comprehensive.md` |

### 14.3 External References

- [Azure SSML Documentation](https://learn.microsoft.com/en-us/azure/cognitive-services/speech-service/speech-synthesis-markup)
- [MuseTalk GitHub](https://github.com/TMElyralab/MuseTalk)
- [Remotion Documentation](https://www.remotion.dev/docs/)
- [Shiki Syntax Highlighter](https://shiki.style/)
- [Pexels API](https://www.pexels.com/api/)

---

## Appendix A: Free Driving Video Sources

### Pexels (Recommended)

```
Search: "business person talking" OR "presenter" OR "spokesperson"
Filter: Portrait orientation, 10-30 seconds
License: Free for commercial use, no attribution required
URL: https://www.pexels.com/search/videos/business%20person%20talking/
```

**Good Examples:**
- Professional office backgrounds
- Good lighting
- Neutral expressions
- Clear face visibility

### Pixabay

```
Search: "talking" OR "presenter" OR "speaker"
License: Pixabay License (free commercial use)
URL: https://pixabay.com/videos/search/talking/
```

### Mixkit

```
Categories: Business, People
License: Free for commercial use
URL: https://mixkit.co/free-stock-video/
```

### Tips for Finding Good Driving Videos

1. **Portrait orientation** - Better for PiP overlay
2. **Neutral mouth position** - MuseTalk modifies the mouth
3. **Good lighting** - Even, no harsh shadows
4. **Minimal movement** - Subtle head motion OK, no walking
5. **Clean background** - Blurred office best, avoid green screen
6. **30+ FPS** - Match output frame rate
7. **10-60 seconds** - Will be looped if needed

---

## Appendix B: Azure Voice Sample Code

```typescript
// List all available voices for a language
async function listVoicesForLanguage(language: string) {
  const speechConfig = sdk.SpeechConfig.fromSubscription(
    process.env.AZURE_SPEECH_KEY!,
    process.env.AZURE_SPEECH_REGION!
  );

  const synthesizer = new sdk.SpeechSynthesizer(speechConfig);
  const result = await synthesizer.getVoicesAsync(language);

  return result.voices.map(voice => ({
    name: voice.shortName,
    displayName: voice.localName,
    gender: voice.gender,
    locale: voice.locale,
    styleList: voice.styleList || [],
    isNeural: voice.voiceType.includes('Neural')
  }));
}

// Example output for 'ru-RU':
// [
//   { name: 'ru-RU-SvetlanaNeural', displayName: 'Светлана', gender: 'Female', ... },
//   { name: 'ru-RU-DmitryNeural', displayName: 'Дмитрий', gender: 'Male', ... }
// ]
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2024-12-24 | Initial draft based on research and DeepThink analysis |
| 0.2 | 2024-12-24 | Added FINAL STRATEGY DECISION section, Quality Assurance metrics, Azure bookmark bug fix |
| 0.3 | 2024-12-24 | Comprehensive update from all 5 Deep Research documents: Accessibility (Whisper captions), RTL code isolation, Shiki Magic Move, Gamma.app API, Azure volume discounts, ElevenLabs timestamps, Personalization, Alternative avatar models (Tavus, Hallo3), Motion Canvas alternative |
