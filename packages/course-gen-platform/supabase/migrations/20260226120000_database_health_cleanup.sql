-- ============================================================================
-- Database Health Cleanup: Reduce size from ~391 MB to ~170 MB
-- ============================================================================
-- Problem:
--   1. error_logs: 167 MB (43% of DB), no retention, 187K rows (5+ weeks old)
--   2. lesson_enrichments: 76 MB TOAST bloat (live data = 117 KB)
--   3. Unused indexes: 40+ MB across error_logs, generation_trace
--   4. Rejected lesson_contents: 6 MB of old drafts
-- ============================================================================

-- ============================================================================
-- 1. Delete old error_logs (keep last 14 days)
-- ============================================================================
-- 133K+ rows from Jan 19 week alone = ~38 MB of data + indexes
DELETE FROM public.error_logs
WHERE created_at < now() - interval '14 days';

-- ============================================================================
-- 2. Add weekly error_logs retention cron job
-- ============================================================================
SELECT cron.schedule(
  'cleanup-old-error-logs',
  '0 3 * * 0',  -- Every Sunday at 3 AM UTC
  $$DELETE FROM public.error_logs WHERE created_at < now() - interval '14 days'$$
);

-- ============================================================================
-- 3. Delete old rejected lesson_contents (keep last 30 days for debugging)
-- ============================================================================
DELETE FROM public.lesson_contents
WHERE status = 'rejected'
  AND created_at < now() - interval '30 days';

-- ============================================================================
-- 4. Drop unused error_logs indexes (0 scans, 40+ MB total)
-- ============================================================================
-- idx_error_logs_error_message_trgm: 12 MB, 0 scans — trigram search never used
DROP INDEX IF EXISTS public.idx_error_logs_error_message_trgm;

-- idx_error_logs_problem_id: 12 MB, 0 scans — redundant with unique constraint error_logs_problem_id_key
DROP INDEX IF EXISTS public.idx_error_logs_problem_id;

-- idx_error_logs_created_at_desc: 7.6 MB, 0 scans — covered by fingerprint_created composite
DROP INDEX IF EXISTS public.idx_error_logs_created_at_desc;

-- idx_error_logs_error_message_gin: 2.8 MB, 0 scans — full-text search on error_message never used
DROP INDEX IF EXISTS public.idx_error_logs_error_message_gin;

-- idx_error_logs_fingerprint: 2.3 MB, 0 scans — covered by idx_error_logs_fingerprint_created
DROP INDEX IF EXISTS public.idx_error_logs_fingerprint;

-- idx_error_logs_organization_id: 2.1 MB, 0 scans — never filtered by org
DROP INDEX IF EXISTS public.idx_error_logs_organization_id;

-- KEPT: error_logs_pkey (essential), error_logs_problem_id_key (used in UPSERT),
--       idx_error_logs_fingerprint_created (6 scans), idx_error_logs_environment (used in queries),
--       idx_error_logs_user_id, idx_error_logs_request_id, idx_error_logs_course_id,
--       idx_error_logs_severity_critical, idx_error_logs_trpc_path

-- ============================================================================
-- 5. Drop unused generation_trace indexes
-- ============================================================================
-- idx_trace_skeleton: 5 MB, 0 scans
DROP INDEX IF EXISTS public.idx_trace_skeleton;

-- idx_generation_trace_course_created: 1.5 MB, 0 scans — course_id index sufficient
DROP INDEX IF EXISTS public.idx_generation_trace_course_created;

-- idx_generation_trace_created_at: 920 KB, 0 scans
DROP INDEX IF EXISTS public.idx_generation_trace_created_at;

-- KEPT: generation_trace_pkey, idx_generation_trace_course_id,
--       idx_generation_trace_lesson_id, idx_generation_trace_stage, idx_trace_critical_phases

-- ============================================================================
-- 6. VACUUM FULL must be run OUTSIDE of a transaction.
--    Run manually via Supabase SQL Editor or execute_sql after this migration:
--
--    VACUUM FULL public.lesson_enrichments;  -- 76 MB TOAST -> ~200 KB
--    VACUUM FULL public.lesson_contents;
--    VACUUM FULL public.file_catalog;        -- 11 MB TOAST bloat
--    VACUUM FULL public.generation_trace;    -- 12 MB TOAST bloat
--    VACUUM FULL public.error_logs;          -- rebuild after mass delete
-- ============================================================================
