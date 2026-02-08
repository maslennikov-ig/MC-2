# ADR: Avatar Provider Selection

**Status:** Accepted
**Date:** 2025-01-08
**Decision:** MuseTalk 1.5 (Self-Hosted)

---

## Context

MegaCampus AI needs an AI avatar solution for video lesson intros (15 seconds). Requirements:

- **Scale:** 100+ videos/day
- **Languages:** 19 (lip-sync must work across all)
- **Quality:** Corporate training level
- **License:** Must allow commercial use
- **Cost:** Sustainable at scale

---

## Options Evaluated

### Open-Source Models

| Model              | License      | Commercial             | Speed      | Quality | Verdict           |
| ------------------ | ------------ | ---------------------- | ---------- | ------- | ----------------- |
| **MuseTalk 1.5**   | MIT          | ✅ Yes                 | Real-time  | Good    | **Selected**      |
| **LatentSync 1.6** | Apache 2.0   | ✅ Yes                 | 10x slower | Better  | Too slow          |
| **Hallo3**         | Apache 2.0   | ❌ No (CogVideoX)      | Very slow  | Best    | License blocker   |
| **V-Express**      | Apache 2.0   | ❌ No (models)         | Very slow  | Good    | License blocker   |
| **LivePortrait**   | MIT          | ⚠️ Requires workaround | Fast       | Good    | InsightFace issue |
| **SadTalker**      | CC BY-NC 4.0 | ❌ No                  | Medium     | Medium  | License blocker   |
| **Wav2Lip**        | CC BY-NC 4.0 | ❌ No                  | Fast       | Low     | License blocker   |

### Commercial APIs

| Provider  | Cost/month (100 videos/day) | Quality   | Languages |
| --------- | --------------------------- | --------- | --------- |
| HeyGen    | $5,000-20,000               | Excellent | 175+      |
| Synthesia | $10,000-50,000              | Excellent | 140+      |
| D-ID      | $3,000-15,000               | Good      | 100+      |

---

## Decision

**Primary:** MuseTalk 1.5 (Self-Hosted on RunPod)

**Reasons:**

1. **True MIT license** — code AND models are commercial-friendly
2. **Real-time speed** — 15-sec video in 10-15 sec on RTX 4090
3. **Low VRAM** — 4-6 GB, runs on consumer GPUs
4. **Cost** — ~$6/month vs $5,000-50,000 for commercial APIs (60-360x cheaper)
5. **Audio-driven** — works with any language via Whisper

**Fallback:** HeyGen Enterprise API

- If MuseTalk quality insufficient for premium content
- Budget: $5,000-20,000/month
- Best API flexibility for custom audio (Azure TTS integration)

---

## Technical Details

### MuseTalk Specifications

| Parameter         | Value                                     |
| ----------------- | ----------------------------------------- |
| Output Resolution | 256×256 face region (upscale with GFPGAN) |
| Frame Rate        | 25 fps                                    |
| VRAM Usage        | 4-6 GB                                    |
| Inference Speed   | ~30 fps on V100                           |
| Input             | Reference image/video + audio file        |
| License           | MIT (code + models)                       |

### Deployment

- **Platform:** RunPod GPU instances
- **GPU:** RTX 4090 ($0.34-0.69/hr) or A100
- **Strategy:** Reserved baseline + Serverless burst
- **Model loading:** Keep in VRAM for instant generation

### Multi-Language Support

MuseTalk uses Whisper-tiny for audio encoding — language-agnostic lip-sync that works across all 19 target languages.

**Note:** Azure TTS Visemes only work for en-US. For other languages, MuseTalk uses audio-driven lip-sync (not viseme-driven).

---

## Cost Analysis

### Self-Hosted (MuseTalk)

| Item     | Calculation                                       | Cost           |
| -------- | ------------------------------------------------- | -------------- |
| GPU Time | 100 videos × 15 sec × 1.5 processing = 37 min/day | ~$0.40/day     |
| Monthly  | 30 days                                           | **~$12/month** |

### Commercial (HeyGen)

| Item            | Cost                |
| --------------- | ------------------- |
| Enterprise tier | $5,000-20,000/month |

**Savings:** 400-1600x cheaper with self-hosted

---

## Risks & Mitigations

| Risk                         | Likelihood | Impact | Mitigation                                               |
| ---------------------------- | ---------- | ------ | -------------------------------------------------------- |
| Quality insufficient         | Medium     | High   | Test all 19 languages before production; HeyGen fallback |
| GPU availability             | Low        | Medium | Reserved instance + serverless burst                     |
| Model updates break pipeline | Low        | Medium | Pin model version, test before upgrade                   |
| RunPod outage                | Low        | High   | Multi-provider GPU strategy                              |

---

## References

- Research: `research/AI Avatar Solutions for E-Learning MuseTalk Wins for High-Volume Production.md`
- MuseTalk GitHub: https://github.com/TMElyralab/MuseTalk
- License verification: MIT for both code and models (Tencent Music Entertainment)
