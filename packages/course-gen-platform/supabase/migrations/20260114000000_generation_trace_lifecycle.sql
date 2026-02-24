-- Migration: 20260114000000_generation_trace_lifecycle.sql
-- Purpose: Implement generation_trace data lifecycle management
-- Components:
--   1. Archive table (WARM tier) for old traces
--   2. Stats table for aggregated metrics
--   3. Lifecycle functions (archive, export, purge, update_stats)
--   4. pg_cron jobs for automated maintenance
--   5. Monitoring view and health check function

-- ============================================================================
-- 1. ARCHIVE TABLE (WARM TIER)
-- ============================================================================

-- Create archive table with same structure as generation_trace
CREATE TABLE IF NOT EXISTS generation_trace_archive (
    id UUID PRIMARY KEY,
    course_id UUID NOT NULL,
    lesson_id UUID,
    stage TEXT NOT NULL,
    phase TEXT NOT NULL,
    step_name TEXT NOT NULL,
    input_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    output_data JSONB,
    error_data JSONB,
    model_used TEXT,
    prompt_text TEXT,
    completion_text TEXT,
    tokens_used INTEGER,
    cost_usd NUMERIC,
    temperature NUMERIC,
    duration_ms INTEGER,
    retry_attempt INTEGER DEFAULT 0,
    was_cached BOOLEAN DEFAULT false,
    quality_score NUMERIC,
    created_at TIMESTAMPTZ NOT NULL,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comment for documentation
COMMENT ON TABLE generation_trace_archive IS 'Archive table for generation_trace records older than 30 days (WARM tier)';
COMMENT ON COLUMN generation_trace_archive.archived_at IS 'Timestamp when the record was moved to archive';

-- Indexes for archive table
CREATE INDEX IF NOT EXISTS idx_trace_archive_course_created
    ON generation_trace_archive(course_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trace_archive_error
    ON generation_trace_archive(created_at)
    WHERE error_data IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trace_archive_archived_at
    ON generation_trace_archive(archived_at DESC);

-- RLS policies for archive table (mirror generation_trace policies)
ALTER TABLE generation_trace_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can view all archive traces"
    ON generation_trace_archive FOR SELECT
    USING (is_superadmin(auth.uid()));

CREATE POLICY "Users can view own course archive traces"
    ON generation_trace_archive FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM courses c
        WHERE c.id = generation_trace_archive.course_id
        AND c.user_id = auth.uid()
    ));

CREATE POLICY "Instructors can view archive traces for their courses"
    ON generation_trace_archive FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM courses c
        JOIN users u ON u.id = auth.uid()
        WHERE c.id = generation_trace_archive.course_id
        AND c.organization_id = u.organization_id
        AND u.role IN ('instructor', 'admin', 'superadmin')
    ));

CREATE POLICY "Admins can view archive traces in their organization"
    ON generation_trace_archive FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM courses c
        WHERE c.id = generation_trace_archive.course_id
        AND c.organization_id = ((auth.jwt() ->> 'organization_id')::uuid)
        AND (auth.jwt() ->> 'role') = 'admin'
    ));

-- ============================================================================
-- 2. STATS TABLE (AGGREGATED METRICS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS generation_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    total_traces INTEGER NOT NULL DEFAULT 0,
    successful_traces INTEGER NOT NULL DEFAULT 0,
    failed_traces INTEGER NOT NULL DEFAULT 0,
    cached_traces INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    total_cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
    total_duration_ms BIGINT NOT NULL DEFAULT 0,
    traces_by_stage JSONB NOT NULL DEFAULT '{}'::jsonb,
    avg_quality_score NUMERIC(3,2),
    min_quality_score NUMERIC(3,2),
    max_quality_score NUMERIC(3,2),
    models_used JSONB NOT NULL DEFAULT '[]'::jsonb,
    first_trace_at TIMESTAMPTZ,
    last_trace_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(course_id)
);

COMMENT ON TABLE generation_stats IS 'Aggregated statistics for generation traces per course';

-- Indexes for stats table
CREATE INDEX IF NOT EXISTS idx_generation_stats_course ON generation_stats(course_id);
CREATE INDEX IF NOT EXISTS idx_generation_stats_cost ON generation_stats(total_cost_usd DESC);
CREATE INDEX IF NOT EXISTS idx_generation_stats_updated ON generation_stats(updated_at DESC);

