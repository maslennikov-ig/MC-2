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
- **Model Fallback**: Primary → fallback model on failure (RU: qwen3, EN: deepseek)
- **Partial Success**: Save successful, mark failed for review
- **RAG Context**: Lesson-level retrieval (5-10 chunks per lesson)
- **Quality Gates**: 0.75 threshold with CLEV voting
- **XSS Protection**: DOMPurify sanitization (FR-024)
- **Generation Locks**: Redis-backed atomic locks prevent concurrent course generation (FR-037)
- **Cost Tracking**: Per-stage cost metrics with alerting ($0.50 warning, $1.00 critical)
- **Model Selection**: 80K token threshold for automatic model tier selection
- **Structured Logging**: FR-033 compliant logging with course_id, stage, metrics
- **Multilingual Content**: Explicit language handling across all pipeline nodes (19 languages supported)

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

## Related

- [Architecture](../../../../../docs/architecture/STAGE4-STAGE5-STAGE6-FINAL-ARCHITECTURE.md)
- [LLM Judge Research](../../../../../docs/research/010-stage6-generation-strategy/)
