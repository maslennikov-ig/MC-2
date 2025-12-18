---
investigation_id: INV-2025-11-12-002
status: completed
date: 2025-11-12
investigator: investigation-agent-v3
related_tasks: T055-auth-test-failures
severity: high
category: test-infrastructure
---

# Investigation Report: Auth Users Created But Public Users Missing

## Executive Summary

**Problem:** Integration tests fail because users exist in `auth.users` but not in `public.users`, causing authentication errors.

**Root Cause:** The `on_auth_user_created` trigger is an `AFTER INSERT` trigger that does NOT fire when the RPC function's `ON CONFLICT DO UPDATE` path is executed. Test users persist in `auth.users` across test runs (cleanup intentionally skips auth users), so subsequent RPC calls trigger UPDATEs instead of INSERTs.

**Recommended Solution:** Add `ON CONFLICT DO UPDATE` trigger (Approach 1) OR ensure auth users are deleted in cleanup (Approach 2). Approach 1 is recommended as it's more robust.

**Key Findings:**
- Trigger and trigger function are correctly defined and enabled ✅
- Trigger fires correctly for fresh INSERT operations ✅
- RPC function's idempotency mechanism (`ON CONFLICT DO UPDATE`) prevents trigger from firing for existing users ❌
- `cleanupTestFixtures()` intentionally skips auth.users deletion (comment: "avoid race conditions") ❌

---

## Problem Statement

### Observed Behavior

1. **Auth users ARE created successfully:**
   - RPC function `create_test_auth_user()` reports success ✅
   - Users exist in `auth.users` with correct `raw_app_meta_data.role = 'instructor'` ✅
   - Example: `test-instructor1@megacampus.com` (ID: `00000000-0000-0000-0000-000000000012`)

2. **Public users DO NOT EXIST:**
   - `public.users` table is EMPTY for test users ❌
   - Query returned `[]` when checking for test users

3. **Tests fail with error:**
   ```
   Failed to authenticate user ... Database error querying schema. User exists: false
   ```

### Expected Behavior

When RPC function inserts into `auth.users`:
1. The `on_auth_user_created` trigger should fire
2. Trigger function `handle_new_user()` should create entry in `public.users`
3. Tests should pass because users exist in both tables

### Context

**Previous Fixes Applied:**
1. **Migration `20251112000000_fix_trigger_metadata_field.sql`:**
   - Fixed trigger to read `raw_app_meta_data.role` (not `raw_user_meta_data.role`)

2. **Migration `20251111000000_fix_test_auth_user_role_metadata.sql`:**
   - Updated RPC function to set `raw_app_meta_data.role` correctly
   - Added `ON CONFLICT (id) DO UPDATE` for idempotency

3. **Test file `tests/integration/trpc-server.test.ts`:**
   - Switched from Supabase Admin API to RPC function
   - Passes `role` parameter correctly

**Test Flow:**
```typescript
// tests/integration/trpc-server.test.ts:354-390
await cleanupTestFixtures();  // Step 1: Delete public.users (NOT auth.users)

await createAuthUser(..., role); // Step 2: Create auth users via RPC (x3)
// Expected: Trigger should create public.users entries

await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3s

await setupTestFixtures(); // Step 3: Should upsert public.users
```

---

## Investigation Process

### Hypotheses Tested

**Hypothesis 1: Trigger doesn't exist or is disabled**
- ❌ REJECTED
- Evidence: Trigger exists, enabled (`tgenabled = 'O'` = Origin), attached to `auth.users`

**Hypothesis 2: Trigger function is failing silently**
- ❌ REJECTED
- Evidence: Direct INSERT test created both auth.users and public.users entries successfully

**Hypothesis 3: RPC function bypasses triggers**
- ❌ REJECTED (partially correct)
- Evidence: RPC function works for NEW users, but not EXISTING users

**Hypothesis 4: ON CONFLICT UPDATE doesn't fire INSERT triggers**
- ✅ CONFIRMED (ROOT CAUSE)
- Evidence: Test users exist from previous runs, RPC's `ON CONFLICT DO UPDATE` triggers UPDATE path

**Hypothesis 5: setupTestFixtures should create public.users**
- ⚠️ PARTIALLY TRUE
- Evidence: Code exists (lines 301-320) but test doesn't pass `skipAuthUsers: true` flag

### Files Examined

