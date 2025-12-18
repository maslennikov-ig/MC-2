# Enhancement Fields: Production-Ready Implementation Tasks

**Created**: 2025-11-16
**Status**: Planning
**Priority**: High
**Objective**: Make all 4 enhancement fields production-ready with proper Stage 4 generation and Stage 5 consumption

---

## Overview

Based on specification analysis (ANALYZE-ENHANCEMENT-UNIFIED.md), we need to ensure all 4 enhancement fields are properly implemented:

1. `pedagogical_patterns` - REQUIRED (theory/practice balance)
2. `generation_guidance` - REQUIRED (structured constraints, replaces scope_instructions)
3. `document_relevance_mapping` - REQUIRED with default empty value (smart RAG)
4. `document_analysis` - OPTIONAL (only when documents exist)

---

## Phase 1: Investigation & Documentation

### Task 1.1: Audit Current Implementation State

**Objective**: Determine what is already implemented vs what needs to be added

**Files to check**:
- `packages/course-gen-platform/src/orchestrator/services/analysis/phases/phase-*.ts` (all 6 phases)
- `packages/course-gen-platform/src/orchestrator/services/analysis/analysis-orchestrator.ts`
- `packages/shared-types/src/generation-job.ts` (current schema state)
- `packages/shared-types/src/analysis-schemas.ts` (schema definitions)

**Questions to answer**:
1. Does Stage 4 Analyze currently generate `pedagogical_patterns`?
2. Does Stage 4 Analyze currently generate `generation_guidance`?
3. Does Stage 4 Analyze currently generate `document_relevance_mapping`?
4. Does Stage 4 Analyze currently generate `document_analysis`?
5. Which Phase generates each field (Phase 2, 3, 4, or 5)?
6. Are the prompts already in place or do they need to be written?
7. Are the schemas already correct or do they need updates?

**Deliverable**: Investigation report documenting current state for each field

**Estimate**: 30 minutes

---

### Task 1.2: Review Stage 5 Consumption Logic

**Objective**: Check if Stage 5 Generation is ready to consume these fields

**Files to check**:
- `packages/course-gen-platform/src/services/stage5/metadata-generator.ts`
- `packages/course-gen-platform/src/services/stage5/section-generator.ts`
- `packages/course-gen-platform/src/services/stage5/lesson-generator.ts`
- `packages/course-gen-platform/src/services/stage5/orchestrator.ts`

**Questions to answer**:
1. Does metadata-generator use `generation_guidance` fields in prompts?
2. Does section-generator use `pedagogical_patterns` fields?
3. Does lesson-generator use `document_relevance_mapping` for RAG?
4. Does any generator use `document_analysis` context?
5. Are there fallback mechanisms when fields are missing?
6. Does `scope_instructions` fallback work correctly?

**Deliverable**: Consumption audit report

**Estimate**: 30 minutes

---

### Task 1.3: Schema Validation Audit

**Objective**: Ensure schemas match specification exactly

**Files to check**:
- `packages/shared-types/src/analysis-schemas.ts`
- `packages/shared-types/src/generation-job.ts`
- `specs/008-generation-generation-json/ANALYZE-ENHANCEMENT-UNIFIED.md`

**Questions to answer**:
1. Does `PedagogicalPatternsSchema` match spec (lines 35-55)?
2. Does `GenerationGuidanceSchema` match spec (lines 58-84)?
3. Does `DocumentRelevanceMappingSchema` match spec (lines 143-187)?
4. Does `DocumentAnalysisSchema` match spec (lines 116-140)?
5. Are all fields correctly marked as REQUIRED/OPTIONAL?
6. Are validation rules (min/max, enums) correct?

**Deliverable**: Schema compliance report

**Estimate**: 20 minutes

---

## Phase 2: Schema Fixes

### Task 2.1: Update AnalysisResultSchema - pedagogical_patterns

**File**: `packages/shared-types/src/generation-job.ts`

**Changes needed**:
```typescript
// CURRENT (line 122):
pedagogical_patterns: PedagogicalPatternsSchema,

// VERIFY: Should be REQUIRED (no .optional())
// If already correct, mark as ✓ verified
```

**Validation**: Run type-check after changes

**Estimate**: 5 minutes

---

### Task 2.2: Update AnalysisResultSchema - generation_guidance

**File**: `packages/shared-types/src/generation-job.ts`

**Changes needed**:
```typescript
// CURRENT (line 124-127):
generation_guidance: GenerationGuidanceSchema.extend({
  specific_analogies: z.array(z.string()),
  real_world_examples: z.array(z.string()),
}).optional(),

// CHANGE TO (REQUIRED):
generation_guidance: GenerationGuidanceSchema.extend({
  specific_analogies: z.array(z.string()),
  real_world_examples: z.array(z.string()),
}), // Remove .optional()
```

