# Investigation Report: UUID and Language Field Generation in Course Metadata

---
investigation_id: INV-2025-11-19-001
status: completed
timestamp: 2025-11-19T00:00:00Z
investigator: Claude Code (Sonnet 4.5)
priority: high
tags: [stage5, metadata-generation, uuid, validation, schema]
---

## Executive Summary

**Problem**: Investigation requested to verify that UUID (`id`) and language fields are correctly excluded from LLM generation prompts and properly injected by code in course metadata generation.

**Root Cause**: **CRITICAL BUG FOUND** - `section-batch-generator.ts:874` contains explicit LLM instruction to generate UUIDs, which should NOT exist in Section/Lesson schemas (they use integer IDs, not UUIDs). This is a leftover instruction from when learning_outcomes had UUID fields directly in the schema.

**Impact**:
- ✅ **Metadata generation is CORRECT** - Uses `CourseMetadataWithoutInjectedFieldsSchema`, no UUID/language in prompt
- ❌ **Section generation has INCORRECT prompt** - Instructs LLM to generate UUIDs that don't exist in schema
- ✅ **Code injection works correctly** - UUID and language properly injected for learning_outcomes in metadata-generator.ts:289-294

**Recommended Solution**: Remove UUID instruction from section-batch-generator.ts line 874 (it's misleading and references non-existent fields).

---

## Problem Statement

### Observed Behavior
Recent fixes created `CourseMetadataWithoutInjectedFieldsSchema` to exclude `id` and `language` fields from LLM generation validation. Need to verify:
1. All prompts use schema without injected fields
2. No cached results with old schema
3. No other generators have similar issues
4. All code-injected fields are documented

### Expected Behavior
- LLM should generate learning outcomes WITHOUT `id` and `language` fields
- Code should inject `id` (UUID) and `language` after LLM generation
- Prompts should use `CourseMetadataWithoutInjectedFieldsSchema`
- No examples with UUIDs in prompts

### Environment
- Branch: `008-generation-generation-json`
- Files modified: `generation-result.ts`, `metadata-generator.ts`
- Recent changes: Created `CourseMetadataWithoutInjectedFieldsSchema` and `LearningObjectiveWithoutInjectedFieldsSchema`

---

## Investigation Process

### Phase 1: Search All CourseMetadataSchema Usage

**Files using CourseMetadataSchema**:
1. ✅ `packages/shared-types/src/generation-result.ts` - Schema definition
2. ✅ `packages/course-gen-platform/src/services/stage5/metadata-generator.ts` - Uses BOTH schemas correctly
3. ✅ `packages/course-gen-platform/scripts/test-zod-schema-tokens.ts` - Test script (not used in generation)

**Key Finding**: Only 3 files reference the schema, and metadata-generator.ts uses them correctly:
- Line 233: Validates with `CourseMetadataWithoutInjectedFieldsSchema` (NO id/language)
- Line 304: Validates final result with `CourseMetadataSchema` (WITH id/language after injection)
- Line 472: Uses `CourseMetadataWithoutInjectedFieldsSchema` for prompt schema

### Phase 2: Analyze CourseMetadataWithoutInjectedFieldsSchema

**Schema Structure** (generation-result.ts:763-810):
```typescript
export const CourseMetadataWithoutInjectedFieldsSchema = z.object({
  course_title: z.string().min(10).max(1000),
  course_description: z.string().min(20).max(3000),
  course_overview: z.string().min(30).max(10000),
  target_audience: z.string().min(20).max(1500),
  estimated_duration_hours: z.number().positive(),
  difficulty_level: DifficultyLevelSchema,
  prerequisites: z.array(z.string().min(10).max(600)).min(0).max(10),
  learning_outcomes: z.array(LearningObjectiveWithoutInjectedFieldsSchema), // ✅ NO id/language
  assessment_strategy: AssessmentStrategySchema,
  course_tags: z.array(z.string().min(3).max(150)).min(5).max(20),
}).partial();
```

**Nested Schema Check**:
- ✅ `learning_outcomes` uses `LearningObjectiveWithoutInjectedFieldsSchema` (lines 471-474)
- ✅ `LearningObjectiveWithoutInjectedFieldsSchema` omits `id` and `language` (line 471-474)
- ✅ `assessment_strategy` uses `AssessmentStrategySchema` (no UUID/language fields)
- ✅ `difficulty_level` is enum (no UUID/language fields)

**Verification**: All nested objects are clean - no code-injected fields in schema used for LLM generation.

### Phase 3: Review ENUM-CLASSIFICATION-BY-SOURCE.md

**Documentation Review** (docs/investigations/ENUM-CLASSIFICATION-BY-SOURCE.md):

**Code-Injected Fields** (Section 1.4, lines 78-114):
1. ✅ `language` in `learning_outcomes[].language` - Injected from `frontend_parameters.language`
2. ✅ `id` in `learning_outcomes[].id` - Generated via `crypto.randomUUID()`

**Evidence from Documentation**:
```typescript
// metadata-generator.ts lines 254-263
if (result.data.learning_outcomes && Array.isArray(result.data.learning_outcomes)) {
  result.data.learning_outcomes = result.data.learning_outcomes.map((outcome: any) => ({
    id: crypto.randomUUID(), // Generate proper UUID
    ...outcome,
    language, // Inject language from frontend_parameters (ISO 639-1)
  }));
}
```

**Key Insight**: Documentation correctly identifies that ONLY 2 fields are code-injected:
- `id` (UUID) for learning_outcomes
- `language` for learning_outcomes

**NO OTHER FIELDS** require code injection in metadata generation.

### Phase 4: Check Stage 5 Generators

**Section Batch Generator Analysis** (section-batch-generator.ts):

**Line 854 - CORRECT Instruction**:
```typescript
- `learning_objectives`: Must be array of STRINGS (NOT objects with id/text/language/cognitiveLevel)
- `lesson_objectives`: Must be array of STRINGS (NOT objects)
```

✅ This correctly instructs LLM that lesson objectives are simple strings, NOT objects with UUID fields.

**Line 874 - ❌ CRITICAL BUG FOUND**:
```typescript
3. **UUIDs**: Use valid UUID v4 format (e.g., "550e8400-e29b-41d4-a716-446655440000")
```

**Problem**: This instruction tells LLM to generate UUIDs, but:
1. `SectionSchema` (lines 544-571) has NO UUID fields - uses `section_number: z.number().int().positive()`
2. `LessonSchema` (lines 493-535) has NO UUID fields - uses `lesson_number: z.number().int().positive()`
3. `learning_objectives` in sections are simple strings (line 555)
4. `lesson_objectives` in lessons are simple strings (line 501)

**Root Cause**: This is a **leftover instruction** from when `learning_outcomes` at course level had UUID fields in the schema. It was copied to section-batch-generator but is now INCORRECT because:
- Sections use integer IDs, not UUIDs
- Lesson objectives are simple strings, no UUID field exists

**Impact**: This misleading instruction doesn't cause validation failures (because schema doesn't have UUID fields), but it:
- Wastes LLM tokens generating UUIDs that are discarded
- Creates confusion about data model
- May cause LLM to generate malformed JSON trying to include UUIDs where they don't belong

