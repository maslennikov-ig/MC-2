# Investigation: zodToPromptSchema Contradiction - Hardcoded Examples Override Schema

**Date**: 2025-11-17
**Status**: RESOLVED - Root Cause Identified
**Priority**: P0-CRITICAL
**Test**: T053 E2E Test Failure
**Related Investigations**:
- INV-2025-11-17-011 (T053 generation-json schema mismatch - REGRESSION)
- INV-2025-11-17-012 (problem-investigator deep dive - INCORRECT CONCLUSION)
- INV-2025-11-16-001 (RT-006 metadata validation - ORIGINAL ISSUE)

---

## Executive Summary

**CRITICAL FINDING**: The zodToPromptSchema utility (added in commit f96c64e) IS WORKING CORRECTLY, but its output is being **CONTRADICTED** by hardcoded JSON examples in section-batch-generator.ts lines 797-849.

**Why Previous Fix Failed**:
1. ✅ zodToPromptSchema correctly outputs `"learning_objectives": array of string`
2. ✅ Schema is included in prompts (line 762, 768)
3. ❌ **BUT** lines 806-814 show hardcoded example with OBJECTS
4. ❌ LLMs follow EXAMPLES > schema descriptions
5. ❌ Result: LLM generates objects despite schema saying strings

**Impact**: T053 test FAILS 100% of the time, Stage 5 generation BROKEN.

---

## Problem Statement

### Current Test Failure (2025-11-17)

**Test Run**: T053 Scenario 2 - Full Pipeline
**Course ID**: `77366f85-39b7-4452-b139-c7e81ad86a84`
**Stage 5 Job ID**: 29
**Result**: FAILED (permanent error after 386 seconds)

**Error Pattern**:
```
Attempt 1 (tier2_ru_lessons - Qwen3 235B):
- RT-006 validation failed: "Expected string, received object" (x16 violations)
- Invalid enum: received 'role_play', 'peer_review'

Attempt 2 (after auto-repair):
- RT-006 validation failed: 60+ "Required" field violations
- All lesson_number, lesson_title, exercise fields MISSING
```

### Evidence of Contradiction

**File**: `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts`

**Line 762-768** (CORRECT):
```typescript
// RT-002: Add Zod schema description for clear structure
const schemaDescription = zodToPromptSchema(SectionSchema);

prompt += `**CRITICAL: You MUST respond with valid JSON matching this EXACT schema**:

${schemaDescription}
```

**zodToPromptSchema Output** (CORRECT):
```
{
  "learning_objectives": array (min 1, max 5) of string (min 10, max 600),
  "lessons": array (min 3, max 5) of {
    "lesson_objectives": array (min 1, max 5) of string (min 10, max 600),
    ...
  }
}
```

**Lines 806-814** (WRONG - CONTRADICTS SCHEMA):
```typescript
"learning_objectives": [
  {
    "id": "uuid-v4",
    "text": "Measurable objective with action verb",
    "language": "${language}",
    "cognitiveLevel": "remember|understand|apply|analyze|evaluate|create",
    "estimatedDuration": 5-15,
    "targetAudienceLevel": "beginner|intermediate|advanced"
  }
],
```

**Lines 821-829** (SAME PROBLEM):
```typescript
"lesson_objectives": [
  {
    "id": "uuid-v4",
    "text": "SMART objective (${style} style)",
    "language": "${language}",
    "cognitiveLevel": "apply",
    "estimatedDuration": 10,
    "targetAudienceLevel": "beginner"
  }
],
```

### Actual LLM Behavior (Test Logs)

**Log Line 1041** (First Attempt):
```json
{
  "0.learning_objectives.0": "Expected string, received object",
  "0.learning_objectives.1": "Expected string, received object",
  "0.learning_objectives.2": "Expected string, received object",
  "0.lessons.0.lesson_objectives.0": "Expected string, received object",
  "0.lessons.0.lesson_objectives.1": "Expected string, received object",
  ...
}
```

**What LLM Actually Generated** (inferred):
```json
{
  "learning_objectives": [
    { "id": "...", "text": "...", "language": "ru", "cognitiveLevel": "apply", ... }
  ]
}
```

**Why**: LLM followed the EXAMPLE (lines 806-814) instead of the SCHEMA (line 768).

---

## Root Cause Analysis

### Primary Cause: Hardcoded Examples Override Schema Descriptions

**Evidence**:
1. zodToPromptSchema outputs **CORRECT** schema (verified by reading zod-to-prompt-schema.ts:40-177)
2. Schema is **INCLUDED** in prompt (line 768: `${schemaDescription}`)
3. **BUT** lines 797-849 contain hardcoded JSON example with OBJECTS
4. LLMs are **TRAINED** to follow concrete examples over abstract schema descriptions
5. Result: LLM generates OBJECTS despite schema saying STRINGS

**Why This Wasn't Caught Earlier**:
- Commit f96c64e added zodToPromptSchema to metadata-generator.ts (line 434)
- Commit f96c64e added zodToPromptSchema to section-batch-generator.ts (line 762)
- **BUT** didn't remove the hardcoded examples (lines 797-849)
- Commit 5262f9c marked T053 as "complete" without running the test
- problem-investigator (INV-2025-11-17-012) checked code but didn't RUN the test

---

## Historical Timeline

### 2025-11-16 (INV-2025-11-16-001)
- **Finding**: Metadata generator prompts LLM for objects, schema expects strings
- **Recommendation**: Fix metadata-generator.ts lines 430-439
- **Status**: DOCUMENTED but NEVER IMPLEMENTED

### 2025-11-17 Morning (Commit f96c64e)
- **Change**: Added zodToPromptSchema utility
- **Change**: Updated metadata-generator.ts to use zodToPromptSchema
- **Change**: Updated section-batch-generator.ts to use zodToPromptSchema
- **MISTAKE**: Didn't remove hardcoded examples (lines 797-849)
- **Result**: Schema added BUT examples contradict it

### 2025-11-17 Morning (Commit 5262f9c)
- **Change**: Marked T053 as "complete" in task docs
- **MISTAKE**: Never actually RAN the test
- **Result**: FALSE COMPLETION

### 2025-11-17 Afternoon (INV-2025-11-17-012)
- **Agent**: problem-investigator
- **Finding**: "Problem ALREADY FIXED by f96c64e, test NOW PASSES"
- **MISTAKE**: Checked code exists, didn't verify it WORKS
- **Result**: FALSE POSITIVE

### 2025-11-17 Afternoon (INV-2025-11-17-013 - THIS INVESTIGATION)
- **Action**: Ran T053 test
- **Result**: TEST FAILED (same errors)
- **Discovery**: Hardcoded examples contradict zodToPromptSchema
- **Status**: ROOT CAUSE IDENTIFIED

---

## Why problem-investigator Was Wrong

**problem-investigator's Conclusion** (INV-2025-11-17-012):
> "Problem ALREADY FIXED by commit f96c64e... Test NOW PASSES"

**Why This Was Incorrect**:
1. ✅ Verified zodToPromptSchema exists in code
2. ✅ Verified it's being called
3. ❌ **NEVER ran the test to verify it works**
4. ❌ **NEVER checked for contradictions** (hardcoded examples)
5. ❌ **NEVER read the actual prompt output**

**What Should Have Been Done**:
1. ✅ Check zodToPromptSchema exists (DONE)
2. ✅ Check it's being used (DONE)
3. ❌ **RUN THE TEST** to verify success
4. ❌ **READ FULL PROMPT** to check for contradictions
5. ❌ **ANALYZE TEST LOGS** to see actual LLM behavior

---

## Proposed Solution

### Solution 1: Remove Hardcoded Examples (CRITICAL)

**Objective**: Delete lines 797-849 in section-batch-generator.ts to eliminate contradiction.

**Files to Fix**:
1. `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts`
   - **DELETE** lines 797-849 (hardcoded JSON examples for attempt 1)
   - **KEEP** lines 762-768 (zodToPromptSchema usage)
   - **KEEP** lines 853-865 (attempt 2 strict rules - no examples)

**Changes Required**:

**BEFORE** (lines 795-851):
```typescript
if (attemptNumber === 1) {
  // Attempt 1: Standard prompt with ultra-minimal structure example + detailed schema
  prompt += `**Critical JSON Structure** (fill with real data):
{"section_number":1,"section_title":"str",...OBJECTS...}

**Output Format**: Valid JSON matching this DETAILED structure (1 section with 3-5 lessons):

{
  "learning_objectives": [
    {
      "id": "uuid-v4",
      "text": "...",
      ...
    }
  ],
  ...
}

**Output**: Valid JSON only, no markdown, no explanations.
`;
}
```

**AFTER** (simplified):
```typescript
if (attemptNumber === 1) {
  // Attempt 1: Trust zodToPromptSchema output (lines 762-768)
  prompt += `**Output Format**: Valid JSON matching the schema above (1 section with 3-5 lessons).

**Critical Requirements**:
- learning_objectives: Array of STRINGS (not objects)
- lesson_objectives: Array of STRINGS (not objects)
- exercise_type: One of [self_assessment, case_study, hands_on, discussion, quiz, simulation, reflection]
- All required fields must be present
- No markdown, no code blocks, no explanations

**Output**: Valid JSON only.
`;
}
```

**Complexity**: Low (30 min - delete + simplified replacement)
**Risk**: Low (removing contradiction, keeping schema)
**Priority**: P0-CRITICAL

---

### Solution 2: Same Fix for metadata-generator.ts (HIGH)

**Objective**: Apply same fix to metadata-generator.ts if it has similar issues.

**Investigation Needed**:
1. Search metadata-generator.ts for hardcoded JSON examples
2. Check if they contradict zodToPromptSchema output
3. Remove if found

**Complexity**: Medium (1 hour - need to investigate first)
**Risk**: Low (same pattern as section-batch-generator)
**Priority**: P1-HIGH

---

### Solution 3: Add Verification Test (MEDIUM)

**Objective**: Add unit test that verifies prompt doesn't contain contradictions.

**Approach**:
1. Create `tests/unit/stage5/prompt-consistency.test.ts`
2. For each generator:
   - Generate prompt
   - Parse zodToPromptSchema output
   - Scan prompt for hardcoded examples
   - Verify examples match schema (or don't exist)
3. Fail if contradiction found

**Complexity**: Medium (2 hours)
**Risk**: Low (test-only change)
**Priority**: P2-MEDIUM

---

## Implementation Plan

### Phase 1: Critical Fixes (1 hour)

**Task 1.1**: Fix section-batch-generator.ts (30 min)
- Delete lines 797-849 (hardcoded examples)
- Replace with simplified instructions (trust zodToPromptSchema)
- Run type-check

**Task 1.2**: Verify with T053 test (15 min)
- Run T053 E2E test
- Check for "Expected string, received object" errors
- Verify generation succeeds

**Task 1.3**: Commit fix (15 min)
- Git add + commit with `/push patch`
- Reference this investigation

**Success Criteria**:
- No hardcoded examples in prompts
- zodToPromptSchema is ONLY source of truth
- T053 test PASSES

---

### Phase 2: Systematic Prevention (2 hours)

**Task 2.1**: Investigate metadata-generator.ts (30 min)
- Search for hardcoded JSON examples
- Check for contradictions
- Document findings

**Task 2.2**: Fix metadata-generator.ts if needed (30 min)
- Apply same fix as section-batch-generator
- Run type-check

**Task 2.3**: Add prompt-consistency test (1 hour)
- Create test file
- Implement contradiction detection
- Run test suite

**Success Criteria**:
- All generators use zodToPromptSchema as single source of truth
- Test catches future contradictions

---

## Validation Plan

### Unit Tests

**Test Coverage**:
1. `tests/unit/stage5/section-batch-generator.test.ts`
   - Verify prompt contains zodToPromptSchema output
   - Verify NO hardcoded JSON examples
   - Verify attempt 1 and attempt 2 prompts are consistent

2. `tests/unit/stage5/metadata-generator.test.ts`
   - Same checks as above

**Run**:
```bash
pnpm test tests/unit/stage5/
```

---

### Integration Test

**Run T053 E2E Test**:
```bash
pnpm test tests/e2e/t053-synergy-sales-course.test.ts
```

**Success Criteria**:
- ✅ Stage 5 generation SUCCEEDS
- ✅ No "Expected string, received object" errors
- ✅ No "Required" field errors
- ✅ No "Invalid enum value" errors
- ✅ Test completes within 15 minutes

---

## Lessons Learned

### What Went Wrong

1. **Incomplete Fix** (f96c64e): Added zodToPromptSchema but didn't remove contradicting examples
2. **False Completion** (5262f9c): Marked task complete without running test
3. **Insufficient Investigation** (INV-2025-11-17-012): Checked code exists, didn't verify it works
4. **No Contradiction Detection**: No automated check for prompt consistency

### How to Prevent This

1. **ALWAYS RUN TESTS** before marking tasks complete
2. **REMOVE OLD CODE** when adding new patterns (don't layer on top)
3. **CHECK FULL PROMPT** output, not just schema existence
4. **ADD VERIFICATION TESTS** to catch contradictions automatically
5. **INVESTIGATE MEANS TEST** not just "code exists"

---

## Success Metrics

**Primary Goal**: T053 E2E test PASSES

**Secondary Goals**:
- ✅ Zero "Expected string, received object" errors
- ✅ Zero "Invalid enum value" errors
- ✅ Zero "Required" field errors
- ✅ zodToPromptSchema is ONLY source of truth for schema structure
- ✅ No hardcoded JSON examples that contradict schemas
- ✅ Stage 5 generation completes in < 10 minutes

**Quality Gates**:
- Type-check MUST pass
- Unit tests MUST pass
- E2E test MUST pass
- No new warnings introduced

---

## Follow-Up Tasks

**After Phase 1 completes**:
1. Apply same fix to metadata-generator.ts (if needed)
2. Add prompt-consistency verification test
3. Update investigation documents (mark old ones as SUPERSEDED)
4. Document this pattern in architecture docs

---

## Notes

- This is the **THIRD investigation** into the same root cause
- Previous investigations (INV-2025-11-16-001, INV-2025-11-17-012) were INCORRECT or INCOMPLETE
- **ROOT CAUSE**: Not prompts vs schema, but EXAMPLES vs schema
- zodToPromptSchema utility IS working, just being overridden
- Solution is **DELETE** not **ADD**

---

**Investigation Status**: ✅ COMPLETED - Root Cause Identified
**Next Action**: Execute Task 1.1 (Fix section-batch-generator.ts)
**Assigned To**: MAIN orchestrator (direct execution)
**Blocking**: T053 E2E test, Stage 5 production deployment
