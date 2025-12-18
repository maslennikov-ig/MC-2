-- =============================================================================
-- RLS Performance Benchmarking - Before/After T072.1
-- Task: T072.1 - Refactor RLS Policies to Single Policy Per Table
-- Purpose: Measure SELECT query performance improvement after single policy refactor
-- Expected: 10-20% improvement in SELECT execution time
-- =============================================================================

-- =============================================================================
-- SETUP: Create test context (run this first)
-- =============================================================================

-- Set up test user context
-- Replace these UUIDs with actual test data from your database
DO $$
DECLARE
  v_test_user_id uuid;
  v_test_org_id uuid;
  v_test_role text := 'instructor';
BEGIN
  -- Get a test user (instructor)
  SELECT id, organization_id INTO v_test_user_id, v_test_org_id
  FROM users
  WHERE role = 'instructor'
  LIMIT 1;

  IF v_test_user_id IS NULL THEN
    RAISE NOTICE 'No test user found. Please create test data first.';
    RETURN;
  END IF;

  RAISE NOTICE 'Test Context:';
  RAISE NOTICE '  User ID: %', v_test_user_id;
  RAISE NOTICE '  Org ID: %', v_test_org_id;
  RAISE NOTICE '  Role: %', v_test_role;
END $$;

-- =============================================================================
-- BENCHMARK 1: Courses Table SELECT
-- =============================================================================

\echo ''
\echo '=========================================='
\echo 'BENCHMARK 1: Courses Table SELECT'
\echo '=========================================='

-- Warm up cache
SELECT COUNT(*) FROM courses WHERE status = 'published';

-- Run EXPLAIN ANALYZE
EXPLAIN (ANALYZE, BUFFERS, TIMING, VERBOSE)
SELECT id, title, status, organization_id, user_id
FROM courses
WHERE status = 'published'
LIMIT 10;

\echo ''
\echo 'Key metrics to compare:'
\echo '- Number of SubPlan nodes (should decrease from 2 to 1 after T072.1)'
\echo '- Execution Time (should improve by 10-20%)'
\echo '- Planning Time (should be similar or better)'
\echo ''

-- =============================================================================
-- BENCHMARK 2: Sections Table SELECT with JOIN
-- =============================================================================

\echo ''
\echo '=========================================='
\echo 'BENCHMARK 2: Sections Table SELECT with JOIN'
\echo '=========================================='

-- Warm up cache
SELECT COUNT(*) FROM sections s JOIN courses c ON s.course_id = c.id;

-- Run EXPLAIN ANALYZE
EXPLAIN (ANALYZE, BUFFERS, TIMING, VERBOSE)
SELECT s.id, s.title, s.order_index, c.title as course_title
FROM sections s
JOIN courses c ON s.course_id = c.id
WHERE c.status = 'published'
LIMIT 10;

\echo ''
\echo 'Key metrics to compare:'
\echo '- Policy evaluation for both tables'
\echo '- Join performance'
\echo '- Buffer hits vs reads'
\echo ''

-- =============================================================================
-- BENCHMARK 3: Course Enrollments SELECT (Student perspective)
-- =============================================================================

\echo ''
\echo '=========================================='
\echo 'BENCHMARK 3: Course Enrollments SELECT (Student)'
\echo '=========================================='

-- Warm up cache
SELECT COUNT(*) FROM course_enrollments WHERE status = 'active';

-- Run EXPLAIN ANALYZE
EXPLAIN (ANALYZE, BUFFERS, TIMING, VERBOSE)
SELECT ce.id, ce.course_id, ce.user_id, ce.progress, c.title
FROM course_enrollments ce
JOIN courses c ON ce.course_id = c.id
WHERE ce.status = 'active'
LIMIT 10;

\echo ''
\echo 'Key metrics to compare:'
\echo '- Policy checks on course_enrollments'
\echo '- Policy checks on courses'
\echo '- Index usage'
\echo ''

-- =============================================================================
-- BENCHMARK 4: Lesson Content SELECT (Deep hierarchy)
-- =============================================================================

\echo ''
\echo '=========================================='
\echo 'BENCHMARK 4: Lesson Content SELECT (Deep hierarchy)'
\echo '=========================================='

-- Warm up cache
SELECT COUNT(*)
FROM lesson_content lc
JOIN lessons l ON lc.lesson_id = l.id
JOIN sections s ON l.section_id = s.id
JOIN courses c ON s.course_id = c.id;

-- Run EXPLAIN ANALYZE
EXPLAIN (ANALYZE, BUFFERS, TIMING, VERBOSE)
SELECT
  lc.id,
  lc.type,
  lc.content,
  l.title as lesson_title,
  s.title as section_title,
  c.title as course_title
FROM lesson_content lc
JOIN lessons l ON lc.lesson_id = l.id
JOIN sections s ON l.section_id = s.id
JOIN courses c ON s.course_id = c.id
WHERE c.status = 'published'
LIMIT 10;

\echo ''
\echo 'Key metrics to compare:'
\echo '- Total number of SubPlans across all 4 tables'
\echo '- BEFORE: 8 SubPlans (2 per table × 4 tables)'
\echo '- AFTER: 4 SubPlans (1 per table × 4 tables)'
\echo '- Expected improvement: 15-25% faster'
\echo ''

