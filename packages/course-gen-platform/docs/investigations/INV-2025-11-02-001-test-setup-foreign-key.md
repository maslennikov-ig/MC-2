---
report_type: investigation
generated: 2025-11-02T18:35:00Z
investigation_id: INV-2025-11-02-001
status: complete
agent: problem-investigator
duration: ~45 minutes
---

# Investigation Report: Test Setup Foreign Key Constraint Violation

**Investigation ID**: INV-2025-11-02-001
**Generated**: 2025-11-02T18:35:00Z
**Status**: ✅ Complete
**Duration**: ~45 minutes

---

## Executive Summary

All 20 contract tests are failing during `beforeAll()` setup with a foreign key constraint violation when attempting to create test courses. The root cause is a logic flaw in `createAuthUser()` that skips user creation when auth users already exist from previous test runs, leaving `public.users` entries missing after cleanup.

**Root Cause**: `createAuthUser()` function skips creation when auth user already exists with correct ID, preventing `handle_new_user()` trigger from creating `public.users` entries needed for foreign key references.

**Recommended Solution**: Always ensure `public.users` entries exist using upsert, regardless of whether auth user already exists or needs creation.

### Key Findings

- **Finding 1**: Auth users persist in `auth.users` table across test runs (deleted only in `afterAll`)
- **Finding 2**: `cleanupTestFixtures()` deletes `public.users` but not `auth.users`, creating state mismatch
- **Finding 3**: `createAuthUser()` early-returns when auth user exists, bypassing trigger that creates `public.users`

---

## Problem Statement

### Observed Behavior

All 20 contract tests are SKIPPED due to `beforeAll()` setup failure:

```
Error: Failed to create course Test Course 1 - Introduction to Testing:
insert or update on table "courses" violates foreign key constraint "courses_user_id_fkey"
```

Test output shows:
```
Setting up analysis contract tests...
Tearing down analysis contract tests...
Deleted auth user: test-student@megacampus.com
Deleted auth user: test-instructor2@megacampus.com
Deleted auth user: test-instructor1@megacampus.com
```

Teardown runs immediately after setup message, indicating `beforeAll()` failure.

### Expected Behavior

`setupTestFixtures()` should:
1. Create organizations
2. Create auth users (or detect existing)
3. Ensure `public.users` entries exist with correct organization/role
4. Create courses successfully

Tests should run with 20/20 test cases executed.

### Impact

- **Complete test suite failure**: 0/20 tests run (all skipped)
- **Previous session fixes unvalidated**: Auth setup changes from CONTINUE-NEXT-SESSION.md cannot be tested
- **CI/CD blocked**: Cannot validate Stage 4 analysis endpoints

### Environmental Context

- **Environment**: Local development
- **Related Changes**: Auth setup refactored in previous session (tests/fixtures/index.ts)
- **First Observed**: Current session (tests were passing 13/20 in previous session)
- **Frequency**: 100% reproducible after test cleanup

---

## Investigation Process

### Initial Hypotheses

