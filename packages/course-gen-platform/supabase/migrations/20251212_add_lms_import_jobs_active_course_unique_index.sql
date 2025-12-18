-- ============================================================================
-- Migration: add_lms_import_jobs_active_course_unique_index
-- Purpose: Fix TOCTOU race condition by enforcing unique active job per course
-- Author: database-architect
-- Date: 2024-12-11
-- Related: packages/course-gen-platform/src/server/routers/lms/publish.router.ts
-- Issue: Race condition between lines 230-257 (check) and 327-342 (insert)
-- ============================================================================

-- ============================================================================
-- PROBLEM STATEMENT
-- ============================================================================
-- Current implementation has a Time-Of-Check-To-Time-Of-Use (TOCTOU) vulnerability:
--
-- Thread A:                          Thread B:
-- 1. SELECT active job (none found)
-- 2. Passes check                    1. SELECT active job (none found)
-- 3. INSERT new job                  2. Passes check
--                                    3. INSERT new job (DUPLICATE!)
--
-- This allows two concurrent requests to both create active import jobs for
-- the same course, violating the business rule that only one import can be
-- active at a time.
--
-- ============================================================================
-- SOLUTION
-- ============================================================================
-- Add a unique partial index on course_id for active import jobs. This ensures
-- that at the database level, only one row can exist per course_id where the
-- status is 'pending', 'uploading', or 'processing'.
--
-- When a duplicate INSERT is attempted, PostgreSQL will raise a unique
-- constraint violation error (23505), which the application can handle gracefully.
-- ============================================================================

-- Create unique partial index to prevent concurrent active jobs per course
CREATE UNIQUE INDEX idx_lms_import_jobs_active_course_unique
ON lms_import_jobs (course_id)
WHERE status IN ('pending', 'uploading', 'processing');

COMMENT ON INDEX idx_lms_import_jobs_active_course_unique IS
  'Ensures only one active import job per course (prevents TOCTOU race condition). ' ||
  'Active statuses: pending, uploading, processing. ' ||
  'Partial index applies only to rows matching the WHERE clause.';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- To verify the constraint works, you can test with:
--
-- -- This should succeed (first active job for a course):
-- INSERT INTO lms_import_jobs (course_id, lms_configuration_id, edx_course_key, status)
-- VALUES ('course-uuid-1', 'config-uuid-1', 'course-v1:ORG+COURSE+RUN', 'pending');
--
-- -- This should FAIL with unique constraint violation (duplicate active job):
-- INSERT INTO lms_import_jobs (course_id, lms_configuration_id, edx_course_key, status)
-- VALUES ('course-uuid-1', 'config-uuid-2', 'course-v1:ORG+COURSE+RUN2', 'pending');
--
-- -- This should succeed (active job for different course):
-- INSERT INTO lms_import_jobs (course_id, lms_configuration_id, edx_course_key, status)
-- VALUES ('course-uuid-2', 'config-uuid-1', 'course-v1:ORG+COURSE2+RUN', 'pending');
--
-- -- This should succeed (completed job for same course - not in index):
-- UPDATE lms_import_jobs SET status = 'succeeded' WHERE course_id = 'course-uuid-1';
-- INSERT INTO lms_import_jobs (course_id, lms_configuration_id, edx_course_key, status)
-- VALUES ('course-uuid-1', 'config-uuid-1', 'course-v1:ORG+COURSE+RUN3', 'pending');
--
-- ============================================================================
-- APPLICATION-LEVEL CHANGES RECOMMENDED (NOT REQUIRED)
-- ============================================================================
-- While this migration fixes the race condition at the database level, the
-- application code in publish.router.ts should be updated to handle the
-- unique constraint violation gracefully:
--
-- 1. Catch PostgreSQL error code 23505 (unique_violation)
-- 2. Return a user-friendly CONFLICT error instead of INTERNAL_SERVER_ERROR
-- 3. Optionally: Remove the SELECT check (lines 230-235) since the DB now
--    enforces uniqueness, OR keep it for early validation to avoid unnecessary
--    processing before attempting the INSERT
--
-- Example error handling:
-- ```typescript
-- const { error: createJobError } = await supabase.from('lms_import_jobs').insert({...});
--
-- if (createJobError) {
--   // Check for unique constraint violation (code 23505)
--   if (createJobError.code === '23505' &&
--       createJobError.message.includes('idx_lms_import_jobs_active_course_unique')) {
--     throw new TRPCError({
--       code: 'CONFLICT',
--       message: 'Course already has an active import job. Please wait for it to complete.',
--     });
--   }
--   // Handle other errors...
-- }
-- ```
-- ============================================================================

-- ============================================================================
-- Migration Complete
-- ============================================================================
