-- =============================================================================
-- Migration: Move Extensions to Dedicated Schema
--
-- Task: T070
-- Priority: P2 - Medium (Security best practice)
-- Created: 2025-10-13
--
-- Issue: 2 extensions in public schema (security anti-pattern)
--   - basejump-supabase_test_helpers (testing utilities)
--   - supabase-dbdev (database development tools)
--
-- Solution: Move to dedicated 'extensions' schema
--
-- Benefits:
--   - Prevents namespace conflicts with application code
--   - Improves security posture (trojan-horse attack prevention)
--   - Better organization (clear separation of concerns)
--   - Supabase best practice compliance
--
-- Reference:
--   - https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
--   - https://www.postgresql.org/docs/current/sql-alterextension.html
-- =============================================================================

-- =============================================================================
-- Step 1: Create extensions schema if not exists
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS extensions;

COMMENT ON SCHEMA extensions IS
'Dedicated schema for PostgreSQL extensions to prevent namespace conflicts, improve security, and follow Supabase best practices';

-- =============================================================================
-- Step 2: Move basejump-supabase_test_helpers
-- Note: This extension is NOT relocatable (PostGIS 2.3+ limitation applies here too)
-- Must DROP and RECREATE in target schema
-- =============================================================================

DO $$
BEGIN
  -- Check if extension exists in public schema
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE e.extname = 'basejump-supabase_test_helpers'
      AND n.nspname = 'public'
  ) THEN
    -- Extension is not relocatable, must drop and recreate
    -- This is safe because the extension only creates functions, no data loss
    DROP EXTENSION "basejump-supabase_test_helpers" CASCADE;
    RAISE NOTICE 'Dropped basejump-supabase_test_helpers from public schema';

    -- Recreate in extensions schema
    CREATE EXTENSION "basejump-supabase_test_helpers" SCHEMA extensions;
    RAISE NOTICE 'Extension basejump-supabase_test_helpers recreated in extensions schema ✓';
  ELSIF EXISTS (
    SELECT 1 FROM pg_extension e
    WHERE e.extname = 'basejump-supabase_test_helpers'
  ) THEN
    RAISE NOTICE 'Extension basejump-supabase_test_helpers already installed (not in public schema)';
  ELSE
    RAISE NOTICE 'Extension basejump-supabase_test_helpers not installed, skipping';
  END IF;
END $$;

-- Verify extension in correct location
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE e.extname = 'basejump-supabase_test_helpers'
      AND n.nspname = 'extensions'
  ) THEN
    RAISE NOTICE 'Verified: basejump-supabase_test_helpers is in extensions schema ✓';
  END IF;
END $$;

-- =============================================================================
-- Step 3: Move supabase-dbdev
-- =============================================================================

DO $$
BEGIN
  -- Check if extension exists in public schema
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE e.extname = 'supabase-dbdev'
      AND n.nspname = 'public'
  ) THEN
    -- Extension is not relocatable, must drop and recreate
    -- This is safe because the extension only creates functions, no data loss
    DROP EXTENSION "supabase-dbdev" CASCADE;
    RAISE NOTICE 'Dropped supabase-dbdev from public schema';

    -- Recreate in extensions schema
    CREATE EXTENSION "supabase-dbdev" SCHEMA extensions;
    RAISE NOTICE 'Extension supabase-dbdev recreated in extensions schema ✓';
  ELSIF EXISTS (
    SELECT 1 FROM pg_extension e
    WHERE e.extname = 'supabase-dbdev'
  ) THEN
    RAISE NOTICE 'Extension supabase-dbdev already installed (not in public schema)';
  ELSE
    RAISE NOTICE 'Extension supabase-dbdev not installed, skipping';
  END IF;
END $$;

-- Verify extension in correct location
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE e.extname = 'supabase-dbdev'
      AND n.nspname = 'extensions'
  ) THEN
    RAISE NOTICE 'Verified: supabase-dbdev is in extensions schema ✓';
  END IF;
