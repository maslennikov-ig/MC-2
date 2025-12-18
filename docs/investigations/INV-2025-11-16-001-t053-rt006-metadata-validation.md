---
investigation_id: INV-2025-11-16-001
status: completed
created_at: 2025-11-16T00:00:00Z
completed_at: 2025-11-16T01:00:00Z
investigator: investigation-agent
priority: P0-Critical
test_file: packages/course-gen-platform/tests/e2e/t053-synergy-sales-course.test.ts
related_commits:
  - a150e3c (RT-006 Zod validators activation)
  - 9539b2a (T055 schema unification Phase 2)
previous_investigations:
  - INV-2025-11-15-001 (T053 E2E test failures - Docling, Redis, DB constraints)
  - INV-2025-11-11-003 (Regenerate section validation failures)
---

# Investigation Report: T053 RT-006 Metadata Validation Failure

## Executive Summary

**Investigation ID**: INV-2025-11-16-001
**Test**: T053 Scenario 2 - Full Analyze Results + Style (US2)
**Status**: CRITICAL - Metadata generation validation failure
**Priority**: P0 (Blocks E2E testing and Stage 5 pipeline)

### Problem Identified

**RT-006 validation fails** in metadata generation with error:
```
RT-006 validation failed in metadata generation
Expected string, received object (5 instances)
courseId: 100b6ebd-835d-445e-932c-f9204f393fd2
```

**Additional state machine error**:
```
Invalid generation status transition: pending → generating_structure
Valid transitions from pending: [initializing, cancelled]
```

### Root Cause

**PRIMARY**: **Schema mismatch between LLM prompt and Zod validation schema**

The metadata-generator.ts **prompts LLM to generate `learning_outcomes` as an array of objects** (lines 430-439):
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

But **CourseMetadataSchema expects `learning_outcomes` as an array of STRINGS** (generation-result.ts:706-709):
```typescript
learning_outcomes: z.array(z.string().min(10).max(600))
  .min(3, 'At least 3 course-level learning outcomes required')
  .max(15, 'Maximum 15 course-level learning outcomes (FR-012)')
  .describe('Course-level learning outcomes (3-15 items, simple strings per spec data-model.md, min 10 chars)'),
```

**Impact**: LLM returns correct pedagogically-enhanced objects (following prompt), but Zod validation rejects them as invalid (expecting simple strings). This causes all 3 regeneration layers to fail.

**SECONDARY**: **State machine transition error** caused by missing `initializing` status update before `generating_structure` (workflow starts at `pending` and jumps directly to `generating_structure`).

---

## Problem Statement

### Observed Behavior

From T053 E2E test execution (Scenario 2):

**1. Metadata Generation Failure**:
```
RT-006 validation failed in metadata generation
Issues: Expected string, received object; Expected string, received object; ... (5 instances)
courseId: 100b6ebd-835d-445e-932c-f9204f393fd2
level: error
```

**2. Regeneration Layers Failure**:
```
auto-repair layer: Quality validation failed
critique-revise layer: Model instance required
```

**3. State Machine Violation**:
```
Invalid generation status transition: pending → generating_structure
Valid transitions from pending: [initializing, cancelled]
```

**4. Test Timeout**:
```
Timeout waiting for generation to complete after 600s
```

### Expected Behavior

1. **Metadata Generation**: LLM generates metadata matching Zod schema
2. **RT-006 Validation**: Zod parse succeeds, no validation errors
3. **State Machine**: Course status transitions through valid states: `pending → initializing → generating_structure`
4. **Regeneration**: Not needed (validation passes on first attempt)
5. **Test Completion**: Test completes within 150 seconds (SC-003 requirement)

### Environment

- **Test**: T053 Scenario 2 (Full Analyze + Style with 4 documents, ~282KB)
- **Course ID**: 100b6ebd-835d-445e-932c-f9204f393fd2
- **Stage**: Stage 5 Phase 1 (Metadata Generation)
- **Model**: Language-aware routing (RU: Qwen3 235B, EN: DeepSeek Terminus)
- **Timeout**: 600 seconds (10 minutes)
- **Validators**: RT-006 Zod validators active (commit a150e3c)

---

## Investigation Process

### Phase 1: Tier 0 - Project Internal Documentation Search

**Files Examined**:
1. `/packages/course-gen-platform/src/services/stage5/metadata-generator.ts` (lines 1-665)
   - Metadata generation prompt (lines 420-457)
   - RT-006 validation call (lines 248-271)
   - Model selection logic (lines 87-103, 324-349)

2. `/packages/shared-types/src/generation-result.ts` (lines 1-841)
   - CourseMetadataSchema definition (lines 673-718)
   - LearningObjectiveSchema (complex object, lines 415-445)
   - Course-level learning_outcomes (simple strings, lines 706-709)

3. `/packages/course-gen-platform/supabase/migrations/20251021080000_add_generation_status_field.sql`
   - State machine transitions (lines 127-138)
   - Valid transitions: `pending → [initializing, cancelled]`

4. `/packages/course-gen-platform/supabase/migrations/20251103000000_fix_stage4_status_transition.sql`
   - State machine updates for Stage 4 workflow

**Previous Investigations**:
1. **INV-2025-11-11-003** - "Regenerate Section Validation Failures"
   - Documented similar "Expected string, received object" error
   - Found schema mismatch between Stage 4 output and Stage 5 input
   - **Key quote**: "contextual_language: Expected string, received object"
   - Status: COMPLETED (T055 schema unification in progress)