-- =============================================================================
-- BENCHMARK 5: Job Status SELECT (Complex authorization)
-- =============================================================================

\echo ''
\echo '=========================================='
\echo 'BENCHMARK 5: Job Status SELECT (Complex authorization)'
\echo '=========================================='

-- Warm up cache
SELECT COUNT(*) FROM job_status WHERE status IN ('pending', 'processing');

-- Run EXPLAIN ANALYZE
EXPLAIN (ANALYZE, BUFFERS, TIMING, VERBOSE)
SELECT
  js.id,
  js.job_id,
  js.status,
  js.user_id,
  js.organization_id,
  js.course_id
FROM job_status js
WHERE js.status IN ('pending', 'processing')
ORDER BY js.created_at DESC
LIMIT 10;

\echo ''
\echo 'Key metrics to compare:'
\echo '- Policy complexity for job_status'
\echo '- Before: Most complex table (was 11 policies → 2 in T072)'
\echo '- After: Single policy with complex CASE logic'
\echo ''

-- =============================================================================
-- BENCHMARK 6: Multi-table aggregate query
-- =============================================================================

\echo ''
\echo '=========================================='
\echo 'BENCHMARK 6: Multi-table Aggregate Query'
\echo '=========================================='

-- Run EXPLAIN ANALYZE
EXPLAIN (ANALYZE, BUFFERS, TIMING, VERBOSE)
SELECT
  c.id,
  c.title,
  COUNT(DISTINCT s.id) as section_count,
  COUNT(DISTINCT l.id) as lesson_count,
  COUNT(DISTINCT ce.id) as enrollment_count
FROM courses c
LEFT JOIN sections s ON s.course_id = c.id
LEFT JOIN lessons l ON l.section_id = s.id
LEFT JOIN course_enrollments ce ON ce.course_id = c.id
WHERE c.status = 'published'
GROUP BY c.id, c.title
LIMIT 5;

\echo ''
\echo 'Key metrics to compare:'
\echo '- Total policy evaluations across all tables'
\echo '- BEFORE: Multiple policy checks per table'
\echo '- AFTER: Single policy check per table'
\echo '- Expected: 20-30% improvement for complex queries'
\echo ''

-- =============================================================================
-- STATISTICS COMPARISON HELPER
-- =============================================================================

\echo ''
\echo '=========================================='
\echo 'STATISTICS COMPARISON TEMPLATE'
\echo '=========================================='
\echo ''
\echo 'Copy these metrics from each EXPLAIN ANALYZE:'
\echo ''
\echo '| Query | Before T072.1 | After T072.1 | Improvement |'
\echo '|-------|---------------|--------------|-------------|'
\echo '| Courses SELECT | ___ ms | ___ ms | ___% |'
\echo '| Sections + JOIN | ___ ms | ___ ms | ___% |'
\echo '| Enrollments | ___ ms | ___ ms | ___% |'
\echo '| Lesson Content (4 tables) | ___ ms | ___ ms | ___% |'
\echo '| Job Status | ___ ms | ___ ms | ___% |'
\echo '| Aggregate Query | ___ ms | ___ ms | ___% |'
\echo ''
\echo 'SubPlan Count:'
\echo '| Query | Before | After | Reduction |'
\echo '|-------|--------|-------|-----------|'
\echo '| Courses | 2 | 1 | -50% |'
\echo '| Sections | 2 | 1 | -50% |'
\echo '| 4-table JOIN | 8 | 4 | -50% |'
\echo ''

-- =============================================================================
-- POLICY COUNT VERIFICATION
-- =============================================================================

\echo ''
\echo '=========================================='
\echo 'POLICY COUNT VERIFICATION'
\echo '=========================================='

SELECT
  tablename,
  COUNT(*) as policy_count,
  array_agg(policyname ORDER BY policyname) as policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

\echo ''
\echo 'Expected after T072.1:'
\echo '- Most tables: 1 policy (*_all)'
\echo '- users table: 2 policies (auth admin + users_all)'
\echo '- Total: ~10 policies (down from 19)'
\echo ''

-- =============================================================================
-- INSTRUCTIONS FOR BENCHMARKING
-- =============================================================================

/*
HOW TO RUN THIS BENCHMARK:

1. BEFORE T072.1 Migration:
   psql -f supabase/verification/benchmark_rls_performance.sql > benchmark_before.log 2>&1

2. Apply T072.1 Migration:
   psql -f supabase/migrations/20250114_refactor_rls_single_policy.sql

3. AFTER T072.1 Migration:
   psql -f supabase/verification/benchmark_rls_performance.sql > benchmark_after.log 2>&1

4. Compare Results:
   diff -u benchmark_before.log benchmark_after.log
   # Look for:
   # - Reduced SubPlan count
   # - Lower execution times
   # - Similar or better buffer hits

5. Calculate Improvement:
   # Extract execution times and calculate percentage improvement
   # Example: (before - after) / before * 100 = % improvement

EXPECTED RESULTS:
- SELECT queries: 10-20% faster
- Complex multi-table JOINs: 15-25% faster
- SubPlan count: -50% (2 → 1 per table)
- Buffer usage: Similar or slightly better
- Planning time: Similar (minimal change)

SUCCESS CRITERIA:
✅ All benchmarks show improvement
✅ No performance regressions
✅ SubPlan count reduced
✅ Zero "multiple permissive policies" warnings
*/
