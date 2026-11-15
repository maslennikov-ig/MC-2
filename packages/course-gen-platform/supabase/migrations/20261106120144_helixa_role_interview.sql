-- mc2-agpo8 / helixa-2-lab-f0pdy. Internal paid interview ledger; activation stays disabled.
BEGIN;
CREATE TABLE public.helixa_role_interview_rounds (
  binding_id TEXT NOT NULL REFERENCES public.helixa_knowledge_sync_bindings(binding_id) ON DELETE CASCADE,
  interview_id TEXT NOT NULL CHECK (length(interview_id) BETWEEN 1 AND 300),
  revision BIGINT NOT NULL CHECK (revision > 0 AND revision <= 9007199254740991),
  round SMALLINT NOT NULL CHECK (round IN (1, 2)),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  service_principal_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  request_payload JSONB NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  rendered_prompt TEXT NOT NULL,
  prompt_hash TEXT NOT NULL CHECK (prompt_hash ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','uncertain','action_required')),
  claim_token UUID NOT NULL DEFAULT gen_random_uuid(),
  response_body TEXT,
  cost_records JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(cost_records) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stale_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 minutes',
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (binding_id, interview_id, revision, round),
  CHECK ((status = 'completed') = (response_body IS NOT NULL))
);
CREATE INDEX helixa_role_interview_org ON public.helixa_role_interview_rounds(organization_id);
CREATE INDEX helixa_role_interview_principal ON public.helixa_role_interview_rounds(service_principal_user_id);
ALTER TABLE public.helixa_role_interview_rounds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.helixa_role_interview_rounds FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.helixa_role_interview_rounds TO service_role;

CREATE FUNCTION public.assert_helixa_role_interview_binding(p_binding_id TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, extensions AS $$
DECLARE b RECORD;
BEGIN
  SELECT * INTO b FROM public.resolve_helixa_generation_binding(p_binding_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'INTERVIEW_BINDING_DENIED'; END IF;
  IF NOT b.job_instruction_creation_enabled OR NOT b.principal_exists_in_auth
    OR NOT b.principal_exists_in_public OR b.principal_organization_id IS DISTINCT FROM b.organization_id
    OR b.principal_role NOT IN ('owner','admin','instructor') OR b.principal_kind <> 'service_principal'
    OR b.interactive_login_allowed THEN RAISE EXCEPTION 'INTERVIEW_BINDING_DENIED'; END IF;
  RETURN b.organization_id;
END; $$;

CREATE FUNCTION public.read_helixa_role_interview_round(
  p_binding_id TEXT, p_interview_id TEXT, p_revision BIGINT, p_round INTEGER
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, extensions AS $$
DECLARE r public.helixa_role_interview_rounds%ROWTYPE;
DECLARE org UUID;
BEGIN
  org := public.assert_helixa_role_interview_binding(p_binding_id);
  UPDATE public.helixa_role_interview_rounds SET status = 'uncertain'
    WHERE binding_id=p_binding_id AND interview_id=p_interview_id AND revision=p_revision AND round=p_round AND organization_id=org
      AND status='in_progress' AND stale_at <= now();
  SELECT * INTO r FROM public.helixa_role_interview_rounds
    WHERE binding_id=p_binding_id AND interview_id=p_interview_id AND revision=p_revision AND round=p_round AND organization_id=org;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(r);
END; $$;

CREATE FUNCTION public.claim_helixa_role_interview_round(
  p_binding_id TEXT, p_interview_id TEXT, p_revision BIGINT, p_round INTEGER,
  p_request_hash TEXT, p_request_payload JSONB, p_rendered_prompt TEXT, p_prompt_hash TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, extensions AS $$
DECLARE r public.helixa_role_interview_rounds%ROWTYPE;
DECLARE previous public.helixa_role_interview_rounds%ROWTYPE;
DECLARE org UUID;
DECLARE principal UUID;
BEGIN
  org := public.assert_helixa_role_interview_binding(p_binding_id);
  SELECT service_principal_user_id INTO principal FROM public.resolve_helixa_generation_binding(p_binding_id);
  IF p_request_payload->'binding'->>'bindingId' IS DISTINCT FROM p_binding_id
    OR p_request_payload->>'interviewId' IS DISTINCT FROM p_interview_id
    OR (p_request_payload->>'revision')::BIGINT IS DISTINCT FROM p_revision
    OR (p_request_payload->>'round')::INTEGER IS DISTINCT FROM p_round
    THEN RAISE EXCEPTION 'INTERVIEW_CONFLICT'; END IF;
  IF p_round=2 THEN
    SELECT * INTO previous FROM public.helixa_role_interview_rounds
      WHERE binding_id=p_binding_id AND interview_id=p_interview_id AND revision=p_revision AND round=1 FOR UPDATE;
    IF NOT FOUND OR previous.status <> 'completed'
      OR previous.response_body::JSONB->>'resultHash' IS DISTINCT FROM p_request_payload->>'previousResultHash'
      OR previous.response_body::JSONB->'result'->>'readyToGenerate' = 'true'
      OR previous.request_payload->'fixedAnswers' IS DISTINCT FROM p_request_payload->'fixedAnswers'
      OR previous.request_payload->'context' IS DISTINCT FROM p_request_payload->'context'
      OR previous.request_payload->'contentLanguage' IS DISTINCT FROM p_request_payload->'contentLanguage'
      OR previous.request_payload->'methodologyHash' IS DISTINCT FROM p_request_payload->'methodologyHash'
      THEN RAISE EXCEPTION 'INTERVIEW_PREVIOUS'; END IF;
  END IF;
  INSERT INTO public.helixa_role_interview_rounds(
    binding_id,interview_id,revision,round,organization_id,service_principal_user_id,
    request_hash,request_payload,rendered_prompt,prompt_hash)
    VALUES(p_binding_id,p_interview_id,p_revision,p_round,org,principal,
      p_request_hash,p_request_payload,p_rendered_prompt,p_prompt_hash)
    ON CONFLICT DO NOTHING RETURNING * INTO r;
  IF FOUND THEN RETURN jsonb_build_object('owner',true,'row',to_jsonb(r)); END IF;
  SELECT * INTO r FROM public.helixa_role_interview_rounds
    WHERE binding_id=p_binding_id AND interview_id=p_interview_id AND revision=p_revision AND round=p_round FOR UPDATE;
  IF r.organization_id IS DISTINCT FROM org THEN RAISE EXCEPTION 'INTERVIEW_BINDING_DENIED'; END IF;
  IF r.request_hash <> p_request_hash OR r.request_payload <> p_request_payload
    THEN RAISE EXCEPTION 'INTERVIEW_CONFLICT'; END IF;
  -- Never reclaim a paid operation. Expired in-progress work becomes uncertain.
  IF r.status='in_progress' AND r.stale_at <= now() THEN
    UPDATE public.helixa_role_interview_rounds SET status='uncertain'
      WHERE binding_id=p_binding_id AND interview_id=p_interview_id AND revision=p_revision AND round=p_round
      RETURNING * INTO r;
  END IF;
  RETURN jsonb_build_object('owner',false,'row',to_jsonb(r));
END; $$;

CREATE FUNCTION public.finish_helixa_role_interview_round(
  p_binding_id TEXT,p_interview_id TEXT,p_revision BIGINT,p_round INTEGER,
  p_claim_token UUID,p_response_body TEXT,p_cost_records JSONB
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, extensions AS $$
DECLARE changed INTEGER;
DECLARE org UUID;
DECLARE prior_count INTEGER := 0;
BEGIN
  org := public.assert_helixa_role_interview_binding(p_binding_id);
  IF p_round=2 THEN
    SELECT jsonb_array_length(response_body::JSONB->'result'->'questions') INTO prior_count
      FROM public.helixa_role_interview_rounds
      WHERE binding_id=p_binding_id AND interview_id=p_interview_id AND revision=p_revision AND round=1;
  END IF;
  IF jsonb_array_length(p_response_body::JSONB->'result'->'questions') + prior_count > 7
    THEN RAISE EXCEPTION 'INTERVIEW_QUESTION_LIMIT'; END IF;
  UPDATE public.helixa_role_interview_rounds SET status='completed',response_body=p_response_body,
    cost_records=p_cost_records,completed_at=now()
    WHERE binding_id=p_binding_id AND interview_id=p_interview_id AND revision=p_revision AND round=p_round
      AND organization_id=org AND claim_token=p_claim_token AND status IN ('in_progress','uncertain');
  GET DIAGNOSTICS changed = ROW_COUNT; RETURN changed=1;
END; $$;
CREATE FUNCTION public.uncertain_helixa_role_interview_round(
  p_binding_id TEXT,p_interview_id TEXT,p_revision BIGINT,p_round INTEGER,p_claim_token UUID,p_cost_records JSONB
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, extensions AS $$
DECLARE changed INTEGER;
DECLARE org UUID;
BEGIN
  org := public.assert_helixa_role_interview_binding(p_binding_id);
  UPDATE public.helixa_role_interview_rounds SET status='uncertain', cost_records=p_cost_records
    WHERE binding_id=p_binding_id AND interview_id=p_interview_id AND revision=p_revision AND round=p_round
      AND organization_id=org AND claim_token=p_claim_token AND status IN ('in_progress','uncertain');
  GET DIAGNOSTICS changed = ROW_COUNT; RETURN changed=1;
END; $$;
REVOKE ALL ON FUNCTION public.assert_helixa_role_interview_binding(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_helixa_role_interview_round(TEXT,TEXT,BIGINT,INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_helixa_role_interview_round(TEXT,TEXT,BIGINT,INTEGER,TEXT,JSONB,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_helixa_role_interview_round(TEXT,TEXT,BIGINT,INTEGER,UUID,TEXT,JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.uncertain_helixa_role_interview_round(TEXT,TEXT,BIGINT,INTEGER,UUID,JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_helixa_role_interview_binding(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_helixa_role_interview_round(TEXT,TEXT,BIGINT,INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_helixa_role_interview_round(TEXT,TEXT,BIGINT,INTEGER,TEXT,JSONB,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_helixa_role_interview_round(TEXT,TEXT,BIGINT,INTEGER,UUID,TEXT,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.uncertain_helixa_role_interview_round(TEXT,TEXT,BIGINT,INTEGER,UUID,JSONB) TO service_role;
COMMIT;
