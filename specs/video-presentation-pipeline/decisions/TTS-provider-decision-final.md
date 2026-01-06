# TTS Provider Decision: Final Summary

**Date:** December 25, 2025
**Decision:** Microsoft Azure AI Speech (Batch API)
**Status:** Approved for Video Presentation Stage

---

## Executive Summary

After comprehensive research of 6+ TTS providers, we selected **Microsoft Azure AI Speech** as the primary TTS solution for the automated video presentation pipeline. This decision is based on critical requirements for word-level timestamps, multilingual support (6 languages), production stability, and future avatar lip-sync capabilities.

### Key Decision Factors

| Requirement | Azure Solution | Confidence |
|-------------|----------------|------------|
| Word-level timestamps (ALL languages) | Batch API JSON output | High |
| 6 languages (EN, RU, ZH, ES, AR, JA) | Native support, stable | High |
| Production SLA | 99.9% guaranteed | High |
| Connection stability | Batch API (async) | High |
| Avatar lip-sync (Phase 2) | Visemes (21 IDs + 55 blend shapes) | High |
| Cost at scale | $7.50-12/1M chars (Commitment Tier) | Medium |

---

## Providers Evaluated

### Tier 1: Deep Research (Full Analysis)

| Provider | Status | Key Finding |
|----------|--------|-------------|
| **Microsoft Azure TTS** | **SELECTED** | Best overall: timestamps, SLA, Visemes |
| **Murf AI Falcon** | Fallback | Cheapest, but timestamp normalization issues |
| **Cartesia Sonic-3** | Future (AI Tutor) | Best latency & emotions, but preview-dependent |

### Tier 2: Initial Evaluation (Eliminated)

| Provider | Status | Reason for Elimination |
|----------|--------|----------------------|
| **ElevenLabs** | Too expensive | $50-150/1M chars (5-10x Azure) |
| **Google Cloud TTS** | Too complex | SSML marks require manual `<mark>` preprocessing |
| **Amazon Polly** | Limited | No Japanese timestamps, 2 API calls required |
| **Deepgram Aura** | Not ready | No timestamps, only 2/6 languages |
| **OpenAI TTS** | No timestamps | Requires Whisper fallback (2 API calls) |
| **Play.ht** | Shutting down | Meta acquisition, closing Dec 2025 |

---

## Detailed Comparison: Top 3 Candidates

### Microsoft Azure AI Speech

**Strengths:**
- Native word-level timestamps for ALL 6 languages via Batch API
- Timestamps delivered as JSON files in ZIP archive (no SDK required)
- 99.9% SLA with enterprise support
- Visemes: 21 IDs + 55 blend shapes for 3D avatar animation
- HD Voices (2025): Auto emotion detection from context
- Batch API solves WebSocket connection timeout issues
- Full SSML support with `mstts:express-as` emotions
- 500+ voices, 140+ languages
- Commitment Tiers reduce cost to $7.50-12/1M chars

**Weaknesses:**
- Higher latency (~150ms) vs Cartesia (40-90ms)
- Emotion control less intuitive than Cartesia
- No native laughter/sighing sounds
- Voices can sound "standard" vs more human Murf/ElevenLabs

**Pricing (125M chars/month = 5000 lessons):**
- Pay-as-you-go: ~$2,000/month
- Commitment Tier 3: ~$940-1,440/month

### Murf AI Falcon

**Strengths:**
- Lowest cost: ~$11-13/1M chars
- MultiNative technology: seamless code-switching (Python terms in Russian)
- 55ms model latency (fastest batch processing)
- Startup Program: 50M free characters (3 months)
- Good voice quality for e-learning narration

**Weaknesses:**
- Timestamp normalization issue for non-English:
  - Input: "5 яблок" → Audio: "пять яблок"
  - Timestamps return "пять" not "5"
  - Requires client-side Fuzzy Matcher
- `wordDurationsAsOriginalText` only for English (beta)
- No Visemes for lip-sync
- SLA only on Enterprise tier ($3,000+/year)
- Fewer voices per language (3-10)