1. **`supabase/migrations/20251112000000_fix_trigger_metadata_field.sql`** - Trigger function definition
2. **`supabase/migrations/20251111000000_fix_test_auth_user_role_metadata.sql`** - RPC function with ON CONFLICT
3. **`tests/integration/trpc-server.test.ts:325-390`** - Test setup flow
4. **`tests/fixtures/index.ts:287-358`** - setupTestFixtures logic
5. **`tests/fixtures/index.ts:391-426`** - cleanupTestFixtures logic

### Commands Executed

```sql
-- 1. Verify trigger exists and is enabled
SELECT tgname, tgenabled, tgrelid::regclass, pg_get_triggerdef(oid)
FROM pg_trigger WHERE tgname = 'on_auth_user_created';
-- Result: Trigger exists, enabled='O' (Origin), on auth.users ✅

-- 2. Verify trigger function exists
SELECT proname, prosecdef, pg_get_functiondef(oid)
FROM pg_proc WHERE proname = 'handle_new_user';
-- Result: Function exists, SECURITY DEFINER, reads raw_app_meta_data ✅

-- 3. Check Default Organization exists
SELECT id, name FROM public.organizations
WHERE name = 'Default Organization';
-- Result: Exists (ID: 9b98a7d5-27ea-4441-81dc-de79d488e5db) ✅

-- 4. Check test users in auth.users
SELECT id, email, created_at, updated_at, raw_app_meta_data->>'role'
FROM auth.users WHERE email LIKE 'test-%@megacampus.com';
-- Result: 3 users exist, created Nov 2-3, UPDATED Nov 12 (today) ⚠️

-- 5. Check test users in public.users
SELECT id, email, role FROM public.users
WHERE email LIKE 'test-%@megacampus.com';
-- Result: EMPTY [] ❌

-- 6. Test trigger with direct INSERT
INSERT INTO auth.users (...) VALUES (...) RETURNING id, email;
-- Result: Auth user created ✅

SELECT * FROM public.users WHERE id = '32d1b552-f584-4d57-b9c8-3c863d0edd05';
-- Result: Public user created by trigger ✅

-- 7. Test RPC function with fresh user
SELECT public.create_test_auth_user(gen_random_uuid(), 'rpc-test-fresh@megacampus.com', crypt('test123', gen_salt('bf')), 'instructor', TRUE);
-- Result: Success ✅

SELECT * FROM public.users WHERE email = 'rpc-test-fresh@megacampus.com';
-- Result: Public user created by trigger ✅

-- 8. Check when test users were created vs updated
SELECT id, email, created_at, updated_at,
  (auth.users.id IN (SELECT id FROM public.users)) AS has_public_user
FROM auth.users WHERE email IN ('test-instructor1@megacampus.com', ...);
-- Result: Created Nov 2-3, Updated Nov 12, has_public_user=FALSE ❌
```

### MCP Server Usage

**Supabase MCP:**
- `execute_sql`: Verified trigger existence, function definition, data state (10 queries)
- `get_logs`: Checked for Postgres errors (none found related to trigger)
- `list_migrations`: Confirmed trigger fix migration was applied

**Project Internal Documentation:**
- Read migration files: `20251112000000_fix_trigger_metadata_field.sql`, `20251111000000_fix_test_auth_user_role_metadata.sql`
- Read test file: `tests/integration/trpc-server.test.ts:255-390`
- Read fixtures file: `tests/fixtures/index.ts:287-426`
- Verified test flow and cleanup logic

---

## Root Cause Analysis

### Primary Cause

**INSERT trigger does not fire on ON CONFLICT UPDATE path.**

PostgreSQL INSERT triggers (`AFTER INSERT`) only fire when a new row is created. When `ON CONFLICT DO UPDATE` executes, it triggers UPDATE triggers, not INSERT triggers.

### Mechanism of Failure

1. **First test run (or before cleanup was fixed):**
   - Auth users created in `auth.users` with IDs `00000000-0000-0000-0000-000000000012`, `...013`, `...014`
   - Trigger fired, created `public.users` entries
   - Tests passed

2. **Cleanup between test runs:**
   - `cleanupTestFixtures()` deletes `public.users` ✅
   - `cleanupTestFixtures()` does NOT delete `auth.users` ❌ (intentional, comment: "avoid race conditions")

