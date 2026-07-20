# Stage 5: Generation

## Overview

Stage 5 generates the complete course structure including metadata, sections, and lesson skeletons. It implements a 4-phase LangGraph StateGraph workflow with hybrid model routing, sequential section generation with digest accumulation, and quality validation. After that normal baseline passes its structural gate, an optional second pass may add bounded, decision-aware document evidence without replacing the baseline.

**Input:** `AnalysisResult` from Stage 4, frontend parameters, and optional compact document-evidence snapshot
**Output:** `CourseStructure` and `GenerationMetadata`, including an optional evidence-enrichment audit, stored in database

## Architecture

### Core Components

- **Orchestrator:** `orchestrator.ts` - LangGraph StateGraph with 4 generation phases
- **Handler:** `handler.ts` - BullMQ job handler with XSS sanitization
- **Phases:** `phases/generation-phases.ts` - Phase implementations
- **Utils:** Metadata generator, section batch generator, quality validator

### Phase Pipeline

```
GenerationJobInput
    |
    v
Phase 1: validate_input (Schema Validation)
    |
    v
Phase 2: generate_metadata (Thinking Model)
    |
    v
Phase 3: generate_sections (Sequential with Digest Accumulation)
    |
    v
Phase 4: validate_quality (Embedding + Overlap Detection)
    |
    v
Structural Gate (accepted baseline)
    |
    v
Advisory Document-Evidence Pass (optional, bounded, non-destructive)
    |
    v
CourseStructure -> courses.course_structure
GenerationMetadata -> courses.generation_metadata
```

---

## Phases

### Phase 1: Validate Input

**File:** `phases/generation-phases.ts`
**Model:** None (schema validation only)

**Purpose:** Validate job input against `GenerationJobInputSchema`.

**Checks:**

- Required fields present (course_id, organization_id, user_id)
- Analysis result structure valid
- Frontend parameters complete

**No retry needed** - deterministic validation.

---

### Phase 2: Generate Metadata

**File:** `utils/metadata-generator.ts`
**Model:** Configured via database (llm_model_config table)

**Purpose:** Generate course-level metadata.

**Model Selection:**

- Models configured via admin panel
- Supports tier-based routing for different field types

**Output:**

- `course_title`: Course name
- `course_description`: Overview text
- `learning_outcomes[]`: What students will learn
- `prerequisites[]`: Required prior knowledge
- `difficulty_level`: "beginner" | "intermediate" | "advanced" | "expert"
- `estimated_duration_hours`: Total course time
- `course_tags[]`: Categorization tags

**Retry:** Max 3 attempts with exponential backoff.

**Typical duration:** ~70s with thinking models (kimi-k2-thinking)

---

### Phase 3: Generate Sections

**File:** `utils/section-batch/section-batch-generator.ts`
**Model:** Configured via database (supports tiered routing)

**Purpose:** Generate all course sections with lessons.

**Sequential Processing with Digest Accumulation:**

Sections are generated **one-by-one in order** (not parallel). Each section receives
a digest of previously generated lessons (titles + topics) to prevent content overlap
at the concrete lesson level. This complements Stage 4's abstract-level anti-overlap.

- Sections generated sequentially: section 1, then section 2, etc.
- Each section uses its own Stage 4 `estimated_lessons` budget instead of a
  uniform `total_lessons / total_sections` split.
- Each section's digest grows as more sections are completed
- Retries for failed sections use `pLimit(2)` for parallel recovery

**Model Tiered Routing (RT-001):**

- **Complex tier** (`kimi-k2-thinking`): First section + sections with `importance: "complex"` (~55-180s each)
- **Normal tier** (`deepseek-v4-flash`): Standard sections (~25s each)
- Models configured via database `llm_model_config` table

**Timing Estimates (sequential):**

| Preset        | Sections | Worst Case | Typical |
| ------------- | -------- | ---------- | ------- |
| micro         | 1        | ~5 min     | ~2 min  |
| mini          | 3        | ~11 min    | ~5 min  |
| compact       | 5        | ~17 min    | ~8 min  |
| standard      | 8        | ~26 min    | ~12 min |
| comprehensive | 15       | ~47 min    | ~20 min |

**Output per Section:**

- `section_id`: Unique identifier
- `section_title`: Display name
- `section_description`: Overview
- `learning_objectives[]`: Section-specific objectives
- `lessons[]`: Lesson skeletons
  - `lesson_id`: Unique identifier
  - `lesson_title`: Display name
  - `lesson_description`: Brief overview
  - `lesson_type`: "theory" | "practice" | "quiz" | "project"
  - `estimated_duration_minutes`: Lesson time
  - `key_topics[]`: Topics covered

