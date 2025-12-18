# T072: Consolidate RLS Policies

**Priority**: P3 - Low (Code quality improvement)
**Status**: ⏳ **PENDING**
**Created**: 2025-10-13
**Completed**: -
**Parent Task**: Stage 0 Foundation - Quality Improvements
**Impact**: Code Quality - Simplify maintenance, improve readability
**Estimated Effort**: 4-6 hours
**Actual Effort**: -

---

## 📋 Executive Summary

Supabase Performance Advisor identified **26 tables** with multiple permissive RLS policies for the same operation (SELECT/INSERT/UPDATE/DELETE). This creates maintenance overhead and makes it harder to understand access control logic.

**Current State**:
- Each role (admin, instructor, student) has separate policies
- 3-4 policies per table for same operation
- Duplicated logic across policies
- Harder to maintain and audit

**Recommended State**:
- Single consolidated policy per operation
- Role-based logic using CASE statements
- Clearer access control logic
- Easier to maintain and audit

**Note**: This is a **P3 - Low Priority** task. The current multiple-policy approach is functionally correct and performs well. This consolidation is purely for code quality and maintainability improvements.

---

## 🔍 Issue Analysis

### Current Pattern: Multiple Permissive Policies

**Example: `courses` table**
```sql
-- Policy 1: Admin access (permissive)
CREATE POLICY "courses_admin_all" ON courses
FOR ALL USING (
  organization_id IN (
    SELECT organization_id FROM users
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  )
);

-- Policy 2: Instructor access (permissive)
CREATE POLICY "courses_instructor_own" ON courses
FOR ALL USING (user_id = (SELECT auth.uid()));

-- Policy 3: Instructor view (permissive)
CREATE POLICY "courses_instructor_view_org" ON courses
FOR SELECT USING (
  organization_id IN (
    SELECT organization_id FROM users
    WHERE id = (SELECT auth.uid()) AND role = 'instructor'
  )
);

-- Policy 4: Student access (permissive)
CREATE POLICY "courses_student_enrolled" ON courses
FOR SELECT USING (
  id IN (
    SELECT course_id FROM course_enrollments
    WHERE user_id = (SELECT auth.uid()) AND status = 'active'
  )
);
```

**Execution**: PostgreSQL evaluates ALL 4 policies with OR logic.

**Problems**:
- ⚠️ Duplicated organization check logic
- ⚠️ Hard to see complete access control picture
- ⚠️ 4 policies to maintain when making changes
- ⚠️ Performance impact minimal but measurable (4 policy evaluations)

### Proposed Pattern: Single Consolidated Policy

**Example: `courses` table (consolidated)**
```sql
-- Single policy with role-based logic
CREATE POLICY "courses_access" ON courses
FOR ALL USING (
  CASE (SELECT role FROM users WHERE id = (SELECT auth.uid()))
    -- Admin: Full access to organization courses
    WHEN 'admin' THEN
      organization_id IN (
        SELECT organization_id FROM users
        WHERE id = (SELECT auth.uid())
      )
    -- Instructor: Own courses + view org courses (read-only)
    WHEN 'instructor' THEN (
      user_id = (SELECT auth.uid())
      OR (
        pg_catalog.current_setting('request.method', true) = 'GET'
        AND organization_id IN (
          SELECT organization_id FROM users
          WHERE id = (SELECT auth.uid())
        )
      )
    )
    -- Student: Enrolled courses (read-only)
    WHEN 'student' THEN (
      pg_catalog.current_setting('request.method', true) = 'GET'
      AND id IN (
        SELECT course_id FROM course_enrollments
        WHERE user_id = (SELECT auth.uid()) AND status = 'active'
      )
    )
    ELSE FALSE
  END
);
```

**Benefits**:
- ✅ Single policy to maintain
- ✅ Clear role-based access control
- ✅ Easier to audit and reason about
- ✅ Slightly better performance (single policy evaluation)

---

## 📊 Affected Tables

Total: **26 tables** (all tables with RLS)

### Tables with 4+ Policies

1. **courses** (4 policies → 1)
2. **sections** (4 policies → 1)
3. **lessons** (4 policies → 1)
4. **lesson_content** (4 policies → 1)
5. **file_catalog** (4 policies → 1)
6. **course_enrollments** (4 policies → 1)
7. **job_status** (8 policies → 2: SELECT policy + MODIFY policy)

### Tables with 3 Policies

8. **organizations** (3 policies → 1)
9. **users** (3 policies → 1)

---

## 💡 Proposed Solution