**Validation**: Run type-check after changes

**Estimate**: 5 minutes

---

### Task 2.3: Update AnalysisResultSchema - document_relevance_mapping

**File**: `packages/shared-types/src/generation-job.ts`

**Changes needed**:
```typescript
// CURRENT (line 129):
document_relevance_mapping: DocumentRelevanceMappingSchema.optional(),

// CHANGE TO (REQUIRED with default):
document_relevance_mapping: DocumentRelevanceMappingSchema.default({
  lessons: []
}),
```

**Note**: This field is ALWAYS present, but `lessons` array is empty when no documents uploaded

**Validation**: Run type-check after changes

**Estimate**: 5 minutes

---

### Task 2.4: Verify AnalysisResultSchema - document_analysis

**File**: `packages/shared-types/src/generation-job.ts`

**Verification**:
```typescript
// CURRENT (line 130):
document_analysis: DocumentAnalysisSchema.optional(),

// VERIFY: Should remain OPTIONAL (only when documents exist)
// If already correct, mark as ✓ verified
```

**Validation**: Run type-check after changes

**Estimate**: 5 minutes

---

### Task 2.5: Deprecate scope_instructions

**File**: `packages/shared-types/src/generation-job.ts`

**Changes needed**:
```typescript
// CURRENT (line 112):
scope_instructions: z.string().min(100),

// CHANGE TO (mark as deprecated, keep for backward compatibility):
scope_instructions: z.string().min(100)
  .describe('DEPRECATED: Use generation_guidance instead. Kept for backward compatibility.'),
```

**Note**: Do NOT remove, keep as REQUIRED for now (fallback)

**Validation**: Run type-check after changes

**Estimate**: 5 minutes

---

## Phase 3: Stage 4 Analyze - Generation Logic

### Task 3.1: Verify Phase 3 - pedagogical_patterns Generation

**File**: `packages/course-gen-platform/src/orchestrator/services/analysis/phases/phase-3-expert.ts`

**Objective**: Ensure `pedagogical_patterns` is generated in Phase 3

**Check**:
1. Does Phase 3 LLM prompt include pedagogical_patterns output?
2. Is the schema validation present?
3. Are all required fields generated (primary_strategy, theory_practice_ratio, etc.)?

**If missing**: Add pedagogical_patterns to Phase 3 prompt and output schema

**Deliverable**: Verification report OR implementation of missing logic

**Estimate**: 45 minutes (if needs implementation)

---

### Task 3.2: Implement Phase 4 - generation_guidance Generation

**File**: `packages/course-gen-platform/src/orchestrator/services/analysis/phases/phase-4-synthesis.ts`

**Objective**: Add generation_guidance generation to Phase 4 (replace free-text scope_instructions)

**Implementation**:
1. Update Phase 4 LLM prompt to generate structured `generation_guidance`
2. Add schema validation for `generation_guidance`
3. Keep `scope_instructions` generation for backward compatibility
4. Add migration logic: generate `scope_instructions` from `generation_guidance` summary

**Prompt additions** (based on spec lines 58-84):
```typescript
// Add to Phase 4 prompt:
"generation_guidance": {
  "tone": "conversational but precise" | "formal academic" | "casual friendly" | "technical professional",
  "use_analogies": boolean,
  "specific_analogies": ["example1", "example2"],
  "avoid_jargon": ["term1", "term2"],
  "include_visuals": ["diagrams", "code examples"],
  "exercise_types": ["coding", "debugging"],
  "contextual_language_hints": "string (audience assumptions)",
  "real_world_examples": ["application1", "application2"]
}
```

**Deliverable**: Updated Phase 4 with generation_guidance

**Estimate**: 2 hours

---

### Task 3.3: Implement document_relevance_mapping - Default Empty

**File**: `packages/course-gen-platform/src/orchestrator/services/analysis/analysis-orchestrator.ts`

**Objective**: Ensure document_relevance_mapping is ALWAYS generated with default empty value

**Implementation**:
1. After Phase 5 (Assembly), check if `document_relevance_mapping` exists
2. If missing (no documents uploaded), set to default:
   ```typescript
   analysis_result.document_relevance_mapping = {
     lessons: []
   };
   ```
3. If documents exist, ensure Phase 2 populated it correctly

**Deliverable**: Default value injection logic

**Estimate**: 30 minutes

---

### Task 3.4: Verify Phase 2 - document_analysis Generation

**File**: `packages/course-gen-platform/src/orchestrator/services/analysis/phases/phase-2-scope.ts`

**Objective**: Verify document_analysis is generated ONLY when documents exist

