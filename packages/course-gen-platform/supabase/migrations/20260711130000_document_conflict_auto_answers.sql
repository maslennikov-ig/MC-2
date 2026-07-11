-- Explicit document-conflict detection checkpoints and atomic decisions.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.document_evidence_sha256(p_value TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
  SELECT 'sha256:' || encode(extensions.digest(convert_to(p_value, 'UTF8'), 'sha256'), 'hex');
$$;

CREATE TABLE public.document_evidence_conflict_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.document_evidence_runs(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  batch_key TEXT NOT NULL CHECK (btrim(batch_key) <> ''),
  input_hash TEXT NOT NULL CHECK (btrim(input_hash) <> ''),
  structured_checkpoint JSONB NOT NULL CHECK (jsonb_typeof(structured_checkpoint) = 'object'),
  verification_status TEXT NOT NULL
    CHECK (verification_status IN ('verified', 'degraded', 'not_required')),
  conflict_verification JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(conflict_verification) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT document_evidence_conflict_checkpoint_unique UNIQUE (run_id, batch_key)
);

CREATE OR REPLACE FUNCTION public.validate_document_evidence_conflict_checkpoint_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.document_evidence_runs runs
    WHERE runs.id = NEW.run_id
      AND runs.course_id = NEW.course_id
      AND runs.organization_id = NEW.organization_id
      AND runs.status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Conflict checkpoint requires an accepted evidence run'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_document_evidence_conflict_checkpoint_scope
  BEFORE INSERT OR UPDATE ON public.document_evidence_conflict_checkpoints
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_evidence_conflict_checkpoint_scope();

CREATE OR REPLACE FUNCTION public.reject_document_evidence_conflict_checkpoint_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Document evidence conflict checkpoints are immutable'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER reject_document_evidence_conflict_checkpoint_mutation
  BEFORE UPDATE OR DELETE ON public.document_evidence_conflict_checkpoints
  FOR EACH ROW EXECUTE FUNCTION public.reject_document_evidence_conflict_checkpoint_mutation();

ALTER TABLE public.document_evidence_conflict_checkpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY conflict_checkpoints_tenant_select
  ON public.document_evidence_conflict_checkpoints FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.courses courses
      WHERE courses.id = document_evidence_conflict_checkpoints.course_id
        AND courses.organization_id = ((SELECT auth.jwt())->>'organization_id')::uuid
    )
  );
GRANT SELECT ON public.document_evidence_conflict_checkpoints TO authenticated;
GRANT ALL ON public.document_evidence_conflict_checkpoints TO service_role;

ALTER TABLE public.document_evidence_conflicts
  ADD COLUMN semantic_payload_hash TEXT,
  ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (verification_status IN ('verified', 'degraded', 'not_required')),
  ADD COLUMN verification_error_category TEXT;

ALTER TABLE public.document_evidence_decisions
  ADD COLUMN subject_kind TEXT NOT NULL DEFAULT 'claim_conflict'
    CHECK (subject_kind IN ('claim_conflict', 'degraded_evidence', 'detector_capacity')),
  ADD COLUMN subject_key TEXT,
  ADD COLUMN document_id UUID,
  ADD COLUMN idempotency_key UUID,
  ADD COLUMN payload_hash TEXT,
  ADD COLUMN actor_user_id UUID,
  ADD COLUMN actor_provenance TEXT NOT NULL DEFAULT 'legacy_unknown'
    CHECK (actor_provenance IN ('legacy_unknown', 'authenticated', 'system'));

CREATE TABLE public.document_evidence_retry_applications (
  decision_id UUID PRIMARY KEY REFERENCES public.document_evidence_decisions(id) ON DELETE RESTRICT,
  target_run_id UUID NOT NULL REFERENCES public.document_evidence_runs(id) ON DELETE RESTRICT,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.document_evidence_retry_applications ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.document_evidence_retry_applications TO service_role;

ALTER TABLE public.document_evidence_decisions
  DISABLE TRIGGER prevent_document_evidence_decisions_mutation;
UPDATE public.document_evidence_decisions
SET subject_key = public.document_evidence_sha256(
  'document-evidence-subject-v1:' || run_id::text || ':conflict:' || conflict_id::text
), actor_provenance = 'legacy_unknown'
WHERE subject_key IS NULL;
ALTER TABLE public.document_evidence_decisions
  ENABLE TRIGGER prevent_document_evidence_decisions_mutation;

ALTER TABLE public.document_evidence_decisions
  ALTER COLUMN subject_key SET NOT NULL,
  ALTER COLUMN conflict_id DROP NOT NULL,
  ADD CONSTRAINT document_evidence_decisions_subject_shape CHECK (
    (subject_kind = 'claim_conflict' AND conflict_id IS NOT NULL AND document_id IS NULL)
    OR (subject_kind = 'degraded_evidence' AND conflict_id IS NULL AND document_id IS NOT NULL)
    OR (subject_kind = 'detector_capacity' AND conflict_id IS NULL AND document_id IS NULL)
  ),
  ADD CONSTRAINT document_evidence_decisions_actor_shape CHECK (
    (resolved_by = 'system' AND actor_user_id IS NULL AND actor_provenance = 'system')
    OR (resolved_by = 'user' AND actor_user_id IS NOT NULL AND actor_provenance = 'authenticated')
    OR (actor_user_id IS NULL AND actor_provenance = 'legacy_unknown')
  ) NOT VALID;

DROP INDEX public.document_evidence_decisions_one_chain_root;
CREATE UNIQUE INDEX document_evidence_decisions_one_subject_chain_root
  ON public.document_evidence_decisions(run_id, subject_key)
  WHERE supersedes_decision_id IS NULL;
CREATE UNIQUE INDEX document_evidence_decisions_idempotency_unique
  ON public.document_evidence_decisions(run_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX clarifying_questions_document_evidence_subject_unique
  ON public.clarifying_questions(course_id, ((metadata->>'run_id')), ((metadata->>'subject_key')))
  WHERE question_category = 'document_conflicts';

CREATE OR REPLACE FUNCTION public.document_evidence_retry_attempt(
  p_course_id UUID,
  p_document_id UUID
) RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::integer
  FROM public.document_evidence_decisions decisions
  JOIN public.document_evidence_runs runs ON runs.id = decisions.run_id
  WHERE runs.course_id = p_course_id
    AND runs.status = 'accepted'
    AND decisions.subject_kind = 'degraded_evidence'
    AND decisions.document_id = p_document_id
    AND decisions.selected_recommendation_value = 'retry'
    AND EXISTS (
      SELECT 1 FROM public.document_evidence_retry_applications applications
      WHERE applications.decision_id = decisions.id
    );
$$;

CREATE OR REPLACE FUNCTION public.document_evidence_subject_key(
  p_run_id UUID,
  p_subject_kind TEXT,
  p_conflict_id UUID DEFAULT NULL,
  p_document_id UUID DEFAULT NULL,
  p_call_plan_hash TEXT DEFAULT NULL,
  p_config_hash TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run public.document_evidence_runs%ROWTYPE;
  v_item public.document_evidence_items%ROWTYPE;
  v_identity TEXT;
  v_attempt INTEGER;
BEGIN
  SELECT * INTO STRICT v_run FROM public.document_evidence_runs WHERE id = p_run_id;
  IF p_subject_kind = 'claim_conflict' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.document_evidence_conflicts
      WHERE id = p_conflict_id AND run_id = p_run_id
    ) THEN
      RAISE EXCEPTION 'Conflict decision subject is outside the accepted run'
        USING ERRCODE = '23514';
    END IF;
    v_identity := 'conflict:' || p_conflict_id::text;
  ELSIF p_subject_kind = 'degraded_evidence' THEN
    SELECT * INTO STRICT v_item FROM public.document_evidence_items
    WHERE run_id = p_run_id AND document_id = p_document_id
      AND coverage_status IN ('degraded', 'failed');
    v_attempt := public.document_evidence_retry_attempt(v_run.course_id, p_document_id);
    v_identity := 'degraded:' || p_document_id::text || ':' || v_item.coverage_status || ':' ||
      v_item.coverage_reason || ':' || v_attempt::text;
  ELSIF p_subject_kind = 'detector_capacity' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.document_evidence_conflict_checkpoints checkpoints
      WHERE checkpoints.run_id = p_run_id
        AND checkpoints.structured_checkpoint->>'kind' = 'conflict_capacity_degraded'
        AND checkpoints.structured_checkpoint->'issue'->>'call_plan_hash' = p_call_plan_hash
        AND checkpoints.structured_checkpoint->'issue'->>'config_hash' = p_config_hash
    ) THEN
      RAISE EXCEPTION 'Detector capacity decision subject is outside the accepted run'
        USING ERRCODE = '23514';
    END IF;
    v_identity := 'capacity:' || p_call_plan_hash || ':' || p_config_hash;
  ELSE
    RAISE EXCEPTION 'Unknown document evidence decision subject' USING ERRCODE = '22023';
  END IF;
  RETURN public.document_evidence_sha256(
    'document-evidence-subject-v1:' || p_run_id::text || ':' || v_identity
  );
EXCEPTION WHEN no_data_found THEN
  RAISE EXCEPTION 'Document evidence decision subject is outside the accepted run'
    USING ERRCODE = '23514';
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_document_evidence_decision_chain()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_run public.document_evidence_runs%ROWTYPE;
  v_prior public.document_evidence_decisions%ROWTYPE;
BEGIN
  SELECT * INTO v_run FROM public.document_evidence_runs WHERE id = NEW.run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Decision run does not exist' USING ERRCODE = '23514'; END IF;
  IF NEW.subject_kind = 'claim_conflict' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.document_evidence_conflicts conflicts
      WHERE conflicts.id = NEW.conflict_id AND conflicts.run_id = NEW.run_id
        AND conflicts.course_id = v_run.course_id
        AND conflicts.organization_id = v_run.organization_id
    ) THEN
      RAISE EXCEPTION 'Decision conflict does not belong to run' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.subject_kind = 'degraded_evidence' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.document_evidence_items items
      WHERE items.run_id = NEW.run_id AND items.document_id = NEW.document_id
        AND items.coverage_status IN ('degraded', 'failed')
    ) THEN
      RAISE EXCEPTION 'Decision degraded document does not belong to run'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.subject_kind = 'detector_capacity' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.document_evidence_conflict_checkpoints checkpoints
      WHERE checkpoints.run_id = NEW.run_id
        AND checkpoints.structured_checkpoint->>'kind' = 'conflict_capacity_degraded'
    ) THEN
      RAISE EXCEPTION 'Decision detector capacity issue does not belong to run'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  NEW.actor_provenance := CASE
    WHEN NEW.resolved_by = 'system' THEN 'system'
    WHEN NEW.actor_user_id IS NOT NULL THEN 'authenticated'
    ELSE NEW.actor_provenance
  END;
  NEW.course_id := v_run.course_id;
  NEW.organization_id := v_run.organization_id;
  IF NEW.supersedes_decision_id IS NOT NULL THEN
    SELECT * INTO v_prior FROM public.document_evidence_decisions
    WHERE id = NEW.supersedes_decision_id;
    IF NOT FOUND OR v_prior.run_id IS DISTINCT FROM NEW.run_id
       OR v_prior.subject_key IS DISTINCT FROM NEW.subject_key
       OR EXISTS (
         SELECT 1 FROM public.document_evidence_decisions newer
         WHERE newer.supersedes_decision_id = v_prior.id
       ) THEN
      RAISE EXCEPTION 'Superseded decision must be the current decision in the same run subject'
        USING ERRCODE = '40001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Validate conflict provenance only against the exact persisted cards of the accepted run.
