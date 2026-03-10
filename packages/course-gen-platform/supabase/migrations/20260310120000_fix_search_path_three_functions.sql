-- Fix mutable search_path for 3 functions
-- Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

-- 1. update_benchmark_updated_at
CREATE OR REPLACE FUNCTION public.update_benchmark_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public, pg_temp
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- 2. get_new_error_log_ids
CREATE OR REPLACE FUNCTION public.get_new_error_log_ids()
 RETURNS TABLE(id uuid)
 LANGUAGE plpgsql
 STABLE
 SET search_path = public, pg_temp
AS $function$
BEGIN
    RETURN QUERY
    SELECT el.id
    FROM error_logs el
    WHERE el.fingerprint IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM log_issue_status lis
          WHERE lis.fingerprint = el.fingerprint
            AND lis.log_type = 'error_log'
            AND lis.status = 'new'
        )
        OR
        NOT EXISTS (
          SELECT 1 FROM log_issue_status lis
          WHERE lis.fingerprint = el.fingerprint
            AND lis.log_type = 'error_log'
        )
      );
END;
$function$;

-- 3. get_grouped_error_logs
CREATE OR REPLACE FUNCTION public.get_grouped_error_logs(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_severity text DEFAULT NULL::text, p_environment text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_status text DEFAULT NULL::text)
 RETURNS TABLE(fingerprint text, count bigint, first_seen timestamp with time zone, last_seen timestamp with time zone, severity text, message text, environments text[], latest_log_id uuid, latest_problem_id text, job_type text, issue_status text, latest_course_id uuid)
 LANGUAGE plpgsql
 STABLE
 SET search_path = public, pg_temp
AS $function$
BEGIN
    RETURN QUERY
    WITH grouped AS (
        SELECT
            el.fingerprint AS fp,
            COUNT(*) AS cnt,
            MIN(el.created_at) AS first_seen_at,
            MAX(el.created_at) AS last_seen_at,
            (ARRAY_AGG(el.severity ORDER BY
                CASE el.severity
                    WHEN 'CRITICAL' THEN 3
                    WHEN 'ERROR' THEN 2
                    WHEN 'WARNING' THEN 1
                    ELSE 0
                END DESC
            ))[1] AS worst_severity,
            (ARRAY_AGG(el.error_message ORDER BY el.created_at DESC))[1] AS latest_message,
            ARRAY_AGG(DISTINCT el.environment) FILTER (WHERE el.environment IS NOT NULL) AS envs,
            (ARRAY_AGG(el.id ORDER BY el.created_at DESC))[1] AS latest_id,
            (ARRAY_AGG(el.problem_id ORDER BY el.created_at DESC))[1] AS latest_prob_id,
            (ARRAY_AGG(el.job_type ORDER BY el.created_at DESC))[1] AS latest_job_type,
            (ARRAY_AGG(el.course_id ORDER BY el.created_at DESC))[1] AS latest_course_id
        FROM error_logs el
        WHERE el.fingerprint IS NOT NULL
            AND (p_severity IS NULL OR el.severity = p_severity)
            AND (p_environment IS NULL OR el.environment = p_environment)
            AND (p_search IS NULL OR el.error_message ILIKE '%' || p_search || '%')
            AND (p_date_from IS NULL OR el.created_at >= p_date_from)
            AND (p_date_to IS NULL OR el.created_at <= p_date_to)
        GROUP BY el.fingerprint
    ),
    with_status AS (
        SELECT
            g.*,
            COALESCE(lis.status, 'new') AS resolved_status
        FROM grouped g
        LEFT JOIN log_issue_status lis ON lis.fingerprint = g.fp
    )
    SELECT
        ws.fp,
        ws.cnt,
        ws.first_seen_at,
        ws.last_seen_at,
        ws.worst_severity,
        ws.latest_message,
        COALESCE(ws.envs, ARRAY[]::TEXT[]),
        ws.latest_id,
        ws.latest_prob_id,
        ws.latest_job_type,
        ws.resolved_status,
        ws.latest_course_id
    FROM with_status ws
    WHERE (p_status IS NULL OR ws.resolved_status = p_status)
    ORDER BY ws.last_seen_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$function$;
