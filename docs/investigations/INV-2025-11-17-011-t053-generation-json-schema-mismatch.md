# Investigation: T053 E2E Test Failure - Stage 5 Generation JSON Schema Mismatches

**Date**: 2025-11-17
**Status**: In Progress
**Priority**: P0-CRITICAL
**Test**: T053 Scenario 2 - Full Pipeline (Analyze + Generate)
**Related Investigations**:
- INV-2025-11-16-001 (RT-006 metadata validation - SAME ROOT CAUSE)
- INV-2025-11-16-004 (Phase 2 missing fields)
- INV-2025-11-17-006 (Phase 1 reasoning - RESOLVED)
- TASK-T053-ITERATIVE-FIX-WORKFLOW.md (Previous fix workflow)

---

## Executive Summary

**REGRESSION DETECTED**: Despite previous fixes (INV-2025-11-16-001), Stage 5 generation **STILL FAILS** with RT-006 validation errors. The SAME prompt-schema mismatch issue persists.

**Current Status**: Test FAILED (exit code 0 but generation job failed permanently)

**Root Causes** (3 critical issues):
1. **Objects Instead of Strings**: LLM returns `{ text, cognitiveLevel, ... }` objects for `learning_objectives` and `lesson_objectives`, but schema expects `string[]`
2. **Invalid Enum Values**: LLM returns `role_play`, `peer_review` for `exercise_type`, but schema only allows `['self_assessment', 'case_study', 'hands_on', 'discussion', 'quiz', 'simulation', 'reflection']`
3. **Missing Required Fields**: LLM completely omits `lesson_number`, `lesson_title`, `exercise_type`, `exercise_title`, `exercise_description` (60+ violations)

---

## Problem Statement

### Observed Behavior (2025-11-17, Test Run)

**Course ID**: `77366f85-39b7-4452-b139-c7e81ad86a84`
**Stage 5 Job ID**: 29
**Generation Duration**: 386 seconds (6.4 minutes)
**Result**: FAILED (permanent error, will not retry)

**Error Chain**:
```
1. Metadata generation failed after 3 attempts
   → RT-006 validation failed: Required; Required; Required; Required; Required

2. Section generation failed after 2 attempts
   → RT-006 validation failed: 60+ field violations

3. Quality validation failed
   → Cannot validate quality: metadata not generated

4. Lesson count validation failed
   → Cannot validate lessons: no sections generated
```

### Detailed RT-006 Validation Failures

#### Issue 1: Objects Instead of Strings (Attempt 1)

**Location**: Section Batch 1, Section 0

**Errors**:
```json
{
  "0.learning_objectives.0": "Expected string, received object",
  "0.learning_objectives.1": "Expected string, received object",
  "0.learning_objectives.2": "Expected string, received object",
  "0.lessons.0.lesson_objectives.0": "Expected string, received object",
  "0.lessons.0.lesson_objectives.1": "Expected string, received object",
  "0.lessons.1.lesson_objectives.0": "Expected string, received object",
  "0.lessons.1.lesson_objectives.1": "Expected string, received object",
  ...
}
```

**What LLM Returned** (inferred from error pattern):
```json
{
  "learning_objectives": [
    {
      "text": "Apply sales techniques...",
      "cognitiveLevel": "apply",
      "language": "Russian",
      "estimatedDuration": 10,
      "targetAudienceLevel": "intermediate"
    },
    ...
  ]
}
```

**What Schema Expected**:
```typescript
learning_objectives: z.array(z.string().min(10).max(600)) // simple strings!
```

#### Issue 2: Invalid Enum Values (Attempt 1)

**Errors**:
```json
{
  "0.lessons.3.practical_exercises.1.exercise_type": "Invalid enum value. Expected 'self_assessment' | 'case_study' | 'hands_on' | 'discussion' | 'quiz' | 'simulation' | 'reflection', received 'role_play'",
  "0.lessons.5.practical_exercises.1.exercise_type": "Invalid enum value. Expected 'self_assessment' | 'case_study' | 'hands_on' | 'discussion' | 'quiz' | 'simulation' | 'reflection', received 'peer_review'"
}
```

**What LLM Did**: Generated `role_play` and `peer_review` (pedagogically valid but not in schema enum)

**Why**: Prompt likely says "choose appropriate exercise type" without listing allowed values

