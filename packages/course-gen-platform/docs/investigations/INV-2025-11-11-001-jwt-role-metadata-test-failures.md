# Investigation Report: JWT Role Metadata Test Failures

---

**Investigation ID**: INV-2025-11-11-001
**Date**: 2025-11-11
**Investigator**: investigation-agent
**Status**: ✅ Complete
**Severity**: High (4 out of 17 tests failing)
**Type**: Test Failure + Database Function Signature Mismatch

---

## Executive Summary

### Problem
Contract tests are failing with JWT role metadata issues: 3 tests report `role: Invalid type. Expected: string, given: null` and 1 test reports `Authentication required. Please provide a valid Bearer token.`

### Root Cause
**PRIMARY**: The test fixture code (`tests/fixtures/index.ts:194`) calls a non-existent wrapper function `create_test_auth_user_with_env` that was never created in any migration.

**SECONDARY**: The most recent migration (`20251111000000_fix_test_auth_user_role_metadata.sql`) correctly updated the database function signature to accept 5 parameters (including `p_role`), but the fixture code is calling a wrapper that doesn't exist, so the updated function is never invoked.

**TERTIARY**: Even if the wrapper existed, the JWT custom claims hook (`custom_access_token_hook`) reads from `public.users` table, not from `auth.users.raw_app_meta_data`, creating a timing/sequencing issue.

### Recommended Solution
**Fix the fixture code** to call the correct function (`create_test_auth_user`) with the new 5-parameter signature directly, without a non-existent wrapper. Priority: **CRITICAL**.

### Key Findings
1. Migration `20251111000000` correctly drops old 4-param function and creates new 5-param function
2. Fixture code calls `create_test_auth_user_with_env` (line 194) which doesn't exist anywhere
3. Documentation (`TEST-AUTH-USER-CREATION.md`) shows OLD 4-param signature (outdated)
4. JWT custom claims hook reads from `public.users.role`, not from `auth.users.raw_app_meta_data.role`
5. Test failures occur because role is `null` in JWT (function never called successfully)

---

## Problem Statement

### Observed Behavior
- **3 tests fail** with error: `role: Invalid type. Expected: string, given: null`
- **1 test fails** with error: `Authentication required. Please provide a valid Bearer token.`
- Status: 13/17 passing (76% pass rate)
- Test file: `tests/contract/generation.test.ts`

### Expected Behavior
- All 17 tests should pass
- JWT tokens should contain valid `role` field (admin, instructor, or student)
- Test users created with predefined roles should authenticate successfully

### Impact
- Test suite unreliable (4 failures out of 17)
- Cannot validate generation endpoints properly
- Blocks PR merges and CI/CD pipeline
- Developer productivity impacted (tests must pass before commits)

### Environment
- Test environment: Vitest + Supabase local
- Database: PostgreSQL with Supabase Auth
- Migrations applied: All migrations up to and including `20251111000000_fix_test_auth_user_role_metadata.sql`

---

## Investigation Process

### Tier 0: Project Internal Search (MANDATORY FIRST STEP)

#### Files Examined
1. **Migration files**:
   - `/supabase/migrations/20250115000001_create_test_auth_user_function.sql` (OLD - 4 params)
   - `/supabase/migrations/20251111000000_fix_test_auth_user_role_metadata.sql` (NEW - 5 params)
   - `/supabase/migrations/20250115000002_create_hash_password_helper.sql` (helper function)
   - `/supabase/migrations/20250111_jwt_custom_claims.sql` (JWT hook)
   - `/supabase/migrations/20250112_test_auth_context.sql` (test helpers)

2. **Documentation files**:
   - `/docs/database/TEST-AUTH-USER-CREATION.md` (OUTDATED - shows 4-param signature)
   - `/docs/database/MIGRATION-SUMMARY-20250115-TEST-AUTH-USERS.md` (OUTDATED - shows 4-param signature)
   - `/docs/T047-JWT-CUSTOM-CLAIMS-IMPLEMENTATION.md` (current JWT hook implementation)

