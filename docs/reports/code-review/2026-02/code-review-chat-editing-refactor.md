# Code Review: Chat Editing Refactor

**Reviewer**: Claude Code (code-reviewer agent)
**Date**: 2026-02-14
**Scope**: Chat editing system refactoring (19 files, +734/-892 lines)
**Branch**: develop
**Status**: ✅ PASSED with recommendations

---

## Summary

This is a well-executed refactoring of the chat editing system that:

- **Improves code organization** by extracting helpers from a 1500+ line router into smaller, focused modules
- **Adds intent classification** with tier-0 regex and tier-1 LLM routing for better UX
- **Implements surgical operations** for structural editing with stable IDs
- **Improves error handling** with optimistic locking and proper conflict resolution
- **Adds comprehensive tests** for critical paths

**Key Metrics**:

- Type-check: ✅ PASSED
- Build: ✅ PASSED
- Test coverage: Good (optimistic locking, intent routing, structural operations)
- Net code reduction: -158 lines (improved modularity without bloat)

**Risk Level**: LOW - This is primarily a refactoring with feature flags for phased rollout.

---

## Issues Found

### CRITICAL (must fix before merge)

**None** - No critical issues found.

---

### HIGH (should fix before merge)

#### 1. Missing Error Handling in LLM Fallback Chain

**File**: `packages/course-gen-platform/src/server/routers/generation/editing/chat-mutation-helpers.ts`
**Lines**: 487-562

**Issue**: The triple-fallback LLM chain (primary → DB fallback → hardcoded fallback) has proper error handling, BUT the final catch block at line 539 doesn't re-throw after trying hardcoded fallback, which could mask transient errors.

**Current Code**:

```typescript
} catch (hardcodedFallbackError) {
  logger.error(
    {
      requestId,
      courseId,
      stageId,
      phaseName: modelConfig.phaseName,
      primaryModel: modelConfig.modelId,
      dbFallbackModel: modelConfig.fallbackModelId,
      hardcodedFallback: hardcodedFallback.fallback,
      error:
        hardcodedFallbackError instanceof Error
          ? hardcodedFallbackError.message
          : String(hardcodedFallbackError),
    },
    'All models failed in chat (primary, DB fallback, hardcoded fallback)'
  );
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Failed to generate response. Please try again.',
  });
}
```

**Analysis**: The code is actually CORRECT - it does throw after logging. This appears to be proper error handling.

**Recommendation**: No change needed, but consider adding a test case for this triple-fallback failure scenario.

---

#### 2. Potential Race Condition in ID Resolution

**File**: `packages/course-gen-platform/src/server/routers/generation/editing/surgical-operations.ts`
**Lines**: 77-91, 98-114

**Issue**: `findSectionById` and `findLessonById` use `tempIdMap` for ID resolution, but there's a subtle race condition if an operation references a tempId that was created in the SAME batch but hasn't been processed yet.

**Current Code**:

```typescript
function findSectionById(
  structure: CourseStructure,
  id: string,
  tempIdMap: Record<string, string>
): SectionLookup | null {
  const resolvedId = tempIdMap[id] ?? id; // ← Falls back to id if not in map

  for (let i = 0; i < structure.sections.length; i++) {
    if (structure.sections[i].id === resolvedId) {
      return { section: structure.sections[i], sectionIndex: i };
    }
  }

  return null; // ← Returns null if ID not found
}
```

**Scenario**:

```typescript
operations = [
  { type: 'add_section', tempId: '__new_sec__', afterSectionId: null },
  {
    type: 'add_lesson',
    parentSectionId: '__new_sec__',
    tempId: '__new_lsn__',
    afterLessonId: null,
  },
];
```

In operation #2, `findSectionById(structure, '__new_sec__', tempIdMap)` will:

1. Look up `tempIdMap['__new_sec__']` → get real ID (e.g., `sec_abc123`)
2. Search structure for `sec_abc123` → FOUND (because operation #1 already inserted it)

**Analysis**: This is actually SAFE - operations are applied sequentially, and `tempIdMap` is populated AFTER each operation completes. The code in `applyAddSection` (line 364) does `tempIdMap[op.tempId] = realId;` AFTER inserting the section into the structure.

**Recommendation**: Add a comment explaining the sequential execution guarantees.

---

#### 3. Silent Failure in Dual-Write to course_nodes

**File**: `packages/course-gen-platform/src/server/routers/generation/editing/chat-apply-helpers.ts`
**Lines**: 254-259, 490-495

**Issue**: Dual-write to `course_nodes` is marked as "non-fatal" and caught with a simple `.catch()`, but there's no monitoring or retry mechanism.

**Current Code**:

```typescript
// Phase 4: Dual-write to course_nodes (non-blocking, non-fatal)
if (stageId === 'stage_5') {
  const structureForNodes = dataToPersist as CourseStructure;
  await writeCourseNodes(courseId, structureForNodes, supabase, logger).catch(err =>
    logger.warn(
      { courseId, error: err instanceof Error ? err.message : String(err) },
      'course_nodes dual-write failed (non-fatal)'
    )
  );
}
```

**Impact**: If `writeCourseNodes` consistently fails (e.g., DB connection issues, schema mismatch), the JSONB will diverge from `course_nodes`, breaking the Phase 4 migration path.

**Recommendation**:

```typescript
// Phase 4: Dual-write to course_nodes (non-blocking, non-fatal)
if (stageId === 'stage_5') {
  const structureForNodes = dataToPersist as CourseStructure;
  await writeCourseNodes(courseId, structureForNodes, supabase, logger).catch(err => {
    logger.warn(
      { courseId, error: err instanceof Error ? err.message : String(err), requestId, stageId },
      'course_nodes dual-write failed (non-fatal) - JSONB will diverge'
    );
    // TODO: Add metric/alert for dual-write failures
    // Consider adding to retry queue if failure rate exceeds threshold
  });
}
```

**Severity**: HIGH because silent dual-write failures could accumulate and break the migration.

---

### MEDIUM (fix soon)

#### 4. Inconsistent Error Messages Between Direct Intent Helpers

**File**: `packages/course-gen-platform/src/server/routers/generation/editing/chat-direct-intent-helpers.ts`
**Lines**: 34-46, 209-218

**Issue**: Error messages are in Russian only, but the system supports English courses.

**Current Code**:

```typescript
function handleDeleteIntent(
  courseStructure: CourseStructure,
  targetPath: string
): DirectIntentResult {
  const element = getElementAtPath(courseStructure, targetPath);
  if (!element) {
    return { message: 'Элемент не найден.' }; // ← Hardcoded Russian
  }
  // ...
}
```

**Recommendation**: Extract i18n messages or use course language context:

```typescript
function handleDeleteIntent(
  courseStructure: CourseStructure,
  targetPath: string,
  courseLanguage?: string
): DirectIntentResult {
  const element = getElementAtPath(courseStructure, targetPath);
  if (!element) {
    return {
      message: courseLanguage === 'en' ? 'Element not found.' : 'Элемент не найден.',
    };
  }
  // ...
}
```

---

#### 5. Magic Numbers Without Constants

**File**: `packages/course-gen-platform/src/server/routers/generation/editing/chat-helpers.ts`
**Lines**: 12

**Issue**: Fuzzy match threshold is hardcoded:

**Current Code**:

```typescript
const FUZZY_MATCH_CONFIDENCE_THRESHOLD = 0.7;
```

**Recommendation**: This is actually GOOD - it's already a named constant. However, consider documenting WHY 0.7 was chosen:

```typescript
/**
 * Confidence threshold for fuzzy matching of section/lesson titles.
 *
 * Values below 0.7 produce too many false positives (e.g., "Introduction"
 * matches "Advanced Introduction", "Introduction to AI", etc.).
 *
 * Tuned based on testing with courses containing 8-12 sections.
 */
const FUZZY_MATCH_CONFIDENCE_THRESHOLD = 0.7;
```

---

#### 6. Potential Memory Leak in Deep Clone

**File**: `packages/course-gen-platform/src/server/routers/generation/editing/surgical-operations.ts`
**Lines**: 150-156

**Issue**: `deepClone` has a `try-catch` around `structuredClone`, but the JSON fallback might fail on circular references or non-serializable types.

**Current Code**:

```typescript
function deepClone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
```

**Recommendation**:

```typescript
function deepClone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch (structuredCloneError) {
    logger.warn(
      {
        error:
          structuredCloneError instanceof Error
            ? structuredCloneError.message
            : String(structuredCloneError),
      },
      'structuredClone failed, trying JSON fallback'
    );
    try {
      return JSON.parse(JSON.stringify(value)) as T;
    } catch (jsonError) {
      logger.error(
        {
          structuredCloneError:
            structuredCloneError instanceof Error
              ? structuredCloneError.message
              : String(structuredCloneError),
          jsonError: jsonError instanceof Error ? jsonError.message : String(jsonError),
        },
        'Both structuredClone and JSON fallback failed'
      );
      throw new Error('Cannot clone course structure: data contains non-serializable values');
    }
  }
}
```

---

#### 7. Missing Validation for Field Name Resolution

**File**: `packages/course-gen-platform/src/server/routers/generation/editing/surgical-operations.ts`
**Lines**: 373-398

**Issue**: `applyUpdateField` doesn't validate that the `newValue` type matches the field's expected type.

**Current Code**:

```typescript
function applyUpdateField(
  structure: CourseStructure,
  op: Extract<CourseOperation, { type: 'update_field' }>,
  tempIdMap: Record<string, string>
): string {
  const element = findElementById(structure, op.targetId, tempIdMap);
  if (!element) {
    throw new Error(`update_field: targetId "${op.targetId}" not found`);
  }

  const resolvedFieldName = resolveFieldName(op.field, element.type);
  if (!resolvedFieldName) {
    throw new Error(`update_field: field "${op.field}" is not valid for ${element.type}`);
  }

  // Get the actual element object and set the field
  if (element.type === 'section') {
    const section = structure.sections[element.sectionIndex];
    (section as unknown as Record<string, unknown>)[resolvedFieldName] = op.newValue; // ← No type checking
    return `update_field "${resolvedFieldName}" on section "${section.section_title}"`;
  }
  // ...
}
```

**Example Risk**:

```typescript
{
  type: 'update_field',
  targetId: 'sec_123',
  field: 'estimated_duration_minutes',  // Should be number
  newValue: 'thirty minutes'  // ← String instead of number!
}
```

**Recommendation**: Add runtime type validation:

```typescript
const FIELD_TYPE_VALIDATORS: Record<string, (value: unknown) => boolean> = {
  estimated_duration_minutes: v => typeof v === 'number' && v >= 0,
  lesson_objectives: v => Array.isArray(v) && v.every(item => typeof item === 'string'),
  // ... etc
};

function applyUpdateField(/* ... */) {
  // ...existing checks...

  const validator = FIELD_TYPE_VALIDATORS[resolvedFieldName];
  if (validator && !validator(op.newValue)) {
    throw new Error(
      `update_field: newValue for "${resolvedFieldName}" has invalid type (expected ${typeof op.newValue}, got ${JSON.stringify(op.newValue).slice(0, 50)})`
    );
  }

  // ...apply field update...
}
```

---

### LOW (nice to have)

#### 8. Code Duplication in Optimistic Lock Queries

**File**: `packages/course-gen-platform/src/server/routers/generation/editing/chat-apply-helpers.ts`
**Lines**: 231-236, 469-473

**Issue**: Optimistic lock query pattern is duplicated:

**Current Code** (appears twice):

```typescript
const { data: updatedRows, error: updateError } =
  course.updated_at === null
    ? await updateBaseQuery.is('updated_at', null).select('id')
    : await updateBaseQuery.eq('updated_at', course.updated_at).select('id');
```

**Recommendation**: Extract to helper:

```typescript
async function executeOptimisticUpdate<T>(
  baseQuery: ReturnType<SupabaseClient['from']>['update'],
  expectedUpdatedAt: string | null
): Promise<{ data: T[] | null; error: unknown }> {
  return expectedUpdatedAt === null
    ? await baseQuery.is('updated_at', null).select('id')
    : await baseQuery.eq('updated_at', expectedUpdatedAt).select('id');
}
```

---

#### 9. Inconsistent Naming: `convId` vs `conversationId`

**File**: Multiple files in `chat-*.ts`

**Issue**: Variable naming inconsistency:

- `chat.router.ts:279` uses `convId`
- `chat-mutation-helpers.ts:133` uses `convId` in parameter
- `chat-intent-flow.ts:64` uses `convId` in interface

**Recommendation**: Pick one convention (prefer `conversationId` for clarity) and use it consistently.

---

#### 10. Missing JSDoc for Public API Functions

**File**: `packages/course-gen-platform/src/server/routers/generation/editing/surgical-operations.ts`
**Lines**: 242-247

**Issue**: `validateOperations` is exported but has no JSDoc.

**Current Code**:

```typescript
export function validateOperations(
  operations: CourseOperation[],
  structure: CourseStructure
): PreflightError[] {
  return validateOperationsImpl(operations, structure);
}
```

**Recommendation**:

````typescript
/**
 * Validate a batch of course operations before applying them.
 *
 * Performs pre-flight validation including:
 * - Batch size limits (max operations, max deletes)
 * - ID existence checks
 * - Constraint validation (e.g., can't move section after lesson)
 * - Delete ratio limits (prevents accidental mass deletion)
 *
 * @param operations - Array of operations to validate
 * @param structure - Current course structure (not mutated)
 * @returns Array of validation errors (empty if all valid)
 *
 * @example
 * ```typescript
 * const errors = validateOperations(ops, structure);
 * if (errors.length > 0) {
 *   throw new Error(`Validation failed: ${errors.map(e => e.message).join('; ')}`);
 * }
 * ```
 */
export function validateOperations(
  operations: CourseOperation[],
  structure: CourseStructure
): PreflightError[] {
  return validateOperationsImpl(operations, structure);
}
````

---

#### 11. Hardcoded Lesson Defaults in Surgical Operations

**File**: `packages/course-gen-platform/src/server/routers/generation/editing/surgical-operations.ts`
**Lines**: 293-301

**Issue**: Default lesson content is hardcoded in Russian:

**Current Code**:

```typescript
const newLesson: Lesson = {
  id: realId,
  lesson_title: op.title,
  lesson_objectives:
    op.objectives && op.objectives.length > 0 ? op.objectives : [`Изучить основы: ${op.title}`],
  key_topics:
    op.keyTopics && op.keyTopics.length >= 2 ? op.keyTopics : [op.title, `Основы ${op.title}`],
  estimated_duration_minutes: op.estimatedDuration ?? defaultLessonDuration,
};
```

**Recommendation**: Pass course language and use conditional defaults:

```typescript
const newLesson: Lesson = {
  id: realId,
  lesson_title: op.title,
  lesson_objectives:
    op.objectives && op.objectives.length > 0
      ? op.objectives
      : [courseLanguage === 'en' ? `Learn basics: ${op.title}` : `Изучить основы: ${op.title}`],
  key_topics:
    op.keyTopics && op.keyTopics.length >= 2
      ? op.keyTopics
      : [op.title, courseLanguage === 'en' ? `Basics of ${op.title}` : `Основы ${op.title}`],
  estimated_duration_minutes: op.estimatedDuration ?? defaultLessonDuration,
};
```

---

## Improvements (recommendations, not bugs)

### 1. Add Metrics for Intent Classification

**Rationale**: Intent classification is a new feature with confidence thresholds. Tracking classification accuracy would help tune thresholds.

**Recommendation**: Add structured logging:

```typescript
logger.info(
  {
    requestId,
    intent: classifiedIntent.intent,
    confidence: classifiedIntent.confidence,
    tier: heuristicResult ? 0 : 1,
    threshold: INTENT_CONFIDENCE_THRESHOLDS[classifiedIntent.intent],
    route: 'direct_execution' | 'llm_required' | 'clarification',
    userMessageLength: userMessage.length,
  },
  'Intent classification completed'
);
```

### 2. Add Integration Test for Full Surgical Operations Flow

**Current Coverage**: Unit tests for optimistic locking exist, but no end-to-end test for:

```
User message → Intent classification → LLM generates operations → Validation → Apply → Dual-write
```

**Recommendation**: Add test in `tests/integration/chat-surgical-flow.test.ts`:

```typescript
it('should apply ADD_LESSON intent end-to-end', async () => {
  // 1. Setup: Create course with structure
  // 2. Send chat message: "Добавь урок про машинное обучение"
  // 3. Assert: Intent classified as ADD_LESSON
  // 4. Assert: LLM generates valid operation
  // 5. Apply proposal
  // 6. Assert: Lesson added to structure
  // 7. Assert: course_nodes updated (if enabled)
  // 8. Assert: Optimistic lock used
});
```

### 3. Extract Feature Flag Checks to Centralized Module

**Current State**: Feature flags checked inline:

```typescript
if (isFeatureFlagEnabled(process.env.CHAT_INTENT_ROUTING_ENABLED)) { ... }
if (isFeatureFlagEnabled(process.env.CHAT_STRUCTURAL_PROPOSALS_ENABLED)) { ... }
```

**Recommendation**: Create `feature-flags.ts`:

```typescript
export const FeatureFlags = {
  CHAT_INTENT_ROUTING: isEnabled('CHAT_INTENT_ROUTING_ENABLED'),
  CHAT_STRUCTURAL_PROPOSALS: isEnabled('CHAT_STRUCTURAL_PROPOSALS_ENABLED'),
  COURSE_STABLE_IDS_REQUIRED: isEnabled('COURSE_STABLE_IDS_REQUIRED'),
  COURSE_NODES_READ: isEnabled('COURSE_NODES_READ_ENABLED'),
} as const;

function isEnabled(envVar: string): boolean {
  return process.env[envVar] === 'true';
}
```

Then use:

```typescript
if (FeatureFlags.CHAT_INTENT_ROUTING) { ... }
```

### 4. Add Request ID to All Logger Calls

**Observation**: Some logger calls include `requestId`, others don't.

**Recommendation**: Ensure ALL logger calls in the chat flow include `requestId` for distributed tracing:

```typescript
logger.warn(
  { courseId, error: err }, // ← Missing requestId
  'course_nodes dual-write failed'
);

// Should be:
logger.warn({ courseId, requestId, error: err }, 'course_nodes dual-write failed');
```

### 5. Consider Adding Rate Limiting to Structural Operations

**Current State**: `applyDirectAction` has rate limiting (10 req/min), but `applyProposal` with `structural_operation` doesn't.

**Rationale**: Structural operations are expensive (they modify JSONB and dual-write to course_nodes).

**Recommendation**: Add rate limiter:

```typescript
const structuralOperationRateLimiter = createRateLimiter({
  requests: 15, // Slightly higher than direct action
  window: 60,
  keyPrefix: 'structural-operation-rate-limit',
});

applyProposal: instructorProcedure
  .use(structuralOperationRateLimiter) // ← Add this
  .input(applyProposalInputSchema)
  .mutation(async ({ ctx, input }) => {
    // ...
  });
```

---

## Test Coverage Analysis

### Existing Test Coverage

✅ **Good Coverage**:

1. **Optimistic Locking** (`chat-apply-helpers.test.ts`)
   - CONFLICT on 0 rows updated
   - IS NULL filter for legacy rows
   - Covers both field_updates and structural_operation

2. **Direct Intent Helpers** (`chat-helpers-direct-intent.test.ts`)
   - Target resolution
   - Multiple matches clarification
   - Field name aliasing

3. **Surgical Operations** (`surgical-operations.test.ts`)
   - Pre-flight validation
   - Batch constraints
   - ID resolution with tempIdMap

4. **Structure Resolver** (`structure-resolver.test.ts`)
   - course_nodes → JSONB parity checking
   - Fallback to JSONB when nodes unavailable
   - Metadata merging

### Coverage Gaps

⚠️ **Missing Tests**:

1. **Intent Classification Thresholds**
   - No test for confidence < 0.6 → clarification response
   - No test for UNKNOWN intent → clarification
   - No test for tier-0 regex vs tier-1 LLM routing

2. **LLM Triple-Fallback**
   - No test for primary → DB fallback → hardcoded fallback failure chain
   - No test for ModelConfigService unavailable (503 response)

3. **Dual-Write Failures**
   - No test for `writeCourseNodes` failure (non-fatal)
   - No test for JSONB vs course_nodes divergence detection

4. **ID Remapping in Structural Intents**
   - No test for simplified ID → real ID mapping in ADD_LESSON/ADD_SECTION flow

### Recommendations

**Priority 1**: Add tests for intent classification edge cases:

```typescript
describe('Intent Classification', () => {
  it('returns clarification when confidence < 0.6', async () => {
    /* ... */
  });
  it('returns clarification for UNKNOWN intent', async () => {
    /* ... */
  });
  it('uses tier-0 regex for exact keyword matches', async () => {
    /* ... */
  });
});
```

**Priority 2**: Add test for model config unavailability:

```typescript
it('throws 503 when chat phase model config missing', async () => {
  mockModelConfigService.getModelForPhase.mockRejectedValue(
    new Error('Phase "chat_stage_5_refinement" has no config')
  );

  await expect(executeChatMutation(ctx, input)).rejects.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
  });
});
```

---

## Architecture Analysis

### Positive Architectural Decisions

✅ **1. Module Extraction**

- **Before**: 1500+ line `chat.router.ts` monolith
- **After**: 5 focused modules:
  - `chat-apply-helpers.ts` - Proposal application
  - `chat-direct-intent-helpers.ts` - Direct actions (DELETE/MOVE)
  - `chat-legacy-prompt-helpers.ts` - Legacy LLM prompts
  - `chat-mutation-helpers.ts` - Shared mutation logic
  - `chat-intent-flow.ts` - Intent classification routing

**Impact**: Reduced cyclomatic complexity, improved testability, easier code navigation.

---

✅ **2. Stable ID System**

- Sections get `sec_XXXXXXXX` IDs
- Lessons get `lsn_XXXXXXXX` IDs
- Operations reference IDs instead of array indices

**Benefits**:

- Resilient to concurrent edits
- Survives reorderings
- Simplifies undo/redo (future)

**Trade-off**: Requires backfill for existing courses (addressed with `backfill-stable-ids.ts` script).

---

✅ **3. Feature Flags for Phased Rollout**

- `CHAT_INTENT_ROUTING_ENABLED` - Intent classification
- `CHAT_STRUCTURAL_PROPOSALS_ENABLED` - Surgical operations
- `COURSE_STABLE_IDS_REQUIRED` - Guard against writes without stable IDs

**Impact**: Safe deployment, easy rollback, gradual user exposure.

---

✅ **4. Optimistic Locking**

- Uses `updated_at` column for concurrency control
- Separate code paths for `IS NULL` (legacy) and `EQ` (new)
- Returns CONFLICT (409) on stale writes

**Impact**: Prevents lost updates in multi-user scenarios.

---

✅ **5. Dual-Write Strategy (Phase 4)**

- Writes to both JSONB `course_structure` and normalized `course_nodes` table
- Non-fatal failures (logs warning, doesn't block user)
- Parity checker detects divergence

**Impact**: Enables gradual migration to normalized schema without breaking existing code.

---

### Architectural Concerns

⚠️ **1. Growing Complexity in Intent Flow**

**Current Flow**:

```
User message
  → Tier 0: Regex heuristics (40-50% coverage)
  → Tier 1: LLM classification (~200 tokens)
  → Confidence check
  → Route to:
      - Direct execution (DELETE/MOVE) - no LLM
      - Info query (GET_INFO) - no LLM
      - Structural (ADD_LESSON/ADD_SECTION) - LLM with ID remap
      - LLM required (REWRITE/EXPAND) - LLM with targeted context
      - Clarification (low confidence/UNKNOWN) - template response
      - Legacy flow (unhandled) - full LLM
```

**Risk**: As more intents are added, the routing logic in `chat-intent-flow.ts` will grow. Consider state machine or strategy pattern.

**Recommendation**: Extract routing to a table-driven approach:

```typescript
const INTENT_HANDLERS: Record<string, IntentHandler> = {
  DELETE_LESSON: handleDirectExecution,
  DELETE_SECTION: handleDirectExecution,
  MOVE_ELEMENT: handleDirectExecution,
  GET_INFO: handleInfoQuery,
  ADD_LESSON: handleStructural,
  ADD_SECTION: handleStructural,
  REWRITE_CONTENT: handleLLMRequired,
  EXPAND_CONTENT: handleLLMRequired,
  // ...
};

const handler = INTENT_HANDLERS[classifiedIntent.intent];
if (!handler) {
  return handleLegacyFlow();
}
return handler(/* ... */);
```

---

⚠️ **2. Coupling Between Surgical Operations and CourseStructure Schema**

**Issue**: `surgical-operations.ts` has hardcoded field mappings (lines 163-186):

```typescript
const LESSON_FIELD_MAP: Record<string, string> = {
  title: 'lesson_title',
  objectives: 'lesson_objectives',
  // ...
};
```

**Risk**: If `CourseStructure` schema changes (e.g., rename `lesson_objectives` to `objectives`), surgical operations break.

**Recommendation**: Generate field maps from Zod schema (single source of truth):

```typescript
import { courseStructureSchema } from '@megacampus/shared-types';

const LESSON_FIELD_MAP = deriveFieldMapFromSchema(
  courseStructureSchema.shape.sections.element.shape.lessons.element
);
```

---

⚠️ **3. No Circuit Breaker for Dual-Write Failures**

**Issue**: If `writeCourseNodes` fails repeatedly (e.g., DB connection issue), the system continues to attempt dual-writes on EVERY edit.

**Impact**: Wasted DB connections, increased latency, no alerting.

**Recommendation**: Add circuit breaker:

```typescript
const courseNodesCircuitBreaker = new CircuitBreaker({
  failureThreshold: 10, // Open after 10 failures
  resetTimeout: 60000, // Try again after 1 minute
});

if (stageId === 'stage_5' && !courseNodesCircuitBreaker.isOpen()) {
  await writeCourseNodes(/* ... */).catch(err => {
    courseNodesCircuitBreaker.recordFailure();
    logger.warn(
      {
        /* ... */
      },
      'course_nodes dual-write failed'
    );
  });
} else if (courseNodesCircuitBreaker.isOpen()) {
  logger.warn({ courseId }, 'Skipping course_nodes write (circuit breaker OPEN)');
}
```

---

## Security Analysis

### Positive Security Measures

✅ **1. Authorization Checks**

- All mutations use `assertCourseAccess()` with RLS enforcement
- Conversation ownership validated before processing
- Rate limiting on chat (20 req/min) and direct actions (10 req/min)

✅ **2. Input Validation**

- Zod schemas for all inputs
- Whitelist of editable fields (STAGE4_EDITABLE_FIELDS, STAGE5_EDITABLE_FIELDS)
- Pre-flight validation for surgical operations (batch limits, ID existence)

✅ **3. Optimistic Locking**

- Prevents concurrent modification conflicts
- Uses database-level `updated_at` check (can't be bypassed by client)

### Security Concerns

🔒 **1. No Content Size Limits on Structural Operations**

**Issue**: `add_lesson` and `add_section` operations accept arbitrary-length strings for `title`, `description`, `objectives`, etc.

**Risk**: Malicious user could create extremely large sections/lessons, causing:

- JSONB storage bloat
- OOM errors when loading course structure
- Slow queries

**Recommendation**: Add size limits to `courseOperationSchema`:

```typescript
export const addLessonSchema = z.object({
  type: z.literal('add_lesson'),
  tempId: z.string(),
  parentSectionId: z.string(),
  afterLessonId: z.string().nullable(),
  title: z.string().min(1).max(200), // ← Add max
  objectives: z.array(z.string().max(500)).max(10).optional(), // ← Add max
  keyTopics: z.array(z.string().max(200)).max(20).optional(), // ← Add max
  estimatedDuration: z.number().int().min(1).max(300).optional(), // ← Add max
});
```

---

🔒 **2. No Rate Limiting on applyProposal (Structural Operations)**

**Issue**: `applyProposal` with `structural_operation` type has NO rate limiting.

**Risk**: User could spam structural changes, causing:

- High DB write load
- JSONB bloat
- Dual-write amplification

**Recommendation**: Add dedicated rate limiter (see "Improvements" section).

---

## Performance Analysis

### Positive Performance Optimizations

⚡ **1. Targeted LLM Context**

- **Before**: Full course structure (~42K tokens for 49-lesson course)
- **After**: Compact skeleton (~300-500 tokens) + focused element (~200-500 tokens)
- **Savings**: ~40K tokens per request = ~$0.12/request at GPT-4 pricing

⚡ **2. Tier-0 Regex Routing**

- 40-50% of messages classified via regex (0ms, $0)
- Only unmatched messages go to LLM (~200 tokens, ~$0.00005)

⚡ **3. Optimistic Locking Avoids Lock Contention**

- No database locks held during LLM calls
- Concurrent users can work independently until write phase

### Performance Concerns

⚠️ **1. No Batch Optimization for Multiple Updates**

**Issue**: Applying 10 field updates requires 10 separate database writes (each with optimistic lock check).

**Current Flow**:

```typescript
for (const update of updates) {
  applyFieldUpdate(structure, update.path, update.newValue);
}
// Single write at the end
```

**Actual Implementation**: Looking at the code, this is ALREADY optimized - all updates are applied in-memory, then written once. This is CORRECT.

**No issue** - Code is already efficient.

---

⚠️ **2. course_nodes Dual-Write Amplification**

**Issue**: Every structural edit writes to:

1. JSONB `course_structure` (1 row update)
2. `course_nodes` table (N row inserts/updates/deletes, where N = sections + lessons)

**Example**: Deleting a section with 5 lessons triggers:

- 1 JSONB update
- 6 course_nodes deletes (1 section + 5 lessons)
- Total: 7 DB operations

**Impact**: For large courses (100+ lessons), structural changes become expensive.

**Recommendation**: Consider batching course_nodes writes:

```typescript
await supabase.rpc('batch_upsert_course_nodes', {
  p_course_id: courseId,
  p_nodes: nodesArray, // Single RPC call instead of N queries
});
```

---

## Summary of Recommendations

### Must Fix (Before Merge)

- **None** - Code quality is high, no critical issues.

### Should Fix (This Sprint)

1. Add monitoring/alerting for dual-write failures (HIGH)
2. Add i18n support for direct intent error messages (MEDIUM)
3. Add type validation for `update_field` operations (MEDIUM)

### Nice to Have (Future Sprint)

1. Extract optimistic lock query to helper (reduces duplication)
2. Rename `convId` → `conversationId` consistently
3. Add JSDoc to public API functions
4. Add course language param to surgical operations for i18n defaults
5. Add metrics for intent classification accuracy
6. Add integration test for full surgical flow
7. Extract feature flag checks to centralized module
8. Add request ID to ALL logger calls
9. Add rate limiting to structural operations
10. Add circuit breaker for dual-write failures

---

## Conclusion

This is a **well-executed refactoring** that significantly improves code organization and adds powerful new features (intent classification, surgical operations) without introducing critical bugs.

**Strengths**:

- Thoughtful modularization (5 focused modules vs 1 monolith)
- Comprehensive test coverage for critical paths
- Feature flags enable safe phased rollout
- Optimistic locking prevents data corruption
- Stable IDs enable robust structural editing

**Weaknesses**:

- Some minor code duplication (optimistic lock queries)
- Missing i18n for error messages
- No circuit breaker for dual-write failures
- Missing type validation for field updates

**Recommendation**: ✅ **APPROVE** with follow-up tasks for the "Should Fix" items.

---

**Report Generated**: 2026-02-14
**Type-Check**: ✅ PASSED
**Build**: ✅ PASSED
**Overall Status**: ✅ READY FOR MERGE
