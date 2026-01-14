-- Add course_size column to courses table
-- Advisory size preset for LLM (mini/compact/standard/comprehensive)
-- Single Source of Truth: @megacampus/shared-types/course-size.ts

-- Add course_size column (nullable, default to NULL for existing courses)
ALTER TABLE courses
ADD COLUMN IF NOT EXISTS course_size TEXT;

-- Add check constraint for valid size values
ALTER TABLE courses
ADD CONSTRAINT courses_course_size_check
CHECK (course_size IS NULL OR course_size IN ('mini', 'compact', 'standard', 'comprehensive'));

-- Add comment for documentation
COMMENT ON COLUMN courses.course_size IS 'User-selected course size preset (advisory for LLM). Values: mini (~10 lessons), compact (~20 lessons), standard (~40 lessons), comprehensive (~80 lessons). LLM may deviate from target if topic requires different scope.';
