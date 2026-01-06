# Video Presentation Pipeline

> Specification for automated educational video presentation generation

## Current Status: Research Phase

---

## Project Context

**MegaCampus AI** is an e-learning platform that automatically generates complete courses from user-provided materials. This spec covers the **Video Presentation Pipeline** — a system to transform generated lesson content into professional webinar-style video presentations.

### Video Format Concept

```
┌─────────────────────────────────────────────────────────────┐
│  INTRO (7-15 sec)          │  MAIN CONTENT (3-45 min)      │
│  ─────────────────         │  ─────────────────────────    │
│  AI Avatar/Talking Head    │  Animated Presentation        │
│  introduces the topic      │  with voiceover from the      │
│                            │  same speaker                 │
└─────────────────────────────────────────────────────────────┘
```

1. **Intro (7-15 seconds)** — AI avatar/talking head presents the lesson topic
2. **Main Content (3-45 minutes)** — Animated presentation with background voiceover from the same speaker voice

---

## Directory Structure

```
specs/video-presentation-pipeline/
├── README.md                      # This file (project context)
│
├── research/                      # Deep Research documents
│   ├── tts/                       # TTS provider research (COMPLETED)
│   │   ├── TTS Provider Research for Video Pipeline.md
│   │   ├── TTS Solutions for E-Learning Video Production Complete Analysis.md
│   │   ├── Murf AI TTS_ Глубокое исследование API.md
│   │   ├── Исследование Cartesia Sonic-3 TTS.md
│   │   └── Azure TTS для Video Pipeline_ Исследование.md
│   │
│   ├── video/                     # Video generation research
│   │   ├── video-poc-discussion-summary.md
│   │   └── AI video generation models on hosting platforms (December 2025).md
│   │
│   ├── avatars/                   # AI avatar research (PENDING)
│   │
│   └── prompts/                   # Deep Research prompts
│       └── deep-research-video-presentation-comprehensive.md  # ~800 lines
│
├── guides/                        # Step-by-step setup guides
│   └── azure-tts-setup-guide.md   # Azure TTS configuration (Russian)
│
├── decisions/                     # Architecture Decision Records (ADR)
│   └── TTS-provider-decision-final.md
│
└── spec/                          # Specification documents (TODO)
    ├── requirements.md
    ├── design.md
    └── tasks.md
```

---

## Confirmed Decisions

### TTS Provider: Azure Cognitive Services

| Aspect | Decision |
|--------|----------|
| **Provider** | Azure TTS (Batch Synthesis API) |
| **Why** | Word-level timestamps for ALL languages, Visemes for avatar lip-sync, 99.9% SLA |
| **Document** | `decisions/TTS-provider-decision-final.md` |
| **Setup Guide** | `guides/azure-tts-setup-guide.md` |

**Alternatives Evaluated:** ElevenLabs, Murf AI, Cartesia Sonic-3, Google Cloud TTS, Amazon Polly

---

## Pending Research

| Research Area | Status | Prompt Location |
|---------------|--------|-----------------|
| AI Avatar / Talking Head | **NOT COMPLETED** | `research/prompts/deep-research-video-presentation-comprehensive.md` |
| Animated Presentations | **NOT COMPLETED** | (included in comprehensive prompt above) |
| Video Compositor | **NOT COMPLETED** | (included in comprehensive prompt above) |

### Comprehensive Research Prompt (~800 lines)

**File:** `research/prompts/deep-research-video-presentation-comprehensive.md`

**Covers:**
- **Part 1**: AI Avatars (MuseTalk, LatentSync, Hallo3, HeyGen, D-ID, Synthesia) — **OPEN DECISION**
- **Part 2**: Script Generation & SSML Synchronization
- **Part 3**: Code Presentation in Video (syntax highlighting, animations)
- **Part 4**: Video Composition (FFmpeg, Remotion)
- **Part 5**: Multi-Language Support (19 languages)
- **Part 6**: Quality Assurance & Monitoring

---

## Key Requirements

| Requirement | Priority | Status |
|-------------|----------|--------|
| Word-level timestamps | CRITICAL | ✅ Azure TTS |
| 19 languages support | CRITICAL | ✅ Azure TTS |
| Visemes for lip-sync | HIGH | ✅ Azure TTS |
| Animated presentations | HIGH | ⏳ Needs research |
| AI avatar for intro | HIGH | ⏳ Needs research |
| Target cost < $5/video | MEDIUM | TBD |

### Language Support (19 languages)

```
ru, en, zh, es, fr, de, ja, ko, ar, pt, it, tr, vi, th, id, ms, hi, bn, pl
```

### Scale Requirements

- **Volume:** 100+ videos/day at scale
- **Duration:** 3-45 minutes per lesson (most common: 5-15 min)
- **Quality:** Corporate training level (not consumer-grade AI artifacts)
- **Infrastructure:** TypeScript, BullMQ, Supabase, RunPod for GPU

---

## Next Steps

1. **Execute Deep Research** — Run the comprehensive prompt to evaluate avatar solutions
2. **Make Avatar Decision** — Select primary avatar/lip-sync solution
3. **Azure Setup** — Configure Azure TTS using the setup guide
4. **POC Implementation** — Build proof-of-concept pipeline
5. **Write Specification** — Create requirements.md, design.md, tasks.md

---

## Team

- **Product Owner:** @maslennikov-ig
- **Research:** Claude Code + Deep Research

---

*Created: 2025-12-29*
*Last Updated: 2025-01-06*
