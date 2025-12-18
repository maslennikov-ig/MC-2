# Code Snippets: Test Auth User Integration

Quick copy-paste snippets for integrating the new RPC functions into your test suite.

---

## 1. Replace `createAuthUser()` in `tests/fixtures/index.ts`

**Location**: `tests/fixtures/index.ts` (around line 170)

**Replace this entire function**:

```typescript
/**
 * Create auth user with specific UUID and auto-confirmed email
 *
 * Uses secure RPC function to insert directly into auth.users table.
 * This is necessary because auth.admin.createUser() doesn't support custom IDs.
 *
 * SECURITY: Only works in test environment (enforced by RPC function)
 *
 * @throws Error if auth user creation fails or environment not set to 'test'
 */
async function createAuthUser(
  userId: string,
  email: string,
  password: string
): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Check if user already exists with correct ID (idempotency)
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

  // Hash password using Blowfish algorithm (same as Supabase Auth)
  const { data: hashedPassword, error: hashError } = await supabase.rpc('hash_password', {
    password,
  });

  if (hashError) {
    throw new Error(`Failed to hash password: ${hashError.message}`);
  }

  // Create auth user with predefined UUID via RPC function
  const { data, error } = await supabase.rpc('create_test_auth_user', {
    p_user_id: userId,
    p_email: email,
    p_encrypted_password: hashedPassword,
    p_email_confirmed: true,
  });

  if (error) {
    throw new Error(`Failed to create auth user ${email}: ${error.message}`);
  }

  if (!data || !data.success) {
    throw new Error(
      `Failed to create auth user ${email}: ${data?.error || 'Unknown error'}`
    );
  }

  console.log(`Created auth user: ${email} (ID: ${userId})`);
}
```

---

## 2. Add Environment Setup to Test Configuration

**Option A: Global Setup in `vitest.config.ts`**

Add to `globalSetup` section:

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globalSetup: './tests/setup.ts',
    // ... other config
  },
});
```

**Then create/update `tests/setup.ts`**:

```typescript
// tests/setup.ts
import { getSupabaseAdmin } from '../src/shared/supabase/admin';

export async function setup() {
  const supabase = getSupabaseAdmin();

  // Set test environment for auth user creation
  // This enables the create_test_auth_user RPC function
  try {
    // Try database-level setting (persistent)
    const { error } = await supabase.rpc('execute_sql', {
      query: "ALTER DATABASE postgres SET app.environment = 'test';",
    });

    if (error) {
      console.warn('Failed to set database-level environment, using session-level:', error);
      // Fallback to session-level setting
      await supabase.rpc('execute_sql', {
        query: "SET app.environment = 'test';",
      });
    }

    console.log('Test environment configured: app.environment = test');
  } catch (error) {
    console.error('Failed to configure test environment:', error);
    throw error;
  }
}

export async function teardown() {
  // Optional cleanup
  console.log('Test teardown complete');
}
```

**Option B: Per-Test-Suite Setup**

Add to individual test files:

```typescript
// tests/integration/some-test.test.ts
import { beforeAll, describe, it } from 'vitest';
import { getSupabaseAdmin } from '@/shared/supabase/admin';

describe('My Feature', () => {
  beforeAll(async () => {
    const supabase = getSupabaseAdmin();

    // Set test environment
    const { error } = await supabase.rpc('execute_sql', {
      query: "SET app.environment = 'test';",
    });

    if (error) {
      throw new Error(`Failed to set test environment: ${error.message}`);
    }

    // Setup fixtures (this will now use RPC functions)
    await setupTestFixtures();
  });

  // ... tests
});
```

---

## 3. Add Type Definitions for RPC Functions

**Add to `src/types/supabase-rpc.ts`** (create if doesn't exist):

```typescript
/**
 * Type definitions for custom Supabase RPC functions
 */

/**
 * Response from create_test_auth_user RPC function
 */
export interface CreateTestAuthUserResponse {
  success: boolean;
  user_id?: string;
  email?: string;
  message?: string;
  error?: string;
  detail?: string;
}

/**
 * Parameters for create_test_auth_user RPC function
 */
export interface CreateTestAuthUserParams {
  p_user_id: string;
  p_email: string;
  p_encrypted_password: string;
  p_email_confirmed: boolean;
}

/**
 * Parameters for hash_password RPC function
 */
export interface HashPasswordParams {
  password: string;
}

/**
 * Augment Supabase client with RPC function types
 */
declare module '@supabase/supabase-js' {
  interface SupabaseClient {
    rpc(
      fn: 'create_test_auth_user',
      params: CreateTestAuthUserParams
    ): Promise<{ data: CreateTestAuthUserResponse | null; error: any }>;

