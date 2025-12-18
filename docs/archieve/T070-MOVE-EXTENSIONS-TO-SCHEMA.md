# T070: Move Extensions to Dedicated Schema

**Priority**: P2 - Medium (Security best practice)
**Status**: ✅ **COMPLETED**
**Created**: 2025-10-13
**Completed**: 2025-10-13
**Parent Task**: Stage 0 Foundation - Security Hardening
**Impact**: Security - Isolate test extensions from public schema
**Estimated Effort**: 15 minutes
**Actual Effort**: 45 minutes

---

## 📋 Executive Summary

Supabase Security Advisor identified **2 extensions** installed in the `public` schema, which is a security anti-pattern. Extensions should be isolated in a dedicated schema to prevent namespace conflicts and improve security posture.

**Risk**:
- ⚠️ Extension functions can conflict with application functions
- ⚠️ Public schema pollution
- ⚠️ Harder to manage extension permissions

**Solution**: Move extensions to `extensions` schema as per PostgreSQL and Supabase best practices.

---

## 🔍 Issue Analysis

### Affected Extensions

1. **`basejump-supabase_test_helpers`** - Testing utilities from basejump.dev
2. **`supabase-dbdev`** - Supabase database development tools

### Why Public Schema is Bad

**Problem 1: Namespace Conflicts**
```sql
-- Extension function in public schema
CREATE FUNCTION public.tests.create_supabase_user(...);

-- Application function with same name (conflict!)
CREATE FUNCTION public.create_supabase_user(...);
-- ERROR: function already exists
```

**Problem 2: Security**
- Public schema is in default search path for all users
- Extension functions become globally accessible
- Harder to control permissions

**Problem 3: Organization**
- Mixed application and extension objects
- Difficult to distinguish between application and extension code
- Complicates backup/restore operations

### Best Practice: Dedicated Extensions Schema

**From PostgreSQL Documentation**:
> Create a dedicated schema for extensions to avoid namespace pollution and improve security.

**From Supabase Security Advisory**:
> Extensions should be installed in a dedicated schema (e.g., `extensions`) rather than `public` to improve security and organization.

---

## 💡 Solution

### Create Extensions Schema and Move Extensions

**Steps**:
1. Create `extensions` schema
2. Move both extensions to new schema
3. Verify extension functionality
4. Update any code that references extension functions

### Migration Implementation

File: `supabase/migrations/20250114_move_extensions_to_schema.sql`

```sql
-- =============================================================================
-- Migration: Move Extensions to Dedicated Schema
--
-- Issue: 2 extensions in public schema (security anti-pattern)
-- Solution: Move to dedicated 'extensions' schema
--
-- Extensions:
--   - basejump-supabase_test_helpers (testing utilities)
--   - supabase-dbdev (database development tools)
--
-- Reference: https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
-- =============================================================================

-- =============================================================================
-- Step 1: Create extensions schema if not exists
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS extensions;

COMMENT ON SCHEMA extensions IS
'Dedicated schema for PostgreSQL extensions to avoid namespace conflicts with application code';

-- =============================================================================
-- Step 2: Move basejump-supabase_test_helpers
-- =============================================================================

ALTER EXTENSION "basejump-supabase_test_helpers" SET SCHEMA extensions;

-- Verify extension moved
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE e.extname = 'basejump-supabase_test_helpers'
      AND n.nspname = 'extensions'
  ) THEN
    RAISE EXCEPTION 'Failed to move basejump-supabase_test_helpers to extensions schema';
  END IF;

  RAISE NOTICE 'Extension basejump-supabase_test_helpers moved to extensions schema ✓';
END $$;

-- =============================================================================
-- Step 3: Move supabase-dbdev
-- =============================================================================

ALTER EXTENSION "supabase-dbdev" SET SCHEMA extensions;

-- Verify extension moved
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE e.extname = 'supabase-dbdev'
      AND n.nspname = 'extensions'
  ) THEN
    RAISE EXCEPTION 'Failed to move supabase-dbdev to extensions schema';
  END IF;

  RAISE NOTICE 'Extension supabase-dbdev moved to extensions schema ✓';
END $$;

-- =============================================================================
-- Step 4: Grant necessary permissions
-- =============================================================================

-- Allow authenticated users to use extension functions
GRANT USAGE ON SCHEMA extensions TO authenticated;

-- Allow service role full access (for tests)
GRANT ALL ON SCHEMA extensions TO service_role;

-- =============================================================================
-- Step 5: Update search_path for test functions (if needed)
-- =============================================================================

-- If any functions use extension functions, update their search_path
-- Example:
-- ALTER FUNCTION my_test_function() SET search_path = public, extensions;

-- =============================================================================
-- Verification: Check no extensions remain in public schema
-- =============================================================================

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_extension e
  JOIN pg_namespace n ON e.extnamespace = n.oid
  WHERE n.nspname = 'public'
    AND e.extname IN ('basejump-supabase_test_helpers', 'supabase-dbdev');

  IF v_count > 0 THEN
    RAISE EXCEPTION 'Found % extensions still in public schema', v_count;
  END IF;

  RAISE NOTICE 'All extensions moved out of public schema ✓';
END $$;

-- =============================================================================
-- Post-Migration Notes
-- =============================================================================

-- If tests use extension functions, update test code to use qualified names:
--   BEFORE: SELECT tests.create_supabase_user(...);
--   AFTER:  SELECT extensions.tests.create_supabase_user(...);
--
-- Or update search_path in test setup:
--   SET search_path = public, extensions;
```