**Document evidence (optional):** the section generator first completes the
normal baseline. The production handler then injects
`createProductionStage5EvidenceEnricher()`, which reloads the accepted Stage 4
run and current append-only decisions before any section-level Qdrant query.

---

### Phase 4: Validate Quality

**File:** `phases/generation-phases.ts`
**Model:** Jina-v3 embeddings (primary) + LLM-as-judge from database (edge cases)

**Purpose:** Validate generated content quality + detect section overlap.

**Validation Method:**

1. **Metadata similarity:** Compare with analysis_result requirements
2. **Section similarity:** Compare each section with expected topics
3. **Overlap detection:** Cross-section lesson overlap check with targeted regeneration
4. **Overall score:** 40% metadata + 60% sections weighted average

**Threshold:** 0.75 minimum similarity

**Note:** Embedding/semantic quality validation remains non-blocking in Stage 5
(skeleton generation). Deterministic structural checks are blocking: hard lesson
cap violations, section-count profile violations, duplicate lesson titles,
objective overload, empty sections, and invalid senior-role beginner
classification are stored in `generation_metadata.quality_scores.structure` and
prevent Stage 6 progression. Stage 5 edit/regeneration and element mutation paths
recompute the same structure quality metadata after saving a changed
`course_structure`.

---

## Baseline-first advisory enrichment

The live path is `handler.ts` -> `GenerationOrchestrator.execute()` ->
`enrichBaselineWithDocumentEvidence()` under `evidence/`. It runs only after the
four normal phases and structural validation have produced the baseline.

The handler constructs the live evidence adapter only when both global values
are exact (`DOCUMENT_EVIDENCE_ENABLED=true` and
`DOCUMENT_EVIDENCE_MODE=active`) and the course is inside
`DOCUMENT_EVIDENCE_STAGE5_COHORT_PERCENT`. The cohort value must be an integer
from `0` through `100`; absent, malformed, fractional, negative, or out-of-range
values fail closed to `0`. `0` selects no course and `100` selects every course.
Intermediate values use the stable versioned SHA-256 course bucket in
`evidence/rollout.ts`, so changing the hash contract requires a new version.
Outside the cohort, Stage 5 runs the ordinary baseline pipeline without
constructing the evidence adapter.

Compatibility and precedence are strict:

- Inside the active cohort, a course without an accepted evidence snapshot
  returns the byte-identical baseline and records `not_applicable`. Outside the
  cohort, the ordinary baseline pipeline runs and adds no evidence audit.
- If retrieval finds no accepted relevant evidence, the byte-identical baseline
  is retained with `no_relevant_evidence`.
- User decisions and requirements outrank evidence. Rejected conflict sides,
  removed documents, unresolved degraded cards, stale decisions, stale source
  versions, and cross-tenant rows cannot enter queries or patches.
- Enrichment may append bounded, chunk-grounded advisory topics. It cannot
  delete or reorder sections/lessons, rename baseline content, change objectives
  or durations, remove required topic prefixes, or escape existing size and
  structural rules.

For each accepted section, retrieval uses hybrid Qdrant search with exact
`organization_id` and `course_id` filters, an accepted document allowlist,
`group_by_document: true`, and `group_size: 2`. Returned payloads must match the
accepted document, chunk, and source-version provenance. Source/claim bodies are
not written into ordinary logs or the compact audit record.

Candidate patches are revalidated. A destructive or structurally invalid patch
gets one bounded retry; the normal baseline is retained on exhaustion or
retrieval failure. The durable status is one of:

- `not_applicable` - no accepted document-evidence run;
- `applied` - at least one validated advisory addition was committed;
- `no_relevant_evidence` - no eligible grounded addition was found;
- `degraded` - fallback or validation loss occurred and the baseline was kept;
- `failed_open_with_decision` - the evidence pass failed but the accepted
  decision permits preserving the baseline.

`generation_metadata.document_evidence_enrichment` stores the accepted run and
sorted decision IDs, bounded section refs/search queries, patch/fallback counts,
and a deterministic provenance hash. The course update uses compare-and-swap
against the original analysis snapshot so a concurrent decision cannot be
overwritten.

Rollout and rollback controls, unresolved owner thresholds, and Qdrant recovery
checks are documented in
[`docs/operations/document-evidence.md`](../../../../../docs/operations/document-evidence.md).

---

## Helper Functions (T055 Schema Unification)

### analysis-formatters.ts

Helper functions to format nested AnalysisResult fields for LLM prompts.

**Why needed**: Stage 4 returns rich nested objects (course_category, contextual_language, etc.). These helpers format them into readable prompt text.

**Location**: `utils/analysis-formatters.ts`

**Functions:**

