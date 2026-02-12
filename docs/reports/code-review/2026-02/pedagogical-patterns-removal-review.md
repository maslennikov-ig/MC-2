# Code Review Report: Removal of `pedagogical_patterns` Field

**Generated**: 2026-02-07
**Status**: ⚠️ CRITICAL ISSUES FOUND
**Reviewer**: Claude Code (code-reviewer)
**Scope**: Complete removal of `pedagogical_patterns` field (~400 lines)

---

## Executive Summary

Comprehensive code review of the removal of the `pedagogical_patterns` field (Phase 1 enhancement) from the codebase. The removal was well-executed in most areas, but **3 critical bugs were discovered** that will cause runtime failures.

### Key Findings

- **Files Reviewed**: 20+ files across shared-types, Stage 4, Stage 5, frontend, tests
- **Critical Issues**: 3 (P0 - blocking)
- **High Priority Issues**: 0
- **Medium Priority Issues**: 0
- **Low Priority Issues**: 1 (P2 - minor)
- **Overall Status**: ⚠️ **FAILED** - Critical issues must be fixed before deployment

---

## Critical Issues (P0 - BLOCKING)

### 1. **Stage 4 Phase 1 Prompt References Removed Field**

**File**: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-1-classifier.ts`
**Lines**: 155-156

**Issue**: The prompt still instructs the LLM to generate `pedagogical_patterns`, but the field has been removed from the schema.

```typescript
// Line 151-159 in phase-1-classifier.ts
TASK:
1. Classify this course into the most appropriate category
2. Analyze topic complexity and identify key concepts
3. Extract domain keywords relevant to this topic
4. Assess information completeness and identify missing elements
5. Determine pedagogical patterns for the course  // ← ISSUE: This task is orphaned
```

**Impact**:

- LLM will attempt to generate a field that is no longer accepted by the schema
- May cause validation failures or confusion in LLM output
- Wastes tokens on generating unused data

**Fix**: Remove line 156 (task #5) from the prompt.

---

### 2. **Database Migration SQL References Removed Field**

**File**: `packages/course-gen-platform/supabase/migrations/20251203140500_seed_prompt_templates.sql`
**Line**: 154

**Issue**: The seeded prompt template for `stage4_phase1_classification` contains the same issue - it instructs the LLM to generate `pedagogical_patterns`.

```sql
-- Line 142-169 in seed_prompt_templates.sql
Your task is to analyze course topics and classify them into one of 6 categories,
and perform topic analysis.

CRITICAL RULES:
1. ALL output MUST be in {{outputLanguage}}
2. You MUST respond with valid JSON matching the Phase1Output schema
3. Ensure all character length constraints are met
4. Extract 3-10 key concepts and 5-15 domain keywords

FIELD FORMATS:
- theory_practice_ratio: Format "XX:YY" where XX+YY=100  // ← ISSUE: Removed field
```

**Impact**:

- **CRITICAL**: This is a seeded database migration that creates prompt templates
- The template is stored in the database and used at runtime
- Even if the TypeScript code is fixed, the database template will still reference the removed field
- Affects all Stage 4 Phase 1 executions using database-configured prompts

**Fix**:

1. Remove `theory_practice_ratio` from line 154
2. Create a new migration to UPDATE the existing prompt template in production database
3. Alternative: Update the seed data and re-run migration (only works for fresh databases)

---

### 3. **Stage 4 Phase 1 Preprocessing References Removed Field**

**File**: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-1-classifier.ts`
**Line**: 218

**Issue**: The preprocessing step attempts to normalize `primary_strategy` enum, which was part of the removed `pedagogical_patterns` field.

```typescript
// Line 212-233 in phase-1-classifier.ts
try {
  const parsedRaw = JSON.parse(preprocessedOutput);
  const preprocessed = preprocessObject(parsedRaw, {
    course_category: 'enum',
    target_audience: 'enum',
    primary_strategy: 'enum',  // ← ISSUE: This field no longer exists
    // Phase 1 specific enum fields
  });
  preprocessedOutput = JSON.stringify(preprocessed);
}
```

**Impact**:

- This won't cause a runtime error (preprocessing just skips unknown fields)
- **BUT**: It indicates incomplete cleanup and dead code
- Could cause confusion for future maintainers
- Wastes CPU cycles checking for a field that will never exist

**Fix**: Remove line 218 (`primary_strategy: 'enum'`).

---

### 4. **Stage 4 Phase 4 Synthesis References Removed Field**

**File**: `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-4-synthesis.ts`
**Line**: 189

**Issue**: Same preprocessing issue as above - attempts to normalize `primary_strategy` which no longer exists.