1. **Hypothesis 1**: Auth users are not being created in setup
   - **Likelihood**: High (based on user's initial analysis)
   - **Test Plan**: Check for "Created auth user" console output
   - **Result**: ❌ INCORRECT - Auth users ARE being created (verified in logs and database)

2. **Hypothesis 2**: Race condition between trigger and course creation
   - **Likelihood**: Medium
   - **Test Plan**: Check timing of operations
   - **Result**: ❌ INCORRECT - No async race condition identified

3. **Hypothesis 3**: Auth users exist from previous run, preventing trigger execution ⭐ CORRECT
   - **Likelihood**: Low initially, then High
   - **Test Plan**: Check database state, trace `createAuthUser()` logic
   - **Result**: ✅ CONFIRMED - This is the root cause

### Files Examined

- `tests/contract/analysis.test.ts` - Test suite with `beforeAll()` calling cleanup then setup
- `tests/fixtures/index.ts:174-208` - `createAuthUser()` function with early-return logic
- `tests/fixtures/index.ts:229-356` - `setupTestFixtures()` orchestration
- `tests/fixtures/index.ts:368-403` - `cleanupTestFixtures()` deletion order
- `docs/SUPABASE-DATABASE-REFERENCE.md` - `handle_new_user()` trigger documentation

### Commands Executed

```bash
# Verified auth users exist in database
mcp__supabase__execute_sql: SELECT id, email FROM auth.users WHERE email LIKE 'test-%'
# Result: 3 auth users exist (instructor1, instructor2, student)

# Verified public.users entries exist
mcp__supabase__execute_sql: SELECT id, email FROM public.users WHERE email LIKE 'test-%'
# Result: 4 public.users exist (admin, instructor1, instructor2, student)

# Verified courses exist from previous run
mcp__supabase__execute_sql: SELECT id, title, user_id FROM courses WHERE title LIKE 'Test Course%'
# Result: 24 test courses exist, including fixture courses

# Ran tests to confirm failure
pnpm test tests/contract/analysis.test.ts
# Result: beforeAll() fails, all 20 tests skipped
```

### Data Collected

**Database State (before test run)**:
- `auth.users`: 3 test users exist with correct IDs
- `public.users`: 4 test users exist with correct organization/role
- `courses`: TEST_COURSES fixture courses exist

**Test Execution Flow**:
```
1. beforeAll() starts
2. cleanupTestFixtures() - Deletes public.users entries (SUCCESS)
3. setupTestFixtures() starts
4.   createAuthUser('test-instructor1@megacampus.com', ...)
5.     → Auth user EXISTS with correct ID
6.     → Early return (line 189-191)
7.     → handle_new_user() trigger DOES NOT FIRE
8.   UPDATE public.users WHERE id = '...' (line 286-292)
9.     → Updates 0 rows (user doesn't exist)
10.     → No error thrown
11.  Create courses with user_id foreign key
12.    → FAILS: user_id references non-existent public.users entry
```

---

## Root Cause Analysis

### Primary Root Cause

The `createAuthUser()` function has a logic flaw that causes state desynchronization between `auth.users` and `public.users` tables across test runs.

**Code Location**: `tests/fixtures/index.ts:188-191`

```typescript
if (existingUser) {
  // If user exists with wrong ID, delete and recreate
  if (existingUser.id !== userId) {
    console.log(`Deleting auth user ${email} with mismatched ID`);
    await supabase.auth.admin.deleteUser(existingUser.id);
  } else {
    // User exists with correct ID, skip creation
    return;  // ← ROOT CAUSE: Early return prevents trigger execution
  }
}
```

**Evidence**:
1. Test output shows no "Created auth user" messages for existing users
2. Database query confirms auth users exist in `auth.users` table
3. `cleanupTestFixtures()` deletes `public.users` but NOT `auth.users` (lines 382-388)
4. `UPDATE` statement at line 286-292 succeeds but affects 0 rows (no error thrown)
5. Course creation fails immediately after setup attempt

**Mechanism of Failure**:

```
Test Run N (Initial)
├─ beforeAll()
│  ├─ cleanupTestFixtures() → No users exist yet
│  └─ setupTestFixtures()
│     ├─ createAuthUser() → Creates auth user
│     ├─ handle_new_user() trigger → Creates public.users entry
│     ├─ UPDATE public.users → Updates org/role
│     └─ Create courses → SUCCESS
├─ Tests run (or some pass)
└─ afterAll() → Deletes auth.users (sometimes doesn't run if interrupted)

Test Run N+1 (After Interrupt/Failure)
├─ beforeAll()
│  ├─ cleanupTestFixtures()
│  │  ├─ DELETE FROM courses ✓
│  │  ├─ DELETE FROM public.users ✓
│  │  └─ DELETE FROM auth.users ✗ (NOT IN cleanupTestFixtures!)
│  └─ setupTestFixtures()
│     ├─ createAuthUser()
│     │  └─ Auth user EXISTS → Early return (NO trigger fires)
│     ├─ UPDATE public.users → Affects 0 rows (no error)
│     └─ Create courses → FAILS (foreign key violation)
└─ FAILURE → Tests skipped
```

### Contributing Factors

1. **Asymmetric Cleanup**: `cleanupTestFixtures()` cleans `public.users` but not `auth.users`
   - `auth.users` cleanup only happens in test-specific `afterAll()` (analysis.test.ts:333-353)
   - If test run is interrupted, auth users persist indefinitely

2. **Silent UPDATE Failure**: UPDATE statement (line 286-292) doesn't check affected row count
   - `UPDATE ... WHERE id = 'non-existent'` succeeds with no error
   - No validation that user entry was actually updated

3. **Implicit Dependency on Trigger**: Code assumes `handle_new_user()` trigger creates `public.users`
   - If trigger doesn't fire (auth user already exists), no fallback mechanism
   - No explicit upsert for `public.users` entries for auth-enabled users

---

## Proposed Solutions

### Solution 1: Explicit Upsert for public.users ⭐ RECOMMENDED

**Description**: Always upsert `public.users` entries regardless of auth user creation status.

**Why This Addresses Root Cause**: Removes dependency on `handle_new_user()` trigger firing, ensuring `public.users` entries exist even when auth users are reused.

**Implementation Steps**:

**File**: `tests/fixtures/index.ts`

**Change 1 - Modify setupTestFixtures() auth user flow (lines 276-298)**:
```typescript
// 2. Create auth users FIRST (if needed)
// The handle_new_user() trigger will automatically create public.users entries
// BUT we explicitly upsert to ensure entries exist even if auth user already exists
if (!options.skipAuthUsers) {
  for (const authUser of Object.values(TEST_AUTH_USERS)) {
    await createAuthUser(authUser.email, authUser.password, authUser.id);
  }

  // 3. Explicitly upsert public.users entries (don't rely solely on trigger)
  for (const user of Object.values(TEST_USERS)) {
    // Skip admin user (no auth account)
    if (user.role === 'admin') continue;

    const { error } = await supabase
      .from('users')
      .upsert({  // ← Changed from UPDATE to UPSERT
        id: user.id,
        email: user.email,
        organization_id: user.organizationId,
        role: user.role,
      }, { onConflict: 'id' });

    if (error) {
      throw new Error(`Failed to upsert user ${user.email}: ${error.message}`);
    }
  }
}
```

**Files to Modify**:
- `tests/fixtures/index.ts` - Lines 281-297 (change UPDATE to UPSERT)

**Testing Strategy**:
1. Run tests fresh (no existing auth users) → Should pass
2. Interrupt test run (leave auth users in DB)
3. Run tests again → Should pass (verifies fix)
4. Check console output for "Created auth user" messages
5. Verify all 20 tests execute (not skipped)

**Pros**:
- ✅ Minimal code change (UPDATE → UPSERT)
- ✅ Idempotent (safe to run multiple times)
- ✅ No reliance on trigger execution
- ✅ Works regardless of auth user state

**Cons**:
- ❌ Slightly redundant (creates entry twice if trigger fires)

**Complexity**: Low

**Risk Level**: Low

**Estimated Effort**: 5 minutes

---

### Solution 2: Delete Auth Users in cleanupTestFixtures()

**Description**: Move auth user deletion from test-specific `afterAll()` to shared `cleanupTestFixtures()`.

**Why This Addresses Root Cause**: Ensures auth users are always cleaned up symmetrically with public.users, preventing state mismatch.

**Implementation Steps**:

**File**: `tests/fixtures/index.ts`

**Change 1 - Add auth cleanup to cleanupTestFixtures() (lines 368-403)**:
```typescript
export async function cleanupTestFixtures(): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Delete in reverse order (respect foreign keys):
  // job_status → courses → users → organizations → auth.users

  // 1. Delete courses (depends on users and organizations)
  const courseIds = Object.values(TEST_COURSES).map(c => c.id);
  const { error: coursesError } = await supabase.from('courses').delete().in('id', courseIds);

  if (coursesError) {
    console.error('Failed to cleanup courses:', coursesError.message);
  }

  // 2. Delete users (depends on organizations)
  const userIds = Object.values(TEST_USERS).map(u => u.id);
  const { error: usersError } = await supabase.from('users').delete().in('id', userIds);

  if (usersError) {
    console.error('Failed to cleanup users:', usersError.message);
  }

  // 3. Delete organizations (no dependencies)
  const orgIds = Object.values(TEST_ORGS)
    .filter(o => o.id !== TEST_ORGS.premium.id)
    .map(o => o.id);

  if (orgIds.length > 0) {
    const { error: orgsError } = await supabase.from('organizations').delete().in('id', orgIds);

    if (orgsError) {
      console.error('Failed to cleanup organizations:', orgsError.message);
    }
  }

  // 4. Delete auth users (NEW)
  try {
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const testEmails = Object.values(TEST_USERS)
      .filter(u => u.role !== 'admin')
      .map(u => u.email);

    for (const user of users) {
      if (user.email && testEmails.includes(user.email)) {
        await supabase.auth.admin.deleteUser(user.id);
        console.log(`Deleted auth user: ${user.email}`);
      }
    }
  } catch (error) {
    console.warn('Warning: Could not cleanup auth users:', error);
  }
}
```

**Change 2 - Remove auth cleanup from analysis.test.ts afterAll (lines 333-353)**:
```typescript
afterAll(async () => {
  console.log('Tearing down analysis contract tests...');

  // Stop worker BEFORE server
  if (worker) {
    console.log('Stopping BullMQ worker...');
    await stopWorker(false);
    await closeQueue();
  }

  // Stop server
  if (testServer) {
    await stopTestServer(testServer);
  }

  // Cleanup test fixtures (now includes auth users)
  await cleanupTestFixtures();

  // No longer need manual auth cleanup here
}, 15000);
```

**Files to Modify**:
- `tests/fixtures/index.ts` - Add auth cleanup to cleanupTestFixtures()
- `tests/contract/analysis.test.ts` - Remove duplicate auth cleanup

**Testing Strategy**:
1. Run tests → Should pass
2. Interrupt midway
3. Check database → Auth users should be gone
4. Run tests again → Should pass

**Pros**:
- ✅ Symmetric cleanup (prevents future state issues)
- ✅ Removes code duplication
- ✅ Makes cleanupTestFixtures() truly comprehensive

**Cons**:
- ❌ More invasive change
- ❌ Still has race condition if auth user creation is skipped

**Complexity**: Medium

**Risk Level**: Low

**Estimated Effort**: 10 minutes

---

### Solution 3: Force Recreate Auth Users (Aggressive)

**Description**: Always delete existing auth user and recreate, even if ID matches.

**Implementation Steps**:

**File**: `tests/fixtures/index.ts:183-192`

```typescript
if (existingUser) {
  // Always delete and recreate to ensure trigger fires
  console.log(`Deleting existing auth user ${email} to force trigger`);
  await supabase.auth.admin.deleteUser(existingUser.id);
  // Fall through to creation
}

// Create auth user with specific ID and auto-confirmed email
const { data, error } = await supabase.auth.admin.createUser({
  id: userId,
  email,
  password,
  email_confirm: true,
  user_metadata: {},
});
```

**Files to Modify**:
- `tests/fixtures/index.ts` - Lines 183-192

**Pros**:
- ✅ Guarantees trigger fires
- ✅ Simple logic

**Cons**:
- ❌ Wasteful (deletes and recreates unnecessarily)
- ❌ Slower test setup
- ❌ Potential Supabase rate limiting issues

**Complexity**: Low

**Risk Level**: Medium (potential rate limiting)

**Estimated Effort**: 3 minutes

---

## Implementation Guidance

### For Implementation Agent

**Priority**: Critical (blocks all test execution)

**Files Requiring Changes**:
1. `tests/fixtures/index.ts`
   - **Line Range**: 281-297
   - **Change Type**: Modify (UPDATE → UPSERT)
   - **Purpose**: Ensure public.users entries exist regardless of auth user state

**Validation Criteria**:
- ✅ Tests run without beforeAll() failure - Verify no "Failed to create course" error
- ✅ All 20 tests execute (not skipped) - Check test output shows 20 tests run
- ✅ Both fresh and rerun scenarios work - Test with and without existing auth users
- ✅ Console shows appropriate "Created auth user" or "Auth user exists" messages

**Testing Requirements**:
- **Scenario 1 - Fresh start**:
  ```bash
  # Clean database completely
  pnpm test tests/contract/analysis.test.ts
  # Expected: Tests run, may pass or fail on assertions but NOT on setup
  ```

- **Scenario 2 - Existing auth users**:
  ```bash
  # Run tests, interrupt with Ctrl+C during execution
  pnpm test tests/contract/analysis.test.ts
  # Press Ctrl+C after "Setting up..." message

  # Run again
  pnpm test tests/contract/analysis.test.ts
  # Expected: Tests still run (not skipped due to beforeAll failure)
  ```

- **Scenario 3 - Verify database state**:
  ```sql
  -- After setup, verify users exist
  SELECT id, email FROM public.users WHERE email LIKE 'test-%';
  -- Expected: 4 rows (admin, instructor1, instructor2, student)

  SELECT id, email FROM auth.users WHERE email LIKE 'test-%';
  -- Expected: 3 rows (instructor1, instructor2, student - no admin)
  ```

**Dependencies**:
- None (isolated test fixture change)

---

## Risks and Considerations

### Implementation Risks

- **Risk 1**: Upsert might conflict with trigger-created entries
  - **Mitigation**: Upsert with `onConflict: 'id'` handles this gracefully

- **Risk 2**: Timing issues if trigger is slow
  - **Mitigation**: Upsert happens after all createAuthUser() calls complete

### Performance Impact

Minimal - One additional upsert per test user (3 users) adds ~50ms to setup.

### Breaking Changes

None - This is a test infrastructure fix, no production code changes.

### Side Effects

Positive: Makes test setup more resilient to interrupted runs and state inconsistencies.

---

## Execution Flow Diagram

### Current (Broken) Flow

```
beforeAll()
  ↓
cleanupTestFixtures()
  ├─ DELETE courses ✓
  ├─ DELETE public.users ✓  (users removed)
  └─ (auth.users NOT deleted)
  ↓
setupTestFixtures()
  ├─ Create organizations ✓
  ├─ createAuthUser('test-instructor1@...')
  │  ├─ Check if exists → YES (from previous run)
  │  └─ RETURN EARLY ← handle_new_user() NOT FIRED
  ├─ UPDATE public.users WHERE id='...'
  │  └─ Affects 0 rows (no error thrown)
  ├─ Create courses
  │  └─ ❌ FAIL: user_id foreign key violation
  └─ ABORT
  ↓
afterAll() runs due to failure
  ↓
Tests SKIPPED (20/20)
```

**Divergence Point**: `createAuthUser()` line 189-191 - Early return when auth user exists

---

### Fixed Flow (Solution 1)

```
beforeAll()
  ↓
cleanupTestFixtures()
  ├─ DELETE courses ✓
  ├─ DELETE public.users ✓
  └─ (auth.users NOT deleted)
  ↓
setupTestFixtures()
  ├─ Create organizations ✓
  ├─ createAuthUser('test-instructor1@...')
  │  ├─ Check if exists → YES
  │  └─ RETURN EARLY (trigger doesn't fire - OK)
  ├─ UPSERT public.users (NEW!)
  │  └─ Creates entry even if doesn't exist
  ├─ Create courses
  │  └─ ✅ SUCCESS (user_id references valid entry)
  └─ COMPLETE
  ↓
Tests RUN (20/20)
```

**Fix Location**: Line 286 - Change UPDATE to UPSERT with full user data

---

## Additional Context

### Related Issues

- Original auth setup refactor in previous session (CONTINUE-NEXT-SESSION.md:220-226)
- Tests were passing 13/20 in previous session before this regression

### Documentation References

**From Supabase Database Reference** (`docs/SUPABASE-DATABASE-REFERENCE.md`):

> **Function:** `handle_new_user()`
> **Trigger:** `on_auth_user_created` ON `auth.users` AFTER INSERT
> **Purpose:** Auto-create `public.users` record on signup
>
> **Logic:**
> 1. Get/create "Default Organization"
> 2. Insert into `public.users`:
>    - `id` = NEW.id (from auth.users)
>    - `email` = NEW.email
>    - `organization_id` = default_org_id
>    - `role` = COALESCE(NEW.raw_user_meta_data->>'role', 'student')

**Key Insight**: Trigger only fires on INSERT, not on UPDATE or when auth user already exists.

### MCP Server Usage

**Supabase MCP**:
- Database queries run: 3
- Schema insights: Verified foreign key constraint courses_user_id_fkey exists
- Key queries:
  - `SELECT * FROM auth.users WHERE email LIKE 'test-%'` → 3 users exist
  - `SELECT * FROM public.users WHERE email LIKE 'test-%'` → 4 users exist
  - `SELECT * FROM courses WHERE title LIKE 'Test Course%'` → 24 courses exist (from previous runs)

---

## Next Steps

### For Orchestrator/User

1. **Review this investigation report**
2. **Select solution approach** (Recommended: Solution 1 - Explicit Upsert)
3. **Implement fix** (or delegate to implementation agent):
   - Change UPDATE to UPSERT in tests/fixtures/index.ts:286
   - Add full user data to upsert operation
4. **Validation**: Run tests to verify:
   - Fresh start scenario works
   - Rerun after interrupt scenario works
   - All 20 tests execute (not skipped)

### Follow-Up Recommendations

1. **Add validation to createAuthUser()**: Log when skipping creation
2. **Add row count check to upsert**: Verify operation affected rows
3. **Consider Solution 2 for long-term**: Move auth cleanup to cleanupTestFixtures() for symmetry
4. **Document test isolation requirements**: Add comment explaining why upsert is needed

---

## Investigation Log

### Timeline

- **2025-11-02 17:50**: Investigation started
- **2025-11-02 18:00**: Initial hypothesis formed (auth users not created)
- **2025-11-02 18:10**: Hypothesis disproven via database queries
- **2025-11-02 18:15**: Test execution traced, discovered early-return logic
- **2025-11-02 18:20**: Root cause identified (skipped auth creation prevents trigger)
- **2025-11-02 18:25**: Solutions formulated (upsert vs symmetric cleanup)
- **2025-11-02 18:35**: Report generated

### Commands Run

```bash
# Find auth user creation function
grep -n "createAuthUser" tests/fixtures/index.ts

# Check test setup sequence
grep -n "beforeAll" tests/contract/analysis.test.ts

# Run tests to see failure
pnpm test tests/contract/analysis.test.ts

# Check database state
mcp__supabase__execute_sql: SELECT * FROM auth.users WHERE email LIKE 'test-%'
mcp__supabase__execute_sql: SELECT * FROM public.users WHERE email LIKE 'test-%'
mcp__supabase__execute_sql: SELECT * FROM courses WHERE title LIKE 'Test Course%'
```

### MCP Calls Made

1. `mcp__supabase__execute_sql` - Check auth.users table (3 calls)
2. `mcp__supabase__execute_sql` - Check public.users table (2 calls)
3. `mcp__supabase__execute_sql` - Check courses table (1 call)

---

**Investigation Complete**

✅ Root cause identified with supporting evidence
✅ Multiple solution approaches proposed with trade-offs
✅ Implementation guidance provided with validation criteria
✅ Ready for implementation phase

**Report saved**: `docs/investigations/INV-2025-11-02-001-test-setup-foreign-key.md`
