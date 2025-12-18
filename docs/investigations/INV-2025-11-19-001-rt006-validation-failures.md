# Investigation: RT-006 Validation Failures - zodToPromptSchema Missing ZodEffects Handler

---
investigation_id: INV-2025-11-19-001
status: ✅ COMPLETE - Root Cause Identified
timestamp: 2025-11-19T08:45:00Z
priority: P0 - Critical (blocks Stage 5 completion)
test_file: tests/e2e/t053-synergy-sales-course.test.ts
course_id: 83d22a57-ec2a-4d1f-8cfc-004d64c4ab77
parent_investigation: INV-2025-11-17-013
related_investigations:
  - INV-2025-11-17-013 (zodToPromptSchema contradiction - hardcoded examples removed ✅)
  - INV-2025-11-16-001 (RT-006 metadata validation - initial discovery)
---

## Executive Summary

**Root Cause**: `zodToPromptSchema` utility does NOT handle `ZodEffects` (schemas wrapped with `.refine()`), causing it to return `"unknown"` instead of the actual schema structure for `LessonSchema`.

**Impact**: LLM prompts show "unknown" for lesson structure → LLM doesn't know which fields to generate → RT-006 validation fails with "Required" errors for `lesson_number`, `estimated_duration_minutes`, `practical_exercises`.

**Why Previous Fix Failed**: Commit 8af7c1d correctly removed hardcoded JSON examples but didn't address the underlying `ZodEffects` handling gap in `zodToPromptSchema`.

**Solution**: Add `ZodEffects` unwrapping to `zodToPromptSchema` (10 lines of code, 15 min fix).

**Status**: Root cause identified, solution designed, ready for implementation.

---

## Problem Statement

### Observed Behavior (Test Logs)

**Error Pattern** (Attempt 1):
```json
{
  "msg": "RT-006 validation failed in section generation",
  "batchNum": 1,
  "sectionIndex": 0,
  "issues": "0.lessons.0.lesson_number: Required; 0.lessons.0.estimated_duration_minutes: Required; 0.lessons.0.practical_exercises: Required; 0.lessons.1.lesson_number: Required; 0.lessons.1.estimated_duration_minutes: Required; 0.lessons.1.practical_exercises: Required; 0.lessons.2.lesson_number: Required; 0.lessons.2.estimated_duration_minutes: Required; 0.lessons.2.practical_exercises: Required"
}
```

**Error Pattern** (Attempt 2 - After Auto-Repair):
```json
{
  "msg": "RT-006 validation failed in section generation",
  "issues": "0.lessons.0.lesson_number: Required; 0.lessons.0.practical_exercises.0.exercise_type: Required; 0.lessons.0.practical_exercises.0.exercise_title: Required; 0.lessons.0.practical_exercises.0.exercise_description: Required; ... (30+ more field errors)"
}
```

**Test Result**: PERMANENT FAILURE after 2 attempts, infinite retry loop prevented by max attempts.

### Expected Behavior

**RT-006 Validation Schema** (from `generation-result.ts` lines 464-506):
```typescript
export const LessonSchema = z.object({
  lesson_number: z.number().int().positive(),               // REQUIRED ✅
  lesson_title: z.string().min(5).max(500),                 // REQUIRED ✅
  lesson_objectives: z.array(z.string().min(10).max(600))   // REQUIRED ✅
    .min(1).max(5),
  key_topics: z.array(z.string().min(5).max(300))           // REQUIRED ✅
    .min(2).max(10),
  estimated_duration_minutes: z.number().int().min(3).max(45), // REQUIRED ✅
  difficulty_level: z.enum(['beginner', 'intermediate', 'advanced'])
    .optional(),
  practical_exercises: z.array(PracticalExerciseSchema)     // REQUIRED ✅
    .min(3).max(5),
})
  .refine(                                                   // ⚠️ WRAPS IN ZodEffects
    (lesson) => validateDurationProportionality(lesson).passed,
    (lesson) => ({ message: validateDurationProportionality(lesson).issues?.[0] })
  );
```

