# Stage 6: Lesson Content Generation

**Purpose**: Generate full lesson content in parallel using BullMQ workers and a LangGraph state machine, with optional decision-aware document retrieval.

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
│   └── lesson-rag-retriever.ts # Compatibility re-export for lesson RAG
├── rag/
│   ├── evidence-loader.ts     # Current accepted run/decision loader
│   ├── evidence-context.ts    # Fail-closed accepted evidence projection
│   └── retriever.ts           # Grouped, tenant/course-scoped live retrieval
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
- **RAG Context**: Optional lesson-level retrieval, scoped to the current accepted evidence run and decisions when documents exist
- **Tier 1 shadow observability**: A disabled-by-default stable cohort can measure exit scores and saved Tier 2 results without changing generated context
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

- **Problem**: Some models (like DeepSeek V4 Flash) ignore ISO codes in RAG context
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
- current accepted document-evidence state loaded from the database when the
  course has an evidence snapshot; queued snapshots are not trusted for cache
  identity

## Output

- `LessonContent[]` with full markdown content, citations, quality scores (in specified language)

## Decision-aware document retrieval

The production path is `services/job-processor.ts` ->
`rag/evidence-loader.ts` -> `rag/retriever.ts`. Before retrieval, Stage 6 reloads
the course organization, exact accepted evidence run, source manifest, coverage
cards, immutable conflicts, and current append-only decisions. It rejects a
queued or caller-supplied scope that disagrees with current database truth.

The loader always validates the requested course/organization relationship
first. It loads durable evidence only when the shared gate is exactly
`DOCUMENT_EVIDENCE_ENABLED=true` plus `DOCUMENT_EVIDENCE_MODE=active`;
disabled/default/shadow configurations return no evidence context. The Stage 5
cohort percentage does not apply to Stage 6.

The accepted projection controls both planning and cache identity:

- only the selected material-conflict side is eligible; rejected sides remain
  excluded even when they share a document with an accepted side;
- `remove_document` excludes degraded/failed evidence, while
  `continue_limited` retains it under the recorded limitation;
- stale versions, unknown chunks, cross-tenant refs, non-terminal runs,
  incomplete degraded decisions, ambiguous legacy decisions, and custom
  conflict answers without a durable side handle fail closed;
- the cache key includes accepted run identity, sorted current decision IDs, and
  accepted source refs/version hashes, so a decision or source change cannot
  reuse stale context.

Every live Qdrant query filters both `organization_id` and `course_id`,
intersects lesson primary documents with the accepted allowlist, uses native
hybrid BM25/RRF plus Formula priority weighting, and sets
`group_by_document: true` with `group_size: 2`. Returned payloads are validated
again for tenant, course, document, version, and exact accepted chunk/ref scope
before prompt conversion.

Courses with no uploaded documents remain a first-class optional path and
return the existing empty RAG result. When uploaded documents make RAG required,
the existing bounded availability retry is used. An unavailable/incomplete
required retrieval, or any evidence scope violation, fails the course through
the existing required-RAG error path instead of silently generating
source-backed content from partial or fabricated context. A non-evidence
optional retrieval error may still continue without context.

### Tier 1 shadow measurement

`RAG_SHADOW_RETRIEVAL_RATE` accepts a decimal rate from `0` to `1` and fails closed to `0` when
absent or invalid. Selection is stable per course and lesson across worker retries. The default is
disabled; a non-zero production value is a separate live experiment and capacity decision.

Only a selected Tier 1 exit starts shadow work. It runs one raw dense probe per Tier 1 query at a
floor of `0`, then executes only the normal hybrid Tier 2 queries that the exit skipped. The active
empty result is returned immediately and never consumes shadow chunks. Query and trace failures
remain non-influential.

The content-free `tier1_shadow` trace records `tier1DenseMaxScore`, whether a dense score was
observed above the probe floor, the unique Tier 2 chunk count, a false-positive flag only for a
complete shadow run, the configured rate, and query-failure count. All shadow queries reuse the
active tenant, course, document allowlist, and evidence payload validation.

