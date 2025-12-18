# Task: T053 E2E Fix - Phase 1 Critical Prompt Repairs

**Created**: 2025-11-17
**Source**: [INV-2025-11-17-011](../../docs/investigations/INV-2025-11-17-011-t053-generation-json-schema-mismatch.md)
**Priority**: P0-CRITICAL
**Blocking**: T053 E2E test, Stage 5 production deployment
**Execution Model**: Sequential (must fix prompts before validation)

---

## Executive Summary

**Problem**: Stage 5 generators instruct LLM to generate objects/wrong enums, but Zod schemas expect strings/specific enums. This causes RT-006 validation to fail 100% of the time.

**Root Cause**: Prompts don't match schemas (regression from INV-2025-11-16-001 fix that was NEVER IMPLEMENTED).

**Solution**: Fix prompts in metadata-generator and section-batch-generator to match Zod schemas exactly.

**Estimated Duration**: 1-2 hours
**Risk**: Low (prompt-only changes, no schema/API changes)

---

## Background

### What Went Wrong

**Previous Investigation**: INV-2025-11-16-001 (2025-11-16)
- Identified: metadata-generator prompts LLM for objects, schema expects strings
- Recommended: Fix prompt lines 430-439
- Status: DOCUMENTED but NEVER IMPLEMENTED

**Current Investigation**: INV-2025-11-17-011 (TODAY)
- T053 E2E test FAILS with SAME ERRORS
- Discovered: Fix was documented but code unchanged
- Additional: section-batch-generator has SAME problem

### Current Error Pattern

**Error Type 1**: Objects Instead of Strings
```json
{
  "learning_objectives.0": "Expected string, received object"
}
```

**What LLM Returns**:
```json
{
  "learning_objectives": [
    { "text": "...", "cognitiveLevel": "apply", "language": "Russian" }
  ]
}
```

**What Schema Expects**:
```typescript
learning_objectives: z.array(z.string()) // simple strings!
```

**Error Type 2**: Invalid Enum Values
```json
{
  "exercise_type": "Invalid enum value. Expected 'self_assessment' | 'case_study' | 'hands_on' | 'discussion' | 'quiz' | 'simulation' | 'reflection', received 'role_play'"
}
```

**Error Type 3**: Missing Required Fields (60+)
```json
{
  "lesson_number": "Required",
  "lesson_title": "Required",
  "exercise_type": "Required",
  ...
}
```

---

## Task Breakdown

### Task 1: Fix metadata-generator.ts Prompt

**File**: `packages/course-gen-platform/src/services/stage5/metadata-generator.ts`
**Lines**: 430-439 (and similar patterns throughout prompt)
**Priority**: P0-CRITICAL
**Depends On**: None
**Executor**: `llm-service-specialist` OR MAIN

**Pre-Task Investigation**:
1. Read current prompt structure (lines 363-460)
2. Read CourseMetadataSchema (packages/shared-types/src/generation-result.ts:673-718)
3. Search for ALL occurrences of `learning_outcomes` in prompt
4. Check if prompt already fixed (search commit history)

**Changes Required**:

**BEFORE** (current - WRONG):
```typescript
// metadata-generator.ts lines 430-439
**Generate the following metadata fields** (JSON format):

{
  "learning_outcomes": [
    {
      "id": string (UUID),
      "text": string (10-500 chars, measurable objective),
      "language": "${language}",
      "cognitiveLevel": "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create",
      "estimatedDuration": number (5-15 minutes),
      "targetAudienceLevel": "beginner" | "intermediate" | "advanced"
    }
  ] (3-15 outcomes),
  ...
}
```

**AFTER** (correct):
```typescript
// metadata-generator.ts lines 430-439 (updated)
**Generate the following metadata fields** (JSON format):

{
  "learning_outcomes": string[] (3-15 items, each 10-600 chars - measurable objectives using action verbs from Bloom's taxonomy),
  "prerequisites": string[] (0-10 items, each 10-600 chars - clear prerequisite knowledge/skills),
  "course_tags": string[] (5-20 tags, each max 150 chars - relevant keywords for search/categorization),
  ...
}

**CRITICAL FORMATTING RULES**:
- learning_outcomes: MUST be simple strings, NOT objects
- Each outcome: Complete sentence starting with action verb (analyze, create, evaluate, etc.)
- Example: "Применять техники продаж для образовательных продуктов в B2B сегменте"
```

**Validation**:
1. Search prompt for ANY remaining object structures in arrays
2. Verify all array fields documented as `string[]`
3. Run type-check: `pnpm type-check:course-gen-platform`
4. Test with direct LLM call (capture raw output, verify strings not objects)

**Success Criteria**:
- No object structures in `learning_outcomes` prompt
- All array fields explicitly documented as `string[]`
- Prompt includes examples of correct format
- Type-check passes

---

### Task 2: Fix section-batch-generator.ts Prompt