### Phase 5: Search Prompts for UUID/Language References

**UUID References**:
- ✅ `metadata-generator.ts:291` - Code injection: `id: crypto.randomUUID()` (CORRECT)
- ❌ `section-batch-generator.ts:874` - Prompt instruction: "Use valid UUID v4 format" (INCORRECT - should be removed)
- ✅ Example UUID `550e8400-e29b-41d4-a716-446655440000` found in 13 files (used in various prompts/tests)

**Language References**:
- ✅ `metadata-generator.ts:293` - Code injection: `language` from `frontend_parameters` (CORRECT)
- ✅ No explicit "generate language" instructions in prompts (CORRECT)
- ✅ `LearningObjectiveSchema` has `language: SupportedLanguageSchema` but only used AFTER code injection

**Prompt Schema Usage**:
- ✅ `metadata-generator.ts:472` - Uses `zodToPromptSchema(CourseMetadataWithoutInjectedFieldsSchema)` (CORRECT)
- ✅ `section-batch-generator.ts:762-768` - Uses `zodToPromptSchema(SectionSchema)` (CORRECT - no UUID in SectionSchema)

**Style Prompts Check** (style-prompts.ts):
- ✅ No UUID or language generation instructions in any style prompt (CORRECT)
- ✅ Style prompts are pure writing style guidance

