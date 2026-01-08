# E-Learning Video Pipeline: Complete Technical Architecture Guide

**For high-volume video generation** (100+ videos/day) combining avatar video, TTS audio, animated slides, and code visualizations, this guide delivers production-ready solutions optimized for a TypeScript/BullMQ/Supabase/RunPod stack. The critical findings: use FFmpeg for core composition and long-form content (45+ minutes), reserve Remotion for complex animations and code visualizations, deploy Cloudflare Stream for delivery (~$675/month at scale), and implement content-addressed caching for **85-95% time savings** on partial regeneration.

---

## Part 1: FFmpeg advanced composition techniques

FFmpeg serves as the backbone of high-volume video composition, offering unmatched performance for PiP overlays, transitions, and segment assembly. At 100+ videos/day, optimized filter chains reduce processing costs by **60-70%** compared to naive implementations.

### Picture-in-Picture composition with professional polish

The `overlay` filter handles avatar placement on slides. This production template includes sizing, positioning, and a subtle border:

```bash
# PiP avatar in bottom-right corner with white border
ffmpeg -i slides.mp4 -i avatar.mp4 \
  -filter_complex "
    [1:v]scale=320:180,
    format=yuva420p,
    pad=w=324:h=184:x=2:y=2:color=white[bordered];
    [0:v][bordered]overlay=main_w-overlay_w-20:main_h-overlay_h-20
  " \
  -c:v libx264 -crf 22 -preset medium -c:a copy output.mp4
```

**Positioning reference** (all with 10-20px padding):
- Top-left: `overlay=20:20`
- Top-right: `overlay=main_w-overlay_w-20:20`
- Bottom-left: `overlay=20:main_h-overlay_h-20`
- Bottom-right: `overlay=main_w-overlay_w-20:main_h-overlay_h-20` (recommended for e-learning)

**Animated PiP with fade transitions**:
```bash
ffmpeg -i slides.mp4 -i avatar.mp4 \
  -filter_complex "
    [1:v]scale=320:180,
    format=yuva420p,
    fade=t=in:st=0:d=0.5:alpha=1,
    fade=t=out:st=9.5:d=0.5:alpha=1[pip];
    [0:v][pip]overlay=main_w-overlay_w-20:main_h-overlay_h-20:enable='between(t,2,12)'
  " \
  -c:v libx264 -crf 22 output.mp4
```

### Layout switching with crossfade transitions

The `xfade` filter (44+ transition types) enables smooth layout changes. **Critical**: coordinate video and audio crossfades to prevent A/V drift.

```bash
# Full avatar → slides with 1-second crossfade
ffmpeg -i avatar_intro.mp4 -i slides_content.mp4 \
  -filter_complex "
    [0:v]settb=AVTB,fps=30[v0];
    [1:v]settb=AVTB,fps=30[v1];
    [v0][v1]xfade=transition=fade:duration=1:offset=14[outv];
    [0:a][1:a]acrossfade=d=1:c1=tri:c2=tri[outa]
  " \
  -map "[outv]" -map "[outa]" -c:v libx264 -crf 22 -c:a aac output.mp4
```

**Key xfade transitions for e-learning**: `fade`, `dissolve`, `slideright`, `slideleft`, `wipeleft`, `circleopen`

**Offset calculation**: `offset = duration_of_first_video - transition_duration`

### Alpha channel compositing for transparent avatars

| Format | Quality | File Size | Web Support | Recommended Use |
|--------|---------|-----------|-------------|-----------------|
| ProRes 4444 | Excellent | Very Large | Mac only | Editing intermediate |
| VP9 WebM | Good | Medium | Chrome/Firefox | **Web delivery** |
| PNG Sequence | Lossless | Huge | N/A | Short clips only |

**VP9 WebM with alpha** (recommended for web):
```bash
# Encode avatar with transparency
ffmpeg -i avatar_alpha.mov \
  -c:v libvpx-vp9 -pix_fmt yuva420p -crf 30 -b:v 0 \
  avatar_transparent.webm

# Composite over background
ffmpeg -i slides.mp4 -i avatar_transparent.webm \
  -filter_complex "[0:v][1:v]overlay=format=auto:alpha=straight" \
  -c:v libx264 -crf 22 output.mp4
```

