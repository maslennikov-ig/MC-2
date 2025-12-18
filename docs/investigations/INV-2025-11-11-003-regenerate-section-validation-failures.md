---
investigation_id: INV-2025-11-11-003
status: completed
timestamp: 2025-11-11T12:00:00Z
investigator: Claude Code (Investigation Agent)
test_file: tests/contract/generation.test.ts
affected_tests:
  - "should regenerate section successfully"
previous_issue: INV-2025-11-11-001 (timeout hang - SOLVED)
current_issue: Input validation failures after timeout fix
---

# Investigation Report: Regenerate Section Validation Failures

## Executive Summary

**Problem**: After fixing the timeout hang (added `timeout: 300000`), the "should regenerate section successfully" test NOW FAILS with input validation errors instead of hanging indefinitely.

**Root Cause**: Test fixture `createMinimalAnalysisResult()` generates analysis_result data that does NOT match the `AnalysisResultSchema` expected by GenerationJobInputSchema validation in Phase 1 (validate_input).

**Key Finding**: The test fixture was created based on Stage 4 (Analyze) output schema, but Stage 5 (Generation) expects a **simplified, different schema** with:
- Different field names (e.g., `category` not `course_category`)
- Different field types (e.g., `contextual_language` is string not object)
- Different required fields (e.g., missing `difficulty`, `needs_research`)

**Recommended Solution**: Update `createMinimalAnalysisResult()` in test file to match `AnalysisResultSchema` from `packages/shared-types/src/generation-job.ts`.

**Impact**: Test is correctly identifying a schema mismatch between Stage 4 and Stage 5. This is a test data issue, not a production bug. However, it may indicate a larger schema evolution problem.

---

## Problem Statement

### Observed Behavior

**Test**: `should regenerate section successfully` (line 855 in generation.test.ts)

**Current Status**: Test NO LONGER HANGS (timeout fix successful) but FAILS with validation errors:

```
{"level":50,"phase":"validate_input","errors":[
  "analysis_result.category: Required",
  "analysis_result.difficulty: Required",
  "analysis_result.contextual_language: Expected string, received object",
  "analysis_result.pedagogical_strategy: Expected string, received object",
  "analysis_result.needs_research: Required",
  "frontend_parameters.style: Expected 'academic' | 'conversational' | ... received null"
]}

{"level":40,"layer":"auto-repair","error":"Layer 1: Quality validation failed"}
{"level":40,"layer":"critique-revise","error":"Layer 2: Quality validation failed"}

{"msg":"Section generation failed, retrying with stricter prompt",
 "error":"Failed to parse sections: All regeneration layers exhausted"}
```

**Timeline**:
1. **Previous Issue (SOLVED)**: Test hung indefinitely due to missing `timeout` in ChatOpenAI initialization
2. **Fix Applied**: Added `timeout: 300000` (5 minutes) to ChatOpenAI at section-batch-generator.ts:842
3. **New Problem**: Test now progresses but fails validation, cycles through regeneration layers, times out after >6 minutes

### Expected Behavior

1. Test fixture should provide valid `analysis_result` that passes `GenerationJobInputSchema` validation
2. Phase 1 (validate_input) should succeed
3. Section generation should proceed to Phase 2 (generate_metadata)
4. Test should complete within reasonable time (<2 minutes)

### Environment

- Test file: `packages/course-gen-platform/tests/contract/generation.test.ts`
- Test framework: Vitest
- Validation: GenerationJobInputSchema (Stage 5 input validation)
- Service: SectionRegenerationService → SectionBatchGenerator → GenerationOrchestrator
- Schema: `packages/shared-types/src/generation-job.ts`

---

## Investigation Process

### Hypotheses Tested

1. ✅ **Hypothesis 1**: Test fixture schema doesn't match GenerationJobInputSchema
   - **Evidence**: Validation errors show missing/mismatched fields
   - **Status**: CONFIRMED (root cause)

