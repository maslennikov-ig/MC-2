-- ============================================================================
-- Production-Grade Generation Status Management
-- Purpose: Add separate generation_status field with validation and audit
-- Date: 2025-10-21
-- Author: Claude Code (Stage 1 - Main Entry Orchestrator)
-- ============================================================================

-- Step 1: Create generation_status ENUM type
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE generation_status AS ENUM (
    'pending',              -- Queued, waiting to start
    'initializing',         -- Step 1: Initialization
    'processing_documents', -- Step 2: Processing uploaded files
    'analyzing_task',       -- Step 2: Analyzing task (no files)
    'generating_structure', -- Step 3: Creating course structure
    'generating_content',   -- Step 4: Generating lessons
    'finalizing',           -- Step 5: Finalizing course
    'completed',            -- Generation finished successfully
    'failed',               -- Generation failed with error
    'cancelled'             -- User cancelled generation
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE generation_status IS 'Course generation workflow states (separate from publication lifecycle)';

-- Step 2: Add generation_status column to courses table
-- ============================================================================

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS generation_status generation_status DEFAULT NULL;

COMMENT ON COLUMN courses.generation_status IS 'Current generation workflow state (NULL = never started generation)';

-- Step 3: Create indexes for performance
-- ============================================================================

-- General index for filtering by status
CREATE INDEX IF NOT EXISTS idx_courses_generation_status
  ON courses(generation_status)
  WHERE generation_status IS NOT NULL;

-- Partial index for active (in-progress) generations - most frequent query
CREATE INDEX IF NOT EXISTS idx_courses_active_generation
  ON courses(generation_status, last_progress_update)
  WHERE generation_status NOT IN ('completed', 'failed', 'cancelled');


-- Step 4: Create audit table for status history
-- ============================================================================

CREATE TABLE IF NOT EXISTS generation_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  old_status generation_status,
  new_status generation_status NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_source TEXT,  -- 'rpc', 'worker', 'manual', 'system'
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_generation_history_course
  ON generation_status_history(course_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_generation_history_timestamp
  ON generation_status_history(changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_generation_history_transitions
  ON generation_status_history(old_status, new_status)
  WHERE old_status IS NOT NULL;

COMMENT ON TABLE generation_status_history IS 'Audit trail for all generation status transitions';

-- Enable RLS on audit table
ALTER TABLE generation_status_history ENABLE ROW LEVEL SECURITY;

-- Admin read access
DROP POLICY IF EXISTS generation_history_admin_read ON generation_status_history;
CREATE POLICY generation_history_admin_read ON generation_status_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'::role
    )
  );

-- Users can see history of their own courses
DROP POLICY IF EXISTS generation_history_owner_read ON generation_status_history;
CREATE POLICY generation_history_owner_read ON generation_status_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = generation_status_history.course_id
      AND courses.user_id = auth.uid()
    )
  );

-- Service role can insert
DROP POLICY IF EXISTS generation_history_service_insert ON generation_status_history;
CREATE POLICY generation_history_service_insert ON generation_status_history
  FOR INSERT WITH CHECK (true);

-- Step 5: Create state transition validation trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_generation_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_valid_transitions JSONB;
BEGIN
  -- Allow NULL → any status (first initialization)
  IF OLD.generation_status IS NULL THEN
    RETURN NEW;
  END IF;

  -- Prevent changes if status didn't actually change
  IF NEW.generation_status = OLD.generation_status THEN
    RETURN NEW;
  END IF;

  -- Define valid state machine transitions
  v_valid_transitions := '{
    "pending": ["initializing", "cancelled"],
    "initializing": ["processing_documents", "analyzing_task", "failed", "cancelled"],
    "processing_documents": ["generating_structure", "failed", "cancelled"],
    "analyzing_task": ["generating_structure", "failed", "cancelled"],
    "generating_structure": ["generating_content", "failed", "cancelled"],
    "generating_content": ["finalizing", "failed", "cancelled"],
    "finalizing": ["completed", "failed", "cancelled"],
    "completed": ["pending"],
    "failed": ["pending"],
    "cancelled": ["pending"]
  }'::JSONB;

  -- Check if transition is valid
  IF NOT (v_valid_transitions->OLD.generation_status::text) ? NEW.generation_status::text THEN
    RAISE EXCEPTION 'Invalid generation status transition: % → % (course_id: %)',
      OLD.generation_status,
      NEW.generation_status,
      NEW.id
    USING HINT = 'Valid transitions from ' || OLD.generation_status || ': ' ||
                  (v_valid_transitions->OLD.generation_status::text)::text;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_generation_status ON courses;
