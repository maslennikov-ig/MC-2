# E-Learning Video Generation: Script, SSML, and Code Presentation Guide

Generating educational videos at scale requires a carefully orchestrated pipeline combining LLM-based script generation, Azure TTS with precise timing, and server-side code visualization. For MegaCampus's 100+ videos/day across 19 languages, **hybrid script generation** (templates + LLM) paired with **Remotion + Shiki** offers the optimal balance of quality, cost, and maintainability—delivering VS Code-quality syntax highlighting with React-based animation at approximately **$200-300/month** total infrastructure cost.

## Script generation works best with a hybrid approach

Pure LLM-based script generation provides natural, adaptive output but introduces consistency risks and higher costs at scale. Pure template-based approaches are fast and deterministic but sound mechanical. The hybrid strategy captures the best of both: templates handle **60-70%** of predictable transformations (headings → transitions, lists → enumerations), while LLMs naturalize complex content like code explanations.

**Cost analysis for 100 videos × 19 languages (1,900 generations/day):**

| Model | Daily Cost | Monthly Cost |
|-------|------------|--------------|
| GPT-4o | ~$67 | ~$2,000 |
| GPT-4o-mini | ~$5.74 | ~$172 |
| Claude Haiku | ~$2.85 | ~$86 |
| Gemini 2.5 Flash | ~$0.17 | ~$5 |

The formula: `(input_tokens × input_rate + output_tokens × output_rate) × 1900 / 1,000,000`. At ~2,000 input tokens and ~1,500 output tokens per generation, **GPT-4o-mini or Claude Haiku** delivers production-quality scripts at $100-200/month.

### Content verbalization rules that work

**Code blocks** should never be read literally. For short snippets (1-5 lines), describe each line conceptually: `def greet(name):` becomes "We define a function called greet that takes a name parameter." For longer code (15+ lines), summarize intent: "This code handles authentication—you can review the full implementation in your lesson materials."

**Operators require consistent pronunciation:**
- `==` → "is equal to" (not "equals equals")
- `===` → "strictly equals"
- `=>` → "arrow" or "goes to"
- `&&` → "and" (never "ampersand ampersand")

**CamelCase variables** split at capitals: `getUserName` → "get user name." **Acronyms** spell out: API → "A-P-I," URL → "U-R-L," but JSON → "jay-son" (pronounceable).

### Proven script generation prompt

```
You are an educational script writer for TTS-based video lessons.

Convert structured lesson content into natural speech.

RULES:
1. HEADINGS: Transform into spoken transitions
   - H1 → "In this lesson, we'll learn about [topic]"
   - H2 → "Now let's explore [topic]"

2. LISTS: 
   - Numbered: Use "First... Second... Third..."
   - Bulleted (3 or fewer): "including X, Y, and Z"
   - Bulleted (4+): "Let me walk you through these. First..."

3. CODE BLOCKS:
   - Under 5 lines: Describe what each line does conceptually
   - Over 5 lines: "This code does [X]. Review the full 
     implementation in your materials."

4. MATH: Use natural speech
   - x² → "x squared"
   - √x → "the square root of x"
   - fractions → "X over Y"

OUTPUT: Speech script only, no markdown.
```

### Slide boundary detection combines structure and duration

Research from MIT/edX (6.9M video sessions) shows **optimal engagement at 3-6 minute videos**, with per-slide duration of **45-60 seconds**. The algorithm:

1. **Mandatory breaks**: H1/H2 headings always start new slides
2. **Conditional breaks**: H3 if previous section exceeds 200 words
3. **Duration check**: Flag segments exceeding 90 seconds
4. **Semantic refinement**: Use sentence embeddings to detect topic shifts within flagged segments
5. **Validation**: Merge slides under 20 seconds, split those over 90 seconds

Target **100-150 words per slide** at 150 WPM speaking rate.

## Azure TTS delivers word-level timestamps across all 19 languages

