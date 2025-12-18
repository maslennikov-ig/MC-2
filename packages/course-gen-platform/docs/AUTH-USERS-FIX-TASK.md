# Task: Fix Supabase Auth Users Persistence Issue

**Date Created:** 2025-11-02
**Priority:** HIGH
**Assigned To:** Supabase/Auth Specialist Agent
**Status:** READY FOR EXECUTION

---

## Problem Summary

Test users are not persisting in Supabase Auth (`auth.users` table), causing 17/20 contract tests to fail with authentication errors.

**Evidence:**
- Users successfully created in `users` table ✅
- Users created in `auth.users` via Admin API ✅ (initially)
- BUT: Users disappear after test runs ❌
- Tests fail with "Invalid login credentials" errors ❌

---

## Historical Context

### What Was Working Before
- Test suite ran successfully with auth users
- `createAuthUser()` function worked in test setup
- Users persisted between test runs
- Authentication tokens obtained successfully

### What Changed
During debugging session, we:
1. Removed `createAuthUser()` calls from `analysis.test.ts` (thought they were unnecessary)
2. Discovered users table uses FK to `users.id`, not `auth.users.id`
3. Created users in `users` table via SQL ✅
4. Re-added auth user creation via `integration-tester` agent ✅
5. BUT: Auth users not persisting now ❌

---

## Current State

### ✅ Working
```sql
SELECT id, email, role FROM users
WHERE email LIKE 'test-%@megacampus.com';

Result: 4 users found
- 00000000-0000-0000-0000-000000000011: test-admin@megacampus.com
- 00000000-0000-0000-0000-000000000012: test-instructor1@megacampus.com
- 00000000-0000-0000-0000-000000000013: test-instructor2@megacampus.com
- 00000000-0000-0000-0000-000000000014: test-student@megacampus.com
```

### ❌ Not Working
```sql
SELECT id, email FROM auth.users
WHERE email LIKE 'test-%@megacampus.com';

Result: [] (empty)
Expected: 3 users (instructors + student)
```

### Test Failures
```
T036 Contract Tests: 3/20 passing (15%)
- ✅ Unauthenticated tests: 3/3 PASS
- ❌ Authenticated tests: 0/17 FAIL

Error Pattern:
"Failed to authenticate user test-instructor1@megacampus.com after 3 attempts:
 Invalid login credentials"

Last error shows:
"Request rate limit reached" (too many failed login attempts)
```

---

## Architecture Overview

### Database Schema
```
auth.users (Supabase Auth table)
├── id: uuid (PRIMARY KEY)
├── email: text
├── encrypted_password: text
└── email_confirmed_at: timestamp

users (Application table)
├── id: uuid (PRIMARY KEY)
├── email: text
├── role: enum('admin', 'instructor', 'student')
├── organization_id: uuid (FK → organizations.id)
└── created_at: timestamp

courses
├── id: uuid (PRIMARY KEY)
├── user_id: uuid (FK → users.id)  ← NOT auth.users.id!
├── organization_id: uuid
└── ...
```

### Test Flow
```
beforeAll() hook:
1. cleanupTestFixtures()          ← Deletes users, courses
2. setupTestFixtures()            ← Creates orgs, users, courses in DB
3. [MISSING] Create auth users    ← Auth users should be created here
4. Start tRPC server
5. Start BullMQ worker

each test:
1. getAuthToken(email, password)  ← Calls supabase.auth.signInWithPassword()
2. Make authenticated API call
3. Assert response

afterAll() hook:
1. Stop worker
2. Stop server
3. cleanupTestFixtures()          ← May delete auth users?
```

---

## Root Cause Hypotheses

### Hypothesis 1: Auth Rate Limiting
**Likelihood:** HIGH
**Evidence:**
- Error message: "Request rate limit reached"
- Multiple test files running simultaneously
- Each test attempts 3 retries (20 tests × 3 = 60 auth attempts)

**Test:**
```bash
# Check Supabase Auth rate limit settings
curl https://diqooqbuchsliypgwksu.supabase.co/auth/v1/settings
```

### Hypothesis 2: Test Cleanup Deleting Auth Users
**Likelihood:** MEDIUM
**Evidence:**
- `cleanupTestFixtures()` deletes from `users` table
- May trigger CASCADE delete to `auth.users`?
- Auth trigger `handle_new_user()` creates users table entry when auth user created