CREATE TRIGGER trg_validate_generation_status
  BEFORE UPDATE OF generation_status ON courses
  FOR EACH ROW
  WHEN (OLD.generation_status IS DISTINCT FROM NEW.generation_status)
  EXECUTE FUNCTION validate_generation_status_transition();

-- Step 6: Create audit logging trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION log_generation_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log when status actually changes
  IF OLD.generation_status IS DISTINCT FROM NEW.generation_status THEN
    INSERT INTO generation_status_history (
      course_id,
      old_status,
      new_status,
      changed_by,
      trigger_source,
      metadata
    ) VALUES (
      NEW.id,
      OLD.generation_status,
      NEW.generation_status,
      NULLIF(current_setting('app.current_user_id', true), '')::UUID,
      COALESCE(current_setting('app.trigger_source', true), 'system'),
      jsonb_build_object(
        'previous_progress', OLD.generation_progress,
        'new_progress', NEW.generation_progress,
        'error_message', NEW.error_message
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_generation_status ON courses;
CREATE TRIGGER trg_log_generation_status
  AFTER UPDATE OF generation_status ON courses
  FOR EACH ROW
  EXECUTE FUNCTION log_generation_status_change();

-- Step 7: Helper function to get current generation state summary
-- ============================================================================

CREATE OR REPLACE FUNCTION get_generation_summary(p_course_id UUID)
RETURNS TABLE (
  current_status generation_status,
  current_step INTEGER,
  percentage INTEGER,
  started_at TIMESTAMPTZ,
  last_updated TIMESTAMPTZ,
  duration_seconds INTEGER,
  is_stuck BOOLEAN,
  transition_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.generation_status,
    (c.generation_progress->>'current_step')::INTEGER,
    (c.generation_progress->>'percentage')::INTEGER,
    c.generation_started_at,
    c.last_progress_update,
    EXTRACT(EPOCH FROM (COALESCE(c.generation_completed_at, NOW()) - c.generation_started_at))::INTEGER,
    -- Consider stuck if: in progress AND no update for >1 hour
    (c.generation_status NOT IN ('completed', 'failed', 'cancelled', 'pending')
     AND c.last_progress_update < NOW() - INTERVAL '1 hour')::BOOLEAN,
    (SELECT COUNT(*) FROM generation_status_history WHERE course_id = p_course_id)::INTEGER
  FROM courses c
  WHERE c.id = p_course_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_generation_summary TO service_role;
GRANT EXECUTE ON FUNCTION get_generation_summary TO authenticated;

COMMENT ON FUNCTION get_generation_summary IS 'Get comprehensive generation state summary for monitoring and debugging';

-- Step 8: Monitoring views for admins
-- ============================================================================

CREATE OR REPLACE VIEW admin_generation_dashboard AS
SELECT
  generation_status,
  COUNT(*) as course_count,
  AVG(EXTRACT(EPOCH FROM (last_progress_update - generation_started_at)))::INTEGER as avg_duration_seconds,
  MAX(last_progress_update) as most_recent_update,
  COUNT(*) FILTER (WHERE last_progress_update < NOW() - INTERVAL '1 hour') as stuck_count
FROM courses
WHERE generation_status IS NOT NULL
GROUP BY generation_status
ORDER BY
  CASE generation_status
    WHEN 'initializing' THEN 1
    WHEN 'processing_documents' THEN 2
    WHEN 'analyzing_task' THEN 3
    WHEN 'generating_structure' THEN 4
    WHEN 'generating_content' THEN 5
    WHEN 'finalizing' THEN 6
    WHEN 'completed' THEN 7
    WHEN 'failed' THEN 8
    WHEN 'cancelled' THEN 9
    ELSE 10
  END;

COMMENT ON VIEW admin_generation_dashboard IS 'Real-time dashboard for monitoring generation health';

-- ============================================================================
-- Migration complete
-- ============================================================================
