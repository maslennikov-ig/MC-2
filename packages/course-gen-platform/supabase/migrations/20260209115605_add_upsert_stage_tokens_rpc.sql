-- Idempotent token tracking RPC: tracks tokens per stage_key and adjusts total
-- Replaces increment_tokens_used for retry-safe token counting
-- On retry: overwrites the per-key value and adjusts total (no double-counting)
--
-- Stage keys:
--   'stage_4'           — Stage 4 analysis tokens
--   'stage_5'           — Stage 5 structure tokens
--   'lesson:<uuid>'     — Stage 6 per-lesson tokens
--
-- Storage in generation_progress JSONB:
--   { "total_tokens_used": 150000, "tokens_by_key": { "stage_4": 50000, ... } }

CREATE OR REPLACE FUNCTION public.upsert_stage_tokens(
  p_course_id uuid,
  p_stage_key text,
  p_tokens bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_gp jsonb;
  v_old_tokens bigint;
BEGIN
  -- Lock the row and read current generation_progress
  SELECT COALESCE(generation_progress, '{}'::jsonb)
  INTO v_gp
  FROM courses
  WHERE id = p_course_id
  FOR UPDATE;

  -- If course not found, silently exit (non-fatal)
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Get old tokens for this key (0 if not set)
  v_old_tokens := COALESCE((v_gp->'tokens_by_key'->>p_stage_key)::bigint, 0);

  -- Ensure tokens_by_key object exists
  IF NOT (v_gp ? 'tokens_by_key') THEN
    v_gp := v_gp || '{"tokens_by_key": {}}'::jsonb;
  END IF;

  -- Set the stage-specific token count (idempotent overwrite)
  v_gp := jsonb_set(v_gp, ARRAY['tokens_by_key', p_stage_key], to_jsonb(p_tokens));

  -- Adjust total: old_total - old_key_tokens + new_key_tokens
  v_gp := jsonb_set(
    v_gp,
    '{total_tokens_used}',
    to_jsonb(COALESCE((v_gp->>'total_tokens_used')::bigint, 0) - v_old_tokens + p_tokens)
  );

  -- Write back with timestamp
  UPDATE courses
  SET generation_progress = v_gp,
      last_progress_update = now()
  WHERE id = p_course_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION upsert_stage_tokens(uuid, text, bigint) TO service_role;

COMMENT ON FUNCTION upsert_stage_tokens IS
  'Idempotent token tracking: stores per-key tokens, adjusts total. Safe for retries and concurrent Stage 6 workers.';