```typescript
// Line 183-192 in phase-4-synthesis.ts
try {
  const parsedRaw = JSON.parse(preprocessedOutput) as RawPhase4Output;
  if (parsedRaw.generation_instructions) {
    parsedRaw.generation_instructions = preprocessObject(
      parsedRaw.generation_instructions as Record<string, unknown>,
      {
        target_audience: 'enum',
        difficulty_level: 'enum',
        primary_strategy: 'enum',  // ← ISSUE: This field no longer exists
      }
    );
  }
}
```

**Impact**: Same as issue #3 - dead code, not a runtime error, but indicates incomplete cleanup.

**Fix**: Remove line 189 (`primary_strategy: 'enum'`).

---

### 5. **Stage 5 Metadata Generator References Removed Field**

**File**: `packages/course-gen-platform/src/stages/stage5-generation/utils/metadata-generator.ts`
**Line**: 262

**Issue**: Preprocessing attempts to normalize `primary_strategy` in `pedagogical_strategy` object.

```typescript
// Line 258-265 in metadata-generator.ts
if (parsedRaw.pedagogical_strategy) {
  parsedRaw.pedagogical_strategy = preprocessObject(
    parsedRaw.pedagogical_strategy as Record<string, unknown>,
    {
      primary_strategy: 'enum', // ← ISSUE: This field no longer exists
    }
  );
}
```

**Impact**:

- **NOTE**: `pedagogical_strategy` itself still exists in the schema (it's a different object)
- But `primary_strategy` within it was removed as part of `pedagogical_patterns` cleanup
- Dead code, not a runtime error

**Fix**: Remove the entire `if (parsedRaw.pedagogical_strategy)` block (lines 258-265) OR just remove `primary_strategy: 'enum'` if other fields exist.

---

### 6. **Server Embedding Cache Warmup References Removed Field**

**File**: `packages/course-gen-platform/src/server/index.ts`
**Lines**: 120-126

**Issue**: The embedding cache warmup still includes `primary_strategy` enum values for semantic matching.

```typescript
// Line 94-143 in server/index.ts
await warmupEmbeddingCache({
  // ... other enums ...

  // primary_strategy
  primary_strategy: [
    'problem-based learning',
    'lecture-based',
    'inquiry-based',
    'project-based',
    'mixed',
  ],

  // ... other enums ...
});
```

**Impact**:

- Wastes CPU/memory embedding values that will never be validated
- Not a runtime error (just inefficiency)
- Could slow down server startup slightly

**Fix**: Remove the `primary_strategy` array (lines 120-126).

---

### 7. **Enum Synonyms Still Define Removed Field**

**File**: `packages/course-gen-platform/src/shared/validation/enum-synonyms.ts`
**Lines**: 16-26

**Issue**: The synonym mappings still include `primary_strategy` field.

```typescript
// Line 11-26 in enum-synonyms.ts
export const ENUM_SYNONYMS: Record<string, Record<string, string>> = {
  // REMOVED 2025-11-19: exercise_types and exercise_type are now freeform text fields
  // See: docs/investigations/INV-2025-11-19-002-exercise-type-enum-to-text-migration.md
  // Legacy mappings preserved in git history if needed for rollback

  // primary_strategy
  primary_strategy: {
    'problem based learning': 'problem-based learning',
    problem_based_learning: 'problem-based learning',
    'lecture based': 'lecture-based',
    lecture_based: 'lecture-based',
    'inquiry based': 'inquiry-based',
    inquiry_based: 'inquiry-based',
    'project based': 'project-based',
    project_based: 'project-based',
  },
```

**Impact**:

- Dead code (mappings will never be used)
- Not a runtime error
- Could confuse future maintainers

**Fix**: Remove the `primary_strategy` block (lines 16-26).

---

## Completeness Check

✅ **Removed from shared-types**:

- `PedagogicalPatterns` type definition
- `theory_practice_ratio` field
- `primary_strategy` field
- `key_patterns` field
- All related Zod schemas in `analysis-schemas.ts`

✅ **Removed from Stage 4 backend**:

- Most references cleaned up
- ❌ **EXCEPT**: Prompt still references it (issues #1, #2, #3, #4)

✅ **Removed from Stage 5 generation**:

- `formatPedagogicalPatternsForPrompt` function removed
- Most references cleaned up
- ❌ **EXCEPT**: Preprocessing still checks for it (issue #5)

✅ **Removed from frontend**:

- `AnalysisResultView.tsx` cleaned up
- i18n keys removed from `en/generation.json` and `ru/generation.json`

✅ **Removed from tests**:

- Test fixtures updated
- Test cases removed

❌ **NOT fully removed from shared utils**:

- `enum-synonyms.ts` still has mappings (issue #7)
- Server warmup cache still includes it (issue #6)

---

## Grep Analysis for Remaining References

### ✅ No remaining references:

- `pedagogical_patterns` - **0 matches**
- `PedagogicalPatterns` - **0 matches**
- `pedagogicalPatterns` - **0 matches**
- `theory_practice_ratio` - **1 match** (database migration SQL - issue #2)
- `theoryPracticeRatio` - **0 matches**
- `key_patterns` - **0 matches**
- `keyPatterns` - **0 matches**

### ⚠️ Remaining references to `primary_strategy`:

- **6 matches** found (all documented as issues #3-#7 above)
- These are in **generic** contexts (preprocessing, enum warmup, synonyms)
- **NOT** in the context of `pedagogical_patterns` specifically
- However, `primary_strategy` was a field within `pedagogical_patterns.primary_strategy`, so these should be cleaned up

---

## Database Considerations

### Analysis Result JSONB Column

The `courses.analysis_result` column (JSONB) still contains `pedagogical_patterns` in **old records**. This is **acceptable** and **no migration is needed** because:

✅ **Reason 1**: JSONB is schemaless - old data can coexist with new data
✅ **Reason 2**: Code no longer accesses `pedagogical_patterns` field
✅ **Reason 3**: Adding a migration to remove it from all records would be expensive and unnecessary

### Prompt Templates Table

❌ **Issue #2 CRITICAL**: The `prompt_templates` table contains a seeded template that references `theory_practice_ratio`. This **MUST** be fixed with a database migration.

---

## Recommendations

### Immediate Actions (Before Deployment)

1. **Fix Issue #1**: Remove task #5 from Phase 1 prompt in `phase-1-classifier.ts`
2. **Fix Issue #2**: Create migration to UPDATE `stage4_phase1_classification` prompt template
3. **Fix Issue #3**: Remove `primary_strategy` preprocessing in `phase-1-classifier.ts`
4. **Fix Issue #4**: Remove `primary_strategy` preprocessing in `phase-4-synthesis.ts`
5. **Fix Issue #5**: Remove `primary_strategy` preprocessing in `metadata-generator.ts`
6. **Fix Issue #6**: Remove `primary_strategy` from embedding cache warmup
7. **Fix Issue #7**: Remove `primary_strategy` from enum synonyms

### Testing Checklist

After fixes are applied:

- [ ] Run Stage 4 Phase 1 classification and verify no errors
- [ ] Run Stage 4 Phase 4 synthesis and verify no errors
- [ ] Run Stage 5 metadata generation and verify no errors
- [ ] Verify no `primary_strategy` errors in logs
- [ ] Verify prompt templates in database are updated
- [ ] Run full integration test (Stage 1-7 pipeline)
- [ ] Check for any remaining `grep` matches

### Long-term Improvements

None - the removal was conceptually sound, just needs the critical fixes above.

---

## Quality Assessment

### Code Quality: ⚠️ **PARTIAL**

- Most removal work was thorough
- Dead code left in preprocessing and utilities
- Prompt not updated to match schema changes

### Security: ✅ **PASSED**

- No security implications from this change

### Performance: ✅ **PASSED**

- Removal improves performance (fewer tokens, simpler schema)
- Minor inefficiency from dead code (issues #6, #7)

### Logic Integrity: ❌ **FAILED**

- **Critical**: LLM prompt still references removed field
- **Critical**: Database template still references removed field
- Dead code in preprocessing could cause confusion

---

## Conclusion

The removal of `pedagogical_patterns` was **mostly well-executed**, but **7 critical references were missed**. The most severe issue is the **prompt template seeded in the database** which will cause runtime failures if not fixed.

**Action Required**: Fix all 7 issues before deploying this code to production.

**Estimated Fix Time**: 30 minutes
**Risk Level**: High (runtime failures if deployed as-is)

---

## Files Requiring Changes

1. `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-1-classifier.ts` (2 fixes)
2. `packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-4-synthesis.ts` (1 fix)
3. `packages/course-gen-platform/src/stages/stage5-generation/utils/metadata-generator.ts` (1 fix)
4. `packages/course-gen-platform/src/server/index.ts` (1 fix)
5. `packages/course-gen-platform/src/shared/validation/enum-synonyms.ts` (1 fix)
6. `packages/course-gen-platform/supabase/migrations/20251203140500_seed_prompt_templates.sql` (1 fix + new migration)

---

**Review Complete**
**Next Step**: Fix the 7 critical issues listed above, then re-run this review.
