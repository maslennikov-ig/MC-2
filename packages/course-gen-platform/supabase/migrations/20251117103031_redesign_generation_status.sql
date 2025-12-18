-- ============================================================================
-- State Machine Redesign: Stage-Specific States
-- Purpose: Fix multi-stage pipeline vs single-stage state machine mismatch
-- Date: 2025-11-17
-- Investigation: INV-2025-11-17-008
-- Author: Claude Code (Supabase Schema Specialist)
-- ============================================================================

-- Step 1: Drop old trigger and function
-- ============================================================================
DROP TRIGGER IF EXISTS trg_validate_generation_status ON courses;
DROP FUNCTION IF EXISTS validate_generation_status_transition() CASCADE;

-- Step 2: Create new enum with stage-specific states
-- ============================================================================
CREATE TYPE generation_status_new AS ENUM (
  'pending',
  'stage_2_init',
  'stage_2_processing',
  'stage_2_complete',
  'stage_3_init',
  'stage_3_summarizing',
  'stage_3_complete',
  'stage_4_init',
  'stage_4_analyzing',
  'stage_4_complete',
  'stage_5_init',
  'stage_5_generating',
  'stage_5_complete',
  'finalizing',
  'completed',
  'failed',
  'cancelled'
);

-- Step 3: Add new column for migration
-- ============================================================================
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS generation_status_temp generation_status_new DEFAULT NULL;

-- Step 4: Migrate existing data (map old → new states)
-- ============================================================================
-- Mapping strategy:
-- - pending → pending
-- - initializing → stage_2_init (assume Stage 2 if initializing)
-- - processing_documents → stage_2_processing
-- - analyzing_task → stage_4_analyzing (no docs path)
-- - generating_structure → stage_4_analyzing (Stage 4 creates structure plan)
-- - generating_content → stage_3_summarizing (Stage 3 summarizes docs)
-- - finalizing → finalizing
-- - completed → completed
-- - failed → failed
-- - cancelled → cancelled

UPDATE courses
SET generation_status_temp = CASE
  WHEN generation_status::text = 'pending' THEN 'pending'::generation_status_new
  WHEN generation_status::text = 'initializing' THEN 'stage_2_init'::generation_status_new
  WHEN generation_status::text = 'processing_documents' THEN 'stage_2_processing'::generation_status_new
  WHEN generation_status::text = 'analyzing_task' THEN 'stage_4_analyzing'::generation_status_new
  WHEN generation_status::text = 'generating_structure' THEN 'stage_4_analyzing'::generation_status_new
  WHEN generation_status::text = 'generating_content' THEN 'stage_3_summarizing'::generation_status_new
  WHEN generation_status::text = 'finalizing' THEN 'finalizing'::generation_status_new
  WHEN generation_status::text = 'completed' THEN 'completed'::generation_status_new
  WHEN generation_status::text = 'failed' THEN 'failed'::generation_status_new
  WHEN generation_status::text = 'cancelled' THEN 'cancelled'::generation_status_new
  ELSE 'failed'::generation_status_new -- Safety fallback
END
WHERE generation_status IS NOT NULL;

-- Step 5: Drop old column and rename new column
-- ============================================================================
ALTER TABLE courses
  DROP COLUMN generation_status CASCADE;

ALTER TABLE courses
  RENAME COLUMN generation_status_temp TO generation_status;

-- Step 6: Rename new enum type to standard name
-- ============================================================================
ALTER TYPE generation_status_new RENAME TO generation_status;

COMMENT ON TYPE generation_status IS 'Course generation workflow states (redesigned 2025-11-17 for stage-specific states)';

-- Step 7: Recreate indexes (dropped by CASCADE)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_courses_generation_status
  ON courses(generation_status)
  WHERE generation_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_courses_active_generation
  ON courses(generation_status, last_progress_update)
  WHERE generation_status NOT IN ('completed', 'failed', 'cancelled');

