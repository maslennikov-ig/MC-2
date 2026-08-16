-- Automatic mode could not answer its own questions.
--
-- `20260711130000_document_conflict_auto_answers.sql` rewrote
-- `auto_answer_questions_atomic` to record `answer_source = 'system'`, the
-- vocabulary of `document_evidence_decisions`, whose own check allows it.
-- `clarifying_questions` allows only 'suggested', 'modified' and 'custom', so
-- every automatic course failed the whole of Stage 4 with a bare `23514`.
--
-- Found by a live run (mc2-2pplo, 2026-08-15): thirteen questions generated,
-- all thirteen rejected, three attempts, course failed. It had been hidden
-- behind earlier Stage 4 failures that never reached this phase.
--
-- 'system' is the honest value - no user chose anything - and the sibling table
-- already uses it, so the check widens rather than the writer lying.

ALTER TABLE public.clarifying_questions
  DROP CONSTRAINT IF EXISTS clarifying_questions_answer_source_check;

ALTER TABLE public.clarifying_questions
  ADD CONSTRAINT clarifying_questions_answer_source_check
  CHECK (answer_source = ANY (ARRAY['suggested'::text, 'modified'::text, 'custom'::text, 'system'::text]));

-- The same function hid its own cause: it caught everything and returned a
-- fixed sentence plus SQLSTATE. Two days of live runs were spent learning what
-- a five-character code meant. It now returns what the database said.
--
-- It also claimed `selected_suggestion_index = 0` for a question that had no
-- suggestions at all, pointing the reader at an entry that does not exist.
CREATE OR REPLACE FUNCTION public.auto_answer_questions_atomic(p_course_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_question RECORD;
  v_updated_count INTEGER := 0;
  v_fallback_count INTEGER := 0;
  v_total_count INTEGER := 0;
  v_first_answer TEXT;
  v_selected_index INTEGER;
  v_user_answer JSONB;
  v_answered_at TIMESTAMPTZ := now();
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.courses
       WHERE courses.id = p_course_id
         AND courses.organization_id = NULLIF((SELECT auth.jwt())->>'organization_id', '')::uuid
     ) THEN
    RAISE EXCEPTION 'Clarifying question access denied' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_total_count FROM public.clarifying_questions
  WHERE course_id = p_course_id AND status = 'pending'
    AND question_category IS DISTINCT FROM 'document_conflicts';
  FOR v_question IN
    SELECT id, suggested_answers, question_type FROM public.clarifying_questions
    WHERE course_id = p_course_id AND status = 'pending'
      AND question_category IS DISTINCT FROM 'document_conflicts'
    ORDER BY id FOR UPDATE
  LOOP
    v_first_answer := v_question.suggested_answers -> 0 ->> 'text';
    v_selected_index := 0;
    IF v_first_answer IS NULL OR v_first_answer = '' THEN
      v_first_answer := 'Auto-selected by system';
      v_selected_index := NULL;
      v_fallback_count := v_fallback_count + 1;
    END IF;
    IF v_question.question_type = 'multi_choice' THEN
      v_user_answer := jsonb_build_object('values', jsonb_build_array(v_first_answer));
    ELSE v_user_answer := jsonb_build_object('value', v_first_answer); END IF;
    UPDATE public.clarifying_questions SET
      user_answer = v_user_answer, answer_source = 'system',
      selected_suggestion_index = v_selected_index, status = 'answered',
      answered_at = v_answered_at
    WHERE id = v_question.id;
    v_updated_count := v_updated_count + 1;
  END LOOP;
  RETURN jsonb_build_object(
    'success', true, 'updated_count', v_updated_count,
    'fallback_count', v_fallback_count, 'total_pending', v_total_count,
    'answered_at', v_answered_at
  );
EXCEPTION
  WHEN insufficient_privilege THEN RAISE;
  WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false, 'error', 'Automatic answer transaction failed',
    'code', SQLSTATE, 'message', SQLERRM, 'updated_count', 0,
    'total_pending', v_total_count
  );
END;
$$;
