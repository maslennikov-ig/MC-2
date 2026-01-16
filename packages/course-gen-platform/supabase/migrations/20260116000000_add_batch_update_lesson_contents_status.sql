-- Migration: Add batch_update_lesson_contents_status RPC function
-- Purpose: Make batch lesson approval reproducible across environments
-- Related: GitHub Issue #3 - Fix constraint violation on lesson approval
-- Date: 2026-01-16
--
-- Background:
-- Previous implementation used .upsert() which could trigger INSERT in race conditions,
-- causing constraint violations when partial data was provided.
-- This RPC function only performs UPDATE operations, eliminating that risk.

CREATE OR REPLACE FUNCTION public.batch_update_lesson_contents_status(
  p_ids uuid[],
  p_status text,
  p_metadata_map jsonb,
  p_updated_at timestamp with time zone
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Validate status against allowed values from lesson_contents_status_check constraint
  IF p_status NOT IN ('pending', 'generating', 'completed', 'failed', 'review_required', 'approved') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be one of: pending, generating, completed, failed, review_required, approved', p_status;
  END IF;

  -- Update all matching records with their respective metadata
  -- Use -> operator to get JSONB value (not ->> which returns text)
  -- COALESCE preserves existing metadata if no update provided for that specific ID
  UPDATE lesson_contents lc
  SET
    status = p_status,
    updated_at = p_updated_at,
    metadata = COALESCE(p_metadata_map->lc.id::text, lc.metadata)
  WHERE lc.id = ANY(p_ids);

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RETURN updated_count;
END;
$function$;

COMMENT ON FUNCTION public.batch_update_lesson_contents_status IS
'Batch update lesson_contents status. Uses UPDATE only (never INSERT) to avoid constraint violations when partial data is provided. See GitHub Issue #3 for context.';
