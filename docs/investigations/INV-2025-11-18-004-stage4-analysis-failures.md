# Investigation: Stage 4 Analysis Failures in T053 E2E Test

---
investigation_id: INV-2025-11-18-004
status: COMPLETE
timestamp: 2025-11-18T18:00:00Z
investigator: Investigation Specialist Agent
test_file: tests/e2e/t053-synergy-sales-course.test.ts
related_docs:
  - INV-2025-11-18-003-t053-e2e-test-fixes.md
  - INV-2025-11-02-003-phase4-json-repair.md
---

## Executive Summary

**Problem**: Stage 4 (structure_analysis) job in T053 E2E test fails with TWO distinct errors across 3 retry attempts:
- **Attempt 1**: LLM validation error (`theory_practice_ratio must sum to 100, got 2`)
- **Attempts 2 & 3**: FSM state transition error (`stage_4_analyzing → stage_4_init` invalid)

**Root Causes**:
1. **LLM Output Issue**: Phase 1 generates `theory_practice_ratio: "1:1"` instead of valid percentages like `"50:50"`. The Zod schema regex accepts `"1:1"` (matches `^\d+:\d+$`) but validation logic expects the sum to equal 100.
2. **Retry Logic Flaw**: Handler ALWAYS tries to set status to `stage_4_init` on job execution, even during retries. After first failure, status is `stage_4_analyzing`, so attempting `stage_4_analyzing → stage_4_init` violates FSM rules (only `→ stage_4_complete|failed|cancelled` allowed).

**Impact**: BLOCKING - Test cannot progress past Stage 4, preventing full E2E pipeline validation.

**Priority**: P0 - Critical path blocker

**Recommended Solution**:
- **Immediate (Primary)**: Add retry-aware state management - check current status and skip state updates if already in valid Stage 4 state
- **Long-term (Secondary)**: Enhance LLM prompt with explicit examples and schema description improvements

---

## Problem Statement

### Observed Behavior

Stage 4 analysis job fails completely after exhausting all 3 retry attempts with TWO different error patterns:

**Attempt 1 (First execution)**:
```
Duration: 59.8 seconds
Error: Validation error: theory_practice_ratio must sum to 100, got 2 (theory=1, practice=1)
Location: phase-5-assembly.ts:409
```

**Attempts 2 & 3 (BullMQ retries)**:
```
Duration: 2.7s, 0.3s
Error: Failed to update status to stage_4_init: Invalid generation status transition: stage_4_analyzing → stage_4_init
Location: stage4-analysis.ts:275
```

### Expected Behavior

1. **LLM Output**: Phase 1 should generate valid `theory_practice_ratio` like `"30:70"`, `"50:50"`, or `"70:30"` that sums to 100
2. **Retry Handling**: BullMQ retries should resume from current FSM state without attempting invalid state transitions
3. **Job Success**: All 3 attempts should process successfully OR fail gracefully with proper error recovery

### Environment

- **Test**: T053 Scenario 2 (Full Pipeline)
- **Stage**: Stage 4 (structure_analysis)
- **Course ID**: `b1ede0b2-b785-4f5d-916b-8477a74d1432`
- **Job ID**: `097f3f7d-8ff4-4c34-8126-fa768bd22a87`
- **Test Language**: Russian (`ru`)
- **Topic**: "Продажи образовательных продуктов" (Sales of educational products)
- **Model**: 20B (Phase 1 classification)

---

## Investigation Process

### Tier 0: Project Internal Search (MANDATORY FIRST STEP)

**Searched**:
- ✅ Investigation docs: Found INV-2025-11-18-003 (T053 fixes), INV-2025-11-02-003 (Phase 4 JSON repair)
- ✅ Git history: `git log --all --grep="theory_practice_ratio|pedagogical_pattern"` - Found commits A01-A24 (Analyze Enhancement)
- ✅ Test fixtures: Found valid examples in `packages/shared-types/tests/analysis-schemas.test.ts`
- ✅ Code patterns: Searched FSM validation logic, retry handling patterns

**Key Findings from Project**:
- Theory_practice_ratio introduced in commit `cecf1fe` (feat: Phase B Core Schema enhancements A01-A13)
- Valid test examples always use percentages: `"30:70"`, `"50:50"`, never literal ratios like `"1:1"`
- FSM state transitions defined in migration `20251117103031_redesign_generation_status.sql`
- No existing retry-aware state management in stage4-analysis.ts handler

### Tier 1: Context7 MCP Documentation (MANDATORY SECOND STEP)

**Query**: Zod validation for regex patterns and string validation
**Library ID**: `/colinhacks/zod`
**Topic**: "regex validation string patterns"

**Key Insights from Context7**:
- Zod regex validation: `z.string().regex(/^\d+:\d+$/)` accepts ANY digit pattern
- The regex `^\d+:\d+$` matches `"1:1"`, `"50:50"`, `"999:1"` equally
- Validation happens in TWO stages: (1) Zod schema parse (regex), (2) Custom validation logic (sum check)
- Recommended pattern: Add min/max constraints or use refined validation

**Direct Quote from Context7**:
```typescript
// Perform Common String Validations in Zod
z.string().max(5);
z.string().min(5);
z.string().length(5);
z.string().regex(/^[a-z]+$/);
```

**What Context7 Provided**:
- ✅ Regex validation patterns
- ✅ String validation methods
- ✅ Custom validation with `.refine()`
- ❌ No specific guidance on percentage ratio validation
- ❌ No LLM prompt engineering for schema compliance

