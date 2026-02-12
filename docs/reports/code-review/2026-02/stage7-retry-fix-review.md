# Code Review: Stage 7 Retry Fix

**Date**: 2026-02-07
**Reviewer**: Claude Code (Orchestrator)
**Scope**: 4 files - Stage 7 enrichment double retry bug fix
**Status**: ⚠️ PARTIAL PASS - Critical issues found

---

## Summary

### Context

The bug caused enrichment records to hang forever in `generating` status due to double retry logic:

- Internal retry logic in `job-processor.ts` used static `job.data.retryAttempt`
- BullMQ's automatic retry used `job.attemptsMade`
- These counters diverged, causing retry decisions based on stale data

### Changes Reviewed

1. **job-processor.ts** (Line 387): Fixed retry counter from `job.data.retryAttempt + 1` to `job.attemptsMade + 1`
2. **factory.ts**: Added safety net in `worker.on('failed')` to update enrichment status when BullMQ exhausts retries
3. **regenerate.ts**: Extended `allowedStatuses` to include `'generating'` with 10-minute time guard
4. **helpers.ts**: Added `updated_at` field to `verifyEnrichmentAccess` query and return type

### Overall Assessment

✅ **Core fix is correct** - `job.attemptsMade` is the right counter per BullMQ documentation
⚠️ **Race condition risk** - Safety net in factory.ts may conflict with job processor
⚠️ **Missing error field update** - Line 412 still uses old static counter
✅ **Time guard logic is sound** - 10-minute threshold for stuck jobs is reasonable
✅ **Helper change is safe** - `updated_at` addition is backward compatible

---

## Issues Found

### P0 Critical

#### 1. Inconsistent Retry Counter in Error Metadata (job-processor.ts:412)

**Location**: `packages/course-gen-platform/src/stages/stage7-enrichments/services/job-processor.ts:412`

**Issue**: Error metadata still uses the old static `retryAttempt` counter instead of `job.attemptsMade`:

```typescript
// Line 405-415 (current code)
await updateEnrichmentStatus(enrichmentId, 'failed', errorObj.message, {
  stack: errorObj.stack,
  attempt: retryAttempt + 1, // ❌ WRONG - uses static job.data.retryAttempt
  jobId: job.id,
});
```

**Impact**: Error metadata will record incorrect attempt number (always 1 if retryAttempt defaults to 0 in job.data).

**Fix Required**:

```typescript
{
  stack: errorObj.stack,
  attempt: job.attemptsMade + 1,  // ✅ Use BullMQ counter
  jobId: job.id,
}
```

---

### P1 High

#### 2. Potential Race Condition in worker.on('failed') Safety Net (factory.ts:68-104)

**Location**: `packages/course-gen-platform/src/stages/stage7-enrichments/factory.ts:68-104`

**Issue**: The `worker.on('failed')` handler unconditionally updates enrichment status to `'failed'`. This creates a race condition window:

**Scenario**:

1. Job processor catches error at line 372 (job-processor.ts)
2. Job processor decides NOT to retry (line 391-403)
3. Job processor updates DB to `'failed'` (line 406-415)
4. Job processor re-throws error (line 402) to signal BullMQ
5. BullMQ worker.on('failed') fires (factory.ts:68)
6. Safety net ALSO tries to update DB to `'failed'`

**Questions**:

- Does BullMQ guarantee `worker.on('failed')` fires AFTER the processor function completes?
- If processor successfully updates DB to `'failed'` and returns, will `worker.on('failed')` still fire?

**BullMQ Behavior (per Context7)**:
From the documentation review, `worker.on('failed')` fires **when BullMQ moves job to failed set**, which happens when:

- Processor throws AND max attempts reached
- OR processor throws AND no more retries configured

**Analysis**:
The current code flow:

```typescript
// job-processor.ts catch block
if (shouldRetry(retryContext)) {
  await sleep(delay);
  throw error;  // → BullMQ retries, worker.on('failed') does NOT fire yet
}

// No retry - mark as failed
await updateEnrichmentStatus(..., 'failed', ...);
return createFailedResult(...);  // ← Does NOT throw
```

**CRITICAL FINDING**: When `shouldRetry()` returns false:

- Processor marks DB as `'failed'` ✅
- Processor returns failed result (does NOT throw) ✅
- BullMQ considers job "completed successfully" ❌
- `worker.on('failed')` never fires ✅ (no conflict)

**However**, when `shouldRetry()` returns true but BullMQ exhausts attempts:

- Processor throws error → triggers retry
- Eventually BullMQ exhausts `attempts: 3` config
- BullMQ moves job to failed set
- `worker.on('failed')` fires
- DB already marked `'failed'` by previous attempt? ❓

