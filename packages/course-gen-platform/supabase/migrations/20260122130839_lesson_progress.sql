-- ============================================================================
-- Migration: 20260122130839_lesson_progress.sql
-- Purpose: Create lesson_progress table for granular user lesson progress tracking
-- Author: database-architect
-- Date: 2026-01-22
-- ============================================================================

-- ============================================================================
-- PART 1: TABLE CREATION
-- ============================================================================

-- Lesson progress table for tracking user progress per lesson
CREATE TABLE lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  lesson_id UUID REFERENCES lessons NOT NULL,
  course_id UUID REFERENCES courses NOT NULL,
  status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  progress_percent INT DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  completed_at TIMESTAMPTZ,
  video_watched_percent INT DEFAULT 0 CHECK (video_watched_percent >= 0 AND video_watched_percent <= 100),
  content_read_percent INT DEFAULT 0 CHECK (content_read_percent >= 0 AND content_read_percent <= 100),
  quiz_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT lesson_progress_user_lesson_unique UNIQUE(user_id, lesson_id),
  CONSTRAINT lesson_progress_completed_check CHECK (
    (status = 'completed' AND completed_at IS NOT NULL) OR
    (status != 'completed')
  )
);

-- ============================================================================
-- PART 2: INDEXES
-- Performance optimization for frequently queried columns
-- ============================================================================

-- Composite index for user's progress in a course (common query pattern)
CREATE INDEX idx_lesson_progress_user_course ON lesson_progress(user_id, course_id);

-- Index for lesson-based lookups
CREATE INDEX idx_lesson_progress_lesson ON lesson_progress(lesson_id);

-- Index for status filtering
CREATE INDEX idx_lesson_progress_status ON lesson_progress(status);

-- Index for finding completed lessons
CREATE INDEX idx_lesson_progress_completed_at ON lesson_progress(completed_at DESC) WHERE completed_at IS NOT NULL;