#### Issue 3: Missing Required Fields (Attempt 2 - After auto-repair layer)

**Errors** (60+ violations):
```json
{
  "0.lessons.0.lesson_number": "Required",
  "0.lessons.0.lesson_title": "Required",
  "0.lessons.0.practical_exercises.0.exercise_type": "Required",
  "0.lessons.0.practical_exercises.0.exercise_title": "Required",
  "0.lessons.0.practical_exercises.0.exercise_description": "Required",
  "0.lessons.0.practical_exercises.1.exercise_type": "Required",
  "0.lessons.0.practical_exercises.1.exercise_title": "Required",
  "0.lessons.0.practical_exercises.1.exercise_description": "Required",
  ... (x6 lessons, x3 exercises each = 54 missing fields)
}
```

**What Happened**:
1. **Attempt 1**: LLM returned objects + invalid enums → auto-repair layer SUCCEEDED (!)
2. **Attempt 2**: After repair, JSON is valid BUT many required fields are MISSING
3. **Why repair succeeded**: JSON was syntactically valid, repair layer doesn't check completeness

---

## Root Cause Analysis

### Primary Cause: Prompts Don't Match Schemas

**Evidence**: Same issue as INV-2025-11-16-001 (reported FIXED but clearly NOT FIXED)

**Files Affected**:
1. `packages/course-gen-platform/src/services/stage5/metadata-generator.ts`
   - **Status**: ALLEGEDLY FIXED in INV-2025-11-16-001
   - **Reality**: STILL instructs LLM to generate objects

2. `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts`
   - **Status**: NOT FIXED (confirmed by current error logs)
   - **Problem**: Prompts LLM to generate `learning_objectives` as objects
   - **Problem**: Prompts LLM to generate `lesson_objectives` as objects
   - **Problem**: Doesn't list allowed `exercise_type` enum values

