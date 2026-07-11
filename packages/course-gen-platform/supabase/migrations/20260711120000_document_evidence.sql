-- Durable advisory document evidence for Stage 4.
-- Full evidence remains in these tenant-scoped tables; courses.analysis_result
-- stores only a compact accepted-run snapshot.

CREATE TABLE public.document_evidence_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  input_fingerprint TEXT NOT NULL CHECK (btrim(input_fingerprint) <> ''),
  evidence_version TEXT NOT NULL CHECK (btrim(evidence_version) <> ''),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'accepted', 'failed')),
  source_count INTEGER NOT NULL DEFAULT 0 CHECK (source_count >= 0),
  assessed_count INTEGER NOT NULL DEFAULT 0 CHECK (assessed_count >= 0),
  degraded_count INTEGER NOT NULL DEFAULT 0 CHECK (degraded_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  batch_count INTEGER NOT NULL DEFAULT 0 CHECK (batch_count >= 0),
  model_calls INTEGER NOT NULL DEFAULT 0 CHECK (model_calls >= 0),
  input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  total_cost_usd NUMERIC(14, 6) NOT NULL DEFAULT 0 CHECK (total_cost_usd >= 0),
  conflict_summary JSONB NOT NULL DEFAULT '{"critical":0,"important":0,"informational":0}'::jsonb,
  decision_summary JSONB NOT NULL DEFAULT '{"user":0,"system":0,"unresolved":0}'::jsonb,
  error_category TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT document_evidence_runs_identity_unique
    UNIQUE (course_id, input_fingerprint, evidence_version),
  CONSTRAINT document_evidence_runs_coverage_bounds CHECK (
    assessed_count + degraded_count + failed_count <= source_count
  ),
  CONSTRAINT document_evidence_runs_accepted_coverage CHECK (
    status <> 'accepted'
    OR assessed_count + degraded_count + failed_count = source_count
  ),
  CONSTRAINT document_evidence_runs_completion CHECK (
    (status IN ('accepted', 'failed') AND completed_at IS NOT NULL)
    OR (status IN ('pending', 'processing') AND completed_at IS NULL)
  )
);

CREATE TABLE public.document_evidence_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.document_evidence_runs(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.file_catalog(id) ON DELETE CASCADE,
  source_version_hash TEXT NOT NULL CHECK (btrim(source_version_hash) <> ''),
  document_name TEXT NOT NULL CHECK (btrim(document_name) <> ''),
  priority TEXT NOT NULL CHECK (priority IN ('CORE', 'IMPORTANT', 'SUPPLEMENTARY')),
  authority_scope TEXT NOT NULL CHECK (
    authority_scope IN ('organization_specific', 'course_source', 'general_reference', 'unknown')
  ),
  content_quality DOUBLE PRECISION NOT NULL CHECK (content_quality BETWEEN 0 AND 1),
  course_relevance DOUBLE PRECISION NOT NULL CHECK (course_relevance BETWEEN 0 AND 1),
  processing_mode TEXT NOT NULL CHECK (
    processing_mode IN (
      'full_text', 'hierarchical_summary', 'summary', 'targeted_retrieval', 'metadata_only'
    )
  ),
  summary TEXT NOT NULL CHECK (btrim(summary) <> ''),
  claims JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(claims) = 'array'),
  terminology JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(terminology) = 'array'),
  constraints JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(constraints) = 'array'),
  limitations JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(limitations) = 'array'),
  coverage_status TEXT NOT NULL CHECK (coverage_status IN ('assessed', 'degraded', 'failed')),
  coverage_reason TEXT NOT NULL CHECK (btrim(coverage_reason) <> ''),
  original_tokens INTEGER NOT NULL CHECK (original_tokens >= 0),
  summary_tokens INTEGER NOT NULL CHECK (summary_tokens >= 0),
  allocated_tokens INTEGER NOT NULL CHECK (allocated_tokens >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT document_evidence_items_run_document_unique UNIQUE (run_id, document_id)
);

