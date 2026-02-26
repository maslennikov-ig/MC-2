---
report_type: code-review
generated: 2026-02-26T11:40:00Z
version: 2026-02-26
status: partial
agent: code-reviewer
commit: 4bc6ddeb
branch: develop
files_reviewed: 2
issues_found: 7
critical_count: 0
high_count: 2
medium_count: 3
low_count: 2
---

# Code Review Report: fix: stop misclassifying network errors as "enrichment not found" during polling

**Generated**: 2026-02-26
**Commit**: `4bc6ddeb`
**Branch**: `develop`
**Status**: PARTIAL — no critical blockers, but two high-priority issues require attention
**Files Reviewed**: 2
**Issues Found**: 7 (0 critical, 2 high, 3 medium, 2 low)

---

## Executive Summary

This commit correctly identifies and fixes a real production bug: network errors during
server restart were being classified as `NOT_FOUND`, causing the frontend polling loop to
count them toward its 5-failure permanent-stop limit. After 5 restarts, polling would halt
irreversibly even though the enrichment still existed.

The core approach is sound. The error-code check on the backend and the
`isNotFound` branch split on the frontend are the right tools for this problem. The
concern is in the execution details rather than the design.

---

## Detailed Findings

### High Priority Issues

#### 1. `currentInterval` backoff is reset by `setInterval` — exponential backoff for transient errors is silently ignored

**File**: `packages/web/lib/hooks/useEnrichmentGeneration.ts`, lines 203, 299, 306
**Category**: Bug / Logic Error

The `currentInterval` variable is declared inside `startPolling` (line 203) and mutated
inside `pollStatus` (line 299). The `setInterval` call at line 306, however, captures
`currentInterval` at the moment `startPolling` executes — JavaScript closures for
`setInterval` capture the _value_ of primitive variables at schedule time, not a
reference to them. Mutating `currentInterval` later does not change the interval that is
already ticking.

```typescript
// Line 203 — currentInterval is a primitive let
let currentInterval = pollingInterval;

const pollStatus = async () => {
  // ...
  // Line 299 — this mutates the local variable, but setInterval
  // already has a fixed delay baked in
  currentInterval = Math.min(currentInterval * 2, MAX_BACKOFF_INTERVAL);
};

// Line 306 — setInterval reads currentInterval ONCE here (e.g., 2000 ms)
// It will always fire every 2000 ms regardless of later mutations to currentInterval
const interval = setInterval(() => void pollStatus(), currentInterval);
```

The result is that transient errors accumulate at the full `pollingInterval` rate (2
seconds) instead of backing off. `MAX_BACKOFF_INTERVAL` is never reached. The backoff was
also previously 1.5x per failure; this commit changed it to 2x, which is still not applied
in practice.

This same bug existed before this commit for the `NOT_FOUND` path. The commit adds a new
code path that relies on the backoff working, so the existing bug now matters more.

**Impact**: During a server restart lasting longer than `MAX_POLL_FAILURES * 2s = 10s`,
the server is hammered at the original rate (2 req/s) rather than backing off. This is
moderate load impact, not data loss.

**Recommendation**: Replace `setInterval` with recursive `setTimeout` so each new schedule
uses the updated `currentInterval`:

```typescript
let currentInterval = pollingInterval;
let timeoutHandle: NodeJS.Timeout | null = null;

const scheduleNext = () => {
  timeoutHandle = setTimeout(() => {
    void pollStatus().then(scheduleNext);
  }, currentInterval);
  pollingIntervalsRef.current.set(type, timeoutHandle as unknown as NodeJS.Timeout);
};

// Initial immediate call, then schedule recursively
void pollStatus().then(scheduleNext);
```

This also requires updating `stopPolling` to use `clearTimeout`. The existing `setInterval`
approach for the _success/normal_ path (`currentInterval = pollingInterval` reset on
success at line 223) similarly has no effect on the running interval, but there it is
harmless since reset only happens on a successful poll.

---

#### 2. `verifyCourseAccess` and `verifyLessonAccess` still use the old `if (error || !data)` pattern

**File**: `packages/course-gen-platform/src/server/routers/enrichment/helpers.ts`, lines 163, 240
**Category**: Consistency / Correctness

The commit fixed `verifyEnrichmentAccess` to distinguish PGRST116 (genuine not-found) from
network errors. The two sibling functions in the same file were not updated:

```typescript
// helpers.ts line 163 — verifyCourseAccess
if (error || !course) {
  // always throws NOT_FOUND regardless of error type
  throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
}

// helpers.ts line 240 — verifyLessonAccess
if (error || !lesson) {
  // always throws NOT_FOUND regardless of error type
  throw new TRPCError({ code: 'NOT_FOUND', message: 'Lesson not found' });
}
```

Both functions are called from `verifyEnrichmentAccess` itself (the course check at line 80) and from other routers. A network error on the course lookup inside
`verifyEnrichmentAccess` would still produce a `NOT_FOUND` TRPCError, which would then
be counted by the frontend as a permanent failure — partially re-introducing the bug this
commit was meant to fix.

The same pattern exists in at least 12 other router files across the codebase
(`clarifying-helpers.ts`, `lesson-content/helpers.ts`, `generation/status.router.ts`,
etc.). Fixing them all is out of scope for this commit, but the two in the same file
should be treated as part of this fix.

**Recommendation**: Apply the same PGRST116 guard to `verifyCourseAccess` and
`verifyLessonAccess`:

```typescript
// verifyCourseAccess
if (error) {
  if (error.code === 'PGRST116') {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
  }
  logger.error({ requestId, courseId, userId, error }, 'Course lookup failed (transient)');
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Temporary error checking course',
  });
}
if (!course) {
  throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
}
```

---

### Medium Priority Issues

#### 3. `if (!enrichment)` dead code branch after error guard

**File**: `packages/course-gen-platform/src/server/routers/enrichment/helpers.ts`, lines 74-77
**Category**: Code Quality

After the commit, the `if (!enrichment)` check at line 74 can never be reached. With
`.single()`, Supabase either returns a row (non-null `data`) or sets `error` to a
PostgrestError. When `error` is null, `data` is always the row object; it is never null or
undefined on a success path with `.single()`.

The branch is harmless but creates reader confusion about whether `null` is a real
possibility.

**Recommendation**: Either replace `.single()` with `.maybeSingle()` (where `null` data
is an intentional "not found" rather than an error), or remove the dead branch with a
comment explaining why it is unreachable:

```typescript
// With .single(): if error is null, enrichment is guaranteed non-null.
// The branch below is a safety net for future refactors that change
// the query modifier.
```

Context7 confirms this: `.single()` returns an error for zero rows; `.maybeSingle()`
returns `null` data for zero rows with no error. The code was originally written
for `.maybeSingle()` semantics (`error || !data`) but is using `.single()`.

---

#### 4. No test coverage for the new NOT_FOUND-specific polling failure path

**File**: `packages/web/lib/hooks/__tests__/useEnrichmentGeneration.test.ts`
**Category**: Testing

The existing test suite does not cover the scenario introduced by this commit. The closest
existing test is `'should handle polling errors with backoff'` (line 632), which uses a
generic `Error('Network error')` — this now exercises the _transient_ path, not the
`NOT_FOUND` path. There is no test that:

1. Simulates a `TRPCClientError` with `data.code === 'NOT_FOUND'` during polling
2. Verifies the failure counter increments
3. Verifies polling stops after `MAX_POLL_FAILURES` NOT_FOUND errors
4. Verifies a generic network error does NOT increment the counter
5. Verifies a generic network error does NOT stop polling

The bug this commit fixes was severe enough to halt generation permanently. Both branches
of the new `isNotFound` condition warrant explicit regression tests.

**Recommended test stubs**:

```typescript
it('should stop polling after MAX_POLL_FAILURES NOT_FOUND errors', async () => {
  const notFoundError = new TRPCClientError('Enrichment not found');
  Object.defineProperty(notFoundError, 'data', { value: { code: 'NOT_FOUND' } });
  mockQueryStatus.mockRejectedValue(notFoundError);
  // ... assert onError called, polling stopped after 5 failures
});

it('should NOT stop polling on transient network errors', async () => {
  mockQueryStatus.mockRejectedValue(new Error('fetch failed'));
  // ... wait well beyond 5 * pollingInterval
  // ... assert onError NOT called, generating still true
});

it('should backoff on transient errors (currentInterval increases)', async () => {
  // This test would currently FAIL due to the setInterval/closure bug (Issue #1)
  // It documents the intended behavior and serves as a regression target
});
```