CREATE OR REPLACE FUNCTION public.validate_document_evidence_conflict_allowlist(
  p_run_id UUID,
  p_conflict JSONB
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_side JSONB;
  v_claim_id TEXT;
  v_document_id TEXT;
  v_source_ref JSONB;
BEGIN
  IF jsonb_typeof(p_conflict->'sides') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_conflict->'sides') < 2 THEN
    RAISE EXCEPTION 'Conflict sides are invalid' USING ERRCODE = '22023';
  END IF;
  FOR v_side IN SELECT value FROM jsonb_array_elements(p_conflict->'sides') LOOP
    FOR v_document_id IN SELECT value FROM jsonb_array_elements_text(v_side->'document_ids') LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.document_evidence_items items
        WHERE items.run_id = p_run_id AND items.document_id = v_document_id::uuid
      ) THEN
        RAISE EXCEPTION 'Conflict document allowlist violation' USING ERRCODE = '23514';
      END IF;
    END LOOP;
    FOR v_claim_id IN SELECT value FROM jsonb_array_elements_text(v_side->'claim_ids') LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.document_evidence_items items
        CROSS JOIN LATERAL jsonb_array_elements(items.claims) claim
        WHERE items.run_id = p_run_id AND claim->>'claim_id' = v_claim_id
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(v_side->'document_ids') side_document
            WHERE side_document = items.document_id::text
          )
      ) THEN
        RAISE EXCEPTION 'Conflict claim/side-document allowlist violation'
          USING ERRCODE = '23514';
      END IF;
    END LOOP;
    FOR v_source_ref IN SELECT value FROM jsonb_array_elements(v_side->'source_refs') LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.document_evidence_items items
        CROSS JOIN LATERAL jsonb_array_elements(items.claims) claim
        CROSS JOIN LATERAL jsonb_array_elements(claim->'source_refs') source_ref
        WHERE items.run_id = p_run_id
          AND source_ref = v_source_ref
          AND items.document_id::text = v_source_ref->>'document_id'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(v_side->'document_ids') side_document
            WHERE side_document = items.document_id::text
          )
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(v_side->'claim_ids') claim_id
            WHERE claim_id = claim->>'claim_id'
          )
      ) THEN
        RAISE EXCEPTION 'Conflict source ref allowlist violation' USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_document_evidence_conflict_batch(
  p_run_id UUID,
  p_course_id UUID,
  p_organization_id UUID,
  p_batch_key TEXT,
  p_input_hash TEXT,
  p_structured_checkpoint JSONB,
  p_conflicts JSONB,
  p_detection_model TEXT,
  p_detection_version TEXT,
  p_verification_status TEXT,
  p_conflict_verification JSONB DEFAULT '[]'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run public.document_evidence_runs%ROWTYPE;
  v_existing_checkpoint public.document_evidence_conflict_checkpoints%ROWTYPE;
  v_checkpoint public.document_evidence_conflict_checkpoints%ROWTYPE;
  v_conflict JSONB;
  v_existing public.document_evidence_conflicts%ROWTYPE;
  v_semantic_hash TEXT;
  v_status TEXT;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Conflict batch commit requires service_role' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_batch_key), '') IS NULL OR NULLIF(btrim(p_input_hash), '') IS NULL
     OR jsonb_typeof(p_structured_checkpoint) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_conflicts) IS DISTINCT FROM 'array'
     OR p_verification_status NOT IN ('verified', 'degraded', 'not_required') THEN
    RAISE EXCEPTION 'Conflict batch payload is invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_run FROM public.document_evidence_runs
  WHERE id = p_run_id AND course_id = p_course_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND OR v_run.status <> 'accepted' THEN
    RAISE EXCEPTION 'Conflict batch requires accepted run scope' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_existing_checkpoint
  FROM public.document_evidence_conflict_checkpoints
  WHERE run_id = p_run_id AND batch_key = p_batch_key;
  IF FOUND THEN
    IF v_existing_checkpoint.input_hash IS DISTINCT FROM p_input_hash THEN
      RAISE EXCEPTION 'Conflict batch key already has a different input hash'
        USING ERRCODE = '23514';
    END IF;
    RETURN jsonb_build_object('checkpoint', to_jsonb(v_existing_checkpoint), 'reused', true);
  END IF;

  FOR v_conflict IN SELECT value FROM jsonb_array_elements(p_conflicts) LOOP
    PERFORM public.validate_document_evidence_conflict_allowlist(p_run_id, v_conflict);
    v_semantic_hash := public.document_evidence_sha256(
      jsonb_build_object(
        'conflict', v_conflict - 'conflict_id' - 'conflict_fingerprint',
        'verification_status', p_verification_status,
        'conflict_verification', p_conflict_verification
      )::text
    );
    SELECT COALESCE(entry->>'status', p_verification_status) INTO v_status
    FROM jsonb_array_elements(COALESCE(p_conflict_verification, '[]'::jsonb)) entry
    WHERE entry->>'conflictFingerprint' = v_conflict->>'conflict_fingerprint'
       OR entry->>'conflict_fingerprint' = v_conflict->>'conflict_fingerprint'
    LIMIT 1;
    v_status := COALESCE(v_status, p_verification_status);
    SELECT * INTO v_existing FROM public.document_evidence_conflicts
    WHERE run_id = p_run_id
      AND conflict_fingerprint = v_conflict->>'conflict_fingerprint'
    FOR UPDATE;
    IF FOUND THEN
      IF v_existing.semantic_payload_hash IS DISTINCT FROM v_semantic_hash
         OR v_existing.topic IS DISTINCT FROM v_conflict->>'topic'
         OR v_existing.severity IS DISTINCT FROM v_conflict->>'severity'
         OR v_existing.sides IS DISTINCT FROM v_conflict->'sides'
         OR v_existing.course_impact IS DISTINCT FROM v_conflict->>'course_impact'
         OR v_existing.recommended_resolution IS DISTINCT FROM v_conflict->>'recommended_resolution'
         OR v_existing.recommendation_rationale IS DISTINCT FROM v_conflict->>'recommendation_rationale'
         OR v_existing.alternatives IS DISTINCT FROM v_conflict->'alternatives' THEN
        RAISE EXCEPTION 'Conflict fingerprint has a different semantic payload'
          USING ERRCODE = '23514';
      END IF;
    ELSE
      INSERT INTO public.document_evidence_conflicts (
        id, run_id, course_id, organization_id, conflict_fingerprint, topic, severity,
        sides, claim_ids, source_refs, course_impact, recommended_resolution,
        recommendation_rationale, alternatives, detection_model, detection_version,
        semantic_payload_hash, verification_status,
        verification_error_category
      ) VALUES (
        (v_conflict->>'conflict_id')::uuid, p_run_id, p_course_id, p_organization_id,
        v_conflict->>'conflict_fingerprint', v_conflict->>'topic', v_conflict->>'severity',
        v_conflict->'sides',
        (SELECT COALESCE(jsonb_agg(DISTINCT claim_id), '[]'::jsonb)
         FROM jsonb_array_elements(v_conflict->'sides') side
         CROSS JOIN LATERAL jsonb_array_elements_text(side->'claim_ids') claim_id),
        (SELECT COALESCE(jsonb_agg(DISTINCT source_ref), '[]'::jsonb)
         FROM jsonb_array_elements(v_conflict->'sides') side
         CROSS JOIN LATERAL jsonb_array_elements(side->'source_refs') source_ref),
        v_conflict->>'course_impact', v_conflict->>'recommended_resolution',
        v_conflict->>'recommendation_rationale', v_conflict->'alternatives',
        p_detection_model, p_detection_version, v_semantic_hash, v_status,
        CASE WHEN v_status = 'degraded' THEN 'targeted_verification_incomplete' END
      );
    END IF;
  END LOOP;

  INSERT INTO public.document_evidence_conflict_checkpoints (
    run_id, course_id, organization_id, batch_key, input_hash,
    structured_checkpoint, verification_status, conflict_verification
  ) VALUES (
    p_run_id, p_course_id, p_organization_id, p_batch_key, p_input_hash,
    p_structured_checkpoint, p_verification_status, COALESCE(p_conflict_verification, '[]'::jsonb)
  ) RETURNING * INTO v_checkpoint;
  RETURN jsonb_build_object('checkpoint', to_jsonb(v_checkpoint), 'reused', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_document_evidence_question_atomic(
  p_course_id UUID,
  p_run_id UUID,
  p_organization_id UUID,
  p_question JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing public.clarifying_questions%ROWTYPE;
  v_question public.clarifying_questions%ROWTYPE;
  v_metadata JSONB := p_question->'metadata';
  v_expected_subject_key TEXT;
  v_retry_attempt INTEGER;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Question creation requires service_role' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.document_evidence_runs
    WHERE id = p_run_id AND course_id = p_course_id
      AND organization_id = p_organization_id AND status = 'accepted'
  ) OR v_metadata->>'run_id' IS DISTINCT FROM p_run_id::text
     OR v_metadata->>'subject_key' IS NULL THEN
    RAISE EXCEPTION 'Document evidence question scope mismatch' USING ERRCODE = '23514';
  END IF;
  IF v_metadata->>'subject_kind' = 'claim_conflict' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.document_evidence_conflicts
      WHERE id = (v_metadata->>'conflict_id')::uuid AND run_id = p_run_id
        AND severity IN ('critical', 'important')
    ) THEN
      RAISE EXCEPTION 'Material conflict question allowlist violation' USING ERRCODE = '23514';
    END IF;
    v_expected_subject_key := public.document_evidence_subject_key(
      p_run_id, 'claim_conflict', (v_metadata->>'conflict_id')::uuid
    );
  ELSIF v_metadata->>'subject_kind' = 'degraded_evidence' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.document_evidence_items
      WHERE run_id = p_run_id AND document_id = (v_metadata->>'document_id')::uuid
        AND coverage_status IN ('degraded', 'failed')
    ) THEN
      RAISE EXCEPTION 'Degraded evidence question allowlist violation' USING ERRCODE = '23514';
    END IF;
    v_retry_attempt := public.document_evidence_retry_attempt(
      p_course_id, (v_metadata->>'document_id')::uuid
    );
    IF NULLIF(v_metadata->>'attempt', '')::integer IS DISTINCT FROM v_retry_attempt THEN
      RAISE EXCEPTION 'Degraded evidence retry lineage is stale' USING ERRCODE = '40001';
    END IF;
    v_expected_subject_key := public.document_evidence_subject_key(
      p_run_id, 'degraded_evidence', NULL, (v_metadata->>'document_id')::uuid
    );
  ELSIF v_metadata->>'subject_kind' = 'detector_capacity' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.document_evidence_conflict_checkpoints checkpoints
      WHERE checkpoints.run_id = p_run_id
        AND checkpoints.structured_checkpoint->>'kind' = 'conflict_capacity_degraded'
        AND checkpoints.structured_checkpoint->'issue'->>'call_plan_hash' =
            v_metadata->>'call_plan_hash'
        AND checkpoints.structured_checkpoint->'issue'->>'config_hash' =
            v_metadata->>'config_hash'
    ) THEN
      RAISE EXCEPTION 'Detector capacity question allowlist violation' USING ERRCODE = '23514';
    END IF;
    v_expected_subject_key := public.document_evidence_subject_key(
      p_run_id, 'detector_capacity', NULL, NULL,
      v_metadata->>'call_plan_hash', v_metadata->>'config_hash'
    );
  ELSE
    RAISE EXCEPTION 'Unknown document evidence decision subject' USING ERRCODE = '22023';
  END IF;
  IF v_metadata->>'subject_key' IS DISTINCT FROM v_expected_subject_key THEN
    RAISE EXCEPTION 'Document evidence subject key is not database canonical'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_existing FROM public.clarifying_questions
  WHERE course_id = p_course_id
    AND question_category = 'document_conflicts'
    AND metadata->>'run_id' = p_run_id::text
    AND metadata->>'subject_key' = v_metadata->>'subject_key'
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.id IS DISTINCT FROM (p_question->>'question_id')::uuid
       OR v_existing.question_text IS DISTINCT FROM p_question->>'question_text'
       OR v_existing.suggested_answers IS DISTINCT FROM p_question->'suggested_answers'
       OR (v_existing.metadata - 'current_decision_id') IS DISTINCT FROM v_metadata THEN
      RAISE EXCEPTION 'Question identity has a different payload' USING ERRCODE = '23514';
    END IF;
    RETURN jsonb_build_object('question', to_jsonb(v_existing), 'reused', true);
  END IF;
  INSERT INTO public.clarifying_questions (
    id, course_id, question_text, question_type, question_priority,
    question_category, suggested_answers, iteration_round, status, order_index, metadata
  ) VALUES (
    (p_question->>'question_id')::uuid, p_course_id, p_question->>'question_text',
    'single_choice', p_question->>'question_priority', 'document_conflicts',
    p_question->'suggested_answers', 1, 'pending',
    COALESCE((p_question->>'order_index')::integer, 10000), v_metadata
  ) RETURNING * INTO v_question;
  RETURN jsonb_build_object('question', to_jsonb(v_question), 'reused', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_document_evidence_decision_snapshot(
  p_course_id UUID,
  p_run_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current JSONB;
  v_unresolved JSONB;
  v_snapshot JSONB;
  v_run public.document_evidence_runs%ROWTYPE;
BEGIN
  SELECT * INTO v_run FROM public.document_evidence_runs
  WHERE id = p_run_id AND course_id = p_course_id AND status = 'accepted'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision snapshot requires the accepted scoped run'
      USING ERRCODE = '23514';
  END IF;
  SELECT COALESCE(jsonb_agg(current.id ORDER BY current.id), '[]'::jsonb)
  INTO v_current
  FROM public.document_evidence_decisions current
  WHERE current.run_id = p_run_id
    AND NOT EXISTS (
      SELECT 1 FROM public.document_evidence_decisions newer
      WHERE newer.supersedes_decision_id = current.id
    );
  SELECT COALESCE(jsonb_agg(conflicts.id ORDER BY conflicts.id), '[]'::jsonb)
  INTO v_unresolved
  FROM public.document_evidence_conflicts conflicts
  WHERE conflicts.run_id = p_run_id AND conflicts.severity = 'informational'
    AND NOT EXISTS (
      SELECT 1 FROM public.document_evidence_decisions decisions
      WHERE decisions.run_id = p_run_id
        AND decisions.conflict_id = conflicts.id
        AND NOT EXISTS (
          SELECT 1 FROM public.document_evidence_decisions newer
          WHERE newer.supersedes_decision_id = decisions.id
        )
    );
  v_snapshot := jsonb_build_object(
    'accepted_run_id', p_run_id,
    'coverage', jsonb_build_object(
      'source_count', v_run.source_count,
      'assessed_count', v_run.assessed_count,
      'degraded_count', v_run.degraded_count,
      'failed_count', v_run.failed_count
    ),
    'current_decision_ids', v_current,
    'unresolved_informational_conflict_ids', v_unresolved,
    'enrichment_status', 'not_applicable'
  );
  UPDATE public.courses
  SET analysis_result = jsonb_set(
    COALESCE(analysis_result, '{}'::jsonb), '{document_evidence}', v_snapshot, true
  )
  WHERE id = p_course_id;
  RETURN v_snapshot;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_document_evidence_question_atomic(
  p_course_id UUID,
  p_run_id UUID,
  p_organization_id UUID,
  p_payload JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run public.document_evidence_runs%ROWTYPE;
  v_question public.clarifying_questions%ROWTYPE;
  v_existing public.document_evidence_decisions%ROWTYPE;
  v_decision public.document_evidence_decisions%ROWTYPE;
  v_recommended_count INTEGER;
  v_recommended_index INTEGER;
  v_recommended_value TEXT;
  v_recommended_text TEXT;
  v_recommended_rationale TEXT;
  v_payload_hash TEXT := public.document_evidence_sha256(p_payload::text);
  v_subject_kind TEXT;
  v_subject_key TEXT;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'System document decision requires service_role' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_run FROM public.document_evidence_runs
  WHERE id = p_run_id AND course_id = p_course_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND OR v_run.status <> 'accepted' THEN
    RAISE EXCEPTION 'System decision requires accepted run' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_question FROM public.clarifying_questions
  WHERE id = (p_payload->>'question_id')::uuid AND course_id = p_course_id
    AND question_category = 'document_conflicts'
  FOR UPDATE;
  IF NOT FOUND OR v_question.metadata->>'run_id' IS DISTINCT FROM p_run_id::text THEN
    RAISE EXCEPTION 'System decision question scope mismatch' USING ERRCODE = '23514';
  END IF;
  SELECT count(*), min(ordinality - 1),
         min(COALESCE(answer->>'value', answer->>'text')), min(answer->>'text'),
         min(answer->>'rationale')
  INTO v_recommended_count, v_recommended_index, v_recommended_value, v_recommended_text,
       v_recommended_rationale
  FROM jsonb_array_elements(v_question.suggested_answers) WITH ORDINALITY options(answer, ordinality)
  WHERE COALESCE((answer->>'is_recommended')::boolean, false);
  IF v_recommended_count <> 1 THEN
    RAISE EXCEPTION 'Question must contain exactly one recommended answer'
      USING ERRCODE = '23514';
  END IF;
  IF v_recommended_index IS DISTINCT FROM (p_payload->>'selected_recommendation_index')::integer
     OR v_recommended_value IS DISTINCT FROM p_payload->>'selected_recommendation_value' THEN
    RAISE EXCEPTION 'Selected system recommendation does not match question'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_existing FROM public.document_evidence_decisions
  WHERE run_id = p_run_id AND idempotency_key = (p_payload->>'idempotency_key')::uuid
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'Decision idempotency key has a changed payload' USING ERRCODE = '23514';
    END IF;
    RETURN jsonb_build_object(
      'decision_id', v_existing.id, 'question_id', v_question.id, 'reused', true,
      'snapshot', public.refresh_document_evidence_decision_snapshot(p_course_id, p_run_id)
    );
  END IF;
  v_subject_kind := v_question.metadata->>'subject_kind';
  v_subject_key := v_question.metadata->>'subject_key';
  IF EXISTS (
    SELECT 1 FROM public.document_evidence_decisions decisions
    WHERE decisions.run_id = p_run_id AND decisions.subject_key = v_subject_key
      AND NOT EXISTS (
        SELECT 1 FROM public.document_evidence_decisions newer
        WHERE newer.supersedes_decision_id = decisions.id
      )
  ) THEN
    RAISE EXCEPTION 'Document evidence subject already has a current decision'
      USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.document_evidence_decisions (
    run_id, conflict_id, course_id, organization_id, clarifying_question_id,
    selected_resolution, rationale, resolved_by, answer_source,
    selected_recommendation_index, selected_recommendation_value, decided_at,
    subject_kind, subject_key, document_id, idempotency_key, payload_hash
  ) VALUES (
    p_run_id,
    CASE WHEN v_subject_kind = 'claim_conflict'
      THEN (v_question.metadata->>'conflict_id')::uuid END,
    p_course_id, p_organization_id, v_question.id,
    v_recommended_value, v_recommended_rationale, 'system', 'system',
    v_recommended_index, v_recommended_value, now(),
    v_subject_kind, v_subject_key,
    CASE WHEN v_subject_kind = 'degraded_evidence'
      THEN (v_question.metadata->>'document_id')::uuid END,
    (p_payload->>'idempotency_key')::uuid, v_payload_hash
  ) RETURNING * INTO v_decision;
  UPDATE public.clarifying_questions
  SET user_answer = jsonb_build_object('value', v_recommended_value),
      answer_source = 'system', selected_suggestion_index = v_recommended_index,
      status = 'answered', answered_at = v_decision.decided_at,
      metadata = v_question.metadata || jsonb_build_object('current_decision_id', v_decision.id)
  WHERE id = v_question.id;
  RETURN jsonb_build_object(
    'decision_id', v_decision.id, 'question_id', v_question.id, 'reused', false,
    'snapshot', public.refresh_document_evidence_decision_snapshot(p_course_id, p_run_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.materialize_document_evidence_decision_gate_atomic(
  p_run_id UUID,
  p_course_id UUID,
  p_organization_id UUID,
  p_mode TEXT,
  p_questions JSONB,
  p_idempotency_key UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run public.document_evidence_runs%ROWTYPE;
  v_existing public.document_evidence_conflict_checkpoints%ROWTYPE;
  v_question_input JSONB;
  v_question_payload JSONB;
  v_question_result JSONB;
  v_question JSONB;
  v_recommended JSONB;
  v_recommended_count INTEGER;
  v_decision_result JSONB;
  v_question_ids JSONB := '[]'::jsonb;
  v_decision_ids JSONB := '[]'::jsonb;
  v_payload_hash TEXT := public.document_evidence_sha256(
    jsonb_build_object('mode', p_mode, 'questions', p_questions)::text
  );
  v_result JSONB;
  v_expected_subject_keys TEXT[];
  v_question_subject_keys TEXT[];
  v_question_count INTEGER;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Decision gate materialization requires service_role' USING ERRCODE = '42501';
  END IF;
  IF p_mode NOT IN ('manual', 'automatic') OR jsonb_typeof(p_questions) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Decision gate payload is invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_run FROM public.document_evidence_runs
  WHERE id = p_run_id AND course_id = p_course_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND OR v_run.status <> 'accepted' THEN
    RAISE EXCEPTION 'Decision gate requires accepted run' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_existing FROM public.document_evidence_conflict_checkpoints
  WHERE run_id = p_run_id AND batch_key = 'decision-gate:' || p_idempotency_key::text;
  IF FOUND THEN
    IF v_existing.input_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'Decision gate idempotency key has a changed payload' USING ERRCODE = '23514';
    END IF;
    RETURN (v_existing.structured_checkpoint->'result') || jsonb_build_object('reused', true);
  END IF;

  IF jsonb_array_length(p_questions) > 256 THEN
    RAISE EXCEPTION 'Decision gate exceeds bounded question count' USING ERRCODE = '22023';
  END IF;
  WITH expected AS (
    SELECT public.document_evidence_subject_key(
      p_run_id, 'claim_conflict', conflicts.id
    ) AS subject_key
    FROM public.document_evidence_conflicts conflicts
    WHERE conflicts.run_id = p_run_id AND conflicts.severity IN ('critical', 'important')
    UNION
    SELECT public.document_evidence_subject_key(
      p_run_id, 'degraded_evidence', NULL, items.document_id
    )
    FROM public.document_evidence_items items
    WHERE items.run_id = p_run_id AND items.coverage_status IN ('degraded', 'failed')
    UNION
    SELECT public.document_evidence_subject_key(
      p_run_id, 'detector_capacity', NULL, NULL,
      checkpoints.structured_checkpoint->'issue'->>'call_plan_hash',
      checkpoints.structured_checkpoint->'issue'->>'config_hash'
    )
    FROM public.document_evidence_conflict_checkpoints checkpoints
    WHERE checkpoints.run_id = p_run_id
      AND checkpoints.structured_checkpoint->>'kind' = 'conflict_capacity_degraded'
  ), unresolved AS (
    SELECT expected.subject_key FROM expected
    WHERE NOT EXISTS (
      SELECT 1 FROM public.document_evidence_decisions decisions
      WHERE decisions.run_id = p_run_id
        AND decisions.subject_key = expected.subject_key
        AND NOT EXISTS (
          SELECT 1 FROM public.document_evidence_decisions newer
          WHERE newer.supersedes_decision_id = decisions.id
        )
    )
  )
  SELECT COALESCE(array_agg(subject_key ORDER BY subject_key), '{}'::TEXT[])
    INTO v_expected_subject_keys FROM unresolved;
  SELECT
    COALESCE(array_agg(value->'metadata'->>'subject_key' ORDER BY value->'metadata'->>'subject_key'), '{}'::TEXT[]),
    count(*)::integer
  INTO v_question_subject_keys, v_question_count
  FROM jsonb_array_elements(p_questions);
  IF v_question_count <> cardinality(ARRAY(SELECT DISTINCT unnest(v_question_subject_keys)))
     OR v_question_subject_keys IS DISTINCT FROM v_expected_subject_keys THEN
    RAISE EXCEPTION 'Decision gate questions must exactly equal unresolved durable subjects'
      USING ERRCODE = '23514';
  END IF;

  FOR v_question_input IN SELECT value FROM jsonb_array_elements(p_questions) ORDER BY value->>'questionId' LOOP
    v_question_payload := jsonb_build_object(
      'question_id', v_question_input->>'questionId',
      'question_text', v_question_input->>'questionText',
      'question_priority', v_question_input->>'priority',
      'suggested_answers', v_question_input->'suggestedAnswers',
      'order_index', 10000,
      'metadata', v_question_input->'metadata'
    );
    v_question_result := public.ensure_document_evidence_question_atomic(
      p_course_id, p_run_id, p_organization_id, v_question_payload
    );
    v_question := v_question_result->'question';
    v_question_ids := v_question_ids || jsonb_build_array(v_question->>'id');
    IF p_mode = 'automatic' THEN
      SELECT count(*) INTO v_recommended_count
      FROM jsonb_array_elements(v_question->'suggested_answers') answer
      WHERE COALESCE((answer->>'is_recommended')::boolean, false);
      IF v_recommended_count <> 1 THEN
        RAISE EXCEPTION 'Question must contain exactly one recommended answer'
          USING ERRCODE = '23514';
      END IF;
      SELECT answer INTO v_recommended
      FROM jsonb_array_elements(v_question->'suggested_answers') answer
      WHERE COALESCE((answer->>'is_recommended')::boolean, false)
      LIMIT 1;
      IF v_question->'metadata'->>'subject_kind' = 'degraded_evidence'
         AND (v_question->'metadata'->>'attempt')::integer <
             (v_question->'metadata'->>'max_attempts')::integer THEN
        RAISE EXCEPTION 'Automatic degraded decision requires exhausted retry attempts'
          USING ERRCODE = '23514';
      END IF;
      IF v_question->'metadata'->>'subject_kind' = 'detector_capacity'
         AND v_recommended->>'value' <> 'continue_limited' THEN
        RAISE EXCEPTION 'Automatic detector capacity policy is not approved'
          USING ERRCODE = '23514';
      END IF;
      SELECT ordinality - 1 INTO v_recommended_count
      FROM jsonb_array_elements(v_question->'suggested_answers') WITH ORDINALITY options(answer, ordinality)
      WHERE COALESCE((answer->>'is_recommended')::boolean, false);
      v_decision_result := public.resolve_document_evidence_question_atomic(
        p_course_id,
        p_run_id,
        p_organization_id,
        jsonb_build_object(
          'question_id', v_question->>'id',
          'selected_recommendation_index', v_recommended_count,
          'selected_recommendation_value', COALESCE(v_recommended->>'value', v_recommended->>'text'),
          'rationale', v_recommended->>'rationale',
          'idempotency_key', gen_random_uuid()
        )
      );
      v_decision_ids := v_decision_ids || jsonb_build_array(v_decision_result->>'decision_id');
    END IF;
  END LOOP;
  v_result := jsonb_build_object(
    'question_ids', (SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb) FROM jsonb_array_elements_text(v_question_ids)),
    'decision_ids', (SELECT COALESCE(jsonb_agg(value ORDER BY value), '[]'::jsonb) FROM jsonb_array_elements_text(v_decision_ids)),
    'reused', false
  );
  INSERT INTO public.document_evidence_conflict_checkpoints (
    run_id, course_id, organization_id, batch_key, input_hash,
    structured_checkpoint, verification_status, conflict_verification
  ) VALUES (
    p_run_id, p_course_id, p_organization_id,
    'decision-gate:' || p_idempotency_key::text, v_payload_hash,
    jsonb_build_object('kind', 'decision_gate', 'result', v_result),
    'not_required', '[]'::jsonb
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.answer_document_evidence_question_atomic(
  p_question_id UUID,
  p_answer TEXT,
  p_answer_source TEXT,
  p_selected_recommendation_index INTEGER,
  p_idempotency_key UUID,
  p_expected_current_decision_id UUID,
  p_actor_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_question public.clarifying_questions%ROWTYPE;
  v_run public.document_evidence_runs%ROWTYPE;
  v_current public.document_evidence_decisions%ROWTYPE;
  v_existing public.document_evidence_decisions%ROWTYPE;
  v_decision public.document_evidence_decisions%ROWTYPE;
  v_payload_hash TEXT;
  v_selected_value TEXT;
  v_selected_text TEXT;
BEGIN
  IF p_answer_source NOT IN ('suggested', 'modified', 'custom') THEN
    RAISE EXCEPTION 'User answer_source must be suggested, modified or custom'
      USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_answer), '') IS NULL OR length(p_answer) > 5000 THEN
    RAISE EXCEPTION 'Document evidence answer text is invalid' USING ERRCODE = '22023';
  END IF;
  IF (p_answer_source IN ('suggested', 'modified') AND p_selected_recommendation_index IS NULL)
     OR (p_answer_source = 'custom' AND p_selected_recommendation_index IS NOT NULL) THEN
    RAISE EXCEPTION 'Document evidence answer source/index shape is invalid'
      USING ERRCODE = '22023';
  END IF;
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Document evidence user decision requires an actor'
      USING ERRCODE = '23502';
  END IF;
  SELECT * INTO v_question FROM public.clarifying_questions
  WHERE id = p_question_id AND question_category = 'document_conflicts'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document evidence question not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_run FROM public.document_evidence_runs
  WHERE id = (v_question.metadata->>'run_id')::uuid AND course_id = v_question.course_id
  FOR UPDATE;
  IF NOT FOUND OR v_run.status <> 'accepted' THEN
    RAISE EXCEPTION 'User decision requires accepted run' USING ERRCODE = '23514';
  END IF;
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'
     AND v_run.organization_id IS DISTINCT FROM
       NULLIF((SELECT auth.jwt())->>'organization_id', '')::uuid THEN
    RAISE EXCEPTION 'Document evidence answer access denied' USING ERRCODE = '42501';
  END IF;
  IF p_selected_recommendation_index IS NOT NULL THEN
    v_selected_text := v_question.suggested_answers -> p_selected_recommendation_index ->> 'text';
    v_selected_value := COALESCE(
      v_question.suggested_answers -> p_selected_recommendation_index ->> 'value',
      v_selected_text
    );
    IF v_selected_text IS NULL
       OR (p_answer_source = 'suggested' AND v_selected_text <> p_answer) THEN
      RAISE EXCEPTION 'Selected answer is outside the question options' USING ERRCODE = '23514';
    END IF;
  END IF;
  v_payload_hash := public.document_evidence_sha256(jsonb_build_object(
    'course_id', v_question.course_id, 'run_id', v_run.id,
    'question_id', p_question_id, 'subject_key', v_question.metadata->>'subject_key',
    'actor_user_id', p_actor_user_id, 'answer', p_answer,
    'answer_source', p_answer_source, 'selected_index', p_selected_recommendation_index
  )::text);
  SELECT * INTO v_existing FROM public.document_evidence_decisions
  WHERE run_id = v_run.id AND idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_hash IS DISTINCT FROM v_payload_hash
       OR v_existing.actor_user_id IS DISTINCT FROM p_actor_user_id
       OR v_existing.course_id IS DISTINCT FROM v_question.course_id
       OR v_existing.clarifying_question_id IS DISTINCT FROM p_question_id
       OR v_existing.subject_key IS DISTINCT FROM v_question.metadata->>'subject_key' THEN
      RAISE EXCEPTION 'Decision idempotency key has a changed payload' USING ERRCODE = '23514';
    END IF;
    RETURN jsonb_build_object('decision_id', v_existing.id, 'reused', true);
  END IF;
  SELECT * INTO v_current FROM public.document_evidence_decisions decisions
  WHERE decisions.run_id = v_run.id
    AND decisions.subject_key = v_question.metadata->>'subject_key'
    AND NOT EXISTS (
      SELECT 1 FROM public.document_evidence_decisions newer
      WHERE newer.supersedes_decision_id = decisions.id
    )
  FOR UPDATE;
  IF (v_current.id IS NULL AND p_expected_current_decision_id IS NOT NULL)
     OR (v_current.id IS NOT NULL AND p_expected_current_decision_id IS NULL)
     OR v_current.id IS DISTINCT FROM p_expected_current_decision_id THEN
    RAISE EXCEPTION 'stale current decision changed before user answer'
      USING ERRCODE = '40001';
  END IF;
  INSERT INTO public.document_evidence_decisions (
    run_id, conflict_id, course_id, organization_id, clarifying_question_id,
    selected_resolution, rationale, resolved_by, answer_source,
    selected_recommendation_index, selected_recommendation_value,
    supersedes_decision_id, decided_at, subject_kind, subject_key, document_id,
    idempotency_key, payload_hash, actor_user_id
  ) VALUES (
    v_run.id,
    CASE WHEN v_question.metadata->>'subject_kind' = 'claim_conflict'
      THEN (v_question.metadata->>'conflict_id')::uuid END,
    v_question.course_id, v_run.organization_id, v_question.id,
    p_answer, 'User selected or supplied this resolution.', 'user', p_answer_source,
    p_selected_recommendation_index, v_selected_value, v_current.id, now(),
    v_question.metadata->>'subject_kind', v_question.metadata->>'subject_key',
    CASE WHEN v_question.metadata->>'subject_kind' = 'degraded_evidence'
      THEN (v_question.metadata->>'document_id')::uuid END,
    p_idempotency_key, v_payload_hash, p_actor_user_id
  ) RETURNING * INTO v_decision;
  UPDATE public.clarifying_questions
  SET user_answer = jsonb_build_object('value', p_answer), answer_source = p_answer_source,
      selected_suggestion_index = p_selected_recommendation_index,
      status = 'answered', answered_at = v_decision.decided_at,
      metadata = v_question.metadata || jsonb_build_object('current_decision_id', v_decision.id)
  WHERE id = p_question_id;
  RETURN jsonb_build_object(
    'decision_id', v_decision.id, 'reused', false,
    'snapshot', public.refresh_document_evidence_decision_snapshot(v_question.course_id, v_run.id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.answer_document_evidence_questions_atomic(
  p_course_id UUID,
  p_answers JSONB,
  p_actor_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_answer JSONB;
  v_result JSONB;
  v_question_ids JSONB := '[]'::jsonb;
  v_decision_ids JSONB := '[]'::jsonb;
  v_actor_user_id UUID;
BEGIN
  IF jsonb_typeof(p_answers) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_answers) = 0
     OR jsonb_array_length(p_answers) > 50 THEN
    RAISE EXCEPTION 'Document evidence answers must be a bounded non-empty array'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_answers) answer
    GROUP BY answer->>'question_id' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Document evidence answer batch contains duplicate questions'
      USING ERRCODE = '22023';
  END IF;
  v_actor_user_id := CASE
    WHEN (SELECT auth.role()) = 'service_role' THEN p_actor_user_id
    ELSE (SELECT auth.uid())
  END;
  IF v_actor_user_id IS NULL
     OR ((SELECT auth.role()) IS DISTINCT FROM 'service_role'
       AND p_actor_user_id IS NOT NULL AND p_actor_user_id IS DISTINCT FROM v_actor_user_id) THEN
    RAISE EXCEPTION 'Document evidence answer actor mismatch' USING ERRCODE = '42501';
  END IF;
  FOR v_answer IN SELECT value FROM jsonb_array_elements(p_answers) ORDER BY value->>'question_id' LOOP
    IF jsonb_typeof(v_answer) IS DISTINCT FROM 'object'
       OR (v_answer - ARRAY[
         'question_id', 'answer', 'answer_source', 'selected_suggestion_index',
         'idempotency_key', 'expected_current_decision_id'
       ]) <> '{}'::jsonb THEN
      RAISE EXCEPTION 'Document evidence answer contains unsupported origin fields'
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.clarifying_questions questions
      WHERE questions.id = (v_answer->>'question_id')::uuid
        AND questions.course_id = p_course_id
        AND questions.question_category = 'document_conflicts'
        AND questions.metadata->>'run_id' IS NOT NULL
        AND questions.metadata->>'subject_key' IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Document evidence question/run/subject scope mismatch'
        USING ERRCODE = '23514';
    END IF;
    v_result := public.answer_document_evidence_question_atomic(
      (v_answer->>'question_id')::uuid,
      v_answer->>'answer',
      v_answer->>'answer_source',
      NULLIF(v_answer->>'selected_suggestion_index', '')::integer,
      (v_answer->>'idempotency_key')::uuid,
      NULLIF(v_answer->>'expected_current_decision_id', '')::uuid,
      v_actor_user_id
    );
    v_question_ids := v_question_ids || jsonb_build_array(v_answer->>'question_id');
    v_decision_ids := v_decision_ids || jsonb_build_array(v_result->>'decision_id');
  END LOOP;
  RETURN jsonb_build_object(
    'answered_question_ids',
      (SELECT jsonb_agg(value ORDER BY value) FROM jsonb_array_elements_text(v_question_ids)),
    'decision_ids',
      (SELECT jsonb_agg(value ORDER BY value) FROM jsonb_array_elements_text(v_decision_ids)),
    'reused', false
  );
END;
$$;

-- Retry budget is derived from immutable user decisions; the caller cannot reset it
-- by replaying a question or by changing mutable clarifying-question state.
CREATE OR REPLACE FUNCTION public.get_document_evidence_retry_state(
  p_run_id UUID,
  p_document_id UUID,
  p_configured_max_attempts INTEGER
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run public.document_evidence_runs%ROWTYPE;
  v_attempt INTEGER;
BEGIN
  IF p_configured_max_attempts < 1 OR p_configured_max_attempts > 10 THEN
    RAISE EXCEPTION 'Configured evidence retry bound is invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_run FROM public.document_evidence_runs
  WHERE id = p_run_id AND status = 'accepted';
  IF NOT FOUND OR (
    (SELECT auth.role()) IS DISTINCT FROM 'service_role'
    AND v_run.organization_id IS DISTINCT FROM
      NULLIF((SELECT auth.jwt())->>'organization_id', '')::uuid
  ) THEN
    RAISE EXCEPTION 'Evidence retry state access denied' USING ERRCODE = '42501';
  END IF;
  v_attempt := public.document_evidence_retry_attempt(v_run.course_id, p_document_id);
  RETURN jsonb_build_object(
    'attempt', LEAST(v_attempt, p_configured_max_attempts),
    'max_attempts', p_configured_max_attempts
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_document_evidence_retry_directives(
  p_course_id UUID,
  p_configured_max_attempts INTEGER
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_course public.courses%ROWTYPE;
  v_directives JSONB;
BEGIN
  IF p_configured_max_attempts < 1 OR p_configured_max_attempts > 10 THEN
    RAISE EXCEPTION 'Configured evidence retry bound is invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_course FROM public.courses WHERE id = p_course_id;
  IF NOT FOUND OR (
    (SELECT auth.role()) IS DISTINCT FROM 'service_role'
    AND v_course.organization_id IS DISTINCT FROM
      NULLIF((SELECT auth.jwt())->>'organization_id', '')::uuid
  ) THEN
    RAISE EXCEPTION 'Evidence retry directive access denied' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'decision_id', pending.id,
      'document_id', pending.document_id,
      'attempt', public.document_evidence_retry_attempt(p_course_id, pending.document_id) + 1,
      'max_attempts', p_configured_max_attempts
    ) ORDER BY pending.document_id, pending.id
  ), '[]'::jsonb)
  INTO v_directives
  FROM public.document_evidence_decisions pending
  JOIN public.document_evidence_runs source_run ON source_run.id = pending.run_id
  WHERE source_run.course_id = p_course_id
    AND source_run.status = 'accepted'
    AND pending.subject_kind = 'degraded_evidence'
    AND pending.selected_recommendation_value = 'retry'
    AND NOT EXISTS (
      SELECT 1 FROM public.document_evidence_retry_applications applications
      WHERE applications.decision_id = pending.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.document_evidence_decisions newer
      WHERE newer.supersedes_decision_id = pending.id
    )
    AND public.document_evidence_retry_attempt(p_course_id, pending.document_id)
      < p_configured_max_attempts;
  RETURN v_directives;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_document_evidence_retry_directives(
  p_course_id UUID,
  p_organization_id UUID,
  p_target_run_id UUID,
  p_decision_ids JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_expected UUID[];
  v_received UUID[];
  v_applied UUID[];
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Evidence retry consumption requires service_role' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_decision_ids) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_decision_ids) < 1
     OR jsonb_array_length(p_decision_ids) > 50 THEN
    RAISE EXCEPTION 'Evidence retry decision set is invalid' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.courses
  WHERE id = p_course_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.document_evidence_runs
    WHERE id = p_target_run_id AND course_id = p_course_id
      AND organization_id = p_organization_id AND status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Evidence retry target run is outside scope' USING ERRCODE = '23514';
  END IF;
  SELECT array_agg(value::uuid ORDER BY value::uuid) INTO v_received
  FROM jsonb_array_elements_text(p_decision_ids);
  IF cardinality(v_received) IS DISTINCT FROM cardinality(ARRAY(SELECT DISTINCT unnest(v_received))) THEN
    RAISE EXCEPTION 'Evidence retry decision set contains duplicates' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(decision_id ORDER BY decision_id) INTO v_applied
  FROM public.document_evidence_retry_applications
  WHERE decision_id = ANY(v_received) AND target_run_id = p_target_run_id;
  IF v_applied = v_received THEN
    RETURN jsonb_build_object('decision_ids', to_jsonb(v_received), 'target_run_id', p_target_run_id, 'reused', true);
  END IF;
  PERFORM pending.id
  FROM public.document_evidence_decisions pending
  JOIN public.document_evidence_runs source_run ON source_run.id = pending.run_id
  WHERE source_run.course_id = p_course_id AND source_run.organization_id = p_organization_id
    AND source_run.status = 'accepted'
    AND pending.subject_kind = 'degraded_evidence'
    AND pending.selected_recommendation_value = 'retry'
    AND NOT EXISTS (
      SELECT 1 FROM public.document_evidence_retry_applications applications
      WHERE applications.decision_id = pending.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.document_evidence_decisions newer
      WHERE newer.supersedes_decision_id = pending.id
    )
  FOR UPDATE OF pending;
  SELECT array_agg(pending.id ORDER BY pending.id) INTO v_expected
  FROM public.document_evidence_decisions pending
  JOIN public.document_evidence_runs source_run ON source_run.id = pending.run_id
  WHERE source_run.course_id = p_course_id AND source_run.organization_id = p_organization_id
    AND source_run.status = 'accepted'
    AND pending.subject_kind = 'degraded_evidence'
    AND pending.selected_recommendation_value = 'retry'
    AND NOT EXISTS (
      SELECT 1 FROM public.document_evidence_retry_applications applications
      WHERE applications.decision_id = pending.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.document_evidence_decisions newer
      WHERE newer.supersedes_decision_id = pending.id
    );
  IF v_expected IS NULL OR v_expected IS DISTINCT FROM v_received THEN
    RAISE EXCEPTION 'Evidence retry decision set is stale or incomplete' USING ERRCODE = '40001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.document_evidence_decisions pending
    WHERE pending.id = ANY(v_received)
      AND pending.run_id = p_target_run_id
  ) THEN
    RAISE EXCEPTION 'Evidence retry target must be a distinct accepted run' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.document_evidence_retry_applications(
    decision_id, target_run_id, course_id, organization_id
  )
  SELECT decisions.id, p_target_run_id, p_course_id, p_organization_id
  FROM public.document_evidence_decisions decisions
  WHERE decisions.id = ANY(v_received);
  RETURN jsonb_build_object('decision_ids', to_jsonb(v_received), 'target_run_id', p_target_run_id, 'reused', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_document_evidence_automatic_retry(
  p_run_id UUID,
  p_course_id UUID,
  p_organization_id UUID,
  p_document_id UUID,
  p_configured_max_attempts INTEGER,
  p_idempotency_key UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run public.document_evidence_runs%ROWTYPE;
  v_existing public.document_evidence_decisions%ROWTYPE;
  v_decision public.document_evidence_decisions%ROWTYPE;
  v_attempt INTEGER;
  v_subject_key TEXT;
  v_payload_hash TEXT;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Automatic evidence retry requires service_role' USING ERRCODE = '42501';
  END IF;
  IF p_configured_max_attempts < 1 OR p_configured_max_attempts > 10 THEN
    RAISE EXCEPTION 'Configured evidence retry bound is invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_run FROM public.document_evidence_runs
  WHERE id = p_run_id AND course_id = p_course_id
    AND organization_id = p_organization_id AND status = 'accepted'
  FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.document_evidence_items
    WHERE run_id = p_run_id AND document_id = p_document_id
      AND coverage_status IN ('degraded', 'failed')
  ) THEN
    RAISE EXCEPTION 'Automatic evidence retry is outside accepted degraded coverage'
      USING ERRCODE = '23514';
  END IF;
  v_attempt := public.document_evidence_retry_attempt(p_course_id, p_document_id);
  SELECT * INTO v_existing FROM public.document_evidence_decisions
  WHERE run_id = p_run_id AND idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    v_payload_hash := public.document_evidence_sha256(jsonb_build_object(
      'run_id', p_run_id, 'document_id', p_document_id,
      'attempt', v_attempt + 1, 'max_attempts', p_configured_max_attempts
    )::text);
    IF v_existing.payload_hash IS DISTINCT FROM v_payload_hash
       OR v_existing.document_id IS DISTINCT FROM p_document_id
       OR v_existing.selected_resolution IS DISTINCT FROM 'retry' THEN
      RAISE EXCEPTION 'Automatic retry idempotency key has changed payload'
        USING ERRCODE = '23514';
    END IF;
    RETURN jsonb_build_object(
      'decision_id', v_existing.id, 'document_id', v_existing.document_id,
      'attempt', v_attempt + 1, 'max_attempts', p_configured_max_attempts, 'reused', true
    );
  END IF;
  IF v_attempt >= p_configured_max_attempts THEN
    RAISE EXCEPTION 'Automatic evidence retry budget is exhausted' USING ERRCODE = '23514';
  END IF;
  v_subject_key := public.document_evidence_subject_key(
    p_run_id, 'degraded_evidence', NULL, p_document_id
  );
  v_payload_hash := public.document_evidence_sha256(jsonb_build_object(
    'run_id', p_run_id, 'document_id', p_document_id,
    'attempt', v_attempt + 1, 'max_attempts', p_configured_max_attempts
  )::text);
  INSERT INTO public.document_evidence_decisions(
    run_id,course_id,organization_id,selected_resolution,rationale,resolved_by,answer_source,
    selected_recommendation_value,subject_kind,subject_key,document_id,idempotency_key,payload_hash
  ) VALUES (
    p_run_id,p_course_id,p_organization_id,'retry',
    'Automatic bounded retry before continuing with limited evidence.',
    'system','system','retry','degraded_evidence',v_subject_key,p_document_id,
    p_idempotency_key,v_payload_hash
  ) RETURNING * INTO v_decision;
  RETURN jsonb_build_object(
    'decision_id', v_decision.id, 'document_id', p_document_id,
    'attempt', v_attempt + 1, 'max_attempts', p_configured_max_attempts, 'reused', false
  );
END;
$$;

-- Ordinary automatic answers deliberately exclude document conflicts: those use
-- resolve_document_evidence_question_atomic and create a matching decision event.
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
  WHERE course_id = p_course_id AND status = 'pending'
    AND question_category IS DISTINCT FROM 'document_conflicts';
  FOR v_question IN
    SELECT id, suggested_answers, question_type FROM public.clarifying_questions
    WHERE course_id = p_course_id AND status = 'pending'
      AND question_category IS DISTINCT FROM 'document_conflicts'
    ORDER BY id FOR UPDATE
  LOOP
    v_first_answer := v_question.suggested_answers -> 0 ->> 'text';
    IF v_first_answer IS NULL OR v_first_answer = '' THEN
      v_first_answer := 'Auto-selected by system';
      v_fallback_count := v_fallback_count + 1;
    END IF;
    IF v_question.question_type = 'multi_choice' THEN
      v_user_answer := jsonb_build_object('values', jsonb_build_array(v_first_answer));
    ELSE v_user_answer := jsonb_build_object('value', v_first_answer); END IF;
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

CREATE OR REPLACE FUNCTION public.guard_document_evidence_course_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_run_id UUID;
BEGIN
  IF OLD.generation_status::text = 'stage_4_clarifying'
     AND NEW.generation_status IS DISTINCT FROM OLD.generation_status THEN
    SELECT id INTO v_run_id FROM public.document_evidence_runs
    WHERE course_id = NEW.id AND status = 'accepted'
    ORDER BY completed_at DESC, id DESC LIMIT 1;
    IF v_run_id IS NOT NULL AND EXISTS (
      WITH expected AS (
        SELECT public.document_evidence_subject_key(
          v_run_id, 'claim_conflict', conflicts.id
        ) AS subject_key
        FROM public.document_evidence_conflicts conflicts
        WHERE conflicts.run_id = v_run_id AND conflicts.severity IN ('critical', 'important')
        UNION
        SELECT public.document_evidence_subject_key(
          v_run_id, 'degraded_evidence', NULL, items.document_id
        )
        FROM public.document_evidence_items items
        WHERE items.run_id = v_run_id AND items.coverage_status IN ('degraded', 'failed')
        UNION
        SELECT public.document_evidence_subject_key(
          v_run_id, 'detector_capacity', NULL, NULL,
          checkpoints.structured_checkpoint->'issue'->>'call_plan_hash',
          checkpoints.structured_checkpoint->'issue'->>'config_hash'
        )
        FROM public.document_evidence_conflict_checkpoints checkpoints
        WHERE checkpoints.run_id = v_run_id
          AND checkpoints.structured_checkpoint->>'kind' = 'conflict_capacity_degraded'
      )
      SELECT 1 FROM expected
      WHERE NOT EXISTS (
        SELECT 1 FROM public.clarifying_questions questions
        JOIN public.document_evidence_decisions decisions
          ON decisions.clarifying_question_id = questions.id
         AND decisions.run_id = v_run_id
         AND decisions.subject_key = expected.subject_key
        WHERE questions.course_id = NEW.id
          AND questions.question_category = 'document_conflicts'
          AND questions.status = 'answered'
          AND questions.metadata->>'run_id' = v_run_id::text
          AND questions.metadata->>'subject_key' = expected.subject_key
          AND NOT EXISTS (
            SELECT 1 FROM public.document_evidence_decisions newer
            WHERE newer.supersedes_decision_id = decisions.id
          )
      )
    ) THEN
      RAISE EXCEPTION 'material document evidence subject lacks answered current decision'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_document_evidence_course_transition
  BEFORE UPDATE OF generation_status ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.guard_document_evidence_course_transition();

REVOKE EXECUTE ON FUNCTION public.upsert_document_evidence_conflict(UUID, UUID, UUID, JSONB, TEXT, TEXT)
  FROM authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.append_document_evidence_decision(JSONB)
  FROM authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_document_evidence_conflict_allowlist(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_document_evidence_decision_snapshot(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.document_evidence_retry_attempt(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.document_evidence_subject_key(UUID, TEXT, UUID, UUID, TEXT, TEXT)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_document_evidence_conflict_batch(
  UUID, UUID, UUID, TEXT, TEXT, JSONB, JSONB, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_document_evidence_question_atomic(UUID, UUID, UUID, JSONB)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_document_evidence_question_atomic(UUID, UUID, UUID, JSONB)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.answer_document_evidence_question_atomic(UUID, TEXT, TEXT, INTEGER, UUID, UUID, UUID)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.materialize_document_evidence_decision_gate_atomic(
  UUID, UUID, UUID, TEXT, JSONB, UUID
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.answer_document_evidence_questions_atomic(UUID, JSONB, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_document_evidence_retry_state(UUID, UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_document_evidence_retry_directives(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_document_evidence_retry_directives(UUID, UUID, UUID, JSONB)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_document_evidence_automatic_retry(
  UUID, UUID, UUID, UUID, INTEGER, UUID
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.commit_document_evidence_conflict_batch(
  UUID, UUID, UUID, TEXT, TEXT, JSONB, JSONB, TEXT, TEXT, TEXT, JSONB
) TO service_role;
GRANT EXECUTE ON FUNCTION public.materialize_document_evidence_decision_gate_atomic(
  UUID, UUID, UUID, TEXT, JSONB, UUID
) TO service_role;
GRANT EXECUTE ON FUNCTION public.answer_document_evidence_questions_atomic(UUID, JSONB, UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_document_evidence_retry_state(UUID, UUID, INTEGER)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_document_evidence_retry_directives(UUID, INTEGER)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_document_evidence_retry_directives(UUID, UUID, UUID, JSONB)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_document_evidence_automatic_retry(
  UUID, UUID, UUID, UUID, INTEGER, UUID
) TO service_role;

COMMENT ON FUNCTION public.commit_document_evidence_conflict_batch(
  UUID, UUID, UUID, TEXT, TEXT, JSONB, JSONB, TEXT, TEXT, TEXT, JSONB
) IS 'Atomically persists an accepted-run conflict checkpoint and allowlisted immutable conflicts.';