**Missing Topics**: LLM prompt design for Zod schemas, ratio validation patterns

### Commands Executed

```bash
# Evidence Collection
grep -n "theory_practice_ratio\|stage_4_analyzing" /tmp/t053-test-complete-fix.log
git log --all --oneline --grep="theory_practice_ratio\|pedagogical_pattern" -i

# Code Analysis
grep -rn "stage_4_analyzing.*stage_4_init" packages/course-gen-platform/src/orchestrator/handlers/
grep -A 5 "theory_practice_ratio" packages/shared-types/tests/analysis-schemas.test.ts
```

### Files Examined

1. `/tmp/t053-test-complete-fix.log` (lines 559-696) - Test execution log with errors
2. `packages/course-gen-platform/src/orchestrator/handlers/stage4-analysis.ts` (lines 150-300) - Handler execute() method
3. `packages/course-gen-platform/src/orchestrator/services/analysis/phase-5-assembly.ts` (lines 392-428) - Validation logic
4. `packages/course-gen-platform/supabase/migrations/20251117103031_redesign_generation_status.sql` (lines 140-195) - FSM rules
5. `packages/shared-types/src/analysis-schemas.ts` (lines 147-152) - Schema definition
6. `packages/course-gen-platform/src/orchestrator/services/analysis/phase-1-classifier.ts` (lines 59-141) - Phase 1 prompt
7. `packages/course-gen-platform/src/utils/zod-to-prompt-schema.ts` - Schema-to-prompt converter

### Hypotheses Tested

**Hypothesis 1**: LLM returns literal ratio "1:1" instead of percentages
- ✅ **CONFIRMED**: Log line 611 shows `theory_practice_ratio:"1:1"`
- Evidence: `"primary_strategy":"lecture-based","theory_practice_ratio":"1:1","assessment_types":["quizzes"]`

**Hypothesis 2**: Zod schema accepts "1:1" but validation fails on sum check
- ✅ **CONFIRMED**: Regex `^\d+:\d+$` matches "1:1", then `parseInt("1") + parseInt("1") = 2 !== 100`
- Evidence: Error at `phase-5-assembly.ts:409` after Zod parse succeeds

**Hypothesis 3**: Retry logic doesn't account for existing FSM state
- ✅ **CONFIRMED**: Lines 263-276 in stage4-analysis.ts ALWAYS try `stage_4_init` update
- Evidence: Attempts 2 & 3 fail with "stage_4_analyzing → stage_4_init" error

**Hypothesis 4**: No retry-aware state management exists
- ✅ **CONFIRMED**: No `job.attemptsMade` checks before state updates
- Evidence: Grep for `attemptsMade.*stage.*init` returns no results

---

## Root Cause Analysis

### Root Cause #1: LLM Returns Literal Ratio Instead of Percentages

**Primary Cause**: Phase 1 LLM generates `theory_practice_ratio: "1:1"` (literal ratio) instead of `"50:50"` (percentage representation).

**Mechanism of Failure**:
1. Phase 1 Classification runs with 20B model
2. System prompt includes `zodToPromptSchema(Phase1OutputSchema)` for schema description
3. `zodToPromptSchema` converts `z.string().regex(/^\d+:\d+$/)` to → `string` (NO regex pattern shown to LLM)
4. LLM interprets "theory_practice_ratio" literally as a mathematical ratio (1:1, 2:1, etc.)
5. Zod validation PASSES (regex accepts "1:1")
6. Phase 5 assembly validation FAILS (1 + 1 = 2 ≠ 100)

**Evidence**:
```javascript
// Log output (line 611 in test log)
{
  "primary_strategy": "lecture-based",
  "theory_practice_ratio": "1:1",  // ← LLM returns literal ratio
  "assessment_types": ["quizzes"],
  "key_patterns_count": 3
}

// Error (line 674 in test log)
Error: Validation error: theory_practice_ratio must sum to 100, got 2 (theory=1, practice=1)
  at validatePedagogicalPatterns (/packages/course-gen-platform/src/orchestrator/services/analysis/phase-5-assembly.ts:409:11)
```

**Schema Definition** (`packages/shared-types/src/analysis-schemas.ts:149`):
```typescript
theory_practice_ratio: z.string().regex(/^\d+:\d+$/, 'Must be format "XX:YY" (e.g., "30:70")')
```

**Prompt Generation** (`packages/course-gen-platform/src/utils/zod-to-prompt-schema.ts:104-124`):
```typescript
// Handle ZodString - MISSING REGEX EXTRACTION
if (currentSchema instanceof z.ZodString) {
  const checks = (currentSchema as any)._def.checks || [];
  const constraints: string[] = [];

  for (const check of checks) {
    if (check.kind === 'min') {
      constraints.push(`min ${check.value}`);
    } else if (check.kind === 'max') {
      constraints.push(`max ${check.value}`);
    } else if (check.kind === 'email') {
      constraints.push('email format');
    }
    // ❌ NO CASE FOR check.kind === 'regex'
  }

  const constraintStr = constraints.length > 0 ? ` (${constraints.join(', ')})` : '';
  return `string${constraintStr}${optionalSuffix}${nullableSuffix}`;
  // Returns: "string" with NO indication of XX:YY format requirement
}
```