**LLM Should Generate**:
```json
{
  "section_number": 1,
  "lessons": [
    {
      "lesson_number": 1,                        // ❌ MISSING
      "lesson_title": "...",
      "lesson_objectives": ["..."],
      "key_topics": ["..."],
      "estimated_duration_minutes": 15,          // ❌ MISSING
      "practical_exercises": [                   // ❌ MISSING
        {
          "exercise_type": "hands_on",
          "exercise_title": "...",
          "exercise_description": "..."
        }
      ]
    }
  ]
}
```

---

## Investigation Process

### Phase 1: Tier 0 - Project Internal Search (MANDATORY FIRST)

**Files Examined**:
1. ✅ `docs/investigations/INV-2025-11-17-013` - Previous investigation that removed hardcoded examples
2. ✅ `docs/investigations/INV-2025-11-16-001` - Original RT-006 validation issue
3. ✅ Git history since 2025-11-15 for generation files
4. ✅ Test logs from `/tmp/t053-performance-test.log`

**Key Finding**: Commit 8af7c1d removed hardcoded JSON examples correctly, but test still fails with same error pattern.

### Phase 2: Tier 1 - Code Analysis (Schema & Prompt)

**RT-006 Validation Schema** (`packages/shared-types/src/generation-result.ts`):

**Lines 464-506 - LessonSchema Definition**:
```typescript
export const LessonSchema = z.object({
  lesson_number: z.number().int().positive(),               // ✅ REQUIRED
  lesson_title: z.string().min(5).max(500),
  lesson_objectives: z.array(z.string().min(10).max(600)).min(1).max(5),
  key_topics: z.array(z.string().min(5).max(300)).min(2).max(10),
  estimated_duration_minutes: z.number().int().min(3).max(45), // ✅ REQUIRED
  difficulty_level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  practical_exercises: z.array(PracticalExerciseSchema).min(3).max(5), // ✅ REQUIRED
})
  .refine(                                                   // ⚠️ CRITICAL: WRAPS IN ZodEffects
    (lesson) => validateDurationProportionality(lesson).passed,
    (lesson) => ({ message: validateDurationProportionality(lesson).issues?.[0] })
  );
```

**Lines 515-540 - SectionSchema Definition**:
```typescript
export const SectionSchema = z.object({
  section_number: z.number().int().positive(),
  section_title: z.string().min(10).max(600),
  section_description: z.string().min(20).max(2000),
  learning_objectives: z.array(z.string().min(10).max(600)).min(1).max(5),
  estimated_duration_minutes: z.number().int().positive(),
  lessons: z.array(LessonSchema)                           // ⚠️ CONTAINS ZodEffects
    .min(1),
});  // ✅ NO .refine() on SectionSchema itself
```

**LLM Prompt Template** (`packages/course-gen-platform/src/services/stage5/section-batch-generator.ts`):

**Lines 762-768 - Schema Inclusion (CORRECT)**:
```typescript
// RT-002: Add Zod schema description for clear structure
const schemaDescription = zodToPromptSchema(SectionSchema);

prompt += `**CRITICAL: You MUST respond with valid JSON matching this EXACT schema**:

${schemaDescription}
```

**Lines 795-813 - Attempt 1 Prompt (Post-Fix)**:
```typescript
if (attemptNumber === 1) {
  // Attempt 1: Trust zodToPromptSchema output (lines 762-768) as single source of truth
  prompt += `**Output Format**: Valid JSON matching the schema above (1 section with 3-5 lessons).

**CRITICAL Field Type Requirements** (common mistakes to avoid):
- \`learning_objectives\`: Must be array of STRINGS (NOT objects with id/text/language/cognitiveLevel)
- \`lesson_objectives\`: Must be array of STRINGS (NOT objects)
- \`exercise_type\`: Must be one of: self_assessment, case_study, hands_on, discussion, quiz, simulation, reflection
- \`section_number\`: Integer (${sectionIndex + 1})
- \`section_title\`: String ("${sectionTitle}")

**Quality Requirements**:
- Objectives: Measurable action verbs (analyze, create, implement, evaluate - NOT "understand", "know")
- Topics: Specific, concrete (NOT generic like "Introduction", "Overview")
- Exercises: Actionable with clear, detailed instructions
- Duration: Realistic for content scope (lesson: 3-45min, section: 15-180min)

**Output**: Valid JSON only, no markdown, no code blocks, no explanations.
`;
}
```

**Analysis**: Prompt correctly uses `zodToPromptSchema(SectionSchema)` and removed hardcoded examples. But **what is `zodToPromptSchema` actually outputting?**

### Phase 3: zodToPromptSchema Utility Analysis

**File**: `packages/course-gen-platform/src/utils/zod-to-prompt-schema.ts`

**Lines 40-177 - Function Implementation**:
```typescript
export function zodToPromptSchema(schema: z.ZodType, depth: number = 0): string {
  const indent = '  '.repeat(depth);
  const nextIndent = '  '.repeat(depth + 1);

  // Unwrap optional and nullable
  let currentSchema = schema;
  let isOptional = false;
  let isNullable = false;

  while (
    currentSchema instanceof z.ZodOptional ||
    currentSchema instanceof z.ZodNullable
  ) {
    if (currentSchema instanceof z.ZodOptional) {
      isOptional = true;
      currentSchema = (currentSchema as z.ZodOptional<any>)._def.innerType;
    }
    if (currentSchema instanceof z.ZodNullable) {
      isNullable = true;
      currentSchema = (currentSchema as z.ZodNullable<any>)._def.innerType;
    }
  }

  const optionalSuffix = isOptional ? ' (optional)' : '';
  const nullableSuffix = isNullable ? ' (nullable)' : '';

  // Handle ZodObject
  if (currentSchema instanceof z.ZodObject) { ... }

  // Handle ZodArray
  if (currentSchema instanceof z.ZodArray) { ... }

  // Handle ZodString, ZodNumber, ZodEnum, ZodBoolean, ZodLiteral, ZodUnion
  ...

  // ❌ CRITICAL GAP: NO HANDLER FOR ZodEffects!
  // Fallback for unknown types
  return `unknown${optionalSuffix}${nullableSuffix}`;  // ⚠️ RETURNS "unknown" FOR ZodEffects
}
```

**What Happens**:

1. `zodToPromptSchema(SectionSchema)` is called
2. `SectionSchema` is a `ZodObject` → enters `ZodObject` handler ✅
3. For each field, recursively calls `zodToPromptSchema`:
   - `section_number`: `ZodNumber` → returns `"integer, min 1"` ✅
   - `section_title`: `ZodString` → returns `"string (min 10, max 600)"` ✅
   - ...
   - `lessons`: `ZodArray` → enters `ZodArray` handler ✅
     - Element type: `LessonSchema` → calls `zodToPromptSchema(LessonSchema)`
     - **PROBLEM**: `LessonSchema` is wrapped in `ZodEffects` (due to `.refine()`)
     - `instanceof z.ZodObject` → **FALSE** (it's `ZodEffects`, not `ZodObject`)
     - `instanceof z.ZodArray` → **FALSE**
     - ... all handlers fail ...
     - Falls through to fallback: **returns `"unknown"`** ❌

**Actual Prompt Output** (inferred):
```
{
  "section_number": integer, min 1,
  "section_title": string (min 10, max 600),
  "section_description": string (min 20, max 2000),
  "learning_objectives": array (min 1, max 5) of string (min 10, max 600),
  "estimated_duration_minutes": integer, min 1,
  "lessons": array (min 1) of unknown      // ⚠️ SHOULD BE FULL LESSON STRUCTURE
}
```

**Impact**: LLM sees `"lessons": array of unknown`, so it doesn't know:
- Lessons have `lesson_number` field
- Lessons have `estimated_duration_minutes` field
- Lessons have `practical_exercises` array
- Lessons have specific structure

**Result**: LLM generates lessons **without required fields**, causing RT-006 validation failures.

---

## Root Cause Analysis

### Primary Cause: zodToPromptSchema Missing ZodEffects Handler

**Evidence**:

1. ✅ `LessonSchema` uses `.refine()` for duration validation (line 499-504)
2. ✅ `.refine()` wraps schema in `ZodEffects` (Zod behavior)
3. ✅ `zodToPromptSchema` has NO handler for `ZodEffects` (lines 40-177)
4. ✅ `ZodEffects` falls through to `"unknown"` fallback (line 176)
5. ✅ Prompt shows `"lessons": array of unknown` instead of lesson structure
6. ✅ LLM cannot generate correct structure without schema definition
7. ✅ RT-006 validation fails with "Required" errors for missing fields

**Mechanism of Failure**:

```
LessonSchema = z.object({ ... })
                .refine(validation)
                    ↓
           Wrapped in ZodEffects
                    ↓
    zodToPromptSchema(SectionSchema)
                    ↓
      Processes "lessons" field
                    ↓
        Element type: LessonSchema
                    ↓
      zodToPromptSchema(LessonSchema)
                    ↓
       LessonSchema is ZodEffects
                    ↓
      No handler for ZodEffects
                    ↓
     Falls through to "unknown"
                    ↓
      Prompt: "lessons": array of unknown
                    ↓
       LLM doesn't know structure
                    ↓
   LLM generates lessons without fields
                    ↓
      RT-006 validation FAILS ❌