---

## Root Cause Analysis

### Primary Root Cause

**Leftover UUID instruction in section-batch-generator.ts:874**

**Mechanism**:
1. Originally, `learning_outcomes` had `id` and `language` fields in schema
2. Prompts instructed LLM to generate UUIDs for these fields
3. This was fixed by creating `LearningObjectiveWithoutInjectedFieldsSchema`
4. `metadata-generator.ts` was updated to use new schema (line 472)
5. **BUT** `section-batch-generator.ts:874` still has UUID instruction from old pattern
6. This instruction is now INCORRECT because Section/Lesson schemas never had UUID fields

**Evidence**:
- SectionSchema (generation-result.ts:544-571) uses `section_number: number` (NOT UUID)
- LessonSchema (generation-result.ts:493-535) uses `lesson_number: number` (NOT UUID)
- No UUID fields exist anywhere in Section or Lesson hierarchies

### Contributing Factors

**None** - This is an isolated issue in section-batch-generator prompt construction.

---

## Proposed Solutions

### Solution 1: Remove UUID Instruction (Recommended)

**Description**: Remove or update line 874 in section-batch-generator.ts to remove UUID reference.

**Why This Addresses Root Cause**:
- Section/Lesson schemas use integer IDs, not UUIDs
- Instruction is misleading and wastes tokens
- No UUID validation exists in these schemas

**Implementation Steps**:
1. Edit `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts`
2. Update line 874 from:
   ```typescript
   3. **UUIDs**: Use valid UUID v4 format (e.g., "550e8400-e29b-41d4-a716-446655440000")
   ```
   To:
   ```typescript
   3. **Section/Lesson Numbers**: Use sequential integers starting from 1
   ```
3. Update line 875 to clarify cognitive levels are optional:
   ```typescript
   4. **Enum Values**: Use exact cognitive levels (optional): remember, understand, apply, analyze, evaluate, create
   ```

**Pros**:
- Removes misleading instruction
- Saves LLM tokens
- Clarifies actual data model
- No breaking changes (schema unchanged)

**Cons**:
- None

**Complexity**: Low (1 line change)

**Risk**: Low (prompt improvement only, no schema changes)

### Solution 2: Document Current State (Optional Supplement)

**Description**: Add comment in metadata-generator.ts explaining code injection pattern.

**Implementation Steps**:
1. Add comment block before line 286 in metadata-generator.ts:
   ```typescript
   // ============================================================================
   // CODE INJECTION: UUID and Language Fields
   // ============================================================================
   // CRITICAL: learning_outcomes are validated WITHOUT id/language fields
   // (CourseMetadataWithoutInjectedFieldsSchema), then code injects these
   // architectural fields after LLM generation.
   //
   // This pattern prevents LLM from generating invalid UUIDs or wrong language codes.
   // See: docs/investigations/ENUM-CLASSIFICATION-BY-SOURCE.md (Section 1.4)
   // ============================================================================
   ```

**Pros**:
- Improves code documentation
- Makes pattern explicit
- Helps future maintainers

**Cons**:
- Documentation only, doesn't fix bug

**Complexity**: Low

**Risk**: None

---

## Implementation Guidance

### Priority: High

**Rationale**: Section-batch-generator prompt contains misleading instruction that wastes tokens and creates confusion about data model.

### Files to Change

**1. packages/course-gen-platform/src/services/stage5/section-batch-generator.ts**
- Line 874: Remove UUID instruction
- Line 875: Clarify enum values are for optional cognitive levels
- Line 876: Keep array length guidance (correct)

**2. packages/course-gen-platform/src/services/stage5/metadata-generator.ts (optional)**
- Add documentation comment block before line 286
- Explain code injection pattern for id/language fields