**Why LLM Generates "1:1"**:
- Prompt shows: `"theory_practice_ratio": string` (no format hint)
- Field name suggests "theory vs practice ratio"
- LLM interprets as mathematical ratio (1-to-1, 50-50 split)
- LLM chooses simplest representation: "1:1" (technically valid ratio)

**Contributing Factors**:
- No explicit examples in Phase 1 system prompt
- `zodToPromptSchema` doesn't extract regex patterns
- Field name is ambiguous ("ratio" suggests mathematical notation, not percentages)

### Root Cause #2: Retry Logic Attempts Invalid FSM State Transition

**Primary Cause**: `Stage4AnalysisHandler.execute()` unconditionally sets status to `stage_4_init` at the start of EVERY execution, including retries.

**Mechanism of Failure**:
1. **Attempt 1** (fresh execution):
   - Current status: `stage_3_complete` (or another valid pre-Stage 4 state)
   - Handler sets: `stage_3_complete → stage_4_init` ✅ (valid)
   - Handler sets: `stage_4_init → stage_4_analyzing` ✅ (valid)
   - Orchestration runs and **fails** (theory_practice_ratio validation)
   - BullMQ marks job for retry

2. **Attempt 2** (BullMQ retry):
   - Current status: `stage_4_analyzing` (left from Attempt 1)
   - Handler tries: `stage_4_analyzing → stage_4_init` ❌ (FSM rule violation)
   - Database trigger raises exception immediately
   - Job fails in 2.7 seconds (no orchestration runs)

3. **Attempt 3** (BullMQ retry):
   - Current status: `stage_4_analyzing` (unchanged)
   - Handler tries: `stage_4_analyzing → stage_4_init` ❌ (FSM rule violation)
   - Job fails in 0.3 seconds

**Evidence**:

**Code** (`packages/course-gen-platform/src/orchestrator/handlers/stage4-analysis.ts:263-276`):
```typescript
// =================================================================
// STEP 0: Update Status to Stage 4 Init
// =================================================================
jobLogger.info('Setting course status to stage_4_init');

const { error: statusInitError} = await supabaseAdmin
  .from('courses')
  .update({
    generation_status: 'stage_4_init' as const,  // ← ALWAYS tries this
    updated_at: new Date().toISOString(),
  })
  .eq('id', course_id)
  .eq('organization_id', organization_id);

if (statusInitError) {
  throw new Error(`Failed to update status to stage_4_init: ${statusInitError.message}`);
  // ← Throws on retry attempts
}
```

**FSM Rules** (`packages/course-gen-platform/supabase/migrations/20251117103031_redesign_generation_status.sql:172`):
```sql
-- Define valid stage-based transitions
v_valid_transitions := '{
  "stage_4_analyzing": ["stage_4_complete", "failed", "cancelled"],  -- ❌ NOT stage_4_init
  ...
}'::JSONB;

-- Check if transition is valid
IF NOT (v_valid_transitions->OLD.generation_status::text) ? NEW.generation_status::text THEN
  RAISE EXCEPTION 'Invalid generation status transition: % → % (course_id: %)',
    OLD.generation_status,
    NEW.generation_status,
    NEW.id
  USING HINT = 'Valid transitions from ' || OLD.generation_status || ': ' ||
                (v_valid_transitions->OLD.generation_status::text)::text;
END IF;
```

**Log Evidence** (`/tmp/t053-test-complete-fix.log`):
```
Line 588: "msg":"Setting course status to stage_4_analyzing"  // Attempt 1 successful transition
Line 683: "msg":"Setting course status to stage_4_init"       // Attempt 2 tries invalid transition
Line 684: "error":"Failed to update status to stage_4_init: Invalid generation status transition: stage_4_analyzing → stage_4_init"
Line 691: "msg":"Setting course status to stage_4_init"       // Attempt 3 tries same invalid transition
Line 692: "error":"Failed to update status to stage_4_init: Invalid generation status transition: stage_4_analyzing → stage_4_init"
```

**Why This Happens**:
- Handler has NO awareness of `job.attemptsMade` (BullMQ retry counter)
- Handler assumes it's always running from a clean slate
- No check for current FSM state before attempting updates
- FSM trigger correctly prevents backward transitions (good!) but handler doesn't adapt

**Contributing Factors**:
- No pattern/convention for retry-aware handlers in codebase
- Layer 3 fallback validation (lines 192-233) only checks if Stage 4 is initialized, doesn't prevent redundant re-initialization
- No documentation on handling retries with FSM state machine

---

## Execution Flow Diagrams

### Attempt 1: LLM Validation Failure

```
┌─────────────────────────────────────────────────────────────┐
│ Stage4AnalysisHandler.execute() - Attempt 1                 │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Worker Validation                                  │
│ - Current status: stage_3_complete                          │
│ - Check: validStage4States.includes(status)? → FALSE        │
│ - Action: Initialize Stage 4 via FSM command → SUCCESS      │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 0: Update status to stage_4_init                       │
│ - Transition: stage_3_complete → stage_4_init ✅             │
│ - Duration: ~4 seconds                                      │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 0.5: Update status to stage_4_analyzing                │
│ - Transition: stage_4_init → stage_4_analyzing ✅            │
│ - Duration: ~4 seconds                                      │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: runAnalysisOrchestration()                          │
│   ├─ Phase 1: Classification (20B model)                    │
│   │    └─ Generates: theory_practice_ratio: "1:1"           │
│   ├─ Phase 2: Scope Analysis                                │
│   ├─ Phase 3: Expert Analysis                               │
│   ├─ Phase 4: Document Synthesis                            │
│   ├─ Phase 6: RAG Planning                                  │
│   └─ Phase 5: Assembly & Validation                         │
│        └─ validatePedagogicalPatterns()                     │
│             └─ Check: 1 + 1 === 100? → FALSE ❌             │
│ - Duration: ~59.8 seconds                                   │
│ - Error: theory_practice_ratio must sum to 100, got 2       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Error Handling                                               │
│ - Throw error to BullMQ                                     │
│ - Job marked as FAILED (attempt 1 of 3)                     │
│ - Status remains: stage_4_analyzing                         │
│ - BullMQ schedules retry                                    │
└─────────────────────────────────────────────────────────────┘
```

