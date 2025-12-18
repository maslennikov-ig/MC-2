-- ============================================================================
-- Migration: Fix handle_new_user trigger to read from raw_app_meta_data
-- Purpose: Align trigger function with migration function metadata field usage
-- Date: 2025-11-12
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  default_org_id uuid;
BEGIN
  -- Get or create default organization for new users
  SELECT id INTO default_org_id
  FROM public.organizations
  WHERE name = 'Default Organization'
  LIMIT 1;

  -- If no default org exists, create one
  IF default_org_id IS NULL THEN
    INSERT INTO public.organizations (name, tier)
    VALUES ('Default Organization', 'free')
    RETURNING id INTO default_org_id;
  END IF;

  -- Create user record in public.users
  -- FIXED: Read role from raw_APP_meta_data (not raw_USER_meta_data)
  INSERT INTO public.users (id, email, organization_id, role)
  VALUES (
    NEW.id,
    NEW.email,
    default_org_id,
    COALESCE(NEW.raw_app_meta_data->>'role', 'student')::public.role
    -- ^^^^^^^^^^^^^^^^^^^^^^^^^ CORRECTED: Read from app_metadata
  );

  RETURN NEW;
END;
$$;

-- ============================================================================
-- VERIFICATION: Test trigger function reads correct field
-- ============================================================================
DO $$
DECLARE
  v_function_def TEXT;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_function_def
  FROM pg_proc
  WHERE proname = 'handle_new_user'
    AND pronamespace = 'public'::regnamespace;

  IF v_function_def NOT LIKE '%raw_app_meta_data%' THEN
    RAISE EXCEPTION 'Verification failed: handle_new_user must read from raw_app_meta_data';
  END IF;

  IF v_function_def LIKE '%raw_user_meta_data%role%' THEN
    RAISE WARNING 'handle_new_user still references raw_user_meta_data for role (should be fixed)';
  END IF;

  RAISE NOTICE 'Verification passed: handle_new_user reads from raw_app_meta_data';
END $$;

-- ============================================================================
-- COMMENT: Document the fix
-- ============================================================================
COMMENT ON FUNCTION public.handle_new_user IS
'Trigger function to create public.users entry when auth.users entry is created.

FIXED (2025-11-12): Now reads role from raw_app_meta_data (not raw_user_meta_data)
to match where create_test_auth_user() writes the role data.

Reference: INV-2025-11-12-003 - Auth Test Failures Metadata Field Mismatch
';