**Check**:
1. Does Phase 2 check for `document_summaries` presence?
2. Does Phase 2 LLM prompt include document_analysis output when documents exist?
3. Is the schema validation present?
4. Is the field omitted when no documents?

**If missing**: Add document_analysis generation conditional logic

**Deliverable**: Verification report OR implementation of missing logic

**Estimate**: 45 minutes (if needs implementation)

---

### Task 3.5: Verify Phase 2 - document_relevance_mapping Generation

**File**: `packages/course-gen-platform/src/orchestrator/services/analysis/phases/phase-2-scope.ts`

**Objective**: Verify document_relevance_mapping is populated when documents exist

**Check**:
1. Does Phase 2 generate lesson-to-document mappings?
2. Does the schema include `lesson_id`, `relevant_doc_ids`, `relevance_scores`?
3. Is the logic correct for multi-document scenarios?

**If missing**: Implement RAG planning logic in Phase 2

**Deliverable**: Verification report OR implementation of missing logic

**Estimate**: 1.5 hours (if needs implementation)

---

## Phase 4: Stage 5 Generation - Consumption Logic

### Task 4.1: Update metadata-generator - Use generation_guidance

**File**: `packages/course-gen-platform/src/services/stage5/metadata-generator.ts`

**Objective**: Replace scope_instructions with generation_guidance in prompts

**Implementation**:
1. Extract `generation_guidance` from `input.analysis_result`
2. Update LLM prompt to use structured fields:
   - `tone` → prompt tone instruction
   - `use_analogies` → enable/disable analogies
   - `specific_analogies` → inject into prompt
   - `avoid_jargon` → add constraint to avoid terms
   - `include_visuals` → specify visual types
   - `exercise_types` → specify exercise preferences
3. Add fallback: if `generation_guidance` missing, use `scope_instructions`

**Deliverable**: Updated metadata-generator with generation_guidance consumption

**Estimate**: 1.5 hours

---

### Task 4.2: Update section-generator - Use pedagogical_patterns

**File**: `packages/course-gen-platform/src/services/stage5/section-generator.ts`

**Objective**: Use pedagogical_patterns for theory/practice balance

**Implementation**:
1. Extract `pedagogical_patterns` from `input.analysis_result`
2. Update LLM prompt to use:
   - `theory_practice_ratio` → adjust lesson balance
   - `primary_strategy` → teaching approach
   - `assessment_frequency` → exercise placement
   - `interactivity_level` → user engagement level
3. Add validation to ensure field exists (should always be present)

**Deliverable**: Updated section-generator with pedagogical_patterns consumption

**Estimate**: 1 hour

---

### Task 4.3: Update lesson-generator - Use document_relevance_mapping for RAG

**File**: `packages/course-gen-platform/src/services/stage5/lesson-generator.ts`

**Objective**: Use document_relevance_mapping for smart RAG retrieval

**Implementation**:
1. Extract `document_relevance_mapping` from `input.analysis_result`
2. For each lesson being generated:
   - Find matching `lesson_id` in mapping
   - Retrieve `relevant_doc_ids` for that lesson
   - Fetch document chunks from vector DB using those IDs
   - Include in lesson generation context
3. Handle empty mapping (no documents scenario)
4. Add logging for RAG retrieval efficiency

**Deliverable**: Smart RAG retrieval using pre-computed mappings

**Estimate**: 2 hours

---

### Task 4.4: Update lesson-generator - Use document_analysis Context

**File**: `packages/course-gen-platform/src/services/stage5/lesson-generator.ts`

**Objective**: Use document_analysis for course-level context

**Implementation**:
1. Extract `document_analysis` from `input.analysis_result` (if exists)
2. Add document-level context to prompts:
   - `main_themes` → align lessons with document themes
   - `terminology_consistency` → use consistent terms
   - `content_structure` → follow document organization
3. Handle missing field gracefully (when no documents uploaded)

**Deliverable**: Document-aware lesson generation

**Estimate**: 1 hour

---

## Phase 5: Testing & Validation

### Task 5.1: Update Unit Tests - Schema Validation

**Files**:
- `packages/shared-types/tests/generation-job.test.ts`

**Objective**: Update tests to reflect new REQUIRED fields

**Changes needed**:
1. Remove `.optional()` from generation_guidance test cases
2. Add default value tests for document_relevance_mapping
3. Verify pedagogical_patterns is always present
4. Update test fixtures with all 4 fields

**Deliverable**: Passing unit tests

**Estimate**: 30 minutes

---

### Task 5.2: Update E2E Test - T053 Verification

**File**: `packages/course-gen-platform/tests/e2e/t053-synergy-sales-course.test.ts`

**Objective**: Verify all 4 fields are generated and consumed correctly

