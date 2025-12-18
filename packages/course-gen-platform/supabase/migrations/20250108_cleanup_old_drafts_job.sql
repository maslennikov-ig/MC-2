-- ============================================================================
-- Migration: 20250108_cleanup_old_drafts_job.sql
-- Purpose: Setup automated cleanup of abandoned draft courses via pg_cron
-- Author: infrastructure-specialist
-- Date: 2025-01-08
-- Spec: docs/specs/TECH-SPEC-DRAFT-COURSE-CLEANUP.md (section 6.3)
-- ============================================================================
--
-- This migration creates a pg_cron job that runs hourly to invoke the
-- cleanup-old-drafts Edge Function. The Edge Function deletes draft courses
-- that meet these criteria:
--   - status = 'draft'
--   - generation_status IS NULL (never started processing)
--   - created_at < NOW() - INTERVAL '24 hours'
--
-- ============================================================================

-- ============================================================================
-- PART 1: ENABLE REQUIRED EXTENSIONS
-- ============================================================================

-- Enable pg_cron for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Enable pg_net for HTTP requests (if not already enabled)
-- Note: pg_net is the modern replacement for http extension in Supabase
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA extensions TO postgres;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO postgres;

-- ============================================================================
-- PART 2: CREATE CLEANUP JOB
-- ============================================================================

-- Schedule cleanup job to run every hour
-- The job invokes the Edge Function via HTTP POST using pg_net
DO $$
DECLARE
  v_project_ref TEXT := 'diqooqbuchsliypgwksu'; -- MegaCampusAI project ref
  v_edge_function_url TEXT;
  v_anon_key TEXT;
BEGIN
  -- Construct Edge Function URL
  v_edge_function_url := 'https://' || v_project_ref || '.supabase.co/functions/v1/cleanup-old-drafts';

  -- Get anon key from vault (if using Supabase Vault)
  -- Otherwise, you'll need to set this manually or use service role key
  -- For security, we use the service role key passed via pg_cron

  -- Note: The actual service role key should be configured in Supabase dashboard
  -- under Settings > API > service_role key

  -- Schedule the cron job
  PERFORM cron.schedule(
    'cleanup-old-drafts-hourly',           -- Job name
    '0 * * * *',                            -- Every hour at minute 0
    $$
    -- Call Edge Function using pg_net
    SELECT net.http_post(
      url := 'https://diqooqbuchsliypgwksu.supabase.co/functions/v1/cleanup-old-drafts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
      ),
      body := '{}'::jsonb
    );
    $$
  );

  RAISE NOTICE 'Created pg_cron job: cleanup-old-drafts-hourly';
  RAISE NOTICE 'Schedule: Every hour at minute 0';
  RAISE NOTICE 'Edge Function URL: %', v_edge_function_url;
END $$;

-- ============================================================================
-- PART 3: VERIFICATION QUERY
-- ============================================================================

-- Verify the scheduled job was created
DO $$
DECLARE
  v_job_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_job_count
  FROM cron.job
  WHERE jobname = 'cleanup-old-drafts-hourly';

  IF v_job_count = 1 THEN
    RAISE NOTICE 'SUCCESS: Cleanup job verified in cron.job table';
  ELSE
    RAISE WARNING 'WARNING: Cleanup job not found. Count: %', v_job_count;
  END IF;
END $$;

-- ============================================================================
-- PART 4: MONITORING QUERIES
-- ============================================================================

-- Create view for easy monitoring of cleanup job status
CREATE OR REPLACE VIEW public.cleanup_job_monitoring AS
SELECT
  j.jobname,
  j.schedule,
  j.active,
  jr.jobid,
  jr.runid,
  jr.status,
  jr.return_message,
  jr.start_time,
  jr.end_time
FROM cron.job j
LEFT JOIN cron.job_run_details jr ON jr.jobid = j.jobid
WHERE j.jobname = 'cleanup-old-drafts-hourly'
ORDER BY jr.start_time DESC NULLS LAST
LIMIT 10;

COMMENT ON VIEW public.cleanup_job_monitoring IS
  'Monitor the last 10 runs of the cleanup-old-drafts job';

-- ============================================================================
-- PART 5: HELPER FUNCTION TO CHECK PENDING CLEANUP
-- ============================================================================

-- Function to check how many drafts are pending cleanup
CREATE OR REPLACE FUNCTION public.check_pending_cleanup()
RETURNS TABLE (
  pending_count BIGINT,
  oldest_draft TIMESTAMPTZ,
  newest_draft TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COUNT(*) AS pending_count,
    MIN(created_at) AS oldest_draft,
    MAX(created_at) AS newest_draft
  FROM courses
  WHERE status = 'draft'
    AND generation_status IS NULL
    AND created_at < NOW() - INTERVAL '24 hours';
$$;

COMMENT ON FUNCTION public.check_pending_cleanup() IS
  'Check how many draft courses are currently pending cleanup';

-- ============================================================================
-- PART 6: DOCUMENTATION
-- ============================================================================

COMMENT ON EXTENSION pg_cron IS
  'Used for scheduling automated cleanup of abandoned draft courses';

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================

-- To rollback this migration (disable cleanup job):
-- SELECT cron.unschedule('cleanup-old-drafts-hourly');
-- DROP VIEW IF EXISTS public.cleanup_job_monitoring;
-- DROP FUNCTION IF EXISTS public.check_pending_cleanup();

-- To completely remove (not recommended in production):
-- DROP EXTENSION IF EXISTS pg_cron CASCADE;
-- DROP EXTENSION IF EXISTS pg_net CASCADE;

-- ============================================================================
-- DEPLOYMENT NOTES
-- ============================================================================

-- IMPORTANT: Before running this migration, you must:
--
-- 1. Deploy the Edge Function first:
--    supabase functions deploy cleanup-old-drafts
--
-- 2. Set the service role key in Supabase settings (if not using vault):
--    ALTER DATABASE postgres SET app.settings.service_role_key = 'your-service-role-key';
--
-- 3. Verify the Edge Function is accessible:
--    curl -X POST https://diqooqbuchsliypgwksu.supabase.co/functions/v1/cleanup-old-drafts \
--      -H "Authorization: Bearer YOUR-SERVICE-ROLE-KEY"
--
-- 4. After migration, verify the cron job:
--    SELECT * FROM cron.job WHERE jobname = 'cleanup-old-drafts-hourly';
--
-- 5. Monitor job execution:
--    SELECT * FROM public.cleanup_job_monitoring;
--
-- 6. Check pending cleanup count:
--    SELECT * FROM public.check_pending_cleanup();

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