### Segment assembly: concat demuxer vs filter

**Concat demuxer** (stream copy, no re-encoding—**5-10x faster**):
```bash
# segments.txt
file 'intro.mp4'
file 'chapter1.mp4'
file 'chapter2.mp4'
file 'outro.mp4'

ffmpeg -f concat -safe 0 -i segments.txt -c copy output.mp4
```
*Requirement*: All segments must have identical codecs, resolution, and frame rate.

**Concat filter** (handles mismatched properties, requires re-encoding):
```bash
ffmpeg -i segment1.mp4 -i segment2.mp4 -i segment3.mp4 \
  -filter_complex "
    [0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[outv][outa]
  " \
  -map "[outv]" -map "[outa]" \
  -c:v libx264 -crf 22 -c:a aac -b:a 128k output.mp4
```

**A/V sync preservation** (critical for segment boundaries):
```bash
# Always reset timestamps at segment boundaries
[0:v]setpts=PTS-STARTPTS[v0];
[0:a]asetpts=PTS-STARTPTS[a0];
```

### Encoding optimization for e-learning content

| Codec | Compression | Speed | Compatibility | Recommendation |
|-------|-------------|-------|---------------|----------------|
| H.264 | Baseline | Fast | Universal | **Primary delivery** |
| H.265 | 30-40% better | Medium | Good | 4K content |
| VP9 | Similar to HEVC | Slow | Chrome/Firefox | YouTube delivery |
| AV1 | 50% better | Very slow | Limited | Future-proofing |

**Production encoding template** for e-learning:
```bash
ffmpeg -i input.mp4 \
  -c:v libx264 \
  -preset medium \
  -crf 22 \
  -profile:v high \
  -level 4.1 \
  -pix_fmt yuv420p \
  -g 60 \                    # 2-second keyframe interval at 30fps
  -keyint_min 60 \
  -sc_threshold 0 \          # Disable scene-change keyframes
  -c:a aac -b:a 128k \
  -movflags +faststart \     # Enable progressive download
  output.mp4
```

**Resolution and bitrate targets**:

| Resolution | Talking Head | Slides + Code | CRF Value |
|------------|--------------|---------------|-----------|
| 720p | 1.5-2.5 Mbps | 2-3 Mbps | 23 |
| **1080p** | **3-5 Mbps** | **4-6 Mbps** | **22** |
| 4K | 15-25 Mbps | 20-35 Mbps | 24-26 |

### Hardware acceleration with NVENC

NVENC delivers **5-10x faster encoding** versus CPU, making it essential at scale. Allocate **10-15% higher bitrate** to match libx264 quality.

**High-quality NVENC template** (RunPod GPU):
```bash
ffmpeg -y -vsync 0 \
  -hwaccel cuda -hwaccel_output_format cuda \
  -i input.mp4 \
  -c:v h264_nvenc \
  -preset p6 \              # p6-p7 for highest quality
  -tune hq \
  -b:v 5M \
  -maxrate 8M \
  -bufsize 10M \
  -rc vbr \
  -cq 22 \
  -g 60 \
  -bf 3 \
  -b_ref_mode middle \
  -temporal-aq 1 \          # Temporal adaptive quantization
  -spatial-aq 1 \           # Spatial adaptive quantization
  -aq-strength 8 \
  -rc-lookahead 20 \
  -c:a copy \
  output.mp4
```

**Multi-resolution encoding** (single input, multiple outputs):
```bash
ffmpeg -y -vsync 0 \
  -hwaccel cuda -hwaccel_output_format cuda \
  -i input.mp4 \
  -vf scale_npp=1920:1080 -c:v h264_nvenc -b:v 5M output_1080p.mp4 \
  -vf scale_npp=1280:720 -c:v h264_nvenc -b:v 2.5M output_720p.mp4 \
  -vf scale_npp=640:360 -c:v h264_nvenc -b:v 800k output_360p.mp4
```