### Attempts 2 & 3: FSM State Transition Failures

```
┌─────────────────────────────────────────────────────────────┐
│ Stage4AnalysisHandler.execute() - Attempt 2 (Retry)         │
│ - job.attemptsMade: 1                                       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Worker Validation                                  │
│ - Current status: stage_4_analyzing                         │
│ - Check: validStage4States.includes(status)? → TRUE ✅       │
│ - Action: SKIP initialization (already in valid state)      │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 0: Update status to stage_4_init                       │
│ - Attempt: stage_4_analyzing → stage_4_init                 │
│ - FSM Trigger Validation:                                   │
│   ├─ OLD: stage_4_analyzing                                 │
│   ├─ NEW: stage_4_init                                      │
│   ├─ Valid transitions: [stage_4_complete, failed, ...]    │
│   └─ Result: EXCEPTION ❌                                   │
│ - Duration: ~2.7 seconds                                    │
│ - Error: Invalid generation status transition               │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Error Handling                                               │
│ - Catch error at line 275 (statusInitError check)           │
│ - Throw: "Failed to update status to stage_4_init: ..."    │
│ - Job marked as FAILED (attempt 2 of 3)                     │
│ - Status remains: stage_4_analyzing                         │
│ - BullMQ schedules retry                                    │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Stage4AnalysisHandler.execute() - Attempt 3 (Retry)         │
│ - job.attemptsMade: 2                                       │
│ - SAME FLOW AS ATTEMPT 2                                    │
│ - Duration: ~0.3 seconds (cached failure)                   │
│ - Result: FAILED (3 of 3) → PERMANENT FAILURE              │
└─────────────────────────────────────────────────────────────┘
```

---

## Proposed Solutions

### Solution 1: Retry-Aware State Management (PRIMARY - IMMEDIATE FIX)

**Description**: Modify `Stage4AnalysisHandler.execute()` to check current FSM state and skip redundant status updates during retries.

**Implementation**:

```typescript
// packages/course-gen-platform/src/orchestrator/handlers/stage4-analysis.ts

async execute(
  jobData: StructureAnalysisJob,
  job: Job<StructureAnalysisJob>
): Promise<StructureAnalysisJobResult> {
  const startTime = Date.now();
  const { course_id, organization_id, user_id } = jobData;

  // ... (Layer 3 validation remains unchanged - lines 179-233)

  const jobLogger = logger.child({
    jobId: job.id,
    jobType: 'STRUCTURE_ANALYSIS',
    courseId: course_id,
    organizationId: organization_id,
    userId: user_id,
    attemptsMade: job.attemptsMade,
  });

  jobLogger.info(
    {
      topic: jobData.input.topic,
      language: jobData.input.language,
      documentCount: jobData.input.document_summaries?.length || 0,
      priority: jobData.priority,
      attemptCount: jobData.attempt_count,
      isRetry: job.attemptsMade > 0,  // NEW: Log retry status
    },
    'Starting Stage 4 analysis job'
  );

  const supabaseAdmin = getSupabaseAdmin();

  try {
    // =================================================================
    // NEW: STEP 0-PRE: Check Current Status (Retry-Aware)
    // =================================================================
    const { data: currentCourse } = await supabaseAdmin
      .from('courses')
      .select('generation_status')
      .eq('id', course_id)
      .single();

    if (!currentCourse) {
      throw new Error('Course not found during status check');
    }

    const currentStatus = currentCourse.generation_status;
    const validStage4ProgressStates = ['stage_4_init', 'stage_4_analyzing'];

    // Only perform status initialization if NOT already in Stage 4 progression
    if (!validStage4ProgressStates.includes(currentStatus as string)) {
      jobLogger.info(
        { currentStatus, attemptsMade: job.attemptsMade },
        'Status not in Stage 4 progression - performing initialization'
      );

      // =================================================================
      // STEP 0: Update Status to Stage 4 Init
      // =================================================================
      jobLogger.info('Setting course status to stage_4_init');

      const { error: statusInitError } = await supabaseAdmin
        .from('courses')
        .update({
          generation_status: 'stage_4_init' as const,
          updated_at: new Date().toISOString(),
        })
        .eq('id', course_id)
        .eq('organization_id', organization_id);

      if (statusInitError) {
        throw new Error(`Failed to update status to stage_4_init: ${statusInitError.message}`);
      }

      // =================================================================
      // STEP 0.5: Update Status to Stage 4 Analyzing
      // =================================================================
      jobLogger.info('Setting course status to stage_4_analyzing');

      const { error: statusAnalyzeError } = await supabaseAdmin
        .from('courses')
        .update({
          generation_status: 'stage_4_analyzing' as const,
          updated_at: new Date().toISOString(),
        })
        .eq('id', course_id)
        .eq('organization_id', organization_id);

      if (statusAnalyzeError) {
        throw new Error(`Failed to update status to stage_4_analyzing: ${statusAnalyzeError.message}`);
      }
    } else {
      jobLogger.info(
        { currentStatus, attemptsMade: job.attemptsMade },
        'Already in Stage 4 progression state - skipping initialization (retry logic)'
      );

      // Ensure we're in analyzing state (idempotent - only transitions if needed)
      if (currentStatus === 'stage_4_init') {
        jobLogger.info('Transitioning from stage_4_init to stage_4_analyzing');

        const { error: statusAnalyzeError } = await supabaseAdmin
          .from('courses')
          .update({
            generation_status: 'stage_4_analyzing' as const,
            updated_at: new Date().toISOString(),
          })
          .eq('id', course_id)
          .eq('organization_id', organization_id);

        if (statusAnalyzeError) {
          throw new Error(`Failed to update status to stage_4_analyzing: ${statusAnalyzeError.message}`);
        }
      }
      // If already stage_4_analyzing, no status change needed - FSM trigger will prevent no-op updates
    }

    // =================================================================
    // STEP 1: Execute Multi-Phase Analysis Orchestration
    // =================================================================
    const analysisResult: AnalysisResult = await runAnalysisOrchestration(jobData);

    // ... (rest of success path remains unchanged - lines 300-380)
  } catch (error) {
    // ... (error handling remains unchanged)
  }
}
```

