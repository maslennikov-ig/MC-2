-- Add atomic token increment RPC for generation_progress JSONB
-- Used by Stages 4, 5, 6 to track cumulative token usage per course
-- Safe for concurrent Stage 6 workers (single UPDATE with row-level lock)

CREATE OR REPLACE FUNCTION public.increment_tokens_used(
  p_course_id uuid,
  p_tokens bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE courses
  SET
    generation_progress = jsonb_set(
      COALESCE(generation_progress, '{}'::jsonb),
      '{total_tokens_used}',
      to_jsonb(
        COALESCE((generation_progress->>'total_tokens_used')::bigint, 0) + p_tokens
      )
    ),
    last_progress_update = now()
  WHERE id = p_course_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION increment_tokens_used(uuid, bigint) TO service_role;