---

#### 5. Error classification relies on `error.data?.code` — shape depends on tRPC version and network path

**File**: `packages/web/lib/hooks/useEnrichmentGeneration.ts`, line 274
**Category**: Robustness / Best Practices

```typescript
const isNotFound = error instanceof TRPCClientError && error.data?.code === 'NOT_FOUND';
```

Context7 confirms that `error.data.code` is the correct field for the tRPC error shape
(`"code": "NOT_FOUND"` lives in `data`, not at the top level). This is fine for errors
that reach the tRPC error handler.

However, if the network request itself fails before the tRPC layer responds (e.g., TCP
connection refused, DNS failure, proxy timeout), the caught object may not be a
`TRPCClientError` at all — it may be a plain `Error` or `TypeError: fetch failed`. This
case is handled correctly: it falls through to the `else` branch (transient). The
`instanceof TRPCClientError` check acts as the guard.

One remaining concern: if the server returns an HTTP 500 with a non-tRPC body (e.g., a
Next.js error page), tRPC may wrap it as a `TRPCClientError` with `data.code ===
'INTERNAL_SERVER_ERROR'`. This is already handled correctly — it lands in the transient
path. No action needed, but worth documenting in a comment.

---

### Low Priority Issues

#### 6. Backoff multiplier changed from 1.5x to 2x without updating `MAX_POLL_FAILURES` or documentation

**File**: `packages/web/lib/hooks/useEnrichmentGeneration.ts`, line 299
**Category**: Documentation / Consistency

The commit changes the transient-error backoff from 1.5x to 2x. Given `DEFAULT_POLLING_INTERVAL = 2000`
and `MAX_BACKOFF_INTERVAL = 10000`, the sequence would be: 2s, 4s, 8s, 10s (capped). This
is more aggressive than before (2s, 3s, 4.5s, 6.75s, 10s). The constant names and the
hook's JSDoc still reference the old 1.5x behavior. The change is reasonable but was not
called out in the commit message and may surprise maintainers.

**Recommendation**: Update the comment at line 297 to note the 2x multiplier explicitly,
and consider whether the constant `MAX_BACKOFF_INTERVAL` should also be raised
(e.g., 30 seconds) for long server restarts.

---

#### 7. Log level asymmetry between transient and not-found errors

**File**: `packages/course-gen-platform/src/server/routers/enrichment/helpers.ts`, lines 58, 64
**Category**: Observability

Not-found errors (PGRST116) are logged at `warn`. Transient errors are logged at `error`.
This is correct: a missing row is expected in some flows (enrichment deleted), but a
network error is always unexpected. However, the transient error log message
`'Enrichment lookup failed (transient)'` — the word "transient" in a log message searched
in production log aggregators may cause confusion. Consider `'Enrichment lookup failed
(database unreachable)'` or keeping `'transient'` only as a structured field:

```typescript
logger.error(
  { requestId, enrichmentId, userId, error, errorType: 'transient' },
  'Enrichment lookup failed'
);
```

---

## Context7 Validation

### Supabase PostgREST Error Codes

**Library**: `/supabase/postgrest-js` — Source Reputation: High

PGRST116 is the correct code for `.single()` zero-row results. Context7 confirms:

> "If no rows match, a 404 Not Found will be returned" (for `.single()`). The client-side
> error object from the Supabase JS SDK carries this as `error.code === 'PGRST116'`.

The choice of `.single()` vs `.maybeSingle()` is relevant here:

- `.single()` — zero rows produces `error.code === 'PGRST116'`, `data` is null
- `.maybeSingle()` — zero rows produces `error === null`, `data === null`

The current code uses `.single()` and checks `error.code === 'PGRST116'`. This is
correct. The dead branch at line 74 (`if (!enrichment)`) would only be reachable with
`.maybeSingle()` semantics.

No additional PostgREST error codes need to be handled for the "not found" case when using
`.single()`. PGRST116 is the only not-found code for this query pattern.

### tRPC Client Error Shape

**Library**: `/trpc/trpc` — Source Reputation: High

Context7 confirms the error shape:

```json
{
  "error": {
    "message": "...",
    "code": -32600,
    "data": {
      "code": "NOT_FOUND",
      "httpStatus": 404
    }
  }
}
```

