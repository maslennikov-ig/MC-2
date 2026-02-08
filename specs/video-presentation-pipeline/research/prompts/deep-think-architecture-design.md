# Deep Think: Video Generation Pipeline Architecture Design

## Project Context

**MegaCampus AI** is an e-learning platform that automatically generates complete courses from user-provided materials. We are building a **Video Presentation Pipeline** — a system to transform generated lesson content into professional webinar-style video presentations.

### Video Format

```
┌─────────────────────────────────────────────────────────────┐
│  INTRO (7-15 sec)          │  MAIN CONTENT (3-45 min)      │
│  ─────────────────         │  ─────────────────────────    │
│  AI Avatar (talking head)  │  Animated slides/code         │
│  introduces the topic      │  with voiceover narration     │
└─────────────────────────────────────────────────────────────┘
```

### Scale & Requirements

| Requirement    | Value                                                                           |
| -------------- | ------------------------------------------------------------------------------- |
| Languages      | 19 (ru, en, zh, es, fr, de, ja, ko, ar, pt, it, tr, vi, th, id, ms, hi, bn, pl) |
| Video Duration | 3-45 minutes per lesson (most common: 5-15 min)                                 |
| Daily Volume   | 100+ videos/day at scale                                                        |
| Quality        | Corporate training level                                                        |
| Target Cost    | ~$0.50-1.00 per 5-minute video                                                  |

### Input Data Structure

Lessons are stored as structured JSON:

```typescript
interface LessonContent {
  id: string;
  title: string;
  language: 'ru' | 'en' | 'zh' | ... ; // 19 languages
  duration_minutes: 3 | 5 | 10 | 15 | 20 | 30 | 45;
  objectives: string[];
  content: {
    sections: Array<{
      type: 'heading' | 'paragraph' | 'code' | 'callout' | 'image' | 'list' | 'quote';
      level?: 1 | 2 | 3; // for headings
      text?: string;
      language?: string; // for code blocks
      code?: string;
      items?: string[]; // for lists
      variant?: 'info' | 'warning' | 'tip'; // for callouts
    }>;
  };
  content_text: string; // Plain text version for TTS
}
```

---

## Confirmed Technical Decisions

All decisions below are FINAL and should not be reconsidered.

### 1. TTS Provider: Azure Cognitive Services

- **Word-level timestamps** available for ALL 19 languages
- **Visemes** (lip-sync phonemes) only for en-US; other languages use audio-driven lip-sync
- **SSML bookmarks** for slide synchronization
- **Batch Synthesis API** for long content (30+ minutes)
- **Limit**: 10 minutes per real-time request, 64KB SSML size

**Cost**: ~$4 per 1M characters (~$0.02-0.05 per 5-min video)

### 2. Avatar: MuseTalk 1.5 (Self-Hosted)

- **License**: MIT (fully commercial)
- **Performance**: 15-sec video in 10-15 sec on RTX 4090
- **VRAM**: 4-6 GB
- **Input**: Reference image/video + audio file
- **Output**: Lip-synced video (256x256 face region, upscale with GFPGAN)
- **Limitation**: Audio-driven only (no viseme input)

**Deployment**: RunPod GPU instances (RTX 4090 or A100)
**Fallback**: HeyGen Enterprise API ($5-20K/month)

### 3. Script Generation: Hybrid Approach

- **Templates** (60-70%): Headings → transitions, lists → enumerations
- **LLM** (30-40%): Complex content, code explanations
- **Model**: GPT-4o-mini or Claude Haiku (~$100-200/month at scale)

### 4. Code Visualization

- **Static rendering**: shiki-image (~10ms per frame, VS Code quality)
- **Animated code**: Remotion + Code Hike (typing effects, line highlights)
- **Font**: JetBrains Mono, minimum 24px for 1080p

### 5. Video Composition: Hybrid FFmpeg + Remotion