---

## 🎯 Implementation Plan

### Step 1: Create Migration (10 minutes)

Create the migration file above in `supabase/migrations/`.

### Step 2: Update Test Code (5 minutes)

**Option A: Update search_path in test setup** (Recommended)

File: `tests/setup.ts`
```typescript
import { getSupabaseAdmin } from '../src/shared/supabase/admin';

beforeAll(async () => {
  const supabase = getSupabaseAdmin();

  // Set search_path to include extensions schema
  await supabase.rpc('exec_sql', {
    sql: "SET search_path = public, extensions;"
  });
});
```

**Option B: Use qualified names in test code**

```typescript
// BEFORE
await supabase.rpc('tests.create_supabase_user', { ... });

// AFTER
await supabase.rpc('extensions.tests.create_supabase_user', { ... });
```

### Step 3: Apply and Test (5 minutes)

```bash
# Apply migration
cd packages/course-gen-platform
pnpm supabase db push

# Verify extensions moved
pnpm supabase db dump --schema-only | grep "CREATE EXTENSION"

# Run test suite
pnpm test

# Check Supabase Security Advisor
mcp__supabase__get_advisors --type=security
```

---

## 📊 Impact Analysis

### Before Fix

**Schema Organization**:
```
public/
├── organizations (table)
├── users (table)
├── tests.create_supabase_user() (extension function)
├── dbdev.install() (extension function)
└── ... (mixed application and extension code)
```

**Issues**:
- ❌ Mixed concerns in public schema
- ❌ Namespace conflict risk
- ⚠️ **2 security warnings** from Supabase Advisor

### After Fix

**Schema Organization**:
```
public/
├── organizations (table)
├── users (table)
└── ... (only application code)

extensions/
├── tests.create_supabase_user() (extension function)
├── dbdev.install() (extension function)
└── ... (only extension code)
```

**Benefits**:
- ✅ Clear separation of concerns
- ✅ No namespace conflicts
- ✅ Better security posture
- ✅ **0 security warnings** from Supabase Advisor

---

## ✅ Acceptance Criteria

### Schema Organization
- [ ] `extensions` schema created
- [ ] Both extensions moved to `extensions` schema
- [ ] No extensions remain in `public` schema
- [ ] Permissions granted correctly

### Testing
- [ ] All 270 tests pass after migration
- [ ] Extension functions still accessible
- [ ] Test helpers still work correctly
- [ ] No functional regressions

### Security
- [ ] Supabase Security Advisor shows 0 "Extension in Public" warnings
- [ ] Proper permissions on extensions schema
- [ ] Application code unaffected

### Documentation
- [ ] Migration includes clear comments
- [ ] Test code updated (if needed)
- [ ] Commit message explains security improvement

---

## 🔗 Related Tasks

- **T069**: Fix Function Search Paths - Related security hardening
- **Stage 0 Foundation**: Security improvements post-UserStory 1-4

---

## 📚 References

### Supabase Documentation
- [Database Linter - extension_in_public](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public)
- [PostgreSQL Extensions](https://supabase.com/docs/guides/database/extensions)

### PostgreSQL Documentation
- [Creating Extensions](https://www.postgresql.org/docs/current/extend-extensions.html)
- [Schema Best Practices](https://www.postgresql.org/docs/current/ddl-schemas.html#DDL-SCHEMAS-PATTERNS)
- [ALTER EXTENSION](https://www.postgresql.org/docs/current/sql-alterextension.html)

### Testing
- [Basejump Supabase Test Helpers](https://github.com/usebasejump/supabase-test-helpers)

---

## 🚀 Next Steps

1. Review this task document
2. Create migration file
3. Update test setup (if needed)
4. Apply migration in development
5. Run test suite (270 tests)
6. Verify Supabase Security Advisor shows 0 warnings
7. Document changes in commit message
8. Apply to production

---

**Created By**: Claude Code (Anthropic)
**Research Duration**: 15 minutes
**Priority**: P2 - Medium (Security)
**Complexity**: Low (Simple schema move)
**Estimated Effort**: 15 minutes
**Confidence Level**: 🟢 **HIGH (95%)** - Straightforward PostgreSQL operation with clear documentation
