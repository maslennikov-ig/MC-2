-- ============================================================================
-- Add Missing Course Fields Migration
-- Purpose: Add all missing fields to courses table to match application expectations
-- Date: 2025-10-21
-- ============================================================================

-- Add missing course metadata fields
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS client_ip TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS content_strategy TEXT,
  ADD COLUMN IF NOT EXISTS course_description TEXT,
  ADD COLUMN IF NOT EXISTS course_structure JSONB,
  ADD COLUMN IF NOT EXISTS difficulty TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS estimated_completion_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS estimated_lessons INTEGER,
  ADD COLUMN IF NOT EXISTS estimated_sections INTEGER,
  ADD COLUMN IF NOT EXISTS has_files BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS learning_outcomes TEXT,
  ADD COLUMN IF NOT EXISTS output_formats TEXT[],
  ADD COLUMN IF NOT EXISTS prerequisites TEXT,
  ADD COLUMN IF NOT EXISTS share_token TEXT,
  ADD COLUMN IF NOT EXISTS style TEXT,
  ADD COLUMN IF NOT EXISTS target_audience TEXT,
  ADD COLUMN IF NOT EXISTS total_lessons_count INTEGER,
  ADD COLUMN IF NOT EXISTS total_sections_count INTEGER,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Create indexes for commonly queried fields
CREATE INDEX IF NOT EXISTS idx_courses_is_published ON courses(is_published);
CREATE INDEX IF NOT EXISTS idx_courses_difficulty ON courses(difficulty);
CREATE INDEX IF NOT EXISTS idx_courses_language ON courses(language);
CREATE INDEX IF NOT EXISTS idx_courses_share_token ON courses(share_token) WHERE share_token IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN courses.course_description IS 'Main course description text';
COMMENT ON COLUMN courses.learning_outcomes IS 'Expected learning outcomes for students';
COMMENT ON COLUMN courses.prerequisites IS 'Required prerequisites for the course';
COMMENT ON COLUMN courses.target_audience IS 'Intended audience for the course';
COMMENT ON COLUMN courses.course_structure IS 'JSONB structure containing course outline and metadata';
COMMENT ON COLUMN courses.language IS 'Course content language (ISO 639-1 code)';
COMMENT ON COLUMN courses.difficulty IS 'Course difficulty level';
COMMENT ON COLUMN courses.style IS 'Course teaching style';
COMMENT ON COLUMN courses.is_published IS 'Publication status (separate from status field)';
COMMENT ON COLUMN courses.total_lessons_count IS 'Cached count of total lessons in course';
COMMENT ON COLUMN courses.total_sections_count IS 'Cached count of total sections in course';
COMMENT ON COLUMN courses.estimated_completion_minutes IS 'Estimated time to complete the course';
COMMENT ON COLUMN courses.estimated_lessons IS 'Estimated number of lessons when generated';
COMMENT ON COLUMN courses.estimated_sections IS 'Estimated number of sections when generated';
COMMENT ON COLUMN courses.has_files IS 'Whether course has uploaded files';
COMMENT ON COLUMN courses.content_strategy IS 'Content generation strategy';
COMMENT ON COLUMN courses.output_formats IS 'Array of requested output formats';
COMMENT ON COLUMN courses.share_token IS 'Public share token for anonymous access';
COMMENT ON COLUMN courses.email IS 'Contact email for course creator';
COMMENT ON COLUMN courses.client_ip IS 'IP address of course creator (for analytics)';
COMMENT ON COLUMN courses.user_agent IS 'User agent of course creator (for analytics)';
COMMENT ON COLUMN courses.completed_at IS 'Timestamp when course generation completed';
