# A26 Decision Log: Code Reuse Analysis (T015-T018 vs Analyze)

**Date**: 2025-11-09
**Task**: A26 - Check if we can reuse Generation utilities (T015-T018)
**Status**: COMPLETE ✅

---

## Executive Summary

**Recommendation**: **KEEP SEPARATE** implementations for Stage 4 Analyze and Stage 5 Generation

**Rationale**:
1. Both implementations already exist and work
2. Different schemas require different field mappings
3. No significant code duplication (utility logic differs)
4. Minimal benefit from extraction (would add complexity)

---

## Detailed Analysis

### T015: json-repair.ts

**Stage 5 Generation** (`src/services/stage5/json-repair.ts`):
- ✅ **Uses jsonrepair library** (installed via T027)
- Strategy: jsonrepair FSM → 4-level custom fallback
- 4 levels: brace counting, quote fixing, trailing comma removal, comment stripping
- Export: `repairJSON()`, `extractJSON()`, `safeJSONParse()`

**Stage 4 Analyze** (`src/orchestrator/services/analysis/json-repair.ts`):
- ❌ **Does NOT use jsonrepair** (custom 5-strategy FSM only)
- 5 strategies: as_is, remove_trailing_commas, add_closing_brackets, fix_unquoted_keys, truncate_incomplete_strings
- Export: `repairJSON()` only

**Differences**:
| Feature | Generation (T015) | Analyze (Current) |
|---------|------------------|-------------------|
| jsonrepair library | ✅ Installed | ❌ Not installed |
| Repair strategies | 4-level fallback | 5-strategy FSM |
| Comment stripping | ✅ Yes | ❌ No |
| Extract JSON | ✅ Yes | ❌ No |
| Safe JSON parse | ✅ Yes | ❌ No |

**Decision for T015**:
- ❌ **DO NOT extract to shared package** (implementations too different)
- ✅ **Install jsonrepair in Analyze** (A27)
- ✅ **Enhance Analyze json-repair.ts** (A28) - add jsonrepair as first strategy

---

### T016: field-name-fix.ts

**Stage 5 Generation** (`src/services/stage5/field-name-fix.ts`):
- Mapping: camelCase → snake_case
- Fields: courseTitle, sectionTitle, lessonTitle, exerciseType, etc. (80 mappings)
- Schema: **GenerationResult schema** (course structure)
- Function: `fixFieldNames()`, `fixFieldNamesWithLogging()`

**Stage 4 Analyze** (NOT YET IMPLEMENTED):
- Would need: camelCase → snake_case
- Fields: courseCategory, topicAnalysis, recommendedStructure, pedagogicalStrategy, etc.
- Schema: **AnalysisResult schema** (analysis metadata)
- Function: Same signature `fixFieldNames()`

**Overlap**:
- ✅ Same logic (camelCase → snake_case conversion)
- ❌ **Different field mappings** (Generation vs Analyze schemas)
- ❌ Zero code duplication (algorithm is trivial: `.replace(/[A-Z]/g, ...`)

**Decision for T016**:
- ❌ **DO NOT extract to shared package** (trivial algorithm, different mappings)
- ✅ **Duplicate implementation** in Analyze (A29) - copy logic, create ANALYZE_FIELD_MAPPING
- Benefit: Each stage owns its own schema-specific mappings
- Cost: ~100 lines duplication (acceptable for clarity)

---

### T017: validators/

**Stage 5 Generation** (`src/server/services/generation/validators/`):
- Bloom's taxonomy validators (validateBloomLevel, taxonomyRules)
- Placeholder detection (`hasTodoPlaceholders()`, `hasFixmePlaceholders()`)
- Lesson structure validators (objectives, topics, key points)

**Stage 4 Analyze** (Potential Use):
- ❌ **Does NOT need Bloom validators** (Bloom is Generation concern)
- ✅ **Could use placeholder detection** (detect TODO/FIXME in analysis_result)

**Decision for T017**:
- ❌ **DO NOT reuse validators** (Bloom is Generation-specific)
- ✅ **Implement placeholder detection in Analyze** (if needed, future task)
- Reason: Analyze validators already exist (`analysis-validators.ts`)

---

### T018: sanitize-course-structure.ts