**Cost comparison at 100 videos/day**:
- CPU encoding (libx264 medium): ~$150-200/day compute
- NVENC (RunPod A40): ~$30-50/day compute
- **Savings: 70-80%** with acceptable quality trade-off

---

## Part 2: Remotion decision matrix and integration

Remotion excels at programmatic video generation with React components, but has **critical limitations for long-form content** (45+ minutes) and significant licensing costs.

### Licensing costs (2025)

| Tier | Cost | Includes |
|------|------|----------|
| Free | $0 | Teams ≤3 people, unlimited videos |
| Company | $100+/month minimum | $25/developer + $10/render tier |
| Enterprise | $500+/month | Private support, consulting |

**Lambda cloud rendering** requires additional Cloud Rendering Units for teams of 4+ people.

### Performance characteristics and limitations

**Lambda rendering costs**:
| Video Type | Cost | Render Time |
|------------|------|-------------|
| 1 min HD | $0.017 | ~19 seconds |
| 10 min HD | $0.103 | ~56 seconds |
| 45 min HD | ~$0.45 | ~4-5 minutes |

**Critical limitation**: Videos exceeding **30 minutes experience significant performance degradation**. GitHub discussions report "cache pruning" messages and slowdowns after ~20% progress on long renders. The `OffthreadVideo` component struggles with 45+ minute source videos.

**Workarounds for long content**:
- Increase `offthreadVideoCacheSizeInBytes` (default is half system memory)
- Split long videos into chapters, render separately
- Use self-hosted rendering with generous memory allocation
- Avoid OpenGL backend (`angle`) for long renders due to memory leaks

### Code Hike integration patterns

Code Hike (v1.0+) officially integrates with Remotion for animated code walkthroughs:

```typescript
import { parseRoot } from '@codehike/mdx';
import { Sequence } from 'remotion';

const { steps } = parseRoot(Content, Schema);

// Map steps to Remotion Sequences
{steps.map((step, i) => (
  <Sequence from={STEP_FRAMES * i} durationInFrames={STEP_FRAMES}>
    <Code code={step.code} />
  </Sequence>
))}
```

**Features**: Token transitions, annotation-driven highlights, parametrizable timing via query strings.

### Remotion vs FFmpeg decision matrix

| Use Case | Recommendation | Rationale |
|----------|----------------|-----------|
| Avatar intro (15-30s) | **Remotion** | Template-based, animated text |
| Code visualizations | **Remotion + Code Hike** | Token animations, syntax highlighting |
| Animated slide transitions | **Remotion** | Complex motion graphics |
| TTS audio overlay | **FFmpeg** | Simple audio muxing |
| Long-form content (45+ min) | **FFmpeg** | Remotion performance issues |
| Simple PiP composition | **FFmpeg** | Lower overhead |
| Final segment assembly | **FFmpeg concat** | No re-encoding needed |
| High-volume processing | **FFmpeg** | Predictable at scale |

### Recommended hybrid architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    HYBRID PIPELINE                              │
├─────────────────────────────────────────────────────────────────┤
│ Avatar Intro (15-30s)      → Remotion (animated, templated)     │
│ Code Visualizations        → Remotion + Code Hike               │
│ Animated Slides            → Remotion (transitions, effects)    │
│ TTS Audio Processing       → FFmpeg (normalization, overlay)    │
│ Long-form Composition      → FFmpeg (45+ min videos)            │
│ Final Assembly             → FFmpeg concat demuxer              │
└─────────────────────────────────────────────────────────────────┘
```

**Budget estimate**: $150-300/month for Remotion licensing + $30-150/month AWS Lambda costs for Remotion renders.

---

## Part 3: Partial regeneration architecture

Content-addressed caching with DAG-based dependency tracking enables **85-95% time savings** when modifying existing videos. This architecture minimizes redundant processing while ensuring consistency.

### Asset dependency DAG model

```
                    ┌─────────────────┐
                    │  Script/Content │
                    └────────┬────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
            ▼                ▼                ▼
    ┌───────────────┐ ┌───────────────┐ ┌───────────────────┐
    │   TTS Audio   │ │ Slide Defs    │ │ Code Visualization│
    └───────┬───────┘ └───────┬───────┘ └─────────┬─────────┘
            │                 │                   │
            ▼                 ▼                   │
    ┌───────────────┐ ┌───────────────┐           │
    │ Avatar Lipsync│ │ Rendered      │           │
    │   Video       │ │ Slide Assets  │           │
    └───────┬───────┘ └───────┬───────┘           │
            │                 │                   │
            └────────────────┬┴───────────────────┘
                             ▼
                    ┌─────────────────┐
                    │   Timing Map    │
                    │   + Composition │
                    └─────────────────┘