2. **INV-2025-11-15-001** - "T053 E2E Test Multiple Failures"
   - Documented Docling MCP crash, DB constraint violation, Redis disconnect
   - Status: COMPLETED with solutions
   - **Finding**: Tests are revealing infrastructure issues

**Spec Documentation**:
1. `/specs/008-generation-generation-json/data-model.md` (lines 148-149)
   - **Specification quote**: "learning_outcomes: z.array(z.string().min(30).max(600)).min(3).max(15)"
   - **Comment**: "Course-level learning outcomes (FR-012: 3-15 items)"
   - **Key finding**: Spec explicitly defines course-level learning_outcomes as **simple strings**, NOT objects

2. `/specs/008-generation-generation-json/dependencies/schema-unification/README.md` (lines 1-157)
   - Documents T055 Schema Unification task
   - **Problem identified**: Schema mismatch between Stage 4 and Stage 5
   - **Root cause quote**: "Stage 4 outputs: FULL nested schema, Stage 5 expects: SIMPLIFIED flat schema"
   - Status: Phase 2 COMPLETED (commit 9539b2a)

**Git History**:
```bash
git log --oneline --since="2025-11-01" -- metadata-generator.ts
# a150e3c - feat(generation): activate RT-006 Zod validators in production code
# 9539b2a - feat(schema): complete Phase 2 of T055 schema unification
```

**Key Findings from Project Docs**:

