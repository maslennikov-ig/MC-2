-- Add 'micro' option to course_size constraint
-- 'micro' is for minimal courses with 1-5 lessons
-- Single Source of Truth: @megacampus/shared-types/course-size.ts

-- Drop existing constraint
ALTER TABLE courses
DROP CONSTRAINT IF EXISTS courses_course_size_check;

-- Add updated constraint with 'micro' option
ALTER TABLE courses
ADD CONSTRAINT courses_course_size_check
CHECK (course_size IS NULL OR course_size IN ('auto', 'micro', 'mini', 'compact', 'standard', 'comprehensive'));

-- Update comment for documentation with lesson ranges
COMMENT ON COLUMN courses.course_size IS 'User-selected course size preset (advisory for LLM). Values: auto (LLM decides optimal size), micro (1-5 lessons), mini (8-16 lessons), compact (15-30 lessons), standard (30-50 lessons), comprehensive (60-100 lessons). LLM may deviate from target if topic requires different scope.';