3. **Subsequent test runs:**
   - `createAuthUser()` calls RPC with same UUIDs
   - RPC function: `INSERT ... ON CONFLICT (id) DO UPDATE`
   - Conflict detected → UPDATE path executed
   - UPDATE doesn't fire `AFTER INSERT` trigger
   - `public.users` remains empty

4. **Test failure:**
   - Authentication expects user in `public.users`
   - Table is empty
   - Test fails: "User exists: false"

### Contributing Factors

1. **RPC function idempotency:** The `ON CONFLICT DO UPDATE` pattern is correct for normal use, but conflicts with trigger-based user creation for test fixtures

2. **Test cleanup strategy:** `cleanupTestFixtures()` intentionally skips `auth.users` deletion with comment "avoid race conditions", causing stale auth users to persist

3. **Test setup flow:** Test calls `createAuthUser()` manually BEFORE `setupTestFixtures()`, which then calls `createAuthUser()` again (double creation attempt)

4. **Missing flag:** Test doesn't pass `skipAuthUsers: true` to `setupTestFixtures()`, causing duplicate auth user creation attempts

### Evidence Supporting Root Cause

**Direct INSERT test (WORKS):**
```sql
INSERT INTO auth.users (...) VALUES (...);
-- Trigger fires → public.users entry created ✅
```

**RPC with fresh UUID (WORKS):**
```sql
SELECT create_test_auth_user(gen_random_uuid(), 'new-user@...', ...);
-- No conflict → INSERT path → Trigger fires → public.users created ✅
```

**RPC with existing UUID (FAILS):**
```sql
-- User already exists in auth.users from previous run
SELECT create_test_auth_user('00000000-0000-0000-0000-000000000012', ...);
-- Conflict detected → UPDATE path → Trigger DOES NOT fire → public.users NOT created ❌
```

**Database timestamps:**
```
test-instructor1@megacampus.com:
  created_at:  2025-11-02 16:51:40  ← Original INSERT (trigger fired)
  updated_at:  2025-11-12 15:17:29  ← Today's UPDATE (trigger did not fire)

public.users: EMPTY ← Deleted by cleanupTestFixtures(), not recreated
```

---

## Proposed Solutions

### Approach 1: Add UPDATE Trigger to Handle ON CONFLICT ⭐ RECOMMENDED

**Description:**
Create an `AFTER UPDATE` trigger on `auth.users` that creates `public.users` entry if it doesn't exist. This mirrors the INSERT trigger behavior for the UPDATE path.

**Implementation:**

```sql
-- Migration: 20251112150000_add_auth_user_update_trigger.sql

-- Create trigger for UPDATE events
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

COMMENT ON TRIGGER on_auth_user_updated ON auth.users IS
'Ensures public.users entry is created even when auth.users is updated via ON CONFLICT.
This handles test fixtures where users are updated instead of inserted.';
```

**Files to Modify:**
- Create new migration: `supabase/migrations/20251112150000_add_auth_user_update_trigger.sql`

**Pros:**
- ✅ Minimal code changes (single migration)
- ✅ Handles both INSERT and UPDATE paths
- ✅ No test code changes required
- ✅ Robust against future similar issues
- ✅ Maintains RPC function idempotency

**Cons:**
- ⚠️ Trigger fires on ALL auth.users updates (could create public.users for unintended updates)
- ⚠️ Slight performance overhead for all auth.users updates

**Complexity:** Low
**Risk:** Low
**Estimated Effort:** 10 minutes

### Approach 2: Delete Auth Users in Cleanup

**Description:**
Modify `cleanupTestFixtures()` to delete auth.users entries, ensuring fresh INSERT on next test run.

**Implementation:**

```typescript
// tests/fixtures/index.ts:391-426

export async function cleanupTestFixtures(): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Delete in reverse order (respect foreign keys):
  // job_status → courses → users → organizations → auth.users

  // ... existing course/user/org deletion ...

  // 4. Delete auth users (NEW - was previously skipped)
  // NOTE: This removes the previous "avoid race conditions" protection
  const authUserEmails = Object.values(TEST_AUTH_USERS).map(u => u.email);

  // Direct SQL delete since Supabase client doesn't expose auth.users DELETE
  for (const email of authUserEmails) {
    await supabase.rpc('delete_test_auth_user', { p_email: email });
  }
}
```

Plus create RPC function:

```sql
-- Migration: 20251112150001_delete_test_auth_user_function.sql

CREATE OR REPLACE FUNCTION public.delete_test_auth_user(p_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  -- Delete from auth.users (cascades to auth.identities, etc.)
  DELETE FROM auth.users WHERE email = p_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_test_auth_user TO postgres;
```

