-- ============================================================================
-- Migration: Grant Role Switch Permissions
-- Purpose: Allow authenticator and anon to switch to app roles
-- Date: 2025-10-22
-- ============================================================================

-- Give authenticator permission to switch to app roles
-- This is required for PostgREST to switch roles based on JWT claims
GRANT student TO authenticator;
GRANT instructor TO authenticator;
GRANT admin TO authenticator;

-- Also grant to anon for public access
GRANT student TO anon;
GRANT instructor TO anon;
GRANT admin TO anon;

COMMENT ON ROLE authenticator IS 'PostgREST authenticator role - can switch to student, instructor, admin based on JWT';
