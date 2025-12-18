# Stage 5: Generation

## Overview

Stage 5 generates the complete course structure including metadata, sections, and lesson skeletons. It implements a 5-phase LangGraph StateGraph workflow with hybrid model routing, quality validation, and cost optimization through parallel batch processing.

**Input:** `AnalysisResult` from Stage 4, frontend parameters, optional document summaries
**Output:** `CourseStructure` and `GenerationMetadata` stored in database

## Architecture

### Core Components

- **Orchestrator:** `orchestrator.ts` - LangGraph StateGraph with 5 generation phases
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
Phase 2: generate_metadata (RT-001 Hybrid Routing)
    |
    v
Phase 3: generate_sections (Parallel Batch Processing)
    |
    v
Phase 4: validate_quality (Embedding + LLM-as-Judge)
    |
    v
Phase 5: validate_lessons (Minimum 10 Lessons Check)
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
**Model:** Hybrid routing (qwen3-max + OSS 120B)

**Purpose:** Generate course-level metadata.

**RT-001 Hybrid Routing:**
- **Critical fields (qwen3-max):** learning_outcomes, pedagogical_strategy, prerequisites
- **Non-critical fields (OSS 120B):** course_description, course_tags, estimated_duration

**Output:**
- `course_title`: Course name
- `course_description`: Overview text
- `learning_outcomes[]`: What students will learn
- `prerequisites[]`: Required prior knowledge
- `difficulty_level`: "beginner" | "intermediate" | "advanced" | "expert"
- `estimated_duration_hours`: Total course time
- `course_tags[]`: Categorization tags

**Retry:** Max 3 attempts with exponential backoff.

---

### Phase 3: Generate Sections
**File:** `utils/section-batch-generator.ts`
**Model:** Tiered routing (OSS 120B primary)

**Purpose:** Generate all course sections with lessons.

**RT-001 Tiered Routing:**
- **Tier 1 (70-75%):** OSS 120B - Standard sections
- **Tier 2 (20-25%):** qwen3-max - Complex/critical sections (escalation)
- **Tier 3 (5%):** Gemini 2.5 Flash - Overflow (context >108K tokens)

**Parallel Processing (SC-003):**
- Batch size: 4 sections concurrent
- 2-second delay between batches (rate limiting)
- Target: <150s total generation time

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
**Model:** Jina-v3 embeddings (95%) + OSS 120B LLM-as-judge (5%)

**Purpose:** Validate generated content quality.

**Validation Method:**
1. **Metadata similarity:** Compare with analysis_result requirements
2. **Section similarity:** Compare each section with expected topics
3. **Overall score:** 40% metadata + 60% sections weighted average

**Threshold:** 0.75 minimum similarity

**Note:** Quality validation is **non-blocking** in Stage 5 (skeleton generation).
Full enforcement occurs in Stage 6 (lesson content generation).

---

### Phase 5: Validate Lessons
**File:** `phases/generation-phases.ts`
**Model:** None (count validation only)

**Purpose:** Enforce minimum lesson count (FR-015).

**Validation:**
- Total lessons across all sections >= 10
- **Blocking** - fails job if not met

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
6. `formatPedagogicalPatternsForPrompt(patterns)` - Formats pedagogical_patterns
7. `formatGenerationGuidanceForPrompt(guidance)` - Formats generation_guidance

**Usage Example:**
```typescript
import {
  getDifficultyFromAnalysis,
  formatCourseCategoryForPrompt,
  formatPedagogicalStrategyForPrompt,
} from './utils/analysis-formatters';

const difficulty = getDifficultyFromAnalysis(input.analysis_result);
const category = formatCourseCategoryForPrompt(input.analysis_result.course_category);
const strategy = formatPedagogicalStrategyForPrompt(input.analysis_result.pedagogical_strategy);

prompt += `
Difficulty: ${difficulty}
Category: ${category}

Pedagogical Strategy:
${strategy}
`;
```

---

## Input