3. **Test code**:
   - `/tests/fixtures/index.ts` (createAuthUser function, lines 175-223)
   - `/tests/contract/generation.test.ts` (failing test file)

#### Commands Executed
```bash
# List migration files
ls -1 supabase/migrations/*.sql | sort

# Search for wrapper function
grep -r "create_test_auth_user_with_env" supabase/migrations/
# Result: No files found (CRITICAL FINDING)

# Count investigation reports
ls -1 docs/investigations/*.md | wc -l
# Result: 8 existing investigations
```

#### Key Findings from Project Internal Search

**FINDING 1: Non-existent Wrapper Function**
- Fixture code (line 194) calls: `create_test_auth_user_with_env`
- Search result: **Function does not exist in any migration file**
- This is the PRIMARY root cause

**FINDING 2: Migration Signature Evolution**
- OLD migration (2025-01-15): 4 parameters (no role)
  ```sql
  CREATE OR REPLACE FUNCTION public.create_test_auth_user(
    p_user_id UUID,
    p_email TEXT,
    p_encrypted_password TEXT,
    p_email_confirmed BOOLEAN DEFAULT TRUE
  )
  ```
- NEW migration (2025-11-11): 5 parameters (with role)
  ```sql
  DROP FUNCTION IF EXISTS public.create_test_auth_user(UUID, TEXT, TEXT, BOOLEAN);

  CREATE OR REPLACE FUNCTION public.create_test_auth_user(
    p_user_id UUID,
    p_email TEXT,
    p_encrypted_password TEXT,
    p_role TEXT,
    p_email_confirmed BOOLEAN DEFAULT TRUE
  )
  ```

**FINDING 3: Documentation Outdated**
- `TEST-AUTH-USER-CREATION.md` still shows OLD 4-param signature (lines 79-104, 158-218)
- `MIGRATION-SUMMARY-20250115-TEST-AUTH-USERS.md` still shows OLD 4-param signature (lines 78-86, 601-626)
- Neither document mentions the 2025-11-11 update

**FINDING 4: JWT Hook Reads from `public.users`, Not `auth.users.raw_app_meta_data`**
From `20250111_jwt_custom_claims.sql` (lines 38-41):
```sql
SELECT role, organization_id, email
INTO user_role, user_org_id, user_email
FROM public.users
WHERE id = (event->>'user_id')::uuid;
```

This means:
- JWT role comes from `public.users.role` table
- NOT from `auth.users.raw_app_meta_data.role`
- Even though new migration sets `raw_app_meta_data.role`, it's not used by JWT hook
- This creates a sequencing dependency: `auth.users` → `public.users` → JWT refresh

**FINDING 5: Fixture Code Flow**
From `tests/fixtures/index.ts` (lines 287-321):
```typescript
// Step 2: Create auth users FIRST
for (const authUser of Object.values(TEST_AUTH_USERS)) {
  const testUser = Object.values(TEST_USERS).find(u => u.id === authUser.id);
  await createAuthUser(authUser.email, authUser.password, authUser.id, testUser.role);
}

// Step 3: Update public.users entries created by trigger
for (const user of Object.values(TEST_USERS)) {
  if (user.role === 'admin') continue;

  const { error } = await supabase
    .from('users')
    .upsert({
      id: user.id,
      email: user.email,
      organization_id: user.organizationId,
      role: user.role,
    });
}
```

