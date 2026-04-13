-- ============================================================================
-- Migration: Drop legacy restart_from_stage overload
-- Purpose: Keep only the canonical restart_from_stage(uuid, integer, uuid)
-- Date: 2026-04-13
-- ============================================================================

DROP FUNCTION IF EXISTS public.restart_from_stage(UUID, UUID, INTEGER);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'restart_from_stage'
      AND pronamespace = 'public'::regnamespace
      AND oid::regprocedure::text = 'restart_from_stage(uuid,uuid,integer)'
  ) THEN
    RAISE EXCEPTION 'Legacy overload public.restart_from_stage(uuid, uuid, integer) still exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'restart_from_stage'
      AND pronamespace = 'public'::regnamespace
      AND oid::regprocedure::text = 'restart_from_stage(uuid,integer,uuid)'
  ) THEN
    RAISE EXCEPTION 'Canonical function public.restart_from_stage(uuid, integer, uuid) is missing';
  END IF;

  RAISE NOTICE 'Dropped legacy restart_from_stage(uuid, uuid, integer) overload and preserved canonical signature';
END;
$$;
