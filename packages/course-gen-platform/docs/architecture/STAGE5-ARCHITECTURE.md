# Stage 5 Architecture Documentation

**Last Updated**: 2025-11-19
**Version**: 1.0
**Status**: OFFICIAL

---

## Overview

Stage 5 (Structure Generation) implements a **5-phase LangGraph orchestration pipeline** for generating complete course structures with sections, lessons, and exercises.

**Key Features**:
- ✅ LangGraph StateGraph workflow (immutable state management)
- ✅ RT-001 tiered model routing (OSS 120B → qwen3-max → Gemini)
- ✅ RT-004 retry logic with exponential backoff
- ✅ Parallel batch processing (PARALLEL_BATCH_SIZE=4)
- ✅ Quality validation with Jina-v3 embeddings
- ✅ XSS sanitization with DOMPurify
- ✅ Cost calculation and token tracking

---

## Folder Structure

### Official Location

**Path**: `/packages/course-gen-platform/src/services/stage5/`

**Why This Location**:
- Co-locates all Stage 5 services (orchestrator, generators, validators, utilities)
- Follows "service layer" pattern (business logic layer)
- Used by BullMQ handler (`src/orchestrator/handlers/stage5-generation.ts`)

**Files** (15 total):

```
services/stage5/
├── generation-orchestrator.ts          ← LangGraph StateGraph orchestrator
├── generation-phases.ts                ← 5-phase node implementations
├── generation-state.ts                 ← LangGraph State Annotation
│
├── metadata-generator.ts               ← Phase 2: Course metadata generation
├── section-batch-generator.ts          ← Phase 3: Section batch generation
├── quality-validator.ts                ← Phase 4: Quality validation
│
├── cost-calculator.ts                  ← Token cost calculation ($USD)
├── json-repair.ts                      ← Layer 1 JSON auto-repair
├── field-name-fix.ts                   ← Field name normalization
├── sanitize-course-structure.ts        ← XSS sanitization (DOMPurify)
├── qdrant-search.ts                    ← RAG context retrieval
├── analysis-formatters.ts              ← Analysis result formatters
├── section-regeneration-service.ts     ← Section retry logic
│
└── *.example.ts                        ← Example/test files
```

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    BullMQ Job Queue                          │
│                 (STRUCTURE_GENERATION)                        │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│          Stage5GenerationHandler                             │
│      (src/orchestrator/handlers/stage5-generation.ts)        │
│                                                              │
│  1. Fetch course + analysis_result from DB                   │
│  2. Initialize GenerationOrchestrator                        │
│  3. Execute 5-phase workflow                                 │
│  4. Sanitize output (XSS)                                    │
│  5. Commit to DB (atomic JSONB update)                       │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│         GenerationOrchestrator                               │
│      (services/stage5/generation-orchestrator.ts)            │
│                                                              │
│  - Builds LangGraph StateGraph                               │
│  - Defines 5-phase linear workflow                           │
│  - Manages state transitions                                 │
│  - Aggregates final result                                   │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│           GenerationPhases                                   │
│        (services/stage5/generation-phases.ts)                │
│                                                              │
│  Phase 1: validateInput()     ← Schema validation           │
│  Phase 2: generateMetadata()  ← MetadataGenerator           │
│  Phase 3: generateSections()  ← SectionBatchGenerator       │
│  Phase 4: validateQuality()   ← QualityValidator            │
│  Phase 5: validateLessons()   ← FR-015 (min 10 lessons)     │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│                Service Layer                                 │
│                                                              │
│  MetadataGenerator          ← RT-001 hybrid routing         │
│  SectionBatchGenerator      ← Parallel batch processing     │
│  QualityValidator           ← Jina-v3 embeddings            │
│                                                              │
│  Utilities:                                                  │
│  - cost-calculator          ← OpenRouter pricing            │
│  - json-repair              ← Auto-repair malformed JSON     │
│  - sanitize-course-structure ← DOMPurify XSS protection     │
│  - qdrant-search            ← RAG context retrieval          │
└──────────────────────────────────────────────────────────────┘
```

---

## 5-Phase Workflow

### Phase 1: Input Validation
**File**: `generation-phases.ts` → `validateInput()`
**Purpose**: Validate `GenerationJobInput` schema
**Duration**: < 1ms
**Errors**: Throws if analysis_result or frontend_parameters missing

### Phase 2: Metadata Generation
**File**: `metadata-generator.ts`
**Model**: qwen3-max (critical) + OSS 120B (non-critical)
**Output**: `CourseMetadata` (title, description, learning_outcomes, etc.)
**Duration**: ~5-10s
**Retry**: Max 3 attempts with exponential backoff

### Phase 3: Section Batch Generation
**File**: `section-batch-generator.ts`
**Model**: OSS 120B (70-75%) → qwen3-max (20-25%) → Gemini (5%)
**Output**: `Section[]` with nested `Lesson[]` and `Exercise[]`
**Duration**: ~60-150s (depends on section count)
**Parallelization**: `PARALLEL_BATCH_SIZE=4` (4 sections concurrently)
**Rate Limiting**: 2-second delay between batches
**Retry**: Per-batch retry with model escalation

**Parallel Processing Logic**:
```typescript
const PARALLEL_BATCH_SIZE = 4;

