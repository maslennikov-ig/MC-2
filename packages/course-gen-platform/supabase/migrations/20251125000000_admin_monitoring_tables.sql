-- Migration: Admin Monitoring Page Tables
-- Purpose: Add support for generation tracing, manual controls, and refinement
-- Date: 2025-11-25

-- ============================================================================
-- 1. New Table: generation_trace
-- ============================================================================

CREATE TABLE IF NOT EXISTS generation_trace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,

  -- Generation context
  stage TEXT NOT NULL CHECK (stage IN ('stage_2', 'stage_3', 'stage_4', 'stage_5', 'stage_6')),
  phase TEXT NOT NULL, -- e.g., 'classification', 'planner', 'expander', etc.
  step_name TEXT NOT NULL, -- e.g., 'llm_call', 'validation', 'transformation'

  -- Trace data
  input_data JSONB NOT NULL DEFAULT '{}',
  output_data JSONB,
  error_data JSONB,

  -- LLM specific (if applicable)
  model_used TEXT,
  prompt_text TEXT,
  completion_text TEXT,
  tokens_used INTEGER,
  cost_usd NUMERIC(10, 6),
  temperature NUMERIC(3, 2),

  -- Metadata
  duration_ms INTEGER,
  retry_attempt INTEGER DEFAULT 0,
  was_cached BOOLEAN DEFAULT FALSE,
  quality_score NUMERIC(3, 2),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_quality_score CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 1))
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_generation_trace_course_id ON generation_trace(course_id);
CREATE INDEX IF NOT EXISTS idx_generation_trace_lesson_id ON generation_trace(lesson_id) WHERE lesson_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_generation_trace_stage ON generation_trace(stage);
CREATE INDEX IF NOT EXISTS idx_generation_trace_created_at ON generation_trace(created_at DESC);

-- RLS Policies
ALTER TABLE generation_trace ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can view all traces"
  ON generation_trace FOR SELECT
  TO authenticated
  USING (
    is_superadmin(auth.uid())
  );

CREATE POLICY "Admins can view traces in their organization"
  ON generation_trace FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = generation_trace.course_id
      AND c.organization_id = (auth.jwt() ->> 'organization_id')::uuid
      AND (auth.jwt() ->> 'role') = 'admin'
    )
  );

-- Allow system to insert traces (usually done via service role, but if needed from RLS context)
-- Assuming traces are inserted by server-side code with service role, but adding insert policy for flexibility if needed.
-- Actually, usually traces are inserted by the system, so service role bypasses RLS.

-- ============================================================================
-- 2. Modify Table: courses
-- ============================================================================

ALTER TABLE courses
ADD COLUMN IF NOT EXISTS pause_at_stage_5 BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS auto_finalize_after_stage6 BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN courses.pause_at_stage_5 IS
  'When TRUE, generation stops after stage_5_complete. Stage 6 (lesson content) must be triggered manually per lesson.';

COMMENT ON COLUMN courses.auto_finalize_after_stage6 IS
  'When TRUE and pause_at_stage_5 is TRUE, automatically transition to finalizing after all Stage 6 lessons complete. When FALSE, require manual "Complete Course" button.';

-- ============================================================================
-- 3. Modify Table: lesson_content
-- ============================================================================

ALTER TABLE lesson_content
ADD COLUMN IF NOT EXISTS generation_attempt INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS user_refinement_prompt TEXT,
ADD COLUMN IF NOT EXISTS parent_content_id UUID REFERENCES lesson_content(lesson_id);

COMMENT ON COLUMN lesson_content.generation_attempt IS
  'Increments with each regeneration. 1 = original, 2+ = regenerated.';

COMMENT ON COLUMN lesson_content.user_refinement_prompt IS
  'User instructions for regeneration (e.g., "Add more examples", "Simplify language").';

COMMENT ON COLUMN lesson_content.parent_content_id IS
  'References previous version if this is a regeneration. NULL for original generation.';
