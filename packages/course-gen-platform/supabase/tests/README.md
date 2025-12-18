# Supabase RLS Test Suite

## Overview

This directory contains pgTAP tests for database Row Level Security (RLS) policies. These tests ensure multi-tenant data isolation and role-based access control work correctly across the entire platform.

## Test Files

| File                                  | Description               | Tests      | Status         |
| ------------------------------------- | ------------------------- | ---------- | -------------- |
| `database/000-setup-test-helpers.sql` | pgTAP setup and utilities | Setup only | ✅ Complete    |
| `database/001-rls-policies.test.sql`  | Main RLS test suite       | 24 tests   | ✅ All passing |

## Running Tests

```bash
# From package directory
cd packages/course-gen-platform
pnpm test:rls
```

### Expected Output

```
./database/000-setup-test-helpers.sql .. ok
./database/001-rls-policies.test.sql ... ok
All tests successful.
Files=2, Tests=25,  1 wallclock secs
Result: PASS
```

## Test Coverage (24 scenarios, 100% passing)

### Scenario 1: Admin Access (3 tests)

✅ Admin sees all courses in their organization
✅ Admin cannot see other organization courses
✅ Admin sees all users in their organization

### Scenario 2-8: Complete coverage

See main README.md for full scenario list.

**Total: 24 scenarios, 100% passing**

## Resources

- [Supabase Testing Guide](https://supabase.com/docs/guides/local-development/testing/overview)
- [pgTAP Documentation](https://pgtap.org/documentation.html)
- [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

---

**Last Updated:** 2025-10-12  
**Test Status:** ✅ 24/24 passing (100%)  
**Priority:** P0 - Critical (Security)
