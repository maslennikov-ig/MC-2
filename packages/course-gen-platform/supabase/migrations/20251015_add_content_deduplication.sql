-- Migration: Add content deduplication with reference counting
-- Date: 2025-10-15
-- Task: T079 - Vector lifecycle management with content deduplication
-- Description: Adds reference counting and original file tracking to prevent duplicate
--              vector generation when identical content is uploaded multiple times.
--
-- Business Impact:
-- - Prevents duplicate Docling API calls (saves time)
-- - Prevents duplicate Jina embedding costs (~$0.02/M tokens per upload)
-- - Prevents duplicate Qdrant vector storage
-- - Enables content sharing across courses/organizations while maintaining isolation
--
-- Deduplication Strategy:
-- 1. Calculate SHA-256 hash on file upload
-- 2. Check if file with same hash already exists and is indexed
-- 3. If exists: Create reference record, increment reference_count, duplicate vectors
-- 4. If new: Create original record, process normally
-- 5. On delete: Decrement reference_count, delete vectors for specific course
-- 6. When reference_count = 0: Delete physical file and all remaining vectors

-- ==========================================
-- STEP 1: Add reference counting columns
-- ==========================================

-- Add reference_count column to track how many file_catalog records reference this file
ALTER TABLE file_catalog
ADD COLUMN IF NOT EXISTS reference_count INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN file_catalog.reference_count IS
'Number of file_catalog records referencing this physical file. Decremented on delete. Physical file and original record deleted when reaches 0.';

-- Add original_file_id column to track reference chain
ALTER TABLE file_catalog
ADD COLUMN IF NOT EXISTS original_file_id UUID REFERENCES file_catalog(id) ON DELETE CASCADE;

COMMENT ON COLUMN file_catalog.original_file_id IS
'If this is a reference to another file, points to the original file_id (the one with actual physical file). NULL if this record IS the original.';

-- ==========================================
-- STEP 2: Add critical performance indexes
-- ==========================================

-- Index on hash for fast deduplication lookups (CRITICAL for performance)
-- This index is queried on EVERY file upload to check for existing content
CREATE INDEX IF NOT EXISTS idx_file_catalog_hash
ON file_catalog(hash)
WHERE vector_status = 'indexed'; -- Partial index: only use successfully indexed files

COMMENT ON INDEX idx_file_catalog_hash IS
'Critical for fast deduplication lookups. Queried on every file upload to find existing content. Partial index only includes indexed files for better performance.';

-- Index on original_file_id for reference tracking
CREATE INDEX IF NOT EXISTS idx_file_catalog_original_file_id
ON file_catalog(original_file_id)
WHERE original_file_id IS NOT NULL;

COMMENT ON INDEX idx_file_catalog_original_file_id IS
'Tracks references to original files. Used when deleting references or counting total references.';

-- Composite index for finding deduplicated files by organization/course
CREATE INDEX IF NOT EXISTS idx_file_catalog_dedup_lookup
ON file_catalog(hash, vector_status, original_file_id)
WHERE original_file_id IS NULL; -- Only original files

COMMENT ON INDEX idx_file_catalog_dedup_lookup IS
'Optimizes deduplication lookups by combining hash, vector_status, and original_file_id. Only indexes original files (original_file_id IS NULL).';

-- ==========================================
-- STEP 3: Add constraint to prevent cycles
-- ==========================================

-- Ensure original_file_id doesn't point to itself (prevent cycles)
ALTER TABLE file_catalog
ADD CONSTRAINT check_no_self_reference
CHECK (original_file_id IS NULL OR original_file_id != id);

COMMENT ON CONSTRAINT check_no_self_reference ON file_catalog IS
'Prevents a file from referencing itself as the original, which would create an invalid reference cycle.';

-- ==========================================
-- STEP 4: Create helper functions
-- ==========================================

