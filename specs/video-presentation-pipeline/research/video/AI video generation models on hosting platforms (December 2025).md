# AI video generation models on hosting platforms (December 2025)

Building an AI-powered e-learning platform with talking head avatars is now highly feasible with multiple API options. **fal.ai and Replicate offer the most comprehensive ready-to-use lip-sync and TTS model catalogs**, while commercial solutions like Synthesia and HeyGen provide turnkey TTS+avatar pipelines. The open-source landscape saw major advances in 2025 with MuseTalk 1.5, LatentSync 1.6, and Hallo3 pushing state-of-the-art quality. Notably, **Banana.dev shut down in March 2024**, making RunPod the go-to replacement for self-hosted GPU workloads.

## Platform-by-platform availability and pricing

**OpenRouter** is primarily an LLM routing gateway and **does not offer video generation, TTS, or avatar models**. It supports audio and video *input* for analysis but cannot generate media. Together.ai and Fireworks.ai have stronger multimedia capabilities.

**Together.ai** emerged as a major video generation platform in 2025, offering **Sora 2, Google Veo 3, Kling, and ByteDance Seedance** for video generation at $0.14–$4.00 per video depending on model and resolution. Their TTS option is limited to Cartesia Sonic-2 at **$65 per 1M characters**. However, Together.ai has no dedicated lip-sync or avatar models.

**Fireworks.ai** excels at audio with ultra-fast Whisper transcription (10x cheaper than OpenAI) and their Voice Agent Platform offering 40+ TTS voices with sub-500ms latency. However, they **have no video generation or avatar capabilities**.

### Replicate: the model marketplace leader

Replicate offers the richest catalog of lip-sync and avatar models with production-ready APIs:

| Model | Type | Pricing | Notes |
|-------|------|---------|-------|
| **Sync Labs Lipsync-2-Pro** | Studio-grade lip-sync | Per-run (official) | Highest quality, 4K capable |
| **ByteDance OmniHuman** | Full digital human | Per-run | 147K runs, single image + audio |
| **ByteDance LatentSync** | Diffusion lip-sync | ~$0.076/run | 87K runs, open source |
| **SadTalker** | Classic talking head | ~$0.068/run (T4) | 149K runs, fast ~4 min |
| **LivePortrait** | Portrait animation | ~$0.085/run | Non-commercial only (InsightFace) |
| **Wav2Lip** | Budget lip-sync | ~$0.0052/run | Ultra-cheap, 192 runs/$1 |

For TTS, Replicate hosts **MiniMax Speech-02** (6.5M runs, 30+ languages, voice cloning), **Coqui XTTS-v2** (4.6M runs, 16 languages), **Tortoise-TTS** ($0.068/run, high quality but slow), and **Kokoro-82M** (67M runs, extremely popular).

### fal.ai delivers ready-to-use models with clear pricing

fal.ai provides the most comprehensive lip-sync model selection with transparent pricing:

| Model | Pricing | Key Features |
|-------|---------|--------------|
| **LatentSync** | $0.20/video + $0.005/sec (over 40s) | ByteDance SOTA, multilingual |
| **Tavus Hummingbird-0** | $2.10/minute | Best FID/LSE benchmarks, April 2025 |
| **Sync Lipsync v2** | $3.00/minute | Studio-grade quality |
| **Kling LipSync** | $0.14/video | Audio or text input |
| **MuseTalk** | Real-time endpoint | 30+ fps, WebSocket streaming |
| **SadTalker** | Compute-based | Classic, reliable |
| **LivePortrait** | Compute-based | Expression transfer, stitching |

TTS options on fal.ai include **ElevenLabs Multilingual v2** ($0.10/1K chars), **Orpheus TTS** ($0.05/1K chars, Llama-based), **MiniMax Speech-02 Turbo** ($0.03/1K chars), and **Kokoro** ($0.02/1K chars). Their H100 serverless pricing runs **$1.89/hour**.