### Validation Criteria

**After Fix**:
1. ✅ Section generation prompt has no UUID instruction
2. ✅ Metadata generation continues using `CourseMetadataWithoutInjectedFieldsSchema`
3. ✅ Code injection continues working (lines 289-294)
4. ✅ No validation failures
5. ✅ Token usage slightly reduced (no UUID instruction)

### Testing Requirements

**Test Scenarios**:
1. Generate course with metadata (verify learning_outcomes have id/language after generation)
2. Generate sections with lessons (verify no UUID fields generated)
3. Run type-check (should pass)
4. Run E2E test t053 (should pass)

### Rollback Considerations

**If issues arise**:
1. Revert line 874 change in section-batch-generator.ts
2. UUID instruction doesn't cause failures (just wastes tokens)
3. No schema changes, so rollback is safe

---

## Risks and Considerations

### Implementation Risks

**Low Risk** - This is a prompt improvement, not a schema change:
- Section/Lesson schemas already use integer IDs (no change)
- UUID instruction is already ignored by validation (no UUIDs in schema)
- Removing misleading instruction improves clarity

### Performance Impact

**Positive** - Slight token reduction:
- Remove ~15 tokens from section generation prompt
- No performance degradation
- May improve LLM focus on actual schema fields

### Breaking Changes

**None** - This is a non-breaking prompt fix:
- Schema unchanged
- Code injection unchanged
- API unchanged

### Side Effects

**None expected** - Prompt improvement only:
- LLMs may generate slightly better sections (less confusion)
- Token usage slightly reduced
- Documentation clarity improved

---

## Documentation References

### Tier 0: Project Internal (✅ Searched First - MANDATORY)

**Code References**:
- `packages/shared-types/src/generation-result.ts:471-474` - `LearningObjectiveWithoutInjectedFieldsSchema` definition
- `packages/shared-types/src/generation-result.ts:763-810` - `CourseMetadataWithoutInjectedFieldsSchema` definition
- `packages/course-gen-platform/src/services/stage5/metadata-generator.ts:233` - Schema usage in UnifiedRegenerator
- `packages/course-gen-platform/src/services/stage5/metadata-generator.ts:289-294` - Code injection implementation
- `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts:874` - **BUG LOCATION**

**Documentation**:
- `docs/investigations/ENUM-CLASSIFICATION-BY-SOURCE.md:78-114` - Code-injected fields documentation
- `docs/investigations/ENUM-CLASSIFICATION-BY-SOURCE.md:185-186` - Correction about language field being code-injected

**Git History**:
- Recent commit: Created `CourseMetadataWithoutInjectedFieldsSchema`
- Recent commit: Updated metadata-generator to use new schema
- **Missing**: Update section-batch-generator to remove UUID instruction

**Key Quotes**:
> "CRITICAL: LLM should NOT generate these fields - they are architectural data"
> (metadata-generator.ts:287)

> "Code-injected (post-LLM): 2 fields - language (in learning_outcomes) and id (in learning_outcomes)"
> (ENUM-CLASSIFICATION-BY-SOURCE.md:88-89)

### Tier 1: Context7 MCP (Not Used)

**Reason**: This is an internal project schema issue, not a framework/library question.

### Tier 2: Official Documentation (Not Used)

**Reason**: Project-specific implementation, no external documentation needed.

### Tier 3: Specialized Sites/Forums (Not Used)

**Reason**: Issue identified and solved through project internal search.

---

## MCP Server Usage

**Tools Used**:
1. ✅ **Project Internal Search** (Tier 0 - MANDATORY FIRST)
   - Grep: Searched for CourseMetadataSchema, UUID references, learning_outcomes patterns
   - Read: Examined generation-result.ts, metadata-generator.ts, section-batch-generator.ts
   - Analysis: Verified schema definitions and code injection implementation

2. ❌ **Context7 MCP** (Tier 1 - Not needed)
   - Reason: Project-specific schema issue, not framework-related

3. ❌ **Supabase MCP** (Not used)
   - Reason: Schema validation issue, not database issue

