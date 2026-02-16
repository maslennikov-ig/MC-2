# Phase 3 Zod Validation → UnifiedRegenerator Repair Path Test Report

**Date:** 2026-02-16
**Test File:** `/home/me/code/mc2/packages/course-gen-platform/tests/unit/stages/stage4-analysis/phase-3-zod-repair.test.ts`
**Source File:** `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-3-expert.ts` (lines 259-302)

## Summary

Created comprehensive unit tests for the Phase 3 Expert Analysis Zod validation failure → UnifiedRegenerator repair path. This critical code path handles scenarios where the LLM returns valid JSON but the output fails Zod schema validation (e.g., missing required fields like `pedagogical_strategy`).

**Test Status:** ✅ All 9 tests passing
**Execution Time:** 10ms
**Test Framework:** Vitest 4.0.15

## Test Coverage

### 1. Main Repair Path (2 tests)

**Test 1.1: `should invoke UnifiedRegenerator when Zod validation fails`**

- **Scenario:** LLM returns valid JSON missing `pedagogical_strategy` field
- **Expected:** UnifiedRegenerator is instantiated and called with proper configuration
- **Verifies:**
  - UnifiedRegenerator constructor called with all 5 layers enabled
  - `regenerate()` called with Zod error context
  - Successful repair returns valid Phase3Output

**Test 1.2: `should pass Zod validation error details to UnifiedRegenerator`**

- **Scenario:** LLM returns valid JSON but `assessment_approach` too short (fails `min(50)`)
- **Expected:** parseError contains structured Zod validation details
- **Verifies:**
  - parseError string contains "Zod validation failed"
  - Error context is passed to regenerator for informed repair

### 2. Success Path (2 tests)

**Test 2.1: `should return valid Phase3Output when repair succeeds`**

- **Scenario:** Invalid output missing `pedagogical_strategy`, UnifiedRegenerator repairs it
- **Expected:** Valid Phase3Output returned with all required fields
- **Verifies:**
  - `pedagogical_strategy.assessment_approach` length ≥ 50 chars
  - `pedagogical_strategy.progression_logic` length ≥ 100 chars
  - `research_flags` and `phase_metadata` present

**Test 2.2: `should validate repaired output against Phase3OutputSchema`**

- **Scenario:** Empty JSON object repaired by UnifiedRegenerator
- **Expected:** Repaired data passes final Zod validation
- **Verifies:**
  - Repaired output meets schema constraints
  - No secondary validation failures after repair

### 3. Failure Path (2 tests)

**Test 3.1: `should throw descriptive error when UnifiedRegenerator fails`**

- **Scenario:** UnifiedRegenerator exhausts all 5 layers without success
- **Expected:** Error thrown with descriptive message
- **Verifies:**
  - Error message matches `/Phase 3 validation failed after repair/`
  - Error includes UnifiedRegenerator's failure reason

**Test 3.2: `should include error details in thrown error message`**

- **Scenario:** UnifiedRegenerator fails with custom error
- **Expected:** Thrown error includes both context and specific failure reason
- **Verifies:**
  - Error message format: `Phase 3 validation failed after repair: {error}`

### 4. Logger Integration (1 test)

**Test 4.1: `should log warning when routing to UnifiedRegenerator`**

- **Scenario:** Zod validation failure triggers repair path
- **Expected:** `logger.warn` called with structured context
- **Verifies:**
  - Log contains `phase: 'phase-3-expert'`
  - Log contains Zod validation errors
  - Log message: "Zod validation failed, routing through UnifiedRegenerator"

### 5. Edge Cases (2 tests)

**Test 5.1: `should handle valid output on first attempt (no repair needed)`**

- **Scenario:** LLM returns valid output with proper `pedagogical_strategy`
- **Expected:** UnifiedRegenerator NOT invoked
- **Verifies:**
  - Happy path bypasses repair system
  - Direct validation succeeds

**Test 5.2: `should handle UnifiedRegenerator returning data that still fails Zod`**

- **Scenario:** UnifiedRegenerator returns `success: true` but data still invalid
- **Expected:** Error thrown when second Zod validation fails
- **Verifies:**
  - Final Zod validation (line 295) catches incomplete repairs
  - System doesn't accept invalid data even if regenerator claims success

## Code Path Tested

**File:** `phase-3-expert.ts` (lines 259-302)

```typescript
let validated: z.infer<typeof Phase3OutputSchema>;
try {
  validated = Phase3OutputSchema.parse(parsedOutput);
} catch (validationError) {
  if (validationError instanceof z.ZodError) {
    // Route Zod validation failures through UnifiedRegenerator
    logger.warn(...);
    const regenerator = new UnifiedRegenerator<z.infer<typeof Phase3OutputSchema>>({
      enabledLayers: ['auto-repair', 'critique-revise', 'partial-regen', 'model-escalation', 'emergency'],
      maxRetries: 3,
      schema: Phase3OutputSchema,
      model: model,
      metricsTracking: true,
      stage: 'analyze',
      courseId: input.course_id,
      phaseId: 'stage_4_expert',
      allowWarningFallback: true,
    });
    const result = await regenerator.regenerate({
      rawOutput: preprocessedContent,
      originalPrompt: prompt,
      parseError: `Zod validation failed: ${JSON.stringify(validationError.errors)}`,
    });
    if (result.success && result.data) {
      validated = Phase3OutputSchema.parse(result.data); // Line 295
    } else {
      throw new Error(`Phase 3 validation failed after repair: ${result.error}`);
    }
  } else {
    throw validationError;
  }
}
```