**Pricing (125M chars/month):**
- Pay-as-you-go: ~$250/month (cheapest)
- Startup program: 50M free first 3 months

### Cartesia Sonic-3

**Strengths:**
- Ultra-low latency: 40-90ms TTFA (best for real-time)
- Laughter via `[laughter]` tag (unique feature)
- 50+ emotion controls via `<emotion value="excited"/>`
- Phoneme-level timestamps (convertible to Visemes)
- SSM architecture (not Transformer) - better long-text stability
- Cross-language voice cloning
- SOC 2 Type II certified

**Weaknesses:**
- Timestamps for RU/ZH/AR/JA require `sonic-preview` (less stable)
- Only EN/DE/ES/FR supported on stable `sonic` model
- More expensive: ~$30-47/1M chars
- Smaller voice library (~130 vs Azure 500+)
- Younger company (2 years track record)

**Pricing (125M chars/month):**
- Scale plan + overage: ~$3,750-5,875/month
- Enterprise: ~$1,500-2,000/month

---

## Architecture Decision

### Primary Provider: Azure TTS (Batch API)

```
Input: SSML text with prosody markup
  ↓
Azure Batch Synthesis API
  ↓
Output: ZIP archive containing:
  ├── audio.mp3 (or wav)
  ├── [nnnn].word.json    ← Word timestamps
  ├── [nnnn].sentence.json ← Sentence timestamps
  └── [nnnn].viseme.json   ← Lip-sync data (if enabled)
```

**API Configuration:**
```json
{
  "synthesisConfig": {
    "voice": "ru-RU-DmitryNeural"
  },
  "customVoices": {},
  "properties": {
    "wordBoundaryEnabled": true,
    "sentenceBoundaryEnabled": true
  }
}
```

### Fallback Strategy: Murf AI Falcon

**When to use Murf instead of Azure:**
1. Azure Russian voice sounds too "robotic" for specific content
2. Heavy code-switching content (Python/JavaScript terms in Russian)
3. Budget optimization during pilot phase (50M free chars)

**Integration approach:**
- Same TTS abstraction layer
- Switch via configuration flag
- Implement Fuzzy Matcher for timestamp alignment

---

## Future Considerations

### Phase 2: Avatar Lip-Sync

Azure is pre-selected for Phase 2 due to native Viseme support:
- 21 Viseme IDs (MPEG-4 standard)
- 55 Blend Shapes for Face AR (60 FPS)
- Direct integration with Unreal Engine MetaHumans
- JSON output format compatible with animation engines

### Future Phase: AI Tutor (Real-Time Interaction)

**Recommendation: Cartesia Sonic-3**

When we develop an interactive AI tutor with real-time voice responses, Cartesia becomes the optimal choice:

**Why Cartesia for AI Tutor:**

1. **Ultra-low latency (40-90ms)**
   - Critical for conversational AI
   - Human perception threshold for natural dialogue: <200ms
   - Azure's 150ms+ batch processing too slow for real-time

2. **Emotional expressiveness**
   - `[laughter]` for natural reactions
   - 50+ emotion tags for empathetic responses
   - Dynamic tone switching mid-conversation

3. **WebSocket streaming**
   - Audio chunks delivered as generated
   - No waiting for full synthesis
   - Enables "thinking" indicators while generating

4. **Conversational voice profiles**
   - Voices tagged as "Conversational" optimized for dialogue
   - Natural turn-taking prosody
   - Less "lecture-like" than Azure

**Architecture for AI Tutor:**
```
User Speech → STT → LLM → Cartesia WebSocket → Audio Stream
                              ↑
                    <100ms total latency target
```

**Timeline consideration:**
- Wait for `sonic` (stable) to support RU/ZH timestamps
- Currently only `sonic-preview` supports all languages
- Expected: H1 2026 based on Cartesia's roadmap

**Hybrid approach for AI Tutor:**
```
Cartesia Sonic-3 (real-time dialogue)
  ├── Student questions/answers
  ├── Tutor responses with emotions
  └── Low-latency streaming

Azure TTS (pre-generated content)
  ├── Lesson introductions
  ├── Explanatory segments
  └── Content requiring precise timestamps
```