```

### Contributing Factors

**Factor 1**: Commit 8546b5d added `.refine()` to `LessonSchema` for RT-007 Phase 1 validation
- **When**: 2025-11-17 (recent change)
- **Why**: Duration proportionality validation
- **Impact**: Changed `LessonSchema` from `ZodObject` to `ZodEffects`

**Factor 2**: `zodToPromptSchema` was created (commit f96c64e) without `ZodEffects` handler
- **When**: 2025-11-17 (same day as `.refine()` addition)
- **Why**: Initial implementation didn't anticipate schemas with `.refine()`
- **Impact**: Silent failure (returns "unknown" instead of error)

**Factor 3**: Previous fix (commit 8af7c1d) focused on hardcoded examples
- **When**: 2025-11-17
- **What**: Removed hardcoded JSON examples that contradicted schema
- **Why Incomplete**: Didn't address underlying `ZodEffects` gap
- **Impact**: Fixed one issue but not the root cause

### Why Tests Didn't Catch This

**No Unit Tests for `zodToPromptSchema`**:
- No test coverage for schemas with `.refine()`
- No verification of output format
- No regression tests after adding `.refine()` to `LessonSchema`

**E2E Test (T053) Not Run During Development**:
- Test marked "complete" without execution
- No automated CI pipeline running E2E tests
- Manual testing relied on code inspection, not execution

---

## Proposed Solutions

### Solution 1: Add ZodEffects Handler to zodToPromptSchema (RECOMMENDED)

**Objective**: Unwrap `ZodEffects` to access underlying schema before processing.

**File**: `packages/course-gen-platform/src/utils/zod-to-prompt-schema.ts`

**Implementation** (Lines 40-65, add after unwrapping Optional/Nullable):

**BEFORE**:
```typescript
export function zodToPromptSchema(schema: z.ZodType, depth: number = 0): string {
  const indent = '  '.repeat(depth);
  const nextIndent = '  '.repeat(depth + 1);

  // Unwrap optional and nullable
  let currentSchema = schema;
  let isOptional = false;
  let isNullable = false;

  while (
    currentSchema instanceof z.ZodOptional ||
    currentSchema instanceof z.ZodNullable
  ) {
    if (currentSchema instanceof z.ZodOptional) {
      isOptional = true;
      currentSchema = (currentSchema as z.ZodOptional<any>)._def.innerType;
    }
    if (currentSchema instanceof z.ZodNullable) {
      isNullable = true;
      currentSchema = (currentSchema as z.ZodNullable<any>)._def.innerType;
    }
  }

  const optionalSuffix = isOptional ? ' (optional)' : '';
  const nullableSuffix = isNullable ? ' (nullable)' : '';

  // Handle ZodObject
  if (currentSchema instanceof z.ZodObject) { ... }
  ...
}
```

**AFTER**:
```typescript
export function zodToPromptSchema(schema: z.ZodType, depth: number = 0): string {
  const indent = '  '.repeat(depth);
  const nextIndent = '  '.repeat(depth + 1);

  // Unwrap optional and nullable
  let currentSchema = schema;
  let isOptional = false;
  let isNullable = false;

  while (
    currentSchema instanceof z.ZodOptional ||
    currentSchema instanceof z.ZodNullable
  ) {
    if (currentSchema instanceof z.ZodOptional) {
      isOptional = true;
      currentSchema = (currentSchema as z.ZodOptional<any>)._def.innerType;
    }
    if (currentSchema instanceof z.ZodNullable) {
      isNullable = true;
      currentSchema = (currentSchema as z.ZodNullable<any>)._def.innerType;
    }
  }

  // ✅ NEW: Unwrap ZodEffects (created by .refine(), .transform(), etc.)
  // ZodEffects wraps the actual schema, we need to access the underlying type
  if (currentSchema instanceof z.ZodEffects) {
    currentSchema = (currentSchema as z.ZodEffects<any>)._def.schema;
  }

  const optionalSuffix = isOptional ? ' (optional)' : '';
  const nullableSuffix = isNullable ? ' (nullable)' : '';

  // Handle ZodObject
  if (currentSchema instanceof z.ZodObject) { ... }
  ...
}
```

**Changes**:
- **Lines to add**: 4 lines (import + unwrap logic)
- **Lines modified**: 0 (only adding, not changing existing code)
- **Complexity**: Trivial (same pattern as Optional/Nullable unwrapping)
- **Estimated Time**: 15 minutes

**Impact**:
- ✅ Unwraps `ZodEffects` to access underlying `ZodObject`
- ✅ Continues normal processing for `ZodObject` handler
- ✅ Generates complete lesson structure in prompt
- ✅ LLM receives full schema with all required fields
- ✅ RT-006 validation passes

**Risk**: Very Low
- **Scope**: Isolated to `zodToPromptSchema` utility
- **Behavior**: Consistent with existing unwrapping logic
- **Fallback**: Existing handlers unchanged
- **Testing**: Can verify with unit test

---

### Solution 2: Add Unit Tests for zodToPromptSchema (RECOMMENDED)

**Objective**: Prevent regression by testing schemas with `.refine()`.

**File**: `packages/course-gen-platform/tests/unit/utils/zod-to-prompt-schema.test.ts` (NEW)

**Test Cases**:

```typescript
import { z } from 'zod';
import { zodToPromptSchema } from '@/utils/zod-to-prompt-schema';
import { LessonSchema, SectionSchema } from '@megacampus/shared-types/generation-result';