**Actually**, if we trace the retry flow:

1. Attempt 1 fails → `shouldRetry()` true → throw → BullMQ schedules retry
2. Attempt 2 fails → `shouldRetry()` true → throw → BullMQ schedules retry
3. Attempt 3 fails → `shouldRetry()` false (attempt=3, MAX_RETRIES=3) → mark DB failed, return
4. BullMQ never exhausts attempts because processor returns success on last attempt

**REVISED FINDING**: The safety net in `worker.on('failed')` **will only fire** if:

- Job processor crashes/throws unexpectedly without catching
- BullMQ worker timeout (LOCK_DURATION_MS exceeded)
- Stalled job moved to failed after MAX_STALLED_COUNT

**Conclusion**: Safety net is good defensive programming BUT has subtle issue:

**Risk**: If job processor successfully updates DB but then crashes before returning, the enrichment may be marked `'failed'` twice with different error messages.

**Recommendation**: Check if enrichment is already `'failed'` before updating:

```typescript
worker.on('failed', async (job, error) => {
  logger.error(...);

  if (job?.data?.enrichmentId) {
    try {
      // Check current status first to avoid overwriting
      const { data: current } = await supabase
        .from('lesson_enrichments')
        .select('status')
        .eq('id', job.data.enrichmentId)
        .single();

      // Only update if NOT already failed (defensive)
      if (current?.status !== 'failed') {
        await updateEnrichmentStatus(
          job.data.enrichmentId,
          'failed',
          `BullMQ exhausted retries: ${error.message}`,
          { jobId: job.id, attempts: job.attemptsMade, stack: error.stack }
        );
      }
    } catch (dbError) {
      logger.error(...);
    }
  }
});
```

---

#### 3. Time Zone Handling for Time Guard (regenerate.ts:109-118)

**Location**: `packages/course-gen-platform/src/server/routers/enrichment/procedures/regenerate.ts:109-118`

**Issue**: Time comparison uses `Date.now()` and `new Date(enrichment.updated_at)` without explicit timezone handling.

**Current Code**:

```typescript
if (enrichment.status === 'generating') {
  const updatedAt = new Date(enrichment.updated_at); // Parses ISO string from DB
  const stuckThresholdMs = 10 * 60 * 1000;
  if (Date.now() - updatedAt.getTime() < stuckThresholdMs) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Enrichment is still generating. Wait at least 10 minutes before regenerating.',
    });
  }
}
```

**Analysis**:

- `enrichment.updated_at` is set via `new Date().toISOString()` in database-service.ts (line 155)
- PostgreSQL stores as `timestamp with time zone`
- Supabase returns as ISO 8601 string (e.g., "2026-02-07T14:30:00.000Z")
- JavaScript `new Date()` correctly parses ISO 8601 with 'Z' suffix
- `Date.now()` returns milliseconds since Unix epoch (UTC)
- `updatedAt.getTime()` returns milliseconds since Unix epoch (UTC)

**Verdict**: ✅ **Logic is correct** - Both timestamps are in UTC, comparison is safe.