```

### Change scenario analysis

| Scenario | Regenerate | Reuse | Time Savings |
|----------|------------|-------|--------------|
| **Typo in one slide** | 1 slide + concat | Audio, avatar, other slides | **85-90%** |
| **Voice change** | TTS + avatar + timing | All slides, code viz | **30-40%** |
| **Avatar change** | Avatar + composition | TTS audio, slides, code | **60-70%** |
| **Add new section** | New segment + concat | All existing segments | **90-95%** |

### Content hashing implementation

Use **xxHash64** for content hashing—**50x faster** than SHA-256 with negligible collision risk.

```typescript
import { xxh64 } from 'xxhash-wasm';

interface AssetHash {
  contentHash: string;    // Hash of raw content
  settingsHash: string;   // Hash of generation settings
  dependencyHash: string; // Hash of parent asset versions
  computedHash: string;   // Combined cache key
}

async function computeAssetHash(
  content: string, 
  settings: Record<string, any>, 
  parentHashes: string[]
): Promise<string> {
  const contentHash = await xxh64(content);
  const settingsHash = await xxh64(JSON.stringify(settings, Object.keys(settings).sort()));
  const combined = [contentHash, settingsHash, ...parentHashes.sort()].join(':');
  return xxh64(combined).toString(16);
}
```

### Supabase database schema

```sql
-- Core assets table with versioning
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  
  -- Content tracking
  content_hash VARCHAR(64) NOT NULL,
  settings_hash VARCHAR(64) NOT NULL,
  computed_hash VARCHAR(64) NOT NULL,
  
  -- Status and storage
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  storage_url TEXT,
  is_current BOOLEAN NOT NULL DEFAULT true,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(video_id, type, version)
);

