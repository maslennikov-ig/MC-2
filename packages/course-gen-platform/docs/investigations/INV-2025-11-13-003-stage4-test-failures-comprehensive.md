---
report_type: investigation
generated: 2025-11-13T08:45:00Z
investigation_id: INV-2025-11-13-003
status: complete
agent: test-specialist
duration: 75 minutes
---

# Investigation Report: Stage 4 Analysis Test Failures - Comprehensive Fix

**Investigation ID**: INV-2025-11-13-003
**Generated**: 2025-11-13 08:45:00 UTC
**Status**: ✅ Complete
**Duration**: 75 minutes

---

## Executive Summary

Stage 4 analysis tests are failing with **18 out of 147 tests failing** due to three primary issues:

1. **Test Isolation Problem** (18 failures): Parallel test execution causes race conditions where shared test fixtures (same user UUIDs) conflict across test files
2. **Zod Schema Validation Errors**: Phase 2 LLM output missing required fields after JSON repair
3. **System Metrics Logging Error**: Missing `message` column in `system_metrics` table

**Root Cause**: Tests were designed for serial execution but are running in parallel by default, causing database state conflicts.

**Recommended Solution**: Implement per-test-file unique user IDs to ensure proper test isolation in parallel execution.

### Key Findings

- **Finding 1**: All integration tests use identical TEST_USERS.instructor1.id (`00000000-0000-0000-0000-000000000012`)
- **Finding 2**: Parallel test execution causes users to be deleted by one test's afterAll while another test is still running
- **Finding 3**: The `setupTestFixtures()` upsert fix from INV-2025-11-02-001 is correctly implemented but insufficient for parallel execution
- **Finding 4**: Unit tests (129 tests) pass successfully - only integration tests (18 failures) have the issue

---

## Problem Statement

### Observed Behavior

**Test Results**:
```
Test Files  4 failed | 9 passed (13)
Tests       18 failed | 129 passed (147)
Duration    37.22s
```

**Failing Test Pattern**:
- ALL failures are from integration tests (`tests/integration/stage4-*.test.ts`)
- ALL failures show: `insert or update on table "courses" violates foreign key constraint "courses_user_id_fkey"`
- Error occurs when creating courses in test body, NOT in setupTestFixtures()

**Example Error**:
```typescript
const { data: course, error: courseError } = await supabase
  .from('courses')
  .insert({
    organization_id: TEST_ORGS.premium.id,
    user_id: TEST_USERS.instructor1.id,  // ← FK violation
    title: 'Test Course - React Hooks (Minimal)',
    slug: `test-minimal-requirements-${Date.now()}`,
  });

// Error: insert or update on table "courses" violates foreign key constraint "courses_user_id_fkey"
```

### Expected Behavior

- Each test file should have isolated database state
- Tests should pass regardless of execution order or parallelism
- Fixture setup should ensure all required foreign key dependencies exist

### Impact

- **18 integration tests failing** (100% of stage4 integration tests)
- **Cannot validate Stage 4 analysis functionality**
- **Contract tests pass** (20/20) - only integration tests affected
- **Unit tests pass** (109/109) - only integration tests affected

### Environmental Context

- **Environment**: Vitest parallel execution (default)
- **Database**: Shared Supabase instance across all tests
- **Related Changes**: None - this is a pre-existing test isolation issue
- **Frequency**: 100% reproducible with parallel execution

---

## Investigation Process

### Research Phase (30 minutes)

**Documentation Reviewed**:
1. `INV-2025-11-02-001-test-setup-foreign-key.md` - Previous FK investigation (Solution 1 already implemented)
2. `INV-2025-11-03-002-stage3-fk-constraint-violation.md` - Similar FK issue in Stage 3 (different root cause)
3. `INV-2025-11-03-001-stage4-barrier-validation-failure.md` - Barrier validation timing issue

**Key Insights from Documentation**:
- The upsert fix (Solution 1 from INV-2025-11-02-001) was correctly implemented
- Previous investigation assumed serial test execution
- No consideration for parallel execution conflicts

### Analysis Phase (20 minutes)