### Strategy: Operation-Based Consolidation

Instead of role-based policies, create operation-based policies:

1. **READ Policy** (FOR SELECT)
   - Consolidates all SELECT permissions
   - Uses CASE for role-based logic

2. **MODIFY Policy** (FOR INSERT, UPDATE, DELETE)
   - Consolidates write permissions
   - More restrictive by default

### Implementation Pattern

**Template**:
```sql
-- READ policy (SELECT)
CREATE POLICY "{table}_read" ON {table}
FOR SELECT USING (
  CASE (SELECT role FROM users WHERE id = (SELECT auth.uid()))
    WHEN 'admin' THEN
      -- Admin read logic
    WHEN 'instructor' THEN
      -- Instructor read logic
    WHEN 'student' THEN
      -- Student read logic
    ELSE FALSE
  END
);

-- MODIFY policy (INSERT, UPDATE, DELETE)
CREATE POLICY "{table}_modify" ON {table}
FOR ALL USING (
  CASE (SELECT role FROM users WHERE id = (SELECT auth.uid()))
    WHEN 'admin' THEN
      -- Admin modify logic
    WHEN 'instructor' THEN
      -- Instructor modify logic (typically more restrictive)
    ELSE FALSE
  END
);
```

---

## 🎯 Implementation Plan

### Step 1: Backup Current Policies (30 min)

```bash
# Export current RLS policies
cd packages/course-gen-platform
pnpm supabase db dump --schema-only > backup_rls_policies.sql

# Or use MCP
mcp__supabase__execute_sql "
SELECT schemaname, tablename, policyname,
       pg_get_policydef(oid) AS policy_definition
FROM pg_policies
JOIN pg_policy ON pg_policies.policyname = pg_policy.polname
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
"
```

### Step 2: Create Migration File (3-4 hours)

File: `supabase/migrations/20250114_consolidate_rls_policies.sql`

```sql
-- =============================================================================
-- Migration: Consolidate RLS Policies
--
-- Issue: 26 tables have multiple permissive policies (maintenance overhead)
-- Solution: Consolidate to 1-2 policies per table using role-based CASE logic
--
-- Benefits:
--   - Simpler maintenance (1-2 policies vs 3-8 policies per table)
--   - Clearer access control logic
--   - Easier to audit
--   - Slightly better performance
--
-- Reference: https://supabase.com/docs/guides/database/database-linter
-- =============================================================================

-- =============================================================================
-- COURSES TABLE (4 policies → 2 policies)
-- =============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "courses_admin_all" ON courses;
DROP POLICY IF EXISTS "courses_instructor_own" ON courses;
DROP POLICY IF EXISTS "courses_instructor_view_org" ON courses;
DROP POLICY IF EXISTS "courses_student_enrolled" ON courses;

-- Consolidated READ policy
CREATE POLICY "courses_read" ON courses
FOR SELECT USING (
  CASE (SELECT role FROM users WHERE id = (SELECT auth.uid()))
    -- Admin: All org courses
    WHEN 'admin' THEN
      organization_id IN (
        SELECT organization_id FROM users WHERE id = (SELECT auth.uid())
      )
    -- Instructor: All org courses (read-only)
    WHEN 'instructor' THEN
      organization_id IN (
        SELECT organization_id FROM users WHERE id = (SELECT auth.uid())
      )
    -- Student: Enrolled courses only
    WHEN 'student' THEN
      id IN (
        SELECT course_id FROM course_enrollments
        WHERE user_id = (SELECT auth.uid()) AND status = 'active'
      )
    ELSE FALSE
  END
);

-- Consolidated MODIFY policy
CREATE POLICY "courses_modify" ON courses
FOR ALL USING (
  CASE (SELECT role FROM users WHERE id = (SELECT auth.uid()))
    -- Admin: Full access to org courses
    WHEN 'admin' THEN
      organization_id IN (
        SELECT organization_id FROM users WHERE id = (SELECT auth.uid())
      )
    -- Instructor: Only own courses
    WHEN 'instructor' THEN
      user_id = (SELECT auth.uid())
    -- Student: No modify access
    ELSE FALSE
  END
);

COMMENT ON POLICY "courses_read" ON courses IS
'Consolidated read policy: Admin & Instructor see all org courses, Students see enrolled courses';

COMMENT ON POLICY "courses_modify" ON courses IS
'Consolidated modify policy: Admin full access to org, Instructor only own courses';

-- =============================================================================
-- SECTIONS TABLE (4 policies → 2 policies)
-- =============================================================================

DROP POLICY IF EXISTS "sections_admin_all" ON sections;
DROP POLICY IF EXISTS "sections_instructor_own" ON sections;
DROP POLICY IF EXISTS "sections_instructor_view_org" ON sections;
DROP POLICY IF EXISTS "sections_student_enrolled" ON sections;

CREATE POLICY "sections_read" ON sections
FOR SELECT USING (
  CASE (SELECT role FROM users WHERE id = (SELECT auth.uid()))
    WHEN 'admin' THEN
      course_id IN (
        SELECT id FROM courses
        WHERE organization_id IN (
          SELECT organization_id FROM users WHERE id = (SELECT auth.uid())
        )
      )
    WHEN 'instructor' THEN
      course_id IN (
        SELECT id FROM courses
        WHERE organization_id IN (
          SELECT organization_id FROM users WHERE id = (SELECT auth.uid())
        )
      )
    WHEN 'student' THEN
      course_id IN (
        SELECT course_id FROM course_enrollments
        WHERE user_id = (SELECT auth.uid()) AND status = 'active'
      )
    ELSE FALSE
  END
);

CREATE POLICY "sections_modify" ON sections
FOR ALL USING (
  CASE (SELECT role FROM users WHERE id = (SELECT auth.uid()))
    WHEN 'admin' THEN
      course_id IN (
        SELECT id FROM courses
        WHERE organization_id IN (
          SELECT organization_id FROM users WHERE id = (SELECT auth.uid())
        )
      )
    WHEN 'instructor' THEN
      course_id IN (
        SELECT id FROM courses WHERE user_id = (SELECT auth.uid())
      )
    ELSE FALSE
  END
);

-- =============================================================================
-- ... (Continue for all 26 tables)
-- =============================================================================

-- Organizations, users, lessons, lesson_content, file_catalog,
-- course_enrollments, job_status, etc.

-- =============================================================================
-- Verification: Check policy count reduction
-- =============================================================================

DO $$
DECLARE
  v_old_count INTEGER := 100;  -- Approximate current policy count
  v_new_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_new_count
  FROM pg_policies
  WHERE schemaname = 'public';

  RAISE NOTICE 'Policy count: % → % (reduction: %)',
    v_old_count, v_new_count, v_old_count - v_new_count;

  IF v_new_count > 60 THEN
    RAISE WARNING 'Expected ~52 policies after consolidation, found %', v_new_count;
  END IF;
END $$;
```