CREATE TABLE public.document_evidence_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.document_evidence_runs(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conflict_fingerprint TEXT NOT NULL CHECK (btrim(conflict_fingerprint) <> ''),
  topic TEXT NOT NULL CHECK (btrim(topic) <> ''),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'important', 'informational')),
  sides JSONB NOT NULL CHECK (jsonb_typeof(sides) = 'array' AND jsonb_array_length(sides) >= 2),
  claim_ids JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(claim_ids) = 'array'),
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_refs) = 'array'),
  course_impact TEXT NOT NULL CHECK (btrim(course_impact) <> ''),
  recommended_resolution TEXT NOT NULL CHECK (btrim(recommended_resolution) <> ''),
  recommendation_rationale TEXT NOT NULL CHECK (btrim(recommendation_rationale) <> ''),
  alternatives JSONB NOT NULL CHECK (
    jsonb_typeof(alternatives) = 'array' AND jsonb_array_length(alternatives) >= 1
  ),
  detection_model TEXT NOT NULL CHECK (btrim(detection_model) <> ''),
  detection_version TEXT NOT NULL CHECK (btrim(detection_version) <> ''),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT document_evidence_conflicts_run_fingerprint_unique
    UNIQUE (run_id, conflict_fingerprint)
);

CREATE TABLE public.document_evidence_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.document_evidence_runs(id) ON DELETE CASCADE,
  conflict_id UUID NOT NULL REFERENCES public.document_evidence_conflicts(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  clarifying_question_id UUID REFERENCES public.clarifying_questions(id) ON DELETE SET NULL,
  selected_resolution TEXT NOT NULL CHECK (btrim(selected_resolution) <> ''),
  rationale TEXT NOT NULL CHECK (btrim(rationale) <> ''),
  resolved_by TEXT NOT NULL CHECK (resolved_by IN ('user', 'system')),
  answer_source TEXT NOT NULL CHECK (answer_source IN ('suggested', 'modified', 'custom', 'system')),
  selected_recommendation_index INTEGER CHECK (selected_recommendation_index >= 0),
  selected_recommendation_value TEXT,
  supersedes_decision_id UUID REFERENCES public.document_evidence_decisions(id) ON DELETE RESTRICT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT document_evidence_decisions_supersedes_unique UNIQUE (supersedes_decision_id),
  CONSTRAINT document_evidence_decisions_not_self_superseding
    CHECK (supersedes_decision_id IS NULL OR supersedes_decision_id <> id),
  CONSTRAINT document_evidence_decisions_system_source CHECK (
    resolved_by <> 'system' OR answer_source = 'system'
  )
);

CREATE UNIQUE INDEX document_evidence_decisions_one_chain_root
  ON public.document_evidence_decisions(conflict_id)
  WHERE supersedes_decision_id IS NULL;

CREATE INDEX document_evidence_runs_course_status_idx
  ON public.document_evidence_runs(course_id, status, created_at DESC);
CREATE INDEX document_evidence_runs_organization_idx
  ON public.document_evidence_runs(organization_id, created_at DESC);
CREATE INDEX document_evidence_items_course_idx
  ON public.document_evidence_items(course_id, document_id);
CREATE INDEX document_evidence_conflicts_course_severity_idx
  ON public.document_evidence_conflicts(course_id, severity, detected_at DESC);
CREATE INDEX document_evidence_decisions_run_decided_idx
  ON public.document_evidence_decisions(run_id, decided_at DESC);

CREATE OR REPLACE FUNCTION public.set_document_evidence_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_document_evidence_runs_updated_at
  BEFORE UPDATE ON public.document_evidence_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_document_evidence_updated_at();

CREATE TRIGGER set_document_evidence_items_updated_at
  BEFORE UPDATE ON public.document_evidence_items
  FOR EACH ROW EXECUTE FUNCTION public.set_document_evidence_updated_at();

CREATE OR REPLACE FUNCTION public.validate_document_evidence_run_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = NEW.course_id
      AND courses.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Document evidence run tenant does not match course'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_document_evidence_run_tenant
  BEFORE INSERT OR UPDATE ON public.document_evidence_runs
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_evidence_run_tenant();

