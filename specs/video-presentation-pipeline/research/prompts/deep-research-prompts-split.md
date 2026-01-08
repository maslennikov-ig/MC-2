# Deep Research Prompts (Split into 4 Parts)

> Ready-to-copy prompts for Deep Research model
>
> **Recommended order:**
> 1. Avatars (blocking decision)
> 2. Multi-Language (TTS voices, typography)
> 3. Scripts & Code (content transformation)
> 4. Video Composition (final assembly)

---

## Prompt 1: AI Avatars (Most Important - Open Decision)

```markdown
# Deep Research: AI Avatar / Talking Head Solutions for E-Learning Video Pipeline

## Context

We are building an automated video presentation system for MegaCampus AI e-learning platform. Need to select the BEST avatar/lip-sync solution.

### Requirements
- **Languages**: 19 (ru, en, zh, es, fr, de, ja, ko, ar, pt, it, tr, vi, th, id, ms, hi, bn, pl)
- **Video Duration**: 3-45 minutes per lesson
- **Volume**: 100+ videos/day at scale
- **Quality**: Corporate training level (not consumer-grade AI artifacts)
- **TTS**: Azure Cognitive Services (confirmed) — provides Visemes for lip-sync

### Video Format
1. **Intro (7-15 sec)** — AI avatar/talking head presents the lesson topic
2. **Main Content (3-45 min)** — Animated presentation with voiceover (same voice, no avatar or PiP)

## Research Tasks

### 1. Avatar Solutions Comparison (2025 State-of-the-Art)

Evaluate ALL viable options with this criteria (priority order):
1. **Commercial License** — Can we use it commercially without restrictions?
2. **Quality** — Natural lip-sync, minimal artifacts, professional appearance
3. **Multi-Language Support** — Works well for all 19 languages (especially RU, ZH, AR, JA)
4. **Long-Form Stability** — Stable for 15-30 second intro clips without drift/artifacts
5. **Integration** — API available (hosted or self-hosted)
6. **Cost** — Sustainable at 100+ videos/day scale

#### Models to Evaluate

| Model | License | Commercial OK? | Hosted API | Self-Host | Quality | Multi-Lang |
|-------|---------|----------------|------------|-----------|---------|------------|
| **MuseTalk 1.5** | MIT | ? | fal.ai, Replicate | Yes | ? | ? |
| **LatentSync 1.6** | Apache 2.0 | ? | fal.ai, Replicate | Yes | ? | ? |
| **Hallo3** | Apache 2.0 | ? | ? | Yes | ? | ? |
| **V-Express** | Apache 2.0 | ? | Replicate | Yes | ? | ? |
| **LivePortrait** | MIT* | InsightFace issue? | fal.ai | Yes | ? | ? |
| **SadTalker** | CC BY-NC 4.0 | **NO** | Replicate | Yes | ? | ? |
| **Wav2Lip** | CC BY-NC 4.0 | **NO** | Replicate | Yes | ? | ? |
| **HeyGen** | Commercial | Yes (paid) | Yes | No | High | Yes |
| **D-ID** | Commercial | Yes (paid) | Yes | No | High | Yes |
| **Synthesia** | Commercial | Yes (paid) | Yes | No | High | Yes |

**Research Questions:**
1. Which open-source models have TRUE commercial licenses (not NC)?
2. Quality comparison: open-source vs commercial (HeyGen/D-ID/Synthesia)
3. Cost comparison at scale: self-hosted GPU vs commercial API
4. Which models handle non-English languages best (especially RU, ZH, AR, JA)?
5. InsightFace licensing issue for LivePortrait — is it a blocker?

### 2. Deep Dive: Top 3 Candidates

For EACH top candidate, provide:

#### Technical Specifications
- **Resolution**: Minimum and recommended
- **Frame Rate**: Required FPS
- **Background**: Green screen support? Alpha channel output?
- **Face Requirements**: Positioning, size, angle constraints
- **Audio Input**: Azure TTS Visemes supported? Or audio-driven only?

#### Performance Benchmarks

| GPU | 15-sec Video | 30-sec Video | VRAM Usage |
|-----|--------------|--------------|------------|
| RTX 4090 | ? | ? | ? |
| A100 40GB | ? | ? | ? |
| A100 80GB | ? | ? | ? |

### 3. Driving Video Sources

#### Stock Footage Options
- Which platforms allow AI modification in license? (Shutterstock, Getty, Adobe Stock)
- Specialized "AI-ready" presenter footage services?
- Licensing deep dive: model release implications for AI derivatives

#### DIY Recording Guidelines
- Equipment recommendations (camera, lighting, background)
- Recording protocol for optimal AI lip-sync results
- Duration and movements to include

### 4. Multi-Language Lip-Sync Quality

How do top solutions perform across different language phonemes?
- Latin-based (EN, ES, FR, DE)
- Cyrillic (RU)
- CJK (ZH, JA, KO)
- Arabic (AR)
- Indic (HI, BN)
- Southeast Asian (TH, VI, ID, MS)

### 5. Final Recommendation

**Deliverable**: Decision matrix with clear recommendation

| Factor | Weight | Option A | Option B | Option C |
|--------|--------|----------|----------|----------|
| Commercial License | 25% | ? | ? | ? |
| Quality (19 langs) | 25% | ? | ? | ? |
| Long-form Stability | 20% | ? | ? | ? |
| Cost at Scale | 15% | ? | ? | ? |
| Integration Ease | 15% | ? | ? | ? |
| **TOTAL** | 100% | ? | ? | ? |

1. **Primary Choice**: Which solution and why?
2. **Fallback Option**: If primary doesn't work out?
3. **Cost Analysis**: Self-hosted GPU vs commercial API at 100+ videos/day
4. **Risk Assessment**: Licensing traps? Quality issues? Vendor lock-in?
```