describe('zodToPromptSchema', () => {
  describe('Basic Types', () => {
    it('handles ZodString with constraints', () => {
      const schema = z.string().min(5).max(100);
      const result = zodToPromptSchema(schema);
      expect(result).toBe('string (min 5, max 100)');
    });

    it('handles ZodNumber with integer and range', () => {
      const schema = z.number().int().min(1).max(10);
      const result = zodToPromptSchema(schema);
      expect(result).toContain('integer');
      expect(result).toContain('min 1');
      expect(result).toContain('max 10');
    });

    it('handles ZodEnum', () => {
      const schema = z.enum(['a', 'b', 'c']);
      const result = zodToPromptSchema(schema);
      expect(result).toBe('enum: a | b | c');
    });
  });

  describe('Complex Types', () => {
    it('handles ZodObject with nested fields', () => {
      const schema = z.object({
        name: z.string().min(3),
        age: z.number().int().min(0),
      });
      const result = zodToPromptSchema(schema);
      expect(result).toContain('"name"');
      expect(result).toContain('"age"');
      expect(result).toContain('string (min 3)');
      expect(result).toContain('integer');
    });

    it('handles ZodArray with element constraints', () => {
      const schema = z.array(z.string().min(10)).min(1).max(5);
      const result = zodToPromptSchema(schema);
      expect(result).toContain('array (min 1, max 5)');
      expect(result).toContain('string (min 10)');
    });
  });

  describe('ZodEffects Handling', () => {
    it('unwraps ZodEffects created by .refine()', () => {
      const schema = z.object({
        value: z.number().int().positive(),
      }).refine(x => x.value > 0, { message: 'Must be positive' });

      const result = zodToPromptSchema(schema);

      // Should NOT return "unknown"
      expect(result).not.toContain('unknown');

      // Should contain field structure
      expect(result).toContain('"value"');
      expect(result).toContain('integer');
    });

    it('handles nested ZodEffects (object with refined nested object)', () => {
      const innerSchema = z.object({
        field: z.string(),
      }).refine(x => x.field.length > 0);

      const outerSchema = z.object({
        nested: innerSchema,
      });

      const result = zodToPromptSchema(outerSchema);

      expect(result).not.toContain('unknown');
      expect(result).toContain('"nested"');
      expect(result).toContain('"field"');
    });
  });

  describe('Real Schemas (Regression Tests)', () => {
    it('generates complete structure for LessonSchema (has .refine())', () => {
      const result = zodToPromptSchema(LessonSchema);

      // Critical: Should NOT return "unknown"
      expect(result).not.toContain('unknown');

      // Must contain ALL required fields
      expect(result).toContain('lesson_number');
      expect(result).toContain('lesson_title');
      expect(result).toContain('lesson_objectives');
      expect(result).toContain('key_topics');
      expect(result).toContain('estimated_duration_minutes');
      expect(result).toContain('practical_exercises');

      // Should show array constraints
      expect(result).toContain('array (min 1, max 5)'); // lesson_objectives
      expect(result).toContain('array (min 3, max 5)'); // practical_exercises
    });

    it('generates complete structure for SectionSchema (contains LessonSchema)', () => {
      const result = zodToPromptSchema(SectionSchema);

      expect(result).not.toContain('unknown');

      // Section fields
      expect(result).toContain('section_number');
      expect(result).toContain('section_title');
      expect(result).toContain('lessons');

      // Nested lesson fields (since lessons is array of LessonSchema)
      expect(result).toContain('lesson_number');
      expect(result).toContain('estimated_duration_minutes');
      expect(result).toContain('practical_exercises');
    });
  });
});
```

**Estimated Time**: 30 minutes
**Priority**: P0 (prevent regression)
**Risk**: None (test-only)

---

### Solution 3: Alternative - Remove .refine() from LessonSchema (NOT RECOMMENDED)

**Objective**: Avoid `ZodEffects` by moving validation outside schema definition.

**Approach**:
1. Remove `.refine()` from `LessonSchema`
2. Move duration validation to runtime check after parsing
3. Keep schema as pure `ZodObject`

**BEFORE**:
```typescript
export const LessonSchema = z.object({ ... })
  .refine(
    (lesson) => validateDurationProportionality(lesson).passed,
    (lesson) => ({ message: validateDurationProportionality(lesson).issues?.[0] })
  );