**Pros**:
- ✅ Fixes retry issue IMMEDIATELY
- ✅ Idempotent - safe to call multiple times
- ✅ Minimal code changes (surgical fix)
- ✅ No risk of breaking other handlers
- ✅ Maintains FSM integrity
- ✅ Backward compatible

**Cons**:
- ⚠️ Adds extra database query per execution (negligible performance impact)
- ⚠️ Doesn't fix LLM output issue (needs separate solution)

**Complexity**: LOW (single function modification)

**Risk**: LOW (defensive coding, no breaking changes)

**Estimated Effort**: 30 minutes

---

### Solution 2: Enhanced LLM Prompt with Examples (SECONDARY - LONG-TERM FIX)

**Description**: Improve Phase 1 system prompt and schema description to guide LLM toward generating valid percentage-based ratios.

**Implementation**:

**Part A: Enhance `zodToPromptSchema` to extract regex patterns**

```typescript
// packages/course-gen-platform/src/utils/zod-to-prompt-schema.ts

// Handle ZodString
if (currentSchema instanceof z.ZodString) {
  const checks = (currentSchema as any)._def.checks || [];
  const constraints: string[] = [];

  for (const check of checks) {
    if (check.kind === 'min') {
      constraints.push(`min ${check.value}`);
    } else if (check.kind === 'max') {
      constraints.push(`max ${check.value}`);
    } else if (check.kind === 'email') {
      constraints.push('email format');
    } else if (check.kind === 'url') {
      constraints.push('URL format');
    } else if (check.kind === 'uuid') {
      constraints.push('UUID format');
    } else if (check.kind === 'regex') {  // NEW: Extract regex pattern
      const pattern = check.regex.source;
      // Extract message if available
      const message = (check as any).message;
      if (message) {
        constraints.push(`pattern: ${message}`);
      } else {
        constraints.push(`pattern: ${pattern}`);
      }
    }
  }

  const constraintStr = constraints.length > 0 ? ` (${constraints.join(', ')})` : '';
  return `string${constraintStr}${optionalSuffix}${nullableSuffix}`;
}
```

**Part B: Add explicit examples to Phase 1 system prompt**

```typescript
// packages/course-gen-platform/src/orchestrator/services/analysis/phase-1-classifier.ts

const systemMessage = new SystemMessage(`You are an expert curriculum architect with 15+ years of experience in adult education (andragogy).

Your task is to analyze course topics and classify them into one of 6 categories, generate contextual motivational language, and perform topic analysis.

CRITICAL RULES:
1. ALL output MUST be in ENGLISH ONLY (regardless of input language)
2. You MUST respond with valid JSON matching this EXACT schema:

${schemaDescription}

3. Use category-specific templates for contextual language
4. Ensure all character length constraints are met
5. Extract 3-10 key concepts and 5-15 domain keywords

// NEW: EXPLICIT FIELD FORMAT REQUIREMENTS
FIELD FORMAT REQUIREMENTS:
- theory_practice_ratio: MUST be percentages summing to 100 (e.g., "30:70", "50:50", "70:30")
  ❌ WRONG: "1:1", "2:3", "balanced"
  ✅ CORRECT: "50:50", "30:70", "20:80"
- assessment_types: Array of assessment methods (coding, quizzes, projects, essays, presentations, peer-review)
- key_patterns: 2-5 pedagogical patterns as short phrases (e.g., "build incrementally", "learn by doing")

CATEGORIES (with examples):
- professional: Business skills, technical training, certifications (e.g., "Project Management", "Python Programming")
...
`);
```

**Part C: Add Zod `.refine()` validation for better error messages**