### Step 3: Test Migration (1 hour)

```bash
# Apply migration in development
pnpm supabase db push

# Verify policy count reduced
pnpm supabase db dump --schema-only | grep "CREATE POLICY" | wc -l
# Expected: ~52 policies (down from ~100)

# Run full test suite
pnpm test

# Check Supabase Performance Advisor
mcp__supabase__get_advisors --type=performance
# Expected: 0 "multiple permissive policies" warnings
```

### Step 4: Update Documentation (30 min)

Update `docs/AUTH_CONFIGURATION.md` with new consolidated policy structure.

---

## 📊 Impact Analysis

### Before Consolidation

**Policy Count**:
- courses: 4 policies
- sections: 4 policies
- lessons: 4 policies
- lesson_content: 4 policies
- job_status: 8 policies
- Total: ~100 policies across all tables

**Maintenance**:
- ❌ Update 3-8 policies when changing access logic
- ❌ Hard to see complete access picture
- ❌ Duplicated code across policies

**Performance**:
- ⚠️ PostgreSQL evaluates all permissive policies with OR
- ⚠️ Minimal impact but measurable at scale

### After Consolidation

**Policy Count**:
- courses: 2 policies (read + modify)
- sections: 2 policies
- lessons: 2 policies
- lesson_content: 2 policies
- job_status: 2 policies
- Total: ~52 policies across all tables

**Maintenance**:
- ✅ Update 1-2 policies when changing access logic
- ✅ Clear role-based logic in single location
- ✅ No duplicated code

**Performance**:
- ✅ Single policy evaluation per operation
- ✅ Slight performance improvement (~5-10%)

### Metrics

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Policy Count | ~100 | ~52 | -48% |
| Policies per Table | 3-8 | 1-2 | -66% |
| Code Duplication | High | None | -100% |
| Maintenance Effort | High | Low | -60% |
| Query Performance | Baseline | +5-10% | Better |

---

## ⚠️ Risks and Considerations

### Risk 1: Logic Errors During Consolidation

**Risk**: CASE statements might not perfectly replicate OR logic of multiple policies.