**Test:**
```sql
-- Check for CASCADE constraints
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON rc.unique_constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND (tc.table_name = 'users' OR ccu.table_name = 'users');
```

### Hypothesis 3: Auth Admin API Permissions
**Likelihood:** LOW
**Evidence:**
- `integration-tester` agent reported successful creation (3/3)
- BUT: Users not found in subsequent query
- Service Role should have full permissions

**Test:**
```typescript
// Verify service role has auth admin access
const { data: { users }, error } = await supabase.auth.admin.listUsers();
console.log('Can list auth users:', !error);
console.log('User count:', users?.length);
```

### Hypothesis 4: Transaction Rollback
**Likelihood:** MEDIUM
**Evidence:**
- Tests run in transactions
- Auth operations may not be transactional
- Rollback may affect `users` table but not `auth.users`

**Test:**
Check if test framework uses transactions:
```bash
grep -r "BEGIN\|ROLLBACK\|transaction" tests/setup.ts
```

---

## Required Files & Locations

### Test Setup Files
```
/home/me/code/megacampus2/packages/course-gen-platform/tests/
├── fixtures/index.ts                    ← setupTestFixtures(), cleanupTestFixtures()
├── contract/analysis.test.ts            ← Main failing test file
├── integration/stage4-research-flag-detection.test.ts
└── setup.ts                             ← Global test setup (if exists)
```

### Database Files
```
/home/me/code/megacampus2/packages/course-gen-platform/supabase/
└── migrations/
    └── *_create_users_table.sql         ← Check for triggers, CASCADE rules
```

### Auth Client
```
/home/me/code/megacampus2/packages/course-gen-platform/src/
└── shared/supabase/admin.ts             ← getSupabaseAdmin() with Service Role
```

### Environment
```
/home/me/code/megacampus2/packages/course-gen-platform/
└── .env                                  ← SUPABASE_URL, SUPABASE_SERVICE_KEY
```

---

## Expected Behavior (How It Should Work)

### Auth User Creation
```typescript
// In beforeAll() hook of test files
const supabase = getSupabaseAdmin(); // Service Role with auth admin access

// Create auth user with specific UUID
const { data, error } = await supabase.auth.admin.createUser({
  id: '00000000-0000-0000-0000-000000000012',  // Match users.id
  email: 'test-instructor1@megacampus.com',
  password: 'test-password-123',              // Known password for signIn
  email_confirm: true,                        // Skip email verification
  user_metadata: {}
});

// Verify creation
const { data: { users } } = await supabase.auth.admin.listUsers();
const testUser = users.find(u => u.email === 'test-instructor1@megacampus.com');
console.log('Auth user created:', testUser?.id);
```

### Auth Token Retrieval
```typescript
// In each test
async function getAuthToken(email: string, password: string): Promise<string> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw new Error(`Failed to authenticate: ${error.message}`);
  return data.session.access_token;
}

const token = await getAuthToken('test-instructor1@megacampus.com', 'test-password-123');
```

### Persistence Across Tests
```typescript
// Auth users should survive:
beforeAll()  → Create users
test 1       → Use users ✅
test 2       → Use users ✅
...
test 17      → Use users ✅
afterAll()   → Cleanup
```

---

## Investigation Steps (For Subagent)

### Step 1: Verify Current State
```bash
cd /home/me/code/megacampus2/packages/course-gen-platform
```

**Check users table:**
```sql
SELECT id, email, role, organization_id
FROM users
WHERE email LIKE 'test-%@megacampus.com'
ORDER BY email;
```

**Check auth.users:**
```sql
SELECT id, email, email_confirmed_at, created_at
FROM auth.users
WHERE email LIKE 'test-%@megacampus.com'
ORDER BY email;
```

**Check if ANY auth users exist:**
```sql
SELECT COUNT(*) as total_auth_users FROM auth.users;
```

### Step 2: Check Triggers & Constraints
```sql
-- Find trigger that syncs auth.users → users
SELECT
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'auth'
  AND event_object_table = 'users';

-- Check for CASCADE delete rules
SELECT
  tc.constraint_name,
  tc.table_name,
  rc.delete_rule,
  ccu.table_name AS referenced_table
FROM information_schema.table_constraints tc
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON rc.unique_constraint_name = ccu.constraint_name
WHERE tc.table_name = 'users'
  OR ccu.table_name = 'users';
```

### Step 3: Test Auth User Creation
Create a script to isolate the issue:

```typescript
// test-auth-creation.ts
import { getSupabaseAdmin } from './src/shared/supabase/admin';

async function testAuthUserCreation() {
  const supabase = getSupabaseAdmin();

  console.log('🔍 Step 1: Check existing auth users');
  const { data: { users: existingUsers } } = await supabase.auth.admin.listUsers();
  console.log(`Found ${existingUsers.length} existing auth users`);

  console.log('\n🗑️  Step 2: Cleanup test user if exists');
  const testEmail = 'test-debug-user@megacampus.com';
  const existing = existingUsers.find(u => u.email === testEmail);
  if (existing) {
    await supabase.auth.admin.deleteUser(existing.id);
    console.log(`Deleted existing user: ${existing.id}`);
  }

  console.log('\n✨ Step 3: Create new auth user');
  const { data, error } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: 'test-password-debug',
    email_confirm: true
  });

  if (error) {
    console.error('❌ Failed to create auth user:', error);
    return;
  }

  console.log(`✅ Created auth user: ${data.user.id}`);

  console.log('\n🔄 Step 4: Wait 2 seconds...');
  await new Promise(r => setTimeout(r, 2000));

  console.log('\n🔍 Step 5: Verify user still exists');
  const { data: { users: verifyUsers } } = await supabase.auth.admin.listUsers();
  const found = verifyUsers.find(u => u.email === testEmail);

  if (found) {
    console.log(`✅ User still exists: ${found.id}`);
  } else {
    console.error('❌ User disappeared after creation!');
  }

  console.log('\n🔐 Step 6: Test sign in');
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: 'test-password-debug'
  });

  if (signInError) {
    console.error('❌ Sign in failed:', signInError.message);
  } else {
    console.log('✅ Sign in successful, got token');
  }

  console.log('\n🗑️  Step 7: Cleanup');
  if (data.user) {
    await supabase.auth.admin.deleteUser(data.user.id);
    console.log('✅ Cleanup complete');
  }
}

testAuthUserCreation().catch(console.error);
```

**Run:**
```bash
pnpm tsx test-auth-creation.ts
```

### Step 4: Check Test Cleanup Logic
```bash
# Find where cleanup happens
grep -n "cleanupTestFixtures\|afterAll\|afterEach" tests/contract/analysis.test.ts
grep -n "deleteUser\|auth.admin.delete" tests/fixtures/index.ts
```

### Step 5: Check Rate Limits
```bash
# See if we're hitting Supabase Auth rate limits
# Check recent failed auth attempts
```

```sql
-- If there's an auth audit log
SELECT event_time, event_type, ip_address
FROM auth.audit_log_entries
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND event_type LIKE '%failed%'
ORDER BY created_at DESC
LIMIT 20;
```

---

## Potential Solutions (For Subagent to Implement)

### Solution 1: Create Auth Users in Global Setup (Recommended)
**Approach:** Create auth users ONCE in global test setup, reuse across all tests

```typescript
// tests/setup.ts (create if doesn't exist)
import { beforeAll, afterAll } from 'vitest';
import { getSupabaseAdmin } from '../src/shared/supabase/admin';

const TEST_AUTH_USERS = [
  { id: '00000000-0000-0000-0000-000000000012', email: 'test-instructor1@megacampus.com', password: 'test-password-123' },
  { id: '00000000-0000-0000-0000-000000000013', email: 'test-instructor2@megacampus.com', password: 'test-password-456' },
  { id: '00000000-0000-0000-0000-000000000014', email: 'test-student@megacampus.com', password: 'test-password-789' }
];

beforeAll(async () => {
  const supabase = getSupabaseAdmin();

  // Create auth users
  for (const user of TEST_AUTH_USERS) {
    // Check if exists
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const exists = users.find(u => u.email === user.email);

    if (exists) {
      console.log(`Auth user already exists: ${user.email}`);
      continue;
    }

    // Create
    const { error } = await supabase.auth.admin.createUser({
      id: user.id,
      email: user.email,
      password: user.password,
      email_confirm: true
    });

    if (error) {
      console.error(`Failed to create auth user ${user.email}:`, error);
    } else {
      console.log(`Created auth user: ${user.email}`);
    }
  }

  console.log('✅ Auth users setup complete');
}, 30000); // 30 second timeout

afterAll(async () => {
  // Optionally cleanup auth users
  // (or leave them for next test run)
});
```

**Update vitest.config.ts:**
```typescript
export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
    // ...
  }
});
```

