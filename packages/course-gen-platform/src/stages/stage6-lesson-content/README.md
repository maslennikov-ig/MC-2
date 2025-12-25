# Stage 6: Lesson Content Generation

**Purpose**: Generate full lesson content in parallel using BullMQ workers and LangGraph state machine.

## Architecture

```
LessonSpecificationV2[] → BullMQ Workers (30 concurrent) → LangGraph Pipeline → LessonContent[]
```

### LangGraph Pipeline (per lesson)

```
Planner → Expander (parallel sections) → Assembler → Smoother → Judge
```

### Nodes

- **Planner**: Generates lesson outline from specification
- **Expander**: Expands each section with RAG context (5-10 chunks)
- **Assembler**: Combines sections into cohesive content
- **Smoother**: Refines transitions between sections
- **Judge**: Validates quality using CLEV voting (Phase 6.5)

## Directory Structure

```
stage6-lesson-content/
├── state.ts              # LessonGraphState definition
├── orchestrator.ts       # LangGraph StateGraph with nodes and edges
├── handler.ts            # BullMQ job handler (30 workers)
├── nodes/
│   ├── planner.ts        # Outline generation
│   ├── expander.ts       # Section expansion
│   ├── assembler.ts      # Content assembly
│   └── smoother.ts       # Transition refinement
├── utils/
│   ├── prompt-templates.ts    # Context-First XML prompts
│   ├── markdown-parser.ts     # Output parsing
│   └── lesson-rag-retriever.ts # Lesson-level RAG (5-10 chunks)
├── validators/
│   ├── content-validator.ts   # Quality score calculation
│   └── xss-sanitizer.ts       # DOMPurify integration
└── judge/                # Phase 6.5: LLM Judge
    ├── clev-voter.ts         # 2+1 voting orchestrator
    ├── cascade-evaluator.ts  # Single pass → voting for borderline
    ├── entropy-detector.ts   # Logprob entropy for hallucination
    ├── factual-verifier.ts   # RAG-based fact checking
    ├── fix-templates.ts      # Targeted fix prompts
    ├── decision-engine.ts    # Accept/fix/regenerate/escalate
    ├── heuristic-filter.ts   # Flesch-Kincaid, length checks
    └── prompt-cache.ts       # Judge rubric caching
```

## Key Features

- **Parallel Execution**: 30 concurrent BullMQ workers
- **Model Fallback**: Primary → fallback model on failure (configured via database)
- **Partial Success**: Save successful, mark failed for review
- **RAG Context**: Lesson-level retrieval (5-10 chunks per lesson)
- **Quality Gates**: 0.75 threshold with CLEV voting
- **XSS Protection**: DOMPurify sanitization (FR-024)
- **Generation Locks**: Redis-backed atomic locks prevent concurrent course generation (FR-037)
- **Cost Tracking**: Per-stage cost metrics with alerting ($0.50 warning, $1.00 critical)
- **Model Selection**: 80K token threshold for automatic model tier selection
- **Structured Logging**: FR-033 compliant logging with course_id, stage, metrics
- **Multilingual Content**: Explicit language handling across all pipeline nodes (19 languages supported)
- **Mermaid Fix Pipeline**: 3-layer defense against Mermaid syntax issues (see below)
- **Targeted Refinement**: Surgical fixes to specific sections instead of full regeneration
- **Best-Effort Fallback**: Returns highest-scoring iteration when max iterations reached

## Language Handling

Stage 6 implements explicit language handling to ensure content generation matches the course language.

### How It Works

**Language Flow**: Database → Router → BullMQ → Handler → Orchestrator → State → Nodes → Prompts

```
courses.language → lesson-content.ts router → LessonContentJobData
                 → handler.ts → orchestrator.ts → LessonGraphState
                 → all 4 nodes (planner, expander, assembler, smoother)
```

### Implementation Details

1. **Language Retrieval**: Retrieved from `courses.language` column (ISO 639-1 code: 'ru', 'en', 'zh', etc.)
2. **Fallback Behavior**: Defaults to English ('en') if language is NULL or invalid
3. **Full Language Names**: Converted to full names in prompts using `getLanguageName()` from `common-enums.ts`
   - Example: 'ru' → 'Russian', 'zh' → 'Chinese'
4. **Prompt Integration**: Each node includes explicit instruction:
   ```
   CRITICAL: Write ALL content in {LanguageName}. Every word must be in {LanguageName}.
   ```

### Supported Languages (19 total)

- **European**: Russian, English, Spanish, French, German, Italian, Polish
- **East Asian**: Chinese, Japanese, Korean
- **Southeast Asian**: Vietnamese, Thai, Indonesian, Malay
- **South Asian**: Hindi, Bengali
- **Middle Eastern**: Arabic, Turkish
- **Other**: Portuguese

See `packages/shared-types/src/common-enums.ts` for `LANGUAGE_NAMES` mapping.

### Why Full Names Instead of ISO Codes

- **Problem**: Some models (like DeepSeek V3.2) ignore ISO codes in RAG context
- **Solution**: Full language names in prompts provide stronger signal to LLMs
- **Benefit**: Works reliably across all models, including those that don't infer language from context

