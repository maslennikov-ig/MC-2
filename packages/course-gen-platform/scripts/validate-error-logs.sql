-- Script: validate-error-logs.sql
-- Purpose: Verify error_logs table structure and RLS policies
-- Usage: Run via Supabase MCP or psql
-- Expected outcome: All checks PASS

-- 1. Check table exists
SELECT
  CASE
    WHEN COUNT(*) = 1 THEN '✅ PASS: error_logs table exists'
    ELSE '❌ FAIL: error_logs table not found'
  END AS table_check
FROM information_schema.tables
WHERE table_name = 'error_logs' AND table_schema = 'public';

-- 2. Check required columns
WITH expected_columns AS (
  SELECT unnest(ARRAY[
    'id', 'created_at', 'user_id', 'organization_id',
    'error_message', 'stack_trace', 'severity',
    'file_name', 'file_size', 'file_format',
    'job_id', 'job_type', 'metadata'
  ]) AS column_name
),
actual_columns AS (
  SELECT column_name
  FROM information_schema.columns
  WHERE table_name = 'error_logs' AND table_schema = 'public'
),
missing_columns AS (
  SELECT e.column_name
  FROM expected_columns e
  LEFT JOIN actual_columns a USING (column_name)
  WHERE a.column_name IS NULL
)
SELECT
  CASE
    WHEN (SELECT COUNT(*) FROM missing_columns) = 0 THEN '✅ PASS: All 13 required columns present'
    ELSE '❌ FAIL: Missing columns - ' || (SELECT string_agg(column_name, ', ') FROM missing_columns)
  END AS columns_check;

-- 3. Check column types
WITH column_types AS (
  SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
  FROM information_schema.columns
  WHERE table_name = 'error_logs' AND table_schema = 'public'
)
SELECT
  column_name,
  data_type,
  is_nullable,
  CASE
    WHEN column_name = 'id' AND data_type = 'uuid' AND is_nullable = 'NO' THEN '✅ PASS'
    WHEN column_name = 'created_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'NO' THEN '✅ PASS'
    WHEN column_name = 'user_id' AND data_type = 'uuid' AND is_nullable = 'YES' THEN '✅ PASS'
    WHEN column_name = 'organization_id' AND data_type = 'uuid' AND is_nullable = 'NO' THEN '✅ PASS'
    WHEN column_name = 'error_message' AND data_type = 'text' AND is_nullable = 'NO' THEN '✅ PASS'
    WHEN column_name = 'stack_trace' AND data_type = 'text' AND is_nullable = 'YES' THEN '✅ PASS'
    WHEN column_name = 'severity' AND data_type = 'text' AND is_nullable = 'NO' THEN '✅ PASS'
    WHEN column_name IN ('file_name', 'file_format', 'job_id', 'job_type') AND data_type = 'text' AND is_nullable = 'YES' THEN '✅ PASS'
    WHEN column_name = 'file_size' AND data_type = 'bigint' AND is_nullable = 'YES' THEN '✅ PASS'
    WHEN column_name = 'metadata' AND data_type = 'jsonb' THEN '✅ PASS'
    ELSE '⚠️ CHECK: Unexpected type or nullability'
  END AS type_check
FROM column_types
ORDER BY
  CASE column_name
    WHEN 'id' THEN 1
    WHEN 'created_at' THEN 2
    WHEN 'user_id' THEN 3
    WHEN 'organization_id' THEN 4
    WHEN 'error_message' THEN 5
    WHEN 'stack_trace' THEN 6
    WHEN 'severity' THEN 7
    ELSE 99
  END;

-- 4. Check severity CHECK constraint
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.check_constraints cc
      JOIN information_schema.constraint_column_usage ccu USING (constraint_name)
      WHERE ccu.table_name = 'error_logs'
        AND cc.check_clause LIKE '%severity%'
    ) THEN '✅ PASS: Severity CHECK constraint exists'
    ELSE '⚠️ WARNING: Severity CHECK constraint not found (may be unnamed)'
  END AS severity_constraint_check;

-- 5. Check indexes exist
WITH index_count AS (
  SELECT COUNT(*) AS idx_count
  FROM pg_indexes
  WHERE tablename = 'error_logs' AND schemaname = 'public'
)
SELECT
  CASE
    WHEN idx_count >= 4 THEN '✅ PASS: At least 4 indexes created (' || idx_count::text || ' found)'
    ELSE '❌ FAIL: Expected at least 4 indexes, found ' || idx_count::text
  END AS indexes_check
FROM index_count;

-- 6. List all indexes (for detailed inspection)
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'error_logs' AND schemaname = 'public'
ORDER BY indexname;

-- 7. Check RLS enabled
SELECT
  CASE
    WHEN relrowsecurity THEN '✅ PASS: RLS enabled on error_logs'
    ELSE '❌ FAIL: RLS not enabled on error_logs'
  END AS rls_check
FROM pg_class
WHERE relname = 'error_logs' AND relnamespace = 'public'::regnamespace;

-- 8. Check RLS policies exist
WITH policy_count AS (
  SELECT COUNT(*) AS pol_count
  FROM pg_policies
  WHERE tablename = 'error_logs' AND schemaname = 'public'
)
SELECT
  CASE
    WHEN pol_count >= 2 THEN '✅ PASS: At least 2 RLS policies exist (' || pol_count::text || ' found)'
    ELSE '❌ FAIL: Expected at least 2 policies, found ' || pol_count::text
  END AS policies_check
FROM policy_count;

-- 9. List all RLS policies (for detailed inspection)
SELECT
  policyname,
  permissive,
  roles,
  cmd AS command,
  qual AS using_clause
FROM pg_policies
WHERE tablename = 'error_logs' AND schemaname = 'public'
ORDER BY policyname;

-- 10. Check foreign key constraints
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.update_rule,
  rc.delete_rule,
  CASE
    WHEN kcu.column_name = 'user_id' AND rc.delete_rule = 'SET NULL' THEN '✅ PASS'
    WHEN kcu.column_name = 'organization_id' AND rc.delete_rule = 'CASCADE' THEN '✅ PASS'
    ELSE '⚠️ CHECK: Unexpected delete rule'
  END AS fk_check
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'error_logs'
  AND tc.table_schema = 'public'
ORDER BY kcu.column_name;

-- 11. Test error log insertion (requires service role)
-- Note: This is typically done in integration tests, not manual validation
-- Example (uncomment to test):
-- INSERT INTO error_logs (
--   organization_id, user_id, error_message, severity,
--   file_name, file_size, file_format, job_id, job_type
-- ) VALUES (
--   '00000000-0000-0000-0000-000000000001'::uuid,
--   NULL,
--   'Test error: Validation script test',
--   'WARNING',
--   'test-document.pdf',
--   1024,
--   'pdf',
--   'test-job-id',
--   'DOCUMENT_PROCESSING'
-- ) RETURNING id, created_at;

-- 12. Count existing error logs (for monitoring)
SELECT
  COUNT(*) AS total_errors,
  COUNT(*) FILTER (WHERE severity = 'WARNING') AS warnings,
  COUNT(*) FILTER (WHERE severity = 'ERROR') AS errors,
  COUNT(*) FILTER (WHERE severity = 'CRITICAL') AS critical_errors,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS errors_last_24h
FROM error_logs;

SELECT '✅ error_logs validation complete. Review output above for any FAIL status.' AS validation_summary;