### Solution 2: Add Delay Between Test Auth Attempts
**Approach:** Prevent rate limiting by spacing out auth calls

```typescript
// In getAuthToken() function
async function getAuthToken(email: string, password: string): Promise<string> {
  const retries = 3;

  for (let i = 0; i < retries; i++) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        if (error.message.includes('rate limit')) {
          // Wait longer for rate limit
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }
        throw error;
      }

      return data.session.access_token;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1))); // Exponential backoff
    }
  }

  throw new Error(`Failed to authenticate user ${email} after ${retries} attempts`);
}
```

### Solution 3: Mock Auth for Contract Tests
**Approach:** Use mocked JWT tokens instead of real auth

```typescript
// tests/helpers/mock-auth.ts
import { sign } from 'jsonwebtoken';

export function createMockAuthToken(userId: string, email: string): string {
  const payload = {
    sub: userId,
    email,
    role: 'authenticated',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
  };

  // Use test JWT secret (NOT production secret)
  return sign(payload, process.env.SUPABASE_JWT_SECRET || 'test-secret');
}

// In tests
const token = createMockAuthToken(TEST_USERS.instructor1.id, TEST_USERS.instructor1.email);
```

### Solution 4: Fix Cleanup Logic
**Approach:** Ensure cleanup doesn't delete auth users

```typescript
// tests/fixtures/index.ts
export async function cleanupTestFixtures(): Promise<void> {
  const supabase = getSupabaseAdmin();

  // 1. Delete courses (has FK to users)
  await supabase.from('courses').delete().in('id', courseIds);

  // 2. Delete users from APPLICATION table
  // BUT: Do NOT delete from auth.users (let them persist)
  await supabase.from('users').delete().in('id', userIds);

  // 3. Keep auth users for reuse across test runs
  // They will be reused via setupTestFixtures() upsert
}
```

---

## Success Criteria

### Must Have (Blocking)
- ✅ Auth users persist in `auth.users` table
- ✅ T036 contract tests: 17/20 passing (authenticated tests work)
- ✅ No "Invalid login credentials" errors
- ✅ No "Request rate limit reached" errors
- ✅ Tests can run multiple times without manual cleanup

### Nice to Have (Optional)
- ✅ Fast test execution (no artificial delays)
- ✅ Clear error messages if auth fails
- ✅ Documented solution for future reference

---

## Testing Validation

After implementing fix, run:

```bash
# Clean state
cd /home/me/code/megacampus2/packages/course-gen-platform

# Verify auth users exist
# (via SQL query or test script)

# Run contract tests
pnpm test tests/contract/analysis.test.ts

# Expected: 17/20 passing (or more)
# Previously: 3/20 passing
```

---

## Additional Context

### Environment
- **Project:** MegaCampusAI course generation platform
- **Supabase Project ID:** diqooqbuchsliypgwksu
- **Auth Method:** Email/Password (Supabase Auth)
- **Test Framework:** Vitest
- **Test Type:** Integration/Contract tests with real database

### Related Files Modified in This Session
1. `tests/contract/analysis.test.ts` - Removed broken `createAuthUser()`
2. `tests/fixtures/index.ts` - Contains `setupTestFixtures()`
3. Database: Created 4 test users in `users` table via SQL

### Working Tests (For Reference)
- ✅ T040: Multi-document synthesis (3/3) - Uses admin client, no auth
- ✅ T041: Detailed requirements (3/3) - Uses admin client, no auth
- ✅ Type-check, Build - All passing

### Known Good Configuration
Before debugging session, tests worked with:
- Auth users in `auth.users` table
- Trigger `handle_new_user()` auto-creating `users` table entries
- Tests authenticating with `signInWithPassword()`

---

## Deliverables

Subagent should provide:

1. **Root Cause Analysis** - Which hypothesis was correct?
2. **Implementation** - Code changes to fix the issue
3. **Validation** - Test results showing 17/20 passing
4. **Documentation** - Brief explanation of the fix
5. **Prevention** - How to avoid this issue in future

---

## Contact / Escalation

If subagent encounters:
- **Supabase API errors** - Check service role permissions, rate limits
- **Database permission errors** - Verify RLS policies allow admin operations
- **Unclear test architecture** - Refer to existing working test files (T040, T041)
- **Blocker** - Report findings and request guidance

---

**Status:** READY FOR SUBAGENT EXECUTION
**Estimated Time:** 30-60 minutes
**Complexity:** MEDIUM (requires understanding of Supabase Auth + test infrastructure)
