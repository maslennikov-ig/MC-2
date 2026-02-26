-- Add 'auto' option to course_size constraint
-- 'auto' means LLM decides optimal size without guidance
-- Single Source of Truth: @megacampus/shared-types/course-size.ts

-- Drop existing constraint
ALTER TABLE courses
DROP CONSTRAINT IF EXISTS courses_course_size_check;

-- Add updated constraint with 'auto' option
ALTER TABLE courses
ADD CONSTRAINT courses_course_size_check
CHECK (course_size IS NULL OR course_size IN ('auto', 'mini', 'compact', 'standard', 'comprehensive'));

-- Update comment for documentation
COMMENT ON COLUMN courses.course_size IS 'User-selected course size preset (advisory for LLM). Values: auto (LLM decides optimal size), mini (~10 lessons), compact (~20 lessons), standard (~40 lessons), comprehensive (~80 lessons). LLM may deviate from target if topic requires different scope.';