---

## Cost Projections

### Video Presentation Stage (Current)

| Scale | Monthly Volume | Azure (Commitment) | Murf (Fallback) |
|-------|---------------|-------------------|-----------------|
| Pilot | 500 lessons (12.5M chars) | ~$150 | ~$25 |
| Growth | 2,500 lessons (62.5M chars) | ~$750 | ~$125 |
| Scale | 5,000 lessons (125M chars) | ~$1,440 | ~$250 |

### AI Tutor Phase (Future)

| Metric | Estimate |
|--------|----------|
| Avg conversation | 2-3 minutes audio |
| Characters per session | ~3,000 |
| Sessions per day | 10,000 |
| Monthly volume | ~900M chars |
| Cartesia cost (Enterprise) | ~$15,000-20,000/month |

---

## Implementation Checklist

### Immediate (Video Pipeline POC)

- [ ] Set up Azure Speech resource in West Europe region
- [ ] Implement Batch Synthesis API integration
- [ ] Parse word.json timestamps for slide sync
- [ ] Test on RU/EN/ZH sample lessons
- [ ] Validate timestamp accuracy (target: ±15ms)

### Short-term (Production)

- [ ] Negotiate Azure Commitment Tier pricing
- [ ] Implement TTS abstraction layer (provider-agnostic)
- [ ] Add Murf AI as fallback provider
- [ ] Build Fuzzy Matcher for Murf timestamp normalization
- [ ] Set up caching layer (Azure Blob Storage)

### Medium-term (Phase 2: Avatars)

- [ ] Enable Viseme output in Batch API
- [ ] Integrate with avatar animation pipeline
- [ ] Test 55 blend shapes with MetaHuman

### Long-term (AI Tutor)

- [ ] Monitor Cartesia `sonic` stable release for all languages
- [ ] Prototype real-time WebSocket integration
- [ ] Benchmark latency in production environment
- [ ] Design hybrid Azure + Cartesia architecture

---

## Research Artifacts

All detailed research documents are preserved in:

```
docs/research/
├── TTS-provider-decision-final.md          ← This document
├── TTS Solutions for E-Learning Video Production Complete Analysis.md
├── TTS Provider Research for Video Pipeline.md
├── Murf AI TTS_ Глубокое исследование API.md
├── Исследование Cartesia Sonic-3 TTS.md
├── Azure TTS для Video Pipeline_ Исследование.md
└── video-poc-discussion-summary.md
```

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-12-25 | Azure TTS as primary | Stable timestamps ALL languages, Visemes, SLA |
| 2025-12-25 | Murf AI as fallback | Cost optimization, MultiNative for code-switching |
| 2025-12-25 | Cartesia for AI Tutor (future) | Best latency, emotions for real-time dialogue |
| 2025-12-25 | Eliminated: ElevenLabs | Too expensive for scale |
| 2025-12-25 | Eliminated: Google Cloud | Complex timestamp implementation |
| 2025-12-25 | Eliminated: Play.ht | Shutting down (Meta acquisition) |

---

## Appendix: Key Contacts & Resources

### Azure
- Pricing: https://azure.microsoft.com/pricing/details/cognitive-services/speech-services/
- Batch API Docs: https://learn.microsoft.com/azure/ai-services/speech-service/batch-synthesis
- Viseme Docs: https://learn.microsoft.com/azure/ai-services/speech-service/how-to-speech-synthesis-viseme

### Murf AI
- Startup Program: https://murf.ai/startup-program
- API Docs: https://murf.ai/api/docs
- Status: https://murf.statuspage.io/

### Cartesia
- Sonic-3 Docs: https://docs.cartesia.ai/build-with-cartesia/tts-models/latest
- Pricing: https://cartesia.ai/pricing
- Status: https://status.cartesia.ai/

---

*Document created: December 25, 2025*
*Last updated: December 25, 2025*
*Authors: Development Team + Claude AI Research*