2. ✅ **Hypothesis 2**: Stage 4 and Stage 5 use different analysis_result schemas
   - **Evidence**: AnalysisResultSchema in generation-job.ts differs from full Stage 4 output
   - **Status**: CONFIRMED (schema evolution)

3. ❌ **Hypothesis 3**: LLM generates invalid JSON responses
   - **Evidence**: Validation fails BEFORE LLM invocation (Phase 1: validate_input)
   - **Status**: REJECTED (error is earlier in pipeline)

4. ❌ **Hypothesis 4**: Quality validation is too strict for contract tests
   - **Evidence**: Input validation fails, quality validation never reached
   - **Status**: REJECTED (not a quality issue)

### Files Examined

**Test Files** (1 file):
- `/home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform/tests/contract/generation.test.ts` (lines 64-141, 356-403, 855-900)

**Schema Definitions** (1 file):
- `/home/me/code/megacampus2-worktrees/generation-json/packages/shared-types/src/generation-job.ts` (lines 24-54, 70-92, 135-154)

**Service Implementation** (3 files):
- `/home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform/src/services/stage5/generation-phases.ts` (lines 140-195)
- `/home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform/src/services/stage5/section-batch-generator.ts` (lines 154-279, 830-844)
- `/home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform/src/services/stage5/section-regeneration-service.ts` (lines 108-244)

**Validation Logic** (2 files):
- `/home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform/src/shared/regeneration/unified-regenerator.ts` (lines 1-200, 304-334)
- `/home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform/src/server/routers/generation.ts` (lines 1310-1424)

### Commands Executed

```bash
# Read test file and fixtures
read tests/contract/generation.test.ts (lines 64-141, 356-403)

# Read schema definitions
read packages/shared-types/src/generation-job.ts

# Read validation logic
read packages/course-gen-platform/src/services/stage5/generation-phases.ts (validate_input phase)

# Read section regeneration flow
read packages/course-gen-platform/src/services/stage5/section-regeneration-service.ts
read packages/course-gen-platform/src/services/stage5/section-batch-generator.ts

# Read regeneration layers
read packages/course-gen-platform/src/shared/regeneration/unified-regenerator.ts

# Search for schema patterns
grep -r "GenerationJobInputSchema" packages/
grep -r "AnalysisResultSchema" packages/
```

---

## Root Cause Analysis

### Primary Cause: Schema Mismatch Between Test Fixture and Stage 5 Schema

**Root Cause**: The test helper function `createMinimalAnalysisResult()` (lines 64-141 in generation.test.ts) creates an `analysis_result` object based on **Stage 4 (Analyze) full output schema**, but Stage 5 (Generation) validates against a **simplified AnalysisResultSchema** with different field names, types, and required fields.

**Mechanism of Failure**:

#### Step-by-Step Execution Flow

1. **Test Setup** (line 861 in generation.test.ts)
   ```typescript
   const courseId = await createTestCourseWithStructure('Test Course - Regenerate Section');
   ```
   - Calls `createTestCourseWithStructure()` which creates course with:
     - `analysis_result: createMinimalAnalysisResult(title)`
     - `course_structure: mockStructure`

2. **Test Invokes Endpoint** (line 871)
   ```typescript
   result = await client.generation.regenerateSection.mutate({
     courseId,
     sectionNumber: 1,
   });
   ```

3. **tRPC Router** (line 1407 in generation.ts)
   ```typescript
   await service.regenerateSection(courseId, sectionNumber, userId, organizationId);
   ```

4. **SectionRegenerationService Fetches Data** (line 133-138 in section-regeneration-service.ts)
   ```typescript
   const { data: course, error } = await supabase
     .from('courses')
     .select('course_structure, analysis_result, generation_metadata, title, language, style')
     .eq('id', courseId)
     .eq('organization_id', organizationId)
     .single();

   const analysisResult = course.analysis_result as AnalysisResult | null;
   ```
   - **Result**: Fetches `analysis_result` created by test fixture