-- Step 8: Update audit table
-- ============================================================================
-- Recreate generation_status_history table with new enum
DROP TABLE IF EXISTS generation_status_history CASCADE;

CREATE TABLE generation_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  old_status generation_status,
  new_status generation_status NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_source TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_generation_history_course
  ON generation_status_history(course_id, changed_at DESC);

CREATE INDEX idx_generation_history_timestamp
  ON generation_status_history(changed_at DESC);

CREATE INDEX idx_generation_history_transitions
  ON generation_status_history(old_status, new_status)
  WHERE old_status IS NOT NULL;

-- RLS policies
ALTER TABLE generation_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY generation_history_admin_read ON generation_status_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'::role
    )
  );

CREATE POLICY generation_history_owner_read ON generation_status_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = generation_status_history.course_id
      AND courses.user_id = auth.uid()
    )
  );

CREATE POLICY generation_history_service_insert ON generation_status_history
  FOR INSERT WITH CHECK (true);

-- Step 9: Create new validation function
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

  -- Define valid stage-based transitions (linear progression + error handling)
  v_valid_transitions := '{
    "pending": ["stage_2_init", "cancelled"],
    "stage_2_init": ["stage_2_processing", "failed", "cancelled"],
    "stage_2_processing": ["stage_2_complete", "failed", "cancelled"],
    "stage_2_complete": ["stage_3_init", "failed", "cancelled"],
    "stage_3_init": ["stage_3_summarizing", "failed", "cancelled"],
    "stage_3_summarizing": ["stage_3_complete", "failed", "cancelled"],
    "stage_3_complete": ["stage_4_init", "failed", "cancelled"],
    "stage_4_init": ["stage_4_analyzing", "failed", "cancelled"],
    "stage_4_analyzing": ["stage_4_complete", "failed", "cancelled"],
    "stage_4_complete": ["stage_5_init", "failed", "cancelled"],
    "stage_5_init": ["stage_5_generating", "failed", "cancelled"],
    "stage_5_generating": ["stage_5_complete", "failed", "cancelled"],
    "stage_5_complete": ["finalizing", "failed", "cancelled"],
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

COMMENT ON FUNCTION validate_generation_status_transition IS 'Validates course generation status transitions (redesigned 2025-11-17 for stage-specific states)';

-- Step 10: Recreate validation trigger
-- ============================================================================
CREATE TRIGGER trg_validate_generation_status
  BEFORE UPDATE OF generation_status ON courses
  FOR EACH ROW
  WHEN (OLD.generation_status IS DISTINCT FROM NEW.generation_status)
  EXECUTE FUNCTION validate_generation_status_transition();

-- Step 11: Recreate audit logging trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION log_generation_status_change()
RETURNS TRIGGER AS $$
BEGIN
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

CREATE TRIGGER trg_log_generation_status
  AFTER UPDATE OF generation_status ON courses
  FOR EACH ROW
  EXECUTE FUNCTION log_generation_status_change();

-- Step 12: Update monitoring view
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
    WHEN 'pending' THEN 1
    WHEN 'stage_2_init' THEN 2
    WHEN 'stage_2_processing' THEN 3
    WHEN 'stage_2_complete' THEN 4
    WHEN 'stage_3_init' THEN 5
    WHEN 'stage_3_summarizing' THEN 6
    WHEN 'stage_3_complete' THEN 7
    WHEN 'stage_4_init' THEN 8
    WHEN 'stage_4_analyzing' THEN 9
    WHEN 'stage_4_complete' THEN 10
    WHEN 'stage_5_init' THEN 11
    WHEN 'stage_5_generating' THEN 12
    WHEN 'stage_5_complete' THEN 13
    WHEN 'finalizing' THEN 14
    WHEN 'completed' THEN 15
    WHEN 'failed' THEN 16
    WHEN 'cancelled' THEN 17
    ELSE 18
  END;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Note: Old generation_status enum was automatically dropped by CASCADE in Step 5