    rpc(
      fn: 'hash_password',
      params: HashPasswordParams
    ): Promise<{ data: string | null; error: any }>;
  }
}
```

**Then import in test files**:

```typescript
import '@/types/supabase-rpc';
```

---

## 4. Environment Variable Check

**Add to `.env.local.example`**:

```bash
# Test environment configuration
# IMPORTANT: NEVER set this to 'test' in production!
# This enables test-only RPC functions like create_test_auth_user
# APP_ENVIRONMENT=test  # Only for local development and CI testing
```

---

## 5. SQL Commands for Manual Testing

**Set Test Environment (Database-Level)**:

```bash
# Persistent across all connections
psql "$DATABASE_URL" -c "ALTER DATABASE postgres SET app.environment = 'test';"
```

**Set Test Environment (Session-Level)**:

```bash
# Only for current connection
psql "$DATABASE_URL" -c "SET app.environment = 'test';"
```

**Verify Environment**:

```bash
psql "$DATABASE_URL" -c "SHOW app.environment;"
# Expected output: test
```

**Test Auth User Creation (SQL)**:

```sql
-- Set environment
SET app.environment = 'test';

-- Create test user
SELECT create_test_auth_user(
  '99999999-9999-9999-9999-999999999999'::UUID,
  'test-manual@example.com',
  crypt('testpass123', gen_salt('bf')),
  TRUE
);

-- Verify user exists
SELECT id, email, email_confirmed_at, created_at
FROM auth.users
WHERE email = 'test-manual@example.com';

-- Cleanup
DELETE FROM auth.users WHERE email = 'test-manual@example.com';
```

---

## 6. Cleanup Function (Optional Enhancement)

**Add helper function to `tests/fixtures/index.ts`**:

```typescript
/**
 * Delete all test auth users (cleanup helper)
 *
 * Useful for cleaning up after test runs or when resetting test state.
 */
export async function cleanupAuthUsers(emails: string[]): Promise<void> {
  const supabase = getSupabaseAdmin();

  for (const email of emails) {
    const {
      data: { users },
    } = await supabase.auth.admin.listUsers();
    const user = users.find(u => u.email === email);

    if (user) {
      await supabase.auth.admin.deleteUser(user.id);
      console.log(`Deleted auth user: ${email}`);
    }
  }
}

// Example usage in test cleanup:
afterAll(async () => {
  await cleanupAuthUsers([
    TEST_USERS.INSTRUCTOR_1.email,
    TEST_USERS.INSTRUCTOR_2.email,
    TEST_USERS.STUDENT_1.email,
  ]);
});
```

---

## 7. CI/CD Integration

**Add to `.github/workflows/test.yml`** (or equivalent):

```yaml
- name: Setup Test Database
  run: |
    cd packages/course-gen-platform

    # Apply migrations
    supabase migration up

    # Set test environment
    psql "$DATABASE_URL" -c "ALTER DATABASE postgres SET app.environment = 'test';"

    # Verify functions exist
    psql "$DATABASE_URL" -c "\\df public.create_test_auth_user"
    psql "$DATABASE_URL" -c "\\df public.hash_password"

- name: Run Tests
  run: npm test
```

---

## 8. Debugging Helpers

**Check if RPC functions exist**:

```typescript
// tests/helpers/check-rpc-functions.ts
import { getSupabaseAdmin } from '@/shared/supabase/admin';

export async function checkRpcFunctionsExist(): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Check create_test_auth_user
  try {
    const { error } = await supabase.rpc('create_test_auth_user', {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_email: 'check@example.com',
      p_encrypted_password: 'test',
      p_email_confirmed: true,
    });

    if (error && error.message.includes('does not exist')) {
      throw new Error('RPC function create_test_auth_user does not exist. Did you apply migrations?');
    }
  } catch (error: any) {
    if (error.message.includes('test environment')) {
      console.log('✅ create_test_auth_user exists (environment check working)');
    } else {
      throw error;
    }
  }

  // Check hash_password
  const { error: hashError } = await supabase.rpc('hash_password', {
    password: 'test',
  });

  if (hashError && hashError.message.includes('does not exist')) {
    throw new Error('RPC function hash_password does not exist. Did you apply migrations?');
  }

  console.log('✅ hash_password exists');
}
```

**Call in test setup**:

```typescript
beforeAll(async () => {
  await checkRpcFunctionsExist();
  await setupTestFixtures();
});
```

---

## 9. Error Handling Example

**Robust auth user creation with retry**:

```typescript
/**
 * Create auth user with retry logic
 */