-- Function to increment reference count atomically
CREATE OR REPLACE FUNCTION increment_file_reference_count(p_file_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  UPDATE file_catalog
  SET reference_count = reference_count + 1,
      updated_at = NOW()
  WHERE id = p_file_id
  RETURNING reference_count INTO v_new_count;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'File not found: %', p_file_id;
  END IF;

  RETURN v_new_count;
END;
$$;

COMMENT ON FUNCTION increment_file_reference_count IS
'Atomically increments reference_count for a file. Called when creating a new reference to existing content.';

-- Function to decrement reference count atomically and return new count
CREATE OR REPLACE FUNCTION decrement_file_reference_count(p_file_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  UPDATE file_catalog
  SET reference_count = GREATEST(reference_count - 1, 0), -- Never go below 0
      updated_at = NOW()
  WHERE id = p_file_id
  RETURNING reference_count INTO v_new_count;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'File not found: %', p_file_id;
  END IF;

  RETURN v_new_count;
END;
$$;

COMMENT ON FUNCTION decrement_file_reference_count IS
'Atomically decrements reference_count for a file. Called when deleting a reference. Returns new count so caller can delete physical file if count reaches 0.';

-- Function to find duplicate file by hash
CREATE OR REPLACE FUNCTION find_duplicate_file(p_hash TEXT)
RETURNS TABLE (
  file_id UUID,
  storage_path TEXT,
  vector_status TEXT,
  reference_count INTEGER,
  parsed_content JSONB,
  markdown_content TEXT,
  file_size BIGINT,
  mime_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    id,
    fc.storage_path,
    fc.vector_status::TEXT,
    fc.reference_count,
    fc.parsed_content,
    fc.markdown_content,
    fc.file_size,
    fc.mime_type
  FROM file_catalog fc
  WHERE fc.hash = p_hash
    AND fc.vector_status = 'indexed' -- Only use successfully indexed files
    AND fc.original_file_id IS NULL -- Only use original files, not references
  ORDER BY fc.created_at DESC -- Prefer newer files
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION find_duplicate_file IS
'Finds an existing indexed file with the same hash for deduplication. Only returns original files (not references) that have been successfully indexed.';

-- ==========================================
-- STEP 5: Create deduplication statistics view
-- ==========================================

CREATE OR REPLACE VIEW file_catalog_deduplication_stats AS
SELECT
  id,
  filename,
  hash,
  file_size,
  reference_count,
  original_file_id,
  CASE
    WHEN original_file_id IS NULL THEN 'original'
    ELSE 'reference'
  END AS file_type,
  CASE
    WHEN original_file_id IS NULL AND reference_count > 1
      THEN (reference_count - 1) -- Exclude self from count
    ELSE 0
  END AS reference_copies,
  CASE
    WHEN original_file_id IS NULL AND reference_count > 1
      THEN file_size * (reference_count - 1) -- Storage saved by deduplication
    ELSE 0
  END AS storage_saved_bytes,
  vector_status,
  created_at,
  organization_id,
  course_id
FROM file_catalog
ORDER BY reference_count DESC, created_at DESC;

COMMENT ON VIEW file_catalog_deduplication_stats IS
'Provides deduplication statistics: original vs reference files, reference counts, and estimated storage savings.';

-- ==========================================
-- STEP 6: Create organization-level deduplication stats
-- ==========================================

CREATE OR REPLACE VIEW organization_deduplication_stats AS
SELECT
  o.id AS organization_id,
  o.name AS organization_name,
  COUNT(CASE WHEN fc.original_file_id IS NULL THEN 1 END) AS original_files_count,
  COUNT(CASE WHEN fc.original_file_id IS NOT NULL THEN 1 END) AS reference_files_count,
  SUM(CASE WHEN fc.original_file_id IS NOT NULL THEN fc.file_size ELSE 0 END) AS storage_saved_bytes,
  SUM(fc.file_size) AS total_storage_used_bytes
FROM organizations o
LEFT JOIN file_catalog fc ON fc.organization_id = o.id
GROUP BY o.id, o.name;

COMMENT ON VIEW organization_deduplication_stats IS
'Aggregates deduplication statistics per organization: original files, references, and storage savings.';

-- ==========================================
-- STEP 7: Grant permissions
-- ==========================================

GRANT SELECT ON file_catalog_deduplication_stats TO authenticated;
GRANT SELECT ON organization_deduplication_stats TO authenticated;
GRANT EXECUTE ON FUNCTION increment_file_reference_count TO authenticated;
GRANT EXECUTE ON FUNCTION decrement_file_reference_count TO authenticated;
GRANT EXECUTE ON FUNCTION find_duplicate_file TO authenticated;

-- ==========================================
-- STEP 8: Migration validation
-- ==========================================

DO $$
BEGIN
  -- Verify reference_count column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'file_catalog'
      AND column_name = 'reference_count'
  ) THEN
    RAISE EXCEPTION 'Migration failed: reference_count column not created';
  END IF;

  -- Verify original_file_id column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'file_catalog'
      AND column_name = 'original_file_id'
  ) THEN
    RAISE EXCEPTION 'Migration failed: original_file_id column not created';
  END IF;

  -- Verify hash index exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'file_catalog'
      AND indexname = 'idx_file_catalog_hash'
  ) THEN
    RAISE EXCEPTION 'Migration failed: idx_file_catalog_hash index not created';
  END IF;

  -- Verify original_file_id index exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'file_catalog'
      AND indexname = 'idx_file_catalog_original_file_id'
  ) THEN
    RAISE EXCEPTION 'Migration failed: idx_file_catalog_original_file_id index not created';
  END IF;

  -- Verify dedup lookup index exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'file_catalog'
      AND indexname = 'idx_file_catalog_dedup_lookup'
  ) THEN
    RAISE EXCEPTION 'Migration failed: idx_file_catalog_dedup_lookup index not created';
  END IF;

  -- Verify constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'file_catalog'
      AND constraint_name = 'check_no_self_reference'
  ) THEN
    RAISE EXCEPTION 'Migration failed: check_no_self_reference constraint not created';
  END IF;

  -- Verify functions exist
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'increment_file_reference_count') THEN
    RAISE EXCEPTION 'Migration failed: increment_file_reference_count function not created';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'decrement_file_reference_count') THEN
    RAISE EXCEPTION 'Migration failed: decrement_file_reference_count function not created';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'find_duplicate_file') THEN
    RAISE EXCEPTION 'Migration failed: find_duplicate_file function not created';
  END IF;

  -- Verify views exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = 'file_catalog_deduplication_stats'
  ) THEN
    RAISE EXCEPTION 'Migration failed: file_catalog_deduplication_stats view not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = 'organization_deduplication_stats'
  ) THEN
    RAISE EXCEPTION 'Migration failed: organization_deduplication_stats view not created';
  END IF;

  RAISE NOTICE 'Migration 20251015_add_content_deduplication.sql completed successfully';
  RAISE NOTICE 'Reference counting enabled for content deduplication';
  RAISE NOTICE 'Use find_duplicate_file() to check for existing content before upload';
END;
$$;
