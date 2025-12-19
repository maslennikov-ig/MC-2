-- ============================================================================
-- Migration: 20251219140000_prevent_last_superadmin_demotion.sql
-- Purpose: Prevent demotion of the last superadmin via database trigger
-- Date: 2025-12-19
-- ============================================================================

-- Create function to check superadmin count before demotion
CREATE OR REPLACE FUNCTION public.prevent_last_superadmin_demotion()
RETURNS TRIGGER AS $$
DECLARE
  superadmin_count INTEGER;
BEGIN
  -- Only check if demoting FROM superadmin TO another role
  IF OLD.role = 'superadmin' AND NEW.role != 'superadmin' THEN
    -- Count remaining superadmins (excluding the one being demoted)
    SELECT COUNT(*) INTO superadmin_count
    FROM public.users
    WHERE role = 'superadmin' AND id != OLD.id;

    IF superadmin_count = 0 THEN
      RAISE EXCEPTION 'Cannot demote the last superadmin. Promote another user to superadmin first.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Create trigger
DROP TRIGGER IF EXISTS check_last_superadmin_trigger ON public.users;

CREATE TRIGGER check_last_superadmin_trigger
BEFORE UPDATE ON public.users
FOR EACH ROW
WHEN (OLD.role IS DISTINCT FROM NEW.role)
EXECUTE FUNCTION public.prevent_last_superadmin_demotion();

-- Add comment
COMMENT ON FUNCTION public.prevent_last_superadmin_demotion() IS
'Prevents demotion of the last superadmin in the system. Raises exception if attempting to demote the only remaining superadmin.';

COMMENT ON TRIGGER check_last_superadmin_trigger ON public.users IS
'Trigger to prevent last superadmin demotion. Only fires when role column changes.';