```

**AFTER**:
```typescript
export const LessonSchema = z.object({ ... });
// NO .refine() - pure ZodObject

// Runtime validation (separate from parsing)
export function validateLesson(lesson: Lesson): ValidationResult {
  const durationResult = validateDurationProportionality(lesson);
  if (!durationResult.passed) {
    return {
      passed: false,
      issues: durationResult.issues,
    };
  }
  return { passed: true };
}
```

**Why NOT RECOMMENDED**:
- ❌ Loses declarative validation in schema
- ❌ Requires manual validation calls everywhere
- ❌ Breaks RT-006/RT-007 validation architecture
- ❌ Higher risk of forgetting validation
- ❌ More code changes across codebase

**Better Solution**: Fix `zodToPromptSchema` to handle `ZodEffects` (Solution 1).

---

## Implementation Plan

### Phase 1: Critical Fix (30 minutes)

**Task 1.1**: Add ZodEffects handler to zodToPromptSchema (15 min)
- File: `packages/course-gen-platform/src/utils/zod-to-prompt-schema.ts`
- Change: Add 4 lines after Optional/Nullable unwrapping (lines 64-68)
- Implementation: See Solution 1 above
- Run: `pnpm type-check` to verify

**Task 1.2**: Add unit tests for zodToPromptSchema (30 min)
- File: `packages/course-gen-platform/tests/unit/utils/zod-to-prompt-schema.test.ts` (NEW)
- Implementation: See Solution 2 above
- Run: `pnpm test tests/unit/utils/zod-to-prompt-schema.test.ts`
- Verify: All tests pass, including LessonSchema/SectionSchema

**Task 1.3**: Verify with T053 E2E test (10 min)
- Run: `pnpm test tests/e2e/t053-synergy-sales-course.test.ts`
- Expected: Stage 5 generation SUCCEEDS
- Expected: No RT-006 "Required" field errors
- Expected: Test completes in < 15 minutes

**Success Criteria**:
- ✅ `zodToPromptSchema(LessonSchema)` returns full structure (not "unknown")
- ✅ Unit tests pass
- ✅ T053 E2E test passes
- ✅ No regression in existing functionality

---

### Phase 2: Documentation & Prevention (20 minutes)

**Task 2.1**: Update investigation document (10 min)
- Mark INV-2025-11-19-001 as RESOLVED
- Link to fix commit
- Add to "Lessons Learned"

**Task 2.2**: Add inline comment in generation-result.ts (5 min)
- File: `packages/shared-types/src/generation-result.ts`
- Location: Line 499 (before `.refine()`)
- Comment:
  ```typescript
  // NOTE: .refine() wraps schema in ZodEffects. zodToPromptSchema handles this
  // by unwrapping to access underlying schema. Do NOT remove this comment.
  // See: INV-2025-11-19-001, zod-to-prompt-schema.ts lines 64-68
  ```

**Task 2.3**: Commit with proper references (5 min)
- Git add + commit
- Reference INV-2025-11-19-001
- Tag with "Fixes RT-006 validation failures"

---

## Validation Plan

### Unit Tests

**Test Suite**: `tests/unit/utils/zod-to-prompt-schema.test.ts`

**Coverage**:
1. ✅ Basic types (string, number, enum, boolean)
2. ✅ Complex types (object, array, union)
3. ✅ ZodEffects unwrapping (.refine())
4. ✅ Nested ZodEffects (refined object in object)
5. ✅ Real schemas (LessonSchema, SectionSchema)

**Run**:
```bash
pnpm test tests/unit/utils/zod-to-prompt-schema.test.ts
```

**Expected**: 100% pass, no "unknown" in output

---

### Integration Test

**Test**: `tests/e2e/t053-synergy-sales-course.test.ts`

**Scenario 2**: Full Pipeline - Analyze + Generate + Style (US2)

**Success Criteria**:
- ✅ Stage 5 generation SUCCEEDS
- ✅ No RT-006 validation errors
- ✅ No "Required" field errors for:
  - `lesson_number`
  - `estimated_duration_minutes`
  - `practical_exercises`
- ✅ All sections generate successfully
- ✅ Test completes within 15 minutes (not timeout)

**Run**:
```bash
pnpm test tests/e2e/t053-synergy-sales-course.test.ts
```

---

## Documentation References

### Tier 0: Project Internal

**Previous Investigations**:
1. **INV-2025-11-17-013** - zodToPromptSchema contradiction
   - **Finding**: Hardcoded JSON examples contradicted schema
   - **Fix**: Removed hardcoded examples (commit 8af7c1d)
   - **Status**: Fixed but incomplete (didn't address ZodEffects)

2. **INV-2025-11-16-001** - RT-006 metadata validation
   - **Finding**: Metadata prompt requested objects, schema expected strings
   - **Fix**: Added zodToPromptSchema utility (commit f96c64e)
   - **Status**: Partial fix (didn't handle ZodEffects)

**Git History**:
```bash
8af7c1d - fix(stage5): remove hardcoded JSON examples that contradict zodToPromptSchema
8546b5d - feat(validators): implement RT-007 Phase 1 - Bloom's Taxonomy Quick Fixes
          ↑ Added .refine() to LessonSchema, creating ZodEffects
