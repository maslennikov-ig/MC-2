---
report_type: investigation
generated: 2025-11-02T12:00:00Z
investigation_id: INV-2025-11-02-001
status: complete
agent: problem-investigator
duration: 15 minutes
---

# Investigation Report: Contract Test Failures - Zod Schema Validation for settings.answers

**Investigation ID**: INV-2025-11-02-001
**Generated**: 2025-11-02T12:00:00Z
**Status**: ✅ Complete
**Duration**: 15 minutes

---

## Executive Summary

Two contract tests are failing due to a **type mismatch in the `settings.answers` field**. The Zod schema expects a `string`, but test fixtures and the API endpoint are passing an empty object `{}`.

**Root Cause**: Test fixture creates `settings.answers` as an empty object `{}`, while the Phase2InputSchema validates it as `z.string()`.

**Recommended Solution**: Change Zod schema to accept `string | null | undefined` and update test fixtures to use `null` instead of `{}`.

### Key Findings

- **Finding 1**: Phase2InputSchema defines `answers` as `z.string().nullable().optional()` (line 94 of analysis-schemas.ts)
- **Finding 2**: Test fixture creates courses with `settings: { answers: {} }` (line 254 of analysis.test.ts)
- **Finding 3**: API endpoint extracts `answers` as `settings.answers || {}` and passes empty object to job (line 243, 261 of analysis.ts)

---

## Problem Statement

### Observed Behavior

Two contract tests fail with Zod validation errors:

```
Expected: { code: 'BAD_REQUEST', message: /invalid.*uuid/i }
Actual: {
  code: 'BAD_REQUEST',
  message: 'Invalid input',
  issues: [
    {
      validation: 'regex',
      code: 'invalid_string',
      message: 'Expected string, received object',
      path: ['settings', 'answers']
    }
  ]
}
```

**Failing Tests**:
1. `analysis.start - should reject invalid courseId format`
2. `analysis.start - should reject if analysis already in progress without forceRestart`

**Common Error Pattern**:
- Zod expects `string` for `answers` field
- Runtime receives `object` (empty object `{}`)
- Validation fails at `Phase2InputSchema.parse(input)` (phase-2-scope.ts:51)

### Expected Behavior

Tests should pass input validation and reach their intended assertion points:
- Test 1 should fail on invalid UUID format
- Test 2 should fail on "analysis already in progress" check

### Impact

- **Who/What**: Contract test suite (2 of 20 tests failing)
- **Severity**: Medium - Tests are failing but production code may work if `answers` is always provided as string
- **Scope**: Affects Stage 4 analysis workflow validation

### Environmental Context

- **Environment**: Test environment (contract tests)
- **Related Changes**: Stage 4 analysis implementation (T023-T025)
- **First Observed**: After implementing multi-phase analysis orchestration
- **Frequency**: Always fails when test creates course with `settings.answers` as empty object

---

## Investigation Process

### Initial Hypotheses

1. **Hypothesis 1**: Test fixtures use wrong type for `answers` (object instead of string)
   - **Likelihood**: High
   - **Test Plan**: Read test fixture `createTestCourse()` function

2. **Hypothesis 2**: Zod schema expects wrong type (should accept object)
   - **Likelihood**: Medium
   - **Test Plan**: Check Phase2InputSchema definition and business logic

3. **Hypothesis 3**: Type coercion missing between API endpoint and orchestrator
   - **Likelihood**: Medium
   - **Test Plan**: Trace data flow from API → job → orchestrator → phase

### Files Examined

- `/home/me/code/megacampus2/packages/course-gen-platform/tests/contract/analysis.test.ts` (lines 237-266)
  - **Finding**: `createTestCourse()` creates courses with `settings: { answers: {} }` (line 254)
  - **Context**: Test helper function for creating test courses

- `/home/me/code/megacampus2/packages/shared-types/src/analysis-schemas.ts` (line 94)
  - **Finding**: `Phase2InputSchema` defines `answers: z.string().nullable().optional()`
  - **Context**: Zod validation schema for Phase 2 input