### Files Modified

- `packages/shared-types/src/bullmq-jobs.ts` - Added `language` to `LessonContentJobData`
- `packages/shared-types/src/common-enums.ts` - Added `LANGUAGE_NAMES` and `getLanguageName()`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/state.ts` - Added `language` to `LessonGraphState`
- `packages/course-gen-platform/src/stages/stage6-lesson-content/nodes/*.ts` - All 4 nodes updated with language parameter
- `packages/course-gen-platform/src/server/routers/lesson-content.ts` - Language retrieval from database

## Job Registration

Registered in main worker via `JobType.LESSON_CONTENT`:

```typescript
// packages/course-gen-platform/src/orchestrator/worker.ts
import { processStage6Job } from '../stages/stage6-lesson-content/handler';

const jobHandlers = {
  [JobType.LESSON_CONTENT]: { process: processStage6Job },
};
```

## Input

- `LessonSpecificationV2[]` from Stage 5
- `language` (ISO 639-1 code) from `courses.language`

## Output

- `LessonContent[]` with full markdown content, citations, quality scores (in specified language)

## Mermaid Fix Pipeline (3-Layer Defense)

LLMs frequently generate invalid Mermaid syntax, especially escaped quotes (`\"`) that break rendering.
The pipeline implements a 3-layer defense:

### Layer 1: Prevention (Prompt Instructions)

Location: `src/shared/prompts/prompt-registry.ts`

LLM prompts include explicit instructions to avoid escaped quotes in Mermaid diagrams.

### Layer 2: Auto-Fix (Sanitizer)

Location: `utils/mermaid-sanitizer.ts`

Automatically removes `\"` from Mermaid blocks after generation:

```typescript
import { sanitizeMermaidBlocks } from './utils/mermaid-sanitizer';

const result = sanitizeMermaidBlocks(content);
// result.content - sanitized content
// result.modified - whether changes were made
// result.fixes - details of fixes applied
```

### Layer 3: Detection (Heuristic Filter)

Location: `judge/heuristic-filter.ts` (`checkMermaidSyntax()`)

Detects remaining Mermaid issues and routes them appropriately:
- **CRITICAL severity** → triggers `REGENERATE` (cheap model self-regeneration)
- NOT sent to Judge (expensive models) - Judge is only for final quality validation

### Key Design Decision

Mermaid issues have `severity: CRITICAL` which triggers `REGENERATE` action, NOT `FLAG_TO_JUDGE`.
This avoids expensive Judge calls for easily fixable syntax issues.

## Targeted Refinement Cycle

The targeted refinement system applies surgical fixes to specific sections instead of full regeneration.

### Configuration

```typescript
REFINEMENT_CONFIG = {
  limits: {
    maxIterations: 3,      // Maximum refinement iterations
    maxTokens: 15000,      // Token budget
    timeoutMs: 300000,     // 5 minute timeout
  },
  quality: {
    regressionTolerance: 0.05,    // 5% regression tolerance
    sectionLockAfterEdits: 2,     // Lock section after 2 edits
    convergenceThreshold: 0.02,   // 2% improvement threshold
  },
}
```

### Severity Routing

| Severity | Action | Description |
|----------|--------|-------------|
| `CRITICAL` (Mermaid, truncation) | `REGENERATE` | Cheap model self-regeneration |
| `COMPLEX` (factual, major) | `FLAG_TO_JUDGE` | Full Judge evaluation |
| `FIXABLE` (clarity, tone) | `SURGICAL_EDIT` | Patcher applies targeted fix |
| `INFO` (minor observations) | Pass through | No action needed |

### Best-Effort Fallback

When max iterations reached without meeting threshold:
- Returns the iteration with **HIGHEST score** (not the original)
- Includes `improvementHints` extracted from unresolved issues
- Sets `qualityStatus`: 'good' | 'acceptable' | 'below_standard'

### Patcher Model

The Patcher uses a FREE model: `xiaomi/mimo-v2-flash:free`
This keeps refinement costs minimal while maintaining quality.

## Test Coverage

Stage 6 has comprehensive test coverage:

| Test Suite | Tests | Description |
|------------|-------|-------------|
| `mermaid-sanitizer.test.ts` | 20 | Mermaid sanitizer unit tests |
| `mermaid-fix-pipeline.e2e.test.ts` | 27 | E2E pipeline with real DB data |
| `targeted-refinement-cycle.e2e.test.ts` | 23 | Full refinement cycle E2E |
| Total Stage 6 | 262+ | All passing |

## Related

- [Architecture](../../../../../docs/architecture/STAGE4-STAGE5-STAGE6-FINAL-ARCHITECTURE.md)
- [LLM Judge Research](../../../../../docs/research/010-stage6-generation-strategy/)
- [Targeted Refinement Spec](../../../../../specs/018-judge-targeted-refinement/spec.md)
- [Technical Spec](../../../../../docs/specs/features/stage6-targeted-refinement-spec.md)