5. **Service Builds GenerationJobInput** (line 231-243)
   ```typescript
   const jobInput: GenerationJobInput = {
     course_id: courseId,
     organization_id: organizationId,
     user_id: userId,
     analysis_result: analysisResult, // ❌ Contains invalid schema
     frontend_parameters: {
       course_title: course.title,
       language: course.language || undefined,
       style: course.style || undefined, // ❌ null becomes undefined (invalid)
     },
     vectorized_documents: false,
     document_summaries: [],
   };
   ```

6. **SectionBatchGenerator.generateBatch** (line 273-279 in section-batch-generator.ts)
   ```typescript
   const result = await this.sectionBatchGenerator.generateBatch(
     sectionNumber,      // batchNum
     sectionIndex,       // startSection
     sectionIndex + 1,   // endSection (exclusive)
     jobInput,           // ❌ Contains invalid analysis_result
     this.qdrantClient
   );
   ```

7. **Phase 1: validate_input** (line 146-157 in generation-phases.ts)
   ```typescript
   const result = GenerationJobInputSchema.safeParse(state.input);

   if (!result.success) {
     const errors = result.error.errors.map(
       (err) => `${err.path.join('.')}: ${err.message}`
     );
     // ❌ VALIDATION FAILS HERE
   }
   ```
   - **Validation Errors**:
     ```
     analysis_result.category: Required
     analysis_result.difficulty: Required
     analysis_result.contextual_language: Expected string, received object
     analysis_result.pedagogical_strategy: Expected string, received object
     analysis_result.needs_research: Required
     frontend_parameters.style: Expected 'academic' | 'conversational' | ... received null
     ```

8. **Workflow Stops** - Generation never proceeds beyond Phase 1

#### Schema Comparison

**Test Fixture `createMinimalAnalysisResult()` Provides** (lines 64-141 in generation.test.ts):
```typescript
{
  course_category: {              // ❌ Wrong: Should be "category" (string)
    primary: 'professional',
    confidence: 0.9,
    reasoning: 'Test course',
  },
  contextual_language: {          // ❌ Wrong: Should be string, not object
    why_matters_context: 'Test context',
    motivators: 'Test motivators',
    ...
  },
  topic_analysis: {               // ✅ Has determined_topic, key_concepts (correct)
    determined_topic: title,
    key_concepts: ['concept1', 'concept2', 'concept3'],
    ...
  },
  recommended_structure: {        // ✅ Correct structure
    total_sections: 5,
    total_lessons: 20,
    sections_breakdown: [...],
  },
  pedagogical_strategy: {         // ❌ Wrong: Should be string, not object
    teaching_style: 'mixed',
    assessment_approach: 'Test assessment',
    ...
  },
  // ❌ Missing: difficulty (required)
  // ❌ Missing: needs_research (required)
  // ✅ Has: content_strategy: 'create_from_scratch'
  research_flags: [],             // ❌ Wrong: Should be expansion_areas (string[])
}
```

**Stage 5 AnalysisResultSchema Expects** (lines 24-54 in generation-job.ts):
```typescript
{
  // Phase 1: Classification
  category: z.string(),                                 // ❌ Test has "course_category" (object)
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']), // ❌ Test missing
  contextual_language: z.string(),                      // ❌ Test has object, not string

  // Phase 2: Scope
  recommended_structure: {
    total_sections: z.number().int().positive(),       // ✅ Test has this
    total_lessons: z.number().int().min(10),           // ✅ Test has this
    sections_breakdown: z.array(z.object({             // ✅ Test has this
      area: z.string(),
      estimated_lessons: z.number().int().positive(),
    })),
  },

  // Phase 3: Expert Analysis
  pedagogical_strategy: z.string(),                    // ❌ Test has object, not string
  needs_research: z.boolean(),                         // ❌ Test missing
  expansion_areas: z.array(z.string()),                // ✅ Test has (as null)

  // Phase 4: Synthesis
  final_scope_instructions: z.string(),                // ✅ Test has (as scope_instructions)

  // Phase 5: Topic Analysis
  determined_topic: z.string(),                        // ✅ Test has
  key_concepts: z.array(z.string()),                   // ✅ Test has

  // Phase 6: Content Strategy
  content_approach: z.enum(['expand', 'create_from_scratch']), // ✅ Test has (as content_strategy)
}
```