**File**: `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts`
**Lines**: Search for `learning_objectives`, `lesson_objectives`, `exercise_type` in prompt building
**Priority**: P0-CRITICAL
**Depends On**: None (can run parallel with Task 1)
**Executor**: `llm-service-specialist` OR MAIN

**Pre-Task Investigation**:
1. Read section-batch-generator.ts (full file ~800-1200 lines)
2. Find prompt building method (likely `buildSectionPrompt` or similar)
3. Read SectionSchema (packages/shared-types/src/generation-result.ts)
4. Read LessonSchema and PracticalExerciseSchema
5. Document ALL schema expectations (strings vs objects, enum values)

**Changes Required**:

**PROBLEM 1: learning_objectives and lesson_objectives**

**BEFORE** (current - if objects):
```typescript
"learning_objectives": [
  {
    "text": "...",
    "cognitiveLevel": "apply",
    ...
  }
]
```

**AFTER** (correct):
```typescript
"learning_objectives": string[] (2-5 items, each 10-600 chars - section-level objectives as simple strings),
"lesson_objectives": string[] (2-4 items, each 10-600 chars - lesson-level objectives as simple strings),
```

**PROBLEM 2: exercise_type enum not documented**

**BEFORE** (current - probably vague):
```typescript
"exercise_type": string (type of practical exercise)
```

**AFTER** (correct):
```typescript
"exercise_type": "self_assessment" | "case_study" | "hands_on" | "discussion" | "quiz" | "simulation" | "reflection" (ONLY these 7 values are allowed, choose the most appropriate),
```

**PROBLEM 3: Missing required fields reminder**

**ADD** (new section in prompt):
```typescript
**CRITICAL REQUIRED FIELDS** (omitting ANY of these will cause validation failure):

For each lesson:
- lesson_number: number (sequential, starting from 1)
- lesson_title: string (10-500 chars, clear and descriptive)
- lesson_description: string (50-2000 chars)
- lesson_objectives: string[] (2-4 objectives as simple strings)
- estimated_duration_minutes: number (10-120 minutes)
- practical_exercises: array (1-5 exercises)

For each practical_exercise:
- exercise_type: enum (ONLY: self_assessment, case_study, hands_on, discussion, quiz, simulation, reflection)
- exercise_title: string (10-300 chars)
- exercise_description: string (50-1500 chars)
- estimated_duration_minutes: number (5-60 minutes)

**Validation will FAIL if ANY field is missing or wrong type.**
```

**Validation**:
1. Search prompt for ALL array fields, verify documented as `string[]`
2. Verify `exercise_type` enum lists ALL 7 allowed values
3. Verify required fields reminder is comprehensive
4. Run type-check
5. Test with direct LLM call

**Success Criteria**:
- No object structures where strings expected
- Enum values explicitly listed
- Required fields reminder present and accurate
- Type-check passes
- Direct LLM test returns valid JSON matching schema

---

### Task 3: Verification Test Run

**Priority**: P0-CRITICAL
**Depends On**: Task 1 AND Task 2 completion
**Executor**: MAIN

**Steps**:
1. Verify both files saved and type-check passes
2. Run unit tests:
   ```bash
   pnpm test tests/unit/stage5/metadata-generator.test.ts
   pnpm test tests/unit/stage5/section-batch-generator.test.ts
   ```
3. Run T053 E2E test:
   ```bash
   pnpm test tests/e2e/t053-synergy-sales-course.test.ts
   ```
4. Monitor logs for:
   - ✅ NO "Expected string, received object" errors
   - ✅ NO "Invalid enum value" errors
   - ✅ NO "Required" field errors
   - ✅ Generation completes successfully

**Success Criteria**:
- Unit tests PASS
- T053 E2E test PASSES (all scenarios)
- No RT-006 validation errors in logs
- Generated course structure is complete and valid

---

### Task 4: Commit Changes

**Priority**: P0-CRITICAL
**Depends On**: Task 3 (verification)
**Executor**: MAIN

**Steps**:
1. Review all changes (git diff)
2. Verify type-check passes
3. Verify T053 passes
4. Commit with `/push patch`:
   ```
   fix(stage5): correct prompts to match Zod schemas (objects→strings, enum docs)

   **Problem**: Stage 5 generators instructed LLM to generate objects for learning_outcomes/objectives,
   but schemas expect simple strings. Also, exercise_type enum values weren't documented.

   **Changes**:
   - metadata-generator.ts: learning_outcomes from objects to string[]
   - section-batch-generator.ts: learning_objectives, lesson_objectives to string[]
   - section-batch-generator.ts: added exercise_type enum documentation (7 allowed values)
   - section-batch-generator.ts: added comprehensive required fields reminder

   **Impact**: RT-006 validation now passes, T053 E2E test succeeds.

   **Fixes**: INV-2025-11-17-011 (regression from INV-2025-11-16-001 never implemented)

   → Artifacts: [metadata-generator.ts](packages/course-gen-platform/src/services/stage5/metadata-generator.ts),
               [section-batch-generator.ts](packages/course-gen-platform/src/services/stage5/section-batch-generator.ts)
   ```