CREATE OR REPLACE FUNCTION public.validate_document_evidence_item_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.document_evidence_runs runs
    JOIN public.file_catalog files ON files.id = NEW.document_id
    WHERE runs.id = NEW.run_id
      AND runs.course_id = NEW.course_id
      AND runs.organization_id = NEW.organization_id
      AND files.course_id = NEW.course_id
      AND files.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Document evidence item scope mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_document_evidence_item_scope
  BEFORE INSERT OR UPDATE ON public.document_evidence_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_evidence_item_scope();

CREATE OR REPLACE FUNCTION public.validate_document_evidence_conflict_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.document_evidence_runs runs
    WHERE runs.id = NEW.run_id
      AND runs.course_id = NEW.course_id
      AND runs.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Document evidence conflict scope mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_document_evidence_conflict_scope
  BEFORE INSERT ON public.document_evidence_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_evidence_conflict_scope();

CREATE OR REPLACE FUNCTION public.validate_document_evidence_decision_chain()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_course_id UUID;
  v_organization_id UUID;
  v_prior_run_id UUID;
  v_prior_conflict_id UUID;
BEGIN
  SELECT conflicts.course_id, conflicts.organization_id
    INTO v_course_id, v_organization_id
  FROM public.document_evidence_conflicts conflicts
  WHERE conflicts.id = NEW.conflict_id
    AND conflicts.run_id = NEW.run_id;

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

CREATE TRIGGER validate_document_evidence_decision_chain
  BEFORE INSERT ON public.document_evidence_decisions
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_evidence_decision_chain();

CREATE OR REPLACE FUNCTION public.reject_document_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Permit referential-action cascades while rejecting direct row mutation.
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% rows are immutable and append-only', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER prevent_document_evidence_conflicts_mutation
  BEFORE UPDATE OR DELETE ON public.document_evidence_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.reject_document_evidence_mutation();

CREATE TRIGGER prevent_document_evidence_decisions_mutation
  BEFORE UPDATE OR DELETE ON public.document_evidence_decisions
  FOR EACH ROW EXECUTE FUNCTION public.reject_document_evidence_mutation();