Azure Cognitive Services TTS provides the critical capability your platform needs: **word-level timestamps for all target languages** via the `WordBoundary` event. This works with Azure Neural voices (not OpenAI TTS voices, which don't return timing data).

### SSML bookmarks enable precise slide synchronization

```xml
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" 
       xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="en-US">
    <voice name="en-US-AvaNeural">
        <bookmark mark="slide_1"/>Welcome to our course.
        <bookmark mark="slide_2"/>Let's begin with the basics.
    </voice>
</speak>
```

**Key limits:**
- Maximum **10 minutes** audio per real-time synthesis request
- Maximum **64KB** SSML message size (WebSocket)
- Timing precision: **100 nanoseconds** (divide `audioOffset` by 10,000 for milliseconds)
- No documented maximum on bookmarks per request

### TypeScript implementation for video synchronization

```typescript
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

interface SlideTimestamp {
    slideId: string;
    startMs: number;
}

interface WordTiming {
    word: string;
    startMs: number;
    durationMs: number;
}

class AzureTTSVideoGenerator {
    private speechConfig: sdk.SpeechConfig;
    private cumulativeOffset = 0;

    constructor(subscriptionKey: string, region: string) {
        this.speechConfig = sdk.SpeechConfig.fromSubscription(
            subscriptionKey, region
        );
        this.speechConfig.speechSynthesisOutputFormat = 
            sdk.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3;
        this.speechConfig.setProperty(
            sdk.PropertyId.SpeechServiceResponse_RequestSentenceBoundary,
            "true"
        );
    }

    async synthesizeWithTimings(ssml: string): Promise<{
        audio: ArrayBuffer;
        wordTimings: WordTiming[];
        slideTimings: SlideTimestamp[];
        durationMs: number;
    }> {
        const wordTimings: WordTiming[] = [];
        const slideTimings: SlideTimestamp[] = [];
        
        const synthesizer = new sdk.SpeechSynthesizer(
            this.speechConfig, undefined
        );

        synthesizer.wordBoundary = (s, e) => {
            wordTimings.push({
                word: e.text,
                startMs: this.cumulativeOffset + (e.audioOffset / 10000),
                durationMs: e.duration.totalMilliseconds
            });
        };

        synthesizer.bookmarkReached = (s, e) => {
            slideTimings.push({
                slideId: e.text,
                startMs: this.cumulativeOffset + (e.audioOffset / 10000)
            });
        };

        return new Promise((resolve, reject) => {
            synthesizer.speakSsmlAsync(ssml, result => {
                if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
                    const durationMs = result.audioDuration / 10000;
                    this.cumulativeOffset += durationMs;
                    resolve({
                        audio: result.audioData,
                        wordTimings,
                        slideTimings,
                        durationMs
                    });
                } else {
                    reject(new Error(`Synthesis failed: ${result.errorDetails}`));
                }
                synthesizer.close();
            }, reject);
        });
    }
}
```

### Chunking strategy for 30+ minute videos

For content exceeding the 10-minute limit, split at natural boundaries while tracking cumulative offsets:

```typescript
async processLongContent(
    slides: { id: string; text: string }[],
    voiceName: string,
    maxChunkWords = 1000  // ~8 minutes at 130 WPM
): Promise<ChunkResult[]> {
    const chunks: typeof slides[] = [];
    let currentChunk: typeof slides = [];
    let currentWordCount = 0;

    for (const slide of slides) {
        const slideWords = slide.text.split(/\s+/).length;
        if (currentWordCount + slideWords > maxChunkWords && 
            currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = [];
            currentWordCount = 0;
        }
        currentChunk.push(slide);
        currentWordCount += slideWords;
    }
    if (currentChunk.length > 0) chunks.push(currentChunk);

    this.cumulativeOffset = 0;  // Reset for new processing
    const results: ChunkResult[] = [];
    for (const chunk of chunks) {
        const ssml = this.buildSSMLWithBookmarks(chunk, voiceName);
        results.push(await this.synthesizeWithTimings(ssml));
    }
    return results;
}
```

**Alternative: Azure Batch Synthesis API** handles unlimited length with automatic word boundary JSON files—ideal for very long content with 50% completion in 10-20 seconds.

## Shiki + shiki-image is the optimal code visualization solution

For server-side code rendering at scale, **Shiki** (the VS Code syntax highlighting engine) combined with **shiki-image** delivers the best quality/performance ratio. At ~10ms per image, rendering 5,000 code frames daily takes under a minute.

| Library | Speed | Server-Side | Quality | Recommendation |
|---------|-------|-------------|---------|----------------|
| **shiki-image** | ~10ms | Native Node.js | VS Code-quality | **Best choice** |
| Shiki + Sharp | ~20-50ms | Native | Excellent | Good alternative |
| Puppeteer | ~500-2000ms | Browser required | Excellent | Only if needed |
| Carbon/Ray.so | Seconds | API/browser | Beautiful | Not for scale |

### Implementation with shiki-image

```typescript
import { codeToImage } from 'shiki-image';

const renderCodeFrame = async (code: string, lang: string) => {
    return codeToImage(code, {
        lang,
        theme: 'github-dark',
        format: 'png',
        width: 1920,
        height: 1080,
        style: { 
            fontSize: '28px',  // Minimum 24px for 1080p readability
            padding: '40px'
        }
    });
};

// Cache the highlighter instance globally for performance
```

**Resolution requirements**: Render at 1920×1080 minimum; consider 2x (3840×2160) then downscale for superior anti-aliasing. Use monospace fonts like **JetBrains Mono**, **Fira Code**, or **Geist Mono**.

## Remotion is the clear winner for animated code video

For the complete video generation pipeline, **Remotion** (React → video) decisively outperforms FFmpeg-based approaches for code animation. Remotion provides native React components, built-in animation helpers, and AWS Lambda support for distributed rendering.

**Why Remotion over FFmpeg:**
- **Development speed**: 1x vs 3-4x for equivalent FFmpeg scripts
- **Syntax highlighting**: Native via react-syntax-highlighter
- **Animation quality**: Spring physics, interpolation, CSS transitions
- **Scaling**: Lambda parallelization built-in
- **Cost**: ~$0.01-0.02 per render via Lambda

### Recommended stack: Remotion + Code Hike

[Code Hike](https://codehike.org) provides production-ready code animation components with automatic token transitions, diff animations, and annotation support:

```jsx
import { parseRoot, HighlightedCodeBlock } from 'code-hike/blocks';
import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion';

const STEP_FRAMES = 60;  // 2 seconds at 30fps

function CodeVideo({ steps }) {
    const frame = useCurrentFrame();
    
    return (
        <AbsoluteFill style={{ background: '#0D1117' }}>
            {steps.map((step, i) => (
                <Sequence 
                    key={i}
                    from={STEP_FRAMES * i} 
                    durationInFrames={STEP_FRAMES}
                >
                    <AnimatedCode code={step.code} />
                </Sequence>
            ))}
        </AbsoluteFill>
    );
}

// Typing effect implementation
function AnimatedCode({ code }) {
    const frame = useCurrentFrame();
    const typingSpeed = 3;  // frames per character
    const visibleLength = Math.floor(frame / typingSpeed);
    const displayCode = code.substring(0, visibleLength);
    
    return <SyntaxHighlighter code={displayCode} />;
}
```

### Animation techniques that engage learners

**Typing effect**: 2-3 frames per character (10-15 characters/second) with blinking cursor:
```jsx
const blinkOpacity = Math.sin(frame * 0.3) > 0 ? 1 : 0;
<span style={{ opacity: blinkOpacity }}>|</span>
```

**Line highlighting**: Current line gets full opacity, others dim to 0.5:
```jsx
const currentLine = Math.floor(frame / 60);
lines.map((line, i) => (
    <div style={{
        backgroundColor: i === currentLine ? 'rgba(255,255,0,0.2)' : 'transparent',
        opacity: i === currentLine ? 1 : 0.5
    }}>{line}</div>
))
```

**Motion Canvas** is a viable alternative for TypeScript-native development with built-in `Code` component and Lezer-based parsing, though it lacks Remotion's cloud infrastructure.

## Code timing formulas account for cognitive load

Code requires **more screen time than narration time** because readers parse syntax, trace logic, and parse unfamiliar variable names. Research shows programmers read code non-linearly, focusing on method signatures and control flow.

### Display duration formula

```
Display Time = max(2.0, Lines × 1.5 × Complexity + Narration Duration)

Where Complexity:
- 1.0: Variable declarations, single function calls
- 1.5: If/else, simple loops, 2-3 line functions  
- 2.0: Nested loops, callbacks, class definitions
- 2.5: Algorithms, async patterns, type annotations
```

| Code Type | Lines | Min Display | With Narration Buffer |
|-----------|-------|-------------|----------------------|
| Single statement | 1 | 2.0s | narration + 1.5s |
| Variable block | 2-3 | 3.0s | narration + 2.0s |
| Simple function | 3-5 | 4.0s | narration + 2.5s |
| Complex function | 6-10 | 7.0s | narration + 4.0s |

### Progressive reveal timing pattern

```
[0.0s] Code appears on screen (0.5s before narration)
[0.5s] Narration begins  
[X.Xs] Narration ends
[X.Xs + 2.0s] Code remains visible
[X.Xs + 2.0s] Transition to next code block
```

For line-by-line reveals: highlight each line **0.5s before** narrating it, persist **0.5s after** completing that line's narration.

## Multilingual code narration requires language-specific adjustments

Research from Leiden University found that non-native speakers naturally mix their native language with English keywords, adjust word order to match native grammar, and pronounce variables using native phonetics.

### SSML techniques for technical content

```xml
<!-- Spell out acronyms -->
<say-as interpret-as="characters">API</say-as>

<!-- Substitute operators -->
<sub alias="strictly equals">===</sub>
<sub alias="not equal to">!=</sub>
<sub alias="arrow">=></sub>

<!-- Add pauses for complex concepts -->
function add<break time="300ms"/>takes two parameters<break time="200ms"/>

<!-- Slow down for important concepts -->
<prosody rate="slow">This is critical for understanding</prosody>
```

### Language-specific timing multipliers

| Language | Pause Multiplier | Display Buffer | Notes |
|----------|-----------------|----------------|-------|
| English | 1.0x | +1.5s | Baseline |
| Spanish/French/German | 1.1x | +1.8s | Familiar with Latin code |
| Russian/Polish | 1.2x | +2.0s | Latin alphabet transition |
| Chinese/Japanese/Korean | 1.3x | +2.5s | Character-based scripts |
| Arabic | 1.3x | +2.5s | RTL/LTR switching overhead |
| Hindi/Bengali | 1.2x | +2.2s | Script separation |

For multilingual narration, use the `<lang>` tag to switch pronunciation contexts:
```xml
<speak xml:lang="ja-JP">
    <voice name="ja-JP-NanamiNeural">
        変数を定義します
        <lang xml:lang="en-US">let userName equals</lang>
        文字列の田中
    </voice>
</speak>
```

## WhisperX provides fallback forced alignment

When using non-Azure TTS or processing existing audio, **WhisperX** delivers word-level timestamps via phoneme-based alignment at 70x real-time speed. Default alignment models exist for en, fr, de, es, it, ja, zh, nl, uk, pt—covering most of your 19 target languages.

```python
import whisperx

audio = whisperx.load_audio("tutorial.wav")
model = whisperx.load_model("large-v2", device="cuda")
result = model.transcribe(audio, batch_size=16)

align_model, metadata = whisperx.load_align_model(
    language_code=result["language"], device="cuda"
)
aligned = whisperx.align(
    result["segments"], align_model, metadata, audio, 
    device="cuda", return_char_alignments=True
)

# Character-level timestamps for code synchronization
for segment in aligned["segments"]:
    for word in segment["words"]:
        print(f"{word['word']}: {word['start']:.2f}s - {word['end']:.2f}s")
```

Use WhisperX when you need character-level alignment for code, processing audio from multiple TTS providers, or adding timestamps to existing content. Use Azure native timing when latency is critical and you're exclusively using Azure TTS.

## Final architecture recommendation

```
┌─────────────────────────────────────────────────────────────┐
│                   VIDEO GENERATION PIPELINE                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Lesson JSON → Hybrid Script Generator (Templates + LLM)    │
│       ↓                                                     │
│  Script + SSML → Azure TTS (word-level timestamps)          │
│       ↓                                                     │
│  Code Blocks → Shiki/shiki-image (10ms per frame)           │
│       ↓                                                     │
│  Remotion + Code Hike → Animated video composition          │
│       ↓                                                     │
│  Lambda/RunPod → Distributed rendering at scale             │
│       ↓                                                     │
│  BullMQ → Job orchestration for 100+ videos/day             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Monthly cost estimate at 100 videos/day:**
- LLM script generation: $100-200 (GPT-4o-mini/Claude Haiku)
- Azure TTS: ~$50-100 (depending on video length)
- Remotion Lambda: ~$50-100 (at 100 renders/day)
- **Total: ~$200-400/month** for production-quality multilingual video generation