**Edge Case**: If `updated_at` is null (shouldn't happen but database allows it per helpers.ts:128), code would create `Invalid Date`.

**Recommendation**: Add null check:

```typescript
if (enrichment.status === 'generating') {
  const updatedAtStr = enrichment.updated_at;
  if (!updatedAtStr) {
    // Shouldn't happen, but defensive
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Enrichment timestamp missing',
    });
  }

  const updatedAt = new Date(updatedAtStr);
  if (isNaN(updatedAt.getTime())) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Invalid enrichment timestamp',
    });
  }

  const stuckThresholdMs = 10 * 60 * 1000;
  if (Date.now() - updatedAt.getTime() < stuckThresholdMs) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Enrichment is still generating. Wait at least 10 minutes before regenerating.',
    });
  }
}
```

---

### P2 Medium

#### 4. Missing Tests for Retry Logic

**Issue**: No existing tests found for Stage 7 enrichment logic.

**Gap**: The retry fix changes critical business logic but cannot be validated with automated tests.

**Risk**: Future refactoring may reintroduce the bug.

**Recommendation**: Create integration tests covering:

1. Job retries with `job.attemptsMade` incrementing correctly
2. Retry exhaustion marking enrichment as `'failed'`
3. `worker.on('failed')` safety net for crashed jobs
4. Time guard preventing premature regeneration
5. Race condition between job processor and worker event handler

**Test Structure**:

```typescript
// packages/course-gen-platform/tests/integration/stage7-retry.test.ts

describe('Stage 7 Retry Logic', () => {
  it('should use job.attemptsMade for retry decisions', async () => {
    // Mock enrichment that always fails
    // Verify shouldRetry() called with job.attemptsMade + 1
    // Verify max 3 attempts made
  });

  it('should update DB with correct attempt count in error metadata', async () => {
    // Job fails after 3 attempts
    // Check error_details.attempt === 3
  });

  it('should mark as failed when BullMQ exhausts retries (safety net)', async () => {
    // Simulate stalled job
    // Verify worker.on('failed') updates DB
  });

  it('should prevent regeneration of recently updated generating enrichments', async () => {
    // Create enrichment with status='generating', updated_at=2 minutes ago
    // Attempt regenerate
    // Expect TRPCError 'Wait at least 10 minutes'
  });

  it('should allow regeneration of stuck generating enrichments', async () => {
    // Create enrichment with status='generating', updated_at=15 minutes ago
    // Attempt regenerate
    // Expect success
  });
});
```

---

#### 5. Redundant `retryAttempt` in Job Data

**Location**: Multiple files using `Stage7JobInput` type

**Issue**: The `retryAttempt` field in `job.data` is now redundant since we use `job.attemptsMade`:

**Current Usage**:

- Set in `regenerate.ts:194`: `retryAttempt: newAttempt`
- Destructured in `job-processor.ts:100`: `retryAttempt = 0`
- Used in error metadata (bug): `job-processor.ts:412`

**After Fix**: Only `job.attemptsMade` should be used.

**Recommendation**:

1. Remove `retryAttempt` from `Stage7JobInput` type definition
2. Remove from job creation in `regenerate.ts`
3. Remove destructuring in `job-processor.ts`
4. Update all references to use `job.attemptsMade`

**Impact**: Non-breaking if done carefully (old jobs in queue may still have field, but it's optional).

---

### P3 Low

#### 6. Inconsistent Error Message Format (factory.ts:86)

**Location**: `packages/course-gen-platform/src/stages/stage7-enrichments/factory.ts:86`

**Issue**: Error message prefix "BullMQ exhausted retries:" differs from job processor error messages.

**Current Code**:

```typescript
await updateEnrichmentStatus(
  job.data.enrichmentId,
  'failed',
  `BullMQ exhausted retries: ${error.message}`,  // Prefix added
  { ... }
);
```

**Comparison**: Job processor passes raw `errorObj.message` (line 409).

**Impact**: Minor - helps distinguish safety net failures from normal failures in logs.

**Recommendation**: Keep as-is for observability, but consider adding a metadata flag:

```typescript
{
  jobId: job.id,
  attempts: job.attemptsMade,
  stack: error.stack,
  source: 'worker_failed_event',  // Tag for debugging
}
```

---

#### 7. Logging Clarity for Retry Decisions (job-processor.ts:393-396)

**Location**: `packages/course-gen-platform/src/stages/stage7-enrichments/services/job-processor.ts:393-396`

**Issue**: Log message says "Will retry after delay" but doesn't log the error category or retry strategy.

**Current Code**:

```typescript
if (shouldRetry(retryContext)) {
  const delay = getRetryDelay(retryContext);
  jobLogger.info(
    { delay, nextAttempt: retryContext.attempt + 1 },
    'Will retry after delay'
  );
```

**Recommendation**: Add more context for debugging:

```typescript
if (shouldRetry(retryContext)) {
  const delay = getRetryDelay(retryContext);
  const category = categorizeError(retryContext.error!);
  jobLogger.info(
    {
      delay,
      nextAttempt: retryContext.attempt + 1,
      errorCategory: category,
      currentAttempt: job.attemptsMade + 1,
      maxRetries: STAGE7_CONFIG.MAX_RETRIES,
    },
    'Will retry after delay'
  );
```

---

## Recommendations

### Immediate (Must Fix)

1. **Fix Line 412** - Replace `retryAttempt + 1` with `job.attemptsMade + 1` in error metadata
2. **Add Status Check in Safety Net** - Check if enrichment already `'failed'` before updating in `worker.on('failed')`
3. **Add Null/Invalid Date Check** - Validate `updated_at` before time guard calculation

### Short Term (Should Fix)

4. **Write Integration Tests** - Cover retry logic, time guard, safety net
5. **Remove Redundant `retryAttempt` Field** - Clean up `Stage7JobInput` type
6. **Improve Retry Logging** - Add error category and attempt details

### Long Term (Nice to Have)

7. **Add Metadata Source Tag** - Distinguish safety net failures from processor failures
8. **Document BullMQ Retry Flow** - Add architectural diagram showing job lifecycle

---

## Tests to Update

### New Tests Required

Since no existing tests were found, create new test file:

**File**: `packages/course-gen-platform/tests/integration/stage7-retry.test.ts`

**Coverage**:

- ✅ Retry counter using `job.attemptsMade`
- ✅ Error metadata with correct attempt count
- ✅ Safety net for crashed jobs
- ✅ Time guard (10 min threshold)
- ✅ Race condition between processor and worker event
- ✅ Max retries exhaustion
- ✅ Model fallback on context overflow

**Setup Requirements**:

- Use `getTestSupabaseClient()` from `tests/helpers/shared-supabase`
- Mock BullMQ worker/queue or use real Redis connection
- Test enrichment creation in `lesson_enrichments` table
- Cleanup in `afterEach` (enrichments → lessons → sections → courses → organizations)

---

## Validation Checklist

### BullMQ Counter Correctness ✅

Per BullMQ documentation (Context7):

- `job.attemptsMade` is the **official retry counter** (0-indexed, increments before each attempt)
- When `attempts: 3` configured, `job.attemptsMade` will be 0, 1, 2 across 3 attempts
- Worker processor receives `job.attemptsMade` as current attempt number

**Line 387 Fix**:

```typescript
// BEFORE (bug)
attempt: job.data.retryAttempt + 1; // Always 1 if retryAttempt=0

// AFTER (correct)
attempt: job.attemptsMade + 1; // Correctly tracks 1, 2, 3
```

**Verdict**: ✅ **Correct fix** - `job.attemptsMade` is the right counter.

---

### Safety Net Logic ✅ (with caveats)

**Purpose**: Catch jobs that fail outside normal processor error handling (crashes, timeouts, stalls).

**When it fires**:

- Job processor crashes before catching error
- Worker timeout (LOCK_DURATION_MS = 300s)
- Stalled job moved to failed (MAX_STALLED_COUNT = 3)

**Edge Case**: If processor updates DB then crashes before returning, safety net will overwrite with generic message.

**Recommendation**: Check current status before updating (see P1 issue #2).

---

### Time Guard Logic ✅

**Purpose**: Prevent regeneration spam on stuck jobs.

**Threshold**: 10 minutes (600,000 ms)

**Logic**:

```typescript
Date.now() - new Date(updated_at).getTime() < 10 * 60 * 1000;
```

**Analysis**:

- Both timestamps in UTC ✅
- ISO 8601 parsing correct ✅
- Threshold reasonable for Stage 7 (LOCK_DURATION_MS = 5 min, so 10 min is 2x safety margin) ✅

**Edge Case**: Null/invalid `updated_at` (see P1 issue #3).

---

### Helpers.ts Change ✅

**Change**: Added `updated_at` to query and return type.

**Impact Analysis**:

- Used by: `regenerate.ts:86-91`, potentially other procedures
- Return type change: Added optional `updated_at: string` field
- Backward compatible: Consumers not using field won't break ✅
- Query change: Adds one field to SELECT (no performance impact) ✅

**Verdict**: ✅ **Safe change** - backward compatible addition.

---

## TypeScript Type Safety

All changes maintain type safety:

- ✅ `job.attemptsMade` is typed as `number` in BullMQ types
- ✅ `verifyEnrichmentAccess` return type explicitly includes `updated_at: string`
- ✅ `EnrichmentStatus` union type includes `'generating'` (from shared-types)
- ✅ Error metadata object has `Record<string, unknown>` type

---

## Conclusion

### Overall Status: ⚠️ PARTIAL PASS

**Core Fix**: ✅ Correct - `job.attemptsMade` is the right counter per BullMQ docs

**Critical Issues**: ❌ 1 P0 issue must be fixed (line 412 inconsistency)

**High Priority**: ⚠️ 2 P1 issues should be addressed (race condition, null check)

**Test Coverage**: ❌ No tests exist - high risk for regressions

---

### Next Steps

1. **Immediate**: Fix P0 issue #1 (line 412) - 5 min effort
2. **Before Merge**: Address P1 issues #2-3 - 30 min effort
3. **Post-Merge**: Write integration tests (P2 issue #4) - 2-4 hours
4. **Cleanup**: Remove redundant `retryAttempt` field (P2 issue #5) - 1 hour

---

### Sign-Off

**Recommendation**: 🔶 **Conditional approval** - Fix P0 issue before merge, address P1 issues before deployment to staging.

**Risk Level**: Medium - Core fix is correct but missing safeguards and test coverage.

**Deployment Plan**:

1. Apply P0 fix
2. Apply P1 fixes
3. Deploy to dev environment
4. Monitor enrichment retry metrics for 24 hours
5. Deploy to staging
6. Write tests
7. Deploy to production

---

**Reviewed By**: Claude Code (Code Reviewer Worker)
**Review Date**: 2026-02-07
**Review Duration**: 15 minutes
**Files Reviewed**: 4
**Issues Found**: 7 (1 P0, 2 P1, 2 P2, 2 P3)