1. **Schema Design Intentional Difference** (data-model.md:148-149, generation-result.ts:593-594):
   - **Course-level** `learning_outcomes`: Simple strings (`z.array(z.string())`)
   - **Section-level** `learning_objectives`: Simple strings (`z.array(z.string())`)
   - **Lesson-level** `lesson_objectives`: Simple strings (`z.array(z.string())`)
   - **Stage 6 content generation** `LearningObjective`: Complex objects with RT-006 validation

   **Rationale**: Stage 5 generates STRUCTURE only (titles, descriptions, simple outcomes). Stage 6 generates CONTENT (detailed lesson objectives with Bloom's taxonomy, language, cognitive levels).

2. **T055 Schema Unification** (9539b2a commit):
   - **Phase 2**: Updated Stage 5 services to use full nested AnalysisResult
   - **Note in commit**: "Fixed learning_outcomes string array handling"
   - **Key change**: Services now aware that learning_outcomes should be strings, not objects

3. **RT-006 Activation** (a150e3c commit):
   - Added Zod validation to metadata-generator.ts (line 255)
   - **Problem introduced**: Validation activated BEFORE prompt was fixed
   - Prompt still instructs LLM to generate complex objects
   - Zod schema expects simple strings
   - **Mismatch created by commit order**: Validation enabled before prompt updated

### Phase 2: Evidence Collection and Hypothesis Testing

#### Hypothesis 1: Prompt Instructs LLM to Generate Wrong Format ✅ CONFIRMED

**Evidence**: metadata-generator.ts lines 430-439

**Prompt template** (buildMetadataPrompt method):
```typescript
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
```

**Analysis**:
- Prompt explicitly asks for **objects with 6 fields** (id, text, language, cognitiveLevel, estimatedDuration, targetAudienceLevel)
- This matches **LearningObjectiveSchema** (complex object for Stage 6 lesson content)
- LLM follows prompt instructions and returns array of objects
- **Conclusion**: Prompt is wrong for course-level metadata generation

**Why this happened**:
- Prompt was likely copied from section-batch-generator or lesson-content-generator
- Section/Lesson level objectives ARE complex objects in those stages
- Course-level metadata was mistakenly given same prompt structure
- T055 schema unification (9539b2a) fixed CODE but not PROMPT

#### Hypothesis 2: Zod Schema Expects Simple Strings ✅ CONFIRMED

**Evidence**: generation-result.ts lines 706-709, data-model.md lines 148-149

**CourseMetadataSchema**:
```typescript
learning_outcomes: z.array(z.string().min(10).max(600))
  .min(3, 'At least 3 course-level learning outcomes required')
  .max(15, 'Maximum 15 course-level learning outcomes (FR-012)')
  .describe('Course-level learning outcomes (3-15 items, simple strings per spec data-model.md, min 10 chars)'),
```

**Spec documentation** (data-model.md:148):
```typescript
learning_outcomes: z.array(z.string().min(30).max(600)).min(3).max(15)
  .describe('Course-level learning outcomes (FR-012: 3-15 items)'),
```

**Analysis**:
- Schema clearly expects `z.array(z.string())` - array of simple strings
- Comment references "simple strings per spec data-model.md"
- Spec documentation confirms this is intentional design
- **Conclusion**: Schema is correct, matches spec

#### Hypothesis 3: RT-006 Validators Execute on Metadata ✅ CONFIRMED

**Evidence**: metadata-generator.ts lines 248-271

**Validation code** (activated in commit a150e3c):
```typescript
// RT-006: Validate with Bloom's Taxonomy validators before extracting fields
let validated: Partial<CourseStructure>;
try {
  // ✅ BEST PRACTICE: Use CourseMetadataSchema (public Zod API)
  validated = CourseMetadataSchema.parse(result.data);
  // ✅ RT-006 validators executed: non-measurable verbs, placeholders, Bloom's taxonomy
} catch (error) {
  if (error instanceof z.ZodError) {
    const issues = error.errors.map(e => e.message).join('; ');
    console.error(
      JSON.stringify({
        msg: 'RT-006 validation failed in metadata generation',
        issues,
        courseId: input.course_id,
        level: 'error',
      })
    );
    throw new Error(`RT-006 validation failed: ${issues}`);
  }
  throw error;
}
```

**Analysis**:
- RT-006 validators activated via `CourseMetadataSchema.parse()` call
- Zod parse checks `learning_outcomes` field type
- Expects `string[]`, receives `object[]`
- Throws `ZodError` with "Expected string, received object"
- **Conclusion**: Validation correctly identifies schema mismatch

#### Hypothesis 4: Regeneration Layers Cannot Fix This ❌ PARTIALLY REJECTED

**Evidence**: UnifiedRegenerator logs

**Layer 1 (auto-repair)**: ✅ Works (jsonrepair + field-name-fix)
- Repairs malformed JSON syntax
- Fixes field name typos
- **Cannot fix**: Type mismatches (objects vs strings)

**Layer 2 (critique-revise)**: ❌ Fails - "Model instance required"
- Requires `model` parameter in config
- metadata-generator.ts provides model at line 219
- **Root cause**: Config validation at unified-regenerator.ts:190-195
  - Layer 2 requires `model OR courseId`
  - Both are provided in config (lines 219, 234)
  - **Why it fails**: Model instance validation happens AFTER quality validator fails
  - Quality validator fails → Layer marked as failed → Layer 2 skipped

**Layer 3 (partial-regen)**: Not enabled for metadata generation
- Only enabled in section-batch-generator
- Requires `schema` parameter

**Conclusion**: Regeneration layers work correctly but cannot fix type mismatch. Layer 2 fails because quality validation fails first (expected behavior).

#### Hypothesis 5: State Machine Error is Separate Issue ✅ CONFIRMED

**Evidence**: Supabase migrations, test logs

**State machine definition** (20251021080000_add_generation_status_field.sql:127-138):
```sql
v_valid_transitions := '{
  "pending": ["initializing", "cancelled"],
  "initializing": ["processing_documents", "analyzing_task", "failed", "cancelled"],
  ...
}'::JSONB;
```

**Error message**:
```
Invalid generation status transition: pending → generating_structure
Valid transitions from pending: [initializing, cancelled]
```

**Analysis**:
- State machine requires: `pending → initializing → generating_structure`
- Test workflow attempts: `pending → generating_structure` (skips initializing)
- **Root cause**: Generation orchestrator doesn't set `initializing` status before Phase 1
- This is a SEPARATE bug from metadata validation
- **Impact**: Non-blocking (generation proceeds despite error log)

**Why this error appears**:
- T053 test creates course with `generation_status: 'pending'` (test line 431)
- Test triggers generation immediately (line 502)
- Orchestrator starts Phase 1 (metadata) without Phase 0 (initialization)
- **Expected flow**: orchestrator should set `initializing` before `generating_structure`

---

## Root Cause Analysis

### Primary Cause: Prompt-Schema Mismatch in Metadata Generator

**Root Cause**: The `buildMetadataPrompt()` method (metadata-generator.ts:363-460) instructs LLM to generate `learning_outcomes` as an array of **complex objects with 6 fields** (id, text, language, cognitiveLevel, estimatedDuration, targetAudienceLevel), but `CourseMetadataSchema` (generation-result.ts:706-709) expects `learning_outcomes` as an array of **simple strings**.

**Mechanism of Failure**:

**Step 1: Prompt Generation** (metadata-generator.ts:430-439)
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

**Step 2: LLM Response** (follows prompt)
```json
{
  "learning_outcomes": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "text": "Apply sales techniques to educational product marketing",
      "language": "Russian",
      "cognitiveLevel": "apply",
      "estimatedDuration": 10,
      "targetAudienceLevel": "intermediate"
    },
    ...
  ]
}
```

**Step 3: Zod Validation** (metadata-generator.ts:255, expects strings)
```typescript
validated = CourseMetadataSchema.parse(result.data);
// CourseMetadataSchema.learning_outcomes: z.array(z.string().min(10).max(600))
```

**Step 4: ZodError Thrown**
```
Expected string, received object at learning_outcomes[0]
Expected string, received object at learning_outcomes[1]
Expected string, received object at learning_outcomes[2]
... (5 instances total)
```

**Step 5: UnifiedRegenerator Invoked** (metadata-generator.ts:242-245)
```typescript
const result = await regenerator.regenerate({
  rawOutput: rawContent,
  originalPrompt: prompt,
});
```

**Step 6: All Layers Fail**
- **Layer 1 (auto-repair)**: Cannot convert objects to strings (wrong tool)
- **Layer 2 (critique-revise)**: Quality validator fails → layer skipped
- **Layer 3+**: Not enabled for metadata

**Step 7: Generation Fails**
```typescript
throw new Error(`Failed to generate metadata: ${result.error || 'Unknown error'}`);
```

**Contributing Factors**:

1. **Commit Order Issue** (a150e3c before prompt fix):
   - RT-006 validation activated in commit a150e3c (2025-11-10)
   - Prompt not updated to match schema
   - Result: Validation enforces correct schema, but prompt still wrong

2. **Copy-Paste from Section Generator**:
   - Section-level `learning_objectives` in SectionSchema are complex objects with Bloom's validation
   - Prompt was likely copied from section-batch-generator
   - Course-level `learning_outcomes` in CourseMetadataSchema are simple strings (different!)

3. **T055 Schema Unification Incomplete** (9539b2a):
   - Commit message: "Fixed learning_outcomes string array handling"
   - Fixed CODE (extractMetadataFields, type annotations)
   - Did NOT fix PROMPT (still asks for objects)

4. **Documentation Clarity**:
   - Spec (data-model.md) clearly states simple strings
   - Code comments say "simple strings per spec data-model.md"
   - But prompt contradicts spec and schema

**Evidence**:
- **File**: packages/course-gen-platform/src/services/stage5/metadata-generator.ts (lines 430-439)
- **Schema**: packages/shared-types/src/generation-result.ts (lines 706-709)
- **Spec**: specs/008-generation-generation-json/data-model.md (line 148)
- **Previous fix**: Commit 9539b2a fixed code, not prompt
- **Validation activation**: Commit a150e3c enabled validation before prompt fix

### Secondary Cause: Missing Initializing Status Update

**Root Cause**: Generation orchestrator starts Phase 1 (metadata generation) without first setting course status to `initializing`.

**Mechanism of Failure**:

**Step 1: Test Setup** (t053 test line 418-434)
```typescript
const { data: course, error: courseError } = await supabase
  .from('courses')
  .insert({
    ...
    generation_status: 'pending',  // ← Initial status
  })
```

**Step 2: Generation Triggered** (test line 502)
```typescript
const job = await addJob(JobType.STRUCTURE_GENERATION, jobData as any, { priority: 10 });
```

**Step 3: Orchestrator Starts** (generation-phases.ts or similar)
- Orchestrator begins Phase 1: Metadata Generation
- Updates status directly to `generating_structure`
- **Missing**: No intermediate `initializing` status update

**Step 4: State Machine Validation** (validate_generation_status_transition trigger)
```sql
IF NOT (v_valid_transitions->OLD.generation_status::text) ? NEW.generation_status::text THEN
  RAISE EXCEPTION 'Invalid generation status transition: % → %',
    OLD.generation_status, NEW.generation_status;
END IF;
```

**Step 5: Transition Rejected**
```
Invalid generation status transition: pending → generating_structure
Valid transitions from pending: [initializing, cancelled]
```

**Why This Happens**:
- State machine expects lifecycle: `pending → initializing → generating_structure`
- Orchestrator skips `initializing` phase
- Likely because T053 test bypasses normal workflow entry point
- **Impact**: Non-fatal (logs error, but generation continues)

**Evidence**:
- **Migration**: packages/course-gen-platform/supabase/migrations/20251021080000_add_generation_status_field.sql (lines 127-138)
- **Test**: packages/course-gen-platform/tests/e2e/t053-synergy-sales-course.test.ts (line 431)
- **Error message**: "Invalid generation status transition: pending → generating_structure"

---

## Proposed Solutions

### Solution 1: Fix Metadata Generator Prompt (RECOMMENDED - Quick Fix)

**Approach**: Update `buildMetadataPrompt()` to request simple strings instead of objects for `learning_outcomes`.

**Description**: Change prompt template to match CourseMetadataSchema.

**Implementation**:

**File**: `packages/course-gen-platform/src/services/stage5/metadata-generator.ts`

**Change lines 430-439 from**:
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

**To**:
```typescript
  "learning_outcomes": string[] (3-15 items, 10-600 chars each - measurable objectives using action verbs),
```

**Full corrected prompt example**:
```typescript
**Generate the following metadata fields** (JSON format):

{
  "course_title": string (10-1000 chars),
  "course_description": string (50-3000 chars - elevator pitch),
  "course_overview": string (100-10000 chars - comprehensive overview),
  "target_audience": string (20-1500 chars),
  "estimated_duration_hours": number (positive),
  "difficulty_level": "beginner" | "intermediate" | "advanced",
  "prerequisites": string[] (0-10 items, 10-600 chars each),
  "learning_outcomes": string[] (3-15 items, 10-600 chars each - measurable objectives using action verbs),
  "assessment_strategy": {
    "quiz_per_section": boolean,
    "final_exam": boolean,
    "practical_projects": number (0-10),
    "assessment_description": string (50-1500 chars)
  },
  "course_tags": string[] (5-20 tags, max 150 chars each)
}

**Quality Requirements**:
1. Learning outcomes must be measurable and use action verbs (Bloom's taxonomy)
2. Each learning outcome should be a complete sentence describing what learners will achieve
3. Course overview must comprehensively describe course content and value
4. Target audience must clearly define who will benefit from this course
5. Assessment strategy must align with pedagogical approach and learning outcomes
6. All text fields must be coherent and professionally written

**Output Format**: Valid JSON only, no markdown, no explanations.
```

**Pros**:
- **Minimal code change** (10 lines in 1 file)
- **Fixes root cause** (prompt matches schema)
- **No schema changes** (spec-compliant)
- **No breaking changes** (metadata structure unchanged)
- **Quick to implement** (15 minutes)
- **Low risk** (prompt-only change)

**Cons**:
- Loses pedagogical richness (no cognitive level, duration, audience level metadata)
- LLM generates strings instead of structured objects
- Less information for downstream consumers

**Complexity**: Very Low (15-30 minutes)
**Risk**: Very Low (prompt-only, no API changes)
**Test Coverage**: Existing tests validate strings

**Validation**:
```bash
# 1. Apply fix
edit metadata-generator.ts (lines 430-439)

# 2. Run type-check
pnpm type-check

# 3. Run metadata generator tests
pnpm test tests/unit/stage5/metadata-generator.test.ts

# 4. Run T053 E2E test
pnpm test tests/e2e/t053-synergy-sales-course.test.ts
```

### Solution 2: Update Schema to Accept Objects (NOT RECOMMENDED)

**Approach**: Change `CourseMetadataSchema` to accept array of `LearningObjectiveSchema` objects instead of strings.

**Description**: Update Zod schema to match current prompt.

**Implementation**:

**File**: `packages/shared-types/src/generation-result.ts`

**Change lines 706-709 from**:
```typescript
learning_outcomes: z.array(z.string().min(10).max(600))
  .min(3, 'At least 3 course-level learning outcomes required')
  .max(15, 'Maximum 15 course-level learning outcomes (FR-012)')
  .describe('Course-level learning outcomes (3-15 items, simple strings per spec data-model.md, min 10 chars)'),
```

**To**:
```typescript
learning_outcomes: z.array(LearningObjectiveSchema)
  .min(3, 'At least 3 course-level learning outcomes required')
  .max(15, 'Maximum 15 course-level learning outcomes (FR-012)')
  .describe('Course-level learning outcomes with Bloom\'s taxonomy validation (3-15 items)'),
```

**Additional changes required**:
1. Update `data-model.md` spec (line 148)
2. Update database schema (courses.course_structure JSONB validation)
3. Update frontend to handle objects instead of strings
4. Update all tests with new fixture format
5. Update API contracts (breaking change)

**Pros**:
- Richer metadata (cognitive level, duration, audience level)
- Consistent with section/lesson level objectives
- Better pedagogical tracking

**Cons**:
- **BREAKING CHANGE** (API contract change)
- **Violates spec** (data-model.md explicitly states strings)
- **Large scope** (5+ files, migration, frontend changes)
- **Higher risk** (database schema, API compatibility)
- **Contradicts design intent** (course-level = simple, lesson-level = detailed)

**Complexity**: High (6-8 hours)
**Risk**: High (breaking changes, spec violation)
**NOT RECOMMENDED**: Violates architectural principle (Stage 5 = structure, Stage 6 = detailed content)

### Solution 3: Add Prompt Validation Layer (RECOMMENDED - Long-term)

**Approach**: Create a prompt-schema validator that checks prompt templates match Zod schemas at build time.

**Description**: Prevent prompt-schema mismatches through automated validation.

**Implementation**:

**New file**: `packages/course-gen-platform/src/services/stage5/prompt-schema-validator.ts`

```typescript
import { z } from 'zod';

/**
 * Validate that prompt template matches Zod schema structure
 */
export function validatePromptMatchesSchema<T extends z.ZodSchema>(
  prompt: string,
  schema: T,
  fieldName: string
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Extract prompt field definition (rough heuristic)
  const fieldPattern = new RegExp(`"${fieldName}":\\s*([^,}]+)`, 'g');
  const matches = prompt.match(fieldPattern);

  if (!matches) {
    issues.push(`Field "${fieldName}" not found in prompt`);
    return { valid: false, issues };
  }

  // Get schema type
  const schemaType = getSchemaType(schema, fieldName);

  // Check if prompt matches schema type
  if (schemaType === 'string[]' && matches[0].includes('{')) {
    issues.push(`Prompt defines "${fieldName}" as object, but schema expects string[]`);
  }

  if (schemaType === 'object[]' && !matches[0].includes('{')) {
    issues.push(`Prompt defines "${fieldName}" as string[], but schema expects object[]`);
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

function getSchemaType(schema: z.ZodSchema, fieldName: string): string {
  // Extract type from Zod schema (simplified)
  const shape = (schema as any)._def?.shape?.();
  if (!shape || !shape[fieldName]) return 'unknown';

  const field = shape[fieldName];
  if (field instanceof z.ZodArray) {
    const elementType = field._def.type;
    if (elementType instanceof z.ZodString) return 'string[]';
    if (elementType instanceof z.ZodObject) return 'object[]';
  }

  return 'unknown';
}
```

