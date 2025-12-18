-- Migration: Fix "role 'superadmin' does not exist" error
-- Purpose: Create the Postgres role 'superadmin' to match the JWT role claim.
--          Supabase/PostgREST attempts to switch to the role specified in the JWT 'role' claim.
--          If the claim is 'superadmin' but the Postgres role doesn't exist, requests fail.

DO $$
BEGIN
  -- Create 'superadmin' role if it doesn't exist
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'superadmin') THEN
    CREATE ROLE superadmin NOLOGIN INHERIT;
    -- Grant 'authenticated' permissions to 'superadmin' so it can access tables/functions
    -- like a normal authenticated user (RLS policies will then handle specific permissions)
    GRANT authenticated TO superadmin;
  END IF;

  -- Also ensuring other roles exist to prevent future issues if users are assigned these roles
  
  -- 'admin'
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'admin') THEN
    CREATE ROLE admin NOLOGIN INHERIT;
    GRANT authenticated TO admin;
  END IF;

  -- 'instructor'
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'instructor') THEN
    CREATE ROLE instructor NOLOGIN INHERIT;
    GRANT authenticated TO instructor;
  END IF;

  -- 'student'
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'student') THEN
    CREATE ROLE student NOLOGIN INHERIT;
    GRANT authenticated TO student;
  END IF;
END
$$;