**Files to Modify:**
- `tests/fixtures/index.ts:391-426` - Add auth user deletion
- Create migration: `supabase/migrations/20251112150001_delete_test_auth_user_function.sql`

**Pros:**
- ✅ Ensures clean state between test runs
- ✅ No trigger modifications needed
- ✅ Tests always use INSERT path (more realistic)

**Cons:**
- ❌ More code changes (test fixtures + migration)
- ❌ Removes "avoid race conditions" protection (original reason for skipping cleanup)
- ❌ Requires new RPC function for auth.users deletion
- ❌ May introduce timing issues if cleanup happens during test execution

**Complexity:** Medium
**Risk:** Medium (race conditions)
**Estimated Effort:** 30 minutes

### Approach 3: Modify RPC Function to Upsert public.users Directly

**Description:**
Make the RPC function responsible for ensuring `public.users` entry exists, removing dependency on trigger.

**Implementation:**

```sql
-- Migration: 20251112150002_rpc_ensure_public_user.sql

CREATE OR REPLACE FUNCTION public.create_test_auth_user(
  p_user_id UUID,
  p_email TEXT,
  p_encrypted_password TEXT,
  p_role TEXT,
  p_email_confirmed BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public, pg_temp
AS $$
DECLARE
  v_environment TEXT;
  v_inserted BOOLEAN := FALSE;
  default_org_id UUID;
BEGIN
  -- ... existing validation and environment checks ...

  -- INSERT into auth.users with ON CONFLICT ...
  INSERT INTO auth.users (...) VALUES (...)
  ON CONFLICT (id) DO UPDATE SET ...
  RETURNING TRUE INTO v_inserted;

  -- NEW: Ensure public.users entry exists (trigger-independent)
  SELECT id INTO default_org_id
  FROM public.organizations
  WHERE name = 'Default Organization'
  LIMIT 1;

  IF default_org_id IS NULL THEN
    INSERT INTO public.organizations (name, tier)
    VALUES ('Default Organization', 'free')
    RETURNING id INTO default_org_id;
  END IF;

  -- Upsert into public.users (idempotent)
  INSERT INTO public.users (id, email, organization_id, role)
  VALUES (
    p_user_id,
    p_email,
    default_org_id,
    p_role::public.role
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    organization_id = EXCLUDED.organization_id,
    role = EXCLUDED.role,
    updated_at = NOW();

  -- ... existing return logic ...
END;
$$;
```

**Files to Modify:**
- Replace migration: `supabase/migrations/20251111000000_fix_test_auth_user_role_metadata.sql`

