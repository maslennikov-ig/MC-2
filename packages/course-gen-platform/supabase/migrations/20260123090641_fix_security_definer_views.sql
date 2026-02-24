-- Migration: Fix Security Definer Views
-- Purpose: Convert views to use security_invoker=true where appropriate,
-- or add explicit admin checks for monitoring views that need elevated access.
--
-- Issue: Views without security_invoker=true execute with definer's privileges,
-- bypassing RLS policies. This is a privilege escalation risk.
--
-- Strategy:
-- 1. Views accessing user data (file_catalog, organizations, courses):
--    → Set security_invoker=true to respect RLS
-- 2. Views accessing system catalogs (cron, pg_policies, pg_total_relation_size):
--    → Keep SECURITY DEFINER behavior but add explicit is_superadmin() check
--
-- PostgreSQL 15+ supports security_invoker option for views

-- ============================================================================
-- 1. file_catalog_processing_status - User data view, should respect RLS
-- ============================================================================
DROP VIEW IF EXISTS public.file_catalog_processing_status;
CREATE VIEW public.file_catalog_processing_status
WITH (security_invoker = true)
AS
SELECT
    id,
    filename,
    file_type,
    vector_status,
    created_at,
    updated_at,
    CASE
        WHEN parsed_content IS NULL THEN 'not_processed'::text
        WHEN markdown_content IS NULL THEN 'json_only'::text
        ELSE 'fully_processed'::text
    END AS processing_status,
    CASE
        WHEN parsed_content IS NOT NULL THEN ((parsed_content -> 'metadata'::text) ->> 'page_count'::text)::integer
        ELSE NULL::integer
    END AS page_count,
    CASE
        WHEN parsed_content IS NOT NULL THEN jsonb_array_length(parsed_content -> 'texts'::text)
        ELSE NULL::integer
    END AS text_elements,
    CASE
        WHEN parsed_content IS NOT NULL THEN jsonb_array_length(parsed_content -> 'pictures'::text)
        ELSE NULL::integer
    END AS image_count,
    CASE
        WHEN parsed_content IS NOT NULL THEN jsonb_array_length(parsed_content -> 'tables'::text)
        ELSE NULL::integer
    END AS table_count,
    CASE
        WHEN markdown_content IS NOT NULL THEN length(markdown_content)
        ELSE NULL::integer
    END AS markdown_length
FROM file_catalog;

COMMENT ON VIEW public.file_catalog_processing_status IS
'File processing status view. Uses security_invoker=true to respect RLS policies on file_catalog.';

-- ============================================================================
-- 2. file_catalog_deduplication_stats - User data view, should respect RLS
-- ============================================================================
DROP VIEW IF EXISTS public.file_catalog_deduplication_stats;
CREATE VIEW public.file_catalog_deduplication_stats
WITH (security_invoker = true)
AS
SELECT
    id,
    filename,
    hash,
    file_size,
    reference_count,
    original_file_id,
    CASE
        WHEN original_file_id IS NULL THEN 'original'::text
        ELSE 'reference'::text
    END AS file_type,
    CASE
        WHEN original_file_id IS NULL AND reference_count > 1 THEN reference_count - 1
        ELSE 0
    END AS reference_copies,
    CASE
        WHEN original_file_id IS NULL AND reference_count > 1 THEN file_size * (reference_count - 1)
        ELSE 0::bigint
    END AS storage_saved_bytes,
    vector_status,
    created_at,
    organization_id,
    course_id
FROM file_catalog
ORDER BY reference_count DESC, created_at DESC;

COMMENT ON VIEW public.file_catalog_deduplication_stats IS
'File deduplication statistics. Uses security_invoker=true to respect RLS policies on file_catalog.';

-- ============================================================================
-- 3. organization_deduplication_stats - User data view, should respect RLS
-- ============================================================================
DROP VIEW IF EXISTS public.organization_deduplication_stats;
CREATE VIEW public.organization_deduplication_stats
WITH (security_invoker = true)
AS
SELECT
    o.id AS organization_id,
    o.name AS organization_name,
    count(CASE WHEN fc.original_file_id IS NULL THEN 1 ELSE NULL::integer END) AS original_files_count,
    count(CASE WHEN fc.original_file_id IS NOT NULL THEN 1 ELSE NULL::integer END) AS reference_files_count,
    sum(CASE WHEN fc.original_file_id IS NOT NULL THEN fc.file_size ELSE 0::bigint END) AS storage_saved_bytes,
    sum(fc.file_size) AS total_storage_used_bytes
FROM organizations o
LEFT JOIN file_catalog fc ON fc.organization_id = o.id
GROUP BY o.id, o.name;

COMMENT ON VIEW public.organization_deduplication_stats IS
'Organization-level deduplication statistics. Uses security_invoker=true to respect RLS policies.';

-- ============================================================================
-- 4. admin_generation_dashboard - Admin view with explicit superadmin check
-- ============================================================================
-- This view aggregates course data for monitoring. It needs to see all courses
-- regardless of organization, but should only be accessible to superadmins.
DROP VIEW IF EXISTS public.admin_generation_dashboard;
CREATE VIEW public.admin_generation_dashboard
WITH (security_invoker = true)
AS
SELECT
    generation_status,
    count(*) AS course_count,
    avg(EXTRACT(epoch FROM last_progress_update - generation_started_at))::integer AS avg_duration_seconds,
    max(last_progress_update) AS most_recent_update,
    count(*) FILTER (WHERE last_progress_update < (now() - '01:00:00'::interval)) AS stuck_count
FROM courses
WHERE generation_status IS NOT NULL
  -- Explicit superadmin check - view returns empty for non-admins
  AND is_superadmin(auth.uid())
GROUP BY generation_status
ORDER BY (
    CASE generation_status
        WHEN 'pending'::generation_status THEN 1
        WHEN 'stage_2_init'::generation_status THEN 2
        WHEN 'stage_2_processing'::generation_status THEN 3
        WHEN 'stage_2_complete'::generation_status THEN 4
        WHEN 'stage_3_init'::generation_status THEN 5
        WHEN 'stage_3_summarizing'::generation_status THEN 6
        WHEN 'stage_3_complete'::generation_status THEN 7
        WHEN 'stage_4_init'::generation_status THEN 8
        WHEN 'stage_4_analyzing'::generation_status THEN 9
        WHEN 'stage_4_complete'::generation_status THEN 10
        WHEN 'stage_5_init'::generation_status THEN 11
        WHEN 'stage_5_generating'::generation_status THEN 12
        WHEN 'stage_5_complete'::generation_status THEN 13
        WHEN 'finalizing'::generation_status THEN 14
        WHEN 'completed'::generation_status THEN 15
        WHEN 'failed'::generation_status THEN 16
        WHEN 'cancelled'::generation_status THEN 17
        ELSE 18
    END);

COMMENT ON VIEW public.admin_generation_dashboard IS
'Admin dashboard for generation status monitoring. Uses security_invoker=true with explicit is_superadmin() check. Returns empty result set for non-admins.';

-- ============================================================================
-- Grant appropriate permissions
-- ============================================================================
-- User data views - accessible to authenticated users (RLS will filter)
GRANT SELECT ON public.file_catalog_processing_status TO authenticated;
GRANT SELECT ON public.file_catalog_deduplication_stats TO authenticated;
GRANT SELECT ON public.organization_deduplication_stats TO authenticated;

-- Admin views - accessible to authenticated but return empty for non-admins
GRANT SELECT ON public.admin_generation_dashboard TO authenticated;