**Why Previous Fix Failed**:
- INV-2025-11-16-001 recommended fixing metadata-generator prompt (lines 430-439)
- **BUT**: Fix was NEVER IMPLEMENTED (no commit found)
- **OR**: Fix was implemented INCORRECTLY (didn't update all affected generators)

### Secondary Cause: No Zod Schema in System Messages

**Context**: TASK-T053-ITERATIVE-FIX-WORKFLOW.md identified this (Task 2.1)

**Problem**: LLM doesn't know the EXACT schema structure, so it:
- Guesses field types (objects vs strings)
- Invents enum values that sound reasonable
- Omits fields it thinks are optional

**Solution**: Add Zod schema description to every generator's system message

### Tertiary Cause: Auto-Repair Layer Too Permissive

**Problem**: `auto-repair` layer (jsonrepair) fixes JSON syntax but doesn't validate:
- Field completeness (missing required fields)
- Field types (objects vs strings)
- Enum validity

**Why It's a Problem**:
1. LLM generates invalid JSON with wrong types
2. Auto-repair "fixes" it by making JSON valid
3. But fixed JSON is still missing fields
4. Zod validation catches missing fields → FAIL
5. critique-revise layer can't help (already failed once)

**Solution**: Add schema-aware repair layer that checks required fields

---

## Why This Is a Regression

### Timeline of Events

**2025-11-16**:
- INV-2025-11-16-001 identified prompt-schema mismatch
- Recommended Solution 1: Fix metadata-generator prompt (lines 430-439)
- Status: COMPLETED (allegedly)

**2025-11-17** (TODAY):
- T053 E2E test runs
- SAME ERRORS appear (objects vs strings, missing fields)
- Investigation reveals: **FIX WAS NEVER APPLIED**

### Evidence Fix Was Not Applied

**Search Results**:
```bash
# Current prompt in metadata-generator.ts
grep -A 10 "learning_outcomes" packages/course-gen-platform/src/services/stage5/metadata-generator.ts

# RESULT: Still shows object structure (not fixed)
"learning_outcomes": [
  {
    "id": string (UUID),
    "text": string (10-500 chars, measurable objective),
    "language": "${language}",
    "cognitiveLevel": "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create",
    ...
  }
]
```

**Conclusion**: INV-2025-11-16-001 documented the fix but NOBODY IMPLEMENTED IT.

---

## Proposed Solutions

### Solution 1: Fix All Generator Prompts (CRITICAL - Must Do)

**Objective**: Update ALL generators to request simple strings instead of objects.

**Files to Fix**:
1. `packages/course-gen-platform/src/services/stage5/metadata-generator.ts`
   - Lines 430-439: Change `learning_outcomes` from objects to strings

2. `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts`
   - Search for `learning_objectives` prompt section
   - Change from objects to strings
   - Add explicit enum list for `exercise_type`

**Changes Required**:

**From** (current - WRONG):
```typescript
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
```

**To** (correct):
```typescript
"learning_outcomes": string[] (3-15 items, 10-600 chars each - measurable objectives using action verbs),
"learning_objectives": string[] (2-5 items, 10-600 chars each - section-level objectives),
"lesson_objectives": string[] (2-4 items, 10-600 chars each - lesson-level objectives),
```

**Add enum documentation**:
```typescript
"exercise_type": "self_assessment" | "case_study" | "hands_on" | "discussion" | "quiz" | "simulation" | "reflection" (ONLY these values allowed),
```

**Complexity**: Low (30-45 min for both files)
**Risk**: Low (prompt-only change)
**Priority**: P0-CRITICAL

---

### Solution 2: Add Zod Schema to System Messages (HIGH - Prevents Future Issues)

**Objective**: Systematically add Zod schema descriptions to all generator prompts.

**Approach** (from TASK-T053-ITERATIVE-FIX-WORKFLOW.md Task 2.1):
1. Create utility: `packages/course-gen-platform/src/utils/zod-to-prompt-schema.ts`
   - Converts Zod schema to human-readable JSON schema
   - Optimized for token efficiency

2. Update all 8 generators:
   - Stage 4: phase-1 through phase-5 (5 files)
   - Stage 5: metadata, section-batch, lesson (3 files)

3. Add schema to system message:
```typescript
You must respond with valid JSON matching this EXACT schema:
{schema_description}

CRITICAL REQUIREMENTS:
- All required fields MUST be present
- Types must match EXACTLY (string vs object vs array)
- Enum values must be from allowed list ONLY
- No additional properties unless specified
```

**Complexity**: Medium (4-6 hours)
**Risk**: Low (additive, doesn't change existing behavior)
**Priority**: P1-HIGH

---

### Solution 3: Add Schema-Aware Repair Layer (MEDIUM - Safety Net)

**Objective**: Enhance auto-repair layer to validate required fields.

**Approach**:
1. Create new repair strategy: `schema-completeness-check`
2. After jsonrepair succeeds, validate against Zod schema
3. If required fields missing, ADD them with safe defaults:
   ```typescript
   {
     lesson_number: lesson_index + 1,
     lesson_title: `Lesson ${lesson_index + 1}`,
     exercise_type: 'self_assessment', // safest default
     exercise_title: 'Exercise',
     exercise_description: 'Complete the exercise as instructed'
   }
   ```
4. Log warnings when defaults are added

**Pros**:
- Guarantees validation success (no more "Required" errors)
- Resilient to LLM mistakes
- Non-breaking (only adds missing fields)

**Cons**:
- Default values may not be semantically correct
- Hides LLM quality problems
- Generates "placeholder" content

**Complexity**: Medium (2-3 hours)
**Risk**: Low (safety net, doesn't break existing flow)
**Priority**: P2-MEDIUM

---

## Recommended Implementation Plan

### Phase 1: Critical Fixes (1-2 hours)

**Tasks**:
1. ✅ **Fix metadata-generator.ts prompt** (30 min)
   - Update lines 430-439 to request strings
   - Add enum documentation
   - Test with direct LLM call

2. ✅ **Fix section-batch-generator.ts prompt** (45 min)
   - Update `learning_objectives` to strings
   - Update `lesson_objectives` to strings
   - Add `exercise_type` enum list
   - Test with direct LLM call

3. ✅ **Verify fixes** (30 min)
   - Run unit tests for both generators
   - Check type-check passes
   - Commit with `/push patch`

**Success Criteria**:
- Prompts match schema exactly
- No objects where strings expected
- All enum values documented

---

### Phase 2: Systematic Prevention (4-6 hours)

**Tasks**:
1. ✅ **Implement zod-to-prompt-schema utility** (2 hours)
2. ✅ **Update all 8 generators with schemas** (3 hours)
3. ✅ **Test each generator** (1 hour)
4. ✅ **Commit with `/push patch**

**Success Criteria**:
- All generators include Zod schema in system message
- Schema descriptions are accurate
- Token usage increase < 10%

---

### Phase 3: Safety Net (2-3 hours) - OPTIONAL

**Tasks**:
1. ✅ **Implement schema-completeness-check repair strategy**
2. ✅ **Add to unified-regenerator**
3. ✅ **Test with intentionally incomplete JSON**
4. ✅ **Commit with `/push patch**

**Success Criteria**:
- Repair layer adds missing fields with defaults
- Warnings logged when defaults used
- Validation never fails due to missing fields

---

## Validation Plan

### Unit Tests

**Test Coverage**:
1. `tests/unit/stage5/metadata-generator.test.ts`
   - Test prompt generates strings (not objects)
   - Test enum values are documented

2. `tests/unit/stage5/section-batch-generator.test.ts`
   - Test `learning_objectives` are strings
   - Test `lesson_objectives` are strings
   - Test `exercise_type` enum is correct

3. `tests/unit/utils/zod-to-prompt-schema.test.ts` (new)
   - Test schema conversion accuracy
   - Test token efficiency

**Run**:
```bash
pnpm test tests/unit/stage5/
pnpm test tests/unit/utils/zod-to-prompt-schema.test.ts
```

---

### Integration Tests

**Run T053 E2E Test**:
```bash
pnpm test tests/e2e/t053-synergy-sales-course.test.ts
```

**Success Criteria**:
- ✅ Stage 5 generation SUCCEEDS (not fails)
- ✅ No "Expected string, received object" errors
- ✅ No "Required" field errors
- ✅ No "Invalid enum value" errors
- ✅ Metadata, sections, lessons all generated
- ✅ Test completes within 15 minutes

---

### Manual Verification

**Check Generated Content**:
1. Inspect `courses.course_structure` in Supabase for course_id `77366f85-39b7-4452-b139-c7e81ad86a84`
2. Verify `learning_outcomes` are strings (not objects)
3. Verify `exercise_type` values are all from allowed enum
4. Verify no missing required fields

---

## Historical Context

### Related Investigations

**INV-2025-11-16-001** (Metadata Validation):
- **Status**: COMPLETED (but fix NOT IMPLEMENTED)
- **Finding**: Prompt instructs LLM to generate objects, schema expects strings
- **Recommendation**: Fix metadata-generator prompt lines 430-439
- **Reality**: Fix was documented but never applied

**INV-2025-11-16-004** (Phase 2 Missing Fields):
- **Status**: COMPLETED
- **Finding**: Phase 2 LLM omits required fields in `sections_breakdown`
- **Solution**: Hybrid (fix prompt + add post-processing safety)
- **Implemented**: YES (v0.18.2, but only for Phase 2)

**INV-2025-11-17-006** (Phase 1 Reasoning):
- **Status**: RESOLVED
- **Finding**: Phase 1 generates non-measurable objectives
- **Solution**: Enhanced prompt with Bloom's taxonomy verbs
- **Implemented**: YES

### Previous Fix Attempts

**Commit a150e3c** (2025-11-10):
- Activated RT-006 Zod validators in production
- **Problem**: Validation enabled BEFORE prompts fixed
- **Result**: Validation catches errors but prompts still wrong

**Commit 9539b2a** (2025-11-12):
- T055 Schema Unification Phase 2
- Fixed CODE to handle string arrays
- **Problem**: Didn't fix PROMPTS
- **Result**: Code expects strings, prompts ask for objects

---

## Conclusion

This is a **CRITICAL REGRESSION** caused by incomplete fix implementation.

**Root Cause**: INV-2025-11-16-001 identified the problem and recommended a solution, but the solution was **NEVER IMPLEMENTED IN CODE**.

**Impact**: T053 E2E test FAILS, Stage 5 generation is BROKEN, production deployment BLOCKED.

**Urgency**: P0-CRITICAL - must fix IMMEDIATELY before any deployment.

**Next Steps**:
1. Implement Phase 1 fixes (1-2 hours)
2. Run T053 E2E test to validate
3. Implement Phase 2 prevention (4-6 hours)
4. Commit all changes with `/push patch`
5. Update this investigation to COMPLETED

---

**Investigation Status**: ✅ COMPLETED
**Next Action**: IMPLEMENT FIXES (Phase 1 → Phase 2 → Phase 3)
**Assigned To**: MAIN orchestrator (delegate to appropriate agents)