Lesson chunks carry bounded structured provenance: accepted run ID, relevant
decision IDs and exact/document-level source refs, plus total/overflow/hash
handles. Raw decision answers and unrelated evidence cards are not added to
queries, prompts, ordinary logs, or cache identity text.

Operational triage, rollout, and rollback are documented in
[`docs/operations/document-evidence.md`](../../../../../docs/operations/document-evidence.md).

## Mermaid Fix Pipeline (3-Layer Defense)

LLMs frequently generate invalid Mermaid syntax, especially escaped quotes (`\"`) that break rendering.
The pipeline implements a 3-layer defense:

### Layer 1: Prevention (Prompt Instructions)

Location: `src/shared/prompts/prompt-registry.ts`

LLM prompts include explicit instructions to avoid escaped quotes in Mermaid diagrams.

### Layer 2: Auto-Fix (5-Stage Pipeline)

Location: `utils/mermaid-fix-pipeline.ts`

Automatically fixes mermaid syntax through a 5-stage cascade (regex → validate → LLM fix → revalidate → fallback):

```typescript
import { runMermaidFixPipeline } from './utils/mermaid-fix-pipeline';

const result = await runMermaidFixPipeline(content);
// result.content - fixed content
// result.modified - whether any changes were made
// result.metrics.diagramsFixedRegex - diagrams fixed by regex
// result.metrics.diagramsFixedLLM - diagrams fixed by LLM
// result.metrics.diagramsFallback - diagrams that failed all fixes
```

Note: `sanitizeMermaidBlocks()` from `utils/mermaid-sanitizer.ts` is now internal to the pipeline (Stage 1).

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
    maxIterations: 3, // Maximum refinement iterations
    maxTokens: 15000, // Token budget
    timeoutMs: 300000, // 5 minute timeout
  },
  quality: {
    regressionTolerance: 0.05, // 5% regression tolerance
    sectionLockAfterEdits: 2, // Lock section after 2 edits
    convergenceThreshold: 0.02, // 2% improvement threshold
  },
};
```

### Severity Routing

| Severity                         | Action          | Description                   |
| -------------------------------- | --------------- | ----------------------------- |
| `CRITICAL` (Mermaid, truncation) | `REGENERATE`    | Cheap model self-regeneration |
| `COMPLEX` (factual, major)       | `FLAG_TO_JUDGE` | Full Judge evaluation         |
| `FIXABLE` (clarity, tone)        | `SURGICAL_EDIT` | Patcher applies targeted fix  |
| `INFO` (minor observations)      | Pass through    | No action needed              |

### Best-Effort Fallback

When max iterations reached without meeting threshold:

- Returns the iteration with **HIGHEST score** (not the original)
- Includes `improvementHints` extracted from unresolved issues
- Sets `qualityStatus`: 'good' | 'acceptable' | 'below_standard'

### Patcher Model

The Patcher uses the default fast model: `deepseek/deepseek-v4-flash`.
This keeps refinement latency low while maintaining quality.

## Test Coverage

Current Stage 6 unit coverage lives in `tests/unit/stages/stage6/`, with the
production job-processor cases under
`tests/unit/stages/stage6-lesson-content/services/`. Evidence-specific suites
cover the current-run loader/projection, live and cached chunk scope, grouped
retrieval, required-RAG failures, and job-processor wiring.

```bash
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/stages/stage6 \
  tests/unit/stages/stage6-lesson-content/services/job-processor.test.ts
```

## Related

- [Architecture](../../../../../docs/architecture/STAGE4-STAGE5-STAGE6-FINAL-ARCHITECTURE.md)
- [Document evidence operations](../../../../../docs/operations/document-evidence.md)
- [Self-hosted Qdrant operations](../../../../../docs/operations/qdrant-self-hosted.md)
- [LLM Judge Research](../../../../../docs/research/010-stage6-generation-strategy/)
- [Targeted Refinement Spec](../../../../../specs/018-judge-targeted-refinement/spec.md)
- [Technical Spec](../../../../../docs/specs/features/stage6-targeted-refinement-spec.md)
