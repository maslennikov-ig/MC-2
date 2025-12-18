-- =============================================================================
-- Index Coverage Verification for RLS Policies
-- Task: T072.1 - Refactor RLS Policies to Single Policy Per Table
-- Purpose: Verify all columns used in RLS policies have appropriate indexes
-- =============================================================================

-- List all indexes on RLS-protected tables
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('courses', 'sections', 'lessons', 'lesson_content',
                    'course_enrollments', 'organizations', 'users', 'file_catalog', 'job_status')
ORDER BY tablename, indexname;

-- =============================================================================
-- Required Index Analysis
-- Columns used in RLS policies that MUST have indexes for performance
-- =============================================================================

-- COURSES TABLE
-- Required indexes: organization_id, user_id, id
SELECT 'courses.organization_id' as required_index,
       EXISTS(
         SELECT 1 FROM pg_indexes
         WHERE tablename = 'courses'
         AND indexdef LIKE '%organization_id%'
       ) as index_exists
UNION ALL
SELECT 'courses.user_id',
       EXISTS(
         SELECT 1 FROM pg_indexes
         WHERE tablename = 'courses'
         AND indexdef LIKE '%user_id%'
       )
UNION ALL
SELECT 'courses.id (PK)',
       EXISTS(
         SELECT 1 FROM pg_indexes
         WHERE tablename = 'courses'
         AND indexdef LIKE '%id%'
         AND indexdef LIKE '%PRIMARY%'
       )

-- SECTIONS TABLE
-- Required indexes: course_id
UNION ALL
SELECT 'sections.course_id',
       EXISTS(
         SELECT 1 FROM pg_indexes
         WHERE tablename = 'sections'
         AND indexdef LIKE '%course_id%'
       )

-- LESSONS TABLE
-- Required indexes: section_id
UNION ALL
SELECT 'lessons.section_id',
       EXISTS(
         SELECT 1 FROM pg_indexes
         WHERE tablename = 'lessons'
         AND indexdef LIKE '%section_id%'
       )

-- LESSON_CONTENT TABLE
-- Required indexes: lesson_id
UNION ALL
SELECT 'lesson_content.lesson_id',
       EXISTS(
         SELECT 1 FROM pg_indexes
         WHERE tablename = 'lesson_content'
         AND indexdef LIKE '%lesson_id%'
       )

-- COURSE_ENROLLMENTS TABLE
-- Required indexes: user_id, course_id, status, composite (user_id, status)
UNION ALL
SELECT 'course_enrollments.user_id',
       EXISTS(
         SELECT 1 FROM pg_indexes
         WHERE tablename = 'course_enrollments'
         AND indexdef LIKE '%user_id%'
       )
UNION ALL
SELECT 'course_enrollments.course_id',
       EXISTS(
         SELECT 1 FROM pg_indexes
         WHERE tablename = 'course_enrollments'
         AND indexdef LIKE '%course_id%'
       )
UNION ALL
SELECT 'course_enrollments.status',
       EXISTS(
         SELECT 1 FROM pg_indexes
         WHERE tablename = 'course_enrollments'
         AND indexdef LIKE '%status%'
       )

-- USERS TABLE
-- Required indexes: id (PK), organization_id
UNION ALL
SELECT 'users.id (PK)',
       EXISTS(
         SELECT 1 FROM pg_indexes
         WHERE tablename = 'users'
         AND indexdef LIKE '%id%'
         AND indexdef LIKE '%PRIMARY%'
       )
UNION ALL
SELECT 'users.organization_id',
       EXISTS(
         SELECT 1 FROM pg_indexes
         WHERE tablename = 'users'
         AND indexdef LIKE '%organization_id%'
       )

-- FILE_CATALOG TABLE
-- Required indexes: organization_id, course_id
UNION ALL
SELECT 'file_catalog.organization_id',
       EXISTS(
         SELECT 1 FROM pg_indexes
         WHERE tablename = 'file_catalog'
         AND indexdef LIKE '%organization_id%'
       )
UNION ALL
SELECT 'file_catalog.course_id',
       EXISTS(
         SELECT 1 FROM pg_indexes
         WHERE tablename = 'file_catalog'
         AND indexdef LIKE '%course_id%'
       )

-- JOB_STATUS TABLE
-- Required indexes: organization_id, user_id, course_id
UNION ALL
SELECT 'job_status.organization_id',
       EXISTS(
         SELECT 1 FROM pg_indexes
         WHERE tablename = 'job_status'
         AND indexdef LIKE '%organization_id%'
       )
UNION ALL
SELECT 'job_status.user_id',
       EXISTS(
         SELECT 1 FROM pg_indexes
         WHERE tablename = 'job_status'
         AND indexdef LIKE '%user_id%'
       )
UNION ALL
SELECT 'job_status.course_id',
       EXISTS(
         SELECT 1 FROM pg_indexes
         WHERE tablename = 'job_status'
         AND indexdef LIKE '%course_id%'
       )

-- ORGANIZATIONS TABLE
-- Required indexes: id (PK)
UNION ALL
SELECT 'organizations.id (PK)',
       EXISTS(
         SELECT 1 FROM pg_indexes
         WHERE tablename = 'organizations'
         AND indexdef LIKE '%id%'
         AND indexdef LIKE '%PRIMARY%'
       );

-- =============================================================================
-- Missing Index Report
-- =============================================================================

WITH required_indexes AS (
  SELECT 'courses' as table_name, 'organization_id' as column_name
  UNION ALL SELECT 'courses', 'user_id'
  UNION ALL SELECT 'sections', 'course_id'
  UNION ALL SELECT 'lessons', 'section_id'
  UNION ALL SELECT 'lesson_content', 'lesson_id'
  UNION ALL SELECT 'course_enrollments', 'user_id'
  UNION ALL SELECT 'course_enrollments', 'course_id'
  UNION ALL SELECT 'course_enrollments', 'status'
  UNION ALL SELECT 'users', 'organization_id'
  UNION ALL SELECT 'file_catalog', 'organization_id'
  UNION ALL SELECT 'file_catalog', 'course_id'
  UNION ALL SELECT 'job_status', 'organization_id'
  UNION ALL SELECT 'job_status', 'user_id'
  UNION ALL SELECT 'job_status', 'course_id'
),
existing_indexes AS (
  SELECT
    tablename as table_name,
    -- Extract column names from index definition
    regexp_matches(indexdef, '\(([^)]+)\)', 'g') as columns
  FROM pg_indexes
  WHERE schemaname = 'public'
)
SELECT
  ri.table_name,
  ri.column_name,
  'MISSING INDEX - CREATE INDEX idx_' || ri.table_name || '_' || ri.column_name ||
  ' ON ' || ri.table_name || '(' || ri.column_name || ');' as recommended_index
FROM required_indexes ri
WHERE NOT EXISTS (
  SELECT 1 FROM existing_indexes ei
  WHERE ei.table_name = ri.table_name
    AND ei.columns::text LIKE '%' || ri.column_name || '%'
)
ORDER BY ri.table_name, ri.column_name;