-- ============================================================================
-- PART 3: ROW LEVEL SECURITY (RLS)
-- Users can only access their own progress
-- ============================================================================

ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own progress
CREATE POLICY "users_select_own_lesson_progress"
ON lesson_progress FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy: Users can create progress records for themselves
CREATE POLICY "users_insert_own_lesson_progress"
ON lesson_progress FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own progress
CREATE POLICY "users_update_own_lesson_progress"
ON lesson_progress FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Admin can manage all lesson progress in their organization
CREATE POLICY "admin_lesson_progress_all"
ON lesson_progress FOR ALL
TO authenticated
USING (
  course_id IN (
    SELECT id FROM courses
    WHERE organization_id IN (
      SELECT organization_id FROM users
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
);

-- Policy: Instructors can view progress in their courses
CREATE POLICY "instructor_lesson_progress_view"
ON lesson_progress FOR SELECT
TO authenticated
USING (
  course_id IN (
    SELECT id FROM courses WHERE user_id = auth.uid()
  ) AND
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'instructor')
);

-- ============================================================================
-- PART 4: TRIGGERS
-- Automated data management
-- ============================================================================

-- Apply updated_at trigger (using existing function)
CREATE TRIGGER update_lesson_progress_updated_at
  BEFORE UPDATE ON lesson_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger to auto-set completed_at when status changes to completed
CREATE OR REPLACE FUNCTION set_lesson_progress_completed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    NEW.completed_at = NOW();
  ELSIF NEW.status != 'completed' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lesson_progress_set_completed_at
  BEFORE UPDATE ON lesson_progress
  FOR EACH ROW
  EXECUTE FUNCTION set_lesson_progress_completed_at();

-- ============================================================================
-- PART 5: COMMENTS
-- Document the schema for future developers
-- ============================================================================

COMMENT ON TABLE lesson_progress IS 'Granular lesson progress tracking per user. Tracks video watched, content read, quiz completion, and overall progress.';

COMMENT ON COLUMN lesson_progress.id IS 'Primary key - unique identifier for progress record';
COMMENT ON COLUMN lesson_progress.user_id IS 'Reference to auth.users - the user whose progress is tracked';
COMMENT ON COLUMN lesson_progress.lesson_id IS 'Reference to lessons table - the lesson being tracked';
COMMENT ON COLUMN lesson_progress.course_id IS 'Reference to courses table - denormalized for query performance';
COMMENT ON COLUMN lesson_progress.status IS 'Progress status: not_started, in_progress, completed';
COMMENT ON COLUMN lesson_progress.progress_percent IS 'Overall progress percentage (0-100)';
COMMENT ON COLUMN lesson_progress.completed_at IS 'Timestamp when lesson was completed (auto-set by trigger)';
COMMENT ON COLUMN lesson_progress.video_watched_percent IS 'Percentage of video content watched (0-100)';
COMMENT ON COLUMN lesson_progress.content_read_percent IS 'Percentage of text content read (0-100)';
COMMENT ON COLUMN lesson_progress.quiz_completed IS 'Whether the lesson quiz has been completed';
COMMENT ON COLUMN lesson_progress.created_at IS 'Record creation timestamp';
COMMENT ON COLUMN lesson_progress.updated_at IS 'Record last update timestamp (auto-updated by trigger)';

-- ============================================================================
-- PART 6: RPC FUNCTION
-- Atomic progress update with upsert logic
-- ============================================================================

CREATE OR REPLACE FUNCTION update_lesson_progress_v2(
  p_lesson_id UUID,
  p_status TEXT DEFAULT NULL,
  p_progress_percent INT DEFAULT NULL,
  p_video_watched_percent INT DEFAULT NULL,
  p_content_read_percent INT DEFAULT NULL,
  p_quiz_completed BOOLEAN DEFAULT NULL
)
RETURNS lesson_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_course_id UUID;
  v_result lesson_progress;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate status if provided
  IF p_status IS NOT NULL AND p_status NOT IN ('not_started', 'in_progress', 'completed') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be not_started, in_progress, or completed', p_status;
  END IF;

  -- Validate percentage values
  IF p_progress_percent IS NOT NULL AND (p_progress_percent < 0 OR p_progress_percent > 100) THEN
    RAISE EXCEPTION 'progress_percent must be between 0 and 100';
  END IF;

  IF p_video_watched_percent IS NOT NULL AND (p_video_watched_percent < 0 OR p_video_watched_percent > 100) THEN
    RAISE EXCEPTION 'video_watched_percent must be between 0 and 100';
  END IF;

  IF p_content_read_percent IS NOT NULL AND (p_content_read_percent < 0 OR p_content_read_percent > 100) THEN
    RAISE EXCEPTION 'content_read_percent must be between 0 and 100';
  END IF;

  -- Get course_id from lesson (via section)
  SELECT c.id INTO v_course_id
  FROM lessons l
  JOIN sections s ON l.section_id = s.id
  JOIN courses c ON s.course_id = c.id
  WHERE l.id = p_lesson_id;

  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'Lesson not found: %', p_lesson_id;
  END IF;

  -- Upsert progress record
  INSERT INTO lesson_progress (
    user_id,
    lesson_id,
    course_id,
    status,
    progress_percent,
    video_watched_percent,
    content_read_percent,
    quiz_completed
  )
  VALUES (
    v_user_id,
    p_lesson_id,
    v_course_id,
    COALESCE(p_status, 'in_progress'),
    COALESCE(p_progress_percent, 0),
    COALESCE(p_video_watched_percent, 0),
    COALESCE(p_content_read_percent, 0),
    COALESCE(p_quiz_completed, FALSE)
  )
  ON CONFLICT (user_id, lesson_id) DO UPDATE SET
    status = COALESCE(p_status, lesson_progress.status),
    progress_percent = COALESCE(p_progress_percent, lesson_progress.progress_percent),
    video_watched_percent = COALESCE(p_video_watched_percent, lesson_progress.video_watched_percent),
    content_read_percent = COALESCE(p_content_read_percent, lesson_progress.content_read_percent),
    quiz_completed = COALESCE(p_quiz_completed, lesson_progress.quiz_completed)
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_lesson_progress_v2(UUID, TEXT, INT, INT, INT, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION update_lesson_progress_v2 IS
'Atomically updates lesson progress for the current user.
Creates progress record if not exists (upsert).
Only updates fields that are provided (non-NULL).
Returns the updated lesson_progress record.';

-- ============================================================================
-- PART 7: HELPER FUNCTIONS
-- ============================================================================

-- Function to get all lesson progress for a course
CREATE OR REPLACE FUNCTION get_course_lesson_progress(p_course_id UUID)
RETURNS SETOF lesson_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT lp.*
  FROM lesson_progress lp
  WHERE lp.user_id = auth.uid()
    AND lp.course_id = p_course_id
  ORDER BY lp.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION get_course_lesson_progress(UUID) TO authenticated;

COMMENT ON FUNCTION get_course_lesson_progress IS
'Returns all lesson progress records for the current user in a specific course.';

-- Function to calculate overall course progress
CREATE OR REPLACE FUNCTION calculate_course_progress(p_course_id UUID)
RETURNS TABLE (
  total_lessons INT,
  completed_lessons INT,
  in_progress_lessons INT,
  overall_progress_percent INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INT;
  v_completed INT;
  v_in_progress INT;
BEGIN
  -- Count total lessons in course
  SELECT COUNT(*) INTO v_total
  FROM lessons l
  JOIN sections s ON l.section_id = s.id
  WHERE s.course_id = p_course_id;

  -- Count completed lessons for user
  SELECT COUNT(*) INTO v_completed
  FROM lesson_progress lp
  WHERE lp.user_id = auth.uid()
    AND lp.course_id = p_course_id
    AND lp.status = 'completed';

  -- Count in-progress lessons for user
  SELECT COUNT(*) INTO v_in_progress
  FROM lesson_progress lp
  WHERE lp.user_id = auth.uid()
    AND lp.course_id = p_course_id
    AND lp.status = 'in_progress';

  total_lessons := v_total;
  completed_lessons := v_completed;
  in_progress_lessons := v_in_progress;
  overall_progress_percent := CASE
    WHEN v_total = 0 THEN 0
    ELSE ROUND((v_completed::NUMERIC / v_total) * 100)::INT
  END;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_course_progress(UUID) TO authenticated;

COMMENT ON FUNCTION calculate_course_progress IS
'Calculates overall course progress for the current user.
Returns: total_lessons, completed_lessons, in_progress_lessons, overall_progress_percent.';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