-- Global content-addressed cache (deduplication across videos)
CREATE TABLE asset_cache (
  computed_hash VARCHAR(64) PRIMARY KEY,
  storage_url TEXT NOT NULL,
  asset_type VARCHAR(50) NOT NULL,
  hit_count INT NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Asset dependency edges
CREATE TABLE asset_dependencies (
  parent_asset_id UUID NOT NULL REFERENCES assets(id),
  child_asset_id UUID NOT NULL REFERENCES assets(id),
  UNIQUE(parent_asset_id, child_asset_id)
);
```

### BullMQ flow-based job orchestration

```typescript
import { FlowProducer } from 'bullmq';

const flowProducer = new FlowProducer({ connection: redis });

// Full video generation with dependency tree
async function createVideoFlow(videoId: string, content: VideoContent) {
  return flowProducer.add({
    name: `compose:${videoId}`,
    queueName: 'composition',
    data: { videoId },
    children: [
      {
        name: `avatar:${videoId}`,
        queueName: 'avatar-generation',
        data: { videoId, avatarId: content.avatarId },
        children: [
          {
            name: `tts:${videoId}`,
            queueName: 'tts-generation',
            data: { videoId, script: content.script, voiceId: content.voiceId }
          }
        ]
      },
      ...content.slides.map((slide, i) => ({
        name: `slide:${videoId}:${i}`,
        queueName: 'slide-rendering',
        data: { videoId, slideIndex: i, content: slide }
      })),
      ...content.codeBlocks.map((block, i) => ({
        name: `code:${videoId}:${i}`,
        queueName: 'code-visualization',
        data: { videoId, blockIndex: i, code: block }
      }))
    ]
  });
}

// Partial regeneration for slide change
async function regenerateSlide(videoId: string, slideIndex: number, newContent: string) {
  return flowProducer.add({
    name: `recompose:${videoId}`,
    queueName: 'composition',
    data: { videoId, partialMode: true },
    children: [{
      name: `slide:${videoId}:${slideIndex}`,
      queueName: 'slide-rendering',
      data: { videoId, slideIndex, content: newContent }
    }]
  });
}
```

### Worker with cache-first strategy

```typescript
const slideWorker = new Worker('slide-rendering', async (job) => {
  const { videoId, slideIndex, content } = job.data;
  
  // Compute hash for cache lookup
  const computedHash = await computeAssetHash(content, { theme: 'default' }, []);
  
  // Check global cache first
  const { data: cached } = await supabase
    .from('asset_cache')
    .select('storage_url')
    .eq('computed_hash', computedHash)
    .single();
  
  if (cached) {
    // Cache hit - increment counter and return
    await supabase.rpc('increment_cache_hit', { hash: computedHash });
    return { storageUrl: cached.storage_url, cached: true };
  }
  
  // Cache miss - render and store
  const renderedPath = await renderSlide(content);
  const storageUrl = await uploadToStorage(renderedPath);
  
  await supabase.from('asset_cache').upsert({
    computed_hash: computedHash,
    storage_url: storageUrl,
    asset_type: 'rendered_slide'
  });
  
  return { storageUrl, cached: false };
}, { connection: redis, concurrency: 5 });
```

---

## Part 4: Storage strategy and delivery platform comparison

### Platform cost analysis (3,000 videos/month × 15 min average)

| Platform | Storage | Delivery | Encoding | **Total/Month** |
|----------|---------|----------|----------|-----------------|
| **Cloudflare Stream** | $225 | $450 | $0 | **$675** |
| Mux (Basic) | $135 | $383-680 | $0 | $518-815 |
| AWS S3 + CloudFront | $39 | ~$200 | ~$1,350 | ~$1,589 |
| Supabase Storage | $36 | $510-1,530 | Self-managed | $546-1,566+ |

### Recommended architecture: Cloudflare Stream

**Why Cloudflare Stream wins**:
- All-inclusive pricing (encoding, CDN, adaptive streaming included)
- **330+ global edge locations** for low-latency delivery
- Automatic HLS/DASH packaging—no FFmpeg pipeline needed
- Simple REST API integrates easily with TypeScript stack
- No surprise bandwidth bills

```typescript
// Cloudflare Stream integration
class VideoDeliveryService {
  async uploadVideo(filePath: string, metadata: any) {
    // Get direct upload URL
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream?direct_upload=true`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${CF_API_TOKEN}` },
        body: JSON.stringify({ maxDurationSeconds: 3600, meta: metadata })
      }
    );
    
    const { uploadURL } = await response.json();
    
    // Upload via TUS protocol
    const video = await this.tusUpload(uploadURL, filePath);
    
    // Store reference in Supabase
    await supabase.from('videos').insert({
      cf_uid: video.uid,
      hls_url: video.playback.hls,
      duration: video.duration
    });
    
    return video;
  }
  
  getPlaybackUrl(cfUid: string): string {
    return `https://customer-${CF_ACCOUNT_ID}.cloudflarestream.com/${cfUid}/manifest/video.m3u8`;
  }
}
```

### Intermediate asset storage strategy

| Asset Type | Format | Size (15 min video) | Retention |
|------------|--------|---------------------|-----------|
| TTS Audio | MP3 128kbps | ~15MB | 7-14 days |
| Rendered Slides | WebP | ~50-100MB | 7 days |
| Avatar Segments | H.264 MP4 | ~200-500MB | 7 days |
| Timing Metadata | JSON | ~10-50KB | 30+ days |

**Cost trade-off**: At $0.02/GB/month storage vs $0.50+ regeneration cost, **retain intermediates for 7-14 days**.

### Self-hosted HLS generation (if not using Cloudflare Stream)

```bash
# Multi-bitrate HLS packaging
ffmpeg -i input.mp4 \
  -filter_complex "[0:v]split=3[v1][v2][v3]; \
    [v1]copy[v1out]; \
    [v2]scale=1280:720[v2out]; \
    [v3]scale=640:360[v3out]" \
  -map "[v1out]" -c:v:0 libx264 -b:v:0 4M -preset medium -g 48 -sc_threshold 0 \
  -map "[v2out]" -c:v:1 libx264 -b:v:1 2M -preset medium -g 48 -sc_threshold 0 \
  -map "[v3out]" -c:v:2 libx264 -b:v:2 800k -preset medium -g 48 -sc_threshold 0 \
  -map a:0 -c:a:0 aac -b:a:0 128k \
  -map a:0 -c:a:1 aac -b:a:1 128k \
  -map a:0 -c:a:2 aac -b:a:2 96k \
  -f hls \
  -hls_time 6 \
  -hls_playlist_type vod \
  -hls_flags independent_segments \
  -master_pl_name master.m3u8 \
  -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2" \
  stream_%v.m3u8