```typescript
// packages/shared-types/src/analysis-schemas.ts

export const PedagogicalPatternsSchema = z.object({
  primary_strategy: z.enum(['problem-based learning', 'lecture-based', 'inquiry-based', 'project-based', 'mixed']),
  theory_practice_ratio: z.string()
    .regex(/^\d+:\d+$/, 'Must be format "XX:YY" (e.g., "30:70")')
    .refine(
      (val) => {
        const [theory, practice] = val.split(':').map(Number);
        return theory + practice === 100;
      },
      {
        message: 'Theory and practice percentages must sum to 100 (e.g., "30:70", "50:50", "70:30")',
      }
    ),
  assessment_types: z.array(z.enum(['coding', 'quizzes', 'projects', 'essays', 'presentations', 'peer-review'])),
  key_patterns: z.array(z.string()), // e.g., ["build incrementally", "learn by refactoring"]
});
```

**Pros**:
- ✅ Fixes root cause of LLM output issue
- ✅ Improves prompt clarity for ALL Phase 1 fields
- ✅ Better error messages for future debugging
- ✅ Reusable pattern for other regex-validated fields
- ✅ Zod `.refine()` validation happens during parse (fails earlier with clearer message)

**Cons**:
- ⚠️ Doesn't guarantee LLM compliance (models may still hallucinate)
- ⚠️ Requires testing across multiple model variations (20B, 120B)
- ⚠️ More complex changes (3 files affected)
- ⚠️ Needs validation that `.refine()` errors trigger retry logic

**Complexity**: MEDIUM (3 files, testing required)

**Risk**: MEDIUM (prompt changes may affect LLM behavior unpredictably)

**Estimated Effort**: 2-3 hours (implementation + testing)

---

### Solution 3: Defensive Validation with Auto-Repair (ALTERNATIVE)

**Description**: Add repair logic in Phase 5 assembly to normalize common LLM mistakes like "1:1" → "50:50".

**Implementation**:

```typescript
// packages/course-gen-platform/src/orchestrator/services/analysis/phase-5-assembly.ts

function validatePedagogicalPatterns(patterns: NonNullable<AnalysisResult['pedagogical_patterns']>): void {
  if (!patterns.primary_strategy) {
    throw new Error('Validation error: pedagogical_patterns.primary_strategy is missing');
  }

  // Validate theory_practice_ratio format: "XX:YY" where XX + YY = 100
  let ratio = patterns.theory_practice_ratio;
  const match = ratio.match(/^(\d+):(\d+)$/);

  if (!match) {
    throw new Error(
      `Validation error: Invalid theory_practice_ratio format: "${ratio}". Expected format: "XX:YY" (e.g., "30:70")`
    );
  }

  let theory = parseInt(match[1], 10);
  let practice = parseInt(match[2], 10);

  // NEW: Auto-repair common LLM mistakes
  if (theory + practice !== 100) {
    // Check if this looks like a literal ratio (e.g., "1:1", "2:3", "3:7")
    if (theory <= 10 && practice <= 10) {
      // Normalize to percentages
      const total = theory + practice;
      theory = Math.round((theory / total) * 100);
      practice = 100 - theory;  // Ensure exact sum to 100

      logger.warn(
        {
          original: ratio,
          repaired: `${theory}:${practice}`,
          interpretation: `Interpreted literal ratio "${ratio}" as percentage split`,
        },
        'Auto-repaired theory_practice_ratio from literal ratio to percentages'
      );

      // Update the patterns object with repaired value
      patterns.theory_practice_ratio = `${theory}:${practice}`;
    } else {
      // Not a literal ratio - this is genuinely invalid
      throw new Error(
        `Validation error: theory_practice_ratio must sum to 100, got ${theory + practice} (theory=${theory}, practice=${practice})`
      );
    }
  }

  // ... (rest of validation remains unchanged)
}
```

**Pros**:
- ✅ Fixes immediate issue without relying on LLM behavior change
- ✅ Defensive - handles edge cases gracefully
- ✅ Logs repairs for monitoring/debugging
- ✅ Quick fix (single function modification)
- ✅ No prompt engineering uncertainty

**Cons**:
- ❌ Band-aid solution - doesn't fix root cause
- ❌ Masks LLM quality issues
- ❌ May normalize incorrect ratios unexpectedly (e.g., "2:8" → "20:80" might not match LLM intent)
- ❌ Doesn't improve future LLM outputs

**Complexity**: LOW (single function modification)

**Risk**: MEDIUM (repair logic may introduce semantic errors)

**Estimated Effort**: 30 minutes

**Not Recommended**: This is a quick fix but doesn't address the root cause. Prefer Solution 2.

---

## Implementation Guidance

### Priority & Execution Order

**Immediate (P0 - Required for test to pass)**:
1. ✅ **Solution 1**: Retry-aware state management (MUST implement)

**Short-term (P1 - Prevent future occurrences)**:
2. ✅ **Solution 2**: Enhanced LLM prompt with examples

**Optional (P2 - Additional safety net)**:
3. ⚠️ **Solution 3**: Defensive validation with auto-repair (if Solution 2 insufficient)

### Files to Modify

**Solution 1 (Retry-Aware State Management)**:
- `packages/course-gen-platform/src/orchestrator/handlers/stage4-analysis.ts`
  - Lines 259-294: Add pre-check for current status
  - Lines 263-276: Wrap status initialization in conditional
  - Test with: `npm run test:e2e tests/e2e/t053-synergy-sales-course.test.ts`

