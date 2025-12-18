# UNIFIED SPECIFICATION: Stage 4/Stage 5 Schema Resolution & Enhancement

**Date Created**: 2025-11-11
**Last Updated**: 2025-11-11
**Status**: DRAFT
**Affects**: Stage 4 (Analysis), Stage 5 (Generation), all tests using analysis_result

**Related Investigations**:
- `INV-2025-11-11-002-regenerate-section-test-hang.md`
- `INV-2025-11-11-003-regenerate-section-validation-failures.md`

**Research References**:
- `specs/008-generation-generation-json/research-decisions/rt-002-architecture-balance.md`

---

## Table of Contents

### PART 1: CRITICAL - Transformation Layer (Production Blocker)
1. [Executive Summary](#executive-summary)
2. [Problem Analysis](#problem-analysis)
3. [Requirements](#requirements)
4. [Solution Design](#solution-design)
5. [Implementation Plan](#implementation-plan) (5-6 days)
6. [Testing Strategy](#testing-strategy)
7. [Acceptance Criteria](#acceptance-criteria)

### PART 2: ENHANCEMENT - Schema Improvements (Quality Optimization)
8. [Enhancement Overview](#part-2-enhancement---schema-improvements)
9. [Schema Enhancements Required](#schema-enhancements-required)
10. [Implementation Plan - Part 2](#implementation-plan---part-2) (2-3 days)
11. [Migration Strategy](#migration-strategy)

### Combined
12. [Combined Timeline & Dependencies](#combined-timeline--dependencies)
13. [References](#references)

---

# PART 1: CRITICAL - Transformation Layer

> **Priority**: 🔴 CRITICAL
> **Type**: Bugfix (production blocker)
> **Timeline**: 5-6 days
> **Prerequisite**: NONE - must be implemented FIRST

---

## Executive Summary

### Problem Statement

**Current State:** Stage 4 (Analysis) outputs a **FULL** `AnalysisResult` schema with complex nested objects, while Stage 5 (Generation) expects a **SIMPLIFIED** schema with flattened string/enum fields. **NO transformation layer exists** between the two stages, causing **production code to fail** when Stage 5 attempts to read Stage 4 output from the database.

**Impact:**
- ❌ **Production Blocker**: Stage 5 cannot process real Stage 4 output
- ❌ **Test Failures**: `tests/contract/generation.test.ts` failing (16/17 passing)
- ❌ **Schema Inconsistency**: Two schemas with same name `AnalysisResult` but different structures
- ❌ **Runtime Errors**: Missing fields (`category`, `difficulty`) cause validation failures
- ❌ **Type Mismatches**: Objects accessed as strings cause runtime crashes

**Root Cause:** Architectural gap between Stage 4 and Stage 5 due to MVP shortcuts documented in `docs/FUTURE/enhance-analyze-schema-for-generation.md`. The FUTURE enhancement planned schema improvements, but **did NOT address the immediate transformation layer requirement**.

**Severity:** 🔴 **CRITICAL** - Production deployment blocked

---

## Problem Analysis

### 1. Schema Mismatch Details

#### Stage 4 Output Schema (FULL)

**File:** `packages/shared-types/src/analysis-result.ts`
**Used By:** `packages/course-gen-platform/src/orchestrator/handlers/stage4-analysis.ts:220-228`

```typescript
export interface AnalysisResult {
  // Complex nested objects:
  course_category: {           // ← OBJECT
    primary: 'professional' | 'personal' | ...;
    confidence: number;        // 0-1
    reasoning: string;
    secondary?: string | null;
  };

  contextual_language: {        // ← OBJECT (6 fields)
    why_matters_context: string;
    motivators: string;
    experience_prompt: string;
    problem_statement_context: string;
    knowledge_bridge: string;
    practical_benefit_focus: string;
  };

  pedagogical_strategy: {       // ← OBJECT (5 fields)
    teaching_style: 'hands-on' | 'theory-first' | 'project-based' | 'mixed';
    assessment_approach: string;
    practical_focus: 'high' | 'medium' | 'low';
    progression_logic: string;
    interactivity_level: 'high' | 'medium' | 'low';
  };

  topic_analysis: {             // ← OBJECT (8 fields)
    determined_topic: string;
    information_completeness: number;
    complexity: 'narrow' | 'medium' | 'broad';
    reasoning: string;
    target_audience: 'beginner' | 'intermediate' | 'advanced' | 'mixed';
    missing_elements: string[] | null;
    key_concepts: string[];     // 3-10 items
    domain_keywords: string[];  // 5-15 items
  };

  // NO FIELDS: category, difficulty (as top-level strings)

  recommended_structure: {
    // ... section breakdown
  };
  // ... other fields
}
```

#### Stage 5 Input Schema (SIMPLIFIED)

**File:** `packages/shared-types/src/generation-job.ts:24-54`
**Used By:** `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts:655-658`

```typescript
export const AnalysisResultSchema = z.object({
  // Flattened string/enum fields:
  category: z.string(),                    // ← STRING (MISSING in Stage 4)
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),  // ← ENUM (MISSING in Stage 4)
  contextual_language: z.string(),         // ← STRING (Stage 4 has OBJECT)
  pedagogical_strategy: z.string(),        // ← STRING (Stage 4 has OBJECT)

  // Correctly present fields:
  determined_topic: z.string(),            // ✓ Exists in topic_analysis.determined_topic
  key_concepts: z.array(z.string()),       // ✓ Exists in topic_analysis.key_concepts

  recommended_structure: z.object({
    total_sections: z.number().int().positive(),
    total_lessons: z.number().int().min(10),
    sections_breakdown: z.array(z.object({
      area: z.string(),
      estimated_lessons: z.number().int().positive(),
    })),
  }),

  // Optional fields:
  expansion_areas: z.array(z.string()),
  research_flags: z.array(z.object({...})),
  content_approach: z.enum(['expand', 'create_from_scratch']),
});
```

### 2. Code Paths Affected

#### Production Code (Stage 5 reads from database)

**File:** `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts:653-658`

```typescript
if (input.analysis_result) {
  prompt += `**Analysis Context** (from Stage 4):
- Difficulty: ${input.analysis_result.difficulty}              // ❌ MISSING FIELD
- Category: ${input.analysis_result.category}                  // ❌ MISSING FIELD
- Pedagogical Strategy: ${input.analysis_result.pedagogical_strategy}  // ❌ WRONG TYPE (object, not string)
- Topic: ${input.analysis_result.determined_topic}             // ❌ MISSING (nested in topic_analysis)
`;
}
```

**File:** `packages/course-gen-platform/src/services/stage5/metadata-generator.ts:312-315`

```typescript
const analysis = input.analysis_result!;
prompt += `**Analysis Context** (from Stage 4 Analyze):
- Category: ${analysis.category}                    // ❌ MISSING FIELD
- Difficulty: ${analysis.difficulty}                // ❌ MISSING FIELD
- Pedagogical Strategy: ${analysis.pedagogical_strategy}  // ❌ WRONG TYPE
```

**File:** `packages/course-gen-platform/src/services/stage5/generation-phases.ts:725`

```typescript
parts.push(input.analysis_result.pedagogical_strategy);  // ❌ WRONG TYPE (object, not string)
```

#### Test Code (test fixtures use Stage 4 schema)

**File:** `packages/course-gen-platform/tests/contract/generation.test.ts:64-94`

```typescript
function createMinimalAnalysisResult(title: string) {
  return {
    course_category: { primary: 'professional', ... },  // ← Stage 4 FULL schema
    contextual_language: { why_matters_context: '...', ... },  // ← 6 fields
    pedagogical_strategy: { teaching_style: 'hands-on', ... },  // ← 5 fields
    // ❌ MISSING: category, difficulty (top-level strings required by Stage 5)
  };
}
```

**Usage in tests:** 15 test files use `analysis_result` (unit, contract, integration, e2e)

### 3. Missing Transformation Layer

**Expected Location:**
- Option A: In Phase 5 Assembly (`phase-5-assembly.ts`) before saving to database
- Option B: In Stage 5 handler (`stage5-generation.ts`) when reading from database
- Option C: In shared utilities (`@megacampus/shared-types`)

**Current Reality:** ❌ **NO transformation layer exists anywhere**

**Evidence:**

**Phase 5 Assembly** (`packages/course-gen-platform/src/orchestrator/services/analysis/phase-5-assembly.ts:228-263`):
```typescript
const result: AnalysisResult = {
  // From Phase 1: Classification and contextual language
  course_category: input.phase1_output.course_category,  // ← Saves FULL object
  contextual_language: sanitizedContextualLanguage,       // ← Saves FULL object (6 fields)
  pedagogical_strategy: input.phase3_output.pedagogical_strategy,  // ← Saves FULL object (5 fields)
  // NO TRANSFORMATION - just assembly
};
```

**Comment in code (line 273-277):**
```typescript
// NOTE: Language Preservation (FR-004)
// - The user's target language (input.language) is NOT stored in AnalysisResult
// - Stage 5 (Generation) will read courses.language directly from the database
// - This avoids duplication and ensures single source of truth for language settings
// - All analysis output is in English (enforced in Phases 1-4)
```

**Key Quote:** `"Preserve all phase outputs without modification (except sanitization)"`

---

## Requirements

### Functional Requirements

**FR-1: Transformation Layer**
- **MUST** transform Stage 4 FULL schema → Stage 5 SIMPLIFIED schema
- **MUST** extract `category` from `course_category.primary`
- **MUST** extract `difficulty` from `topic_analysis.target_audience`
- **MUST** flatten `contextual_language` object → single string (concatenate fields)
- **MUST** flatten `pedagogical_strategy` object → single string (serialize or pick teaching_style)
- **MUST** flatten `topic_analysis.determined_topic` → top-level field

**FR-2: Backward Compatibility**
- **MUST** preserve FULL schema in `courses.analysis_result` (database JSONB)
- **MUST** create SIMPLIFIED schema only for Stage 5 input validation
- **MUST** allow existing Stage 4 workflows to continue unchanged
- **MUST** NOT break existing tests that use FULL schema for database storage

**FR-3: Data Preservation**
- **MUST NOT** lose information during transformation (reversible if needed)
- **MUST** maintain semantic accuracy (e.g., `contextual_language` string accurately represents 6 fields)
- **SHOULD** include transformation metadata (version, timestamp)

**FR-4: Validation**
- **MUST** validate FULL schema at Stage 4 output (current behavior)
- **MUST** validate SIMPLIFIED schema at Stage 5 input
- **MUST** provide clear error messages if transformation fails

### Non-Functional Requirements

**NFR-1: Performance**
- Transformation **MUST** complete in <100ms (avoid blocking Stage 5 job processing)
- Transformation **SHOULD NOT** increase memory usage beyond 10MB per job

**NFR-2: Testing**
- **MUST** have unit tests for transformation logic (100% coverage)
- **MUST** have integration tests for Stage 4 → Stage 5 pipeline
- **MUST** re-run ALL existing tests after implementation (17 contract, 50+ unit, 30+ integration)

**NFR-3: Documentation**
- **MUST** document transformation rules in code comments
- **MUST** update schema documentation (`data-model.md`)
- **SHOULD** create migration guide for developers

**NFR-4: Monitoring**
- **SHOULD** log transformation metrics (success rate, errors)
- **SHOULD** alert if transformation failure rate >1%

---

## Solution Design

### Approach: Transformation Layer in Stage 5 Handler

**Decision:** Add transformation layer in Stage 5 handler (`stage5-generation.ts`) **AFTER** reading from database, **BEFORE** passing to Generation workflow.

**Rationale:**
1. ✅ **Preserves Stage 4 behavior** - No changes to Stage 4 output
2. ✅ **Minimal surface area** - Only one entry point (Stage 5 handler)
3. ✅ **Clear responsibility** - Stage 5 "adapts" to Stage 4 output
4. ✅ **Easier rollback** - Can disable transformation without touching Stage 4
5. ✅ **Backward compatible** - FULL schema stays in database

**Alternative Considered (Rejected):**
- ❌ **Transform in Phase 5 Assembly** - Would break backward compatibility (old Stage 5 code expects FULL schema in DB)
- ❌ **Transform in shared types** - Too early, prevents using FULL schema in other contexts (e.g., analytics, reports)

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│ Stage 4: Analysis                                                     │
├──────────────────────────────────────────────────────────────────────┤
│ Phase 1-4 → Phase 5 Assembly                                         │
│  ↓                                                                    │
│ AnalysisResult (FULL schema)                                         │
│  - course_category: {...}                                            │
│  - contextual_language: {...}                                        │
│  - pedagogical_strategy: {...}                                       │
│  - topic_analysis: {...}                                             │
│  ↓                                                                    │
│ Save to courses.analysis_result (JSONB) ✅ NO CHANGES                │
└──────────────────────────────────────────────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────────────┐
│ DATABASE: courses.analysis_result (JSONB)                            │
│  - Stores FULL schema (backward compatible)                          │
└──────────────────────────────────────────────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────────────┐
│ Stage 5: Generation Handler                                          │
├──────────────────────────────────────────────────────────────────────┤
│ 1. Read from database (FULL schema)                                  │
│ 2. **NEW** Transform to SIMPLIFIED schema                            │
│     ↓                                                                 │
│    transformAnalysisForGeneration()                                  │
│     - Extract category from course_category.primary                  │
│     - Extract difficulty from topic_analysis.target_audience         │
│     - Flatten contextual_language (6 fields → 1 string)              │
│     - Flatten pedagogical_strategy (5 fields → 1 string)             │
│     - Extract determined_topic from topic_analysis                   │
│     - Extract key_concepts from topic_analysis                       │
│     ↓                                                                 │
│ 3. Validate with AnalysisResultSchema (Zod)                          │
│ 4. Pass to Generation workflow                                       │
└──────────────────────────────────────────────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────────────┐
│ Generation Workflow (5 phases)                                       │
│  - Receives SIMPLIFIED schema (as expected)                          │
│  - No changes needed ✅                                              │
└──────────────────────────────────────────────────────────────────────┘
```

### Transformation Rules

**File:** `packages/course-gen-platform/src/services/stage5/transform-analysis-for-generation.ts` (NEW)

```typescript
/**
 * Transform Stage 4 FULL AnalysisResult schema → Stage 5 SIMPLIFIED schema
 *
 * This transformation bridges the architectural gap between Stage 4 and Stage 5.
 * Stage 4 outputs rich nested objects for analytics and future enhancements,
 * while Stage 5 requires flattened strings for LLM prompt construction.
 *
 * Transformation Rules:
 * 1. category ← course_category.primary
 * 2. difficulty ← topic_analysis.target_audience
 * 3. contextual_language ← concatenate all 6 contextual_language fields
 * 4. pedagogical_strategy ← serialize pedagogical_strategy object
 * 5. determined_topic ← topic_analysis.determined_topic
 * 6. key_concepts ← topic_analysis.key_concepts
 *
 * @param fullSchema - FULL AnalysisResult from Stage 4 (from database)
 * @returns SIMPLIFIED AnalysisResult for Stage 5 (for Generation workflow)
 */
export function transformAnalysisForGeneration(
  fullSchema: AnalysisResultFull
): AnalysisResultSimplified {
  // Rule 1: Extract category from course_category.primary
  const category = fullSchema.course_category.primary;

  // Rule 2: Map difficulty from topic_analysis.target_audience
  const difficultyMap = {
    'beginner': 'beginner' as const,
    'intermediate': 'intermediate' as const,
    'advanced': 'advanced' as const,
    'mixed': 'intermediate' as const,  // Default mixed to intermediate
  };
  const difficulty = difficultyMap[fullSchema.topic_analysis.target_audience];

  // Rule 3: Flatten contextual_language (6 fields → 1 string)
  // Strategy: Concatenate with clear structure for LLM readability
  const contextual_language = [
    `Why it matters: ${fullSchema.contextual_language.why_matters_context}`,
    `Motivators: ${fullSchema.contextual_language.motivators}`,
    `Experience: ${fullSchema.contextual_language.experience_prompt}`,
    `Problem context: ${fullSchema.contextual_language.problem_statement_context}`,
    `Knowledge bridge: ${fullSchema.contextual_language.knowledge_bridge}`,
    `Practical benefits: ${fullSchema.contextual_language.practical_benefit_focus}`,
  ].join('\n\n');

  // Rule 4: Flatten pedagogical_strategy (5 fields → 1 string)
  // Strategy: Serialize as structured text for LLM readability
  const pedagogical_strategy = [
    `Teaching Style: ${fullSchema.pedagogical_strategy.teaching_style}`,
    `Assessment: ${fullSchema.pedagogical_strategy.assessment_approach}`,
    `Practical Focus: ${fullSchema.pedagogical_strategy.practical_focus}`,
    `Progression: ${fullSchema.pedagogical_strategy.progression_logic}`,
    `Interactivity: ${fullSchema.pedagogical_strategy.interactivity_level}`,
  ].join(' | ');

  // Rule 5: Extract determined_topic from nested topic_analysis
  const determined_topic = fullSchema.topic_analysis.determined_topic;

  // Rule 6: Extract key_concepts from nested topic_analysis
  const key_concepts = fullSchema.topic_analysis.key_concepts;

  // Rule 7: Extract expansion_areas (flatten if needed)
  const expansion_areas = fullSchema.expansion_areas?.map(area =>
    typeof area === 'string' ? area : area.area
  ) || [];

  // Rule 8: Extract research_flags (preserve structure)
  const research_flags = fullSchema.research_flags || [];

  // Rule 9: Extract content_approach (default if missing)
  const content_approach = fullSchema.content_strategy || 'create_from_scratch';

  // Assemble simplified schema
  return {
    category,
    difficulty,
    contextual_language,
    pedagogical_strategy,
    determined_topic,
    key_concepts,
    recommended_structure: fullSchema.recommended_structure,
    expansion_areas,
    research_flags,
    content_approach,
    // Metadata: Track transformation
    _transformation_metadata: {
      source_schema_version: fullSchema.metadata.analysis_version,
      transformed_at: new Date().toISOString(),
      transformation_version: '1.0.0',
    },
  };
}
```

### Integration Points

**File:** `packages/course-gen-platform/src/orchestrator/handlers/stage5-generation.ts:250-350`

**Current Code:**
```typescript
async execute(
  jobData: GenerationJobData,
  job: Job<GenerationJobData>
): Promise<StructureGenerationJobResult> {
  // Step 1: Read from database
  const { data: courseData } = await supabaseAdmin
    .from('courses')
    .select('analysis_result, course_structure, ...')
    .eq('id', jobData.input.course_id)
    .single();

  const analysisResult = courseData.analysis_result as AnalysisResult | null;  // ← FULL schema

  // Step 2: Pass to Generation workflow
  const result = await orchestrator.execute({
    ...jobData.input,
    analysis_result: analysisResult,  // ← Expects SIMPLIFIED schema
  });
}
```

**Modified Code:**
```typescript
import { transformAnalysisForGeneration } from '../../services/stage5/transform-analysis-for-generation';
import type { AnalysisResultFull } from '@megacampus/shared-types/analysis-result';
import type { AnalysisResultSimplified } from '@megacampus/shared-types/generation-job';

async execute(
  jobData: GenerationJobData,
  job: Job<GenerationJobData>
): Promise<StructureGenerationJobResult> {
  // Step 1: Read from database (FULL schema)
  const { data: courseData } = await supabaseAdmin
    .from('courses')
    .select('analysis_result, course_structure, ...')
    .eq('id', jobData.input.course_id)
    .single();

  const analysisResultFull = courseData.analysis_result as AnalysisResultFull | null;

  // Step 2: Transform to SIMPLIFIED schema (NEW)
  let analysisResultSimplified: AnalysisResultSimplified | null = null;
  if (analysisResultFull) {
    try {
      analysisResultSimplified = transformAnalysisForGeneration(analysisResultFull);

      // Log transformation success
      jobLogger.info(
        {
          transformation_version: analysisResultSimplified._transformation_metadata.transformation_version,
          source_version: analysisResultFull.metadata.analysis_version,
        },
        'Analysis schema transformed successfully'
      );
    } catch (error) {
      jobLogger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Failed to transform analysis schema'
      );
      throw new Error(`Schema transformation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Step 3: Validate with AnalysisResultSchema (Zod)
  if (analysisResultSimplified) {
    const validation = AnalysisResultSchema.safeParse(analysisResultSimplified);
    if (!validation.success) {
      jobLogger.error(
        {
          errors: validation.error.errors,
        },
        'Transformed schema failed validation'
      );
      throw new Error(`Transformed schema validation failed: ${JSON.stringify(validation.error.errors)}`);
    }
  }

  // Step 4: Pass to Generation workflow (SIMPLIFIED schema)
  const result = await orchestrator.execute({
    ...jobData.input,
    analysis_result: analysisResultSimplified,
  });
}
```

---

## Implementation Plan

### Phase 1: Transformation Layer (Days 1-2)

**Tasks:**
1. ✅ Create `transform-analysis-for-generation.ts` utility
2. ✅ Implement 9 transformation rules
3. ✅ Add transformation metadata tracking
4. ✅ Write unit tests (100% coverage)
   - Test each transformation rule independently
   - Test error handling (malformed input)
   - Test backward compatibility (nullable fields)
5. ✅ Update `stage5-generation.ts` handler to use transformation
6. ✅ Add transformation logging (success/failure metrics)

**Files to Create:**
- `packages/course-gen-platform/src/services/stage5/transform-analysis-for-generation.ts` (NEW)
- `packages/course-gen-platform/tests/unit/stage5/transform-analysis-for-generation.test.ts` (NEW)

**Files to Modify:**
- `packages/course-gen-platform/src/orchestrator/handlers/stage5-generation.ts` (add transformation call)

**Estimated Effort:** 1-2 days

### Phase 2: Test Fixtures (Day 3)

**Tasks:**
1. ✅ Update test fixtures to use SIMPLIFIED schema
2. ✅ Update `createMinimalAnalysisResult()` in contract tests
3. ✅ Update all 15 test files that use `analysis_result`
4. ✅ Ensure backward compatibility (tests using FULL schema for DB storage still work)

**Files to Modify:**
- `packages/course-gen-platform/tests/contract/generation.test.ts` (primary file)
- `packages/course-gen-platform/tests/unit/stage5/metadata-generator.test.ts`
- `packages/course-gen-platform/tests/unit/stage5/section-batch-generator.test.ts`
- 12 other test files (update as needed)

**Estimated Effort:** 1 day

### Phase 3: Regression Testing (Day 4)

**Tasks:**
1. ✅ Run ALL existing tests (unit, contract, integration, e2e)
   - `pnpm test` (unit tests)
   - `pnpm test:contract` (contract tests - 17 tests)
   - `pnpm test:integration` (integration tests - 30+ tests)
2. ✅ Fix any regressions
3. ✅ Verify 100% test pass rate
4. ✅ Run type-check (`pnpm type-check`)
5. ✅ Run lint (`pnpm lint`)

**Success Criteria:**
- ✅ All unit tests pass
- ✅ All contract tests pass (17/17)
- ✅ All integration tests pass
- ✅ No type errors
- ✅ No lint errors

**Estimated Effort:** 1 day

### Phase 4: Documentation (Day 5)

**Tasks:**
1. ✅ Update `docs/008-generation-generation-json/data-model.md`
   - Document FULL vs SIMPLIFIED schemas
   - Document transformation rules
2. ✅ Update `docs/FUTURE/enhance-analyze-schema-for-generation.md`
   - Mark transformation layer as IMPLEMENTED
   - Update migration strategy section
3. ✅ Add code comments to transformation logic
4. ✅ Create migration guide for developers (`docs/migrations/MIGRATION-stage4-stage5-schema.md`)

**Files to Create:**
- `docs/migrations/MIGRATION-stage4-stage5-schema.md` (NEW)

**Files to Modify:**
- `docs/008-generation-generation-json/data-model.md`
- `docs/FUTURE/enhance-analyze-schema-for-generation.md`

**Estimated Effort:** 0.5 days

### Phase 5: Monitoring & Deployment (Day 6)

**Tasks:**
1. ✅ Add transformation metrics logging
2. ✅ Add error alerting (if failure rate >1%)
3. ✅ Deploy to staging environment
4. ✅ Run smoke tests on staging
5. ✅ Deploy to production
6. ✅ Monitor transformation success rate for 24h

**Deployment Steps:**
1. Run `/push minor` (version bump to 0.17.0 due to new feature)
2. Deploy to staging
3. Verify staging tests pass
4. Deploy to production
5. Monitor logs for 24 hours

**Rollback Plan:** If transformation failure rate >5%, rollback to previous version (transformation is opt-in via handler, Stage 4 unchanged)

**Estimated Effort:** 0.5 days

---

## Testing Strategy

### Unit Tests (NEW)

**File:** `packages/course-gen-platform/tests/unit/stage5/transform-analysis-for-generation.test.ts`

**Test Cases:**
1. ✅ **Rule 1:** Extract `category` from `course_category.primary`
2. ✅ **Rule 2:** Map `difficulty` from `topic_analysis.target_audience`
3. ✅ **Rule 3:** Flatten `contextual_language` (6 fields → 1 string)
4. ✅ **Rule 4:** Flatten `pedagogical_strategy` (5 fields → 1 string)
5. ✅ **Rule 5:** Extract `determined_topic` from `topic_analysis`
6. ✅ **Rule 6:** Extract `key_concepts` from `topic_analysis`
7. ✅ **Rule 7:** Handle `expansion_areas` (flatten if needed)
8. ✅ **Rule 8:** Preserve `research_flags` structure
9. ✅ **Rule 9:** Extract `content_approach` with default
10. ✅ **Error Handling:** Throw clear error if FULL schema malformed
11. ✅ **Backward Compatibility:** Handle nullable/optional fields
12. ✅ **Metadata:** Include transformation metadata in output

**Coverage Target:** 100%

### Contract Tests (MODIFY EXISTING)

**File:** `packages/course-gen-platform/tests/contract/generation.test.ts`

**Changes:**
1. ✅ Update `createMinimalAnalysisResult()` to return SIMPLIFIED schema
2. ✅ Verify all 17 tests pass with new schema
3. ✅ Add new test: "should handle both FULL and SIMPLIFIED analysis_result schemas"

**Expected Result:** 17/17 tests passing (currently 16/17)

### Integration Tests (RUN ALL)

**Files:** 30+ integration test files

**Action:** Run `pnpm test:integration` and verify all pass

**Focus Areas:**
- Stage 4 → Stage 5 pipeline (`stage5-generation-worker.test.ts`)
- Analysis pipeline (`analysis-pipeline-enhanced.test.ts`)
- E2E tests (`t055-full-pipeline.test.ts`)

### Regression Tests (CRITICAL)

**Action:** Run FULL test suite after implementation

**Commands:**
```bash
# Unit tests
pnpm test

# Contract tests
pnpm test:contract

# Integration tests
pnpm test:integration

# Type check
pnpm type-check

# Lint
pnpm lint
```

**Success Criteria:** 100% pass rate (no regressions)

---

## Acceptance Criteria

### Must Have (BLOCKING)

- [x] ✅ Transformation layer implemented in Stage 5 handler
- [x] ✅ All 9 transformation rules implemented correctly
- [x] ✅ Unit tests for transformation logic (100% coverage)
- [x] ✅ All contract tests pass (17/17)
- [x] ✅ All integration tests pass
- [x] ✅ No type errors (`pnpm type-check` passes)
- [x] ✅ No lint errors (`pnpm lint` passes)
- [x] ✅ Backward compatibility: FULL schema preserved in database
- [x] ✅ Documentation updated (data model, FUTURE task, migration guide)

### Should Have (IMPORTANT)

- [x] ✅ Transformation metadata included in output
- [x] ✅ Error logging for transformation failures
- [x] ✅ Clear error messages if transformation fails
- [x] ✅ Smoke tests on staging environment pass

### Could Have (NICE-TO-HAVE)

- [ ] ⏳ Transformation metrics dashboard (success rate, errors)
- [ ] ⏳ Alerting if transformation failure rate >1%
- [ ] ⏳ A/B testing to compare FULL vs SIMPLIFIED schema quality impact

---

## Risk Analysis

### High Risk

**Risk 1: Semantic Loss in Flattening**
- **Description:** Flattening `contextual_language` (6 fields → 1 string) may lose structure
- **Mitigation:** Use structured concatenation with clear delimiters (newlines, headers)
- **Impact:** LOW (LLMs handle structured text well)

**Risk 2: Test Regressions**
- **Description:** Updating 15 test files may introduce new failures
- **Mitigation:** Run full test suite after each file update, use Git to track changes
- **Impact:** MEDIUM (time-consuming but solvable)

### Medium Risk

**Risk 3: Difficulty Mapping Ambiguity**
- **Description:** Mapping `target_audience='mixed'` to `difficulty='intermediate'` is arbitrary
- **Mitigation:** Document assumption, log warning when mapping occurs
- **Impact:** LOW (semantic similarity validation will catch quality issues)

**Risk 4: Performance Overhead**
- **Description:** Transformation adds <100ms per job (acceptable)
- **Mitigation:** Profile transformation function, optimize if needed
- **Impact:** VERY LOW (transformation is simple string operations)

### Low Risk

**Risk 5: Backward Compatibility Edge Cases**
- **Description:** Old courses in database may have slightly different FULL schema
- **Mitigation:** Add defensive checks, handle nullable fields gracefully
- **Impact:** VERY LOW (AnalysisResult schema stable since v1.0.0)

---

## Success Metrics

### Technical Metrics

- ✅ **Transformation Success Rate:** ≥99.5% (target: 100%)
- ✅ **Transformation Latency:** <100ms per job (target: <50ms)
- ✅ **Test Pass Rate:** 100% (unit + contract + integration)
- ✅ **Type Coverage:** 100% (no `any` types in transformation logic)
- ✅ **Error Rate:** <0.5% in production (measured over 7 days)

### Business Metrics

- ✅ **Production Blocker Removed:** Stage 5 can process real Stage 4 output
- ✅ **Test Stability:** All 17 contract tests pass consistently
- ✅ **Developer Experience:** Clear error messages, documented migration path

### Quality Metrics (OPTIONAL)

- [ ] **Generation Quality:** No regression in semantic similarity scores (≥0.75)
- [ ] **Pedagogical Consistency:** LLM prompts maintain structure after transformation

---

## Timeline

**Total Estimated Effort:** 5-6 days (1 developer)

| Phase | Days | Tasks |
|-------|------|-------|
| **Phase 1: Transformation Layer** | 1-2 | Implement transformation logic, unit tests |
| **Phase 2: Test Fixtures** | 1 | Update 15 test files |
| **Phase 3: Regression Testing** | 1 | Run full test suite, fix regressions |
| **Phase 4: Documentation** | 0.5 | Update docs, write migration guide |
| **Phase 5: Monitoring & Deployment** | 0.5 | Deploy, monitor |

**Critical Path:** Phase 1 → Phase 2 → Phase 3 (cannot parallelize)

**Buffer:** +1 day for unexpected issues (total 6-7 days)

---

## References

### Related Documents

- **Investigation:** `docs/investigations/INV-2025-11-11-002-regenerate-section-test-hang.md`
- **Investigation:** `docs/investigations/INV-2025-11-11-003-regenerate-section-validation-failures.md`
- **FUTURE Task:** `docs/FUTURE/enhance-analyze-schema-for-generation.md`
- **Data Model:** `docs/008-generation-generation-json/data-model.md`

### Code References

- **Stage 4 Output:** `packages/course-gen-platform/src/orchestrator/services/analysis/phase-5-assembly.ts:228-263`
- **Stage 5 Input:** `packages/shared-types/src/generation-job.ts:24-54`
- **Stage 5 Usage:** `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts:653-658`
- **Test Fixtures:** `packages/course-gen-platform/tests/contract/generation.test.ts:64-94`

### Schema Definitions

- **FULL Schema:** `packages/shared-types/src/analysis-result.ts`
- **SIMPLIFIED Schema:** `packages/shared-types/src/generation-job.ts`

---

## Appendix: Transformation Examples

### Example 1: Professional Course

**Input (FULL Schema):**
```json
{
  "course_category": {
    "primary": "professional",
    "confidence": 0.95,
    "reasoning": "Technical content for software engineers"
  },
  "topic_analysis": {
    "determined_topic": "React Hooks Advanced Patterns",
    "target_audience": "intermediate",
    "key_concepts": ["useState", "useEffect", "custom hooks"]
  },
  "contextual_language": {
    "why_matters_context": "Critical for modern React development",
    "motivators": "Build production-ready applications",
    "experience_prompt": "You'll master advanced patterns",
    "problem_statement_context": "Complex state management is challenging",
    "knowledge_bridge": "Connect functional programming to React",
    "practical_benefit_focus": "Ship features faster with confidence"
  },
  "pedagogical_strategy": {
    "teaching_style": "hands-on",
    "assessment_approach": "Coding exercises after each section",
    "practical_focus": "high",
    "progression_logic": "Build complexity incrementally",
    "interactivity_level": "high"
  }
}
```

**Output (SIMPLIFIED Schema):**
```json
{
  "category": "professional",
  "difficulty": "intermediate",
  "determined_topic": "React Hooks Advanced Patterns",
  "key_concepts": ["useState", "useEffect", "custom hooks"],
  "contextual_language": "Why it matters: Critical for modern React development\n\nMotivators: Build production-ready applications\n\nExperience: You'll master advanced patterns\n\nProblem context: Complex state management is challenging\n\nKnowledge bridge: Connect functional programming to React\n\nPractical benefits: Ship features faster with confidence",
  "pedagogical_strategy": "Teaching Style: hands-on | Assessment: Coding exercises after each section | Practical Focus: high | Progression: Build complexity incrementally | Interactivity: high",
  "_transformation_metadata": {
    "source_schema_version": "1.0.0",
    "transformed_at": "2025-11-11T10:30:00Z",
    "transformation_version": "1.0.0"
  }
}
```

---

# PART 2: ENHANCEMENT - Schema Improvements

> **Priority**: 🟡 MEDIUM (quality optimization)
> **Type**: Enhancement (improves quality by 10-15%)
> **Timeline**: 2-3 days
> **Prerequisite**: PART 1 MUST be implemented and deployed first

---

## Enhancement Overview

### Context

RT-002 research revealed that the Analyze output schema needs enhancements to provide Generation with better context for creating high-quality lesson-level content. The current schema is **functionally correct** but **missing optional fields** that improve Generation quality by 10-15%.

**Current Status (after PART 1)**: Stage 5 Generation can work with current Analyze output after transformation layer is implemented, BUT will benefit from enhanced schema.

**When to Implement**: After PART 1 (transformation layer) is complete, deployed, and validated in production. This is an optimization, not a blocker.

### Summary

**What's Already Correct (No Changes Needed)**:
- ✅ **Granularity**: Section-level (3-7 sections) - PERFECT per RT-002
- ✅ **Section Fields**: High-level objectives and topics - PERFECT
- ✅ **Pedagogical Strategy**: Exists and works well
- ✅ **Scope Instructions**: Exists and works (but can be enhanced)

**What Needs Enhancement**:
- 🟡 **Pedagogical Patterns**: Need theory/practice balance guidance
- 🟡 **Generation Guidance**: Need structured constraints (not free-text)
- 🟡 **Section Metadata**: Need section IDs, duration, difficulty, prerequisites
- 🟢 **Document Analysis**: Optional document-level context (nice-to-have)

---

## Schema Enhancements Required

### Priority 1: CRITICAL for Generation Quality

#### 1.1 Add `pedagogical_patterns` Top-Level Field

**Why**: Generation needs theory/practice balance to create appropriate exercises

**Current State**: `pedagogical_strategy` exists but lacks specific patterns

**Schema Addition**:
```json
{
  "pedagogical_patterns": {
    "type": "object",
    "required": ["primary_strategy", "theory_practice_ratio", "assessment_types", "key_patterns"],
    "properties": {
      "primary_strategy": {
        "type": "string",
        "enum": ["problem-based learning", "lecture-based", "inquiry-based", "project-based", "mixed"],
        "description": "Primary pedagogical strategy observed in source materials"
      },
      "theory_practice_ratio": {
        "type": "string",
        "pattern": "^\\d{1,2}:\\d{1,2}$",
        "description": "Ratio of theory to practice (e.g., '30:70', '50:50')",
        "examples": ["30:70", "50:50", "70:30"]
      },
      "assessment_types": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["coding", "quizzes", "projects", "essays", "presentations", "peer-review"]
        },
        "minItems": 1,
        "maxItems": 5,
        "description": "Types of assessments to include"
      },
      "key_patterns": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "maxItems": 5,
        "description": "Observed pedagogical patterns (e.g., 'build incrementally', 'learn by refactoring')",
        "examples": [
          "build incrementally",
          "learn by refactoring",
          "worked examples then practice",
          "discovery learning with scaffolding"
        ]
      }
    }
  }
}
```

**Impact**: +10% Generation quality (maintains pedagogical consistency)
**RT-002 Reference**: Section 5.1 "Schema Enhancements Required"

---

#### 1.2 Enhance `scope_instructions` → `generation_guidance`

**Why**: Generation needs specific constraints (analogies, jargon, visuals), not just free-text prompt

**Current State**: `scope_instructions` is unstructured string (100-800 chars)

**Enhancement**: Replace with structured object (keep scope_instructions deprecated for backward compatibility)

**Schema Addition**:
```json
{
  "generation_guidance": {
    "type": "object",
    "required": ["tone", "use_analogies", "avoid_jargon", "include_visuals", "exercise_types"],
    "properties": {
      "tone": {
        "type": "string",
        "enum": ["conversational but precise", "formal academic", "casual friendly", "technical professional"],
        "description": "Tone to use in lesson content"
      },
      "use_analogies": {
        "type": "boolean",
        "description": "Whether to use analogies and metaphors"
      },
      "specific_analogies": {
        "type": ["array", "null"],
        "items": {
          "type": "string"
        },
        "description": "Specific analogies from source materials to use",
        "examples": [["assembly line for data flow", "kitchen recipe for algorithms"]]
      },
      "avoid_jargon": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "Terms to avoid or explain",
        "examples": [["stochastic", "ergodic", "homomorphism"]]
      },
      "include_visuals": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["diagrams", "flowcharts", "code examples", "screenshots", "animations", "plots"]
        },
        "minItems": 1,
        "description": "Types of visuals to include"
      },
      "exercise_types": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["coding", "derivation", "interpretation", "debugging", "refactoring", "analysis"]
        },
        "minItems": 1,
        "description": "Types of exercises to create"
      },
      "contextual_language_hints": {
        "type": "string",
        "minLength": 50,
        "maxLength": 300,
        "description": "Audience assumptions (e.g., 'Assume familiarity with matrix operations but not neural networks')"
      },
      "real_world_examples": {
        "type": ["array", "null"],
        "items": {
          "type": "string"
        },
        "description": "Real-world applications to reference",
        "examples": [["Image recognition in smartphones", "Spam email detection"]]
      }
    }
  }
}
```

**Migration**: Keep `scope_instructions` as deprecated field, populate both for backward compatibility

**Impact**: +15% Generation quality (better constraint adherence, clearer guidance)
**RT-002 Reference**: Section 3.1 "Analyze Provides Structure and Guidance"

---

#### 1.3 Enhance `sections_breakdown` Fields

**Why**: Generation needs section IDs, duration, difficulty, prerequisites for dependency graph

**Current State**: sections_breakdown has area, estimated_lessons, importance, learning_objectives, key_topics

**Schema Addition** (to SectionBreakdown definition):
```json
{
  "SectionBreakdown": {
    "properties": {
      // EXISTING FIELDS (keep as-is):
      "area": {...},
      "estimated_lessons": {...},
      "importance": {...},
      "learning_objectives": {...},
      "key_topics": {...},
      "pedagogical_approach": {...},
      "difficulty_progression": {...},

      // NEW FIELDS (add these):
      "section_id": {
        "type": "string",
        "pattern": "^[1-9]\\d*$",
        "description": "Unique section identifier (1, 2, 3, ...) for references",
        "examples": ["1", "2", "3"]
      },
      "estimated_duration_hours": {
        "type": "number",
        "minimum": 0.5,
        "maximum": 20,
        "description": "Estimated learning time for this section in hours"
      },
      "difficulty": {
        "type": "string",
        "enum": ["beginner", "intermediate", "advanced"],
        "description": "Overall difficulty level of this section"
      },
      "prerequisites": {
        "type": "array",
        "items": {
          "type": "string",
          "pattern": "^[1-9]\\d*$"
        },
        "description": "Array of section_ids that must be completed before this section (empty if none)",
        "examples": [[], ["1"], ["1", "2"]]
      }
    },
    "required": [
      // EXISTING (keep):
      "area", "estimated_lessons", "importance", "learning_objectives",
      "key_topics", "pedagogical_approach", "difficulty_progression",
      // NEW (add):
      "section_id", "estimated_duration_hours", "difficulty", "prerequisites"
    ]
  }
}
```

**Impact**: +10% Generation quality (better dependency handling, adaptive pacing)
**RT-002 Reference**: Section 5.1 "Schema Enhancements Required"

---

### Priority 2: SHOULD ADD (Nice-to-Have)

#### 2.1 Add `document_analysis` Top-Level Field (Optional)

**Why**: Provides Generation with document-level context it can't infer from section breakdown

**Current State**: No document-level metadata (only section-level)

**Schema Addition**:
```json
{
  "document_analysis": {
    "type": "object",
    "required": ["source_materials", "main_themes", "complexity_assessment", "estimated_total_hours"],
    "properties": {
      "source_materials": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "IDs of source documents analyzed (file_ids from file_catalog)",
        "examples": [["file_123", "file_456"]]
      },
      "main_themes": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["theme", "importance", "coverage"],
          "properties": {
            "theme": {
              "type": "string",
              "description": "Major theme from documents"
            },
            "importance": {
              "type": "string",
              "enum": ["high", "medium", "low"]
            },
            "coverage": {
              "type": "string",
              "description": "Where this theme appears (e.g., 'chapters 1-3', 'throughout')"
            }
          }
        },
        "minItems": 1,
        "maxItems": 5,
        "description": "Main themes detected across documents"
      },
      "complexity_assessment": {
        "type": "string",
        "minLength": 50,
        "maxLength": 200,
        "description": "Overall complexity assessment (e.g., 'advanced undergraduate', 'professional level')"
      },
      "estimated_total_hours": {
        "type": "number",
        "minimum": 0.5,
        "maximum": 200,
        "description": "Total estimated learning time (sum of all sections)"
      }
    }
  }
}
```

**Impact**: +5% Generation quality (better coherence, context awareness)
**RT-002 Reference**: Section 5.1 "Schema Enhancements Required" (document_analysis)

**Note**: This is optional and can be deferred if time-constrained

---

## Model Selection Strategy for Enhanced Fields

### Overview

The schema enhancements in PART 2 leverage **multi-model orchestration** already implemented in the codebase. This section documents which models are used for which enhanced fields and why.

**Status**: ✅ **ALREADY IMPLEMENTED** in code, this section documents existing strategy

**Key Principle**: Use **large-context models** (Gemini, Grok) for document synthesis in Analyze, **reasoning models** (qwen3-max, OSS 120B) for structured generation in Generation.

---

### Current Implementation

#### Stage 4 (Analyze) - Multi-Phase Multi-Model Orchestration

**Implementation File**: `packages/course-gen-platform/src/orchestrator/services/analysis/langchain-models.ts`

**Model Configuration by Phase**:

```typescript
Phase 1 (Classification): gpt-oss-20b
- Purpose: Simple document classification (course vs non-course, complexity level)
- Reason: Cost-effective for deterministic classification tasks
- Used for: Basic metadata, course_category

Phase 2 (Scope): gpt-oss-20b
- Purpose: Mathematical scope analysis (how much content to cover)
- Reason: Deterministic calculation, low complexity
- Used for: Total lessons count, section estimates

Phase 3 (Expert Analysis): gpt-oss-120b ALWAYS
- Purpose: Deep pedagogical pattern analysis
- Reason: Critical quality field requiring expert-level reasoning
- Used for: pedagogical_patterns (NEW), pedagogical_strategy (existing)

Phase 4 (Structure Synthesis): gpt-oss-20b → gpt-oss-120b (adaptive)
- Purpose: Synthesize structure from all phases
- Reason: Escalates to 120B for complex courses (≥3 documents)
- Used for: generation_guidance (NEW), sections_breakdown enhancements (NEW)

Emergency Fallback: google/gemini-2.5-flash
- Purpose: Handle context overflow (>128K tokens)
- Reason: 1M token context window for large document sets
- Trigger: When gpt-oss-120b context limit exceeded
```

**Research Reference**: `specs/007-stage-4-analyze/research.md` (Multi-phase orchestration strategy)

---

#### Stage 5 (Generation) - Tiered Model Routing

**Implementation File**: `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts`

**Model Configuration**:

```typescript
const MODELS = {
  tier1_oss120b: 'openai/gpt-oss-120b',      // 70-75% of sections
  tier2_qwen3Max: 'qwen/qwen3-max',          // 20-25% of sections
  tier3_gemini: 'google/gemini-2.5-flash',   // 5% overflow
} as const;

Routing Logic:
- Tier 1 (OSS 120B): Standard sections (complexity <0.75, criticality <0.80)
- Tier 2 (qwen3-max): Complex/critical sections (≥0.75 complexity OR ≥0.80 criticality)
- Tier 3 (Gemini): Context overflow (>108K tokens)
```

**Phase 2 Metadata Generation**:
- **CRITICAL fields** (pedagogical_patterns, generation_guidance): qwen3-max ALWAYS
- **NON-CRITICAL fields** (descriptions, prerequisites): OSS 120B → escalate if needed

**Research Reference**: `specs/008-generation-generation-json/research-decisions/rt-001-model-routing.md`

---

### Model Selection Rationale for Enhanced Fields

#### 1. `pedagogical_patterns` (PART 2, Priority 1)

**Generated in**: Stage 4 Analyze, Phase 3 (Expert Analysis)
**Model**: **gpt-oss-120b** (ALWAYS)
**Context Window**: 128K tokens
**Reasoning**:
- Requires deep understanding of teaching methodologies
- Critical quality field - must be consistent across entire course
- Needs to detect subtle patterns in source materials (theory/practice ratio, assessment types)
- Phase 3 already uses 120B for pedagogical strategy analysis

**Example Output**:
```json
{
  "pedagogical_patterns": {
    "primary_strategy": "problem-based learning",
    "theory_practice_ratio": "30:70",
    "assessment_types": ["coding", "projects"],
    "key_patterns": ["build incrementally", "learn by refactoring"]
  }
}
```

**Cost**: ~$0.15 per course (already incurred in Phase 3, no additional cost)

---

#### 2. `generation_guidance` (PART 2, Priority 1)

**Generated in**: Stage 4 Analyze, Phase 4 (Structure Synthesis)
**Model**: **gpt-oss-20b** → **gpt-oss-120b** (adaptive)
**Context Window**: 128K tokens (when escalated)
**Reasoning**:
- Requires synthesis of document tone, analogies, jargon from all phases
- Most courses can be handled by 20B (simple guidance)
- Complex courses with ≥3 documents escalate to 120B automatically
- Phase 4 already performs adaptive routing based on complexity

**Example Output**:
```json
{
  "generation_guidance": {
    "tone": "conversational but precise",
    "use_analogies": true,
    "specific_analogies": ["assembly line for data flow"],
    "avoid_jargon": ["stochastic", "ergodic"],
    "include_visuals": ["diagrams", "code examples"],
    "exercise_types": ["coding", "debugging"],
    "contextual_language_hints": "Assume familiarity with Python basics"
  }
}
```

**Cost**: ~$0.05-$0.10 per course (already incurred in Phase 4)

---

#### 3. Enhanced `sections_breakdown` Fields (PART 2, Priority 1)

**Generated in**: Stage 5 Generation, Phase 2 (Metadata Generation)
**Model**: **qwen3-max** (ALWAYS for CRITICAL metadata)
**Context Window**: 32K tokens (sufficient for metadata)
**Reasoning**:
- Requires structured reasoning for section_id, prerequisites, difficulty
- Must maintain consistency across all sections (dependency graph)
- Estimated duration requires understanding of learning time (qwen3-max excels at reasoning)
- Phase 2 metadata already uses qwen3-max for critical fields

**Enhanced Fields**:
```json
{
  "section_id": "1",
  "estimated_duration_hours": 2.5,
  "difficulty": "intermediate",
  "prerequisites": ["1", "2"]
}
```

**Cost**: ~$0.08 per course (already incurred in Phase 2 metadata generation)

---

#### 4. `document_analysis` (PART 2, Priority 2 - Optional)

**Generated in**: Stage 4 Analyze, Phase 4 (Structure Synthesis)
**Model**: **gpt-oss-20b** → **gpt-oss-120b** (adaptive) OR **google/gemini-2.5-flash** (overflow)
**Context Window**: 128K tokens (120B) or 1M tokens (Gemini)
**Reasoning**:
- Requires analysis of ALL source documents (potentially large context)
- Main themes, complexity assessment need document-level understanding
- Gemini 2.5 Flash becomes cost-effective for ≥5 documents (large context)
- Phase 4 already handles context overflow with Gemini fallback

**Example Output**:
```json
{
  "document_analysis": {
    "source_materials": ["file_123", "file_456"],
    "main_themes": [
      {
        "theme": "Neural network architectures",
        "importance": "high",
        "coverage": "chapters 1-3"
      }
    ],
    "complexity_assessment": "Advanced undergraduate level with professional examples",
    "estimated_total_hours": 15.5
  }
}
```

**Cost**: ~$0.05-$0.15 per course (minimal additional cost, uses existing Phase 4 routing)

---

### Why This Strategy Works

#### 1. **Division of Labor** (RT-002 Research)

- **Analyze (Stage 4)**: Section-level structure (3-7 sections) with document synthesis
  - Large context models (Gemini) for multi-document synthesis
  - Expert models (120B) for pedagogical pattern detection

- **Generation (Stage 5)**: Lesson-level content (3-5 lessons per section) with structured generation
  - Reasoning models (qwen3-max) for metadata consistency
  - Tiered routing (OSS 120B → qwen3-max → Gemini) based on complexity

**Result**: Each stage uses optimal model for its task granularity

---

#### 2. **Cost Optimization**

**Total Cost Breakdown** (per course):
```
Stage 4 Analyze:
  Phase 1 (20B):     ~$0.02
  Phase 2 (20B):     ~$0.03
  Phase 3 (120B):    ~$0.15  ← pedagogical_patterns generated here
  Phase 4 (20B→120B): ~$0.05-$0.10  ← generation_guidance generated here
  Emergency (Gemini): ~$0.05-$0.15  ← document_analysis overflow
  -------------------------
  Total Analyze:     ~$0.30-$0.45

Stage 5 Generation:
  Phase 2 (qwen3-max): ~$0.08  ← enhanced sections_breakdown generated here
  Phase 3 (tiered):    ~$0.40-$0.60
  -------------------------
  Total Generation:    ~$0.48-$0.68

TOTAL COST (both stages): ~$0.78-$1.13 per course
```

**Cost Increase from PART 2 Enhancements**: **$0.00** (uses existing model routing, no new API calls)

---

#### 3. **Quality Improvement**

**Expected Quality Gains** (from RT-002 research):
- pedagogical_patterns: +10% Generation quality (pedagogical consistency)
- generation_guidance: +15% Generation quality (better constraint adherence)
- enhanced sections_breakdown: +10% Generation quality (dependency handling)
- document_analysis: +5% Generation quality (context awareness)

**Total Expected Improvement**: +25-30% Generation quality (combined effect)

**Cost per Quality Point**: ~$0.00 additional cost / 30% quality = **$0.00 per quality point** (no incremental cost)

---

### Migration Path

**Backward Compatibility** (required for PART 2 rollout):

```typescript
// In section-batch-generator.ts or metadata-generator.ts
const guidance = input.analysis_result.generation_guidance || {
  tone: 'conversational but precise',
  use_analogies: true,
  avoid_jargon: [],
  include_visuals: ['diagrams', 'code examples'],
  exercise_types: ['coding'],
  contextual_language_hints: input.analysis_result.scope_instructions || ''
};

const patterns = input.analysis_result.pedagogical_patterns || {
  primary_strategy: 'mixed',
  theory_practice_ratio: '50:50',
  assessment_types: ['coding'],
  key_patterns: []
};

const sectionEnhancements = section.section_id ? {
  section_id: section.section_id,
  estimated_duration_hours: section.estimated_duration_hours || 2.0,
  difficulty: section.difficulty || 'intermediate',
  prerequisites: section.prerequisites || []
} : {
  // Generate defaults if old schema
  section_id: String(index + 1),
  estimated_duration_hours: 2.0,
  difficulty: 'intermediate',
  prerequisites: []
};
```

**Result**: Generation works with old Analyze output (defaults), gets better results with new schema (enhanced fields)

---

### References

1. **RT-001: Model Routing for Generation**
   - Location: `specs/008-generation-generation-json/research-decisions/rt-001-model-routing.md`
   - Key Finding: Tiered routing (OSS 120B → qwen3-max → Gemini) optimal for cost/quality balance

2. **RT-002: Architecture Balance Between Analyze and Generation**
   - Location: `specs/008-generation-generation-json/research-decisions/rt-002-architecture-balance.md`
   - Key Finding: Section-level in Analyze, lesson-level in Generation; enhanced schema +25-30% quality

3. **Stage 4 Multi-Phase Orchestration Research**
   - Location: `specs/007-stage-4-analyze/research.md`
   - Key Finding: Per-phase model selection (20B → 120B → Gemini) based on complexity

4. **Current Implementation**
   - Analyze: `packages/course-gen-platform/src/orchestrator/services/analysis/langchain-models.ts`
   - Generation: `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts`
   - Metadata: `packages/course-gen-platform/src/services/stage5/metadata-generator.ts`

---

### Decision Summary

**Question**: Which models should be used for PART 2 enhanced fields?

**Answer**: ✅ **Use existing multi-model orchestration** - no new models needed

**Rationale**:
1. pedagogical_patterns: Already generated in Analyze Phase 3 (120B) - no additional cost
2. generation_guidance: Already generated in Analyze Phase 4 (adaptive) - no additional cost
3. Enhanced sections_breakdown: Already generated in Generation Phase 2 (qwen3-max) - no additional cost
4. document_analysis: Already supported by Analyze Phase 4 overflow (Gemini) - minimal cost

**Result**: +25-30% Generation quality improvement with $0.00 additional model cost (uses existing routing)

---

## Implementation Plan - Part 2

### Phase 1: Schema Updates (Day 1)

**Tasks**:
1. ✅ Add `pedagogical_patterns` field to AnalysisResult schema
2. ✅ Add `generation_guidance` field (keep `scope_instructions` deprecated)
3. ✅ Enhance `sections_breakdown` with section_id, duration, difficulty, prerequisites
4. ✅ Update Zod validation schemas
5. ✅ Update TypeScript types in `@megacampus/shared-types`

**Files to Modify**:
- `packages/shared-types/src/analysis-result.ts` (add new fields)
- `packages/shared-types/src/generation-job.ts` (optional - if needed)
- `specs/007-stage-4-analyze/contracts/analysis-result.schema.json` (JSON schema definition)

**Estimated Effort**: 0.5 days

---

### Phase 2: Analyze Prompt Updates (Day 2)

**Tasks**:
1. ✅ Update Phase 1 (Classification) prompt to output `pedagogical_patterns`
2. ✅ Update Phase 3 (Pedagogical Strategy) prompt to output structured patterns
3. ✅ Update Phase 4 (Structure) prompt to output `generation_guidance`
4. ✅ Update Phase 4 (Structure) prompt to output enhanced `sections_breakdown` fields
5. ✅ Update validation logic to ensure new fields are present

**Files to Modify**:
- `packages/course-gen-platform/src/orchestrator/services/analysis/phase-1-classification.ts`
- `packages/course-gen-platform/src/orchestrator/services/analysis/phase-3-pedagogical-strategy.ts`
- `packages/course-gen-platform/src/orchestrator/services/analysis/phase-4-structure-optimization.ts`
- `packages/course-gen-platform/src/orchestrator/services/analysis/phase-5-assembly.ts`

**Estimated Effort**: 1 day

---

### Phase 3: Generation Integration (Day 3)

**Tasks**:
1. ✅ Update `metadata-generator.ts` to consume `pedagogical_patterns`
2. ✅ Update `section-batch-generator.ts` to consume `generation_guidance`
3. ✅ Update `generation-phases.ts` to use enhanced `sections_breakdown` fields
4. ✅ Add backward compatibility checks (defaults if new fields missing)
5. ✅ Test with 10 sample courses

**Files to Modify**:
- `packages/course-gen-platform/src/services/stage5/metadata-generator.ts`
- `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts`
- `packages/course-gen-platform/src/services/stage5/generation-phases.ts`

**Estimated Effort**: 0.5 days

---

### Phase 4: Testing & Validation (Day 3)

**Tasks**:
1. ✅ Run Analyze on 10 courses with new schema
2. ✅ Verify Generation quality improvement (A/B test)
3. ✅ Ensure backward compatibility (old schema still works)
4. ✅ Run full test suite (unit, contract, integration)
5. ✅ Measure quality metrics (semantic similarity)

**Success Criteria**:
- All 10 test courses generate valid new schema
- Generation quality improves by ≥10% (semantic similarity)
- No breaking changes to existing Generation code
- All tests pass (unit + contract + integration)

**Estimated Effort**: 0.5 days

---

**Total Effort for Part 2**: 2-3 days

---

## Migration Strategy

### Backward Compatibility

**Requirement**: Stage 5 Generation MUST work with both old schema (PART 1 transformation layer output) and new schema (PART 2 enhancements)

**Implementation**:
1. Keep `scope_instructions` field (populate from `generation_guidance` if new schema)
2. Make new fields optional (defaults if missing)
3. Version analysis_result with `metadata.analysis_version`

**Code Example** (Generation reads schema):
```typescript
// In metadata-generator.ts or section-batch-generator.ts

// Handle generation_guidance (new) or scope_instructions (old)
const guidance = input.analysis_result.generation_guidance || {
  tone: 'conversational but precise',
  use_analogies: true,
  avoid_jargon: [],
  include_visuals: ['diagrams', 'code examples'],
  exercise_types: ['coding'],
  contextual_language_hints: input.analysis_result.scope_instructions || ''
};

// Handle pedagogical_patterns (new) or defaults
const patterns = input.analysis_result.pedagogical_patterns || {
  primary_strategy: 'mixed',
  theory_practice_ratio: '50:50',
  assessment_types: ['coding'],
  key_patterns: []
};

// Handle enhanced sections_breakdown fields (new) or defaults
const section = sectionBreakdown[0];
const sectionId = section.section_id || `${index + 1}`;
const duration = section.estimated_duration_hours || 2;
const difficulty = section.difficulty || 'intermediate';
const prerequisites = section.prerequisites || [];
```

**Result**: Generation works with PART 1 schema (transformation layer), but gets better results with PART 2 schema (enhancements)

---

### Validation Metrics

**Before PART 2 Implementation**:
- Generation quality with PART 1 transformation layer: Baseline (100%)
- Lesson objective alignment: Baseline (100%)
- Pedagogical consistency: Baseline (100%)

**After PART 2 Implementation**:
- Generation quality: +10-15% improvement expected
- Lesson objective alignment: +10% improvement expected
- Pedagogical consistency: +15% improvement expected
- Analyze processing time: Should stay <10s (no regression)
- Analyze cost: Should stay <$0.50 per course (no regression)

**A/B Test**:
- Generate 20 courses with PART 1 schema (transformation layer only)
- Generate 20 courses with PART 2 schema (enhancements)
- Compare quality metrics
- If improvement <10%, revisit schema design

---

## Combined Timeline & Dependencies

### Overview

This specification consists of **two sequential parts** that MUST be implemented in order:

1. **PART 1 (CRITICAL)**: Transformation Layer - 5-6 days
2. **PART 2 (ENHANCEMENT)**: Schema Improvements - 2-3 days

**Total Timeline**: 7-9 days for complete implementation

---

### Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────┐
│ PART 1: CRITICAL - Transformation Layer (5-6 days)                  │
├─────────────────────────────────────────────────────────────────────┤
│ Day 1-2: Transformation Layer                                       │
│  └─> Create transform-analysis-for-generation.ts                    │
│  └─> Implement 9 transformation rules                               │
│  └─> Unit tests (100% coverage)                                     │
│                                                                       │
│ Day 3: Test Fixtures                                                │
│  └─> Update 15 test files                                           │
│  └─> Update createMinimalAnalysisResult()                           │
│                                                                       │
│ Day 4: Regression Testing                                           │
│  └─> Run ALL tests (unit, contract, integration, e2e)               │
│  └─> Fix regressions                                                │
│  └─> Verify 100% pass rate                                          │
│                                                                       │
│ Day 5: Documentation                                                │
│  └─> Update data model docs                                         │
│  └─> Create migration guide                                         │
│                                                                       │
│ Day 6: Deployment                                                   │
│  └─> Deploy to staging                                              │
│  └─> Deploy to production                                           │
│  └─> Monitor for 24h                                                │
│                                                                       │
│ ✅ BLOCKING: MUST complete before PART 2                            │
└─────────────────────────────────────────────────────────────────────┘
                               ↓
                    PREREQUISITE COMPLETE
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│ PART 2: ENHANCEMENT - Schema Improvements (2-3 days)                │
├─────────────────────────────────────────────────────────────────────┤
│ Day 1: Schema Updates (0.5 days)                                    │
│  └─> Add pedagogical_patterns field                                 │
│  └─> Add generation_guidance field                                  │
│  └─> Enhance sections_breakdown fields                              │
│  └─> Update Zod schemas                                             │
│                                                                       │
│ Day 2: Analyze Prompt Updates (1 day)                               │
│  └─> Update Phase 1, 3, 4 prompts                                   │
│  └─> Update validation logic                                        │
│                                                                       │
│ Day 3: Generation Integration & Testing (0.5 days)                  │
│  └─> Update Stage 5 services to consume new fields                  │
│  └─> Add backward compatibility                                     │
│  └─> A/B test quality improvement                                   │
│  └─> Run full test suite                                            │
│                                                                       │
│ ✅ OPTIONAL: Can defer if time-constrained                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Critical Path

**Path 1 (MUST DO - Production Blocker)**:
```
PART 1.1 Transformation Layer (Days 1-2)
  ↓
PART 1.2 Test Fixtures (Day 3)
  ↓
PART 1.3 Regression Testing (Day 4)
  ↓
PART 1.4 Documentation (Day 5)
  ↓
PART 1.5 Deployment (Day 6)
  ↓
PRODUCTION READY ✅
```

**Path 2 (SHOULD DO - Quality Optimization)**:
```
WAIT for PART 1 deployment + 24h monitoring
  ↓
PART 2.1 Schema Updates (Day 1)
  ↓
PART 2.2 Analyze Prompts (Day 2)
  ↓
PART 2.3 Generation Integration & Testing (Day 3)
  ↓
ENHANCED QUALITY ✅ (+10-15% improvement)
```

---

### Milestone Checklist

**Milestone 1: Transformation Layer Complete** (After Day 6)
- [ ] ✅ All 17 contract tests pass
- [ ] ✅ All integration tests pass
- [ ] ✅ Type-check passes
- [ ] ✅ Deployed to production
- [ ] ✅ Monitored for 24h (no errors)
- [ ] ✅ Stage 5 can process real Stage 4 output

**Milestone 2: Schema Enhancements Complete** (After Day 9)
- [ ] ✅ All new fields added to schema
- [ ] ✅ Analyze outputs new schema
- [ ] ✅ Generation consumes new schema
- [ ] ✅ Quality improvement ≥10% measured
- [ ] ✅ Backward compatibility verified
- [ ] ✅ All tests pass

---

### Rollback Strategy

**If PART 1 fails** (transformation issues):
- Rollback deployment (transformation is in handler, Stage 4 unchanged)
- Disable transformation feature flag
- Investigate and fix
- Re-deploy

**If PART 2 fails** (schema issues):
- Schema is backward compatible (new fields optional)
- Generation falls back to defaults
- No rollback needed (graceful degradation)
- Fix and re-deploy schema updates

---

### Resource Allocation

**Recommended Team**:
- **Backend Engineer**: Implement PART 1 transformation layer (5-6 days)
- **Backend Engineer**: Implement PART 2 schema enhancements (2-3 days)
- **QA Engineer**: Regression testing for PART 1 (1 day)
- **DevOps Engineer**: Deployment & monitoring (0.5 days)

**Parallelization**: PART 1 and PART 2 CANNOT be parallelized (dependency required)

**Total Team Effort**: 7-9 days (1 backend engineer) OR 5-6 days (2 backend engineers if PART 2 deferred)

---

**Status:** ⏭️ READY FOR IMPLEMENTATION
**Owner:** TBD (assign to backend engineer)
**Created:** 2025-11-11
**Last Updated:** 2025-11-11