### Modal is infrastructure-only (no pre-deployed models)

Modal provides excellent GPU serverless infrastructure but **requires you to deploy your own models**. Pricing is competitive at **H100 for $3.95/hour** and A100 (80GB) for **$2.50/hour** with sub-4-second cold starts when optimized. Best for high-volume self-hosted deployments.

### Hugging Face and RunPod fill specific niches

**Hugging Face Inference API** offers production-ready TTS endpoints (SpeechT5, Parler-TTS, XTTS-v2) but lip-sync models like MuseTalk 1.5 require self-hosting via Inference Endpoints at **~$1.80–2.50/hour** for GPU instances.

**RunPod Serverless** has community templates for SadTalker and LivePortrait with competitive per-second billing: **A100 at $0.00076/sec** ($2.74/hour), RTX 4090 at **$0.00031/sec** (~$1.12/hour). Their FlashBoot technology achieves 48% of cold starts under 200ms.

**Banana.dev shut down on March 31, 2024**—the founders recommend RunPod as the "most Banana-like experience."

## Where to find specific lip-sync models

The research tracked down hosting for each model you requested:

**LatentSync (ByteDance)** is broadly available: GitHub (open source), HuggingFace (v1.5 and v1.6), Replicate API, fal.ai ($0.20/video), and ComfyUI nodes. Version 1.6 (2025) addresses blurriness with 512x512 training.

**MuseTalk (Tencent)** was updated to v1.5 in March 2025 with enhanced clarity and sync loss training. Available on GitHub (MIT license), Replicate, fal.ai (real-time WebSocket), and Sieve (~$0.14/min with 40% speedup). Fully commercial-use approved.

**LivePortrait (Kuaishou)** is widely hosted on Replicate, fal.ai, Sieve, and Segmind. **Critical licensing note**: Uses InsightFace buffalo_l models restricting commercial use—a MediaPipe alternative exists for MIT/Apache compliance. FasterLivePortrait achieves 30+ fps on RTX 3090.

**SadTalker** remains available everywhere: Replicate (~$0.068/run), fal.ai, RunPod templates, and Docker self-hosting. The "faster-SadTalker-API" variant offers 10x speed improvements.

**Hallo, Hallo2, and Hallo3 (Fudan University)** are all open-sourced on GitHub and HuggingFace but **have no hosted APIs**—self-hosting on A100 is required. Hallo3 (CVPR 2025) uses CogVideoX Video Diffusion Transformer for the most dynamic results.

**V-Express (Tencent AI Lab)** is available on GitHub, HuggingFace, and Replicate via `zsxkib/v-express` (Apache 2.0 license).

**EMO (Alibaba)** remains **research-only with no public API**. Code is available but no commercial hosted version exists.

## 2025 breakthrough models and trends

The talking head generation space saw significant advances this year:

| Model | Release | Key Innovation |
|-------|---------|----------------|
| **MuseTalk 1.5** | March 2025 | GAN/perceptual/sync losses, identity consistency |
| **LatentSync 1.6** | 2025 | 512x512 resolution, reduced blurriness |
| **Hallo3** | CVPR 2025 | Video Diffusion Transformer, highly dynamic |
| **Sync Labs Lipsync-2-Pro** | 2024-25 | Zero-shot style preservation, 4K diffusion upscaling |
| **Tavus Hummingbird-0** | April 2025 | Best-in-class FID/LSE benchmarks |
| **OmniTalker** (Alibaba) | NeurIPS 2025 | Real-time text-driven, 25 fps, 0.8B params |
| **HunyuanPortrait** | CVPR 2025 | Implicit condition control |
| **REST/READ** | Late 2025 | Real-time streaming diffusion |

Emerging technical trends include **real-time diffusion architectures** (REST, READ), **Video Diffusion Transformers** (Hallo3, CogVideoX), **3D Gaussian Splatting** (EGSTalker, GGTalker for faster inference), and **zero-shot style preservation** in commercial offerings.