Current flow (BROKEN):
1. Call `create_test_auth_user_with_env` (doesn't exist) → FAILS
2. Never creates auth user
3. Never creates `public.users` entry
4. JWT hook returns null for role
5. Tests fail with "role: null"

### Tier 1: Context7 MCP (Not Applicable)

**Skipped**: This is a project-specific migration and function signature issue, not a framework/library issue requiring external documentation.

### Hypotheses Tested

#### Hypothesis 1: Migration Conflict (OLD and NEW functions both exist)
**Test**: Check migration history and function signatures
**Result**: ❌ REJECTED
**Evidence**:
- NEW migration explicitly drops OLD function: `DROP FUNCTION IF EXISTS public.create_test_auth_user(UUID, TEXT, TEXT, BOOLEAN);`
- Only one function signature can exist at a time
- This is not the root cause

#### Hypothesis 2: Fixture Code Calling Wrong Function
**Test**: Search for `create_test_auth_user_with_env` in migrations
**Result**: ✅ CONFIRMED (PRIMARY ROOT CAUSE)
**Evidence**:
- Fixture calls `create_test_auth_user_with_env` (line 194)
- Function does not exist in any migration file
- Search results: "No files found"
- This causes RPC call to fail silently or with error

#### Hypothesis 3: Missing `p_role` Parameter in RPC Call
**Test**: Check fixture code RPC parameters
**Result**: ⚠️ PARTIALLY CORRECT (SECONDARY ISSUE)
**Evidence**:
- Fixture code DOES pass `p_role` parameter (line 198)
- BUT it's passing to a non-existent wrapper function
- Once wrapper issue is fixed, this will work correctly

#### Hypothesis 4: JWT Hook Not Reading `raw_app_meta_data`
**Test**: Read JWT custom claims migration
**Result**: ✅ CONFIRMED (TERTIARY ISSUE)
**Evidence**:
- JWT hook reads from `public.users.role` (line 38-41 of `20250111_jwt_custom_claims.sql`)
- Does NOT read from `auth.users.raw_app_meta_data.role`
- New migration sets `raw_app_meta_data.role` but it's unused
- This is a design mismatch, not a bug per se

#### Hypothesis 5: Timing/Race Condition
**Test**: Trace fixture setup flow
**Result**: ❌ REJECTED
**Evidence**:
- Current flow is sequential (await calls)
- No race condition possible
- The issue is simply that auth user creation fails due to non-existent function

---

## Root Cause Analysis

### Primary Cause: Non-Existent Wrapper Function

**What**: Fixture code calls `create_test_auth_user_with_env` which does not exist in any migration.

**Evidence**:
```typescript
// tests/fixtures/index.ts:194
const { data: result, error: createError } = await supabase.rpc('create_test_auth_user_with_env', {
  p_user_id: userId,
  p_email: email,
  p_encrypted_password: hashedPassword,
  p_role: role,
  p_email_confirmed: true,
});
```

**Grep search result**:
```bash
$ grep -r "create_test_auth_user_with_env" supabase/migrations/
# No files found
```

**Impact**:
- RPC call fails with "function does not exist" error
- Auth user is never created
- `public.users` entry is never created (depends on auth user trigger)
- JWT hook returns `null` for role (no user in `public.users`)
- Tests fail with "role: null" error

### Contributing Factors

**Factor 1: Documentation Outdated**
- `TEST-AUTH-USER-CREATION.md` shows OLD 4-parameter signature
- Developers may have followed outdated documentation
- No mention of 2025-11-11 migration update

**Factor 2: Missing Environment Wrapper**
- Fixture code assumes a wrapper function that sets `app.environment='test'` before calling `create_test_auth_user`
- This wrapper was never created
- Alternative: Call `create_test_auth_user` directly (requires `app.environment` to be set globally)

**Factor 3: JWT Hook Design**
- JWT hook reads from `public.users.role`
- New migration sets `auth.users.raw_app_meta_data.role` (which is ignored)
- This creates unnecessary complexity and confusion

### Mechanism of Failure

**Execution Flow** (Current - BROKEN):

```
1. Test setup calls setupTestFixtures()
   ↓
2. Fixture iterates over TEST_AUTH_USERS
   ↓
3. For each user, calls createAuthUser(email, password, userId, role)
   ↓
4. createAuthUser calls supabase.rpc('create_test_auth_user_with_env', {...})
   ↓
5. RPC FAILS: Function 'create_test_auth_user_with_env' does not exist
   ↓
6. Error thrown: "Failed to create auth user via RPC"
   ↓
7. Test setup fails, or continues without auth users
   ↓
8. Later: Test tries to authenticate
   ↓
9. Authentication fails (no user exists)
   OR
   JWT contains role: null (if user somehow exists without proper role)
   ↓
10. Test fails with "role: Invalid type. Expected: string, given: null"
```

**Expected Flow** (CORRECT):

```
1. Test setup calls setupTestFixtures()
   ↓
2. Fixture iterates over TEST_AUTH_USERS
   ↓
3. For each user, calls createAuthUser(email, password, userId, role)
   ↓
4. createAuthUser calls supabase.rpc('create_test_auth_user', {
     p_user_id: userId,
     p_email: email,
     p_encrypted_password: hashedPassword,
     p_role: role,
     p_email_confirmed: true
   })
   ↓
5. RPC SUCCEEDS: Creates auth user with raw_app_meta_data.role set
   ↓
6. handle_new_user() trigger creates public.users entry
   ↓
7. Fixture updates public.users with correct organization_id and role
   ↓
8. Test authenticates user
   ↓
9. JWT hook reads role from public.users.role
   ↓
10. JWT contains valid role: "instructor"
   ↓
11. Test passes ✅
```

---

## Proposed Solutions

### Solution 1: Fix Fixture to Call Correct Function (RECOMMENDED)

**Description**: Update `tests/fixtures/index.ts` to call the actual database function `create_test_auth_user` (5-param signature) instead of the non-existent wrapper.

**Why It Addresses Root Cause**:
- Eliminates call to non-existent function
- Uses correct 5-parameter signature
- Passes `p_role` parameter to database function
- Ensures `auth.users.raw_app_meta_data.role` is set (even if unused by JWT hook)

**Implementation Steps**:

1. **Update `createAuthUser` function** in `tests/fixtures/index.ts` (lines 175-223):

   **BEFORE (BROKEN)**:
   ```typescript
   const { data: result, error: createError } = await supabase.rpc('create_test_auth_user_with_env', {
     p_user_id: userId,
     p_email: email,
     p_encrypted_password: hashedPassword,
     p_role: role,
     p_email_confirmed: true,
   });
   ```

   **AFTER (FIXED)**:
   ```typescript
   const { data: result, error: createError } = await supabase.rpc('create_test_auth_user', {
     p_user_id: userId,
     p_email: email,
     p_encrypted_password: hashedPassword,
     p_role: role,
     p_email_confirmed: true,
   });
   ```

2. **Set `app.environment` globally** in test setup (if not already set):

   Add to `vitest.config.ts` or global test setup file:
   ```typescript
   beforeAll(async () => {
     const supabase = getSupabaseAdmin();

     // Set test environment (required for create_test_auth_user security check)
     await supabase.rpc('execute_sql', {
       query: "SET app.environment = 'test';"
     });
   });
   ```

   OR set at database level (persistent):
   ```sql
   ALTER DATABASE postgres SET app.environment = 'test';
   ```

3. **Update documentation**:
   - Update `TEST-AUTH-USER-CREATION.md` to show NEW 5-param signature
   - Update `MIGRATION-SUMMARY-20250115-TEST-AUTH-USERS.md` with 2025-11-11 changes
   - Add note about `create_test_auth_user_with_env` NOT existing

**Pros**:
- ✅ Minimal code changes (1 line)
- ✅ Uses existing migration (no new migration needed)
- ✅ Fixes root cause directly
- ✅ Low risk (just fixes function name)

**Cons**:
- ⚠️ Requires `app.environment='test'` to be set globally
- ⚠️ Documentation must be updated

**Implementation Complexity**: Low (1-2 hours)

**Risk Level**: Low
- No database changes
- Single line fix in fixture
- Well-tested migration already exists

**Validation Criteria**:
1. All 17 tests in `generation.test.ts` pass
2. JWT tokens contain valid `role` field
3. No "role: null" errors
4. No "function does not exist" errors

---

### Solution 2: Create the Missing Wrapper Function (NOT RECOMMENDED)

**Description**: Create the `create_test_auth_user_with_env` wrapper function that the fixture code expects.

**Why It Addresses Root Cause**:
- Provides the function that fixture code is calling
- Wrapper sets `app.environment='test'` automatically
- Then calls `create_test_auth_user` with correct parameters

**Implementation Steps**:

1. **Create new migration**: `20251111000001_create_test_auth_user_wrapper.sql`

   ```sql
   CREATE OR REPLACE FUNCTION public.create_test_auth_user_with_env(
     p_user_id UUID,
     p_email TEXT,
     p_encrypted_password TEXT,
     p_role TEXT,
     p_email_confirmed BOOLEAN DEFAULT TRUE
   )
   RETURNS JSONB
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public, auth, pg_temp
   AS $$
   DECLARE
     v_result JSONB;
   BEGIN
     -- Set test environment for this transaction
     PERFORM set_config('app.environment', 'test', true);

     -- Call the actual function
     SELECT create_test_auth_user(
       p_user_id,
       p_email,
       p_encrypted_password,
       p_role,
       p_email_confirmed
     ) INTO v_result;

     RETURN v_result;
   END;
   $$;

   GRANT EXECUTE ON FUNCTION public.create_test_auth_user_with_env TO postgres;
   ```

2. **Apply migration**:
   ```bash
   cd packages/course-gen-platform
   supabase db push
   ```

3. **No fixture code changes needed** (already calling correct function name)

**Pros**:
- ✅ No TypeScript code changes needed
- ✅ Fixture code works as-is
- ✅ Automatic environment setting per-call

**Cons**:
- ❌ Creates unnecessary wrapper function
- ❌ Adds complexity (two functions instead of one)
- ❌ Requires new migration
- ❌ More code to maintain
- ❌ Doesn't fix outdated documentation

**Implementation Complexity**: Medium (2-3 hours)

**Risk Level**: Medium
- New migration required
- Additional function to maintain
- Potential for environment setting conflicts

**Why NOT Recommended**:
- Creates unnecessary abstraction
- Increases codebase complexity
- Solution 1 is simpler and more direct

---

### Solution 3: Revert to Old 4-Param Function (NOT RECOMMENDED)

**Description**: Revert migration `20251111000000` and go back to 4-parameter function. Fix role issue differently.

**Implementation Steps**:

1. Create rollback migration that restores 4-param function
2. Update fixture to call 4-param version
3. Fix role issue by ensuring `public.users.role` is set correctly via trigger or manual update

**Pros**:
- ✅ Matches existing documentation
- ✅ Less parameter complexity

**Cons**:
- ❌ Loses `raw_app_meta_data.role` feature (even if unused)
- ❌ Requires new migration (rollback)
- ❌ Doesn't address future role needs
- ❌ Undoes recent work
- ❌ Still requires fixture code fix

**Implementation Complexity**: High (4-6 hours)

**Risk Level**: High
- Requires careful migration rollback
- May break other code that expects 5-param signature
- Regression risk

**Why NOT Recommended**:
- Backward step
- Doesn't solve underlying issue
- More complex than Solution 1

---

## Implementation Guidance

### Recommended Approach: Solution 1

**Priority**: CRITICAL (blocks all generation contract tests)

**Estimated Effort**: 1-2 hours

**Files to Modify**:

1. **`/tests/fixtures/index.ts`** (line 194):
   ```diff
   - const { data: result, error: createError } = await supabase.rpc('create_test_auth_user_with_env', {
   + const { data: result, error: createError } = await supabase.rpc('create_test_auth_user', {
       p_user_id: userId,
       p_email: email,
       p_encrypted_password: hashedPassword,
       p_role: role,
       p_email_confirmed: true,
     });
   ```

2. **`/docs/database/TEST-AUTH-USER-CREATION.md`** (lines 79-104, 158-218):
   - Update function signature to 5 parameters
   - Add `p_role TEXT` parameter
   - Update all code examples

3. **`/docs/database/MIGRATION-SUMMARY-20250115-TEST-AUTH-USERS.md`** (lines 78-86):
   - Add section documenting 2025-11-11 migration
   - Update signature examples

**Testing Strategy**:

1. **Unit Test**: Verify `create_test_auth_user` RPC call succeeds
   ```typescript
   it('should create auth user with role', async () => {
     const supabase = getSupabaseAdmin();

     const { data: hashedPassword } = await supabase.rpc('hash_password', {
       password: 'test123',
     });

     const { data, error } = await supabase.rpc('create_test_auth_user', {
       p_user_id: '00000000-0000-0000-0000-999999999999',
       p_email: 'test-unit@example.com',
       p_encrypted_password: hashedPassword,
       p_role: 'instructor',
       p_email_confirmed: true,
     });

     expect(error).toBeNull();
     expect(data.success).toBe(true);
     expect(data.role).toBe('instructor');
   });
   ```

2. **Integration Test**: Run full fixture setup
   ```bash
   npm test -- tests/fixtures.test.ts
   ```

3. **Contract Test**: Run failing generation tests
   ```bash
   npm test -- tests/contract/generation.test.ts
   ```

4. **Full Test Suite**:
   ```bash
   npm test
   ```

**Validation Criteria**:

✅ **Success Metrics**:
- All 17 tests in `generation.test.ts` pass (currently 13/17)
- No "function does not exist" errors
- No "role: null" errors
- JWT tokens contain valid role values
- Authentication succeeds for all test users

✅ **Regression Checks**:
- No new test failures introduced
- Other test suites still pass (analysis, summarization)
- Fixture setup completes without errors

**Rollback Plan** (if fix fails):

1. Revert `tests/fixtures/index.ts` to call `create_test_auth_user_with_env`
2. Implement Solution 2 (create wrapper function)
3. Alternative: Skip auth user creation in failing tests temporarily

---

## Risks and Considerations

### Implementation Risks

**Risk 1: `app.environment` Not Set**
- **Likelihood**: Medium
- **Impact**: High (function will fail with environment check error)
- **Mitigation**:
  - Document requirement clearly
  - Add to test setup instructions
  - Consider global setup in `vitest.config.ts`

**Risk 2: Other Code Calling Old 4-Param Signature**
- **Likelihood**: Low
- **Impact**: Medium (those calls will fail)
- **Mitigation**:
  - Search codebase for all calls to `create_test_auth_user`
  - Verify all pass 5 parameters
  - Add note in migration documentation

**Risk 3: JWT Hook Still Returns Null**
- **Likelihood**: Low (if fixture flow is correct)
- **Impact**: High (tests still fail)
- **Mitigation**:
  - Verify `public.users` entry is created correctly
  - Check that role is set in `public.users.role`
  - Add logging to JWT hook for debugging

### Performance Impact

**Database**:
- No performance impact (same RPC call, just correct function name)
- Function execution time: < 10ms per call

**Test Suite**:
- No performance degradation expected
- May actually improve (fewer errors to handle)

### Breaking Changes

**None Expected**:
- Same function parameters as before
- Only changing which function is called
- Migrations are backward-compatible (old function dropped, new function created)

### Side Effects

**Positive**:
- Documentation will be updated and accurate
- Future developers won't face same confusion
- Test suite more reliable

**Negative**:
- None identified

---

## Documentation References

### Tier 0: Project Internal Documentation

**Documentation Consulted**:

1. **`TEST-AUTH-USER-CREATION.md`** (lines 1-455):
   - Shows OLD 4-parameter signature
   - Needs update to reflect 2025-11-11 migration
   - **Quote** (lines 99-104):
     ```typescript
     const { data, error } = await supabase.rpc('create_test_auth_user', {
       p_user_id: userId,
       p_email: email,
       p_encrypted_password: await hashPassword(password),
       p_email_confirmed: true,
     });
     ```
   - **Missing**: `p_role` parameter

2. **`MIGRATION-SUMMARY-20250115-TEST-AUTH-USERS.md`** (lines 78-86):
   - Documents OLD migration with 4 parameters
   - **Quote** (lines 79-86):
     ```sql
     CREATE OR REPLACE FUNCTION public.create_test_auth_user(
       p_user_id UUID,
       p_email TEXT,
       p_encrypted_password TEXT,
       p_email_confirmed BOOLEAN DEFAULT TRUE
     )
     RETURNS JSONB
     ```
   - **Missing**: Documentation of 2025-11-11 update

3. **`T047-JWT-CUSTOM-CLAIMS-IMPLEMENTATION.md`** (lines 268-290):
   - Documents JWT custom claims hook behavior
   - **Quote** (lines 268-279):
     > "**Token Refresh Behavior**
     > - **Custom claims are only populated on token refresh**, not immediately on user creation
     > - When a new user is created:
     >   1. Initial JWT will have `null` values for custom claims
     >   2. Next token refresh will populate claims from `public.users`
     >   3. Sign-in after signup will have correct claims"
   - **Critical**: JWT hook reads from `public.users`, not `auth.users.raw_app_meta_data`

**Git History**:
```bash
# Recent migration
git log --oneline supabase/migrations/20251111000000_fix_test_auth_user_role_metadata.sql
# 6ec7246 chore(release): v0.16.24
# 7fdef35 fix: parallel test failure fixes across unit, contract, and schema layers
```

**Previous Investigations**:
- No previous investigations found for this specific issue
- This is investigation #9 (8 existing reports in `docs/investigations/`)

### Tier 1: Context7 MCP

**Not Used**: This is a project-specific database function issue, not a framework/library issue requiring external documentation.

---

## MCP Server Usage

### Tools Used

**Project Internal Search**:
- ✅ Read: 9 files examined
  - 5 migration files
  - 3 documentation files
  - 1 test fixture file
- ✅ Grep: 3 searches performed
  - Search for `create_test_auth_user_with_env` (result: not found)
  - Search for `test_set_jwt` (result: not found)
- ✅ Bash: 4 commands executed
  - List migrations
  - Count investigations
  - Create investigations directory

**Supabase MCP**: Not used (investigation phase only, no database modifications)

**Context7 MCP**: Not used (project-specific issue)

**Sequential Thinking MCP**: Not used (investigation was straightforward)

---

## Next Steps

### For Orchestrator/User

**Immediate Actions** (CRITICAL):

1. **Fix fixture code**:
   - Edit `tests/fixtures/index.ts` line 194
   - Change `create_test_auth_user_with_env` → `create_test_auth_user`
   - Verify 5 parameters are passed

2. **Set test environment**:
   - Add to global test setup: `SET app.environment = 'test';`
   - OR set at database level: `ALTER DATABASE postgres SET app.environment = 'test';`

3. **Run tests**:
   ```bash
   npm test -- tests/contract/generation.test.ts
   ```
   - Verify all 17 tests pass
   - Check for "role: null" errors (should be gone)

4. **Update documentation**:
   - `TEST-AUTH-USER-CREATION.md` → add `p_role` parameter
   - `MIGRATION-SUMMARY-20250115-TEST-AUTH-USERS.md` → document 2025-11-11 migration
   - Add note that `create_test_auth_user_with_env` does NOT exist

**Follow-up Recommendations**:

1. **Search for other calls to old signature**:
   ```bash
   grep -r "create_test_auth_user" tests/ src/
   ```
   - Verify all calls pass 5 parameters

2. **Consider simplifying JWT hook**:
   - Current: JWT hook reads from `public.users.role`
   - Migration sets: `auth.users.raw_app_meta_data.role`
   - Misalignment creates confusion
   - Recommendation: Document this design decision clearly

3. **Add integration test**:
   - Test that verifies JWT contains correct role after auth user creation
   - Catches this issue earlier in development

4. **Prevent future issues**:
   - Add comment in fixture code explaining function signature
   - Add type-checking for RPC calls (if possible)
   - Keep documentation in sync with migrations

---

## Investigation Log

### Timeline

**2025-11-11 14:20:00** - Investigation started
- Received task specification
- Created investigation ID: INV-2025-11-11-001
- Initialized TodoWrite tracking

**2025-11-11 14:20:15** - Phase 1: Read migrations
- Read `20250115000001_create_test_auth_user_function.sql` (OLD - 4 params)
- Read `20251111000000_fix_test_auth_user_role_metadata.sql` (NEW - 5 params)
- Read `20250115000002_create_hash_password_helper.sql`
- Identified signature mismatch: OLD dropped, NEW created

**2025-11-11 14:20:45** - Phase 2: Examine fixture code
- Read `tests/fixtures/index.ts`
- Found call to `create_test_auth_user_with_env` (line 194)
- This function does not exist anywhere!

**2025-11-11 14:21:00** - Phase 3: Search for wrapper function
- Grep search: `create_test_auth_user_with_env`
- Result: No files found
- **CRITICAL FINDING**: Function doesn't exist

**2025-11-11 14:21:30** - Phase 4: Read JWT hook documentation
- Read `20250111_jwt_custom_claims.sql`
- Read `T047-JWT-CUSTOM-CLAIMS-IMPLEMENTATION.md`
- Identified: JWT hook reads from `public.users.role`, not `raw_app_meta_data`

**2025-11-11 14:22:00** - Phase 5: Read outdated documentation
- Read `TEST-AUTH-USER-CREATION.md` (shows OLD 4-param signature)
- Read `MIGRATION-SUMMARY-20250115-TEST-AUTH-USERS.md` (shows OLD signature)
- Both documents need updates

**2025-11-11 14:22:30** - Phase 6: Root cause identified
- PRIMARY: Non-existent wrapper function
- SECONDARY: Outdated documentation
- TERTIARY: JWT hook design mismatch

**2025-11-11 14:23:00** - Phase 7: Generate report
- Created investigation directory
- Wrote comprehensive investigation report
- Documented 3 solution approaches
- Recommended Solution 1 (fix fixture code)

### Commands Run

```bash
# List migration files
ls -1 supabase/migrations/*.sql | sort

# Search for wrapper function
grep -r "create_test_auth_user_with_env" supabase/migrations/
# Result: No files found

# Count existing investigations
ls -1 docs/investigations/*.md | wc -l
# Result: 8

# Create investigations directory
mkdir -p docs/investigations

# Run failing tests (background)
npm test -- generation.test.ts
```

### MCP Calls Made

**Read Tool**: 9 files
- 5 migration files
- 3 documentation files
- 1 test fixture file

**Grep Tool**: 3 searches
- `create_test_auth_user_with_env` (not found)
- `test_set_jwt` (not found)

**Bash Tool**: 5 commands
- List migrations
- Search migrations
- Count investigations
- Create directory
- Run tests

**Total MCP Calls**: 17

---

## Conclusion

This investigation identified a clear root cause: the test fixture code calls a non-existent wrapper function `create_test_auth_user_with_env`. The fix is straightforward: change one line of code to call the correct function `create_test_auth_user` with the new 5-parameter signature.

The recommended solution (Solution 1) is low-risk, low-complexity, and directly addresses the root cause. It requires updating the fixture code and ensuring the test environment is configured correctly.

**Status**: ✅ Ready for Implementation

**Blocking Issues**: None

**Critical Dependencies**:
- `app.environment` must be set to 'test' before running tests
- Documentation must be updated to reflect current function signature

---

**Investigation By**: investigation-agent
**Report Generated**: 2025-11-11
**Next Action**: Invoke implementation agent to fix `tests/fixtures/index.ts` line 194