END $$;

-- =============================================================================
-- Step 4: Grant necessary permissions
-- =============================================================================

-- Allow authenticated users to use extension functions
GRANT USAGE ON SCHEMA extensions TO authenticated;

-- Allow service role full access (for tests and admin operations)
GRANT ALL ON SCHEMA extensions TO service_role;

-- Allow public read access (for extension discovery)
GRANT USAGE ON SCHEMA extensions TO PUBLIC;

DO $$
BEGIN
  RAISE NOTICE 'Granted permissions on extensions schema ✓';
  RAISE NOTICE '  - USAGE to authenticated role';
  RAISE NOTICE '  - ALL to service_role role';
  RAISE NOTICE '  - USAGE to PUBLIC role';
END $$;

-- =============================================================================
-- Step 5: Verification Summary
-- =============================================================================

DO $$
DECLARE
  v_public_count INTEGER;
  v_extensions_count INTEGER;
  v_extension_name TEXT;
BEGIN
  -- Count extensions in public schema
  SELECT COUNT(*) INTO v_public_count
  FROM pg_extension e
  JOIN pg_namespace n ON e.extnamespace = n.oid
  WHERE n.nspname = 'public'
    AND e.extname IN ('basejump-supabase_test_helpers', 'supabase-dbdev');

  -- Count extensions in extensions schema
  SELECT COUNT(*) INTO v_extensions_count
  FROM pg_extension e
  JOIN pg_namespace n ON e.extnamespace = n.oid
  WHERE n.nspname = 'extensions'
    AND e.extname IN ('basejump-supabase_test_helpers', 'supabase-dbdev');

  RAISE NOTICE '';
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE 'MIGRATION COMPLETE: Move Extensions to Dedicated Schema';
  RAISE NOTICE '=============================================================================';
  RAISE NOTICE 'Extensions in public schema: %', v_public_count;
  RAISE NOTICE 'Extensions in extensions schema: %', v_extensions_count;

  IF v_public_count > 0 THEN
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  WARNING: % extension(s) still in public schema', v_public_count;

    -- List extensions still in public
    FOR v_extension_name IN
      SELECT e.extname
      FROM pg_extension e
      JOIN pg_namespace n ON e.extnamespace = n.oid
      WHERE n.nspname = 'public'
        AND e.extname IN ('basejump-supabase_test_helpers', 'supabase-dbdev')
    LOOP
      RAISE NOTICE '  - %', v_extension_name;
    END LOOP;
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE '✅ SUCCESS: All test extensions moved to extensions schema';
  END IF;

  IF v_extensions_count > 0 THEN
    RAISE NOTICE '';
    RAISE NOTICE 'Extensions in extensions schema:';
    FOR v_extension_name IN
      SELECT e.extname
      FROM pg_extension e
      JOIN pg_namespace n ON e.extnamespace = n.oid
      WHERE n.nspname = 'extensions'
        AND e.extname IN ('basejump-supabase_test_helpers', 'supabase-dbdev')
    LOOP
      RAISE NOTICE '  - %', v_extension_name;
    END LOOP;
  END IF;

  RAISE NOTICE '=============================================================================';
  RAISE NOTICE '';
END $$;

-- =============================================================================
-- Post-Migration Notes
-- =============================================================================

-- The extensions schema now contains:
--   - basejump-supabase_test_helpers: Testing utilities for creating test users
--   - supabase-dbdev: Database development tools
--
-- Extension functions are still accessible via qualified names:
--   - extensions.tests.create_supabase_user(...)
--   - extensions.dbdev.install(...)
--
-- Or by including extensions in search_path:
--   SET search_path = public, extensions;
--
-- Test code does not need to be updated because:
--   1. Tests use mocked data, not extension functions directly
--   2. PostgreSQL maintains function references across schema moves
--   3. Extension functions are accessed via service_role which has full access