## Mocking Strategy

### Dependencies Mocked

1. **`@/shared/llm/langchain-models`**
   - `getModelForPhase`: Returns mock model with configurable `invoke()` response
   - `getTextContent`: Pass-through to string conversion

2. **`@/stages/stage4-analysis/utils/observability`**
   - `trackPhaseExecution`: Executes callback and returns result
   - `storeTraceData`: No-op

3. **`@/stages/stage4-analysis/utils/research-flag-detector`**
   - `detectResearchFlags`: Returns empty array

4. **`@/shared/regeneration`** (CRITICAL)
   - `UnifiedRegenerator`: Mock class with configurable `regenerate()` method
   - Uses `function()` syntax (not arrow) to support `new` operator
   - `mockRegenerate` spy allows per-test response configuration

5. **`@/shared/utils/json-repair`**
   - `extractJSON`: Pass-through (no markdown extraction needed)

6. **`@/shared/validation/preprocessing`**
   - `preprocessObject`: Identity function

7. **`@/shared/prompts/prompt-service`**
   - `createPromptService`: Returns mock with `renderPrompt() → 'Mock prompt text'`

8. **`@/shared/utils/zod-to-prompt-schema`**
   - `zodToPromptSchema`: Returns 'mock schema'

9. **`@/shared/logger`**
   - Mock Pino logger with `info/debug/warn/error` spies

## Schema Under Test

**Phase3OutputSchema** (from `phase-3-expert.ts` lines 76-81):

```typescript
const Phase3OutputSchema = z.object({
  pedagogical_strategy: z.object({
    assessment_approach: z.string().min(50), // How learners demonstrate understanding
    progression_logic: z.string().min(100), // How difficulty increases across lessons
  }),
});
```

**Validation Rules:**

- `pedagogical_strategy` required (object)
- `assessment_approach` required (string, min 50 chars)
- `progression_logic` required (string, min 100 chars)

## Test Execution

```bash
cd /home/me/code/mc2/packages/course-gen-platform
./node_modules/.bin/vitest run tests/unit/stages/stage4-analysis/phase-3-zod-repair.test.ts --config vitest.config.unit.ts
```

**Result:**

```
✓ tests/unit/stages/stage4-analysis/phase-3-zod-repair.test.ts (9 tests) 10ms

Test Files  1 passed (1)
Tests       9 passed (9)
Duration    1.12s
```

## Key Assertions

### UnifiedRegenerator Configuration

```typescript
expect(UnifiedRegenerator).toHaveBeenCalledWith(
  expect.objectContaining({
    enabledLayers: expect.arrayContaining([
      'auto-repair',
      'critique-revise',
      'partial-regen',
      'model-escalation',
      'emergency',
    ]),
    maxRetries: 3,
    schema: expect.anything(),
    model: mockModel,
    metricsTracking: true,
    stage: 'analyze',
    courseId: mockPhase3Input.course_id,
    phaseId: 'stage_4_expert',
    allowWarningFallback: true,
  })
);
```

### Regenerate Call

```typescript
expect(mockRegenerate).toHaveBeenCalledWith(
  expect.objectContaining({
    rawOutput: invalidOutput,
    originalPrompt: 'Mock prompt text',
    parseError: expect.stringContaining('Zod validation failed'),
  })
);
```

### Logger Warning

```typescript
expect(logger.warn).toHaveBeenCalledWith(
  expect.objectContaining({
    phase: 'phase-3-expert',
    errors: expect.anything(),
  }),
  'Zod validation failed, routing through UnifiedRegenerator'
);
```

## Benefits

1. **Production Validation:** Tests actual repair path used in Stage 4 Expert Analysis
2. **Error Handling:** Verifies graceful degradation when UnifiedRegenerator fails
3. **Configuration Accuracy:** Ensures UnifiedRegenerator receives correct parameters
4. **Edge Case Coverage:** Tests both success and failure scenarios
5. **Logger Integration:** Verifies observability when repair is triggered
6. **Schema Enforcement:** Confirms final Zod validation after repair

## Related Files

- Source: `/home/me/code/mc2/packages/course-gen-platform/src/stages/stage4-analysis/phases/phase-3-expert.ts`
- Test: `/home/me/code/mc2/packages/course-gen-platform/tests/unit/stages/stage4-analysis/phase-3-zod-repair.test.ts`
- UnifiedRegenerator: `/home/me/code/mc2/packages/course-gen-platform/src/shared/regeneration/unified-regenerator.ts`
- Schema: Defined inline in `phase-3-expert.ts` (lines 76-81)

## Maintenance Notes

- **Mock updates:** If `UnifiedRegenerator` interface changes, update mock in test file
- **Schema changes:** If `Phase3OutputSchema` fields change, update test data accordingly
- **Layer changes:** If enabled layers change (currently all 5), update test expectations
- **Error messages:** If error message format changes (line 297), update test assertions

## Conclusion

Comprehensive test suite successfully validates the Zod validation failure → UnifiedRegenerator repair path in Phase 3 Expert Analysis. All 9 tests pass, covering main path, success path, failure path, logger integration, and edge cases.
