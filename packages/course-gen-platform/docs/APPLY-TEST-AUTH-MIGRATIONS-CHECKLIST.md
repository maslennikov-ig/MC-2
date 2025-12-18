# Quick Start: Apply Test Auth User Migrations

This checklist guides you through applying the new test auth user creation migrations.

---

## Prerequisites

- [ ] Supabase CLI installed (`supabase --version`)
- [ ] Local Supabase instance running (`supabase status`)
- [ ] Service role key in `.env.local`

---

## Step 1: Apply Migrations

```bash
cd packages/course-gen-platform

# Apply both migrations
supabase migration up
```

**Expected Output**:
```
Applying migration 20250115000001_create_test_auth_user_function.sql...
NOTICE: Verification passed: create_test_auth_user function created successfully
Applying migration 20250115000002_create_hash_password_helper.sql...
NOTICE: Verification passed: hash_password function created successfully
```

---

## Step 2: Set Test Environment

**Option A: Database-level (Recommended)**
```sql
psql "$DATABASE_URL" -c "ALTER DATABASE postgres SET app.environment = 'test';"
```

**Option B: Session-level (For single session)**
```sql
psql "$DATABASE_URL" -c "SET app.environment = 'test';"
```

**Verify**:
```sql
psql "$DATABASE_URL" -c "SHOW app.environment;"
# Expected output: test
```

---

## Step 3: Verify Functions Exist

```bash
psql "$DATABASE_URL" -c "\\df public.create_test_auth_user"
psql "$DATABASE_URL" -c "\\df public.hash_password"
```

**Expected Output**:
```
                               List of functions
 Schema |         Name            | Result data type | Argument data types
--------+-------------------------+------------------+---------------------
 public | create_test_auth_user   | jsonb            | uuid, text, text, boolean
 public | hash_password           | text             | text
```

---

## Step 4: Test SQL Functionality (Optional)

```sql
psql "$DATABASE_URL" <<'EOF'
-- Set test environment
SET app.environment = 'test';

-- Test hash_password
SELECT hash_password('testpass123');

-- Test create_test_auth_user
SELECT create_test_auth_user(
  '99999999-9999-9999-9999-999999999999'::UUID,
  'test-quickstart@example.com',
  crypt('testpass123', gen_salt('bf')),
  TRUE
);

-- Verify user exists
SELECT id, email, email_confirmed_at FROM auth.users WHERE email = 'test-quickstart@example.com';

-- Cleanup
DELETE FROM auth.users WHERE email = 'test-quickstart@example.com';
EOF
```

**Expected Results**:
1. `hash_password` returns a string starting with `$2a$` or `$2b$`
2. `create_test_auth_user` returns `{"success": true, ...}`
3. User appears in `auth.users` with correct ID
4. Cleanup removes the user

---

## Step 5: Update Test Fixtures

Edit `tests/fixtures/index.ts` and replace the `createAuthUser` function:

**Find** (around line 170):
```typescript
const { data, error } = await supabase.auth.admin.createUser({
  id: userId,
  email,
  password,
  email_confirm: true,
  user_metadata: {},
});
```

**Replace with**:
```typescript
// Hash password
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
```

---

## Step 6: Run Tests

```bash
# Run all tests
npm test

# Or run specific integration tests
npm test -- tests/integration/stage4-full-workflow.test.ts
```

**Expected**:
- ✅ All tests pass
- ✅ No "Database error creating new user" errors
- ✅ Auth users created with stable IDs

---

## Step 7: Verify Test User Stability

Run tests twice to verify idempotency:

```bash
npm test -- tests/integration/stage4-full-workflow.test.ts
npm test -- tests/integration/stage4-full-workflow.test.ts
```

**Check**:
- [ ] Same test user IDs across runs
- [ ] No duplicate user errors
- [ ] Tests complete in similar time

---

## Troubleshooting

### Error: "create_test_auth_user can only be called in test environment"

**Solution**: Set `app.environment = 'test'` (see Step 2)

```sql
psql "$DATABASE_URL" -c "ALTER DATABASE postgres SET app.environment = 'test';"
```

### Error: "function create_test_auth_user does not exist"

**Solution**: Apply migrations (see Step 1)

```bash
cd packages/course-gen-platform
supabase migration up
```

### Error: "permission denied for function create_test_auth_user"

**Solution**: Ensure you're using service role client

```typescript
import { getSupabaseAdmin } from '@/shared/supabase/admin';
const supabase = getSupabaseAdmin(); // Uses SUPABASE_SERVICE_ROLE_KEY
```

### Tests Still Failing After Update

**Debug Steps**:

1. **Check environment variable**:
   ```bash
   psql "$DATABASE_URL" -c "SHOW app.environment;"
   ```

2. **Verify functions exist**:
   ```bash
   psql "$DATABASE_URL" -c "\\df public.create_test_auth_user"
   ```

3. **Check for existing users with wrong IDs**:
   ```sql
   SELECT id, email FROM auth.users WHERE email LIKE '%test%';
   ```

4. **Manual cleanup**:
   ```sql
   DELETE FROM auth.users WHERE email LIKE '%@megacampus.com';
   ```

---

## Success Criteria

✅ **Migrations Applied**:
- Functions exist in database
- Verification notices in migration log

✅ **Environment Set**:
- `app.environment = 'test'` configured
- Verified with `SHOW app.environment`

✅ **Test Fixtures Updated**:
- `createAuthUser()` uses RPC function
- No more `auth.admin.createUser()` calls

✅ **Tests Pass**:
- All integration tests pass
- No auth user creation errors
- Test users have stable, predefined IDs

---

## Documentation References

- **Detailed Guide**: `docs/database/TEST-AUTH-USER-CREATION.md`
- **Migration Summary**: `docs/database/MIGRATION-SUMMARY-20250115-TEST-AUTH-USERS.md`
- **Migration Files**:
  - `supabase/migrations/20250115000001_create_test_auth_user_function.sql`
  - `supabase/migrations/20250115000002_create_hash_password_helper.sql`

---

## Next Steps After Verification

1. **Commit Changes**:
   ```bash
   git add supabase/migrations/20250115*.sql
   git add docs/database/*.md
   git add tests/fixtures/index.ts
   git commit -m "feat(db): add RPC functions for test auth user creation with predefined IDs"
   ```

2. **Update CI/CD** (if needed):
   - Ensure CI runs migrations before tests
   - Set `app.environment = 'test'` in test environment

3. **Monitor** (first few test runs):
   - Check auth user creation time (should be ~10-20ms per user)
   - Verify no duplicate users in database
   - Confirm idempotency works across test runs

---

**Status**: Ready to apply! Follow steps 1-7 above.