-- Atomic replacement/checkpoint of the complete coverage ledger. PostgreSQL
-- functions execute in the caller transaction, so item rows and run counts
-- cannot diverge.
CREATE OR REPLACE FUNCTION public.persist_document_evidence_items(
  p_run_id UUID,
  p_course_id UUID,
  p_organization_id UUID,
  p_items JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_count INTEGER;
  v_item_count INTEGER;
  v_assessed_count INTEGER;
  v_degraded_count INTEGER;
  v_failed_count INTEGER;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Evidence items must be a JSON array' USING ERRCODE = '22023';
  END IF;

  SELECT runs.source_count INTO v_source_count
  FROM public.document_evidence_runs runs
  WHERE runs.id = p_run_id
    AND runs.course_id = p_course_id
    AND runs.organization_id = p_organization_id
  FOR UPDATE;

  IF v_source_count IS NULL THEN
    RAISE EXCEPTION 'Evidence run scope mismatch' USING ERRCODE = '23514';
  END IF;

  IF (SELECT auth.role()) <> 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.courses
       WHERE courses.id = p_course_id
         AND courses.organization_id = ((SELECT auth.jwt())->>'organization_id')::uuid
     ) THEN
    RAISE EXCEPTION 'Evidence run access denied' USING ERRCODE = '42501';
  END IF;

  SELECT count(*), count(DISTINCT item->>'document_id')
    INTO v_item_count, v_assessed_count
  FROM jsonb_array_elements(p_items) item;

  IF v_item_count <> v_source_count OR v_item_count <> v_assessed_count THEN
    RAISE EXCEPTION 'Evidence coverage must contain every source document exactly once'
      USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.document_evidence_items WHERE run_id = p_run_id;

  INSERT INTO public.document_evidence_items (
    run_id, course_id, organization_id, document_id, source_version_hash,
    document_name, priority, authority_scope, content_quality, course_relevance,
    processing_mode, summary, claims, terminology, constraints, limitations,
    coverage_status, coverage_reason, original_tokens, summary_tokens, allocated_tokens
  )
  SELECT
    p_run_id,
    p_course_id,
    p_organization_id,
    (item->>'document_id')::uuid,
    files.hash,
    item->>'document_name',
    item->>'priority',
    item->>'authority_scope',
    (item->>'content_quality')::double precision,
    (item->>'course_relevance')::double precision,
    item->>'processing_mode',
    item->>'summary',
    COALESCE(item->'key_claims', '[]'::jsonb),
    COALESCE(item->'terminology', '[]'::jsonb),
    COALESCE(item->'constraints', '[]'::jsonb),
    COALESCE(item->'limitations', '[]'::jsonb),
    item->>'coverage_status',
    item->>'coverage_reason',
    (item->'token_counts'->>'original')::integer,
    (item->'token_counts'->>'summary')::integer,
    (item->'token_counts'->>'allocated')::integer
  FROM jsonb_array_elements(p_items) item
  JOIN public.file_catalog files
    ON files.id = (item->>'document_id')::uuid
   AND files.course_id = p_course_id
   AND files.organization_id = p_organization_id;

  IF (SELECT count(*) FROM public.document_evidence_items WHERE run_id = p_run_id)
     <> v_source_count THEN
    RAISE EXCEPTION 'Evidence item/source mismatch after persistence' USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*) FILTER (WHERE coverage_status = 'assessed'),
    count(*) FILTER (WHERE coverage_status = 'degraded'),
    count(*) FILTER (WHERE coverage_status = 'failed')
  INTO v_assessed_count, v_degraded_count, v_failed_count
  FROM public.document_evidence_items
  WHERE run_id = p_run_id;

  UPDATE public.document_evidence_runs
  SET assessed_count = v_assessed_count,
      degraded_count = v_degraded_count,
      failed_count = v_failed_count
  WHERE id = p_run_id;

  RETURN jsonb_build_object(
    'source_count', v_source_count,
    'assessed_count', v_assessed_count,
    'degraded_count', v_degraded_count,
    'failed_count', v_failed_count
  );
END;
$$;

-- Keep automatic clarifying answers distinguishable from user selections.
CREATE OR REPLACE FUNCTION public.auto_answer_questions_atomic(p_course_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_question RECORD;
  v_updated_count INTEGER := 0;
  v_fallback_count INTEGER := 0;
  v_total_count INTEGER := 0;
  v_first_answer TEXT;
  v_user_answer JSONB;
  v_answered_at TIMESTAMPTZ := now();
BEGIN
  IF (SELECT auth.role()) <> 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.courses
       WHERE courses.id = p_course_id
         AND courses.organization_id = ((SELECT auth.jwt())->>'organization_id')::uuid
     ) THEN
    RAISE EXCEPTION 'Clarifying question access denied' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_total_count
  FROM public.clarifying_questions
  WHERE course_id = p_course_id AND status = 'pending';

  FOR v_question IN
    SELECT id, suggested_answers, question_type
    FROM public.clarifying_questions
    WHERE course_id = p_course_id AND status = 'pending'
    FOR UPDATE
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

    UPDATE public.clarifying_questions
    SET user_answer = v_user_answer,
        answer_source = 'system',
        selected_suggestion_index = 0,
        status = 'answered',
        answered_at = v_answered_at
    WHERE id = v_question.id;
    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_updated_count,
    'fallback_count', v_fallback_count,
    'total_pending', v_total_count,
    'answered_at', v_answered_at
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Automatic answer transaction failed',
      'code', SQLSTATE,
      'updated_count', 0,
      'total_pending', v_total_count
    );
END;
$$;

ALTER TABLE public.document_evidence_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_evidence_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_evidence_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY runs_tenant_select ON public.document_evidence_runs
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.courses
      WHERE courses.id = document_evidence_runs.course_id
        AND courses.organization_id = ((SELECT auth.jwt())->>'organization_id')::uuid)
  );