1. `getDifficultyFromAnalysis(analysis)` - Maps topic_analysis.target_audience to difficulty
2. `getCategoryFromAnalysis(analysis)` - Extracts and capitalizes course_category.primary
3. `formatCourseCategoryForPrompt(category)` - Formats category with confidence/reasoning
4. `formatContextualLanguageForPrompt(contextual, strategy?)` - Formats 6-field contextual object
5. `formatPedagogicalStrategyForPrompt(strategy)` - Formats 5-field strategy object
6. `formatGenerationGuidanceForPrompt(guidance)` - Formats generation_guidance

---

## Input

```typescript
interface GenerationJobInput {
  course_id: string; // UUID
  organization_id: string; // UUID
  user_id: string; // UUID
  analysis_result: AnalysisResult; // From Stage 4
  frontend_parameters: {
    course_title: string;
    language: string; // ISO 639-1 code
    user_instructions?: string;
  };
  document_summaries?: Array<{
    document_id: string;
    file_name: string;
    processed_content: string;
  }> | null;
  vectorized_documents?: boolean; // Enable RAG context
}
```

---

## Output

### CourseStructure

```typescript
interface CourseStructure {
  course_title: string;
  course_description: string;
  learning_outcomes: string[];
  prerequisites: string[];
  difficulty_level: DifficultyLevel;
  estimated_duration_hours: number;
  course_tags: string[];
  sections: Section[];
}
```

### GenerationMetadata

```typescript
interface GenerationMetadata {
  model_used: {
    metadata: string; // Model for Phase 2
    sections: string; // Primary model for Phase 3
    validation?: string; // Model for Phase 4 (if LLM-as-judge)
  };
  total_tokens: {
    metadata: number;
    sections: number;
    validation: number;
    total: number;
  };
  cost_usd: number;
  duration_ms: {
    metadata: number;
    sections: number;
    validation: number;
    total: number;
  };
  quality_scores: {
    metadata_similarity: number;
    sections_similarity: number[];
    overall: number;
    structure?: {
      passed: boolean;
      hasCriticalIssues: boolean;
      profileId: string;
      totalLessons: number;
      computedDurationHours: number;
      criticalIssues: Array<{ code: string; message: string }>;
      warnings: Array<{ code: string; message: string }>;
    };
  };
  retry_count: {
    metadata: number;
    sections: number[];
  };
  document_evidence_enrichment?: {
    schema_version: 'stage5-document-evidence-enrichment-v1';
    status:
      | 'not_applicable'
      | 'applied'
      | 'no_relevant_evidence'
      | 'degraded'
      | 'failed_open_with_decision';
    accepted_run_id: string | null;
    accepted_decision_ids: string[];
    section_evidence: Array<{
      section_number: number;
      search_queries: string[];
      evidence_refs: unknown[];
    }>;
    provenance_hash: string;
    attempted_patches: number;
    retrieved_ref_count: number;
    fallback_section_count: number;
  };
  created_at: string;
}
```

---

## Dependencies

### External Services

- **OpenRouter API:** LLM completion (models configured via database)
- **Jina Embeddings:** Quality validation (semantic similarity)
- **Qdrant:** Optional RAG context (vector similarity search)

### Internal Modules

- `shared/validation/quality-validator` - Embedding-based validation
- `shared/llm/cost-calculator` - Model-specific pricing
- `shared/qdrant/client` - Vector database client
- `shared/logger/` - Structured logging
- `shared/supabase/` - Database operations
- `utils/sanitize` - XSS sanitization (DOMPurify)

---

## Error Handling

### Error Classification

| Code                        | Description                   | Retry? |
| --------------------------- | ----------------------------- | ------ |
| `ORCHESTRATION_FAILED`      | LangGraph workflow failure    | Yes    |
| `VALIDATION_FAILED`         | Zod schema validation failure | Yes    |
| `QUALITY_THRESHOLD_NOT_MET` | Quality < 0.75                | Yes    |
| `DATABASE_ERROR`            | Supabase commit failure       | Yes    |
| `UNKNOWN`                   | Unexpected error              | Yes    |

### Retry Strategy (RT-004)

- Max 3 attempts per phase
- Exponential backoff: 1s, 2s, 4s
- Model escalation on repeated failures
- BullMQ automatic retry on job failure
- Failed section retries: `pLimit(2)` parallel recovery

### Status Updates (FR-024)

On failure:

1. `generation_status` updated to `'failed'`
2. Error logged with classification
3. Job re-thrown for BullMQ retry

---

## Configuration

### Timeouts

```
PROCESSOR_MAX_TTL_MS=2700000   # 45 min - max job runtime (env var override)
BullMQ lockDuration=2700000    # 45 min - must match processor TTL
Generation lock TTL=2700000    # 45 min - Redis lock for concurrent prevention
Lock heartbeat=120000          # 2 min - auto-extends lock during processing
```

