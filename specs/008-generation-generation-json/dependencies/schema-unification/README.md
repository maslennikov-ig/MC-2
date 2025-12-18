# Schema Unification Task (T055)

**Main Task**: `specs/008-generation-generation-json/tasks.md` (Task T055)
**Detailed Subtasks**: `implementation-tasks.md` (18 subtasks: U01-U18)
**Full Specification**: `docs/FUTURE/SPEC-2025-11-12-001-unify-stage4-stage5-schemas.md`

---

## Quick Reference

### Problem

Schema mismatch between Stage 4 (Analyze) output and Stage 5 (Generation) input:
- **Stage 4 outputs**: FULL nested schema (`course_category: {primary, confidence, reasoning}`, `contextual_language: {6 fields}`, etc.)
- **Stage 5 expects**: SIMPLIFIED flat schema (`category: string`, `difficulty: enum`, `contextual_language: string`)

### Root Cause

`generation-job.ts` created simplified `AnalysisResultSchema` instead of using full Stage 4 schema.

### Impact

- ❌ Validation failures: "Expected string, received object"
- ❌ Information loss: confidence scores, 6 contextual_language fields → 1 string
- ❌ Violates RT-002: Generation needs full context for reasoning

### Solution

**Unify schemas**: Stage 5 accepts and uses FULL `AnalysisResult` schema from Stage 4
- **Analyze ALWAYS generates ALL fields** (even if input was title-only - architectural requirement)
- **Generation ALWAYS receives FULL data from Analyze** (100% of cases, ALL 4 enhancement fields REQUIRED)
- Create Zod validator matching full schema with ALL fields REQUIRED (production Best Practice)
- Add 7 helper functions to format nested objects for prompts
- Update Stage 5 services to use helpers
- Update all test fixtures
- **RAG usage is logic-level decision** in Generation (not schema-level)

### Effort

**Total**: 2.5-3.5 days (1 developer) ✅ **REDUCED**, 18 subtasks across 4 phases
**Time Saved**: 2-3 hours in Phase 1 thanks to existing Zod schemas!

---

## File Structure

```
dependencies/schema-unification/
├── README.md                    # This file (quick reference)
├── implementation-tasks.md      # Detailed subtasks (U01-U18)
```

**Related Files**:
```
docs/FUTURE/
└── SPEC-2025-11-12-001-unify-stage4-stage5-schemas.md  # Full specification

specs/008-generation-generation-json/
└── tasks.md                     # Main task T055
```

---

## Phase Overview

### Phase 1: Schema Unification (Day 1, 2-3h) ✅ REDUCED
- U01: Extend existing Zod validator with 4 REQUIRED fields (schemas already exist! ✨)
- U02: Update generation-job.ts import (simplified)
- U03: Create 7 helper functions (analysis-formatters.ts)
- U04: Add unit tests for helpers (100% coverage)
- U05: Run type-check

**Discovery**: Full `AnalysisResultSchema` already exists in `packages/course-gen-platform/src/types/analysis-result.ts`! Only need to extend with 4 REQUIRED enhancement fields.

**Critical Requirements**:
- ALL 4 fields REQUIRED (no .optional() - production Best Practice):
  - pedagogical_patterns (Analyze always generates)
  - generation_guidance (Analyze always generates)
  - document_relevance_mapping (Analyze always generates, Generation decides if use)
  - document_analysis (Analyze always generates, Generation decides if use)
- Analyze ALWAYS generates ALL 4 fields (even if input was title-only)
- Generation ALWAYS receives ALL 4 fields (architectural requirement)
- RAG usage is logic-level decision in Generation (not schema-level)

### Phase 2: Update Stage 5 Services (Day 2, 6-8h)
- U06-U09: Update section-batch-generator, metadata-generator, generation-phases, others
- U10: Run type-check

### Phase 3: Update Tests (Day 3, 6-8h)
- U11-U13: Update test fixtures and 15+ test files
- U14: Run full test suite (expect 17/17 contract tests)
- U15: Run type-check and lint

### Phase 4: Documentation (Day 4, 4-6h)
- U16: Update data-model.md
- U17: Create migration guide
- U18: Manual testing (Stage 4 → Stage 5 pipeline)

---

## Key Artifacts

**NEW FILES**:
- `packages/shared-types/src/analysis-result-validator.ts` (Zod schemas)
- `packages/course-gen-platform/src/services/stage5/analysis-formatters.ts` (7 helpers)
- `packages/course-gen-platform/tests/unit/stage5/analysis-formatters.test.ts` (tests)
- `docs/migrations/MIGRATION-unified-schemas.md` (migration guide)

**MODIFIED FILES**:
- `packages/shared-types/src/generation-job.ts` (use full schema)
- `packages/course-gen-platform/src/services/stage5/*.ts` (3+ files)
- `packages/course-gen-platform/tests/**/*.test.ts` (15+ files)

---

## Acceptance Criteria

- [ ] ✅ Zod validator created, exports AnalysisResultSchema with ALL 4 fields REQUIRED
- [ ] ✅ Analyze ALWAYS generates ALL 4 fields (even if input was title-only)
- [ ] ✅ Generation ALWAYS receives full data from Analyze (architectural requirement validated)
- [ ] ✅ NO optional fields in schema (production Best Practice - all 4 fields required)
- [ ] ✅ RAG usage is logic-level decision in Generation (not schema-level)
- [ ] ✅ generation-job.ts imports and uses full schema
- [ ] ✅ All 7 helper functions with 100% test coverage
- [ ] ✅ Stage 5 services updated (section-batch-generator, metadata-generator, generation-phases)
- [ ] ✅ All contract tests pass (17/17, was 16/17)
- [ ] ✅ All integration tests pass (zero regressions)
- [ ] ✅ No type errors, no lint errors
- [ ] ✅ Test fixtures use full schema (nested objects, all fields populated)
- [ ] ✅ Documentation updated
- [ ] ✅ Manual testing passes (title-only + with documents scenarios)

---

## Success Metrics

- **Schema validation pass rate**: 100%
- **Information preservation**: 100% (no data loss)
- **RT-002 compliance**: Generation has full Analyze context
- **Type coverage**: 100% (no `any` types)

---

## Quick Start

1. Read full specification: `docs/FUTURE/SPEC-2025-11-12-001-unify-stage4-stage5-schemas.md`
2. Review detailed subtasks: `implementation-tasks.md`
3. Start with Phase 1 (U01-U05): Schema Unification
4. Follow sequential phases 1 → 2 → 3 → 4

---

**Status**: ⏳ PENDING START
**Priority**: HIGH (architectural fix)
**Executor**: typescript-types-specialist + Stage 5 team
**Created**: 2025-11-12
