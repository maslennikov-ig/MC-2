-- Migration: 20251104163258_fix_function_search_path_security.sql
-- Purpose: Fix function search path security vulnerability by setting immutable search_path
-- Priority: P1 (High Priority - Security vulnerability)
--
-- Background:
-- Supabase security audit identified 7 functions with mutable search_path that could
-- be exploited by attackers who manipulate the search_path to reference malicious schemas.
--
-- Fix: Add `SET search_path = public, pg_temp` to each function definition
--
-- Security Impact:
-- - Prevents search_path injection attacks
-- - Ensures functions always resolve objects from public schema first
-- - pg_temp is included to allow temporary tables in functions if needed
--
-- Affected Functions:
-- 1. get_generation_summary
-- 2. is_superadmin
-- 3. validate_generation_status_transition
-- 4. check_stage4_barrier
-- 5. update_course_progress (main overload)
-- 6. update_course_progress (wrapper overload) - already has SET but using wrong syntax
-- 7. log_generation_status_change
-- 8. check_policy_has_superadmin
--
-- Rollback Instructions:
-- Remove SET search_path clause from each function if needed for rollback

-- ==============================================================================
-- 1. get_generation_summary
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_generation_summary(p_course_id uuid)
RETURNS TABLE(
  current_status generation_status,
  current_step integer,
  percentage integer,
  started_at timestamp with time zone,
  last_updated timestamp with time zone,
  duration_seconds integer,
  is_stuck boolean,
  transition_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- FIX: Added immutable search_path
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.generation_status,
    (c.generation_progress->>'current_step')::INTEGER,
    (c.generation_progress->>'percentage')::INTEGER,
    c.generation_started_at,
    c.last_progress_update,
    EXTRACT(EPOCH FROM (COALESCE(c.generation_completed_at, NOW()) - c.generation_started_at))::INTEGER,
    -- Consider stuck if: in progress AND no update for >1 hour
    (c.generation_status NOT IN ('completed', 'failed', 'cancelled', 'pending')
     AND c.last_progress_update < NOW() - INTERVAL '1 hour')::BOOLEAN,
    (SELECT COUNT(*) FROM generation_status_history WHERE course_id = p_course_id)::INTEGER
  FROM courses c
  WHERE c.id = p_course_id;
END;
$$;

-- ==============================================================================
-- 2. is_superadmin
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.is_superadmin(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp  -- FIX: Added immutable search_path
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = user_id AND role = 'superadmin'
  );
$$;

-- ==============================================================================
-- 3. validate_generation_status_transition
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.validate_generation_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp  -- FIX: Added immutable search_path
AS $$
DECLARE
  v_valid_transitions JSONB;
BEGIN
  -- Allow NULL → any status (first initialization)
  IF OLD.generation_status IS NULL THEN
    RETURN NEW;
  END IF;

  -- Prevent changes if status didn't actually change
  IF NEW.generation_status = OLD.generation_status THEN
    RETURN NEW;
  END IF;

  -- Define valid state machine transitions
  v_valid_transitions := '{
    "pending": ["initializing", "cancelled"],
    "initializing": ["processing_documents", "analyzing_task", "failed", "cancelled"],
    "processing_documents": ["generating_content", "generating_structure", "failed", "cancelled"],
    "analyzing_task": ["generating_structure", "failed", "cancelled"],
    "generating_structure": ["generating_content", "finalizing", "failed", "cancelled"],
    "generating_content": ["generating_structure", "finalizing", "failed", "cancelled"],
    "finalizing": ["completed", "failed", "cancelled"],
    "completed": ["pending"],
    "failed": ["pending"],
    "cancelled": ["pending"]
  }'::JSONB;

  -- Check if transition is valid
  IF NOT (v_valid_transitions->OLD.generation_status::text) ? NEW.generation_status::text THEN
    RAISE EXCEPTION 'Invalid generation status transition: % → % (course_id: %)',
      OLD.generation_status,
      NEW.generation_status,
      NEW.id
    USING HINT = 'Valid transitions from ' || OLD.generation_status || ': ' ||
                  (v_valid_transitions->OLD.generation_status::text)::text;
  END IF;

  RETURN NEW;
END;
$$;