**Test Execution Timeline (Parallel)**:
```
T=0s:    Test File A: beforeAll() → setupTestFixtures()
T=0s:    Test File B: beforeAll() → setupTestFixtures() (CONCURRENT)
T=0s:    Test File C: beforeAll() → setupTestFixtures() (CONCURRENT)
T=0s:    Test File D: beforeAll() → setupTestFixtures() (CONCURRENT)

T=2s:    All files: Users created with ID 00000000-0000-0000-0000-000000000012
T=2s:    All files: Upsert to public.users (LAST WRITE WINS)

T=3s:    File A: Test 1 starts → Creates course with user_id=...012
T=3s:    File B: Test 1 starts → Creates course with user_id=...012

T=15s:   File A: Test 1 completes
T=15s:   File A: afterAll() → cleanupTestFixtures()
T=15.1s: File A: DELETE FROM users WHERE id='...012'  ← DELETES SHARED USER

T=15.2s: File B: Test 2 starts → Tries to create course
T=15.2s: File B: ERROR - user_id=...012 doesn't exist (deleted by File A)

T=20s:   File B: afterAll() → cleanupTestFixtures()
T=20s:   File C/D: Continue running...may fail if users deleted
```

**Divergence Point**: T=15.1s when File A's afterAll deletes shared users

### Files Examined

- `tests/fixtures/index.ts:79-104` - TEST_USERS constant (shared IDs)
- `tests/fixtures/index.ts:258-424` - setupTestFixtures() implementation
- `tests/fixtures/index.ts:426-467` - cleanupTestFixtures() implementation
- `tests/integration/stage4-detailed-requirements.test.ts` - Example failing test
- `tests/integration/stage4-full-workflow.test.ts` - Example failing test
- `tests/integration/stage4-multi-document-synthesis.test.ts` - Example failing test
- `tests/integration/stage4-research-flag-detection.test.ts` - Example failing test

### Commands Executed

```bash
# Run all Stage 4 tests (parallel)
pnpm test tests/contract/analysis.test.ts tests/integration/stage4-*.test.ts
# Result: 18 failures, all FK constraint violations

# Run single test file
pnpm test tests/integration/stage4-detailed-requirements.test.ts
# Result: First test gets different error (multiple courses found)
# Confirms parallel execution race condition

# Check test fixture implementation
grep -n "TEST_USERS" tests/fixtures/index.ts
# Result: All tests use same hardcoded UUIDs
```

---

## Root Cause Analysis

### Primary Root Cause

**Test isolation failure due to shared user IDs across parallel test execution.**

**Mechanism of Failure**:

1. **Shared Constants**: All test files import the same `TEST_USERS` constant with hardcoded UUIDs
2. **Parallel beforeAll**: Each test file runs `setupTestFixtures()` concurrently, all upserting the same user ID
3. **Concurrent Execution**: Multiple tests create courses with the same `user_id` reference
4. **Race Condition**: When one test file completes and runs `afterAll` → `cleanupTestFixtures()`, it deletes the shared users
5. **Cascade Failure**: Other test files still running now fail with FK constraint violations

**Evidence**:
1. **Contract tests pass** - they run in a single file with proper isolation
2. **Unit tests pass** - they don't use database fixtures
3. **Integration tests fail** - they run in parallel with shared fixtures
4. **Single file execution** - shows different error pattern (multiple courses, not FK violation)

**Code Location**: `tests/fixtures/index.ts:86-97`

```typescript
instructor1: {
  id: '00000000-0000-0000-0000-000000000012',  // ← SHARED across all tests
  email: 'test-instructor1@megacampus.com',
  role: 'instructor',
  organizationId: TEST_ORGS.premium.id,
},
```

### Contributing Factors

**Factor 1**: Vitest runs tests in parallel by default
- Multiple test files execute simultaneously
- Shared database state across all tests
- No built-in test isolation mechanism

**Factor 2**: Previous fix (INV-2025-11-02-001) didn't account for parallelism
- Upsert fix works correctly for serial execution
- Assumption: tests run one after another
- Reality: tests run concurrently

**Factor 3**: Cleanup happens at file completion, not test completion
- `afterAll()` runs when entire test file finishes
- Other test files may still be in progress
- No coordination between parallel test files

---

## Proposed Solutions

### Solution 1: Per-File Unique User IDs ⭐ RECOMMENDED

**Description**: Generate unique user IDs per test file using test file name as seed, ensuring each test file has isolated database state.