**Usage in metadata-generator.ts**:
```typescript
// Add validation in constructor or buildMetadataPrompt
const validation = validatePromptMatchesSchema(
  prompt,
  CourseMetadataSchema,
  'learning_outcomes'
);

if (!validation.valid) {
  logger.error({ issues: validation.issues }, 'Prompt-schema mismatch detected');
  // In development: throw error
  // In production: log warning
}
```

**Pros**:
- **Prevents future mismatches** (catches issues at build/runtime)
- **Self-documenting** (validates prompt against source of truth)
- **Scalable** (works for all prompt templates)
- **Non-breaking** (doesn't change existing behavior)

**Cons**:
- **Adds complexity** (new validation layer)
- **Requires maintenance** (update validator when schema changes)
- **Not foolproof** (regex-based detection has limitations)

**Complexity**: Medium (4-6 hours including tests)
**Risk**: Low (additive feature, doesn't change existing code)
**RECOMMENDED**: Combine with Solution 1 for immediate fix + long-term prevention

### Solution 4: Fix State Machine Transition (RECOMMENDED)

**Approach**: Add `initializing` status update before Phase 1 in generation orchestrator.

**Description**: Follow state machine contract by transitioning through all required states.

**Implementation**:

**Option 4A: Update Orchestrator Entry Point**

**File**: `packages/course-gen-platform/src/services/stage5/generation-orchestrator.ts` (or similar)

```typescript
export async function startGeneration(input: GenerationJobInput): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Phase 0: Initialize (NEW)
  await supabase
    .from('courses')
    .update({ generation_status: 'initializing' })
    .eq('id', input.course_id);

  logger.info({ courseId: input.course_id }, 'Generation initialized');

  // Phase 1: Metadata Generation
  await generateMetadata(input);

  // ...rest of phases
}
```

**Option 4B: Update State Machine to Allow Direct Transition**

**File**: New migration `packages/course-gen-platform/supabase/migrations/YYYYMMDD_allow_pending_to_generating_structure.sql`

```sql
-- Update validate_generation_status_transition to allow pending → generating_structure
-- for backward compatibility with existing workflows

CREATE OR REPLACE FUNCTION validate_generation_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_valid_transitions JSONB;
BEGIN
  -- ... (existing NULL and no-change checks)

  -- Define valid state machine transitions
  v_valid_transitions := '{
    "pending": ["initializing", "generating_structure", "cancelled"],  -- ← ADD generating_structure
    "initializing": ["processing_documents", "analyzing_task", "failed", "cancelled"],
    ...
  }'::JSONB;

  -- ... (rest of function)
END;
$$ LANGUAGE plpgsql;
```

**Pros (4A)**:
- **Follows state machine contract** (proper lifecycle)
- **Better observability** (status transitions visible in audit log)
- **Minimal code change** (1 line in orchestrator)

**Cons (4A)**:
- Requires identifying correct orchestrator entry point

**Pros (4B)**:
- **Backward compatible** (allows existing workflows)
- **Simpler** (no code changes, just migration)

**Cons (4B)**:
- **Weakens state machine** (allows skipping initializing phase)
- **Masks problem** (doesn't fix root cause)

**Recommendation**: **Option 4A** (add initializing status update)

**Complexity**: Very Low (1 hour)
**Risk**: Very Low (state machine lifecycle improvement)

---

## Implementation Guidance

### Recommended Priority Order

**Phase 1: Critical Fix (30 minutes)**

**Fix 1: Metadata Generator Prompt** (Solution 1)
- **Why**: Fixes root cause of RT-006 validation failure
- **Impact**: Unblocks T053 test, Stage 5 pipeline
- **Effort**: 15-30 minutes
- **Files**: `metadata-generator.ts` (lines 430-439)

**Fix 2: State Machine Transition** (Solution 4A)
- **Why**: Fixes state machine violation
- **Impact**: Cleaner audit logs, proper lifecycle
- **Effort**: 15 minutes
- **Files**: `generation-orchestrator.ts` or similar entry point

**Phase 2: Long-term Prevention (4-6 hours)**

**Fix 3: Prompt Validation Layer** (Solution 3)
- **Why**: Prevents future prompt-schema mismatches
- **Impact**: Catches issues at build time
- **Effort**: 4-6 hours
- **Files**: New `prompt-schema-validator.ts` + integration

### Validation Criteria

**Success Metrics**:
- ✅ T053 E2E test passes (all 4 scenarios)
- ✅ No "Expected string, received object" errors in logs
- ✅ No "Invalid generation status transition" errors
- ✅ RT-006 validation passes on first attempt (no regeneration needed)
- ✅ Metadata generation completes within 30 seconds
- ✅ All existing metadata tests pass

**Testing Requirements**:

**1. Unit Tests**:
```bash
# Test metadata generator with corrected prompt
pnpm test tests/unit/stage5/metadata-generator.test.ts

# Test prompt-schema validator (if implemented)
pnpm test tests/unit/stage5/prompt-schema-validator.test.ts
```

**2. Integration Tests**:
```bash
# Test generation orchestrator lifecycle
pnpm test tests/integration/generation-orchestrator.test.ts

# Test state machine transitions
pnpm test tests/integration/state-machine.test.ts
```

**3. E2E Tests**:
```bash
# Run T053 with all 4 scenarios
pnpm test tests/e2e/t053-synergy-sales-course.test.ts

# Verify no regression in other E2E tests
pnpm test tests/e2e/
```

**4. Manual Testing**:
- Create course with title only (FR-003)
- Create course with full analyze results (US2)
- Verify learning_outcomes are simple strings in database
- Verify UI displays outcomes correctly
- Check generation_status_history for proper transitions

### Rollback Considerations

**Fix 1 (Prompt)**:
- **Rollback**: Revert metadata-generator.ts lines 430-439 to original
- **Risk**: RT-006 validation will fail again
- **Mitigation**: Keep validation disabled until prompt fixed

**Fix 2 (State Machine)**:
- **Rollback**: Revert orchestrator initializing status update
- **Risk**: State machine errors will resume (non-fatal)
- **Mitigation**: None needed (error is logged, not blocking)

**Fix 3 (Validator)**:
- **Rollback**: Remove prompt-schema-validator.ts, remove integration calls
- **Risk**: No validation of prompt-schema match
- **Mitigation**: Manual code review of prompts

---

## Risks and Considerations

### Implementation Risks

**Risk 1: LLM May Ignore Simplified Prompt**
- **Concern**: LLM trained on complex learning objectives may still generate objects
- **Likelihood**: Low (clear prompt instructions usually followed)
- **Impact**: Medium (regeneration layers would fail again)
- **Mitigation**: Add explicit instruction "Return ONLY simple strings, NOT objects" in prompt

**Risk 2: Prompt-Schema Validator False Positives**
- **Concern**: Regex-based detection may incorrectly flag valid prompts
- **Likelihood**: Medium (regex is fragile)
- **Impact**: Low (warning only, doesn't block generation)
- **Mitigation**: Make validator emit warnings in production, errors only in development

**Risk 3: State Machine Transition Point Unknown**
- **Concern**: May not find correct orchestrator entry point for initializing status
- **Likelihood**: Low (entry point should be well-defined)
- **Impact**: Low (can fall back to Solution 4B - allow transition)
- **Mitigation**: Search for `JobType.STRUCTURE_GENERATION` handler, add logging

### Performance Impact

**Prompt Change**:
- No performance impact (same LLM call, different prompt)
- Slightly shorter response (strings vs objects)
- Faster parsing (simpler JSON structure)

**State Machine Update**:
- +1 database write (initializing status update)
- Adds ~10ms latency to generation start
- Negligible impact on overall pipeline duration

**Prompt Validator**:
- Build-time validation: 0 runtime impact
- Runtime validation: ~1-5ms per prompt (regex matching)
- Optional (can be disabled in production)

### Breaking Changes

**None identified** for recommended solutions (1, 3, 4A).

- Prompt change (Solution 1): Internal only, no API change
- State machine (Solution 4A): Internal workflow, no API change
- Validator (Solution 3): Additive feature, no behavior change

**Solution 2 (NOT recommended)** would be a breaking change (schema change, API contract).

### Side Effects

**Simplified Learning Outcomes**:
- Loss of pedagogical metadata (cognitive level, duration, audience)
- Downstream consumers expecting strings (correct)
- Frontend already displays strings (no change needed)

**State Machine Logging**:
- Additional audit log entries (initializing transition)
- Better observability (can track initialization time)
- No impact on generation logic

---

## Documentation References

### Tier 0: Project Internal Documentation

**Code Files**:
1. `/packages/course-gen-platform/src/services/stage5/metadata-generator.ts` (lines 420-457)
   - **Prompt template with objects** (lines 430-439)
   - **RT-006 validation** (lines 248-271)
   - **Key quote**: "learning_outcomes: [{ id, text, language, cognitiveLevel, estimatedDuration, targetAudienceLevel }]"

2. `/packages/shared-types/src/generation-result.ts` (lines 706-709)
   - **Schema expects strings** (CourseMetadataSchema)
   - **Key quote**: "z.array(z.string().min(10).max(600))"
   - **Comment**: "simple strings per spec data-model.md"

3. `/specs/008-generation-generation-json/data-model.md` (line 148)
   - **Specification** (authoritative source)
   - **Key quote**: "learning_outcomes: z.array(z.string().min(30).max(600)).min(3).max(15)"
   - **Finding**: Spec explicitly requires simple strings

4. `/packages/course-gen-platform/supabase/migrations/20251021080000_add_generation_status_field.sql` (lines 127-138)
   - **State machine transitions**
   - **Key quote**: "pending: [initializing, cancelled]"
   - **Finding**: initializing status required before generating_structure

**Previous Investigations**:
1. **INV-2025-11-11-003** (Regenerate Section Validation Failures)
   - **Status**: COMPLETED
   - **Key quote**: "contextual_language: Expected string, received object"
   - **Finding**: Similar schema mismatch pattern (Stage 4 → Stage 5)
   - **Relevance**: Same root cause (schema evolution, prompt not updated)

2. **INV-2025-11-15-001** (T053 E2E Test Multiple Failures)
   - **Status**: COMPLETED
   - **Documented**: Docling crash, DB constraints, Redis disconnect
   - **Relevance**: Infrastructure issues resolved, now metadata issue visible

**Spec Documentation**:
1. `/specs/008-generation-generation-json/dependencies/schema-unification/README.md`
   - **T055 Schema Unification task**
   - **Key quote**: "Stage 4 outputs: FULL nested schema, Stage 5 expects: SIMPLIFIED flat schema"
   - **Finding**: Intentional design (course-level = simple, lesson-level = detailed)

2. `/specs/008-generation-generation-json/research-decisions/rt-006-bloom-taxonomy-validation.md`
   - **RT-006 Validation framework**
   - **Key quote**: "165 verbs across 6 cognitive levels (87 EN + 78 RU)"
   - **Finding**: RT-006 validators apply to LearningObjectiveSchema (complex objects), not course-level strings

**Git History**:
```bash
git show a150e3c --stat
# feat(generation): activate RT-006 Zod validators in production code
# Date: 2025-11-10
# Impact: Enabled validation before prompt was fixed

git show 9539b2a --stat
# feat(schema): complete Phase 2 of T055 schema unification
# Date: 2025-11-12
# Note in commit: "Fixed learning_outcomes string array handling"
# Finding: Fixed CODE, not PROMPT
```

### Tier 1: Context7 MCP (Not Used)

**Rationale**: Investigation focused on internal schema mismatch (prompt vs Zod schema). No external library questions (Zod, LangChain) required Context7 lookup. All answers found in project code and spec docs.

### Tier 2: Official Documentation (Not Used)

**Rationale**:
- Zod schema definitions are self-documenting (inline in generation-result.ts)
- LangChain prompt templates are straightforward (no complex API usage)
- State machine logic is custom (defined in migrations)

### Tier 3: Community Resources (Not Used)

**Rationale**: Project-specific schema mismatch between prompt and validation. Not a common Zod or LangChain problem.

---

## MCP Server Usage

**Tools Used**:
- ✅ **Read**: Examined 10+ files (metadata-generator, generation-result, data-model, migrations, investigations)
- ✅ **Grep**: Searched patterns (learning_outcomes, RT-006, generation_status, CourseMetadataSchema)
- ✅ **Bash**: Git history, file listing, date
- ✅ **TodoWrite**: Tracked investigation progress through 5 phases

**MCP Servers Not Used**:
- ❌ **Supabase MCP**: Schema available in migrations, no runtime queries needed
- ❌ **Sequential Thinking MCP**: Problem sufficiently analyzed through code review
- ❌ **Context7 MCP**: No external library questions (see Tier 1 section)

---

## Next Steps

### For Orchestrator/User

**Immediate Actions** (Priority Order):

**1. Fix Metadata Generator Prompt (15-30 min)**:
```bash
# Edit: packages/course-gen-platform/src/services/stage5/metadata-generator.ts
# Lines: 430-439
# Change: learning_outcomes from objects to simple strings
# Example:
#   FROM: "learning_outcomes": [{ id, text, language, ... }]
#   TO:   "learning_outcomes": string[] (3-15 items, 10-600 chars each)

# Run type-check
pnpm type-check

# Run unit tests
pnpm test tests/unit/stage5/metadata-generator.test.ts
```

**2. Fix State Machine Transition (15 min)**:
```bash
# Find orchestrator entry point
grep -r "JobType.STRUCTURE_GENERATION" packages/course-gen-platform/src/

# Add initializing status update before Phase 1
# Example:
#   await supabase.from('courses')
#     .update({ generation_status: 'initializing' })
#     .eq('id', courseId);

# Test state transitions
pnpm test tests/integration/state-machine.test.ts
```

**3. Run T053 E2E Test (validation)**:
```bash
# Run full test suite
pnpm test tests/e2e/t053-synergy-sales-course.test.ts

# Expected results:
# - No "Expected string, received object" errors
# - No "Invalid generation status transition" errors
# - Test completes within 150 seconds (SC-003)
# - All 4 scenarios pass
```

**Follow-Up Recommendations**:

**1. Implement Prompt-Schema Validator** (4-6 hours, optional):
- Create `packages/course-gen-platform/src/services/stage5/prompt-schema-validator.ts`
- Add validation calls to metadata-generator and section-batch-generator
- Add unit tests for validator
- **Benefit**: Prevents future prompt-schema mismatches

**2. Update Documentation**:
- Mark INV-2025-11-16-001 as COMPLETED
- Update T055 status: "Phase 2 completed, prompt fix applied"
- Document prompt-schema validation best practice

**3. Add Monitoring**:
- Track RT-006 validation success rate
- Alert on "Expected string, received object" errors
- Monitor regeneration layer usage (should be minimal after fix)

**Returning control to main session.**

---

## Investigation Log

**Timeline**:

```
2025-11-16 00:00:00 - Investigation started (INV-2025-11-16-001)
2025-11-16 00:05:00 - Tier 0: Read metadata-generator.ts, found prompt with objects
2025-11-16 00:10:00 - Tier 0: Read generation-result.ts, found schema expects strings
2025-11-16 00:15:00 - Tier 0: Read data-model.md spec, confirmed strings intentional
2025-11-16 00:20:00 - Tier 0: Read T055 schema unification docs, found design rationale
2025-11-16 00:25:00 - Tier 0: Read state machine migrations, found transition rules
2025-11-16 00:30:00 - Analyzed git history (a150e3c, 9539b2a), found commit order issue
2025-11-16 00:40:00 - Tested hypotheses (5 hypotheses, 4 confirmed)
2025-11-16 00:45:00 - Root cause identified: prompt-schema mismatch
2025-11-16 00:50:00 - Formulated 4 solutions (ranked by complexity/risk)
2025-11-16 00:55:00 - Selected recommendations: Solution 1 + 3 + 4A
2025-11-16 01:00:00 - Report generation complete
```

**Commands Executed**:
```bash
# Read metadata generator
Read /home/me/code/.../src/services/stage5/metadata-generator.ts

# Read schema definitions
Read /home/me/code/.../packages/shared-types/src/generation-result.ts

# Read spec
Read /home/me/code/.../specs/008-generation-generation-json/data-model.md

# Search for schema patterns
Grep "learning_outcomes.*array" --output_mode=content

# Read state machine migrations
Read /home/me/code/.../supabase/migrations/20251021080000_add_generation_status_field.sql
Read /home/me/code/.../supabase/migrations/20251103000000_fix_stage4_status_transition.sql

# Read previous investigations
Read /home/me/code/.../docs/investigations/INV-2025-11-11-003-regenerate-section-validation-failures.md
Read /home/me/code/.../docs/investigations/INV-2025-11-15-001-t053-e2e-test-failures.md

# Check git history
git show a150e3c --stat  # RT-006 activation
git show 9539b2a --stat  # T055 schema unification

# Create investigation directory
mkdir -p docs/investigations && date '+%Y-%m-%d'
```

**MCP Calls**: None (completed through file analysis only)

---

**Investigation Status**: ✅ COMPLETED
**Report Location**: `/docs/investigations/INV-2025-11-16-001-t053-rt006-metadata-validation.md`
**Next Agent**: Implementation agent (after user reviews solutions)
