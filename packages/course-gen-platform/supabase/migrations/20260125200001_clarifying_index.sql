-- Migration: clarifying_questions_compound_index
-- Purpose: Add compound index for efficient queries on clarifying_questions table
-- This index optimizes queries that filter by course_id, status, and question_priority

-- Create compound index (IF NOT EXISTS for idempotency)
CREATE INDEX IF NOT EXISTS idx_clarifying_questions_course_status_priority
ON clarifying_questions (course_id, status, question_priority);

-- Add comment for documentation
COMMENT ON INDEX idx_clarifying_questions_course_status_priority IS
'Compound index for optimizing queries that filter by course_id, status, and question_priority.
Used in approveAndProceed to count unanswered critical/important questions efficiently.';