**Solution 2 (Enhanced LLM Prompt)**:
- `packages/course-gen-platform/src/utils/zod-to-prompt-schema.ts`
  - Lines 104-124: Add regex extraction in ZodString handler
- `packages/course-gen-platform/src/orchestrator/services/analysis/phase-1-classifier.ts`
  - Lines 66-88: Add FIELD FORMAT REQUIREMENTS section
- `packages/shared-types/src/analysis-schemas.ts`
  - Lines 147-152: Add `.refine()` validation to PedagogicalPatternsSchema
  - Test with: `npm run test packages/shared-types/tests/analysis-schemas.test.ts`

### Validation Criteria

**Solution 1**:
- ✅ T053 E2E test passes completely (all 5 stages)
- ✅ Retry attempts (2 & 3) don't throw FSM transition errors
- ✅ Log shows "Already in Stage 4 progression state - skipping initialization" on retries
- ✅ Type-check passes: `npm run type-check`

**Solution 2**:
- ✅ Phase 1 generates valid theory_practice_ratio (e.g., "30:70", "50:50", NOT "1:1")
- ✅ Unit tests pass: `packages/shared-types/tests/analysis-schemas.test.ts`
- ✅ Integration test passes: `packages/course-gen-platform/tests/integration/analysis-pipeline-enhanced.test.ts`
- ✅ Zod schema description in prompt includes regex pattern hint
- ✅ Log shows "FIELD FORMAT REQUIREMENTS" section in Phase 1 system message

### Testing Requirements

**Regression Testing**:
1. Run full T053 E2E test suite: `npm run test:e2e tests/e2e/t053-synergy-sales-course.test.ts`
2. Verify Stages 2-5 all complete successfully
3. Check that no new FSM errors appear in logs
4. Validate analysis_result JSONB contains valid pedagogical_patterns

**Unit Testing**:
1. Test `validatePedagogicalPatterns()` with edge cases:
   - Valid: "30:70", "50:50", "70:30", "20:80"
   - Invalid: "1:1", "2:3", "balanced", "50:49", "100:1"
2. Test FSM state transitions during retries:
   - Fresh execution: stage_3_complete → stage_4_init → stage_4_analyzing
   - Retry from stage_4_analyzing: No state change, proceed directly to orchestration
   - Retry from stage_4_init: stage_4_init → stage_4_analyzing

**Integration Testing**:
1. Run analysis pipeline with various input languages (en, ru, es)
2. Verify theory_practice_ratio format across different topics
3. Test retry behavior with forced failures (mock LLM error)

---

## Risks and Considerations

### Implementation Risks

**Solution 1 (Retry-Aware State Management)**:
- **Risk**: Extra database query per execution (performance impact)
  - **Mitigation**: Query is simple (`SELECT generation_status`), indexed lookup, negligible overhead (~10ms)
- **Risk**: Race condition if multiple workers process same course
  - **Mitigation**: BullMQ job concurrency limits prevent parallel execution of same job. FSM trigger prevents invalid transitions even in race conditions.

**Solution 2 (Enhanced LLM Prompt)**:
- **Risk**: Prompt changes may alter LLM behavior unpredictably
  - **Mitigation**: Test across multiple models (20B, 120B) and languages (en, ru, es). Monitor Phase 1 output quality after deployment.
- **Risk**: Regex pattern in prompt may confuse LLM
  - **Mitigation**: Use human-readable message from Zod schema (e.g., "Must be format XX:YY") instead of raw regex
- **Risk**: `.refine()` validation may not trigger retry logic
  - **Mitigation**: Test that ZodError from `.refine()` is caught and triggers model escalation (20B → 120B)

### Performance Impact

- **Solution 1**: Adds ~10ms per job execution (1 extra SELECT query)
- **Solution 2**: No runtime performance impact (prompt size increase: ~50 tokens)
- **Overall**: Negligible - Stage 4 jobs typically take 60-90 seconds, extra 10ms is 0.01% overhead

### Breaking Changes

- **Solution 1**: None - backward compatible, idempotent
- **Solution 2**:
  - Zod schema change (`.refine()` added) is non-breaking - only adds stricter validation
  - Prompt changes may affect LLM output distribution (need monitoring)

### Side Effects

- **Solution 1**: May reveal other latent bugs in retry logic for other handlers
- **Solution 2**: Better error messages may increase retry counts if LLM quality is low (acceptable tradeoff)

---

## Documentation References

### Tier 0: Project Internal Documentation