---

## Prompt 2: Script Generation & Code Presentation

```markdown
# Deep Research: Script Generation & Code Presentation for E-Learning Videos

## Context

MegaCampus AI e-learning platform generates lessons as structured JSON. Need to transform lesson content into video scripts with proper SSML markup for Azure TTS, and handle code blocks visually.

### Input Data Structure

\`\`\`typescript
interface LessonContent {
  id: string;
  title: string;
  duration_minutes: number; // 3, 5, 10, 15, 20, 30, or 45
  objectives: string[];
  content: {
    sections: Array<{
      type: 'heading' | 'paragraph' | 'code' | 'callout' | 'image' | 'list' | 'quote';
      // ... type-specific properties
    }>;
  };
  content_text: string; // Plain text version
}
\`\`\`

### Confirmed: Azure Cognitive Services TTS
- Word-level timestamps available
- Visemes for lip-sync
- SSML bookmarks for slide synchronization

## Part 1: Content-to-Script Transformation

### Approaches Comparison

| Approach | Quality | Cost | Latency | Consistency |
|----------|---------|------|---------|-------------|
| **LLM-based** (GPT-4, Claude) | High | $0.01-0.05/lesson | 5-15s | Variable |
| **Template-based** | Medium | ~$0 | <1s | High |
| **Hybrid** | High | $0.005-0.02/lesson | 3-8s | High |

Research best practices for each approach.

### LLM-Based Script Generation

- **Prompt Engineering**: Best prompts for converting educational content to natural speech
- **Content-Specific Rules**:
  - **Code blocks**: How to verbalize? Skip? Read? Describe?
  - **Bullet points**: Enumerate vs natural flow
  - **Headings**: Announce as transitions vs integrate
  - **Mathematical formulas**: Verbalization strategies
  - **URLs/technical terms**: Pronunciation guidance

Provide example prompts that work well.

### Slide Boundary Detection

- **Heuristic Rules**: H1/H2 = new slide? Max words per slide?
- **Content-Aware Algorithms**: NLP-based topic segmentation
- **Duration-Based**: Optimal seconds per slide for engagement

Research: What's the optimal slide duration for educational videos?

## Part 2: SSML & Synchronization

### Azure Cognitive Services SSML Deep Dive

- **Bookmark Capabilities**:
  \`\`\`xml
  <bookmark mark="slide_1"/>
  \`\`\`
  - Maximum bookmarks per request?
  - Timing precision?

- **Long Content Handling**:
  - Maximum text length per request
  - Chunking strategies for 30+ minute videos
  - Maintaining timing continuity across chunks

Provide TypeScript/Node.js code example for Azure TTS with bookmarks.

### Alternative: WhisperX Forced Alignment

- How to use as post-processing for any TTS
- Accuracy by language
- Processing time overhead
- Code examples

## Part 3: Code Presentation in Video

### Code Visualization Techniques

#### Static Code Rendering

| Library | Output Format | Theme Support | Performance |
|---------|---------------|---------------|-------------|
| Shiki | HTML/SVG | VS Code themes | ? |
| Prism.js | HTML | Custom | ? |
| Carbon | PNG | Many | API? |
| Ray.so | PNG | Limited | API? |

Video-specific considerations: resolution for 1080p, font size, anti-aliasing.

#### Animated Code

- **Typing Effect**: Character-by-character reveal, cursor animation
- **Line-by-Line Highlighting**: Current line highlight, dim inactive
- **Code Diff Animation**: Before/after transitions

Libraries/tools that implement animated code for video?

### Code Narration Strategies

Analysis of top coding educators (Fireship, Traversy Media, freeCodeCamp):
- What patterns do they use for code explanation?

**Verbalization Rules:**
- Variable declarations: "we create a variable called X"
- Function definitions: "this function takes X and returns Y"
- camelCase pronunciation: "userName" → "user name" or "user Name"?
- Operators: "==" → "equals equals" or "is equal to"?

**SSML techniques for code pronunciation?**

### Code Timing Synchronization

Code often needs more screen time than narration time:
- **Extended Display**: Show before/after narration
- **Progressive Reveal**: Line by line as discussed
- **Duration Calculation**: Lines × complexity → seconds

## Deliverables

1. Recommended script generation approach (LLM vs template vs hybrid)
2. SSML bookmark implementation guide with code examples
3. Code visualization library recommendation
4. Code narration best practices
5. Timing formulas for code display duration
```