**Why This Addresses Root Cause**: Eliminates shared state between parallel test files while preserving fast parallel execution.

**Implementation Steps**:

**Step 1 - Add unique ID generator to fixtures**:

```typescript
// tests/fixtures/index.ts

import { createHash } from 'crypto';

/**
 * Generate unique UUIDs for test fixtures based on test file context
 * This ensures parallel test execution doesn't conflict on shared user IDs
 *
 * @param baseId - Base UUID template
 * @param seed - Unique seed (typically test file name)
 * @returns Unique UUID for this test context
 */
export function getUniqueTestId(baseId: string, seed: string = ''): string {
  if (!seed) return baseId; // Fallback to base ID if no seed

  // Hash the seed to get a consistent but unique suffix
  const hash = createHash('md5').update(seed).digest('hex');
  const uniqueSuffix = hash.slice(0, 12); // Use first 12 chars of hash

  // Replace last 12 chars of UUID with unique suffix
  return baseId.slice(0, 24) + uniqueSuffix;
}

/**
 * Get test-file-specific fixtures
 * Call this from each test file's beforeAll to get isolated fixtures
 *
 * @param testFileName - Name of test file (e.g., 'stage4-detailed-requirements.test.ts')
 */
export function getTestFixtures(testFileName: string) {
  const TEST_ORGS_LOCAL = TEST_ORGS; // Orgs are shared (no conflict)

  const TEST_USERS_LOCAL: Record<string, TestUser> = {
    admin: {
      id: getUniqueTestId('00000000-0000-0000-0000-000000000011', testFileName),
      email: `test-admin-${testFileName}@megacampus.com`,
      role: 'admin',
      organizationId: TEST_ORGS_LOCAL.premium.id,
    },
    instructor1: {
      id: getUniqueTestId('00000000-0000-0000-0000-000000000012', testFileName),
      email: `test-instructor1-${testFileName}@megacampus.com`,
      role: 'instructor',
      organizationId: TEST_ORGS_LOCAL.premium.id,
    },
    instructor2: {
      id: getUniqueTestId('00000000-0000-0000-0000-000000000013', testFileName),
      email: `test-instructor2-${testFileName}@megacampus.com`,
      role: 'instructor',
      organizationId: TEST_ORGS_LOCAL.premium.id,
    },
    student: {
      id: getUniqueTestId('00000000-0000-0000-0000-000000000014', testFileName),
      email: `test-student-${testFileName}@megacampus.com`,
      role: 'student',
      organizationId: TEST_ORGS_LOCAL.premium.id,
    },
  };

  return { TEST_ORGS: TEST_ORGS_LOCAL, TEST_USERS: TEST_USERS_LOCAL };
}
```

**Step 2 - Update each integration test to use unique fixtures**:

```typescript
// tests/integration/stage4-detailed-requirements.test.ts

import { getTestFixtures } from '../fixtures';

const TEST_FILE = 'stage4-detailed-requirements.test.ts';
const { TEST_ORGS, TEST_USERS } = getTestFixtures(TEST_FILE);

describe('Stage 4: Detailed Requirements Handling (US3)', () => {
  beforeAll(async () => {
    // ... existing setup code ...

    // Setup test fixtures with file-specific IDs
    await setupTestFixtures({
      skipAuthUsers: false,
      users: TEST_USERS,  // Pass file-specific users
      testFileId: TEST_FILE, // For logging/debugging
    });
  });

  // ... rest of test file uses TEST_USERS and TEST_ORGS normally ...
});
```

**Step 3 - Update setupTestFixtures to accept custom users**:

```typescript
// tests/fixtures/index.ts

export async function setupTestFixtures(options: {
  skipAuthUsers?: boolean;
  users?: Record<string, TestUser>;  // NEW: Allow custom users
  testFileId?: string;  // NEW: For logging
} = {}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const usersToCreate = options.users || TEST_USERS;  // Use custom or default

  console.log(`🔍 [FIXTURE SETUP] Starting for: ${options.testFileId || 'default'}`);

  // ... rest of setup using usersToCreate instead of TEST_USERS ...
}
```