| Component                       | Tool                  | Rationale                   |
| ------------------------------- | --------------------- | --------------------------- |
| Avatar intro (15-30s)           | Remotion              | Animated text, templates    |
| Code visualizations             | Remotion + Code Hike  | Token animations            |
| Slide transitions               | Remotion              | Motion graphics             |
| Long-form composition (45+ min) | FFmpeg                | Remotion performance issues |
| PiP overlay                     | FFmpeg                | Simple, efficient           |
| Final segment assembly          | FFmpeg concat demuxer | No re-encoding              |
| Encoding                        | FFmpeg + NVENC        | 5-10x faster than CPU       |

**Remotion limitation**: Performance degrades after ~30 minutes. Split long videos into chapters.

### 6. Video Delivery: Cloudflare Stream

- All-inclusive pricing (encoding, CDN, adaptive streaming)
- ~$675/month at 100 videos/day scale
- Automatic HLS/DASH packaging
- REST API for upload

### 7. Infrastructure Stack

- **Language**: TypeScript (Node.js backend)
- **Job Queue**: BullMQ (Redis-based)
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage (intermediates) + Cloudflare Stream (final)
- **GPU**: RunPod (on-demand or reserved instances)

---

## Asset Dependency Graph

```
LessonContent (JSON)
    │
    ├──► Script Generator ──► Script + SSML
    │                              │
    │                              ▼
    │                         Azure TTS ──► Audio + Word Timestamps + Slide Timings
    │                              │
    │                              ▼
    │                         MuseTalk ──► Avatar Intro Video (15-30s)
    │
    ├──► Slide Generator ──► Slide Definitions
    │         │
    │         ▼
    │    Remotion/Shiki ──► Rendered Slide Assets (images/video)
    │
    ├──► Code Extractor ──► Code Blocks
    │         │
    │         ▼
    │    Remotion + Code Hike ──► Animated Code Videos
    │
    └──► Timing Calculator ──► Timing Map (slide durations)
                │
                ▼
           FFmpeg Compositor ──► Final Video
                │
                ▼
           Cloudflare Stream ──► Delivery URL
```

### Change Scenarios & Regeneration

| Change            | Regenerate            | Reuse                       | Time Savings |
| ----------------- | --------------------- | --------------------------- | ------------ |
| Typo in one slide | 1 slide + recompose   | Audio, avatar, other slides | 85-90%       |
| Voice change      | TTS + avatar + timing | All slides, code            | 30-40%       |
| Avatar change     | Avatar + composition  | TTS, slides, code           | 60-70%       |
| Add new section   | New segment + concat  | All existing segments       | 90-95%       |

---

## Multi-Language Considerations

### Audio Duration Variations

Same content produces different audio lengths:

| Language                    | Duration vs English |
| --------------------------- | ------------------- |
| German                      | +30%                |
| Russian, Arabic             | +25%                |
| Spanish, French, Portuguese | +20%                |
| English                     | baseline            |
| Korean                      | -10%                |
| Japanese                    | -12%                |
| Chinese                     | -15-20%             |

### Typography Requirements

| Script              | Font              | Line Height | Special Handling                |
| ------------------- | ----------------- | ----------- | ------------------------------- |
| Latin, Cyrillic     | Noto Sans         | 1.2         | —                               |
| CJK                 | Noto Sans CJK     | 1.7         | Regional variants (SC/TC/JP/KR) |
| Arabic              | Noto Naskh Arabic | 1.5         | RTL, no letter-spacing          |
| Devanagari, Bengali | Noto Sans Indic   | 1.8         | HarfBuzz shaping required       |
| Thai                | Noto Sans Thai    | 1.6         | Word segmentation preprocessing |

---

## Design Questions for Deep Think

### 1. BullMQ Job Orchestration

Design the job flow structure for:

**A) Full video generation**

- Input: LessonContent JSON
- Output: Cloudflare Stream URL
- Jobs: Script → TTS → Avatar → Slides → Code → Compose → Upload → QA

**B) Partial regeneration**

- Scenario: User fixes typo in slide 5 of 20
- Goal: Regenerate only slide 5, recompose from that point
- Challenge: Maintain consistency with existing assets

**C) Multi-language batch**

- Scenario: Generate same lesson in 5 languages simultaneously
- Goal: Maximize parallelism, share common assets where possible
- Challenge: Different audio durations require different slide timings

Questions to answer:

- How to structure BullMQ FlowProducer for these scenarios?
- What job types and queues are needed?
- How to handle job priorities (premium users vs standard)?
- How to implement partial regeneration without full rebuild?

### 2. Content-Addressed Caching Architecture

Design a caching system where:

- Same content + same settings = reuse cached asset
- Content change = regenerate only affected assets
- Settings change (voice, avatar) = regenerate dependent assets

Questions to answer:

- What hashing strategy? (content hash + settings hash + dependency hash)
- Database schema for asset tracking and cache lookup?
- How to handle cache invalidation when upstream assets change?
- Global cache (cross-video deduplication) vs per-video cache?
- Retention policy: how long to keep intermediates?

### 3. Error Handling & Recovery

Design fault-tolerant pipeline for scenarios:

**A) TTS failure mid-generation**

- 10-minute limit exceeded
- API rate limiting
- Network timeout

**B) Avatar generation failure**

- GPU out of memory
- MuseTalk model error
- Quality below threshold

**C) Partial success**

- 18 of 20 slides rendered successfully
- Avatar OK but one code block failed

Questions to answer:

- Retry strategy with exponential backoff?
- When to retry vs escalate to human review?
- How to resume from failure point without reprocessing?
- Dead letter queue handling?
- Alerting thresholds?

### 4. GPU Resource Management

Design GPU allocation strategy for:

- MuseTalk avatar generation (4-6 GB VRAM, 10-15s per 15s video)
- NVENC encoding (minimal VRAM, very fast)
- Remotion rendering (CPU + optional GPU)

Options:

- **On-demand**: Spin up RunPod instances per job
- **Reserved**: Keep GPUs warm, batch jobs
- **Hybrid**: Reserved for baseline, on-demand for spikes

Questions to answer:

- Cost optimization: when is reserved cheaper than on-demand?
- Job batching: how many avatar jobs per GPU session?
- Cold start mitigation for on-demand instances?
- Failover if RunPod unavailable?

### 5. Quality Assurance Pipeline

Design QA system with:

**Automated checks:**

- A/V sync drift (threshold: ±45ms)
- Silence detection (>3s unintended silence)
- Audio loudness (LUFS -14 to -18)
- Video technical validation (resolution, bitrate, codec)

**Human review triggers:**

- First video in new language
- New avatar debut
- Quality score below threshold
- Code-heavy content (>30% code blocks)

Questions to answer:

- Where in pipeline to insert QA checks?
- Blocking vs non-blocking QA?
- Auto-remediation capabilities (loudness normalization, etc.)?
- Review queue prioritization?
- Feedback loop to improve generation?

### 6. Monitoring & Observability

Design monitoring for production pipeline:

**Metrics needed:**

- Videos processed per hour/day
- Average processing time by stage
- Success/failure rates by stage
- Cost per video (compute + API calls)
- Queue depth and latency

**Alerts needed:**

- Pipeline stalled (queue growing, processing stopped)
- Error rate spike
- Cost anomaly
- Quality degradation

Questions to answer:

- What metrics to track at each pipeline stage?
- How to correlate logs across distributed jobs?
- Dashboard design for operations team?
- SLA definition and tracking?

---

## Expected Deliverables

1. **Architecture Diagram**: Visual representation of complete pipeline with all components, data flows, and decision points

2. **BullMQ Job Design**:
   - Queue definitions
   - Job types and payloads
   - Flow structures for each scenario
   - Priority and concurrency settings

3. **Database Schema**:
   - Tables for assets, jobs, cache
   - Indexes for efficient lookups
   - RLS policies if applicable

4. **Error Handling Matrix**:
   - Error types and recovery strategies
   - Retry policies per job type
   - Escalation paths

5. **Cost Model**:
   - Per-video cost breakdown
   - Scaling projections
   - Optimization recommendations

6. **Implementation Phases**:
   - MVP scope (what to build first)
   - Phase 2 enhancements
   - Future considerations

---

## Constraints

- Must use TypeScript/Node.js (existing codebase)
- Must use BullMQ (already integrated in platform)
- Must use Supabase (already integrated in platform)
- Budget: ~$2,000-3,000/month at 100 videos/day
- Timeline: MVP in 4-6 weeks