---

## Prompt 3: Video Composition & Infrastructure

```markdown
# Deep Research: Video Composition & Infrastructure for E-Learning Pipeline

## Context

MegaCampus AI needs to compose final videos from:
1. Avatar video (15-30 sec intro)
2. TTS audio (3-45 minutes)
3. Animated slides/presentations
4. Code visualizations

Infrastructure: TypeScript, BullMQ, Supabase, RunPod for GPU.
Volume: 100+ videos/day.

## Part 1: FFmpeg Advanced Techniques

### Composition Patterns

#### Picture-in-Picture (PiP)
\`\`\`bash
# Best filter chain for avatar overlay on slides
\`\`\`
- Positioning options (corner, size)
- Rounded corners / borders / shadow effects
- Smooth transitions (fade in/out, slide)

#### Layout Switching
- Full avatar → PiP → Full slides transitions
- Crossfade vs cut
- Timing precision

#### Alpha Channel Compositing
- Overlay avatar with transparency
- Format requirements (ProRes 4444, VP9, etc.)
- Quality vs file size trade-offs

### Segment Assembly

- **Concatenation Methods**: concat demuxer vs concat filter
- **Sync Preservation**: Maintaining A/V sync across segments
- **Audio crossfade** at boundaries

### Encoding Optimization

#### E-Learning Optimal Settings
- Codec comparison: H.264 vs H.265 vs VP9 vs AV1
- Resolution: 1080p sufficient?
- Bitrate recommendations for talking head + slides
- Keyframe interval for seeking

#### Hardware Acceleration
- NVENC vs software encoding quality comparison
- Cost comparison at scale
- When is GPU encoding worth it?

Provide FFmpeg command templates for each scenario.

## Part 2: Remotion Considerations

### When to Use Remotion vs FFmpeg

| Task | Remotion | FFmpeg | Recommendation |
|------|----------|--------|----------------|
| Animated text | Best | Difficult | ? |
| Code animation | Good (Code Hike) | N/A | ? |
| Simple overlay | Overkill | Best | ? |
| Transitions | Good | Good | ? |
| High volume | Expensive | Cheap | ? |

### Remotion Technical Details

- **Licensing**: Free tier limitations, company license cost
- **Lambda Rendering**: Setup, cost per minute, concurrency limits
- **Performance**: Render time, memory for long videos

### Code Hike + Remotion
- Integration patterns
- Features and limitations
- Performance for long code blocks

## Part 3: Partial Regeneration Architecture

### Asset Dependency Model

\`\`\`
Lesson Content
    ├── Script (text)
    │   └── Audio (TTS)
    │       └── Avatar Video
    ├── Slide Definitions
    │   └── Slide Images/Videos
    └── Timing Map
        └── Final Composition
\`\`\`

### Change Scenarios

| Change | What to Regenerate | Time/Cost Saved |
|--------|-------------------|-----------------|
| Typo in slide 5 | Slide 5 + recompose from 5 | ~80% |
| Different voice | All audio + avatar | ~40% |
| Different avatar | Avatar only | ~60% |
| Add new section | New section + recompose | ~70% |

Implementation patterns:
- Content hashing for change detection
- Asset versioning schema
- Incremental composition

## Part 4: Storage & Delivery

### Intermediate Assets
- What to store (audio, slides, avatar segments, timing)
- Retention policy: storage cost vs regeneration cost
- Cleanup automation

### Final Video Delivery

| Option | Pros | Cons | Cost |
|--------|------|------|------|
| Supabase Storage | Integrated | Limits? | ? |
| S3 + CloudFront | Scalable | Setup | ? |
| Mux | Video-optimized | Vendor | ? |
| Cloudflare Stream | Fast, cheap | Features? | ? |

### Adaptive Streaming
- HLS generation from source
- Quality levels (360p, 720p, 1080p)
- FFmpeg commands for HLS

## Part 5: Quality Assurance

### Automated Quality Checks

- **Drift Detection**: A/V sync tolerance, detection algorithms
- **Silence Detection**: FFmpeg silencedetect, intentional vs error
- **Avatar Artifacts**: Detection methods, quality scoring
- **Video Technical**: Resolution, bitrate, audio levels (LUFS targets)

### Human Review Triggers
- First video in new language
- Quality score below threshold
- Unusual content (heavy code, formulas)

### Monitoring & Metrics
- Pipeline success rate by stage
- Processing time tracking
- Per-video cost breakdown
- Error categorization

## Deliverables

1. FFmpeg filter chain templates for all composition scenarios
2. Remotion vs FFmpeg decision matrix
3. Partial regeneration architecture design
4. Storage strategy recommendation
5. QA automation approach
```

