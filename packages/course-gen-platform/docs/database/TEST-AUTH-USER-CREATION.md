# Test Auth User Creation with RPC Function

## Overview

This document describes the secure RPC function for creating Supabase Auth users with predefined UUIDs in test environments.

**Problem**: The Supabase Admin API `auth.admin.createUser({ id: uuid })` doesn't support specifying custom user IDs, which causes test instability and non-idempotent fixtures.

**Solution**: Direct INSERT into `auth.users` via a secure SECURITY DEFINER RPC function that enforces test-environment-only execution.

## Migration File

**Location**: `packages/course-gen-platform/supabase/migrations/20250115000001_create_test_auth_user_function.sql`

**Function Name**: `public.create_test_auth_user`

## Security Features

### 1. Environment Check
```sql
v_environment := current_setting('app.environment', true);

IF v_environment IS NULL OR v_environment != 'test' THEN
  RAISE EXCEPTION 'create_test_auth_user can only be called in test environment';
END IF;
```

**Setup Required**: Before running tests, set the environment:
```sql
ALTER DATABASE postgres SET app.environment = 'test';
```

Or at session level:
```sql
SET app.environment = 'test';
```

### 2. SECURITY DEFINER
- Function runs with elevated privileges to INSERT into `auth.users`
- Granted to `service_role` and `postgres` only
- Revoked from `authenticated`, `anon`, and `PUBLIC`

### 3. Idempotency
```sql
INSERT INTO auth.users (...)
VALUES (...)
ON CONFLICT (id) DO NOTHING;
```

Safe to call multiple times - won't error if user already exists.

## Usage in TypeScript

### Step 1: Set Environment Variable

In your test setup (e.g., `vitest.config.ts` or test helper):

```typescript
import { getSupabaseAdmin } from '@/shared/supabase/admin';

// Set app.environment to 'test'
const supabase = getSupabaseAdmin();
await supabase.rpc('set_app_environment', { env: 'test' });
```

Alternatively, set it via direct SQL in test setup:

```typescript
beforeAll(async () => {
  const supabase = getSupabaseAdmin();
  await supabase.rpc('execute_sql', {
    query: "SET app.environment = 'test';"
  });
});
```

### Step 2: Create Auth Users

Replace the failing `auth.admin.createUser()` call in `tests/fixtures/index.ts`:

**Before (BROKEN)**:
```typescript
const { data, error } = await supabase.auth.admin.createUser({
  id: userId, // ← Doesn't work!
  email,
  password,
  email_confirm: true,
  user_metadata: {},
});
```

**After (WORKING)**:
```typescript
import { createClient } from '@supabase/supabase-js';

// Use service role client for RPC call
const supabase = getSupabaseAdmin(); // Already uses service role

const { data, error } = await supabase.rpc('create_test_auth_user', {
  p_user_id: userId,
  p_email: email,
  p_encrypted_password: await hashPassword(password),
  p_email_confirmed: true,
});

if (error) {
  throw new Error(`Failed to create auth user ${email}: ${error.message}`);
}

if (!data.success) {
  throw new Error(`Failed to create auth user ${email}: ${data.error}`);
}

console.log(data.message); // "Test auth user created successfully"
```

### Step 3: Password Hashing Helper

Create a helper function for password hashing:

```typescript
/**
 * Hash password using PostgreSQL crypt() function
 *
 * Uses Blowfish algorithm (gen_salt('bf')) which is what Supabase Auth uses.
 */
async function hashPassword(password: string): Promise<string> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc('hash_password', {
    password,
  });

  if (error) {
    throw new Error(`Failed to hash password: ${error.message}`);
  }

  return data;
}
```

**Add this RPC function to migrations**:

```sql
CREATE OR REPLACE FUNCTION public.hash_password(password TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT crypt(password, gen_salt('bf'));
$$;

GRANT EXECUTE ON FUNCTION public.hash_password TO postgres;
```

### Complete Updated Function

Here's the complete updated `createAuthUser` function for `tests/fixtures/index.ts`:

```typescript
/**
 * Create auth user with specific UUID and auto-confirmed email
 *
 * Uses secure RPC function to insert directly into auth.users table.
 * This is necessary because auth.admin.createUser() doesn't support custom IDs.
 *
 * SECURITY: Only works in test environment (enforced by RPC function)
 */
async function createAuthUser(
  userId: string,
  email: string,
  password: string
): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Check if user already exists (idempotency check)
  const {
    data: { users: existingUsers },
  } = await supabase.auth.admin.listUsers();
  const existingUser = existingUsers.find(u => u.email === email);

  if (existingUser && existingUser.id === userId) {
    console.log(`Auth user ${email} already exists with correct ID`);
    return;
  }

  if (existingUser && existingUser.id !== userId) {
    console.log(`Deleting auth user ${email} with mismatched ID`);
    await supabase.auth.admin.deleteUser(existingUser.id);
  }

  // Hash password using PostgreSQL crypt() function
  const { data: hashedPassword, error: hashError } = await supabase.rpc('hash_password', {
    password,
  });

  if (hashError) {
    throw new Error(`Failed to hash password: ${hashError.message}`);
  }

  // Create auth user with RPC function
  const { data, error } = await supabase.rpc('create_test_auth_user', {
    p_user_id: userId,
    p_email: email,
    p_encrypted_password: hashedPassword,
    p_email_confirmed: true,
  });

  if (error) {
    throw new Error(`Failed to create auth user ${email}: ${error.message}`);
  }

  if (!data.success) {
    throw new Error(`Failed to create auth user ${email}: ${data.error || 'Unknown error'}`);
  }

  console.log(`Created auth user: ${email} (ID: ${userId})`);
}
```

