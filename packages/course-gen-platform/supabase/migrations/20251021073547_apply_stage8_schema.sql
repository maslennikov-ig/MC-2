-- ============================================================================
-- Consolidated Stage 8 Schema Migration
-- Purpose: Apply system_metrics table, course generation columns, and RPC
-- Date: 2025-10-21
-- ============================================================================

-- Migration 1: Create system_metrics table with ENUMs
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE metric_event_type AS ENUM (
    'job_rollback',
    'orphaned_job_recovery',
    'concurrency_limit_hit',
    'worker_timeout',
    'rpc_retry_exhausted',
    'duplicate_job_detected'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE metric_severity AS ENUM ('info', 'warn', 'error', 'fatal');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS system_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type metric_event_type NOT NULL,
  severity metric_severity NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  job_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_metrics_event_type ON system_metrics(event_type);
CREATE INDEX IF NOT EXISTS idx_system_metrics_severity ON system_metrics(severity);
CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp ON system_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_system_metrics_course ON system_metrics(course_id) WHERE course_id IS NOT NULL;

ALTER TABLE system_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_metrics_admin_read ON system_metrics;
CREATE POLICY system_metrics_admin_read ON system_metrics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'::role
    )
  );

DROP POLICY IF EXISTS system_metrics_service_insert ON system_metrics;
CREATE POLICY system_metrics_service_insert ON system_metrics
  FOR INSERT WITH CHECK (true);

COMMENT ON TABLE system_metrics IS 'Critical system events for Stage 8 monitoring and alerting';

-- Migration 2: Add course generation tracking columns
-- ============================================================================

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS generation_progress JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS generation_started_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS generation_completed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_progress_update TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS webhook_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS error_message TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS error_details JSONB DEFAULT NULL;

COMMENT ON COLUMN courses.generation_progress IS 'JSONB structure tracking 5-step generation progress';
COMMENT ON COLUMN courses.generation_started_at IS 'Timestamp when course generation started';
COMMENT ON COLUMN courses.generation_completed_at IS 'Timestamp when course generation completed';
COMMENT ON COLUMN courses.last_progress_update IS 'Last timestamp when progress was updated';
COMMENT ON COLUMN courses.webhook_url IS 'Optional callback URL for progress notifications';
COMMENT ON COLUMN courses.error_message IS 'User-facing error message if generation failed';
COMMENT ON COLUMN courses.error_details IS 'Detailed error information for debugging';

-- Migration 3: Create update_course_progress RPC function
-- ============================================================================

CREATE OR REPLACE FUNCTION update_course_progress(
  p_course_id UUID,
  p_step_id INTEGER,
  p_status TEXT,
  p_message TEXT,
  p_error_message TEXT DEFAULT NULL,
  p_error_details JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
DECLARE
  v_progress JSONB;
  v_step_index INTEGER;
  v_percentage INTEGER;
BEGIN
  -- Validate step_id (1-5)
  IF p_step_id < 1 OR p_step_id > 5 THEN
    RAISE EXCEPTION 'Invalid step_id: %. Must be 1-5', p_step_id;
  END IF;

  -- Validate status
  IF p_status NOT IN ('pending', 'in_progress', 'completed', 'failed') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be pending|in_progress|completed|failed', p_status;
  END IF;

  -- Calculate percentage (20% per step)
  v_percentage := CASE
    WHEN p_status = 'completed' THEN p_step_id * 20
    WHEN p_status = 'in_progress' THEN (p_step_id - 1) * 20 + 10
    ELSE (p_step_id - 1) * 20
  END;

  -- Step array index (0-based)
  v_step_index := p_step_id - 1;

  -- Update generation_progress JSONB
  UPDATE courses
  SET
    generation_progress = CASE
      WHEN p_error_message IS NOT NULL THEN
        -- With error fields
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      generation_progress,
                      array['steps', v_step_index::text, 'status'],
                      to_jsonb(p_status)
                    ),
                    array['steps', v_step_index::text, CASE WHEN p_status = 'in_progress' THEN 'started_at' ELSE 'completed_at' END],
                    to_jsonb(NOW())
                  ),
                  array['percentage'],
                  to_jsonb(v_percentage)
                ),
                array['current_step'],
                to_jsonb(p_step_id)
              ),
              array['message'],
              to_jsonb(p_message)
            ),
            array['steps', v_step_index::text, 'error'],
            to_jsonb(p_error_message)
          ),
          array['steps', v_step_index::text, 'error_details'],
          COALESCE(p_error_details, '{}'::jsonb)
        )
      ELSE
        -- Without error fields
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  generation_progress,
                  array['steps', v_step_index::text, 'status'],
                  to_jsonb(p_status)
                ),
                array['steps', v_step_index::text, CASE WHEN p_status = 'in_progress' THEN 'started_at' ELSE 'completed_at' END],
                to_jsonb(NOW())
              ),
              array['percentage'],
              to_jsonb(v_percentage)
            ),
            array['current_step'],
            to_jsonb(p_step_id)
          ),
          array['message'],
          to_jsonb(p_message)
        )
    END,
    last_progress_update = NOW(),
    updated_at = NOW()
  WHERE id = p_course_id
  RETURNING generation_progress INTO v_progress;

  -- Return updated progress (NULL if course not found)
  RETURN v_progress;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service role (backend)
GRANT EXECUTE ON FUNCTION update_course_progress TO service_role;

-- Revoke from authenticated users (backend-only RPC)
REVOKE EXECUTE ON FUNCTION update_course_progress FROM authenticated;