async function createAuthUserWithRetry(
  userId: string,
  email: string,
  password: string,
  maxRetries = 3
): Promise<void> {
  const supabase = getSupabaseAdmin();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Hash password
      const { data: hashedPassword, error: hashError } = await supabase.rpc('hash_password', {
        password,
      });

      if (hashError) {
        throw new Error(`Failed to hash password: ${hashError.message}`);
      }

      // Create auth user
      const { data, error } = await supabase.rpc('create_test_auth_user', {
        p_user_id: userId,
        p_email: email,
        p_encrypted_password: hashedPassword,
        p_email_confirmed: true,
      });

      if (error) {
        // Check if it's an environment error (don't retry)
        if (error.message.includes('test environment')) {
          throw new Error(
            `Environment not set to 'test'. Run: ALTER DATABASE postgres SET app.environment = 'test';`
          );
        }
        throw error;
      }

      if (!data || !data.success) {
        throw new Error(data?.error || 'Unknown error');
      }

      console.log(`✅ Created auth user: ${email} (attempt ${attempt}/${maxRetries})`);
      return;
    } catch (error) {
      console.warn(`Attempt ${attempt}/${maxRetries} failed:`, error);

      if (attempt === maxRetries) {
        throw new Error(`Failed to create auth user ${email} after ${maxRetries} attempts`);
      }

      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
    }
  }
}
```

---

## 10. Test Verification Script

**Create `scripts/verify-test-auth-setup.ts`**:

```typescript
#!/usr/bin/env tsx
/**
 * Verify test auth user creation setup
 */

import { getSupabaseAdmin } from '../src/shared/supabase/admin';

async function main() {
  const supabase = getSupabaseAdmin();

  console.log('🔍 Verifying test auth setup...\n');

  // Check 1: Environment setting
  console.log('1. Checking app.environment setting...');
  try {
    const { data, error } = await supabase.rpc('execute_sql', {
      query: "SHOW app.environment;",
    });

    if (error) {
      console.error('   ❌ Failed to check environment:', error.message);
    } else {
      console.log(`   ✅ app.environment = ${data || 'NOT SET'}`);
    }
  } catch (error: any) {
    console.error('   ❌ Error:', error.message);
  }

  // Check 2: RPC functions exist
  console.log('\n2. Checking RPC functions...');

  const functions = ['create_test_auth_user', 'hash_password'];

  for (const fn of functions) {
    try {
      const { data, error } = await supabase.rpc('execute_sql', {
        query: `SELECT proname FROM pg_proc WHERE proname = '${fn}';`,
      });

      if (error || !data) {
        console.error(`   ❌ ${fn} does not exist`);
      } else {
        console.log(`   ✅ ${fn} exists`);
      }
    } catch (error: any) {
      console.error(`   ❌ Error checking ${fn}:`, error.message);
    }
  }

  // Check 3: Test auth user creation
  console.log('\n3. Testing auth user creation...');

  const testUserId = '99999999-9999-9999-9999-999999999999';
  const testEmail = 'test-verify@example.com';

  try {
    // Hash password
    const { data: hashedPassword, error: hashError } = await supabase.rpc('hash_password', {
      password: 'testpass123',
    });

    if (hashError) {
      console.error('   ❌ Failed to hash password:', hashError.message);
      return;
    }

    console.log('   ✅ Password hashed successfully');

    // Create user
    const { data, error } = await supabase.rpc('create_test_auth_user', {
      p_user_id: testUserId,
      p_email: testEmail,
      p_encrypted_password: hashedPassword,
      p_email_confirmed: true,
    });

    if (error) {
      console.error('   ❌ Failed to create auth user:', error.message);
      return;
    }

    if (!data.success) {
      console.error('   ❌ Auth user creation returned error:', data.error);
      return;
    }

    console.log('   ✅ Auth user created:', data.message);

    // Cleanup
    await supabase.auth.admin.deleteUser(testUserId);
    console.log('   ✅ Cleanup successful');
  } catch (error: any) {
    console.error('   ❌ Error:', error.message);
  }

  console.log('\n✅ Verification complete!');
}

main().catch(console.error);
```

**Run it**:

```bash
npm run tsx scripts/verify-test-auth-setup.ts
```

---

## Summary

These snippets cover:

1. ✅ Updated `createAuthUser()` function
2. ✅ Test environment setup (global and per-suite)
3. ✅ TypeScript type definitions
4. ✅ Environment variable configuration
5. ✅ SQL commands for manual testing
6. ✅ Cleanup helper functions
7. ✅ CI/CD integration
8. ✅ Debugging helpers
9. ✅ Error handling with retry
10. ✅ Verification script

**Next Step**: Copy the relevant snippets into your codebase and run tests!