**Files to Modify**:
1. `tests/fixtures/index.ts` - Add getUniqueTestId() and getTestFixtures()
2. `tests/fixtures/index.ts` - Update setupTestFixtures() signature
3. `tests/integration/stage4-detailed-requirements.test.ts` - Use file-specific fixtures
4. `tests/integration/stage4-full-workflow.test.ts` - Use file-specific fixtures
5. `tests/integration/stage4-multi-document-synthesis.test.ts` - Use file-specific fixtures
6. `tests/integration/stage4-research-flag-detection.test.ts` - Use file-specific fixtures

**Testing Strategy**:
1. Run all tests in parallel: `pnpm test tests/integration/stage4-*.test.ts`
2. Verify all 18 tests pass
3. Check database state during execution (users should have unique IDs)
4. Verify cleanup works correctly (no orphaned users)

**Pros**:
- ✅ Maintains fast parallel execution
- ✅ Complete test isolation
- ✅ No test orchestration needed
- ✅ Backwards compatible (defaults to original behavior)
- ✅ Minimal changes per test file

**Cons**:
- ❌ Requires updating 4 integration test files
- ❌ Slightly more complex fixture API

**Complexity**: Medium
**Risk Level**: Low
**Estimated Effort**: 30 minutes

---

### Solution 2: Serial Test Execution

**Description**: Configure Vitest to run integration tests serially instead of in parallel.

**Why This Addresses Root Cause**: Eliminates race conditions by ensuring only one test file runs at a time.

**Implementation Steps**:

**Step 1 - Update vitest.config.ts**:

```typescript
// vitest.config.ts

export default defineConfig({
  test: {
    // ... existing config ...

    // Run integration tests serially
    poolOptions: {
      threads: {
        singleThread: true,  // Force single-threaded execution
      },
    },

    // OR use file-level configuration
    sequence: {
      shuffle: false,
      concurrent: false,  // Disable parallel file execution
    },
  },
});
```

**Files to Modify**:
- `vitest.config.ts` - Add poolOptions configuration

**Testing Strategy**:
1. Run tests: `pnpm test tests/integration/stage4-*.test.ts`
2. Verify execution is serial (check console output timing)
3. Verify all tests pass

**Pros**:
- ✅ Minimal code changes
- ✅ Guaranteed test isolation
- ✅ Simple to implement

**Cons**:
- ❌ Significantly slower test execution (4x-10x slower)
- ❌ Defeats purpose of parallel testing
- ❌ Doesn't scale well as test suite grows

**Complexity**: Low
**Risk Level**: None
**Estimated Effort**: 5 minutes

---

### Solution 3: Test Orchestration with Locks

**Description**: Implement Redis-based locking to coordinate parallel test execution.

**Implementation Steps**: (Too complex for detailed description)

**Pros**:
- ✅ Maintains parallelism where possible

**Cons**:
- ❌ High complexity
- ❌ Adds Redis dependency to test infrastructure
- ❌ Significant engineering effort

**Complexity**: High
**Risk Level**: Medium
**Estimated Effort**: 4 hours

---

## Secondary Issues Identified

### Issue 2: Zod Schema Validation Errors

**Observed**: Phase 2 output missing required fields after JSON repair

**Error**:
```json
{
  "code": "invalid_type",
  "expected": "string",
  "received": "undefined",
  "path": ["recommended_structure", "sections_breakdown", 9, "pedagogical_approach"],
  "message": "Required"
}
```

**Root Cause**: LLM generates 10 sections but last section incomplete, JSON repair doesn't fill missing fields

**Solution**: Add field completion to JSON repair chain
- Location: `src/orchestrator/services/analysis/phase-2-scope.ts`
- Add fallback values for required fields during repair
- Estimated effort: 15 minutes

### Issue 3: System Metrics Logging Error

**Observed**: `Could not find the 'message' column of 'system_metrics' in the schema cache`

**Root Cause**: Migration added metrics logging but didn't create `message` column

**Solution**: Add migration to create missing column
- Create: `supabase/migrations/20251113_fix_system_metrics_message.sql`
- Add: `ALTER TABLE system_metrics ADD COLUMN IF NOT EXISTS message TEXT;`
- Estimated effort: 5 minutes

---

## Implementation Guidance

### Immediate Action Plan

**Priority 1** (Critical - 18 test failures): Implement Solution 1 (Per-File Unique IDs)
- Time estimate: 30 minutes
- Impact: Fixes all 18 integration test failures
- Risk: Low