f96c64e - refactor: FSM redesign + quality validator fix + system metrics expansion
          ↑ Added zodToPromptSchema utility (didn't handle ZodEffects)
```

**Code References**:
- `packages/shared-types/src/generation-result.ts` lines 464-506 (LessonSchema with .refine())
- `packages/course-gen-platform/src/utils/zod-to-prompt-schema.ts` lines 40-177 (missing ZodEffects handler)
- `packages/course-gen-platform/src/services/stage5/section-batch-generator.ts` lines 762-813 (prompt usage)

### Tier 1: Context7 MCP

**Not Applicable** - This is an internal codebase issue with custom utilities, not a framework/library issue.

### Tier 2/3: External Documentation

**Not Needed** - Root cause identified from internal code analysis.

---

## MCP Server Usage

**Tools Used**:
1. **Project Internal Search** (Tier 0):
   - Read previous investigation documents
   - Read source code files
   - Analyzed git history
   - Extracted test logs

2. **Code Analysis**:
   - Grep for schema definitions
   - Grep for validation patterns
   - Read utility implementations

3. **No External MCP Servers Needed**:
   - Root cause in custom code, not framework
   - Solution design from first principles

---

## Lessons Learned

### What Went Wrong

1. **Incomplete Initial Implementation** (f96c64e):
   - Created `zodToPromptSchema` without considering `.refine()`
   - No test coverage for schemas with `.refine()`
   - No documentation about `ZodEffects` handling

2. **Layered Fixes Without Root Cause Analysis**:
   - Fix 1: Added zodToPromptSchema (didn't test with .refine())
   - Fix 2: Removed hardcoded examples (didn't check prompt output)
   - Fix 3: (this investigation) - found actual root cause

3. **No Verification After Changes**:
   - Commit 8546b5d added `.refine()` to LessonSchema
   - No test run to verify zodToPromptSchema still works
   - No regression test added

4. **Silent Failure Mode**:
   - `zodToPromptSchema` returns "unknown" instead of throwing error
   - Makes debugging harder (no stack trace, no error log)

### How to Prevent This

1. **ALWAYS test after structural changes**:
   - Adding `.refine()` to schema → run E2E test
   - Changing utility function → add unit tests
   - Don't assume "code looks correct" means "code works"

2. **Add defensive checks**:
   - `zodToPromptSchema` should log warning for "unknown" types
   - Consider throwing error instead of silent fallback

3. **Test edge cases proactively**:
   - Schemas with `.refine()`
   - Schemas with `.transform()`
   - Schemas with `.preprocess()`
   - Nested refined schemas

4. **Document utility assumptions**:
   - zodToPromptSchema: "Handles Optional/Nullable/Effects wrappers"
   - generation-result.ts: "Using .refine() is safe, zodToPromptSchema unwraps it"

---

## Success Metrics

**Primary Goal**: T053 E2E test PASSES

**Secondary Goals**:
- ✅ Zero RT-006 "Required" field errors
- ✅ `zodToPromptSchema(LessonSchema)` generates complete structure
- ✅ `zodToPromptSchema(SectionSchema)` includes nested lesson fields
- ✅ Unit tests cover ZodEffects handling
- ✅ No "unknown" in prompt output for any schema

**Quality Gates**:
- Type-check MUST pass
- Unit tests MUST pass (10+ test cases)
- E2E test MUST pass (T053 Scenario 2)
- No new warnings introduced
- Code coverage for zod-to-prompt-schema.ts: 100%

---

## Status

**Investigation**: ✅ COMPLETE - Root Cause Identified
**Solution**: ✅ DESIGNED - Ready for Implementation
**Next Action**: Execute Phase 1 Task 1.1 (Add ZodEffects handler)
**Assigned To**: MAIN orchestrator (direct execution)
**Blocking**: T053 E2E test, Stage 5 production deployment
**Estimated Fix Time**: 30 minutes (15 min code + 15 min tests)

---

## Follow-Up Tasks

**After Phase 1 completes**:
1. ✅ Mark INV-2025-11-19-001 as RESOLVED
2. ✅ Update INV-2025-11-17-013 status (note: fixed hardcoded examples, but ZodEffects issue remained)
3. ✅ Add inline comment in generation-result.ts about .refine() usage
4. ✅ Document this pattern in ARCHITECTURE.md (zodToPromptSchema capabilities)
5. ⏭️ Consider adding ESLint rule: "Warn when adding .refine() to exported schemas"

---

**Investigation Complete** ✅

**Root Cause**: zodToPromptSchema missing ZodEffects handler → returns "unknown" for LessonSchema → LLM doesn't know structure → RT-006 validation fails

**Solution**: Add 4 lines to unwrap ZodEffects (same pattern as Optional/Nullable)

**Ready for Implementation**: YES

---