for (let batchStart = 0; batchStart < totalSections; batchStart += PARALLEL_BATCH_SIZE) {
  const batchEnd = Math.min(batchStart + PARALLEL_BATCH_SIZE, totalSections);

  // Launch parallel section generations
  const batchPromises = [];
  for (let sectionIndex = batchStart; sectionIndex < batchEnd; sectionIndex++) {
    batchPromises.push(generator.generateBatch(sectionIndex, ...));
  }

  // Wait for all sections in this batch to complete
  const batchResults = await Promise.all(batchPromises);

  // Aggregate results
  allSections.push(...batchResults.flatMap(r => r.sections));

  // Rate limiting
  if (batchEnd < totalSections) {
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}
```

### Phase 4: Quality Validation
**File**: `quality-validator.ts`
**Model**: Jina-v3 embeddings (95%) + OSS 120B LLM-as-judge (5%)
**Threshold**: overall_similarity >= 0.75
**Duration**: ~3-5s
**Errors**: Throws if quality threshold not met

### Phase 5: Minimum Lessons Validation
**File**: `generation-phases.ts` → `validateLessons()`
**Rule**: Total lessons >= 10 (FR-015)
**Duration**: < 1ms
**Errors**: Throws if minimum lessons not met

---

## Import Patterns

### BullMQ Handler
```typescript
// ✅ CORRECT
import { GenerationOrchestrator } from '../../services/stage5/generation-orchestrator';
import { MetadataGenerator } from '../../services/stage5/metadata-generator';
import { SectionBatchGenerator } from '../../services/stage5/section-batch-generator';
import { QualityValidator } from '../../services/stage5/quality-validator';
```

### Service Layer
```typescript
// ✅ CORRECT
import { GenerationPhases } from './generation-phases';
import { sanitizeCourseStructure } from './sanitize-course-structure';
import { calculateGenerationCost } from './cost-calculator';
```

### ❌ INCORRECT (Old Duplicate Path - REMOVED)
```typescript
// ❌ DO NOT USE - This folder was deleted on 2025-11-19
import { GenerationOrchestrator } from '@/orchestrator/services/generation/generation-orchestrator';
```

---

## State Management

**File**: `generation-state.ts`

**Type**: LangGraph `Annotation.Root`

**Fields**:
```typescript
{
  // Input
  input: GenerationJobInput,

  // Outputs
  metadata: CourseMetadata | null,
  sections: Section[],

  // Quality tracking
  qualityScores: {
    metadata_similarity?: number,
    sections_similarity: number[],
    overall?: number
  },

  // Token tracking
  tokenUsage: {
    metadata: number,
    sections: number,
    validation: number,
    total: number
  },

  // Model tracking
  modelUsed: {
    metadata: string,
    sections: string,
    validation?: string
  },

  // Retry tracking
  retryCount: {
    metadata: number,
    sections: number[]
  },

  // Phase metadata
  currentPhase: 'validate_input' | 'generate_metadata' | ...,
  phaseDurations: { ... },
  errors: string[]
}
```

---

## Error Handling

### Error Classification
**File**: `stage5-generation.ts` → `classifyGenerationError()`

**Error Codes**:
- `ORCHESTRATION_FAILED`: LangGraph workflow execution failed
- `VALIDATION_FAILED`: Zod schema validation failed
- `QUALITY_THRESHOLD_NOT_MET`: Quality score < 0.75
- `MINIMUM_LESSONS_NOT_MET`: Total lessons < 10 (FR-015)
- `DATABASE_ERROR`: Supabase commit failed
- `UNKNOWN`: Unexpected error

### Retry Strategy (RT-004)
- **Max Attempts**: 3 per phase
- **Backoff**: Exponential (1s → 2s → 4s)
- **Model Escalation**: OSS 120B → qwen3-max → Gemini
- **Scope**: Per-phase (metadata) or per-batch (sections)

---

## Performance Specifications

### SC-003: Generation Time Target
**Spec**: < 150 seconds for standard courses (8 sections, 20-30 lessons)

**Breakdown**:
- Phase 1 (validation): < 1s
- Phase 2 (metadata): ~5-10s
- Phase 3 (sections): ~60-120s (with PARALLEL_BATCH_SIZE=4)
- Phase 4 (quality): ~3-5s
- Phase 5 (lessons): < 1s
- **Total**: ~70-140s ✅

**Optimization**: Parallel batch processing (4x speedup from sequential)

---

## Cost Tracking

**File**: `cost-calculator.ts`

**Pricing** (as of 2025-01-15):
- **qwen3-max**: $0.60 / 1M input, $2.00 / 1M output
- **OSS 120B**: $0.90 / 1M input, $0.90 / 1M output
- **Gemini 2.5 Flash**: $0.075 / 1M input, $0.30 / 1M output

**Calculation**:
```typescript
const metadata_cost = (input_tokens * $0.60 / 1M) + (output_tokens * $2.00 / 1M);
const sections_cost = (input_tokens * $0.90 / 1M) + (output_tokens * $0.90 / 1M);
const total_cost = metadata_cost + sections_cost + validation_cost;
```

---

## Security

### XSS Sanitization
**File**: `sanitize-course-structure.ts`

**Library**: DOMPurify (server-side with JSDOM)

**Sanitized Fields**:
- `course_title`, `course_description`
- `section.title`, `section.description`
- `lesson.title`, `lesson.content`
- `exercise.content`, `exercise.solution`

**Policy**: Strict (no HTML tags allowed, plain text only)

---

## Testing

### Integration Tests
**Path**: `tests/integration/stage5-generation.test.ts`

**Coverage**:
- [x] End-to-end 5-phase workflow
- [x] Parallel batch processing
- [x] Quality threshold enforcement
- [x] Minimum lessons validation
- [x] Cost calculation accuracy

### E2E Tests
**Path**: `tests/e2e/t053-synergy-sales-course.test.ts`

**Scenarios**:
- Full pipeline (Stage 2 → Stage 3 → Stage 4 → Stage 5)
- Real LLM integration (OpenRouter)
- Database commits (Supabase)
- Performance benchmarks (< 150s)

---

## Related Documentation

- **Spec**: `specs/008-generation-generation-json/spec.md`
- **Research Decisions**:
  - RT-001: Model routing strategy
  - RT-002: Generation architecture (5-phase workflow)
  - RT-004: Retry logic and error handling
- **Investigations**:
  - INV-2025-11-18-005: Stage 5 performance issue (parallel processing)
  - INV-2025-11-19-001: RT-006 validation failures (ZodEffects)
  - INV-2025-11-19-002: Architecture cleanup (duplicate folder removal)

---

## Migration Notes

### ⚠️ IMPORTANT: Duplicate Folder Removed

**Date**: 2025-11-19
**Removed Path**: `/src/orchestrator/services/generation/`

**Reason**: Abandoned refactoring attempt, never used by production code.

**Impact**: None (folder was unused)

**If You See Import Errors**: Update imports to use `/services/stage5/` instead.

---

## Contributing

### Adding New Generators

1. Create service in `/services/stage5/`
2. Inject into `GenerationPhases` constructor
3. Add phase node in `GenerationPhases` class
4. Update `GenerationOrchestrator.buildGraph()` to include new node
5. Add tests in `tests/integration/stage5-*.test.ts`

### Modifying Phase Logic

**Files to Update**:
- `generation-phases.ts` (phase implementation)
- `generation-state.ts` (if adding state fields)
- `generation-orchestrator.ts` (if adding edges)

**Don't Forget**:
- Update token tracking
- Update cost calculation
- Update retry logic (if applicable)
- Add integration tests

---

## Troubleshooting

### "Module not found: orchestrator/services/generation"
**Cause**: Using old import path (duplicate folder was removed)
**Fix**: Update imports to `/services/stage5/`

### "Quality threshold not met"
**Cause**: generated content too dissimilar from analysis_result
**Fix**: Check analysis_result quality, review prompt templates

### "Minimum lessons not met"
**Cause**: Total lessons < 10 (FR-015)
**Fix**: Adjust prompt to request more lessons per section

### Performance slower than spec
**Cause**: Sequential processing or rate limiting issues
**Fix**: Verify `PARALLEL_BATCH_SIZE=4` in `generation-phases.ts:349`

---

## Contact

**Maintainer**: MegaCampus Development Team
**Last Reviewed**: 2025-11-19
**Next Review**: 2025-12-19
