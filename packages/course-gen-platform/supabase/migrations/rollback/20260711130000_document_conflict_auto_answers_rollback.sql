-- Roll back explicit document-evidence conflicts/decisions to the E1 schema.
-- Refuse lossy rollback once E3-only audit subjects exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.document_evidence_decisions
    WHERE subject_kind <> 'claim_conflict' OR conflict_id IS NULL
      OR subject_key IS DISTINCT FROM public.document_evidence_sha256(
        'document-evidence-subject-v1:' || run_id::text || ':conflict:' || conflict_id::text
      )
      OR idempotency_key IS NOT NULL OR payload_hash IS NOT NULL OR actor_user_id IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM public.document_evidence_conflict_checkpoints
  ) OR EXISTS (
    SELECT 1 FROM public.document_evidence_retry_applications
  ) THEN
    RAISE EXCEPTION 'Cannot roll back E3 while unmappable decision/checkpoint audit rows exist';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS guard_document_evidence_course_transition ON public.courses;
DROP FUNCTION IF EXISTS public.guard_document_evidence_course_transition();

REVOKE EXECUTE ON FUNCTION public.materialize_document_evidence_decision_gate_atomic(
  UUID, UUID, UUID, TEXT, JSONB, UUID
) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.answer_document_evidence_questions_atomic(UUID, JSONB, UUID)
  FROM authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_document_evidence_retry_state(UUID, UUID, INTEGER)
  FROM authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_document_evidence_retry_directives(UUID, INTEGER)
  FROM authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.consume_document_evidence_retry_directives(UUID, UUID, UUID, JSONB)
  FROM service_role;
REVOKE EXECUTE ON FUNCTION public.record_document_evidence_automatic_retry(
  UUID, UUID, UUID, UUID, INTEGER, UUID
) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.commit_document_evidence_conflict_batch(
  UUID, UUID, UUID, TEXT, TEXT, JSONB, JSONB, TEXT, TEXT, TEXT, JSONB
) FROM service_role;