**Success Criteria**:
- Changes committed
- Commit message references investigation
- All artifacts linked

---

## Execution Plan

### Recommended Approach

**Option A: Delegate to llm-service-specialist** (Recommended if complex prompts)
```
Launch 2 agents in parallel:
1. llm-service-specialist: Fix metadata-generator.ts (Task 1)
2. llm-service-specialist: Fix section-batch-generator.ts (Task 2)

Then sequentially:
3. MAIN: Run verification tests (Task 3)
4. MAIN: Commit changes (Task 4)
```

**Option B: Execute Directly** (Recommended if simple prompts)
```
MAIN executes all tasks sequentially:
1. Read and fix metadata-generator.ts
2. Read and fix section-batch-generator.ts
3. Run verification tests
4. Commit changes

Total time: 1-2 hours
```

**Recommendation**: Use **Option B** (direct execution) since:
- Prompts are well-documented in investigation
- Changes are straightforward (remove object structures, add enum docs)
- Faster feedback loop (no agent overhead)
- Can iterate quickly if issues found

---

## Risk Analysis

### Implementation Risks

**Risk 1: LLM May Still Generate Objects**
- **Likelihood**: Low (clear prompt instructions usually work)
- **Impact**: Medium (would need model-specific adjustments)
- **Mitigation**: Add explicit "MUST return strings, NOT objects" in prompt
- **Fallback**: Implement schema-aware repair layer (Phase 3)

**Risk 2: Enum Values May Be Incomplete**
- **Likelihood**: Low (enum is well-defined in schema)
- **Impact**: Low (easy to add missing values)
- **Mitigation**: Double-check schema definition before updating prompt

**Risk 3: Required Fields Reminder May Be Incorrect**
- **Likelihood**: Low (copying from schema)
- **Impact**: Medium (confuses LLM if wrong)
- **Mitigation**: Validate reminder against actual Zod schema

### Testing Risks

**Risk 1: T053 May Fail for Other Reasons**
- **Likelihood**: Medium (test is complex, many dependencies)
- **Impact**: High (can't validate fix)
- **Mitigation**: Check test logs carefully, isolate failures
- **Fallback**: Run smaller unit tests to validate prompt changes

**Risk 2: Model Behavior May Vary**
- **Likelihood**: Medium (different models interpret prompts differently)
- **Impact**: Medium (may work for one model but not another)
- **Mitigation**: Test with both tier2_ru_lessons (Qwen3) and tier3_en_lessons (DeepSeek)

---

## Rollback Plan

If changes cause test failures:

**Immediate Rollback**:
```bash
# Revert commits
git revert HEAD

# Or manually restore
git checkout HEAD~1 -- packages/course-gen-platform/src/services/stage5/metadata-generator.ts
git checkout HEAD~1 -- packages/course-gen-platform/src/services/stage5/section-batch-generator.ts
```

**Fallback Strategy**:
1. Disable RT-006 validation temporarily (allow failures but log warnings)
2. Implement Phase 3 (schema-aware repair with defaults)
3. Investigate model-specific issues

---

## Success Metrics

**Primary Goal**: T053 E2E test PASSES

**Secondary Goals**:
- ✅ Zero "Expected string, received object" errors
- ✅ Zero "Invalid enum value" errors
- ✅ Zero "Required" field errors
- ✅ Stage 5 generation completes in < 10 minutes
- ✅ Generated course structure is semantically valid (not just schema-valid)

**Quality Gates**:
- Type-check MUST pass
- Unit tests MUST pass
- E2E test MUST pass
- No new warnings introduced

---

## Follow-Up Tasks

After Phase 1 completes successfully:

**Phase 2: Systematic Prevention** (4-6 hours)
- Implement zod-to-prompt-schema utility
- Add Zod schemas to ALL generator system messages
- See: TASK-T053-ITERATIVE-FIX-WORKFLOW.md Phase 2

**Phase 3: Safety Net** (2-3 hours, optional)
- Implement schema-completeness-check repair strategy
- Add to unified-regenerator
- See: TASK-T053-ITERATIVE-FIX-WORKFLOW.md Phase 3

---

## Notes

- This task fixes a **CRITICAL REGRESSION** (fix was documented but never implemented)
- Changes are **NON-BREAKING** (prompt-only, no schema/API changes)
- Priority is **P0** (blocks production deployment)
- Must complete **TODAY** (2025-11-17)

---

**Task Status**: ⏳ PENDING
**Next Action**: Execute Task 1 + Task 2 (fix prompts)
**Assigned To**: MAIN orchestrator (direct execution recommended)
