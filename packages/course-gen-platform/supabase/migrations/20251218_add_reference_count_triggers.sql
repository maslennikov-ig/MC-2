-- Migration: Add automatic reference counting triggers
-- Date: 2025-12-18
-- Task: C3 Fix - Non-atomic reference counting
-- Description: Creates database triggers to automatically maintain reference_count on file_catalog
--              when records with original_file_id are inserted or deleted.
--
-- Problem Solved:
-- Previously, increment_file_reference_count and decrement_file_reference_count were called
-- manually from application code. If INSERT succeeded but the RPC failed, data became inconsistent.
--
-- Solution:
-- AFTER INSERT trigger: If original_file_id IS NOT NULL, increment reference_count on original file
-- AFTER DELETE trigger: If original_file_id IS NOT NULL, decrement reference_count on original file
--
-- Benefits:
-- - Atomic operation: reference_count update happens in same transaction as INSERT/DELETE
-- - No application-level coordination needed
-- - Eliminates race conditions between insert and reference count update
-- - Automatic cleanup on delete

-- ==========================================
-- STEP 1: Create auto-increment trigger function
-- ==========================================

CREATE OR REPLACE FUNCTION auto_increment_reference_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only increment if this is a reference record (has original_file_id)
  IF NEW.original_file_id IS NOT NULL THEN
    UPDATE file_catalog
    SET reference_count = reference_count + 1,
        updated_at = NOW()
    WHERE id = NEW.original_file_id;

    -- Verify original file exists - raise exception if not found
    -- This ensures referential integrity beyond the FK constraint
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Original file not found: %. Cannot create reference.', NEW.original_file_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION auto_increment_reference_count IS
'Trigger function: Automatically increments reference_count on original file when a reference record is inserted. Raises exception if original file does not exist.';

-- ==========================================
-- STEP 2: Create auto-decrement trigger function
-- ==========================================

CREATE OR REPLACE FUNCTION auto_decrement_reference_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only decrement if this was a reference record (has original_file_id)
  IF OLD.original_file_id IS NOT NULL THEN
    UPDATE file_catalog
    SET reference_count = GREATEST(reference_count - 1, 0), -- Never go below 0
        updated_at = NOW()
    WHERE id = OLD.original_file_id;

    -- Note: We don't raise exception if original file not found during delete
    -- because the original file might have been deleted first (CASCADE)
  END IF;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION auto_decrement_reference_count IS
'Trigger function: Automatically decrements reference_count on original file when a reference record is deleted. Uses GREATEST to prevent negative counts.';

-- ==========================================
-- STEP 3: Create AFTER INSERT trigger
-- ==========================================

-- Drop if exists to make migration idempotent
DROP TRIGGER IF EXISTS trg_auto_increment_reference_count ON file_catalog;

CREATE TRIGGER trg_auto_increment_reference_count
AFTER INSERT ON file_catalog
FOR EACH ROW
EXECUTE FUNCTION auto_increment_reference_count();

COMMENT ON TRIGGER trg_auto_increment_reference_count ON file_catalog IS
'Automatically increments reference_count on original file when a reference record (with original_file_id) is inserted.';

-- ==========================================
-- STEP 4: Create AFTER DELETE trigger
-- ==========================================

-- Drop if exists to make migration idempotent
DROP TRIGGER IF EXISTS trg_auto_decrement_reference_count ON file_catalog;

CREATE TRIGGER trg_auto_decrement_reference_count
AFTER DELETE ON file_catalog
FOR EACH ROW
EXECUTE FUNCTION auto_decrement_reference_count();

COMMENT ON TRIGGER trg_auto_decrement_reference_count ON file_catalog IS
'Automatically decrements reference_count on original file when a reference record (with original_file_id) is deleted.';

-- ==========================================
-- STEP 5: Grant permissions
-- ==========================================

-- Note: Trigger functions are SECURITY DEFINER, so they execute with owner privileges
-- No additional grants needed for the trigger functions themselves
-- The existing increment/decrement RPC functions remain available for manual use if needed

-- ==========================================
-- STEP 6: Migration validation
-- ==========================================

DO $$
BEGIN
  -- Verify auto_increment_reference_count function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'auto_increment_reference_count'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'Migration failed: auto_increment_reference_count function not created';
  END IF;

  -- Verify auto_decrement_reference_count function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'auto_decrement_reference_count'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'Migration failed: auto_decrement_reference_count function not created';
  END IF;

  -- Verify INSERT trigger exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_auto_increment_reference_count'
      AND tgrelid = 'public.file_catalog'::regclass
  ) THEN
    RAISE EXCEPTION 'Migration failed: trg_auto_increment_reference_count trigger not created';
  END IF;

  -- Verify DELETE trigger exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_auto_decrement_reference_count'
      AND tgrelid = 'public.file_catalog'::regclass
  ) THEN
    RAISE EXCEPTION 'Migration failed: trg_auto_decrement_reference_count trigger not created';
  END IF;

  RAISE NOTICE 'Migration add_reference_count_triggers completed successfully';
  RAISE NOTICE 'Triggers created:';
  RAISE NOTICE '  - trg_auto_increment_reference_count (AFTER INSERT)';
  RAISE NOTICE '  - trg_auto_decrement_reference_count (AFTER DELETE)';
  RAISE NOTICE 'Reference counting is now automatic for deduplication records';
END;
$$;