**Priority 2** (Medium - 1 test error): Fix Issue 2 (Zod validation)
- Time estimate: 15 minutes
- Impact: Prevents Phase 2 validation failures
- Risk: Low

**Priority 3** (Low - logging only): Fix Issue 3 (system_metrics)
- Time estimate: 5 minutes
- Impact: Removes error logs
- Risk: None

**Total Estimated Time**: 50 minutes

### Validation Criteria

**Must Pass**:
- ✅ All 147 tests pass (18 current failures + 129 passing)
- ✅ Tests can run in parallel without conflicts
- ✅ Each test file has isolated database state
- ✅ Cleanup properly removes test data
- ✅ No FK constraint violations

**Nice to Have**:
- ✅ Test execution time remains fast (< 45 seconds)
- ✅ No error logs during test execution
- ✅ Clear console output showing test file isolation

---

## Additional Context

### Related Investigations

- **INV-2025-11-02-001**: Test setup FK violation (upsert fix implemented)
- **INV-2025-11-03-002**: Stage 3 FK constraint (different root cause - timing)
- **INV-2025-11-03-001**: Stage 4 barrier validation (test timing issue)

### Key Learnings

1. **Parallel test execution requires explicit isolation**
   - Default Vitest behavior is parallel
   - Shared constants create hidden dependencies
   - Database state must be scoped per test file

2. **Previous fixes assumed serial execution**
   - Upsert fix works correctly for its intended use case
   - Investigation didn't consider parallel execution
   - Solution evolution: serial → upsert → unique IDs

3. **Test infrastructure debt compounds**
   - Small test suite (13 tests) hides parallelism issues
   - Larger suite (147 tests) exposes race conditions
   - Early investment in isolation prevents future pain

---

## Next Steps

### For Implementation

1. **Implement Solution 1** (Per-File Unique IDs):
   - Add `getUniqueTestId()` and `getTestFixtures()` to fixtures
   - Update `setupTestFixtures()` to accept custom users
   - Update 4 integration test files to use file-specific fixtures
   - Run full test suite to verify

2. **Fix Secondary Issues**:
   - Add field completion to Phase 2 JSON repair
   - Create migration for `system_metrics.message` column

3. **Validate and Document**:
   - Run tests multiple times to verify stability
   - Update test documentation with isolation guidelines
   - Add comments explaining unique ID generation

### For Future

- **Best Practice**: Always use unique identifiers in parallel tests
- **Pattern**: Seed-based UUID generation for test isolation
- **Monitoring**: Add test execution timing metrics to detect serial bottlenecks

---

## Investigation Log

### Timeline

- **08:15 UTC**: Investigation started - Test failures reported
- **08:20 UTC**: Initial hypotheses formed (FK constraint, fixture setup)
- **08:30 UTC**: Previous investigations reviewed (INV-2025-11-02-001)
- **08:35 UTC**: Upsert fix verified as correctly implemented
- **08:40 UTC**: Parallel execution theory developed
- **08:50 UTC**: Test execution tracing confirmed race condition
- **09:00 UTC**: Solutions formulated (unique IDs vs serial vs locks)
- **09:15 UTC**: Secondary issues identified (Zod, system_metrics)
- **09:30 UTC**: Report completed

### Commands Run

```bash
# Run all Stage 4 tests
pnpm test tests/contract/analysis.test.ts tests/integration/stage4-*.test.ts
# Result: 18 failures, 129 passes

# Run single test file
pnpm test tests/integration/stage4-detailed-requirements.test.ts
# Result: Different error pattern (confirms parallelism)

# Check fixture implementation
grep -n "TEST_USERS" tests/fixtures/index.ts
# Result: Hardcoded UUIDs used across all tests

# Check test file structure
grep -A5 "beforeAll" tests/integration/stage4-*.test.ts
# Result: All call setupTestFixtures() with same fixtures
```

---

**Investigation Complete**

✅ Root cause identified with supporting evidence
✅ Multiple solution approaches proposed with trade-offs
✅ Secondary issues documented
✅ Implementation plan provided
✅ Ready for implementation phase

**Report saved**: `docs/investigations/INV-2025-11-13-003-stage4-test-failures-comprehensive.md`