**Investigation Documents**:
- `docs/investigations/INV-2025-11-18-003-t053-e2e-test-fixes.md` - Previous T053 fixes (Issues #1-6)
- `docs/investigations/INV-2025-11-02-003-phase4-json-repair.md` - JSON repair implementation

**Git Commits**:
- `cecf1fe` - feat(analyze): implement Phase B Core Schema enhancements (A01-A13)
- `d138f44` - feat(analyze): add validation for new schema fields (A16)
- `43ee059` - test(analyze): add comprehensive tests for Phase 1 schema enhancements (A21-A23)

**Test Fixtures** (`packages/shared-types/tests/analysis-schemas.test.ts:28-35`):
```typescript
function createValidPedagogicalPatterns() {
  return {
    primary_strategy: 'problem-based learning' as const,
    theory_practice_ratio: '30:70',  // ← Valid example
    assessment_types: ['coding', 'quizzes', 'projects'] as const,
    key_patterns: ['build incrementally', 'learn by refactoring'],
  };
}
```

### Tier 1: Context7 MCP Documentation

**Library**: Zod (`/colinhacks/zod`)

**Topic**: Regex validation and string patterns

**Key Insights**:
- Zod regex validation: `z.string().regex(/pattern/)` only validates format, NOT semantic constraints
- Custom validation via `.refine()`: Recommended for complex constraints like "sum must equal 100"
- String validation methods: `.min()`, `.max()`, `.length()`, `.regex()`, `.startsWith()`, etc.

**Direct Quotes**:
> "Perform Common String Validations in Zod: `z.string().regex(/^[a-z]+$/);`"

> "Convert Zod String Formats to JSON Schema `format`, `contentEncoding`, and `pattern`"

**What Context7 Provided**:
- ✅ Zod API reference for string validation
- ✅ Examples of regex usage
- ✅ Guidance on `.refine()` for custom validation
- ✅ Pattern extraction from Zod schemas

**What Was Missing**:
- ❌ LLM prompt engineering for Zod schemas
- ❌ Best practices for percentage/ratio validation
- ❌ Retry handling patterns with validation

### Tier 2/3: Not Required

Official documentation and specialized sites were not needed for this investigation. Project internal docs and Context7 provided sufficient information.

---

## MCP Server Usage

### Tools Used

**Context7 MCP**:
- `resolve-library-id({libraryName: "zod"})` → Selected `/colinhacks/zod` (Benchmark: 90.4, High reputation)
- `get-library-docs({context7CompatibleLibraryID: "/colinhacks/zod", topic: "regex validation string patterns"})` → Retrieved 10 relevant code snippets

**No Other MCP Servers Required**:
- Supabase MCP: Not used (investigation phase, no database queries needed)
- Sequential Thinking MCP: Not used (problem was straightforward, no complex multi-step reasoning required)

---

## Next Steps

### For Orchestrator/User

1. **Review investigation report** (this document)
2. **Decide on solution approach**:
   - Minimum: Implement Solution 1 (required for test to pass)
   - Recommended: Implement Solution 1 + Solution 2 (fixes both issues comprehensively)
   - Optional: Add Solution 3 as additional safety net
3. **Invoke implementation agent** with:
   - Report: `docs/investigations/INV-2025-11-18-004-stage4-analysis-failures.md`
   - Selected solutions: Solution 1 (P0), Solution 2 (P1)
   - Target: T053 E2E test passing completely

### Follow-up Recommendations

**Short-term**:
1. Implement Solution 1 to unblock T053 test
2. Run full E2E test suite to verify fix
3. Monitor Stage 4 retry behavior in production logs

**Medium-term**:
1. Implement Solution 2 to improve LLM output quality
2. Add unit tests for edge cases in theory_practice_ratio validation
3. Document retry-aware state management pattern for other handlers

**Long-term**:
1. Audit all BullMQ handlers for retry-aware state management
2. Create convention/template for FSM-aware job handlers
3. Add observability metrics for FSM state transition errors

---

## Investigation Log

**Timeline**:

| Time | Activity | Result |
|------|----------|--------|
| 00:00 | Read investigation task and existing documentation | Understood problem scope: 2 error patterns across 3 attempts |
| 00:05 | Tier 0: Project internal search (docs, git, tests) | Found previous investigations, FSM rules, valid test examples |
| 00:15 | Read test log and extract error evidence | Identified exact error messages, timestamps, job IDs |
| 00:25 | Read source files (stage4-analysis.ts, phase-5-assembly.ts, analysis-schemas.ts) | Understood code flow and validation logic |
| 00:35 | Read FSM migration file | Identified valid state transitions, confirmed rule violation |
| 00:45 | Tier 1: Context7 MCP query (Zod documentation) | Learned regex validation patterns, .refine() usage |
| 00:55 | Root cause analysis (RCA1: LLM output, RCA2: retry logic) | Identified mechanisms of failure for both errors |
| 01:05 | Formulated 3 solution approaches | Evaluated pros/cons, complexity, risks for each |
| 01:20 | Generated investigation report | Documented findings, solutions, implementation guidance |

**Commands Run**:
```bash
# Investigation setup
mkdir -p docs/investigations

# Evidence collection
grep -n "theory_practice_ratio\|stage_4_analyzing" /tmp/t053-test-complete-fix.log
git log --all --oneline --grep="theory_practice_ratio\|pedagogical_pattern" -i
ls -1 docs/investigations/INV-2025-11-18-*.md | wc -l

# Code analysis
grep -A 5 "theory_practice_ratio" packages/shared-types/tests/analysis-schemas.test.ts
find packages -name "*.test.ts" -exec grep -l "pedagogical_patterns" {} \;
grep -rn "stage_4_analyzing.*stage_4_init" packages/course-gen-platform/src/orchestrator/handlers/
```

**MCP Calls Made**:
- `mcp__context7__resolve-library-id({libraryName: "zod"})` → 1 call
- `mcp__context7__get-library-docs({context7CompatibleLibraryID: "/colinhacks/zod", topic: "regex validation string patterns"})` → 1 call

**Total Duration**: ~80 minutes (investigation + report writing)

---

## Status: ✅ Ready for Implementation

**Investigation ID**: INV-2025-11-18-004

**Completion**: 2025-11-18T18:00:00Z

**Returning Control**: Main session / Orchestrator

**Recommended Next Action**: Implement Solution 1 (P0) + Solution 2 (P1) via implementation agent