**Assertions to add**:
```typescript
// After Stage 4 completes
expect(analysisResult.pedagogical_patterns).toBeDefined();
expect(analysisResult.generation_guidance).toBeDefined();
expect(analysisResult.document_relevance_mapping).toBeDefined();
expect(analysisResult.document_relevance_mapping.lessons).toBeArray();

// With documents uploaded:
expect(analysisResult.document_analysis).toBeDefined();

// Verify Stage 5 consumed fields correctly
// (check generated course structure matches pedagogical_patterns)
```

**Deliverable**: Updated E2E test with enhancement field verification

**Estimate**: 45 minutes

---

### Task 5.3: Manual Testing - Full Pipeline

**Objective**: Test full pipeline with real course generation

**Test scenarios**:
1. **With documents**: Upload PDFs → verify all 4 fields generated → verify RAG works
2. **Without documents**: Title-only → verify 3 fields generated (not document_analysis) → verify default empty mapping
3. **Russian course**: Verify generation_guidance respected in Russian
4. **English course**: Verify pedagogical_patterns applied correctly

**Deliverable**: Manual test report

**Estimate**: 1 hour

---

### Task 5.4: Create Rollback Plan

**Objective**: Document rollback procedure if production issues occur

**Deliverable**: Rollback documentation including:
1. Which schema changes to revert
2. Which Phase implementations to disable
3. Database migration rollback (if needed)
4. Monitoring metrics to watch

**Estimate**: 30 minutes

---

## Phase 6: Documentation

### Task 6.1: Update API Documentation

**Files**:
- `docs/SUPABASE-DATABASE-REFERENCE.md`
- `specs/008-generation-generation-json/data-model.md`

**Updates needed**:
1. Mark scope_instructions as DEPRECATED
2. Document all 4 enhancement fields with examples
3. Add migration guide (old → new schema)
4. Update example payloads

**Deliverable**: Updated documentation

**Estimate**: 45 minutes

---

### Task 6.2: Create Enhancement Fields Guide

**File**: `docs/ENHANCEMENT-FIELDS-GUIDE.md` (new)

**Content**:
1. Overview of all 4 fields
2. When each field is generated (which Phase)
3. How each field is consumed in Stage 5
4. Examples for each field
5. Troubleshooting common issues

**Deliverable**: New guide document

**Estimate**: 1 hour

---

### Task 6.3: Update CHANGELOG

**File**: `CHANGELOG.md`

**Entry**:
```markdown
## [Unreleased]

### Added
- REQUIRED `generation_guidance` field (structured constraints replacing scope_instructions)
- REQUIRED `document_relevance_mapping` field with default empty value (smart RAG)
- Improved Stage 4 Analyze generation for all enhancement fields
- Smart RAG retrieval using pre-computed document mappings

### Changed
- `generation_guidance` changed from OPTIONAL to REQUIRED
- `document_relevance_mapping` changed from OPTIONAL to REQUIRED (default: {lessons: []})
- `scope_instructions` marked as DEPRECATED (kept for backward compatibility)

### Fixed
- Stage 5 Generation now properly consumes all enhancement fields
- Pedagogical patterns correctly applied to lesson structure
```

**Deliverable**: Updated CHANGELOG

**Estimate**: 15 minutes

---

## Summary

**Total Tasks**: 23
**Estimated Total Time**: ~17 hours

**Breakdown by Phase**:
- Phase 1 (Investigation): 1.5 hours
- Phase 2 (Schema Fixes): 25 minutes
- Phase 3 (Stage 4 Generation): 5 hours
- Phase 4 (Stage 5 Consumption): 5.5 hours
- Phase 5 (Testing): 2.75 hours
- Phase 6 (Documentation): 2 hours

**Critical Path**:
1. Task 1.1 → Task 1.2 → Task 1.3 (Investigation)
2. Task 2.1 → Task 2.2 → Task 2.3 (Schema fixes)
3. Task 3.2 (generation_guidance in Phase 4) - LONGEST TASK
4. Task 4.1 → Task 4.3 (Stage 5 consumption)
5. Task 5.2 → Task 5.3 (Testing)

**Priority Order**:
1. **HIGH**: Task 3.2 (generation_guidance generation) - core replacement for scope_instructions
2. **HIGH**: Task 4.1 (generation_guidance consumption) - must work end-to-end
3. **MEDIUM**: Task 3.3 (document_relevance_mapping default) - required field
4. **MEDIUM**: Task 4.3 (RAG with mappings) - cost savings + quality
5. **LOW**: Documentation tasks (can be done async)

---

## Next Steps

1. Review this task list with team
2. Confirm scope and priorities
3. Assign tasks to developers
4. Start with Phase 1 investigation
5. Execute in new context with fresh token budget