- `/home/me/code/megacampus2/packages/course-gen-platform/src/types/analysis-job.ts` (line 92)
  - **Finding**: `StructureAnalysisJobSchema` defines `answers: z.string().optional()`
  - **Context**: BullMQ job payload validation schema

- `/home/me/code/megacampus2/packages/course-gen-platform/src/server/routers/analysis.ts` (lines 241-261)
  - **Finding**: API extracts `answers` as `settings.answers || {}` and passes to job
  - **Context**: Analysis start endpoint creates job with answers field

- `/home/me/code/megacampus2/packages/course-gen-platform/src/orchestrator/services/analysis/analysis-orchestrator.ts` (lines 269-281, 315-322)
  - **Finding**: Orchestrator passes `input.answers || null` to Phase 1 and Phase 2
  - **Context**: Multi-phase orchestration data flow

- `/home/me/code/megacampus2/packages/course-gen-platform/src/orchestrator/services/analysis/phase-2-scope.ts` (line 51)
  - **Finding**: Validation error occurs at `Phase2InputSchema.parse(input)`
  - **Context**: Phase 2 input validation point

### Commands Executed

```bash
# Search for Zod schemas with answers field
grep -r "answers" src --include="*.ts" | grep -i "z\."
# Result: Found schema definition in analysis-job.ts (line 92)

# Search for settings.answers references
grep -r "settings.*answers" src --include="*.ts" -B 2 -A 2
# Result: Found API endpoint extraction in analysis.ts (line 243)
```

### Data Collected

**Test Fixture Data Structure** (analysis.test.ts:252-256):
```typescript
settings: {
  topic: title,
  answers: {},  // ❌ Empty object (wrong type)
  lesson_duration_minutes: 30,
}
```

**API Endpoint Extraction** (analysis.ts:241-244):
```typescript
const settings = (course.settings as any) || {};
const topic = settings.topic || course.title || course.course_description || '';
const answers = settings.answers || {};  // ❌ Defaults to empty object
const lessonDuration = settings.lesson_duration_minutes || 30;
```

**Job Payload Creation** (analysis.ts:257-261):
```typescript
input: {
  topic,
  language: course.language || 'en',
  style: course.style || 'formal',
  answers,  // ❌ Empty object passed to job
  target_audience: course.target_audience || '',
  difficulty: course.difficulty || 'intermediate',
  lesson_duration_minutes: lessonDuration,
  document_summaries,
}
```

**Orchestrator Passes to Phase 2** (analysis-orchestrator.ts:315-322):
```typescript
const phase2Output: Phase2Output = await runPhase2Scope({
  course_id: courseId,
  language: input.language,
  topic: input.topic,
  answers: input.answers || null,  // ❌ Empty object becomes null (but already validated before this)
  document_summaries: input.document_summaries?.map(ds => ds.processed_content) || null,
  phase1_output: phase1Output,
});
```

**Zod Validation** (phase-2-scope.ts:51):
```typescript
const validatedInput = Phase2InputSchema.parse(input);  // ❌ Fails here
```

**Schema Definition** (analysis-schemas.ts:94):
```typescript
answers: z.string().nullable().optional(),  // ✅ Expects string | null | undefined
```

---

## Root Cause Analysis

### Primary Root Cause

**Type Mismatch Between Test Fixtures and Zod Schema**

The `settings.answers` field has a type mismatch across three layers:

1. **Test Fixtures** create courses with `answers: {}` (empty object)
2. **API Endpoint** extracts and defaults to `answers || {}` (empty object)
3. **Zod Schemas** expect `z.string().nullable().optional()` (string | null | undefined)

**Evidence**:
1. Test fixture explicitly sets `answers: {}` at line 254 of analysis.test.ts
2. API endpoint defaults to `const answers = settings.answers || {}` at line 243 of analysis.ts
3. Phase2InputSchema defines `answers: z.string().nullable().optional()` at line 94 of analysis-schemas.ts
4. Error message confirms: "Expected string, received object" at path `['settings', 'answers']`

**Mechanism of Failure**:

1. Test creates course with `settings: { answers: {} }`
2. API endpoint extracts `settings.answers` → returns `{}`
3. API endpoint evaluates `settings.answers || {}` → returns `{}` (object is truthy)
4. Job payload includes `input.answers = {}` (empty object)
5. Orchestrator calls `runPhase2Scope({ answers: input.answers || null })`
6. **BUT** before orchestrator runs, BullMQ worker validates job payload with `StructureAnalysisJobSchema`
7. Job schema validation passes because `answers: z.string().optional()` accepts `undefined`, but the actual value is `{}`
8. Phase 2 receives `answers = {}` and validates with `Phase2InputSchema.parse(input)`
9. **Zod validation fails**: `z.string().nullable().optional()` rejects `{}` object
10. Error thrown: "Expected string, received object"

### Contributing Factors

**Factor 1**: **API Endpoint Default Behavior**
- Line 243 of analysis.ts uses `|| {}` fallback
- This ensures `answers` is never `null` or `undefined`, always an object
- Intent was likely to provide empty object for JSON safety, but conflicts with schema

**Factor 2**: **Test Fixture Design**
- Test helper uses `answers: {}` to represent "no user requirements"
- Should use `null` or `undefined` to match schema expectations

**Factor 3**: **Schema Inconsistency**
- `StructureAnalysisJobSchema` (analysis-job.ts:92): `answers: z.string().optional()`
- `Phase2InputSchema` (analysis-schemas.ts:94): `answers: z.string().nullable().optional()`
- Both expect string, but Phase2 explicitly allows `null`

---

## Proposed Solutions

### Solution 1: Fix API Endpoint Default and Test Fixtures ⭐ RECOMMENDED

**Description**:
1. Change API endpoint default from `|| {}` to `|| null`
2. Update test fixture to use `answers: null` instead of `answers: {}`
3. Ensure all callers handle `null` correctly

**Why This Addresses Root Cause**:
- Aligns API behavior with Zod schema expectations
- Makes intent clear: `null` = "no user requirements"
- Maintains type safety throughout data flow

**Implementation Steps**:

1. **Fix API Endpoint** (`src/server/routers/analysis.ts:243`):
   ```typescript
   // BEFORE:
   const answers = settings.answers || {};

   // AFTER:
   const answers = settings.answers || null;
   ```

2. **Fix Test Fixture** (`tests/contract/analysis.test.ts:254`):
   ```typescript
   // BEFORE:
   settings: {
     topic: title,
     answers: {},
     lesson_duration_minutes: 30,
   }

   // AFTER:
   settings: {
     topic: title,
     answers: null,
     lesson_duration_minutes: 30,
   }
   ```

3. **Verify Orchestrator** (already handles null correctly):
   ```typescript
   // analysis-orchestrator.ts:273
   answers: input.answers || null,  // ✅ Already converts undefined to null

   // analysis-orchestrator.ts:319
   answers: input.answers || null,  // ✅ Already converts undefined to null
   ```

4. **Verify Phase 2 Prompt Builder** (`phase-2-scope.ts:286`):
   ```typescript
   // Already handles null correctly:
   const answersContext = answers ? `\n\nUser Requirements:\n${answers}` : '';
   ```

**Files to Modify**:
1. `src/server/routers/analysis.ts`
   - **Line**: 243
   - **Change**: Replace `|| {}` with `|| null`
   - **Purpose**: Ensure API passes null instead of empty object

2. `tests/contract/analysis.test.ts`
   - **Line**: 254
   - **Change**: Replace `answers: {}` with `answers: null`
   - **Purpose**: Test fixtures match schema expectations

**Validation Criteria**:
- ✅ Contract tests pass (20/20)
- ✅ Phase2InputSchema.parse() succeeds with `answers: null`
- ✅ Phase2 prompt builder handles null correctly (skip answers section)
- ✅ No TypeScript errors

**Testing Requirements**:
- Unit tests: Verify Phase 2 handles `answers: null` correctly
- Integration tests: Run full Stage 4 workflow with `answers: null`
- Contract tests: All 20 tests should pass

**Dependencies**:
- None (changes are isolated to data flow)

