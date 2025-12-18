-- ============================================================================
-- Migration: Create Application PostgreSQL Roles
-- Purpose: Create PostgreSQL roles for student, instructor, admin
--          to allow PostgREST to switch roles based on JWT claims
-- Date: 2025-10-22
-- ============================================================================

-- Create student role
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'student') THEN
    CREATE ROLE student NOLOGIN;
  END IF;
END
$$;

-- Create instructor role
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'instructor') THEN
    CREATE ROLE instructor NOLOGIN;
  END IF;
END
$$;

-- Create admin role
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'admin') THEN
    CREATE ROLE admin NOLOGIN;
  END IF;
END
$$;

-- Grant authenticated privileges to all app roles
-- This allows PostgREST to switch to these roles while maintaining authenticated session
GRANT authenticated TO student;
GRANT authenticated TO instructor;
GRANT authenticated TO admin;

COMMENT ON ROLE student IS 'Application role for students - inherits authenticated privileges';
COMMENT ON ROLE instructor IS 'Application role for instructors - inherits authenticated privileges';
COMMENT ON ROLE admin IS 'Application role for administrators - inherits authenticated privileges';
