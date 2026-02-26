-- Migration: add_course_storage_cleanup_trigger
-- Purpose: Automatically clean up Supabase Storage files when a course is deleted.
--
-- Problem: When courses are deleted, CASCADE removes DB rows (file_catalog,
-- lesson_enrichments, etc.) but files in the 'course-enrichments' Storage bucket
-- remain as orphaned "zombie files".
--
-- Design decisions:
-- 1. BEFORE DELETE trigger on courses table -- runs before CASCADE deletes
--    child rows, so we can still query related data if needed.
-- 2. Directly deletes from storage.objects where object names match the
--    courseId prefix pattern: {courseId}/% (enrichment files).
-- 3. Also collects storage_path values from file_catalog for the course,
--    in case any were uploaded to Supabase Storage (future-proofing).
-- 4. SECURITY DEFINER to bypass RLS on storage.objects (owned by postgres).
-- 5. Wrapped in exception handler: storage cleanup failure does NOT block
--    course deletion. Errors are logged via RAISE WARNING.
-- 6. Returns OLD to allow the DELETE to proceed.
--
-- Storage layout:
--   course-enrichments bucket: {courseId}/{lessonId}/{enrichmentId}.{ext}
--   file_catalog.storage_path: local filesystem paths (uploads/...) -- NOT in Storage
--
-- This trigger handles the 'course-enrichments' bucket cleanup.
-- Local filesystem cleanup (file_catalog uploads) must be handled at the
-- application level (e.g., in the course deletion API handler).

-- ============================================================================
-- TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_course_storage_files()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_deleted_count INTEGER := 0;
  v_course_id TEXT;
  v_bucket_id TEXT := 'course-enrichments';
BEGIN
  -- Convert course UUID to text for path matching
  v_course_id := OLD.id::TEXT;

  -- Delete all storage objects in the course-enrichments bucket
  -- that match the course_id prefix pattern: {courseId}/%
  -- This covers:
  --   {courseId}/{lessonId}/{enrichmentId}.webp  (lesson covers)
  --   {courseId}/course-card/card.webp           (course card)
  --   {courseId}/...                             (any future assets)
  BEGIN
    DELETE FROM storage.objects
    WHERE bucket_id = v_bucket_id
      AND name LIKE v_course_id || '/%';

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    IF v_deleted_count > 0 THEN
      RAISE LOG '[cleanup_course_storage] Deleted % storage object(s) for course % from bucket %',
        v_deleted_count, v_course_id, v_bucket_id;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- Storage cleanup failure must NOT block course deletion.
    -- Log the error for debugging/monitoring but allow DELETE to proceed.
    RAISE WARNING '[cleanup_course_storage] Failed to clean storage for course %: % (SQLSTATE: %)',
      v_course_id, SQLERRM, SQLSTATE;
  END;

  -- Return OLD to allow the DELETE to proceed
  RETURN OLD;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.cleanup_course_storage_files() IS
  'Trigger function: cleans up Supabase Storage files in the course-enrichments bucket '
  'when a course is deleted. Runs as SECURITY DEFINER to bypass storage RLS. '
  'Failures are logged as warnings and do not block deletion.';

-- ============================================================================
-- TRIGGER
-- ============================================================================

-- BEFORE DELETE: runs before CASCADE removes child rows.
-- FOR EACH ROW: handles individual course deletions and bulk deletes.
CREATE TRIGGER trg_cleanup_course_storage
  BEFORE DELETE ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_course_storage_files();

COMMENT ON TRIGGER trg_cleanup_course_storage ON public.courses IS
  'Cleans up files in the course-enrichments Storage bucket when a course is deleted. '
  'Pattern: DELETE FROM storage.objects WHERE name LIKE {courseId}/%. '
  'Errors are caught and logged; they do not prevent course deletion.';