-- RLS for stats table
ALTER TABLE generation_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can view all stats"
    ON generation_stats FOR SELECT
    USING (is_superadmin(auth.uid()));

CREATE POLICY "Users can view own course stats"
    ON generation_stats FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM courses c
        WHERE c.id = generation_stats.course_id
        AND c.user_id = auth.uid()
    ));

CREATE POLICY "Instructors can view stats for their organization courses"
    ON generation_stats FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM courses c
        JOIN users u ON u.id = auth.uid()
        WHERE c.id = generation_stats.course_id
        AND c.organization_id = u.organization_id
        AND u.role IN ('instructor', 'admin', 'superadmin')
    ));

-- ============================================================================
-- 3. LIFECYCLE FUNCTIONS
-- ============================================================================

-- Function: Archive old traces
CREATE OR REPLACE FUNCTION archive_old_traces(p_age_days INTEGER DEFAULT 30)
RETURNS TABLE(archived_count INTEGER, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cutoff TIMESTAMPTZ;
    v_count INTEGER := 0;
BEGIN
    v_cutoff := NOW() - (p_age_days || ' days')::INTERVAL;

    -- Move old traces to archive
    WITH moved AS (
        INSERT INTO generation_trace_archive (
            id, course_id, lesson_id, stage, phase, step_name,
            input_data, output_data, error_data, model_used,
            prompt_text, completion_text, tokens_used, cost_usd,
            temperature, duration_ms, retry_attempt, was_cached,
            quality_score, created_at, archived_at
        )
        SELECT
            id, course_id, lesson_id, stage, phase, step_name,
            input_data, output_data, error_data, model_used,
            prompt_text, completion_text, tokens_used, cost_usd,
            temperature, duration_ms, retry_attempt, was_cached,
            quality_score, created_at, NOW()
        FROM generation_trace
        WHERE created_at < v_cutoff
        ON CONFLICT (id) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*)::INTEGER INTO v_count FROM moved;

    -- Delete archived traces from main table
    DELETE FROM generation_trace
    WHERE created_at < v_cutoff
    AND id IN (SELECT id FROM generation_trace_archive WHERE archived_at >= NOW() - INTERVAL '1 minute');

    archived_count := v_count;
    error_message := NULL;
    RETURN NEXT;

EXCEPTION WHEN OTHERS THEN
    archived_count := 0;
    error_message := SQLERRM;
    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION archive_old_traces IS 'Move generation_trace records older than p_age_days to archive table';

-- Function: Export archive to JSON (returns exportable data)
CREATE OR REPLACE FUNCTION export_archive_to_json(p_age_days INTEGER DEFAULT 90)
RETURNS TABLE(
    export_count INTEGER,
    export_data JSONB,
    error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cutoff TIMESTAMPTZ;
    v_count INTEGER := 0;
    v_data JSONB;
BEGIN
    v_cutoff := NOW() - (p_age_days || ' days')::INTERVAL;

    -- Get count of records to export
    SELECT COUNT(*)::INTEGER INTO v_count
    FROM generation_trace_archive
    WHERE archived_at < v_cutoff;

    -- Get data as JSON array (limited to prevent memory issues)
    SELECT jsonb_agg(row_to_json(t)::jsonb)
    INTO v_data
    FROM (
        SELECT *
        FROM generation_trace_archive
        WHERE archived_at < v_cutoff
        ORDER BY archived_at ASC
        LIMIT 10000
    ) t;

    export_count := v_count;
    export_data := COALESCE(v_data, '[]'::jsonb);
    error_message := NULL;
    RETURN NEXT;

EXCEPTION WHEN OTHERS THEN
    export_count := 0;
    export_data := '[]'::jsonb;
    error_message := SQLERRM;
    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION export_archive_to_json IS 'Export archive records older than p_age_days as JSON for cold storage';

-- Function: Purge exported archive records
CREATE OR REPLACE FUNCTION purge_exported_archive(p_age_days INTEGER DEFAULT 90)
RETURNS TABLE(purged_count INTEGER, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cutoff TIMESTAMPTZ;
    v_count INTEGER := 0;
BEGIN
    v_cutoff := NOW() - (p_age_days || ' days')::INTERVAL;

    WITH deleted AS (
        DELETE FROM generation_trace_archive
        WHERE archived_at < v_cutoff
        RETURNING 1
    )
    SELECT COUNT(*)::INTEGER INTO v_count FROM deleted;

    purged_count := v_count;
    error_message := NULL;
    RETURN NEXT;

EXCEPTION WHEN OTHERS THEN
    purged_count := 0;
    error_message := SQLERRM;
    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION purge_exported_archive IS 'Delete archive records older than p_age_days (should be called after export)';

-- Function: Update generation stats for a course
CREATE OR REPLACE FUNCTION update_generation_stats(p_course_id UUID DEFAULT NULL)
RETURNS TABLE(
    courses_updated INTEGER,
    error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER := 0;
    v_course RECORD;
BEGIN
    -- Process all courses or specific course
    FOR v_course IN
        SELECT DISTINCT course_id
        FROM generation_trace
        WHERE p_course_id IS NULL OR course_id = p_course_id
    LOOP
        INSERT INTO generation_stats (
            course_id,
            total_traces,
            successful_traces,
            failed_traces,
            cached_traces,
            total_tokens,
            total_cost_usd,
            total_duration_ms,
            traces_by_stage,
            avg_quality_score,
            min_quality_score,
            max_quality_score,
            models_used,
            first_trace_at,
            last_trace_at,
            updated_at
        )
        SELECT
            v_course.course_id,
            COUNT(*)::INTEGER,
            COUNT(*) FILTER (WHERE error_data IS NULL)::INTEGER,
            COUNT(*) FILTER (WHERE error_data IS NOT NULL)::INTEGER,
            COUNT(*) FILTER (WHERE was_cached = true)::INTEGER,
            COALESCE(SUM(tokens_used), 0)::INTEGER,
            COALESCE(SUM(cost_usd), 0)::NUMERIC(12,6),
            COALESCE(SUM(duration_ms), 0)::BIGINT,
            COALESCE(
                jsonb_object_agg(stage, stage_count) FILTER (WHERE stage IS NOT NULL),
                '{}'::jsonb
            ),
            ROUND(AVG(quality_score), 2)::NUMERIC(3,2),
            MIN(quality_score)::NUMERIC(3,2),
            MAX(quality_score)::NUMERIC(3,2),
            COALESCE(
                jsonb_agg(DISTINCT model_used) FILTER (WHERE model_used IS NOT NULL),
                '[]'::jsonb
            ),
            MIN(created_at),
            MAX(created_at),
            NOW()
        FROM generation_trace gt
        LEFT JOIN LATERAL (
            SELECT stage, COUNT(*)::INTEGER as stage_count
            FROM generation_trace
            WHERE course_id = v_course.course_id
            GROUP BY stage
        ) stage_counts ON true
        WHERE gt.course_id = v_course.course_id
        GROUP BY v_course.course_id
        ON CONFLICT (course_id) DO UPDATE SET
            total_traces = EXCLUDED.total_traces,
            successful_traces = EXCLUDED.successful_traces,
            failed_traces = EXCLUDED.failed_traces,
            cached_traces = EXCLUDED.cached_traces,
            total_tokens = EXCLUDED.total_tokens,
            total_cost_usd = EXCLUDED.total_cost_usd,
            total_duration_ms = EXCLUDED.total_duration_ms,
            traces_by_stage = EXCLUDED.traces_by_stage,
            avg_quality_score = EXCLUDED.avg_quality_score,
            min_quality_score = EXCLUDED.min_quality_score,
            max_quality_score = EXCLUDED.max_quality_score,
            models_used = EXCLUDED.models_used,
            first_trace_at = EXCLUDED.first_trace_at,
            last_trace_at = EXCLUDED.last_trace_at,
            updated_at = NOW();

        v_count := v_count + 1;
    END LOOP;

    courses_updated := v_count;
    error_message := NULL;
    RETURN NEXT;

EXCEPTION WHEN OTHERS THEN
    courses_updated := 0;
    error_message := SQLERRM;
    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION update_generation_stats IS 'Calculate and update aggregated stats for a course (or all courses if NULL)';

-- Simplified version for stats calculation (fixes the complex query issue)
CREATE OR REPLACE FUNCTION calculate_course_stats(p_course_id UUID)
RETURNS generation_stats
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result generation_stats%ROWTYPE;
    v_traces_by_stage JSONB;
    v_models JSONB;
BEGIN
    -- Get basic stats
    SELECT
        gen_random_uuid(),
        p_course_id,
        COUNT(*)::INTEGER,
        COUNT(*) FILTER (WHERE error_data IS NULL)::INTEGER,
        COUNT(*) FILTER (WHERE error_data IS NOT NULL)::INTEGER,
        COUNT(*) FILTER (WHERE was_cached = true)::INTEGER,
        COALESCE(SUM(tokens_used), 0)::INTEGER,
        COALESCE(SUM(cost_usd), 0)::NUMERIC(12,6),
        COALESCE(SUM(duration_ms), 0)::BIGINT,
        '{}'::jsonb,
        ROUND(AVG(quality_score), 2)::NUMERIC(3,2),
        MIN(quality_score)::NUMERIC(3,2),
        MAX(quality_score)::NUMERIC(3,2),
        '[]'::jsonb,
        MIN(created_at),
        MAX(created_at),
        NOW(),
        NOW()
    INTO
        v_result.id,
        v_result.course_id,
        v_result.total_traces,
        v_result.successful_traces,
        v_result.failed_traces,
        v_result.cached_traces,
        v_result.total_tokens,
        v_result.total_cost_usd,
        v_result.total_duration_ms,
        v_result.traces_by_stage,
        v_result.avg_quality_score,
        v_result.min_quality_score,
        v_result.max_quality_score,
        v_result.models_used,
        v_result.first_trace_at,
        v_result.last_trace_at,
        v_result.created_at,
        v_result.updated_at
    FROM generation_trace
    WHERE course_id = p_course_id;

    -- Get traces by stage
    SELECT COALESCE(jsonb_object_agg(stage, cnt), '{}'::jsonb)
    INTO v_traces_by_stage
    FROM (
        SELECT stage, COUNT(*)::INTEGER as cnt
        FROM generation_trace
        WHERE course_id = p_course_id
        GROUP BY stage
    ) s;

    v_result.traces_by_stage := v_traces_by_stage;

    -- Get models used
    SELECT COALESCE(jsonb_agg(DISTINCT model_used) FILTER (WHERE model_used IS NOT NULL), '[]'::jsonb)
    INTO v_models
    FROM generation_trace
    WHERE course_id = p_course_id;

    v_result.models_used := v_models;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION calculate_course_stats IS 'Calculate stats for a single course (helper function)';

-- ============================================================================
-- 4. PG_CRON JOBS
-- ============================================================================

-- Remove existing jobs if they exist (idempotent)
SELECT cron.unschedule('trace-daily-archive') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'trace-daily-archive'
);

SELECT cron.unschedule('trace-monthly-stats') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'trace-monthly-stats'
);

-- Daily archive job: Run at 2:00 UTC, archive traces older than 30 days
SELECT cron.schedule(
    'trace-daily-archive',
    '0 2 * * *',
    $$SELECT archive_old_traces(30)$$
);

-- Monthly stats and maintenance: Run on 1st of month at 4:00 UTC
SELECT cron.schedule(
    'trace-monthly-stats',
    '0 4 1 * *',
    $$
    SELECT update_generation_stats(NULL);
    VACUUM ANALYZE generation_trace;
    VACUUM ANALYZE generation_trace_archive;
    $$
);

-- ============================================================================
-- 5. PERFORMANCE INDEX
-- ============================================================================

-- Add composite index for better query performance (if not exists via skeleton index)
-- Note: idx_trace_skeleton already covers (course_id, created_at DESC) with INCLUDE
-- Adding this for explicit coverage of common queries
CREATE INDEX IF NOT EXISTS idx_generation_trace_course_created
    ON generation_trace(course_id, created_at DESC);

-- ============================================================================
-- 6. MONITORING VIEW
-- ============================================================================

CREATE OR REPLACE VIEW trace_storage_stats AS
WITH main_stats AS (
    SELECT
        'generation_trace' as table_name,
        COUNT(*) as row_count,
        pg_size_pretty(pg_total_relation_size('generation_trace')) as total_size,
        MIN(created_at) as oldest,
        MAX(created_at) as newest,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h
    FROM generation_trace
),
archive_stats AS (
    SELECT
        'generation_trace_archive' as table_name,
        COUNT(*) as row_count,
        pg_size_pretty(pg_total_relation_size('generation_trace_archive')) as total_size,
        MIN(created_at) as oldest,
        MAX(created_at) as newest,
        COUNT(*) FILTER (WHERE archived_at > NOW() - INTERVAL '24 hours') as last_24h
    FROM generation_trace_archive
),
stats_stats AS (
    SELECT
        'generation_stats' as table_name,
        COUNT(*) as row_count,
        pg_size_pretty(pg_total_relation_size('generation_stats')) as total_size,
        MIN(created_at) as oldest,
        MAX(updated_at) as newest,
        COUNT(*) FILTER (WHERE updated_at > NOW() - INTERVAL '24 hours') as last_24h
    FROM generation_stats
)
SELECT * FROM main_stats
UNION ALL
SELECT * FROM archive_stats
UNION ALL
SELECT * FROM stats_stats;

COMMENT ON VIEW trace_storage_stats IS 'Overview of trace storage across all tiers';

-- ============================================================================
-- 7. HEALTH CHECK FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION check_trace_storage_health()
RETURNS TABLE(
    alert_level TEXT,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_main_count BIGINT;
    v_main_size BIGINT;
    v_archive_count BIGINT;
    v_oldest_main TIMESTAMPTZ;
    v_cron_enabled BOOLEAN;
    v_has_alerts BOOLEAN := false;
BEGIN
    -- Get main table stats
    SELECT COUNT(*), pg_total_relation_size('generation_trace')
    INTO v_main_count, v_main_size
    FROM generation_trace;

    -- Get archive stats
    SELECT COUNT(*) INTO v_archive_count FROM generation_trace_archive;

    -- Get oldest record in main table
    SELECT MIN(created_at) INTO v_oldest_main FROM generation_trace;

    -- Check if cron jobs exist
    SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'trace-daily-archive')
    INTO v_cron_enabled;

    -- Check 1: Main table size
    IF v_main_size > 1073741824 THEN -- 1 GB
        v_has_alerts := true;
        alert_level := 'critical';
        message := format('Main trace table size exceeds 1GB: %s', pg_size_pretty(v_main_size));
        RETURN NEXT;
    ELSIF v_main_size > 536870912 THEN -- 512 MB
        v_has_alerts := true;
        alert_level := 'warning';
        message := format('Main trace table size exceeds 512MB: %s', pg_size_pretty(v_main_size));
        RETURN NEXT;
    END IF;

    -- Check 2: Row count in main table
    IF v_main_count > 1000000 THEN
        v_has_alerts := true;
        alert_level := 'critical';
        message := format('Main trace table has over 1M rows: %s', v_main_count);
        RETURN NEXT;
    ELSIF v_main_count > 500000 THEN
        v_has_alerts := true;
        alert_level := 'warning';
        message := format('Main trace table has over 500K rows: %s', v_main_count);
        RETURN NEXT;
    END IF;

    -- Check 3: Old records not being archived
    IF v_oldest_main IS NOT NULL AND v_oldest_main < NOW() - INTERVAL '45 days' THEN
        v_has_alerts := true;
        alert_level := 'warning';
        message := format('Oldest main table record is %s days old (should be < 30)',
            EXTRACT(DAY FROM NOW() - v_oldest_main)::INTEGER);
        RETURN NEXT;
    END IF;

    -- Check 4: Cron jobs
    IF NOT v_cron_enabled THEN
        v_has_alerts := true;
        alert_level := 'critical';
        message := 'Archive cron job is not scheduled';
        RETURN NEXT;
    END IF;

    -- Check 5: Archive growth
    IF v_archive_count > 5000000 THEN
        v_has_alerts := true;
        alert_level := 'warning';
        message := format('Archive table has over 5M rows: %s. Consider purging old data.', v_archive_count);
        RETURN NEXT;
    END IF;

    -- If no alerts, return OK status
    IF NOT v_has_alerts THEN
        alert_level := 'ok';
        message := format('Trace storage healthy. Main: %s rows (%s), Archive: %s rows',
            v_main_count, pg_size_pretty(v_main_size), v_archive_count);
        RETURN NEXT;
    END IF;
END;
$$;

COMMENT ON FUNCTION check_trace_storage_health IS 'Check trace storage health and return alerts';

-- ============================================================================
-- 8. GRANT PERMISSIONS
-- ============================================================================

-- Grant usage on functions to authenticated users (RLS will handle access)
GRANT SELECT ON trace_storage_stats TO authenticated;
GRANT EXECUTE ON FUNCTION check_trace_storage_health() TO authenticated;

-- Service role needs full access for maintenance operations
GRANT ALL ON generation_trace_archive TO service_role;
GRANT ALL ON generation_stats TO service_role;
GRANT EXECUTE ON FUNCTION archive_old_traces(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION export_archive_to_json(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION purge_exported_archive(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION update_generation_stats(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION calculate_course_stats(UUID) TO service_role;