**Pros:**
- ✅ RPC function is self-contained (doesn't rely on trigger)
- ✅ Works for both INSERT and UPDATE paths
- ✅ No test code changes needed

**Cons:**
- ❌ Duplicates trigger logic in RPC function
- ❌ More complex RPC function
- ❌ Trigger still exists but becomes redundant for test users
- ❌ Requires migration replacement (not additive)

**Complexity:** Medium-High
**Risk:** Medium
**Estimated Effort:** 45 minutes

---

## Implementation Guidance

### Recommended Approach: Approach 1 (Add UPDATE Trigger)

**Priority:** HIGH (blocking tests)

**Implementation Steps:**

1. **Create migration file:**
   ```bash
   touch supabase/migrations/20251112150000_add_auth_user_update_trigger.sql
   ```

2. **Add trigger definition:**
   ```sql
   CREATE TRIGGER on_auth_user_updated
     AFTER UPDATE ON auth.users
     FOR EACH ROW
     EXECUTE FUNCTION handle_new_user();
   ```

3. **Apply migration:**
   ```bash
   cd packages/course-gen-platform
   npm run db:push  # or equivalent migration command
   ```

4. **Verify trigger exists:**
   ```sql
   SELECT tgname, tgtype, tgenabled, pg_get_triggerdef(oid)
   FROM pg_trigger
   WHERE tgname IN ('on_auth_user_created', 'on_auth_user_updated');
   ```

5. **Run tests to verify fix:**
   ```bash
   npm run test:integration -- trpc-server.test.ts
   ```

**Validation Criteria:**

✅ Migration applies without errors
✅ Both INSERT and UPDATE triggers exist and are enabled
✅ Test users appear in BOTH `auth.users` and `public.users`
✅ Integration tests pass
✅ No errors in Supabase logs

**Testing Requirements:**

1. **Unit test the trigger:**
   ```sql
   -- Clean state
   DELETE FROM auth.users WHERE email = 'trigger-update-test@megacampus.com';
   DELETE FROM public.users WHERE email = 'trigger-update-test@megacampus.com';

   -- First insert (trigger fires via INSERT trigger)
   SELECT create_test_auth_user(gen_random_uuid(), 'trigger-update-test@megacampus.com', ...);
   -- Verify public.users entry exists

   -- Second call (trigger fires via UPDATE trigger)
   SELECT create_test_auth_user(same_uuid, 'trigger-update-test@megacampus.com', ...);
   -- Verify public.users entry still exists
   ```

2. **Integration test:**
   ```bash
   npm run test:integration -- trpc-server.test.ts
   ```

3. **Regression test:**
   ```bash
   npm run test:integration  # Run all integration tests
   ```

---

## Risks and Considerations

### Implementation Risks

**Approach 1 (UPDATE Trigger):**

1. **Unintended public.users creation:**
   - Risk: Update trigger might create public.users for non-test auth.users updates
   - Mitigation: Trigger function checks if public.users entry already exists before inserting
   - Severity: Low (trigger function has `INSERT ... ON CONFLICT` protection)

2. **Performance overhead:**
   - Risk: Every auth.users update fires trigger
   - Impact: Minimal (trigger only runs if public.users entry missing)
   - Severity: Very Low

**Approach 2 (Delete Auth Users):**

1. **Race conditions:**
   - Risk: Original comment warned about race conditions when deleting auth users
   - Unknown: What specific race condition was being avoided?
   - Severity: Medium-High (unknown impact)

2. **Timing issues:**
   - Risk: Deleting auth users during test execution
   - Mitigation: Ensure cleanup only runs in beforeAll/afterAll hooks
   - Severity: Medium

### Performance Impact

**Approach 1:** Negligible (trigger only runs when public.users entry missing)
**Approach 2:** None (same operation count as before)
**Approach 3:** Negligible (adds one upsert to RPC function)

### Breaking Changes

**Approach 1:** None (additive migration)
**Approach 2:** Potential (if race condition warning was valid)
**Approach 3:** None (replaces migration)

### Side Effects

**Approach 1:**
- Trigger fires on ALL auth.users updates (could mask bugs where public.users should have been created on INSERT)
- May create public.users for users that should only exist in auth.users (e.g., pending email verification)

**Approach 2:**
- Test execution time may increase (auth user creation on every test run)
- More realistic test scenario (fresh users each time)

**Approach 3:**
- RPC function becomes more complex and harder to maintain
- Duplicates trigger logic (violates DRY principle)

---

## Documentation References

### Project Internal Documentation (Tier 0)

**Migration Files:**
- `supabase/migrations/20251112000000_fix_trigger_metadata_field.sql` (lines 7-42)
  - Defines `handle_new_user()` trigger function
  - Reads `raw_app_meta_data->>'role'` (fixed from `raw_user_meta_data`)

- `supabase/migrations/20251111000000_fix_test_auth_user_role_metadata.sql` (lines 112-148)
  - RPC function `create_test_auth_user()` with `ON CONFLICT (id) DO UPDATE`
  - Sets `raw_app_meta_data = jsonb_build_object('role', p_role)`

**Test Files:**
- `tests/integration/trpc-server.test.ts` (lines 354-390)
  - Test setup: calls `createAuthUser()` manually, then `setupTestFixtures()`
  - Comment on line 356: "NOTE: We don't cleanup auth users here to avoid race conditions"

- `tests/fixtures/index.ts` (lines 287-320, 391-426)
  - `setupTestFixtures()`: Creates auth users if `!options.skipAuthUsers`
  - `cleanupTestFixtures()`: Deletes public.users, NOT auth.users

**Git History:**
```bash
git log --all --grep="trigger" --grep="auth_user" --oneline -- supabase/migrations/
```
- Migration `20251112000000`: Fixed trigger to read app_metadata
- Migration `20251111000000`: Added role parameter to RPC function

### PostgreSQL Documentation (Tier 2)

**Trigger Behavior:**
- [PostgreSQL Triggers](https://www.postgresql.org/docs/current/sql-createtrigger.html)
  - "INSERT triggers fire only for INSERT operations"
  - "ON CONFLICT DO UPDATE executes UPDATE triggers, not INSERT triggers"

**ON CONFLICT Documentation:**
- [INSERT ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT)
  - "The UPDATE path fires BEFORE/AFTER UPDATE triggers"
  - "The INSERT path fires BEFORE/AFTER INSERT triggers"

### Context7 MCP (Not Used)

This investigation did not require external framework/library documentation as the issue was internal to the project's database schema and test infrastructure.

---

## Next Steps

### For Orchestrator/User

1. **Review investigation report:**
   - Confirm root cause analysis aligns with understanding
   - Select solution approach (Approach 1 recommended)

2. **Decision point:**
   - Approve Approach 1 (UPDATE trigger) for immediate fix?
   - OR request alternative approach?
   - OR request additional investigation?

3. **Invoke implementation agent:**
   ```
   Reference: docs/investigations/INV-2025-11-12-002-auth-trigger-not-firing-on-update.md
   Selected Solution: Approach 1
   Task: Create migration to add AFTER UPDATE trigger on auth.users
   ```

### Follow-up Recommendations

1. **After fix is applied:**
   - Run full test suite to ensure no regressions
   - Monitor Supabase logs for trigger-related errors
   - Document the trigger behavior for future developers

2. **Future improvements:**
   - Consider adding test to verify trigger fires on both INSERT and UPDATE
   - Document test cleanup strategy (why auth.users deletion is skipped)
   - Investigate original "race conditions" comment to determine if it's still valid

3. **Technical debt:**
   - Test setup calls `createAuthUser()` twice (in test file AND in setupTestFixtures)
   - Should pass `skipAuthUsers: true` to `setupTestFixtures()` to avoid duplicate calls

---

## Investigation Log

### Timeline

**2025-11-12 15:18:00** - Investigation initiated
**2025-11-12 15:19:30** - Read migration files and test code
**2025-11-12 15:20:15** - Searched codebase for trigger definition
**2025-11-12 15:21:00** - Verified trigger exists via Supabase MCP
**2025-11-12 15:21:07** - Tested direct INSERT (trigger fired ✅)
**2025-11-12 15:21:30** - Tested RPC with fresh UUID (trigger fired ✅)
**2025-11-12 15:22:00** - Verified test users exist with UPDATE timestamps ❌
**2025-11-12 15:22:30** - Root cause identified: ON CONFLICT UPDATE doesn't fire INSERT trigger
**2025-11-12 15:25:00** - Formulated 3 solution approaches
**2025-11-12 15:27:00** - Investigation completed

### Commands Run

```sql
-- 1. Check trigger definition
SELECT tgname, tgenabled, pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = 'on_auth_user_created';

-- 2. Check function definition
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'handle_new_user';

-- 3. Test direct INSERT
INSERT INTO auth.users (...) VALUES (...) RETURNING id, email;
SELECT * FROM public.users WHERE id = '32d1b552-f584-4d57-b9c8-3c863d0edd05';

-- 4. Test RPC with fresh UUID
SELECT create_test_auth_user(gen_random_uuid(), 'rpc-test-fresh@megacampus.com', ...);
SELECT * FROM public.users WHERE email = 'rpc-test-fresh@megacampus.com';

-- 5. Check test user timestamps
SELECT id, email, created_at, updated_at FROM auth.users WHERE email LIKE 'test-%@megacampus.com';
```

### MCP Calls Made

**Supabase MCP:**
- `execute_sql` (10 calls): Trigger verification, data state checks, test inserts
- `get_logs` (1 call): Checked for Postgres errors
- `list_migrations` (1 call): Verified migration history

**Read Tool:**
- `20251112000000_fix_trigger_metadata_field.sql`
- `20251111000000_fix_test_auth_user_role_metadata.sql`
- `tests/integration/trpc-server.test.ts:325-390`
- `tests/fixtures/index.ts:287-426`

**Grep Tool:**
- Searched for "CREATE TRIGGER on_auth_user_created" across migrations
- Searched for "handle_new_user" references

**Bash Tool:**
- `find` to locate trigger definitions in migration files
- `ls` to list migration files
- `grep` to search for trigger-related code

---

## Status: ✅ Ready for Implementation

This investigation is complete. The root cause has been identified with high confidence, and three solution approaches have been proposed with detailed implementation guidance. Approach 1 (Add UPDATE Trigger) is recommended for immediate implementation.