**Why 45 minutes:** Sequential generation with thinking models (kimi-k2-thinking)
can take 55-180s per section. Comprehensive courses (15 sections) need ~47 min worst case.

### Environment Variables

```bash
# OpenRouter API
OPENROUTER_API_KEY=sk-or-...

# Quality Settings
QUALITY_THRESHOLD=0.75

# Timeout (optional override)
PROCESSOR_MAX_TTL_MS=2700000
```

### Model Configuration

All models are configured via database (`llm_model_config` table).
Admin panel allows per-phase model selection with fallback hierarchy:

1. Phase-specific config
2. Global default config
3. Hardcoded emergency fallback

---

## Testing

### Unit Tests

**Location:** `tests/unit/stages/stage5-generation/`

**Coverage:**

- Metadata generation
- Section batch generation
- Quality validation scoring
- Cost calculation
- Analysis formatters
- Baseline-first document-evidence enrichment and persistence

**Run:**

```bash
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/stages/stage5-generation
```

### Contract Tests

**Location:** `tests/contract/generation.test.ts`

### Integration Tests

**Location:** `tests/integration/`

**Scenarios:**

- Full 4-phase pipeline
- RAG integration
- Error recovery
- Quality threshold enforcement

**Test Fixture:** `tests/fixtures/analysis-result-fixture.ts` (centralized full schema)

**Run:**

```bash
pnpm test tests/integration/stage5-*
```

---

## XSS Sanitization (FR-008)

All LLM-generated content is sanitized before database storage:

**File:** `utils/sanitize.ts`

**Sanitized Fields:**

- `course_title`
- `course_description`
- `learning_outcomes[]`
- `section_title`, `section_description`
- `lesson_title`, `lesson_description`
- All text content in `CourseStructure`

**Method:** DOMPurify with strict configuration

- No HTML tags allowed
- Script injection prevention
- Unicode normalization

---

## Database Commit (FR-023)

Atomic multi-step status update:

1. `generation_status` = `'stage_5_init'`
2. `generation_status` = `'stage_5_generating'`
3. `generation_status` = `'stage_5_complete'` or `'stage_5_awaiting_approval'`

---

## Cost Tracking

### Average Generation Costs

| Course Size   | Sections | Lessons | Cost   |
| ------------- | -------- | ------- | ------ |
| Micro         | 1        | 1-5     | ~$0.02 |
| Mini          | 3        | 8-16    | ~$0.08 |
| Compact       | 5        | 15-30   | ~$0.15 |
| Standard      | 8        | 30-50   | ~$0.25 |
| Comprehensive | 15       | 60-100  | ~$0.45 |

### Cost Breakdown

| Phase      | % of Total |
| ---------- | ---------- |
| Metadata   | 15-20%     |
| Sections   | 70-75%     |
| Validation | 5-10%      |

---

## Performance Targets

| Metric                  | Target  | Notes                              |
| ----------------------- | ------- | ---------------------------------- |
| Standard course (8 sec) | <15 min | Mix of thinking + flash models     |
| Comprehensive (15 sec)  | <30 min | Sequential, mostly thinking models |
| Quality score           | >0.75   | Non-blocking, informational        |
| First-pass success rate | >85%    | Per-section                        |
| Processor TTL           | 45 min  | Hard kill timeout                  |

---

## Troubleshooting

### Common Issues

**1. Quality Below Threshold**

```
Warning: Quality below target (informational): overall similarity 0.72 < threshold 0.75
```

**Cause:** Generated content diverges from analysis requirements
**Note:** Non-blocking in Stage 5, informational only

**2. Processor TTL Exceeded**

```
Processor TTL exceeded - force killing worker thread
```

**Cause:** Sequential generation with thinking models exceeded 45-minute limit.
Typically happens with comprehensive courses (15+ sections) where most sections
use complex-tier thinking models.

**Resolution:**

- Increase `PROCESSOR_MAX_TTL_MS` env var
- Switch some sections to normal-tier (flash) models in admin panel
- Generation lock auto-expires via Redis TTL; retries work after expiry

**3. Generation Lock Conflict**

```
Course X is already being processed: Lock held by stage-5-Y
```

**Cause:** Previous job crashed/timed out and lock hasn't expired yet
**Resolution:** Lock expires automatically via Redis TTL (45 min).
For immediate fix: flush Redis lock key `generation:lock:{courseId}`

**4. RT-006 Validation Failed**

```
RT-006 validation failed: Maximum 5 learning objectives per lesson
```

**Cause:** LLM generated too many objectives
**Resolution:** Auto-retry with stricter prompt constraints

---

**Last Updated:** 2026-07-11
**Version:** 2.1.0
**Owner:** course-gen-platform team
