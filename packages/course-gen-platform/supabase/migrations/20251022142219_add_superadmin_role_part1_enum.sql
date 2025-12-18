-- Migration: T035.1 - Add SuperAdmin Role to Database Schema (Part 1: Enum)
-- Task: Add 'superadmin' role enum value
-- Phase: 1 of 5 (T035.1 through T035.5)
-- Purpose: Enable cross-organization SuperAdmin role for platform administration

-- ============================================================================
-- STEP 1: Add 'superadmin' to role enum
-- ============================================================================
-- Note: ALTER TYPE ADD VALUE is non-transactional and cannot be rolled back
-- PostgreSQL requires enum values to be committed before use in other objects
-- Order: admin → superadmin → instructor → student (logical hierarchy)

DO $$
BEGIN
    -- Check if 'superadmin' value already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'superadmin'
        AND enumtypid = 'role'::regtype
    ) THEN
        -- Add 'superadmin' after 'admin' in the enum
        ALTER TYPE role ADD VALUE 'superadmin' AFTER 'admin';
        RAISE NOTICE 'Added superadmin role to enum';
    ELSE
        RAISE NOTICE 'superadmin role already exists in enum';
    END IF;
END
$$;