#### Detailed Mismatch Analysis

| Field | Test Fixture | Schema Expects | Issue |
|-------|-------------|----------------|-------|
| `category` | ❌ Missing (has `course_category` object) | ✅ Required (string) | **Field name + type mismatch** |
| `difficulty` | ❌ Missing | ✅ Required (enum) | **Missing field** |
| `contextual_language` | ❌ Object with 6 subfields | ✅ String | **Type mismatch** |
| `recommended_structure` | ✅ Correct | ✅ Match | ✅ OK |
| `pedagogical_strategy` | ❌ Object with 5 subfields | ✅ String | **Type mismatch** |
| `needs_research` | ❌ Missing | ✅ Required (boolean) | **Missing field** |
| `expansion_areas` | ✅ null (acceptable) | ✅ Array (optional) | ✅ OK |
| `final_scope_instructions` | ✅ Has as `scope_instructions` | ✅ Expected | ⚠️ Field name variation |
| `determined_topic` | ✅ Correct | ✅ Match | ✅ OK |
| `key_concepts` | ✅ Correct | ✅ Match | ✅ OK |
| `content_approach` | ✅ Has as `content_strategy` | ✅ Expected | ⚠️ Field name variation |

**Additional Issue**: `frontend_parameters.style`
```typescript
frontend_parameters: {
  course_title: course.title,        // ✅ OK
  language: course.language,         // ✅ OK (optional)
  style: course.style || undefined,  // ❌ course.style is null → becomes undefined → fails validation
}
```
- **Problem**: `style` field in `courses` table is `null` in test data
- **Schema**: `style: CourseStyleSchema.optional()` - but validation fails when undefined (should accept null/undefined)
- **Workaround**: Set explicit default or omit field entirely

### Evidence

**Code Locations**:
- Test fixture: `tests/contract/generation.test.ts:64-141` (`createMinimalAnalysisResult`)
- Schema definition: `packages/shared-types/src/generation-job.ts:24-54` (`AnalysisResultSchema`)
- Validation: `src/services/stage5/generation-phases.ts:146` (Phase 1 validate_input)

**Validation Error Log**:
```json
{
  "level": 50,
  "phase": "validate_input",
  "errors": [
    "analysis_result.category: Required",
    "analysis_result.difficulty: Required",
    "analysis_result.contextual_language: Expected string, received object",
    "analysis_result.pedagogical_strategy: Expected string, received object",
    "analysis_result.needs_research: Required",
    "frontend_parameters.style: Expected 'academic' | 'conversational' | ... received null"
  ]
}
```

### Contributing Factors

1. **Schema Evolution**: Stage 4 (Analyze) outputs a rich, nested analysis_result object, but Stage 5 (Generation) only needs a **simplified subset** with flattened fields
2. **No Schema Sync**: Test fixture was created for Stage 4 compatibility, not Stage 5
3. **Test Isolation**: Contract tests create minimal fixtures without consulting actual schemas
4. **Silent Schema Changes**: When `AnalysisResultSchema` was defined in `generation-job.ts`, existing test fixtures weren't updated
5. **Weak Type Safety**: Using `as any` in test fixture creation bypasses TypeScript validation

---

## Proposed Solutions

### Solution 1: Fix Test Fixture to Match Stage 5 Schema (RECOMMENDED)

**Approach**: Update `createMinimalAnalysisResult()` to generate data matching `AnalysisResultSchema` from `generation-job.ts`.

**Implementation Steps**:

1. **Replace `createMinimalAnalysisResult()` function** (lines 64-141 in generation.test.ts)

   **Change from**:
   ```typescript
   function createMinimalAnalysisResult(title: string) {
     return {
       course_category: {                    // ❌ Wrong field name + type
         primary: 'professional' as const,
         confidence: 0.9,
         reasoning: 'Test course for contract testing',
       },
       contextual_language: {                // ❌ Wrong type (object → string)
         why_matters_context: 'Test context',
         motivators: 'Test motivators',
         ...
       },
       pedagogical_strategy: {               // ❌ Wrong type (object → string)
         teaching_style: 'mixed' as const,
         ...
       },
       // Missing: difficulty, needs_research
       ...
     };
   }
   ```

   **Change to**:
   ```typescript
   /**
    * Create minimal valid analysis_result for Stage 5 generation tests
    *
    * Matches AnalysisResultSchema from packages/shared-types/src/generation-job.ts
    * This is the SIMPLIFIED schema used by Stage 5, not the full Stage 4 output.
    */
   function createMinimalAnalysisResult(title: string) {
     return {
       // Phase 1: Classification
       category: 'professional',                          // ✅ String, not object
       difficulty: 'intermediate' as const,               // ✅ Added required field
       contextual_language: 'English',                    // ✅ String, not object

       // Phase 2: Scope
       recommended_structure: {
         total_sections: 5,
         total_lessons: 20,
         sections_breakdown: [
           {
             area: 'Introduction',
             estimated_lessons: 4,
           },
           {
             area: 'Advanced Topics',
             estimated_lessons: 6,
           },
         ],
       },

       // Phase 3: Expert Analysis
       pedagogical_strategy: 'Mixed approach with hands-on practice', // ✅ String, not object
       needs_research: false,                             // ✅ Added required field
       expansion_areas: [],                               // ✅ Kept (optional)

       // Phase 4: Synthesis
       final_scope_instructions: 'Create comprehensive course covering fundamentals and advanced topics',

       // Phase 5: Topic Analysis
       determined_topic: title,
       key_concepts: ['concept1', 'concept2', 'concept3'],

       // Phase 6: Content Strategy
       content_approach: 'create_from_scratch' as const,
     };
   }
   ```

2. **Fix `createTestCourseWithStructure()` style field** (line 393 in generation.test.ts)

   **Change from**:
   ```typescript
   const { data, error } = await supabase
     .from('courses')
     .insert({
       ...
       analysis_result: createMinimalAnalysisResult(title) as any,
       settings: { topic: title },                       // ❌ Missing style
     })
   ```

   **Change to**:
   ```typescript
   const { data, error } = await supabase
     .from('courses')
     .insert({
       ...
       language: 'en',                                   // ✅ Added explicit language
       style: 'conversational',                          // ✅ Added explicit style
       analysis_result: createMinimalAnalysisResult(title) as any,
       settings: { topic: title },
     })
   ```

3. **Verify fix**:
   ```bash
   pnpm test tests/contract/generation.test.ts -t "should regenerate section successfully"
   ```
   - Expected: Phase 1 validation passes, test proceeds to LLM generation

**Pros**:
- ✅ Fixes root cause (test data matches schema)
- ✅ No production code changes needed
- ✅ Makes test fixture accurate for Stage 5 contract tests
- ✅ Improves test maintainability (matches actual schema)
- ✅ Low risk (test-only change)

**Cons**:
- ⚠️ Test fixture no longer matches full Stage 4 output (acceptable - Stage 5 uses simplified schema)
- ⚠️ May need to update other tests using `createMinimalAnalysisResult` (verify no other usages)

**Complexity**: Low
**Risk**: Low (test-only change)
**Estimated Effort**: 15 minutes (update fixture + verify tests)

---

### Solution 2: Relax Stage 5 Schema Validation (NOT RECOMMENDED)

**Approach**: Make `AnalysisResultSchema` accept both full Stage 4 output and simplified Stage 5 input.

**Implementation Steps**:

1. **Modify `AnalysisResultSchema`** in `packages/shared-types/src/generation-job.ts`
   ```typescript
   export const AnalysisResultSchema = z.object({
     // Accept both "category" (Stage 5) and "course_category" (Stage 4)
     category: z.union([
       z.string(),
       z.object({ primary: z.string(), confidence: z.number(), reasoning: z.string() })
     ]).transform(val => typeof val === 'string' ? val : val.primary),

     // Accept both string and object for contextual_language
     contextual_language: z.union([
       z.string(),
       z.object({ why_matters_context: z.string(), ... })
     ]).transform(val => typeof val === 'string' ? val : val.why_matters_context),

     // ... similar for other fields
   });
   ```

2. **Add transform logic** to extract simplified values from complex objects

**Pros**:
- ✅ Backward compatible with both schemas
- ✅ Tests pass without fixture changes

**Cons**:
- ❌ Increases schema complexity significantly
- ❌ Masks underlying schema mismatch issue
- ❌ Makes schema harder to maintain
- ❌ Couples Stage 5 schema to Stage 4 internals
- ❌ Hides potential production bugs (data transformation errors)
- ❌ Transform logic adds performance overhead

**Complexity**: High
**Risk**: Medium (complex schema transforms)
**Estimated Effort**: 1-2 hours (schema updates + extensive testing)

**Recommendation**: Do NOT use this approach. Fix the test data instead.

---

### Solution 3: Mock GenerationJobInputSchema Validation in Tests (NOT RECOMMENDED)

**Approach**: Skip input validation in test environment.

**Implementation Steps**:

1. **Add environment check in `generation-phases.ts`**:
   ```typescript
   async validateInput(state: GenerationStateType): Promise<Partial<GenerationStateType>> {
     if (process.env.NODE_ENV === 'test') {
       // Skip validation in tests
       return { currentPhase: 'generate_metadata' };
     }

     const result = GenerationJobInputSchema.safeParse(state.input);
     // ... rest of validation
   }
   ```

**Pros**:
- ✅ Quick fix for tests

**Cons**:
- ❌ Hides schema mismatch issues
- ❌ Tests no longer validate real production behavior
- ❌ Reduces test coverage and quality
- ❌ Creates environment-specific behavior (anti-pattern)
- ❌ May allow production bugs to slip through

**Complexity**: Low
**Risk**: High (reduces test quality)
**Estimated Effort**: 5 minutes

**Recommendation**: NEVER do this. Tests should validate real production behavior.

---

## Implementation Guidance

### Priority

**Medium Priority**: This is a test issue, not a production bug. However:
- Test is correctly identifying a schema mismatch
- This may indicate a larger issue with Stage 4 → Stage 5 data flow
- Should be fixed to ensure test suite accurately validates production behavior

### Files to Change

**Solution 1 (RECOMMENDED)**:
- File: `packages/course-gen-platform/tests/contract/generation.test.ts`
- Lines 64-141: Update `createMinimalAnalysisResult()` to match `AnalysisResultSchema`
- Lines 393: Add `language` and `style` fields to course creation

### Validation Criteria

**After Fix**:
- ✅ Phase 1 (validate_input) passes without errors
- ✅ Test proceeds to LLM generation (Phase 2)
- ✅ Test may still fail at LLM generation (non-deterministic), but NOT at validation
- ✅ Validation error logs no longer appear
- ✅ Test completes within reasonable time (2-3 minutes for LLM generation)

**Success Indicators**:
```
✅ No "validate_input" errors
✅ No "analysis_result.category: Required" errors
✅ No "Expected string, received object" errors
✅ Test reaches "generate_metadata" or "generate_sections" phase
```

### Testing Requirements

**Unit Tests**:
- Verify `createMinimalAnalysisResult()` output matches `AnalysisResultSchema`
- Add validation test: `AnalysisResultSchema.safeParse(createMinimalAnalysisResult('Test'))` should succeed

**Integration Tests**:
- Run full test suite: `pnpm test tests/contract/generation.test.ts`
- Verify "should regenerate section successfully" progresses past Phase 1
- Verify other tests using `createMinimalAnalysisResult()` still pass