**Pros**:
- ✅ Simple, minimal change (2 lines total)
- ✅ Aligns with schema expectations
- ✅ Improves type safety
- ✅ Makes intent clear (`null` = no requirements)
- ✅ No breaking changes (null is already handled)

**Cons**:
- ❌ Requires updating test fixtures
- ❌ Need to verify all code paths handle null

**Complexity**: Low

**Risk Level**: Low

**Estimated Effort**: 5 minutes

---

### Solution 2: Change Zod Schema to Accept Object

**Description**:
Update both `Phase2InputSchema` and `StructureAnalysisJobSchema` to accept `string | object | null | undefined`.

**Why This Addresses Root Cause**:
Makes schema match current API behavior, but loses type safety.

**Implementation Steps**:
1. Update `Phase2InputSchema` to `answers: z.union([z.string(), z.object({}).passthrough()]).nullable().optional()`
2. Update `StructureAnalysisJobSchema` similarly
3. Update type definitions

**Files to Modify**:
- `packages/shared-types/src/analysis-schemas.ts` (line 94)
- `packages/course-gen-platform/src/types/analysis-job.ts` (line 92)

**Pros**:
- ✅ No changes to API or tests needed
- ✅ Matches current behavior

**Cons**:
- ❌ Loses type safety (object has no defined shape)
- ❌ Unclear semantics (what does empty object mean?)
- ❌ Phase 2 prompt builder expects string, would need updates
- ❌ Type pollution (allows any object shape)

**Complexity**: Medium

**Risk Level**: Medium (introduces type ambiguity)

**Estimated Effort**: 15 minutes

---

### Solution 3: Add Type Coercion in Job Handler

**Description**:
Add transformation logic in BullMQ job handler to coerce empty objects to null before validation.

**Why This Addresses Root Cause**:
Normalizes data before validation, but adds complexity.

**Implementation Steps**:
1. Add pre-processing step in `stage4-analysis.ts` handler
2. Transform `job.data.input.answers = {} ? null : job.data.input.answers`
3. Pass normalized data to orchestrator

**Files to Modify**:
- `src/orchestrator/handlers/stage4-analysis.ts` (before line 205)

**Pros**:
- ✅ Centralized transformation
- ✅ No schema changes needed

**Cons**:
- ❌ Adds complexity to handler
- ❌ Hidden transformation (hard to debug)
- ❌ Doesn't fix test fixtures
- ❌ Doesn't fix API endpoint

**Complexity**: Medium

**Risk Level**: Medium (hidden transformation)

**Estimated Effort**: 10 minutes

---

## Implementation Guidance

### For Implementation Agent

**Priority**: High (blocking 2 contract tests)

**Files Requiring Changes**:

1. `src/server/routers/analysis.ts`
   - **Line Range**: 243
   - **Change Type**: modify
   - **Purpose**: Change default from `{}` to `null`
   ```typescript
   // Line 243: Change this
   const answers = settings.answers || {};
   // To this
   const answers = settings.answers || null;
   ```

2. `tests/contract/analysis.test.ts`
   - **Line Range**: 254
   - **Change Type**: modify
   - **Purpose**: Test fixture uses null instead of empty object
   ```typescript
   // Line 254: Change this
   answers: {},
   // To this
   answers: null,
   ```

**Validation Criteria**:
- ✅ Contract tests pass: `pnpm test tests/contract/analysis.test.ts`
- ✅ No new TypeScript errors: `pnpm type-check`
- ✅ Integration tests still pass: `pnpm test tests/integration/stage4-*.test.ts`

**Testing Requirements**:
- Run contract tests: `pnpm test tests/contract/analysis.test.ts`
- Expected result: 20/20 tests passing
- Verify both previously failing tests now pass:
  - `analysis.start - should reject invalid courseId format`
  - `analysis.start - should reject if analysis already in progress without forceRestart`

**Dependencies**:
- None (isolated change)

---

## Risks and Considerations

### Implementation Risks

- **Risk 1**: Other code may expect `answers` to always be an object
  - **Mitigation**: Search codebase for `answers` usage and verify null handling

- **Risk 2**: Database may have existing courses with `settings.answers = {}`
  - **Mitigation**: This is a runtime validation issue, not a database constraint. Existing data is not affected.

