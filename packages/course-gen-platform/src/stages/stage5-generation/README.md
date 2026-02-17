# Stage 5: Generation

## Overview

Stage 5 generates the complete course structure including metadata, sections, and lesson skeletons. It implements a 4-phase LangGraph StateGraph workflow with hybrid model routing, sequential section generation with digest accumulation, and quality validation.

**Input:** `AnalysisResult` from Stage 4, frontend parameters, optional document summaries
**Output:** `CourseStructure` and `GenerationMetadata` stored in database

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
- Each section's digest grows as more sections are completed
- Retries for failed sections use `pLimit(2)` for parallel recovery

**Model Tiered Routing (RT-001):**

- **Complex tier** (`kimi-k2-thinking`): First section + sections with `importance: "complex"` (~55-180s each)
- **Normal tier** (`mimo-v2-flash`): Standard sections (~25s each)
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

**RAG Integration (Optional):**

- Uses `document_relevance_mapping` from Stage 4
- Queries only relevant documents per section (SMART mode)
- 45x cost savings vs full document queries

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

**Note:** Quality validation is **non-blocking** in Stage 5 (skeleton generation).
Full enforcement occurs in Stage 6 (lesson content generation).

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
  };
  retry_count: {
    metadata: number;
    sections: number[];
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

**Location:** `tests/unit/stages/stage5/`

**Coverage:**

- Metadata generation
- Section batch generation
- Quality validation scoring
- Cost calculation
- Analysis formatters (67 tests, 100% coverage)

**Run:**

```bash
pnpm test tests/unit/stages/stage5/
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

**Last Updated:** 2026-02-17
**Version:** 2.0.0
**Owner:** course-gen-platform team