## Cost comparison across platforms

For a **1-minute lip-sync video generation**, costs vary significantly:

| Platform/Model | Approximate Cost |
|----------------|------------------|
| fal.ai LatentSync | ~$0.30 |
| fal.ai Sync Lipsync v2 | $3.00 |
| fal.ai Tavus Hummingbird | $2.10 |
| Replicate ByteDance LatentSync | ~$0.08 |
| Replicate Wav2Lip | ~$0.01 |
| Modal self-hosted (A10 GPU) | ~$0.01–0.02 + setup time |
| RunPod self-hosted (A100) | ~$0.04–0.08 |

For TTS, costs per 1,000 characters range from **$0.02 (Kokoro)** to **$0.10 (ElevenLabs)** on fal.ai, while Replicate's MiniMax Speech-02 models offer competitive per-run pricing.

## All-in-one TTS + avatar API services

Several commercial platforms combine TTS and avatar generation into single API calls:

| Service | Starting Price | API Access | Languages | Best For |
|---------|---------------|------------|-----------|----------|
| **D-ID** | $5.90/month | All plans | Multi | Photo-to-video, lowest barrier |
| **HeyGen** | $24/month | Creator+ | 175+ | Marketing, 1100+ avatars |
| **Synthesia** | $29/month | Enterprise | 140+ | Corporate training, SCORM |
| **Colossyan** | Enterprise | Enterprise | 50+ | Interactive L&D, branching |
| **Tavus** | Premium | API | Multi | Real-time personalization |

For developers building custom pipelines, the best combinations are:

- **Budget**: Edge TTS (free) + SadTalker on Replicate (~$0.07/run)
- **Quality**: ElevenLabs + LatentSync on fal.ai (~$0.10 + $0.30)
- **Real-time**: MiniMax TTS + MuseTalk streaming on fal.ai
- **Self-hosted**: Kokoro-82M + MuseTalk 1.5 (both MIT licensed)

## Recommendations for e-learning video pipeline

**For fastest deployment** (days): Use **Synthesia** or **HeyGen** APIs. These provide polished avatar quality, multilingual support, SCORM export for LMS integration, and require zero ML expertise. Cost: $29–299/month plus per-video fees.

**For best flexibility/cost at scale** (weeks to build): Deploy **MuseTalk 1.5** on fal.ai or RunPod Serverless combined with **ElevenLabs** or **MiniMax Speech-02** TTS. MuseTalk's MIT license allows commercial use, runs at 30+ fps, and v1.5's quality improvements make it competitive with commercial solutions. Estimated per-lesson cost for 10 minutes: **$2–3**.

**For highest quality**: Use **Sync Labs Lipsync-2-Pro** via Replicate or fal.ai ($3/minute) with premium TTS. This delivers studio-grade results with 4K upscaling via diffusion.

**For budget-conscious projects**: Chain **Replicate Wav2Lip** (~$0.005/run) with free **Edge TTS** or **Kokoro** for near-zero marginal cost per video, though quality will be noticeably lower.

## Conclusion

The December 2025 landscape offers viable options at every price point. **fal.ai and Replicate have emerged as the primary model aggregators** for video/avatar generation, while commercial players like Synthesia/HeyGen remain unmatched for turnkey enterprise deployments. Key open-source advances—particularly MuseTalk 1.5 and LatentSync 1.6—have substantially closed the quality gap with commercial offerings. For an e-learning platform, the recommended path is starting with a commercial API (D-ID or HeyGen) for rapid MVP development, then transitioning to a self-hosted MuseTalk + quality TTS pipeline as volume scales. Critical gaps remain: **Hallo3** (best dynamic quality) and **EMO** (best expressiveness) lack hosted APIs, requiring significant GPU infrastructure for self-deployment.