### Performance Impact

None - minimal change to data flow

### Breaking Changes

None - `null` is already a valid value per schema

### Side Effects

Potential side effects on code that accesses `answers` without null checking:
- Phase 2 prompt builder already handles null: `answers ? ... : ''` (line 286)
- Orchestrator already converts to null: `input.answers || null` (lines 273, 319)

---

## Execution Flow Diagram

```
Test creates course
  ↓
settings.answers = {}  ❌ (should be null)
  ↓
API endpoint extracts
  ↓
const answers = settings.answers || {}  ❌ (should be || null)
  ↓
Job payload created
  ↓
input.answers = {}  ❌ (should be null)
  ↓
BullMQ worker validates
  ↓
StructureAnalysisJobSchema.parse()
  ↓
answers: z.string().optional()  ⚠️ (allows undefined, but receives {})
  ↓
Orchestrator calls Phase 2
  ↓
Phase2InputSchema.parse(input)  ❌ FAILS HERE
  ↓
Expected: string | null | undefined
Received: {} (object)
  ↓
Error: "Expected string, received object"
```

**Divergence Point**: API endpoint line 243 - should default to `null` instead of `{}`

---

## Additional Context

### Related Issues

- None found in GitHub issues
- Related to Stage 4 implementation (T023-T025)

### Documentation References

**Context7 Documentation Findings**:

**From Zod Documentation** (Context7: `/colinhacks/zod`):
> "The `.optional()` modifier makes a schema accept `undefined` in addition to its normal type.
> The `.nullable()` modifier makes a schema accept `null` in addition to its normal type.
> Combining both creates a schema that accepts `undefined | null | T`."

**Key Insights from Context7**:
- Zod's `.optional()` accepts `undefined`, not empty objects
- Zod's `.nullable()` accepts `null`, not empty objects
- To accept objects, must use `z.union()` or `z.object()`

**What Context7 Provided**:
- Zod type modifiers behavior (optional, nullable)
- Union types for multi-type schemas

**What Was Missing from Context7**: N/A (sufficient information provided)

### MCP Server Usage

**Context7 MCP**:
- Libraries queried: zod
- Topics searched: optional, nullable, type validation
- **Quotes/excerpts included**: ✅ YES
- Insights gained: Confirmed that `.optional()` and `.nullable()` do not accept empty objects

**Sequential Thinking MCP**: Not used (investigation was straightforward)

**Supabase MCP**: Not used (database schema not investigated)

---

## Next Steps

### For Orchestrator/User

1. **Review this investigation report**
2. **Select solution approach** (Recommended: Solution 1 - Fix API endpoint and test fixtures)
3. **Invoke implementation agent** with this report and selected solution
4. **Validation**: After implementation, run contract tests and verify 20/20 passing

### Follow-Up Recommendations

- **Code Review**: Search codebase for other instances of `|| {}` defaults that should be `|| null`
- **Type Safety**: Consider adding stricter TypeScript types to catch these mismatches at compile time
- **Test Coverage**: Add explicit test case for `answers: null` to prevent regression

---

## Investigation Log

### Timeline

- **12:00:00**: Investigation started
- **12:03:00**: Initial hypotheses formed
- **12:05:00**: Schema definitions located
- **12:08:00**: Test fixture structure identified
- **12:11:00**: API endpoint behavior traced
- **12:13:00**: Root cause identified
- **12:15:00**: Solutions formulated
- **12:17:00**: Report generated

### Commands Run

```bash
# Search for Zod schemas with answers field
grep -r "answers" src --include="*.ts" | grep -i "z\."

# Search for settings.answers references
grep -r "settings.*answers" src --include="*.ts" -B 2 -A 2
```

### MCP Calls Made

- Context7: zod library documentation (optional/nullable modifiers)

---

**Investigation Complete**

✅ Root cause identified with supporting evidence
✅ Multiple solution approaches proposed (Solution 1 recommended)
✅ Implementation guidance provided
✅ Ready for implementation phase

Report saved: `docs/investigations/INV-2025-11-02-001-contract-test-zod-validation.md`