```typescript
interface GenerationJobInput {
  course_id: string;              // UUID
  organization_id: string;        // UUID
  user_id: string;                // UUID
  analysis_result: AnalysisResult; // From Stage 4
  frontend_parameters: {
    course_title: string;
    language: string;             // ISO 639-1 code
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
    metadata: string;      // Model for Phase 2
    sections: string;      // Primary model for Phase 3
    validation?: string;   // Model for Phase 4 (if LLM-as-judge)
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
  batch_count: number;
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
- **OpenRouter API:** LLM completion (qwen3-max, OSS 120B, Gemini 2.5 Flash)
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

| Code | Description | Retry? |
|------|-------------|--------|
| `ORCHESTRATION_FAILED` | LangGraph workflow failure | Yes |
| `VALIDATION_FAILED` | Zod schema validation failure | Yes |
| `QUALITY_THRESHOLD_NOT_MET` | Quality < 0.75 | Yes |
| `MINIMUM_LESSONS_NOT_MET` | Lessons < 10 | Yes |
| `DATABASE_ERROR` | Supabase commit failure | Yes |
| `UNKNOWN` | Unexpected error | Yes |

### Retry Strategy (RT-004)

- Max 3 attempts per phase
- Exponential backoff: 1s, 2s, 4s
- Model escalation on repeated failures
- BullMQ automatic retry on job failure

### Status Updates (FR-024)

On failure:
1. `generation_status` updated to `'failed'`
2. Error logged with classification
3. Job re-thrown for BullMQ retry

---

## Configuration

### Environment Variables

```bash
# OpenRouter API
OPENROUTER_API_KEY=sk-or-...

# Model Selection
GENERATION_MODEL_PRIMARY=openai/gpt-oss-120b
GENERATION_MODEL_ESCALATION=alibaba/qwen3-max

# Quality Settings
QUALITY_THRESHOLD=0.75
MIN_LESSONS=10

# Performance
PARALLEL_BATCH_SIZE=4
BATCH_DELAY_MS=2000
```

### Model Routing Configuration

| Component | Model | Cost (1M tokens) |
|-----------|-------|------------------|
| Metadata (critical) | qwen3-max | $0.10 |
| Metadata (non-critical) | OSS 120B | $0.04 |
| Sections (primary) | OSS 120B | $0.04 |
| Sections (escalation) | qwen3-max | $0.10 |
| Sections (overflow) | Gemini 2.5 Flash | $0.10 |
| Validation | Jina-v3 | $0.02 |

---

## Testing

### Unit Tests
**Location:** `tests/unit/stages/stage5/`

**Coverage:**
- Metadata generation
- Section batch generation
- Quality validation scoring
- Lesson count validation
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
- Full 5-phase pipeline
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
3. `generation_status` = `'stage_5_complete'`
4. `generation_status` = `'finalizing'`
5. Final commit:
   - `course_structure` = sanitized structure
   - `generation_metadata` = metadata
   - `generation_status` = `'completed'`

---

## Cost Tracking

### Average Generation Costs

| Course Size | Sections | Lessons | Cost |
|-------------|----------|---------|------|
| Small | 4-5 | 15-20 | ~$0.15 |
| Medium | 6-8 | 25-35 | ~$0.25 |
| Large | 9-12 | 40-60 | ~$0.40 |

### Cost Breakdown

| Phase | % of Total |
|-------|------------|
| Metadata | 15-20% |
| Sections | 70-75% |
| Validation | 5-10% |

---

## Performance Targets

| Metric | Target | Actual |
|--------|--------|--------|
| Total generation time | <150s | ~90-120s |
| Sections per second | >0.5 | ~0.8-1.0 |
| Quality score | >0.75 | ~0.80-0.85 |
| First-pass success rate | >85% | ~90% |

---

## Stage Completion

On successful completion:
1. `CourseStructure` stored in `courses.course_structure`
2. `GenerationMetadata` stored in `courses.generation_metadata`
3. Course status updated to `'completed'`
4. Course ready for viewing/editing

---

## Related Documentation

- **Schema Unification**: `specs/008-generation-generation-json/dependencies/schema-unification/ARCHITECTURE-SUMMARY.md`
- **Migration Guide**: `docs/migrations/MIGRATION-unified-schemas.md`
- **Spec**: `docs/FUTURE/SPEC-2025-11-12-001-unify-stage4-stage5-schemas.md`

---

## Troubleshooting

### Common Issues

**1. Quality Below Threshold**
```
Warning: Quality below target (informational): overall similarity 0.72 < threshold 0.75
```
**Cause:** Generated content diverges from analysis requirements
**Note:** Non-blocking in Stage 5, informational only

**2. Minimum Lessons Not Met**
```
Error: Lesson count validation failed: only 8 lessons, minimum 10 required (FR-015)
```
**Cause:** Section generation produced insufficient lessons
**Resolution:** Job will retry with explicit minimum constraint

**3. Section Generation Timeout**
```
Error: Section generation timeout after 300s
```
**Cause:** Rate limiting or model unavailable
**Resolution:** Retry with smaller batch size

---

**Last Updated:** 2025-11-21
**Version:** 1.0.0
**Owner:** course-gen-platform team
