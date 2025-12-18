# pgTAP Test Setup Guide

This guide walks through setting up and running pgTAP tests for RLS policies.

## Quick Start

### 1. Install Supabase CLI

Choose one method:

**macOS/Linux (Homebrew)**

```bash
brew install supabase/tap/supabase
```

**npm (Global)**

```bash
npm install -g supabase
```

**npx (No Install)**

```bash
# Use npx prefix for all commands
npx supabase test db
```

**Verify Installation**

```bash
supabase --version
# Should show: 1.x.x or later
```

### 2. Start Local Supabase (Optional but Recommended)

For local testing without using remote database:

```bash
cd packages/course-gen-platform

# Initialize Supabase (if not already done)
supabase init

# Start local Supabase stack
supabase start

# This will output connection details including:
# - Database URL: postgresql://postgres:postgres@localhost:54322/postgres
# - Anon Key: eyJ...
# - Service Role Key: eyJ...
```

### 3. Run Tests

**Using pnpm script (recommended)**

```bash
cd packages/course-gen-platform
pnpm test:rls
```

**Direct Supabase CLI**

```bash
cd packages/course-gen-platform
supabase test db
```

**Against remote database**

```bash
# Set DATABASE_URL environment variable
export DATABASE_URL="postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres"

# Run tests
supabase test db --db-url $DATABASE_URL
```

## Expected Output

```
supabase/tests/database/000-setup-test-helpers.sql .. ok
supabase/tests/database/001-rls-policies.test.sql .. ok
All tests successful.
Files=2, Tests=9, 2.3 wallclock secs
Result: PASS
```

### Understanding Test Output

- **ok**: Test passed ✅
- **not ok**: Test failed ❌
- **Tests=9**: Total assertions run (8 RLS tests + 1 setup test)
- **Files=2**: Number of test files executed

## Troubleshooting

### Error: "extension 'pgtap' does not exist"

**Solution**: Ensure pgTAP is enabled in your database.

For local Supabase:

```bash
supabase start
```

For remote Supabase:

```sql
-- Run in SQL editor
create extension if not exists pgtap with schema extensions;
```

### Error: "extension 'http' does not exist"

**Solution**: Enable http extension.

```sql
create extension if not exists http with schema extensions;
```

### Error: "function tests.create_supabase_user does not exist"

**Solution**: Run setup file first to install test helpers.

```bash
# This should happen automatically, but if not:
psql $DATABASE_URL -f supabase/tests/database/000-setup-test-helpers.sql
```

### Error: "permission denied for schema tests"

**Solution**: Grant permissions to the test role.

```sql
grant usage on schema tests to postgres;
grant execute on all functions in schema tests to postgres;
```

### Tests Pass Locally but Fail in CI

**Common Causes**:

1. **Database state**: Ensure clean database state before tests
2. **Extensions**: Verify all required extensions are installed
3. **Permissions**: Check database user has necessary privileges

**Solution**: Add setup step in CI:

```yaml
- name: Setup Database
  run: |
    supabase db reset
    supabase test db
```

## Test Execution Workflow

### What Happens During Test Execution

1. **Setup Phase** (000-setup-test-helpers.sql)
   - Installs pgTAP extension
   - Installs database.dev package manager
   - Installs Supabase test helpers
   - Verifies setup

2. **Test Phase** (001-rls-policies.test.sql)
   - Begins transaction (`BEGIN`)
   - Creates test organizations
   - Creates test users with Supabase Auth
   - Runs 8 RLS policy tests
   - Rolls back transaction (`ROLLBACK`)

3. **Cleanup**
   - All test data automatically removed via `ROLLBACK`
   - No manual cleanup needed
   - Database returns to pre-test state

### Test Isolation Guarantees

✅ **Transaction Isolation**: Each test file runs in a transaction
✅ **Automatic Cleanup**: `ROLLBACK` removes all test data
✅ **No Side Effects**: Tests don't affect production data
✅ **Parallel Safe**: Multiple test runs won't interfere

## Running Individual Tests

### Run Single Test File

```bash
# Using psql directly
psql $DATABASE_URL -f supabase/tests/database/001-rls-policies.test.sql
```

### Run Specific Test Pattern

```bash
# Filter by test description
supabase test db | grep "Admin"
```

