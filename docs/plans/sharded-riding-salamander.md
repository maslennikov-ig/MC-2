# Fix: Contract tests failing in CI — analysis.test.ts

## Context

CI contract tests (`pnpm test:contract`) fail with 3 test failures in `tests/contract/analysis.test.ts`. All 3 failing tests call `analysis.start.mutate()` which internally calls `addJob()` from BullMQ queue — this requires Redis, which is unavailable in CI for contract tests.

**Error:** `TRPCClientError: Failed to start analysis`

**Failing tests:**

1. `should accept valid courseId and return jobId` (line 322)
2. `should reject if analysis already in progress without forceRestart` (line 431)
3. `should use default value for forceRestart if not provided` (line 862)

**Root cause chain:**

```
analysis.start.mutate() → analysis.ts:451 addJob() → queue.ts:104 getQueue() → getRedisClient() → REDIS_URL not set → Error → caught at analysis.ts:472 → rethrown as "Failed to start analysis"
```

The test file comment (line 257-259) explicitly states: _"BullMQ worker is NOT started for contract tests. Contract tests verify API contracts, not job processing."_ — but `addJob()` is never mocked, so it still tries to connect to Redis.

## Fix

Mock `addJob` and `closeQueue` from `../../src/orchestrator/queue` in the test file using `vi.mock()`.

### File: `packages/course-gen-platform/tests/contract/analysis.test.ts`

Add mock after imports (before any other code), around line 43:

```typescript
import { vi } from 'vitest';

// Mock BullMQ queue — contract tests verify API contracts, not job processing
vi.mock('../../src/orchestrator/queue', () => ({
  addJob: vi.fn().mockResolvedValue({ id: 'mock-job-id' }),
  closeQueue: vi.fn().mockResolvedValue(undefined),
  QUEUE_NAME: 'test-queue',
}));
```

Also add `vi` to the existing vitest import on line 23:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
```

And remove the now-unnecessary `closeQueue` import on line 41:

```typescript
// DELETE: import { closeQueue } from '../../src/orchestrator/queue';
```

**Why this works:**

- `addJob` returns `{ id: 'mock-job-id' }` — router extracts `job.id` and returns `{ jobId: 'mock-job-id', status: 'started' }`
- `closeQueue` is a no-op — no Redis connection to close
- All Supabase operations (course lookup, status update, document fetch) still run against real DB
- Tests that expect errors before `addJob()` is reached (invalid UUID, not found, unauthorized) are unaffected

### Test behavior after fix:

| Test                                            | Flow                                                                                | Expected |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- | -------- |
| `should accept valid courseId and return jobId` | Full flow → mock addJob → `{ jobId: 'mock-job-id', status: 'started' }`             | PASS     |
| `should reject if analysis already in progress` | 1st call succeeds (status → stage_4_init), 2nd call sees stage_4_init → BAD_REQUEST | PASS     |
| `should use default value for forceRestart`     | Full flow → mock addJob → success                                                   | PASS     |

## Verification

```bash
# 1. Run contract tests locally
cd packages/course-gen-platform
npx vitest run --config vitest.config.contract.ts tests/contract/analysis.test.ts

# 2. Run all contract tests to ensure no regressions
npx vitest run --config vitest.config.contract.ts

# 3. Run unit tests
pnpm --filter course-gen-platform test

# 4. Type check
pnpm type-check
```
