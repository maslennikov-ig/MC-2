-- Migration: Remove Google Drive functionality
-- This migration removes all Google Drive related database objects
-- The project now uses only local storage

-- =====================================================
-- Step 1: Drop foreign key constraints first
-- =====================================================

-- Drop foreign key from assets table (google_drive_file_id)
ALTER TABLE IF EXISTS public.assets
  DROP CONSTRAINT IF EXISTS assets_google_drive_file_id_fkey;

-- =====================================================
-- Step 2: Drop columns from existing tables
-- =====================================================

-- Remove google_drive_file_id from assets table
ALTER TABLE IF EXISTS public.assets
  DROP COLUMN IF EXISTS google_drive_file_id;

-- Remove google_drive_file_id from file_catalog table
ALTER TABLE IF EXISTS public.file_catalog
  DROP COLUMN IF EXISTS google_drive_file_id;

-- Note: keeping original_name in file_catalog as it's useful for local storage too

-- =====================================================
-- Step 3: Drop the google_drive_files table
-- =====================================================

DROP TABLE IF EXISTS public.google_drive_files CASCADE;

-- =====================================================
-- Step 4: Drop the sync_status enum (if only used for Google Drive)
-- =====================================================

-- Check if sync_status is used elsewhere before dropping
-- Only drop if no other tables use it
DO $$
BEGIN
  -- Only drop if the enum exists and is not used by any columns
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sync_status') THEN
    -- Check if any column still uses this type
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE udt_name = 'sync_status'
      AND table_schema = 'public'
    ) THEN
      DROP TYPE IF EXISTS public.sync_status;
    END IF;
  END IF;
END $$;

-- =====================================================
-- Step 5: Add comment for documentation
-- =====================================================

COMMENT ON TABLE public.file_catalog IS 'Catalog of uploaded files using local storage (Google Drive removed in migration 20251121000000)';
COMMENT ON TABLE public.assets IS 'Course assets using local storage (Google Drive removed in migration 20251121000000)';
