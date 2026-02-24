-- Migration: Add course_id to grouped error logs RPC
-- Purpose: Show course name for the latest occurrence in grouped view
-- Must drop first because return type is changing

DROP FUNCTION IF EXISTS get_grouped_error_logs(INT, INT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT);

CREATE FUNCTION get_grouped_error_logs(
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0,
    p_severity TEXT DEFAULT NULL,
    p_environment TEXT DEFAULT NULL,
    p_search TEXT DEFAULT NULL,
    p_date_from TIMESTAMPTZ DEFAULT NULL,
    p_date_to TIMESTAMPTZ DEFAULT NULL,
    p_status TEXT DEFAULT NULL
)
RETURNS TABLE(
    fingerprint TEXT,
    count BIGINT,
    first_seen TIMESTAMPTZ,
    last_seen TIMESTAMPTZ,
    severity TEXT,
    message TEXT,
    environments TEXT[],
    latest_log_id UUID,
    latest_problem_id TEXT,
    job_type TEXT,
    issue_status TEXT,
    latest_course_id UUID  -- NEW: course_id from latest log
) AS $$
BEGIN
    RETURN QUERY
    WITH grouped AS (
        SELECT
            el.fingerprint AS fp,
            COUNT(*) AS cnt,
            MIN(el.created_at) AS first_seen_at,
            MAX(el.created_at) AS last_seen_at,
            -- Get worst severity (CRITICAL > ERROR > WARNING)
            (ARRAY_AGG(el.severity ORDER BY
                CASE el.severity
                    WHEN 'CRITICAL' THEN 3
                    WHEN 'ERROR' THEN 2
                    WHEN 'WARNING' THEN 1
                    ELSE 0
                END DESC
            ))[1] AS worst_severity,
            -- Get message from latest log
            (ARRAY_AGG(el.error_message ORDER BY el.created_at DESC))[1] AS latest_message,
            -- Get unique environments
            ARRAY_AGG(DISTINCT el.environment) FILTER (WHERE el.environment IS NOT NULL) AS envs,
            -- Get latest log id
            (ARRAY_AGG(el.id ORDER BY el.created_at DESC))[1] AS latest_id,
            -- Get latest problem id
            (ARRAY_AGG(el.problem_id ORDER BY el.created_at DESC))[1] AS latest_prob_id,
            -- Get job_type from latest log
            (ARRAY_AGG(el.job_type ORDER BY el.created_at DESC))[1] AS latest_job_type,
            -- NEW: Get course_id from latest log
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
        ws.latest_course_id  -- NEW
    FROM with_status ws
    WHERE (p_status IS NULL OR ws.resolved_status = p_status)
    ORDER BY ws.last_seen_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION get_grouped_error_logs TO authenticated;
GRANT EXECUTE ON FUNCTION get_grouped_error_logs TO service_role;

COMMENT ON FUNCTION get_grouped_error_logs IS
  'Returns error logs grouped by fingerprint with aggregated stats including latest course_id.';