```

---

## Part 5: QA automation framework

### Industry standards and thresholds

| Metric | Pass | Warning | Fail |
|--------|------|---------|------|
| A/V Sync | ±20ms | ±45ms | >60ms |
| Audio Loudness (LUFS) | -14 to -18 | ±2 | >±4 |
| True Peak | ≤-1.5dB | -1.0dB | >-1.0dB |
| Silence Duration | <3s | 3-5s | >5s |
| Quality Score | ≥80 | 70-79 | <70 |

### FFmpeg QA commands

**Silence detection** (TTS-optimized):
```bash
ffmpeg -i video.mp4 -af "silencedetect=noise=-35dB:d=3.0" -f null - 2>&1 | grep silence
```

**Loudness measurement** (LUFS):
```bash
ffmpeg -i video.mp4 -af "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1 | tail -12
```

**Two-pass loudness normalization**:
```bash
# Pass 1: Measure
LOUDNESS=$(ffmpeg -i input.mp4 -af "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1 | tail -12)

# Extract measured values and apply in pass 2
INPUT_I=$(echo "$LOUDNESS" | jq -r '.input_i')
INPUT_TP=$(echo "$LOUDNESS" | jq -r '.input_tp')

# Pass 2: Normalize
ffmpeg -i input.mp4 -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$INPUT_I:measured_TP=$INPUT_TP:linear=true" -c:v copy output.mp4
```

**Technical validation** (ffprobe):
```bash
ffprobe -v quiet -print_format json -show_format -show_streams video.mp4 | jq '{
  container: .format.format_name,
  duration: .format.duration,
  video_codec: (.streams[] | select(.codec_type=="video") | .codec_name),
  resolution: "\(.streams[] | select(.codec_type=="video") | .width)x\(.streams[] | select(.codec_type=="video") | .height)",
  video_bitrate: (.streams[] | select(.codec_type=="video") | .bit_rate),
  audio_codec: (.streams[] | select(.codec_type=="audio") | .codec_name),
  sample_rate: (.streams[] | select(.codec_type=="audio") | .sample_rate)
}'
```

### BullMQ QA worker implementation

```typescript
interface QAResult {
  videoId: string;
  passed: boolean;
  score: number;
  checks: {
    avSync: { drift_ms: number; passed: boolean };
    loudness: { lufs: number; peak: number; passed: boolean };
    silence: { segments: SilenceSegment[]; passed: boolean };
    technical: { resolution: string; bitrate: number; passed: boolean };
  };
  triggers: ReviewTrigger[];
}