CREATE POLICY runs_tenant_insert ON public.document_evidence_runs
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.courses
      WHERE courses.id = document_evidence_runs.course_id
        AND courses.organization_id = ((SELECT auth.jwt())->>'organization_id')::uuid
        AND document_evidence_runs.organization_id = courses.organization_id)
  );
CREATE POLICY runs_tenant_update ON public.document_evidence_runs
  FOR UPDATE TO authenticated
  USING (organization_id = ((SELECT auth.jwt())->>'organization_id')::uuid)
  WITH CHECK (organization_id = ((SELECT auth.jwt())->>'organization_id')::uuid);

CREATE POLICY items_tenant_select ON public.document_evidence_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.courses
      WHERE courses.id = document_evidence_items.course_id
        AND courses.organization_id = ((SELECT auth.jwt())->>'organization_id')::uuid)
  );
CREATE POLICY items_tenant_insert ON public.document_evidence_items
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.courses
      WHERE courses.id = document_evidence_items.course_id
        AND courses.organization_id = ((SELECT auth.jwt())->>'organization_id')::uuid
        AND document_evidence_items.organization_id = courses.organization_id)
  );
CREATE POLICY items_tenant_update ON public.document_evidence_items
  FOR UPDATE TO authenticated
  USING (organization_id = ((SELECT auth.jwt())->>'organization_id')::uuid)
  WITH CHECK (organization_id = ((SELECT auth.jwt())->>'organization_id')::uuid);

CREATE POLICY conflicts_tenant_select ON public.document_evidence_conflicts
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.courses
      WHERE courses.id = document_evidence_conflicts.course_id
        AND courses.organization_id = ((SELECT auth.jwt())->>'organization_id')::uuid)
  );
CREATE POLICY conflicts_tenant_insert ON public.document_evidence_conflicts
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.courses
      WHERE courses.id = document_evidence_conflicts.course_id
        AND courses.organization_id = ((SELECT auth.jwt())->>'organization_id')::uuid
        AND document_evidence_conflicts.organization_id = courses.organization_id)
  );

CREATE POLICY decisions_tenant_select ON public.document_evidence_decisions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.courses
      WHERE courses.id = document_evidence_decisions.course_id
        AND courses.organization_id = ((SELECT auth.jwt())->>'organization_id')::uuid)
  );
CREATE POLICY decisions_tenant_insert ON public.document_evidence_decisions
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.courses
      WHERE courses.id = document_evidence_decisions.course_id
        AND courses.organization_id = ((SELECT auth.jwt())->>'organization_id')::uuid
        AND document_evidence_decisions.organization_id = courses.organization_id)
  );

GRANT SELECT, INSERT, UPDATE ON public.document_evidence_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.document_evidence_items TO authenticated;
GRANT SELECT, INSERT ON public.document_evidence_conflicts TO authenticated;
GRANT SELECT, INSERT ON public.document_evidence_decisions TO authenticated;
GRANT EXECUTE ON FUNCTION public.persist_document_evidence_items(UUID, UUID, UUID, JSONB)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auto_answer_questions_atomic(UUID)
  TO authenticated, service_role;

GRANT ALL ON public.document_evidence_runs TO service_role;
GRANT ALL ON public.document_evidence_items TO service_role;
GRANT ALL ON public.document_evidence_conflicts TO service_role;
GRANT ALL ON public.document_evidence_decisions TO service_role;

COMMENT ON TABLE public.document_evidence_conflicts IS
  'Immutable detected document conflicts; direct UPDATE and DELETE are rejected.';
COMMENT ON TABLE public.document_evidence_decisions IS
  'Append-only conflict resolution events; current state is the unsuperseded chain event.';
COMMENT ON FUNCTION public.persist_document_evidence_items(UUID, UUID, UUID, JSONB) IS
  'Atomically persists exactly one evidence item per source document and synchronizes run counts.';
