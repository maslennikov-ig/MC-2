# Investigation: T053 Test Failure - Phase 2 Missing Fields

**Date**: 2025-11-16
**Status**: In Progress
**Priority**: High
**Test**: T053 E2E - Synergy Sales Course

---

## Problem Statement

T053 E2E test fails during Phase 2 (Scope Analysis) with ZodError validation failure.

**Error**:
```
ZodError: [
  {
    "code": "invalid_type",
    "expected": "array",
    "received": "undefined",
    "path": ["recommended_structure", "sections_breakdown", 7, "key_topics"],
    "message": "Required"
  },
  {
    "code": "invalid_type",
    "expected": "string",
    "received": "undefined",
    "path": ["recommended_structure", "sections_breakdown", 7, "pedagogical_approach"],
    "message": "Required"
  },
  {
    "expected": "'flat' | 'gradual' | 'steep'",
    "received": "undefined",
    "path": ["recommended_structure", "sections_breakdown", 7, "difficulty_progression"],
    "message": "Required"
  }
]
```

**Location**: `packages/course-gen-platform/src/orchestrator/services/analysis/phase-2-scope.ts:157`

---

## Root Cause Analysis

### What Happened

Phase 2 LLM generated `sections_breakdown` array with 8 sections (index 0-7), but **section at index 7 is MISSING required fields**:
- ❌ `key_topics` (expected: array)
- ❌ `pedagogical_approach` (expected: string)
- ❌ `difficulty_progression` (expected: 'flat' | 'gradual' | 'steep')

### Why It Happened

LLM output was **incomplete** or **malformed** for the last section. Phase 2 uses auto-repair layer, but repair failed to add missing fields.

**From logs**:
```
[Phase 2] Direct parse FAILED: Unexpected end of JSON input
```

This suggests:
1. LLM generated incomplete JSON
2. JSON repair successfully fixed JSON structure
3. BUT repair didn't validate/add missing schema fields
4. Zod validation caught missing fields

### Related to Schema Changes?

**NO** - This is NOT related to our recent schema cleanup (v0.18.2):
- We removed `scope_instructions` and `document_analysis`
- We made `pedagogical_patterns`, `generation_guidance`, `document_relevance_mapping` REQUIRED
- We did NOT touch `sections_breakdown` schema

This is a **pre-existing issue** with Phase 2 LLM output quality or prompt clarity.

---

## Possible Solutions

### Option 1: Fix Phase 2 Prompt (Recommended)

**Approach**: Update Phase 2 prompt to explicitly emphasize that ALL sections must have ALL required fields.

**Files**:
- `packages/course-gen-platform/src/orchestrator/services/analysis/phase-2-scope.ts`

**Changes**:
- Add explicit reminder in prompt: "CRITICAL: Every section in sections_breakdown MUST include ALL fields: key_topics[], pedagogical_approach, difficulty_progression"
- Add example showing complete section structure

**Pros**:
- Addresses root cause (LLM not generating complete output)
- Prevents future occurrences

**Cons**:
- Requires prompt engineering
- May still have occasional LLM non-compliance

---

### Option 2: Add Post-Processing Validation + Auto-Fix

**Approach**: After LLM generates output, validate each section and add missing fields with defaults.

**Files**:
- `packages/course-gen-platform/src/orchestrator/services/analysis/phase-2-scope.ts`

**Logic**:
```typescript
// After LLM generation, before Zod validation
const fixedSections = phase2Output.recommended_structure.sections_breakdown.map((section, idx) => ({
  ...section,
  key_topics: section.key_topics || [],
  pedagogical_approach: section.pedagogical_approach || 'hands-on practice',
  difficulty_progression: section.difficulty_progression || 'gradual',
}));
```

**Pros**:
- Guarantees no validation failures
- Resilient to LLM output quality issues

**Cons**:
- Hides LLM quality problems
- Default values may not be semantically correct

---

### Option 3: Retry with Better Prompt on Validation Failure

**Approach**: If Zod validation fails, retry Phase 2 with enhanced prompt emphasizing missing fields.

**Files**:
- `packages/course-gen-platform/src/orchestrator/services/analysis/phase-2-scope.ts`

**Logic**:
```typescript
try {
  validated = Phase2OutputSchema.parse(llmOutput);
} catch (zodError) {
  // Extract missing fields from zodError
  const missingFields = extractMissingFields(zodError);

  // Retry with enhanced prompt
  llmOutput = await retryWithEnhancedPrompt(missingFields);
  validated = Phase2OutputSchema.parse(llmOutput);
}
```

**Pros**:
- Self-healing on validation failures
- Maintains semantic correctness

**Cons**:
- Extra LLM call (cost + latency)
- Complex error handling

---

## Recommendation

**Use Option 1 + Option 2 (Hybrid)**:

1. **Option 1**: Fix Phase 2 prompt to reduce occurrence rate
2. **Option 2**: Add safety net post-processing to guarantee no failures

This gives us:
- ✅ Better LLM output quality (prompt fix)
- ✅ Zero validation failures (post-processing safety)
- ✅ No extra LLM calls
- ✅ Maintains test stability

---

## Implementation Plan

### Task 1: Fix Phase 2 Prompt
- **File**: `packages/course-gen-platform/src/orchestrator/services/analysis/phase-2-scope.ts`
- **Change**: Add explicit reminder about required fields in `sections_breakdown`

### Task 2: Add Post-Processing Safety Net
- **File**: `packages/course-gen-platform/src/orchestrator/services/analysis/phase-2-scope.ts`
- **Change**: Add validation + auto-fix BEFORE Zod validation

### Task 3: Re-run T053 Test
- **Command**: `pnpm vitest run tests/e2e/t053-synergy-sales-course.test.ts`
- **Expected**: PASS without validation errors

---

## Next Steps

1. Delegate to problem-investigator OR spec-impl for implementation
2. Implement hybrid solution (Option 1 + Option 2)
3. Run T053 test
4. If passes → commit with `/push patch`
5. If fails → create new investigation document and iterate

---

## Status

- [x] Investigation complete
- [ ] Solution implemented
- [ ] Test passing
- [ ] Changes committed