## Function Response Format

### Success Response
```json
{
  "success": true,
  "user_id": "00000000-0000-0000-0000-000000000012",
  "email": "test@example.com",
  "message": "Test auth user created successfully"
}
```

### Idempotent Response (User Already Exists)
```json
{
  "success": true,
  "user_id": "00000000-0000-0000-0000-000000000012",
  "email": "test@example.com",
  "message": "Test auth user already exists (idempotent)"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message from PostgreSQL",
  "detail": "SQL error code"
}
```

## Testing the Migration

### 1. Apply the Migration

```bash
cd packages/course-gen-platform
supabase migration up
```

Or using Supabase MCP:
```typescript
// Via Claude Code's Supabase MCP tool
mcp__supabase__apply_migration({
  migration_name: "create_test_auth_user_function",
  migration_sql: "..." // contents of migration file
})
```

### 2. Verify Function Exists

```sql
-- Check function exists
SELECT
  p.proname as function_name,
  prosecdef as is_security_definer,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'create_test_auth_user';
```

Expected result:
- `function_name`: `create_test_auth_user`
- `is_security_definer`: `true`

### 3. Test in SQL Console

```sql
-- Set test environment
SET app.environment = 'test';

-- Create test user
SELECT create_test_auth_user(
  '00000000-0000-0000-0000-999999999999'::UUID,
  'test-sql@example.com',
  crypt('testpass123', gen_salt('bf')),
  TRUE
);

-- Verify user was created
SELECT id, email, email_confirmed_at, created_at
FROM auth.users
WHERE email = 'test-sql@example.com';

-- Try creating again (should be idempotent)
SELECT create_test_auth_user(
  '00000000-0000-0000-0000-999999999999'::UUID,
  'test-sql@example.com',
  crypt('testpass123', gen_salt('bf')),
  TRUE
);

-- Cleanup
DELETE FROM auth.users WHERE email = 'test-sql@example.com';
```

### 4. Test Security Check (Should Fail)

```sql
-- Try without setting environment (should fail)
SELECT create_test_auth_user(
  '00000000-0000-0000-0000-999999999999'::UUID,
  'test-fail@example.com',
  crypt('testpass123', gen_salt('bf')),
  TRUE
);
-- Expected error: "create_test_auth_user can only be called in test environment"
```

## Integration with Test Suite

### Global Test Setup

In `tests/setup.ts` or equivalent:

```typescript
import { getSupabaseAdmin } from '@/shared/supabase/admin';

// Set test environment globally
beforeAll(async () => {
  const supabase = getSupabaseAdmin();

  // Set app.environment to 'test'
  const { error } = await supabase.rpc('execute_sql', {
    query: "ALTER DATABASE postgres SET app.environment = 'test';"
  });

  if (error) {
    console.warn('Failed to set test environment:', error);
    // Fallback to session-level setting
    await supabase.rpc('execute_sql', {
      query: "SET app.environment = 'test';"
    });
  }
});
```

### Per-Test Auth User Creation

In individual test files:

```typescript
import { setupTestFixtures } from '@/tests/fixtures';

describe('My Feature', () => {
  beforeAll(async () => {
    // This will now use the RPC function internally
    await setupTestFixtures();
  });

  it('should work with test auth users', async () => {
    // Test code here
  });
});
```

## Security Considerations

### 1. Production Safety
- Function checks `app.environment = 'test'` before executing
- Will raise exception if called in production
- Granted to `service_role` only (tests use service role client)

### 2. CVE-2024-10976 Compliance
- Uses `SECURITY DEFINER` safely with `SET search_path`
- No SQL injection vectors (all parameters are typed)
- Minimal privilege scope (only INSERT into auth.users)

### 3. Audit Trail
All calls are logged in PostgreSQL logs:
```
NOTICE: create_test_auth_user called for user test@example.com
```

## Troubleshooting

### Error: "create_test_auth_user can only be called in test environment"

**Cause**: `app.environment` not set to 'test'

**Solution**:
```sql
ALTER DATABASE postgres SET app.environment = 'test';
-- Or
SET app.environment = 'test';
```

### Error: "permission denied for table users"

**Cause**: Function called with wrong role (not service_role)

**Solution**: Ensure you're using `getSupabaseAdmin()` which uses service role key:
```typescript
import { getSupabaseAdmin } from '@/shared/supabase/admin';
const supabase = getSupabaseAdmin(); // Uses SUPABASE_SERVICE_ROLE_KEY
```

### Error: "function create_test_auth_user does not exist"

**Cause**: Migration not applied

**Solution**:
```bash
cd packages/course-gen-platform
supabase migration up
```

### User Created but Password Login Fails

**Cause**: Password not hashed correctly

**Solution**: Use `crypt()` with `gen_salt('bf')`:
```typescript
const { data: hashed } = await supabase.rpc('hash_password', { password: 'test123' });
```

## References

- **Migration File**: `packages/course-gen-platform/supabase/migrations/20250115000001_create_test_auth_user_function.sql`
- **Fixtures File**: `packages/course-gen-platform/tests/fixtures/index.ts`
- **Supabase Auth Schema**: https://supabase.com/docs/guides/auth/managing-user-data
- **CVE-2024-10976**: SECURITY DEFINER best practices
- **PostgreSQL crypt()**: https://www.postgresql.org/docs/current/pgcrypto.html

## Next Steps

1. Apply migration to test database
2. Update `tests/fixtures/index.ts` with new RPC function
3. Add `hash_password` helper RPC function
4. Set `app.environment = 'test'` in test setup
5. Run test suite to verify auth user creation works
6. Remove old `auth.admin.createUser()` code after validation