DROP FUNCTION IF EXISTS public.get_document_evidence_retry_state(UUID, UUID, INTEGER);
DROP FUNCTION IF EXISTS public.get_document_evidence_retry_directives(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.consume_document_evidence_retry_directives(UUID, UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS public.record_document_evidence_automatic_retry(
  UUID, UUID, UUID, UUID, INTEGER, UUID
);
DROP FUNCTION IF EXISTS public.answer_document_evidence_questions_atomic(UUID, JSONB, UUID);
DROP FUNCTION IF EXISTS public.answer_document_evidence_question_atomic(
  UUID, TEXT, TEXT, INTEGER, UUID, UUID, UUID
);
DROP FUNCTION IF EXISTS public.materialize_document_evidence_decision_gate_atomic(
  UUID, UUID, UUID, TEXT, JSONB, UUID
);
DROP FUNCTION IF EXISTS public.resolve_document_evidence_question_atomic(UUID, UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS public.ensure_document_evidence_question_atomic(UUID, UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS public.refresh_document_evidence_decision_snapshot(UUID, UUID);
DROP FUNCTION IF EXISTS public.commit_document_evidence_conflict_batch(
  UUID, UUID, UUID, TEXT, TEXT, JSONB, JSONB, TEXT, TEXT, TEXT, JSONB
);
DROP FUNCTION IF EXISTS public.validate_document_evidence_conflict_allowlist(UUID, JSONB);
DROP FUNCTION IF EXISTS public.document_evidence_subject_key(UUID, TEXT, UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.document_evidence_retry_attempt(UUID, UUID);
DROP TABLE IF EXISTS public.document_evidence_retry_applications;
DROP FUNCTION IF EXISTS public.document_evidence_sha256(TEXT);

DROP INDEX IF EXISTS public.clarifying_questions_document_evidence_subject_unique;
DROP INDEX IF EXISTS public.document_evidence_decisions_idempotency_unique;
DROP INDEX IF EXISTS public.document_evidence_decisions_one_subject_chain_root;

ALTER TABLE public.document_evidence_decisions
  DROP CONSTRAINT IF EXISTS document_evidence_decisions_subject_shape;
ALTER TABLE public.document_evidence_decisions
  DROP CONSTRAINT IF EXISTS document_evidence_decisions_actor_shape;
ALTER TABLE public.document_evidence_decisions
  ALTER COLUMN conflict_id SET NOT NULL,
  DROP COLUMN IF EXISTS payload_hash,
  DROP COLUMN IF EXISTS idempotency_key,
  DROP COLUMN IF EXISTS document_id,
  DROP COLUMN IF EXISTS actor_user_id,
  DROP COLUMN IF EXISTS actor_provenance,
  DROP COLUMN IF EXISTS subject_key,
  DROP COLUMN IF EXISTS subject_kind;
CREATE UNIQUE INDEX document_evidence_decisions_one_chain_root
  ON public.document_evidence_decisions(run_id, conflict_id)
  WHERE supersedes_decision_id IS NULL;

ALTER TABLE public.document_evidence_conflicts
  DROP COLUMN IF EXISTS verification_error_category,
  DROP COLUMN IF EXISTS verification_status,
  DROP COLUMN IF EXISTS semantic_payload_hash;

DROP TABLE IF EXISTS public.document_evidence_conflict_checkpoints;
DROP FUNCTION IF EXISTS public.reject_document_evidence_conflict_checkpoint_mutation();
DROP FUNCTION IF EXISTS public.validate_document_evidence_conflict_checkpoint_scope();

CREATE OR REPLACE FUNCTION public.validate_document_evidence_decision_chain()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_course_id UUID;
  v_organization_id UUID;
  v_prior_run_id UUID;
  v_prior_conflict_id UUID;
BEGIN
  SELECT conflicts.course_id, conflicts.organization_id
    INTO v_course_id, v_organization_id
  FROM public.document_evidence_conflicts conflicts
  WHERE conflicts.id = NEW.conflict_id AND conflicts.run_id = NEW.run_id;
  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'Decision conflict does not belong to run' USING ERRCODE = '23514';
  END IF;
  NEW.course_id := v_course_id;
  NEW.organization_id := v_organization_id;
  IF NEW.supersedes_decision_id IS NOT NULL THEN
    SELECT decisions.run_id, decisions.conflict_id
      INTO v_prior_run_id, v_prior_conflict_id
    FROM public.document_evidence_decisions decisions
    WHERE decisions.id = NEW.supersedes_decision_id;
    IF v_prior_run_id IS DISTINCT FROM NEW.run_id
       OR v_prior_conflict_id IS DISTINCT FROM NEW.conflict_id THEN
      RAISE EXCEPTION 'Superseded decision must be in the same run and conflict chain'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Restore E1 automatic-answer semantics for every pending clarifying question.
CREATE OR REPLACE FUNCTION public.auto_answer_questions_atomic(p_course_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_question RECORD;
  v_updated_count INTEGER := 0;
  v_fallback_count INTEGER := 0;
  v_total_count INTEGER := 0;
  v_first_answer TEXT;
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
  WHERE course_id = p_course_id AND status = 'pending';
  FOR v_question IN
    SELECT id, suggested_answers, question_type FROM public.clarifying_questions
    WHERE course_id = p_course_id AND status = 'pending' FOR UPDATE
  LOOP
    v_first_answer := v_question.suggested_answers -> 0 ->> 'text';
    IF v_first_answer IS NULL OR v_first_answer = '' THEN
      v_first_answer := 'Auto-selected by system';
      v_fallback_count := v_fallback_count + 1;
    END IF;
    IF v_question.question_type = 'multi_choice' THEN
      v_user_answer := jsonb_build_object('values', jsonb_build_array(v_first_answer));
    ELSE
      v_user_answer := jsonb_build_object('value', v_first_answer);
    END IF;
    UPDATE public.clarifying_questions SET
      user_answer = v_user_answer, answer_source = 'system',
      selected_suggestion_index = 0, status = 'answered', answered_at = v_answered_at
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
    'code', SQLSTATE, 'updated_count', 0, 'total_pending', v_total_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_document_evidence_conflict(
  UUID, UUID, UUID, JSONB, TEXT, TEXT
) FROM authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.append_document_evidence_decision(JSONB)
  FROM authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auto_answer_questions_atomic(UUID)
  TO authenticated, service_role;