**Stage 5 Generation** (`src/services/stage5/sanitize-course-structure.ts`):
- Uses DOMPurify to sanitize HTML in course content
- Prevents XSS attacks from LLM-generated content
- Applies to: lesson text, exercise descriptions, etc.

**Stage 4 Analyze** (Potential Use):
- ❌ **Does NOT generate HTML** (only JSON metadata)
- ❌ **No XSS risk** (analysis_result is metadata, not user-facing content)

**Decision for T018**:
- ❌ **DO NOT use in Analyze** (no HTML content, no XSS risk)
- ✅ **Keep in Generation only**

---

## Final Recommendations

### Question 1: Extract T015 (json-repair.ts) to shared package?

**Answer**: ❌ **NO** - Keep separate implementations

**Rationale**:
- Implementations differ significantly (jsonrepair + 4-level vs 5-strategy FSM)
- Analyze needs enhancement (add jsonrepair), not replacement
- Extracting would require conditional logic (stage-specific strategies)
- Benefit < Complexity

**Action**: A27-A28 (install jsonrepair in Analyze, integrate as first strategy)

---

### Question 2: Reuse T016 (field-name-fix.ts)?

**Answer**: ❌ **NO** - Duplicate with Analyze-specific mappings

**Rationale**:
- Algorithm is trivial (`.replace(/[A-Z]/g, ...)` - 5 lines)
- Field mappings are schema-specific (Generation ≠ Analyze)
- No benefit from extraction (would need schema parameter)
- Duplication cost: ~100 lines (acceptable)

**Action**: A29 (create Analyze field-name-fix.ts with ANALYZE_FIELD_MAPPING)

---

### Question 3: Are validators from T017 useful for Analyze?

**Answer**: ⚠️ **PARTIAL** - Placeholder detection maybe, Bloom validators no

**Rationale**:
- Bloom validators are Generation-specific (lesson content quality)
- Placeholder detection could be useful (detect TODO/FIXME in analysis_result)
- Analyze already has comprehensive validators (`analysis-validators.ts`)

**Action**: ✅ **SKIP** for now (implement placeholder detection if needed in future)

---

## Code Reuse Strategy

### Shared Package Creation: ❌ **NOT RECOMMENDED**

**Reasons**:
1. No significant code duplication (algorithms differ)
2. Schema-specific mappings (Generation ≠ Analyze)
3. Would add complexity (need schema/stage parameters)
4. Minimal maintenance burden (utilities are stable)

**Alternative**: Keep stage-specific utilities, document patterns

---

## Task Sequence After A26

### A27: Install jsonrepair (REQUIRED)
```bash
pnpm add jsonrepair --filter @megacampus/course-gen-platform
```

### A28: Enhance Analyze json-repair.ts (REQUIRED)
- Add jsonrepair as **first strategy** (before custom FSM)
- Keep existing 5-strategy FSM as fallback
- Add `extractJSON()` utility (copy from Generation)
- Add `safeJSONParse()` utility (copy from Generation)

### A29: Create Analyze field-name-fix.ts (OPTIONAL, NICE-TO-HAVE)
- Copy algorithm from Generation field-name-fix.ts
- Create `ANALYZE_FIELD_MAPPING` with Analyze schema fields
- Export `fixFieldNames()` for Analyze usage

---

## Metrics & Benefits

**Code Reuse**: 0% (keep separate implementations)
**Code Duplication**: ~200 lines (field-name-fix logic + mappings)
**Maintenance Cost**: LOW (utilities are stable, schemas independent)
**Benefit**: HIGH (clarity, stage-specific ownership, no coupling)

---

## Conclusion

**Decision**: **KEEP SEPARATE** implementations for Stage 4 Analyze and Stage 5 Generation

**Confidence**: HIGH ✅

**Next Actions**:
1. ✅ A27: Install jsonrepair library
2. ✅ A28: Integrate jsonrepair into Analyze json-repair.ts
3. ⏸️ A29: Create Analyze field-name-fix.ts (optional, NICE-TO-HAVE)

**Estimated Effort**: A27-A28 (~1-2 hours), A29 (~1 hour if needed)

---

**Reviewed By**: Claude Code Orchestrator
**Approved**: 2025-11-09