-- ==============================================================================
-- 4. check_stage4_barrier
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.check_stage4_barrier(p_course_id uuid)
RETURNS TABLE(total_count bigint, completed_count bigint, can_proceed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- FIX: Added immutable search_path
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_count,
    COUNT(*) FILTER (WHERE processed_content IS NOT NULL)::BIGINT AS completed_count,
    (COUNT(*) FILTER (WHERE processed_content IS NOT NULL) = COUNT(*) AND COUNT(*) > 0)::BOOLEAN AS can_proceed
  FROM file_catalog
  WHERE course_id = p_course_id;
END;
$$;

-- ==============================================================================
-- 5. log_generation_status_change
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.log_generation_status_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp  -- FIX: Added immutable search_path
AS $$
BEGIN
  -- Only log when status actually changes
  IF OLD.generation_status IS DISTINCT FROM NEW.generation_status THEN
    INSERT INTO generation_status_history (
      course_id,
      old_status,
      new_status,
      changed_by,
      trigger_source,
      metadata
    ) VALUES (
      NEW.id,
      OLD.generation_status,
      NEW.generation_status,
      NULLIF(current_setting('app.current_user_id', true), '')::UUID,
      COALESCE(current_setting('app.trigger_source', true), 'system'),
      jsonb_build_object(
        'previous_progress', OLD.generation_progress,
        'new_progress', NEW.generation_progress,
        'error_message', NEW.error_message
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ==============================================================================
-- 6. check_policy_has_superadmin
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.check_policy_has_superadmin(p_table_name text, p_policy_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- FIX: Added immutable search_path
AS $$
DECLARE
  v_definition text;
BEGIN
  SELECT qual::text INTO v_definition
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = p_table_name
    AND policyname = p_policy_name;

  RETURN v_definition LIKE '%is_superadmin%';
END;
$$;

-- ==============================================================================
-- 7. update_course_progress (wrapper overload) - Fix syntax
-- ==============================================================================
-- This function already had SET search_path but used wrong syntax (TO instead of =)
CREATE OR REPLACE FUNCTION public.update_course_progress(
  p_course_id uuid,
  p_step_id integer,
  p_status text,
  p_message text,
  p_percent_complete integer,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- FIX: Changed TO → = syntax
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Delegate to main function (p_percent_complete is ignored)
  -- Main function calculates percentage based on step_id automatically
  SELECT update_course_progress(
    p_course_id := p_course_id,
    p_step_id := p_step_id,
    p_status := p_status,
    p_message := p_message,
    p_error_message := NULL,
    p_error_details := NULL,
    p_metadata := p_metadata
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ==============================================================================
-- 8. update_course_progress (main overload)
-- ==============================================================================
-- Note: This is the main function that does the actual work
-- The wrapper overload above delegates to this function
CREATE OR REPLACE FUNCTION public.update_course_progress(
  p_course_id uuid,
  p_step_id integer,
  p_status text,
  p_message text,
  p_error_message text DEFAULT NULL,
  p_error_details jsonb DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- FIX: Added immutable search_path
AS $$
DECLARE
  v_progress JSONB;
  v_step_index INTEGER;
  v_percentage INTEGER;
  v_generation_status generation_status;
  v_has_files BOOLEAN;
BEGIN
  -- Validate step_id (1-5)
  IF p_step_id < 1 OR p_step_id > 5 THEN
    RAISE EXCEPTION 'Invalid step_id: %. Must be 1-5', p_step_id;
  END IF;

  -- Validate status
  IF p_status NOT IN ('pending', 'in_progress', 'completed', 'failed') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be pending|in_progress|completed|failed', p_status;
  END IF;

  -- Calculate percentage (20% per step)
  v_percentage := CASE
    WHEN p_status = 'completed' THEN p_step_id * 20
    WHEN p_status = 'in_progress' THEN (p_step_id - 1) * 20 + 10
    ELSE (p_step_id - 1) * 20
  END;

  -- Step array index (0-based)
  v_step_index := p_step_id - 1;

  -- Get has_files flag for step 2 branching
  SELECT (generation_progress->>'has_documents')::boolean INTO v_has_files
  FROM courses
  WHERE id = p_course_id;

  -- Map step and status to generation_status ENUM
  v_generation_status := CASE
    -- Failed state overrides everything
    WHEN p_status = 'failed' THEN 'failed'::generation_status

    -- Pending: Set to pending only on first step
    WHEN p_step_id = 1 AND p_status = 'pending' THEN 'pending'::generation_status

    -- In-progress statuses
    WHEN p_step_id = 1 AND p_status = 'in_progress' THEN 'initializing'::generation_status
    WHEN p_step_id = 2 AND p_status = 'in_progress' AND v_has_files THEN 'processing_documents'::generation_status
    WHEN p_step_id = 2 AND p_status = 'in_progress' AND NOT v_has_files THEN 'analyzing_task'::generation_status
    WHEN p_step_id = 3 AND p_status = 'in_progress' THEN 'generating_structure'::generation_status
    WHEN p_step_id = 4 AND p_status = 'in_progress' THEN 'generating_content'::generation_status
    WHEN p_step_id = 5 AND p_status = 'in_progress' THEN 'finalizing'::generation_status

    -- Completed step transitions (advance to next step's status)
    WHEN p_step_id = 1 AND p_status = 'completed' THEN
      CASE WHEN v_has_files THEN 'processing_documents'::generation_status
           ELSE 'analyzing_task'::generation_status END
    WHEN p_step_id = 2 AND p_status = 'completed' THEN 'generating_structure'::generation_status
    WHEN p_step_id = 3 AND p_status = 'completed' THEN 'generating_content'::generation_status
    WHEN p_step_id = 4 AND p_status = 'completed' THEN 'finalizing'::generation_status
    WHEN p_step_id = 5 AND p_status = 'completed' THEN 'completed'::generation_status

    -- Keep existing status if no mapping
    ELSE NULL
  END;

  -- Set trigger source for audit logging
  PERFORM set_config('app.trigger_source', 'rpc', true);

  -- Update both generation_progress JSONB AND generation_status
  UPDATE courses
  SET
    generation_progress = CASE
      WHEN p_error_message IS NOT NULL THEN
        -- With error fields
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      generation_progress,
                      array['steps', v_step_index::text, 'status'],
                      to_jsonb(p_status)
                    ),
                    array['steps', v_step_index::text, CASE WHEN p_status = 'in_progress' THEN 'started_at' ELSE 'completed_at' END],
                    to_jsonb(NOW())
                  ),
                  array['percentage'],
                  to_jsonb(v_percentage)
                ),
                array['current_step'],
                to_jsonb(p_step_id)
              ),
              array['message'],
              to_jsonb(p_message)
            ),
            array['steps', v_step_index::text, 'error'],
            to_jsonb(p_error_message)
          ),
          array['steps', v_step_index::text, 'error_details'],
          COALESCE(p_error_details, '{}'::jsonb)
        )
      ELSE
        -- Without error fields
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  generation_progress,
                  array['steps', v_step_index::text, 'status'],
                  to_jsonb(p_status)
                ),
                array['steps', v_step_index::text, CASE WHEN p_status = 'in_progress' THEN 'started_at' ELSE 'completed_at' END],
                to_jsonb(NOW())
              ),
              array['percentage'],
              to_jsonb(v_percentage)
            ),
            array['current_step'],
            to_jsonb(p_step_id)
          ),
          array['message'],
          to_jsonb(p_message)
        )
    END,
    -- Update generation_status (if mapped, otherwise keep existing)
    generation_status = COALESCE(v_generation_status, generation_status),
    -- Update error fields in courses table (for easy querying)
    error_message = CASE WHEN p_status = 'failed' THEN p_error_message ELSE error_message END,
    error_details = CASE WHEN p_status = 'failed' THEN p_error_details ELSE error_details END,
    -- Update timestamps
    generation_completed_at = CASE WHEN v_generation_status = 'completed' THEN NOW() ELSE generation_completed_at END,
    last_progress_update = NOW(),
    updated_at = NOW()
  WHERE id = p_course_id
  RETURNING generation_progress INTO v_progress;

  -- Return updated progress (NULL if course not found)
  RETURN v_progress;
END;
$$;

-- ==============================================================================
-- Validation Queries
-- ==============================================================================
-- Verify all functions have immutable search_path:
-- SELECT
--   proname AS function_name,
--   pronamespace::regnamespace AS schema_name,
--   prosecdef AS is_security_definer,
--   proconfig AS function_config
-- FROM pg_proc
-- WHERE pronamespace = 'public'::regnamespace
-- AND proname IN (
--   'get_generation_summary',
--   'is_superadmin',
--   'validate_generation_status_transition',
--   'check_stage4_barrier',
--   'update_course_progress',
--   'log_generation_status_change',
--   'check_policy_has_superadmin'
-- )
-- ORDER BY proname;
--
-- Expected: All functions should have proconfig = {"search_path=public, pg_temp"}

-- ==============================================================================
-- Migration Metadata
-- ==============================================================================
-- Author: Database Architect Agent
-- Date: 2025-11-04
-- Audit Report: docs/reports/database/2025-11/2025-11-04-supabase-audit-report.md
-- Affected Functions: 7 functions (8 including overload fix)
-- Security Impact: Prevents search_path injection attacks
-- Breaking Changes: None (functions retain same behavior)