---

## Prompt 4: Multi-Language Support (19 Languages)

```markdown
# Deep Research: Multi-Language Support for E-Learning Video Pipeline

## Context

MegaCampus AI generates educational videos in 19 languages:
**ru, en, zh, es, fr, de, ja, ko, ar, pt, it, tr, vi, th, id, ms, hi, bn, pl**

TTS: Azure Cognitive Services (confirmed)
Avatar: TBD (open-source or commercial)
Slides: Remotion or FFmpeg-based

## Part 1: Azure TTS Voice Quality Matrix

For EACH of 19 languages, research Azure Cognitive Services options:

| Language | Code | Best Voice | Gender | Style Variants | Quality (1-10) | Known Issues |
|----------|------|-----------|--------|----------------|----------------|--------------|
| English | en | ? | M/F | ? | ? | ? |
| Russian | ru | ? | M/F | ? | ? | ? |
| Chinese | zh | ? | M/F | ? | ? | ? |
| Spanish | es | ? | M/F | ? | ? | ? |
| French | fr | ? | M/F | ? | ? | ? |
| German | de | ? | M/F | ? | ? | ? |
| Japanese | ja | ? | M/F | ? | ? | ? |
| Korean | ko | ? | M/F | ? | ? | ? |
| Arabic | ar | ? | M/F | ? | ? | ? |
| Portuguese | pt | ? | M/F | ? | ? | ? |
| Italian | it | ? | M/F | ? | ? | ? |
| Turkish | tr | ? | M/F | ? | ? | ? |
| Vietnamese | vi | ? | M/F | ? | ? | ? |
| Thai | th | ? | M/F | ? | ? | ? |
| Indonesian | id | ? | M/F | ? | ? | ? |
| Malay | ms | ? | M/F | ? | ? | ? |
| Hindi | hi | ? | M/F | ? | ? | ? |
| Bengali | bn | ? | M/F | ? | ? | ? |
| Polish | pl | ? | M/F | ? | ? | ? |

For each language: recommend specific voice name (e.g., "en-US-JennyNeural").

## Part 2: Speech Rate & Duration Variations

### Language Speed Research

| Language | Words/Min | Syllables/Sec | Relative to English |
|----------|-----------|---------------|---------------------|
| English | ~150 | ~4.5 | 1.0x |
| Spanish | ? | ? | ?x |
| Japanese | ? | ? | ?x |
| German | ? | ? | ?x |
| Russian | ? | ? | ?x |
| Chinese | ? | ? | ?x |
| Arabic | ? | ? | ?x |
| ... | | | |

### Impact on Video Production

Same script text = different audio durations by language.

Options:
1. Generate slides separately per language (sync to audio)
2. Dynamic slide timing based on audio duration
3. Normalize speech rate via SSML prosody

Which approach is recommended?

## Part 3: Typography & Rendering

### CJK Languages (Chinese, Japanese, Korean)

**Font Requirements:**
- Recommended fonts for video (Noto Sans CJK? Source Han?)
- Commercial licensing for video generation
- Font size adjustments needed?

**Layout Considerations:**
- Line height differences
- Text wrapping rules
- Mixing with Latin text (code with CJK comments)

### Arabic (RTL)

**Text Rendering:**
- Remotion RTL support status
- Bidirectional text handling (Arabic + English code)
- Number formatting

**Layout Implications:**
- Should entire video be mirrored for RTL?
- Or just text elements?
- Avatar position in RTL layouts?

### Indic Scripts (Hindi, Bengali)

**Complex Script Rendering:**
- Conjunct characters handling
- Font shaping requirements (HarfBuzz?)
- Libraries that render correctly

### Southeast Asian (Thai, Vietnamese)

**Special Considerations:**
- Thai: No spaces between words — line breaking rules
- Vietnamese: Diacritics rendering, font requirements

## Part 4: Cultural Considerations

### Avatar Diversity
- Should avatar match target language region?
- Cultural appropriateness concerns
- Research on user preferences

### Voice Style by Culture
- Formal vs casual preferences by region
- Gender preferences for educational content
- Speaking pace expectations

## Part 5: Technical Implementation

### Font Stack Recommendation

\`\`\`css
/* Universal font stack covering all 19 languages */
font-family: ?
\`\`\`

### Character Set Support Verification
- How to test all scripts render correctly
- Fallback font chains
- Missing glyph detection

### Text Length Variations

Same content in different languages has different character counts:

| Language | Relative Length vs English |
|----------|---------------------------|
| German | ~130% (longer) |
| Chinese | ~50% (shorter) |
| Russian | ? |
| Arabic | ? |
| ... | |

Impact on slide layouts?

## Deliverables

1. Azure TTS voice recommendations for all 19 languages (specific voice names)
2. Speech rate multipliers by language
3. Font stack covering all scripts
4. RTL handling strategy
5. Per-language layout adjustments needed
6. Cultural considerations summary
```

---

## Execution Order

| Order | Prompt | Priority | Blocks |
|-------|--------|----------|--------|
| 1 | **Avatars** | Critical | Architecture decisions |
| 2 | **Multi-Language** | High | TTS voices, typography |
| 3 | **Scripts & Code** | Medium | Content transformation |
| 4 | **Video Composition** | Medium | Final assembly |

---

*Generated: 2025-01-08*
