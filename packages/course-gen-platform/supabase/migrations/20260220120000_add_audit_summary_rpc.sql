-- Aggregate audit summary for a course in a single database round-trip
CREATE OR REPLACE FUNCTION get_audit_summary(p_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'totals', (
      SELECT jsonb_build_object(
        'traceCount', count(*)::int,
        'totalCost', coalesce(sum(cost_usd), 0),
        'totalTokens', coalesce(sum(tokens_used), 0)::bigint,
        'errorCount', count(*) FILTER (WHERE error_data IS NOT NULL)::int,
        'retryCount', count(*) FILTER (WHERE retry_attempt > 0)::int
      )
      FROM generation_trace
      WHERE course_id = p_course_id
    ),
    'stageBreakdown', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'stage', stage,
          'calls', calls,
          'tokens', tokens,
          'cost', cost,
          'duration', duration,
          'errors', errors
        ) ORDER BY stage
      ), '[]'::jsonb)
      FROM (
        SELECT
          stage,
          count(*)::int AS calls,
          coalesce(sum(tokens_used), 0)::bigint AS tokens,
          coalesce(sum(cost_usd), 0) AS cost,
          coalesce(sum(duration_ms), 0)::bigint AS duration,
          count(*) FILTER (WHERE error_data IS NOT NULL)::int AS errors
        FROM generation_trace
        WHERE course_id = p_course_id
        GROUP BY stage
      ) s
    ),
    'modelBreakdown', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'model', model,
          'calls', calls,
          'tokens', tokens,
          'cost', cost
        ) ORDER BY calls DESC
      ), '[]'::jsonb)
      FROM (
        SELECT
          coalesce(model_used, 'unknown') AS model,
          count(*)::int AS calls,
          coalesce(sum(tokens_used), 0)::bigint AS tokens,
          coalesce(sum(cost_usd), 0) AS cost
        FROM generation_trace
        WHERE course_id = p_course_id
        GROUP BY model_used
      ) m
    ),
    'filterOptions', jsonb_build_object(
      'stages', (
        SELECT coalesce(jsonb_agg(DISTINCT stage ORDER BY stage), '[]'::jsonb)
        FROM generation_trace
        WHERE course_id = p_course_id
      ),
      'phases', (
        SELECT coalesce(jsonb_agg(DISTINCT phase ORDER BY phase), '[]'::jsonb)
        FROM generation_trace
        WHERE course_id = p_course_id
      ),
      'models', (
        SELECT coalesce(jsonb_agg(DISTINCT model_used ORDER BY model_used), '[]'::jsonb)
        FROM generation_trace
        WHERE course_id = p_course_id
        AND model_used IS NOT NULL
      )
    )
  ) INTO result;

  RETURN result;
END;
$$;