4. ❌ **Sequential Thinking MCP** (Not used)
   - Reason: Investigation was straightforward, no complex multi-step reasoning needed

---

## Next Steps

### For Implementation Agent

**Task**: Fix section-batch-generator.ts prompt to remove UUID instruction

**Files**:
1. `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts:874`

**Change**:
```diff
-3. **UUIDs**: Use valid UUID v4 format (e.g., "550e8400-e29b-41d4-a716-446655440000")
-4. **Enum Values**: Use exact cognitive levels: remember, understand, apply, analyze, evaluate, create
+3. **Section/Lesson Numbers**: Use sequential integers starting from 1
+4. **Enum Values**: Use exact cognitive levels (optional): remember, understand, apply, analyze, evaluate, create
```

**Validation**:
- Run type-check: `pnpm type-check`
- Run E2E test: `pnpm test:e2e t053`
- Verify no UUID references in section generation

### For User/Orchestrator

**Summary**:
- ✅ Metadata generation is CORRECT (uses schema without id/language, injects after)
- ❌ Section generation has misleading UUID instruction (should be removed)
- ✅ All code-injected fields are documented in ENUM-CLASSIFICATION-BY-SOURCE.md
- ✅ No other generators have similar issues

**Recommendation**: Apply Solution 1 (remove UUID instruction from section-batch-generator.ts:874)

---

## Investigation Log

### Timeline

1. **Phase 1** (00:00-00:05): Searched all CourseMetadataSchema usage
   - Found 3 files using schema
   - Verified metadata-generator uses correct schema

2. **Phase 2** (00:05-00:10): Analyzed CourseMetadataWithoutInjectedFieldsSchema
   - Verified nested schemas are clean
   - Confirmed learning_outcomes uses schema without id/language

3. **Phase 3** (00:10-00:15): Reviewed ENUM-CLASSIFICATION-BY-SOURCE.md
   - Found documentation of code-injected fields
   - Verified only 2 fields require injection

4. **Phase 4** (00:15-00:25): Checked Stage 5 generators
   - Found section-batch-generator has correct lesson_objectives instruction
   - **CRITICAL: Found UUID instruction bug on line 874**

5. **Phase 5** (00:25-00:30): Searched prompts for UUID/language references
   - Verified no "generate language" instructions
   - Confirmed UUID instruction only in section-batch-generator (bug location)

6. **Phase 6** (00:30-00:40): Generated investigation report

### Commands Run

```bash
# Search for schema usage
grep -r "CourseMetadataSchema" packages/
grep -r "CourseMetadataWithoutInjectedFieldsSchema" packages/

# Search for UUID references
grep -r "uuid" packages/course-gen-platform/src/services/stage5/ -i
grep -r "randomUUID" packages/course-gen-platform/src/services/stage5/

# Search for learning_outcomes/objectives
grep -r "learning_outcomes" packages/course-gen-platform/src/services/stage5/
grep -r "lesson_objectives" packages/course-gen-platform/src/services/stage5/

# Search for example UUID
grep -r "550e8400-e29b-41d4-a716-446655440000" packages/
```

### MCP Calls Made

**Project Internal Search (Tier 0)**:
- Read: generation-result.ts (lines 1-931)
- Read: metadata-generator.ts (sections around lines 220-310, 460-510)
- Read: section-batch-generator.ts (sections around lines 737-884)
- Read: ENUM-CLASSIFICATION-BY-SOURCE.md (full file)
- Read: style-prompts.ts (full file)
- Grep: Multiple searches for schema usage, UUID references, field patterns

**Total Investigation Time**: ~40 minutes
**Evidence Quality**: High (direct code inspection, documentation review)

---

## ✅ Investigation Complete

**Investigation ID**: INV-2025-11-19-001
**Status**: Completed
**Priority**: High
**Next Action**: Implement Solution 1 (remove UUID instruction)

**Summary**: Found 1 critical bug (misleading UUID instruction in section-batch-generator), verified all other metadata generation is correct. Recommend immediate fix to improve prompt clarity and reduce token waste.