**Mitigation**:
- Comprehensive test suite covers all access patterns
- Review each consolidated policy carefully
- Test with all 3 roles (admin, instructor, student)
- Keep backup of original policies

### Risk 2: Performance Regression

**Risk**: CASE statements might be slower than multiple simple policies.

**Mitigation**:
- Benchmark before/after with EXPLAIN ANALYZE
- Monitor production query times
- Can revert if performance degrades
- Test with realistic data volumes (>10k rows)

### Risk 3: Future Role Addition

**Risk**: Adding new role requires updating CASE statements in all policies.

**Mitigation**:
- Document policy update process
- Create migration template for new roles
- Consider role hierarchy if more roles needed

---

## ✅ Acceptance Criteria

### Code Quality
- [ ] All 26 tables have consolidated policies (1-2 per table)
- [ ] CASE statements cover all role scenarios
- [ ] No duplicate logic across policies
- [ ] Each policy has descriptive COMMENT

### Testing
- [ ] All 270 tests pass after migration
- [ ] Manual testing with admin/instructor/student roles
- [ ] EXPLAIN ANALYZE shows no performance regression
- [ ] Supabase Performance Advisor shows 0 "multiple permissive policies" warnings

### Documentation
- [ ] Migration includes clear comments
- [ ] AUTH_CONFIGURATION.md updated with new structure
- [ ] Policy consolidation rationale documented
- [ ] Rollback procedure documented

### Performance
- [ ] Query times equal or better than before
- [ ] EXPLAIN ANALYZE shows expected execution plans
- [ ] No increase in CPU usage
- [ ] Policy evaluation overhead reduced

---

## 🔄 Rollback Plan

If issues arise after deployment:

```sql
-- Restore from backup
\i backup_rls_policies.sql

-- Or revert migration
-- (Supabase CLI doesn't support automatic revert, manual restore needed)
```

---

## 🔗 Related Tasks

- **T068**: Fix RLS InitPlan Performance - Related RLS optimization
- **T069**: Fix Function Search Paths - Security hardening
- **Stage 0 Foundation**: Quality improvements post-UserStory 1-4

---

## 📚 References

### Supabase Documentation
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Database Linter - Multiple Permissive Policies](https://supabase.com/docs/guides/database/database-linter)
- [RLS Performance Best Practices](https://supabase.com/docs/guides/database/postgres/row-level-security#performance)

### PostgreSQL Documentation
- [Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Permissive vs Restrictive Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html#DDL-ROWSECURITY-POLICIES)
- [Policy Ordering](https://www.postgresql.org/docs/current/ddl-rowsecurity.html#DDL-ROWSECURITY-POLICY-ORDERING)

---

## 🚀 Next Steps

1. Review this task document
2. Discuss consolidation approach with team
3. Backup current policies
4. Create migration file with consolidated policies
5. Test migration in development
6. Run full test suite (270 tests)
7. Benchmark performance before/after
8. Review with security team
9. Deploy to staging
10. Monitor for 1 week
11. Deploy to production

---

## 💭 Alternative Approaches

### Alternative 1: Keep Current Multiple Policies

**Pros**:
- No migration needed
- Proven to work
- Simpler per-policy logic

**Cons**:
- More policies to maintain
- Code duplication
- Harder to audit

**Verdict**: Not recommended for long-term maintenance.

### Alternative 2: Function-Based Policies

```sql
-- Create helper function
CREATE FUNCTION has_course_access(course_id UUID, operation TEXT)
RETURNS BOOLEAN AS $$
  SELECT CASE (SELECT role FROM users WHERE id = auth.uid())
    WHEN 'admin' THEN true
    WHEN 'instructor' THEN (...)
    WHEN 'student' THEN (...)
  END;
$$ LANGUAGE sql SECURITY DEFINER;

-- Use in policy
CREATE POLICY "courses_access" ON courses
FOR ALL USING (has_course_access(id, 'read'));
```

**Pros**:
- Reusable logic across tables
- Can test function independently
- Single source of truth

**Cons**:
- Additional function calls (performance)
- More complex debugging
- Harder to understand at policy level

**Verdict**: Consider for future if access logic becomes very complex.

---

**Created By**: Claude Code (Anthropic)
**Research Duration**: 45 minutes
**Priority**: P3 - Low (Code Quality)
**Complexity**: Medium (Requires careful logic consolidation)
**Estimated Effort**: 4-6 hours
**Confidence Level**: 🟡 **MEDIUM (75%)** - Consolidation requires careful testing to ensure no access control regressions