const qaWorker = new Worker('video-qa', async (job) => {
  const { videoId, videoPath, isNewLanguage, isNewAvatar } = job.data;
  
  // Run all checks in parallel
  const [technical, loudness, silence, avSync] = await Promise.all([
    validateTechnical(videoPath),
    measureLoudness(videoPath),
    detectSilence(videoPath, -35, 3),
    checkAVSync(videoPath)
  ]);
  
  // Calculate composite score
  const score = calculateQualityScore({ technical, loudness, silence, avSync });
  
  // Evaluate review triggers
  const triggers: ReviewTrigger[] = [];
  
  if (isNewLanguage) triggers.push({ type: 'new_language', priority: 'critical' });
  if (isNewAvatar) triggers.push({ type: 'new_avatar', priority: 'critical' });
  if (score < 70) triggers.push({ type: 'low_quality_score', priority: 'high' });
  if (Math.abs(avSync.drift_ms) > 45) triggers.push({ type: 'av_drift', priority: 'high' });
  if (silence.segments.some(s => s.duration > 5)) {
    triggers.push({ type: 'silence_error', priority: 'medium' });
  }
  
  // Auto-remediate where possible
  if (loudness.lufs < -18 || loudness.lufs > -14) {
    await normalizeAudio(videoPath);
  }
  
  // Queue for human review if needed
  if (triggers.some(t => !canAutoRemediate(t))) {
    await addToReviewQueue(videoId, triggers);
  }
  
  return { videoId, passed: triggers.length === 0, score, triggers };
}, { connection: redis, concurrency: 5 });
```

### Human review trigger matrix

| Condition | Priority | Auto-Remediate | Action |
|-----------|----------|----------------|--------|
| First video in new language | Critical | No | Mandatory review |
| New avatar debut | Critical | No | Full QA review |
| Quality score <70 | High | No | Priority review |
| A/V drift >60ms | High | Attempt | Review if fix fails |
| Silence >5s mid-content | Medium | No | Review segment |
| LUFS outside range | Low | Yes | Auto-normalize |

### Monitoring metrics for dashboard

```typescript
interface PipelineMetrics {
  // Throughput
  videosProcessed24h: number;
  averageProcessingTime: number;
  queueDepth: number;
  
  // Quality
  passRate: number;              // Target: >95%
  averageQualityScore: number;   // Target: >85
  humanReviewRate: number;       // Target: <10%
  
  // Cost tracking
  avgCostPerVideo: number;
  computeUtilization: number;
  
  // Error breakdown
  errorsByCategory: {
    encoding_failure: number;
    av_sync: number;
    silence_error: number;
    avatar_artifact: number;
  };
}
```

**Alerting thresholds**:
- Critical: Failure rate >5% (1h window), queue backlog >500 (15m)
- Warning: Pass rate <95% (4h), human review rate >20% (4h)

---

## Summary: Production deployment checklist

### Infrastructure costs at scale (100 videos/day)

| Component | Monthly Cost |
|-----------|--------------|
| Cloudflare Stream (delivery) | ~$675 |
| Supabase (storage + database) | ~$75-150 |
| RunPod GPU (NVENC encoding) | ~$900-1,500 |
| Remotion License | ~$150-300 |
| **Total** | **~$1,800-2,625/month** |

### Key architectural decisions

- **FFmpeg for core composition**: PiP, transitions, encoding, segment assembly
- **Remotion for complex animations**: Avatar intros, code visualizations (keep <30 min)
- **NVENC hardware encoding**: 5-10x faster, acceptable quality at +10-15% bitrate
- **Cloudflare Stream for delivery**: Simplest, most cost-effective at scale
- **Content-addressed caching**: 85-95% time savings on partial regeneration
- **BullMQ FlowProducer**: Dependency-aware job orchestration

### Pre-deployment validation checklist

- [ ] FFmpeg compiled with NVENC support on RunPod images
- [ ] BullMQ connection pooling configured for concurrency
- [ ] Supabase RLS policies for asset tables
- [ ] Cloudflare Stream API credentials in environment
- [ ] QA threshold configuration validated against sample content
- [ ] Alerting webhooks configured for critical failures
- [ ] Garbage collection cron jobs scheduled for asset cleanup