### Debug Single Assertion

```sql
-- In psql session
begin;

-- Setup test data
insert into organizations ...;
select tests.create_supabase_user(...);

-- Run single test
select tests.authenticate_as('admin1');
select results_eq(
    'select count(*)::int from courses',
    ARRAY[3],
    'Debug test'
);

-- Check actual data
select * from courses;

rollback;
```

## Performance Benchmarks

### Expected Execution Times

- **Setup**: ~1-2 seconds (first run only)
- **RLS Tests**: ~2-3 seconds
- **Total**: < 5 seconds

### Performance Tips

1. **Use Local Database**: Faster than remote
2. **Batch Assertions**: Group related tests
3. **Minimize Setup**: Reuse test data where possible
4. **Index Coverage**: Ensure RLS policies use indexed columns

## Integration with Existing Tests

### Current Test Structure

```
packages/course-gen-platform/
├── tests/                          # TypeScript tests
│   ├── unit/                       # Unit tests (Vitest)
│   ├── integration/                # Integration tests (Vitest)
│   │   └── rls-policies.test.ts   # DEPRECATED
│   └── fixtures/                   # Test data
└── supabase/
    └── tests/
        └── database/               # pgTAP tests (NEW)
            ├── 000-setup-test-helpers.sql
            └── 001-rls-policies.test.sql
```

### Test Commands

```bash
# Run TypeScript tests only
pnpm test

# Run pgTAP tests only
pnpm test:rls

# Run all tests
pnpm test:all
```

## Adding New RLS Tests

### Step 1: Identify Test Scenario

Example: "Instructor cannot view courses from other organizations"

### Step 2: Write Test in pgTAP

```sql
-- Add to 001-rls-policies.test.sql
-- Update plan count at top: select plan(9); -- Was 8, now 9

select tests.authenticate_as('instructor1');
select results_eq(
    $$
    select count(*)::int
    from courses
    where organization_id = '22222222-2222-2222-2222-222222222222'::uuid
    $$,
    ARRAY[0],
    'Instructor cannot see other org courses'
);
```

### Step 3: Run Tests

```bash
pnpm test:rls
```

### Step 4: Verify Coverage

Ensure test covers:

- ✅ Happy path (allowed access)
- ✅ Deny path (blocked access)
- ✅ Edge cases (empty results, cross-org)
- ✅ Role-specific behavior

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Database Tests

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  pgtap-tests:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: supabase/postgres:15.1.0.117
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v3

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Run Migrations
        run: |
          cd packages/course-gen-platform
          supabase db reset --db-url postgresql://postgres:postgres@localhost:5432/postgres

      - name: Run pgTAP Tests
        run: |
          cd packages/course-gen-platform
          supabase test db --db-url postgresql://postgres:postgres@localhost:5432/postgres

      - name: Upload Test Results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: pgtap-results
          path: test-results/
```

## Resources

### Documentation

- [pgTAP Official Docs](https://pgtap.org/)
- [Supabase Testing Guide](https://supabase.com/docs/guides/local-development/testing/overview)
- [Supabase Test Helpers](https://database.dev/basejump/supabase_test_helpers)

### Examples

- [usebasejump RLS Tests](https://github.com/usebasejump/basejump/tree/main/supabase/tests/database)
- [Supabase Examples](https://github.com/supabase/supabase/tree/master/examples)

### Community

- [Supabase Discord](https://discord.supabase.com)
- [pgTAP Mailing List](https://groups.google.com/g/pgtap-users)

## Next Steps

1. ✅ Tests are written and ready to run
2. 🔄 Install Supabase CLI (see above)
3. 🔄 Run `pnpm test:rls` to execute tests
4. ✅ Review test output and verify all 8 tests pass
5. 🔄 Integrate into CI/CD pipeline

## Questions?

If you encounter issues:

1. Check this guide's Troubleshooting section
2. Review the README.md in this directory
3. Check Supabase CLI logs: `supabase status`
4. Review test file syntax: `supabase/tests/database/001-rls-policies.test.sql`

---

**Status**: Implementation Complete ✅
**Tests Written**: 8/8 RLS scenarios
**Infrastructure**: Ready to run
**Next**: Install Supabase CLI and execute tests
