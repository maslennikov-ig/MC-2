-- Migration: Fix remaining Security Definer Views
-- Purpose: Convert remaining views to security_invoker=true and create
-- SECURITY DEFINER functions for admin access to system catalogs.
--
-- Strategy:
-- 1. Views become security_invoker=true (will return empty for regular users)
-- 2. Create admin functions with SECURITY DEFINER for legitimate admin access
-- 3. Functions have explicit is_superadmin() check as first statement

-- ============================================================================
-- 1. cleanup_job_monitoring - Convert to security_invoker + admin function
-- ============================================================================
DROP VIEW IF EXISTS public.cleanup_job_monitoring;

-- View with security_invoker (will be empty for non-service_role)
CREATE VIEW public.cleanup_job_monitoring
WITH (security_invoker = true)
AS
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
WHERE j.jobname = 'cleanup-old-drafts-hourly'::text
ORDER BY jr.start_time DESC NULLS LAST
LIMIT 10;

COMMENT ON VIEW public.cleanup_job_monitoring IS
'Cron job monitoring view. Uses security_invoker=true. Access via service_role or use get_cleanup_job_monitoring() function for authenticated superadmins.';

-- Admin function with explicit security check
CREATE OR REPLACE FUNCTION public.get_cleanup_job_monitoring()
RETURNS TABLE (
    jobname text,
    schedule text,
    active boolean,
    jobid bigint,
    runid bigint,
    status text,
    return_message text,
    start_time timestamptz,
    end_time timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
    -- Explicit superadmin check - throws error if not authorized
    IF NOT is_superadmin(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied: superadmin privileges required';
    END IF;

    RETURN QUERY
    SELECT
        j.jobname::text,
        j.schedule::text,
        j.active,
        jr.jobid,
        jr.runid,
        jr.status::text,
        jr.return_message::text,
        jr.start_time,
        jr.end_time
    FROM cron.job j
    LEFT JOIN cron.job_run_details jr ON jr.jobid = j.jobid
    WHERE j.jobname = 'cleanup-old-drafts-hourly'
    ORDER BY jr.start_time DESC NULLS LAST
    LIMIT 10;
END;
$$;

COMMENT ON FUNCTION public.get_cleanup_job_monitoring() IS
'Admin function to get cron job monitoring data. Requires superadmin privileges. SECURITY DEFINER with explicit authorization check.';

GRANT EXECUTE ON FUNCTION public.get_cleanup_job_monitoring() TO authenticated;

-- ============================================================================
-- 2. trace_storage_stats - Convert to security_invoker + admin function
-- ============================================================================
DROP VIEW IF EXISTS public.trace_storage_stats;

-- View with security_invoker
CREATE VIEW public.trace_storage_stats
WITH (security_invoker = true)
AS
WITH main_stats AS (
    SELECT
        'generation_trace'::text AS table_name,
        count(*) AS row_count,
        pg_size_pretty(pg_total_relation_size('generation_trace'::regclass)) AS total_size,
        min(created_at) AS oldest,
        max(created_at) AS newest,
        count(*) FILTER (WHERE created_at > (now() - '24:00:00'::interval)) AS last_24h
    FROM generation_trace
),
archive_stats AS (
    SELECT
        'generation_trace_archive'::text AS table_name,
        count(*) AS row_count,
        pg_size_pretty(pg_total_relation_size('generation_trace_archive'::regclass)) AS total_size,
        min(created_at) AS oldest,
        max(created_at) AS newest,
        count(*) FILTER (WHERE archived_at > (now() - '24:00:00'::interval)) AS last_24h
    FROM generation_trace_archive
),
stats_stats AS (
    SELECT
        'generation_stats'::text AS table_name,
        count(*) AS row_count,
        pg_size_pretty(pg_total_relation_size('generation_stats'::regclass)) AS total_size,
        min(created_at) AS oldest,
        max(updated_at) AS newest,
        count(*) FILTER (WHERE updated_at > (now() - '24:00:00'::interval)) AS last_24h
    FROM generation_stats
)
SELECT * FROM main_stats
UNION ALL
SELECT * FROM archive_stats
UNION ALL
SELECT * FROM stats_stats;

COMMENT ON VIEW public.trace_storage_stats IS
'Trace storage statistics view. Uses security_invoker=true. Access via service_role or use get_trace_storage_stats() function for authenticated superadmins.';

-- Admin function with explicit security check
CREATE OR REPLACE FUNCTION public.get_trace_storage_stats()
RETURNS TABLE (
    table_name text,
    row_count bigint,
    total_size text,
    oldest timestamptz,
    newest timestamptz,
    last_24h bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Explicit superadmin check
    IF NOT is_superadmin(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied: superadmin privileges required';
    END IF;

    RETURN QUERY
    WITH main_stats AS (
        SELECT
            'generation_trace'::text AS tbl_name,
            count(*)::bigint AS cnt,
            pg_size_pretty(pg_total_relation_size('generation_trace'::regclass))::text AS sz,
            min(gt.created_at) AS old,
            max(gt.created_at) AS new,
            count(*) FILTER (WHERE gt.created_at > (now() - '24:00:00'::interval))::bigint AS day
        FROM generation_trace gt
    ),
    archive_stats AS (
        SELECT
            'generation_trace_archive'::text AS tbl_name,
            count(*)::bigint AS cnt,
            pg_size_pretty(pg_total_relation_size('generation_trace_archive'::regclass))::text AS sz,
            min(gta.created_at) AS old,
            max(gta.created_at) AS new,
            count(*) FILTER (WHERE gta.archived_at > (now() - '24:00:00'::interval))::bigint AS day
        FROM generation_trace_archive gta
    ),
    stats_stats AS (
        SELECT
            'generation_stats'::text AS tbl_name,
            count(*)::bigint AS cnt,
            pg_size_pretty(pg_total_relation_size('generation_stats'::regclass))::text AS sz,
            min(gs.created_at) AS old,
            max(gs.updated_at) AS new,
            count(*) FILTER (WHERE gs.updated_at > (now() - '24:00:00'::interval))::bigint AS day
        FROM generation_stats gs
    )
    SELECT m.tbl_name, m.cnt, m.sz, m.old, m.new, m.day FROM main_stats m
    UNION ALL
    SELECT a.tbl_name, a.cnt, a.sz, a.old, a.new, a.day FROM archive_stats a
    UNION ALL
    SELECT s.tbl_name, s.cnt, s.sz, s.old, s.new, s.day FROM stats_stats s;
END;
$$;

COMMENT ON FUNCTION public.get_trace_storage_stats() IS
'Admin function to get trace storage statistics. Requires superadmin privileges. SECURITY DEFINER with explicit authorization check.';

GRANT EXECUTE ON FUNCTION public.get_trace_storage_stats() TO authenticated;

-- ============================================================================
-- 3. v_rls_policy_audit - Convert to security_invoker + admin function
-- ============================================================================
DROP VIEW IF EXISTS public.v_rls_policy_audit;

-- View with security_invoker
CREATE VIEW public.v_rls_policy_audit
WITH (security_invoker = true)
AS
SELECT
    schemaname,
    tablename,
    policyname,
    cmd,
    CASE
        WHEN qual ~~ '%is_superadmin%'::text OR with_check ~~ '%is_superadmin%'::text THEN true
        ELSE false
    END AS has_superadmin_access,
    CASE
        WHEN roles @> ARRAY['authenticated'::name] THEN 'authenticated'::text
        WHEN roles @> ARRAY['anon'::name] THEN 'anon'::text
        WHEN roles @> ARRAY['service_role'::name] THEN 'service_role'::text
        ELSE array_to_string(roles, ', '::text)
    END AS policy_role,
    permissive
FROM pg_policies
WHERE schemaname = 'public'::name
ORDER BY tablename, policyname;

COMMENT ON VIEW public.v_rls_policy_audit IS
'RLS policy audit view. Uses security_invoker=true. Access via service_role or use get_rls_policy_audit() function for authenticated superadmins.';

-- Admin function with explicit security check
CREATE OR REPLACE FUNCTION public.get_rls_policy_audit()
RETURNS TABLE (
    schemaname name,
    tablename name,
    policyname name,
    cmd text,
    has_superadmin_access boolean,
    policy_role text,
    permissive text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Explicit superadmin check
    IF NOT is_superadmin(auth.uid()) THEN
        RAISE EXCEPTION 'Access denied: superadmin privileges required';
    END IF;

    RETURN QUERY
    SELECT
        p.schemaname,
        p.tablename,
        p.policyname,
        p.cmd,
        CASE
            WHEN p.qual ~~ '%is_superadmin%'::text OR p.with_check ~~ '%is_superadmin%'::text THEN true
            ELSE false
        END AS has_superadmin_access,
        CASE
            WHEN p.roles @> ARRAY['authenticated'::name] THEN 'authenticated'::text
            WHEN p.roles @> ARRAY['anon'::name] THEN 'anon'::text
            WHEN p.roles @> ARRAY['service_role'::name] THEN 'service_role'::text
            ELSE array_to_string(p.roles, ', '::text)
        END AS policy_role,
        p.permissive
    FROM pg_policies p
    WHERE p.schemaname = 'public'::name
    ORDER BY p.tablename, p.policyname;
END;
$$;

COMMENT ON FUNCTION public.get_rls_policy_audit() IS
'Admin function to get RLS policy audit data. Requires superadmin privileges. SECURITY DEFINER with explicit authorization check.';

GRANT EXECUTE ON FUNCTION public.get_rls_policy_audit() TO authenticated;

-- ============================================================================
-- Grant SELECT on views (will return empty for non-service_role)
-- ============================================================================
GRANT SELECT ON public.cleanup_job_monitoring TO authenticated;
GRANT SELECT ON public.trace_storage_stats TO authenticated;
GRANT SELECT ON public.v_rls_policy_audit TO authenticated;