The frontend check `error.data?.code === 'NOT_FOUND'` is correct. The optional chaining
(`?.`) handles cases where `data` is absent (e.g., network-layer failures that tRPC wraps
without a full error shape). This is the recommended pattern per tRPC docs.

---

## Best Practices Assessment

| Area                                       | Assessment                  |
| ------------------------------------------ | --------------------------- | --------------------------- | ------------------------------ |
| PGRST116 as not-found signal               | Correct for `.single()`     |
| TRPCClientError.data.code access           | Correct shape per tRPC docs |
| Separating permanent from transient errors | Correct design              |
| setInterval backoff effectiveness          | Broken — see Issue #1       |
| `if (error                                 |                             | !data)` pattern in siblings | Consistency gap — see Issue #2 |
| Optimistic abort handling                  | Correct, unchanged          |
| Unmount cleanup                            | Correct, unchanged          |

---

## Consistency Audit: `if (error || !data)` Pattern Across Routers

The following files contain the same pre-fix pattern and would misclassify network errors
as NOT_FOUND if called during a polling flow. Only the two in `enrichment/helpers.ts` are
directly on the call path of the fixed endpoint.

| File                          | Line    | Pattern                            | On polling path?                                            |
| ----------------------------- | ------- | ---------------------------------- | ----------------------------------------------------------- |
| `enrichment/helpers.ts`       | 163     | `if (error \|\| !course)`          | Yes (inside verifyEnrichmentAccess)                         |
| `enrichment/helpers.ts`       | 240     | `if (error \|\| !lesson)`          | No (verifyLessonAccess not called from getGenerationStatus) |
| `lesson-content/helpers.ts`   | 122     | `if (error \|\| !course)`          | No                                                          |
| `clarifying-helpers.ts`       | 90, 147 | `if (error \|\| !course/question)` | No                                                          |
| `generation/status.router.ts` | 96      | `if (error \|\| !course)`          | Possibly (status polling)                                   |
| Others (7 files)              | —       | same                               | No                                                          |

The `generation/status.router.ts` case is worth investigating separately, as it may also
be called from a polling loop in the frontend.

---

## Validation Results

The following checks were not re-run as this is a read-only review of a committed diff.
The commit was produced with a prior `pnpm type-check && pnpm build` gate per project
convention.

### Tests

No new tests were added in this commit. The existing test `'should handle polling errors
with backoff'` passes a plain `Error`, which now exercises the transient path — this
implicitly tests that transient errors do not stop polling. However, it does not explicitly
test the `NOT_FOUND` branch behavior.

---

## Summary of Recommendations

### Must Fix Before Next Release

None. The bug being fixed is worse than the issues introduced.

### Should Fix in Follow-Up

1. **Replace `setInterval` with recursive `setTimeout`** in `startPolling` so transient-error
   exponential backoff is actually applied. This is the highest-value follow-up. A failing
   test (Issue #4, "backoff on transient errors") would make the regression visible.

2. **Apply PGRST116 guard to `verifyCourseAccess`** in `enrichment/helpers.ts` line 163,
   since it is called from within `verifyEnrichmentAccess` after the enrichment check
   passes, and a network error there would still surface as NOT_FOUND to the frontend.

### Future Work

3. Add regression tests for both branches of the `isNotFound` split (NOT_FOUND stops
   polling, generic errors do not).
4. Audit `generation/status.router.ts` for the same `if (error || !data)` pattern if
   it is also polled from the frontend.
5. Remove or document the dead `if (!enrichment)` branch at line 74.
6. Update backoff multiplier comment (1.5x → 2x) and consider raising `MAX_BACKOFF_INTERVAL`.

---

## Artifacts

- Commit reviewed: `4bc6ddeb` on branch `develop`
- This report: `docs/reports/code-review/2026-02/2026-02-26-enrichment-polling-fix.md`
- Context7 sources consulted:
  - `/supabase/postgrest-js` — PGRST116, single() vs maybeSingle() semantics
  - `/trpc/trpc` — TRPCClientError.data.code shape

---

**Code review complete.**

The fix is correct in its diagnosis and primary mechanism. The main concern is that
exponential backoff for transient errors is silently inoperative due to a `setInterval`
closure issue, and the sibling `verifyCourseAccess` function partially re-introduces the
bug on the course-lookup leg of the same query. Neither is a blocker for the current
release, but both should be tracked as immediate follow-up work.