**Manual Validation**:
```typescript
// Add to test file temporarily
import { AnalysisResultSchema } from '@megacampus/shared-types';

const testResult = AnalysisResultSchema.safeParse(createMinimalAnalysisResult('Test'));
console.log('Validation result:', testResult.success ? 'PASS' : 'FAIL');
if (!testResult.success) {
  console.log('Errors:', testResult.error.errors);
}
```

---

## Risks and Considerations

### Implementation Risks

**Solution 1: Fix Test Fixture**
- **Performance impact**: None
- **Breaking changes**: None (test-only)
- **Side effects**: May reveal other test issues (good - that's the point of tests)
- **Data compatibility**: Test data now matches Stage 5 expectations

### Schema Evolution Concerns

**Underlying Issue**: This investigation reveals a **schema evolution problem** between Stage 4 and Stage 5:

1. **Stage 4 (Analyze)** outputs a rich, nested analysis result:
   ```typescript
   {
     course_category: { primary, confidence, reasoning },
     contextual_language: { why_matters_context, motivators, ... },
     pedagogical_strategy: { teaching_style, assessment_approach, ... },
     ...
   }
   ```

2. **Stage 5 (Generation)** expects a simplified, flattened schema:
   ```typescript
   {
     category: string,
     contextual_language: string,
     pedagogical_strategy: string,
     ...
   }
   ```

**Questions to Address**:
1. **Is there a data transformation step** between Stage 4 and Stage 5?
   - If yes: Where is it? (Not found in investigation)
   - If no: How does production code handle this mismatch?

2. **Should Stage 5 schema match Stage 4 output** exactly?
   - If yes: Update `AnalysisResultSchema` to accept nested objects
   - If no: Add explicit transformation layer

3. **Are there other places** where this mismatch causes issues?
   - Check: Generation router (generation.ts:992-1034)
   - Check: Metadata generator
   - Check: Section batch generator

**Recommendation**: After fixing test, conduct **follow-up investigation** into Stage 4 → Stage 5 data flow to ensure production code handles schema differences correctly.

---

## Documentation References

### Tier 0: Project Internal Documentation

**Test Fixture**:
- `tests/contract/generation.test.ts:64-141` - `createMinimalAnalysisResult()` function
  > Creates analysis_result based on Stage 4 full output schema, not Stage 5 simplified schema

**Schema Definitions**:
- `packages/shared-types/src/generation-job.ts:24-54` - `AnalysisResultSchema` for Stage 5
  > "This represents the complete output from the Analyze stage."
  > **NOTE**: Comment is misleading - schema is actually SIMPLIFIED, not complete

**Validation Logic**:
- `packages/course-gen-platform/src/services/stage5/generation-phases.ts:146-157` - Phase 1 validate_input
  > ```typescript
  > const result = GenerationJobInputSchema.safeParse(state.input);
  > if (!result.success) {
  >   const errors = result.error.errors.map(
  >     (err) => `${err.path.join('.')}: ${err.message}`
  >   );
  > }
  > ```

**Previous Investigation**:
- `docs/investigations/INV-2025-11-11-001-generation-test-failures.md`
  > Identified UnifiedRegenerator and database schema issues (both FIXED)
  > Current issue is NEW and appeared after timeout fix

**Git History**:
```bash
# Find when AnalysisResultSchema was last modified
git log --all --oneline --grep="AnalysisResultSchema" -- packages/shared-types/src/generation-job.ts

# Find when test fixture was created
git log --all --oneline -- packages/course-gen-platform/tests/contract/generation.test.ts | grep -i "analysis"
```

### Tier 1: Context7 MCP (Not Used)

Not applicable - issue is project-specific schema mismatch, not framework/library issue.

### MCP Server Usage

**Tools Used**:
- **Read**: 8 files (test file, schema definitions, service implementations, validation logic)
- **Grep**: 2 searches (schema definitions, validation patterns)
- **Bash**: 1 command (search for GenerationJobInputSchema exports)

**Supabase MCP**: Not used (investigation only, no database queries needed)

**Sequential Thinking**: Not used (straightforward schema comparison, no complex reasoning required)

---

## Next Steps

### For User/Orchestrator

1. **Review this investigation report** - Verify schema mismatch analysis is correct
2. **Select solution approach** - Solution 1 (Fix Test Fixture) is RECOMMENDED
3. **Invoke implementation agent** with:
   - Report: `docs/investigations/INV-2025-11-11-003-regenerate-section-validation-failures.md`
   - Solution: Fix `createMinimalAnalysisResult()` to match `AnalysisResultSchema`
   - Files: `tests/contract/generation.test.ts` (lines 64-141, 393)

### Follow-up Recommendations

1. **Add schema validation tests**: Create unit test to validate `createMinimalAnalysisResult()` output against `AnalysisResultSchema`
   ```typescript
   it('createMinimalAnalysisResult should match AnalysisResultSchema', () => {
     const result = AnalysisResultSchema.safeParse(createMinimalAnalysisResult('Test'));
     expect(result.success).toBe(true);
   });
   ```

2. **Investigate Stage 4 → Stage 5 data flow**: Verify production code correctly transforms Stage 4 rich output to Stage 5 simplified input

3. **Update schema documentation**: Fix misleading comment in `generation-job.ts:20` (says "complete output" but is actually simplified)

4. **Consider schema versioning**: If Stage 4 and Stage 5 schemas continue to diverge, introduce explicit schema versions

5. **Add TypeScript strict mode**: Use `as const` and proper types instead of `as any` in test fixtures

---

## Investigation Log

### Timeline

| Timestamp | Action | Result |
|-----------|--------|--------|
| 00:00:00 | Read user request | Identified NEW issue after timeout fix |
| 00:05:00 | Read test file (generation.test.ts) | Found `createMinimalAnalysisResult()` fixture |
| 00:10:00 | Read schema (generation-job.ts) | Found `AnalysisResultSchema` definition |
| 00:15:00 | Compare fixture vs schema | Identified 6 field mismatches |
| 00:20:00 | Read validation logic (generation-phases.ts) | Confirmed Phase 1 validates against AnalysisResultSchema |
| 00:25:00 | Read service flow (section-regeneration-service.ts) | Traced data flow from test to validation |
| 00:30:00 | Analyze error logs | Mapped validation errors to specific schema mismatches |
| 00:35:00 | Root cause confirmed | Test fixture schema != Stage 5 schema |

### Commands Run

```bash
# Read test file and fixtures
read packages/course-gen-platform/tests/contract/generation.test.ts (lines 64-141, 356-403, 855-900)

# Read schema definitions
read packages/shared-types/src/generation-job.ts (complete file)

# Read validation logic
read packages/course-gen-platform/src/services/stage5/generation-phases.ts (lines 140-195)
read packages/course-gen-platform/src/services/stage5/section-regeneration-service.ts (lines 108-244)

# Read regeneration flow
read packages/course-gen-platform/src/services/stage5/section-batch-generator.ts (lines 154-279, 830-844)
read packages/course-gen-platform/src/shared/regeneration/unified-regenerator.ts (lines 1-200, 304-334)

# Search for schema patterns
grep -r "GenerationJobInputSchema" packages/
grep -r "AnalysisResultSchema" packages/

# Check previous investigation
read docs/investigations/INV-2025-11-11-001-generation-test-failures.md
```

### MCP Calls Made

- **Read**: 8 calls (test file, schema file, 3 service files, 2 validation files, 1 previous investigation)
- **Grep**: 2 calls (schema searches)
- **Bash**: 1 call (search for schema exports)

**Total**: 11 tool invocations

---

## Status: ✅ Ready for Implementation

Root cause is confirmed: test fixture schema does not match Stage 5 AnalysisResultSchema. Solution is straightforward (update test fixture). Estimated implementation time: 15-20 minutes (including testing).

**However**: This investigation reveals a potential **larger issue** with Stage 4 → Stage 5 data transformation that may require follow-up investigation.
