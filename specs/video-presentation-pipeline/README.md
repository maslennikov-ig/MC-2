# Video Presentation Pipeline

> Specification for automated educational video presentation generation

## Current Status: Research Completed ✅

**Next Phase:** Design & Implementation

---

## Project Context

**MegaCampus AI** is an e-learning platform that automatically generates complete courses from user-provided materials. This spec covers the **Video Presentation Pipeline** — a system to transform generated lesson content into professional webinar-style video presentations.

### Video Format Concept

```
┌─────────────────────────────────────────────────────────────┐
│  INTRO (15 sec)            │  MAIN CONTENT (3-45 min)      │
│  ─────────────────         │  ─────────────────────────    │
│  AI Avatar (MuseTalk)      │  Slides + Voiceover           │
│  introduces the topic      │  (same speaker voice)         │
└─────────────────────────────────────────────────────────────┘
```

1. **Intro (15 seconds)** — AI avatar presents the lesson topic
2. **Main Content (3-45 minutes)** — Slides with voiceover narration

---

## Directory Structure

```
specs/video-presentation-pipeline/
├── README.md                           # This file
│
├── docs/                               # Documents for stakeholders
│   └── cost-comparison-for-client.md   # Cost variants for client (RU)
│
├── research/                           # Deep Research documents
│   ├── AI Avatar Solutions...md        # Avatar research (COMPLETED)
│   ├── E-Learning Video Generation...  # Script & SSML (COMPLETED)
│   ├── E-Learning Video Pipeline...    # FFmpeg & Composition (COMPLETED)
│   ├── Multi-Language Support...md     # 19 languages (COMPLETED)
│   │
│   ├── architecture/                   # Architecture design
│   │   └── deep-think-pipeline-architecture.md
│   │
│   ├── prompts/                        # Research prompts
│   │   ├── deep-research-prompts-split.md
│   │   └── deep-think-architecture-design.md
│   │
│   ├── tts/                            # TTS provider research
│   └── video/                          # Video generation research
│
├── guides/                             # Setup guides
│   └── azure-tts-setup-guide.md        # Azure TTS configuration
│
├── decisions/                          # Architecture Decision Records
│   ├── TTS-provider-decision-final.md  # Azure TTS
│   └── avatar-provider-decision.md     # MuseTalk (NEW)
│
└── spec/                               # Specification (TODO)
    ├── requirements.md
    ├── design.md
    └── tasks.md
```

---

## Confirmed Decisions

### 1. TTS Provider: Azure Cognitive Services ✅

| Aspect | Decision |
|--------|----------|
| **Provider** | Azure TTS (Batch Synthesis API) |
| **Why** | Word-level timestamps for ALL 19 languages, Visemes for lip-sync |
| **Cost** | ~$0.02-0.03 per 5-min video |
| **Document** | `decisions/TTS-provider-decision-final.md` |

### 2. Avatar: MuseTalk 1.5 (Self-Hosted) ✅

| Aspect | Decision |
|--------|----------|
| **Provider** | MuseTalk 1.5 on RunPod GPU |
| **Why** | MIT license (commercial OK), real-time speed, 60-360x cheaper than HeyGen/Synthesia |
| **Cost** | ~$0.01 per 15-sec intro |
| **Fallback** | HeyGen Enterprise API |
| **Document** | `decisions/avatar-provider-decision.md` |

### 3. Script Generation: Hybrid ✅

| Aspect | Decision |
|--------|----------|
| **Approach** | Templates (60-70%) + LLM (30-40%) |
| **LLM** | GPT-4o-mini or Claude Haiku |
| **Cost** | ~$0.003 per lesson |

### 4. Video Composition: FFmpeg + Remotion ✅

| Aspect | Decision |
|--------|----------|
| **Long-form (45+ min)** | FFmpeg (Remotion has performance issues) |
| **Animations** | Remotion + shiki-image (optional, Premium tier) |
| **Encoding** | NVENC on RunPod (5-10x faster) |
| **Delivery** | Supabase Storage (or Cloudflare Stream for global CDN) |

### 5. Multi-Language: 19 Languages ✅

| Aspect | Decision |
|--------|----------|
| **MVP Languages** | Russian + English |
| **Full Support** | ru, en, zh, es, fr, de, ja, ko, ar, pt, it, tr, vi, th, id, ms, hi, bn, pl |
| **Fonts** | Noto Sans family (CJK, Arabic, Indic, Thai) |
| **RTL** | Arabic with proper mirroring |

---

## Cost Summary

> Based on: 1 course = 80 lessons × 6.5 min average

| Variant | Per Course | Per Lesson | Features |
|---------|------------|------------|----------|
| **Commercial** (HeyGen/Synthesia) | $800-2,000 | $10-25 | Full quality |
| **Premium** (animations + CDN) | $16-20 | $0.20-0.25 | AI avatar, animations, global CDN |
| **Optimal** (recommended) | $4-5 | $0.05-0.06 | AI avatar, static slides |
| **Budget** | $2.50-3 | $0.03-0.04 | No avatar, static slides |

**Details:** `docs/cost-comparison-for-client.md`

---

## Architecture Overview

```
LessonContent (JSON)
    │
    ├──► Script Generator (LLM) ──► SSML Script
    │                                    │
    │                                    ▼
    │                              Azure TTS ──► Audio + Timestamps
    │                                    │
    │                                    ▼
    │                              MuseTalk ──► Avatar Intro (15s)
    │
    ├──► Slide Generator ──► Slide Images (PNG)
    │
    └──► FFmpeg Compositor ──► Final Video ──► Storage
```

**Philosophy:** "Audio is the Master Clock" — visuals are rendered after audio duration is known.

**Details:** `research/architecture/deep-think-pipeline-architecture.md`

---

## Implementation Phases

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| **MVP** | 3 weeks | Pipeline: TTS + Slides + FFmpeg (RU + EN) |
| **Avatar** | +1-2 weeks | MuseTalk integration |
| **Optimization** | +1-2 weeks | Caching, partial regeneration |
| **Scale** | +1 week | All 19 languages, QA automation |

**Total:** 6-8 weeks to production-ready

---

## Key Requirements

| Requirement | Priority | Status |
|-------------|----------|--------|
| Word-level timestamps | CRITICAL | ✅ Azure TTS |
| 19 languages support | CRITICAL | ✅ Azure TTS |
| AI avatar for intro | HIGH | ✅ MuseTalk |
| Target cost < $0.50/video | HIGH | ✅ $0.30-0.35 achieved |
| Partial regeneration | MEDIUM | ✅ Designed |
| Animated slides (optional) | LOW | ✅ Remotion (Premium tier) |

---

## Scale Requirements

- **Volume:** 100+ videos/day at scale
- **Duration:** 3-45 minutes per lesson (most common: 5-15 min)
- **Quality:** Corporate training level
- **Infrastructure:** TypeScript, BullMQ, Supabase, RunPod

---

## Next Steps

1. ✅ ~~Execute Deep Research~~ — Completed
2. ✅ ~~Make Avatar Decision~~ — MuseTalk selected
3. ⏳ **Write Specification** — requirements.md, design.md, tasks.md
4. ⏳ **Azure Setup** — Configure Azure TTS
5. ⏳ **POC Implementation** — Build MVP pipeline
6. ⏳ **Production Deployment**

---

## Team

- **Product Owner:** @maslennikov-ig
- **Research:** Claude Code + Deep Research + DeepThink

---

*Created: 2025-12-29*
*Last Updated: 2025-01-08*
