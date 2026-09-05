BEGIN;

ALTER TABLE helixa_generation_commands
  ADD COLUMN observation_generation INTEGER NOT NULL DEFAULT 0 CHECK (observation_generation >= 0),
  ADD COLUMN observation_lease_token UUID,
  ADD COLUMN observation_lease_expires_at TIMESTAMPTZ,
  ADD CHECK ((observation_lease_token IS NULL) = (observation_lease_expires_at IS NULL));

CREATE OR REPLACE FUNCTION helixa_role_guide_content_v1(
  p_final_markdown TEXT, p_role_profile_spec JSONB, p_generated_blocks JSONB
) RETURNS JSONB LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'summaryMarkdown', p_final_markdown,
    'structure', jsonb_build_object('roleProfileSpec', COALESCE(p_role_profile_spec, '{}'::jsonb)),
    'blocks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', item.key, 'value', item.value)
        ORDER BY convert_to(item.key, 'UTF8'))
      FROM jsonb_each(COALESCE(p_generated_blocks, '{}'::jsonb)) item
    ), '[]'::jsonb),
    'lessons', '[]'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION capture_helixa_role_guide_generation_proof()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE command helixa_generation_commands%ROWTYPE;
DECLARE source_version TEXT;
DECLARE content_hash TEXT;
BEGIN
  IF NEW.status = 'completed' AND NEW.completed_at IS NOT NULL THEN
    SELECT * INTO command FROM helixa_generation_commands c
    WHERE c.organization_id = NEW.organization_id AND c.object_kind = 'ROLE_GUIDE'
      AND c.object_id = NEW.id AND c.command_kind = 'CREATE_JOB_INSTRUCTION';
    IF FOUND THEN
      source_version := to_char(NEW.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
      content_hash := encode(digest(convert_to(helixa_canonical_json_v1(
        helixa_role_guide_content_v1(NEW.final_markdown, NEW.role_profile_spec, NEW.generated_blocks)
      ), 'UTF8'), 'sha256'), 'hex');
      INSERT INTO role_guide_generation_proofs(playbook_id, organization_id, source_version, content_hash, origin_binding_id, origin_command_id)
      VALUES (NEW.id, NEW.organization_id, source_version, content_hash, command.binding_id, command.command_id)
      ON CONFLICT (playbook_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mark_helixa_generation_native_completed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'career_playbooks' THEN
    IF NEW.status = 'completed' AND NEW.completed_at IS NOT NULL THEN
      UPDATE helixa_generation_commands SET status = 'native_completed', native_completed_at = NEW.completed_at,
        lease_token = NULL, lease_expires_at = NULL, observation_lease_token = NULL,
        observation_lease_expires_at = NULL, safe_error_code = NULL, updated_at = NOW()
      WHERE organization_id = NEW.organization_id AND object_kind = 'ROLE_GUIDE' AND object_id = NEW.id
        AND status IN ('scheduled', 'executing');
    END IF;
  ELSE
    IF NEW.generation_status = 'completed' AND NEW.generation_completed_at IS NOT NULL THEN
      UPDATE helixa_generation_commands SET status = 'native_completed', native_completed_at = NEW.generation_completed_at,
        lease_token = NULL, lease_expires_at = NULL, observation_lease_token = NULL,
        observation_lease_expires_at = NULL, safe_error_code = NULL, updated_at = NOW()
      WHERE organization_id = NEW.organization_id AND object_kind = 'COURSE' AND object_id = NEW.id
        AND status IN ('scheduled', 'executing');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION schedule_helixa_course_from_role_guide(
  p_binding_id TEXT, p_command_id TEXT, p_course_id UUID, p_organization_id UUID,
  p_user_id UUID, p_course JSONB, p_source_job_instruction JSONB,
  p_lease_token UUID, p_claim_generation INTEGER
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE command helixa_generation_commands%ROWTYPE;
DECLARE guide career_playbooks%ROWTYPE;
DECLARE current_source_version TEXT;
DECLARE current_content_hash TEXT;
BEGIN
  SELECT * INTO command FROM helixa_generation_commands c
  WHERE c.binding_id = p_binding_id AND c.command_id = p_command_id
    AND c.command_kind = 'CREATE_COURSE_FROM_JOB_INSTRUCTION'
    AND c.object_kind = 'COURSE' AND c.object_id = p_course_id
    AND c.organization_id = p_organization_id
    AND c.lease_token = p_lease_token AND c.claim_generation = p_claim_generation
    AND c.status IN ('reserved', 'executing') AND c.lease_expires_at > NOW()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GENERATION_COMMAND_FENCE_LOST'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM helixa_knowledge_sync_bindings binding
    JOIN auth.users principal ON principal.id = binding.generation_service_principal_user_id
    JOIN users public_user ON public_user.id = principal.id AND public_user.organization_id = binding.organization_id
    JOIN organization_members membership ON membership.user_id = principal.id
      AND membership.organization_id = binding.organization_id
      AND membership.role::TEXT IN ('owner', 'admin', 'instructor')
    WHERE binding.binding_id = p_binding_id AND binding.organization_id = p_organization_id
      AND binding.enabled AND binding.course_from_job_instruction_creation_enabled
      AND binding.generation_service_principal_user_id = p_user_id
      AND COALESCE(principal.raw_app_meta_data->>'kind', '') = 'service_principal'
      AND NOT COALESCE((principal.raw_app_meta_data->>'interactive_login_allowed')::BOOLEAN, true)
  ) THEN RAISE EXCEPTION 'GENERATION_SERVICE_PRINCIPAL_INVALID'; END IF;
  IF command.command_payload->'sourceJobInstruction' <> p_source_job_instruction
    OR command.command_payload->'course' <> p_course
  THEN RAISE EXCEPTION 'GENERATION_COMMAND_PAYLOAD_MISMATCH'; END IF;

  SELECT * INTO guide FROM career_playbooks p
  WHERE p.id = (p_source_job_instruction->>'id')::UUID
    AND p.organization_id = p_organization_id AND p.status = 'completed' AND p.completed_at IS NOT NULL
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROLE_GUIDE_SOURCE_UNAVAILABLE'; END IF;

  current_source_version := to_char(guide.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  current_content_hash := encode(digest(convert_to(helixa_canonical_json_v1(
    helixa_role_guide_content_v1(guide.final_markdown, guide.role_profile_spec, guide.generated_blocks)
  ), 'UTF8'), 'sha256'), 'hex');
  IF p_source_job_instruction->>'kind' <> 'ROLE_GUIDE'
    OR p_source_job_instruction->>'sourceVersion' <> current_source_version
    OR p_source_job_instruction->>'contentHash' <> current_content_hash
  THEN RAISE EXCEPTION 'ROLE_GUIDE_SOURCE_STALE'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM role_guide_generation_proofs proof
    WHERE proof.playbook_id = guide.id AND proof.organization_id = p_organization_id
      AND proof.source_version = current_source_version AND proof.content_hash = current_content_hash
  ) THEN RAISE EXCEPTION 'ROLE_GUIDE_SOURCE_STALE'; END IF;

  INSERT INTO courses(
    id, title, slug, user_id, organization_id, status, course_description,
    target_audience, learning_outcomes, language, course_size, style,
    generation_mode, settings, has_files, created_at, updated_at
  ) VALUES (
    p_course_id, p_course->>'title', 'helixa-' || replace(p_course_id::TEXT, '-', ''),
    p_user_id, p_organization_id, 'draft', p_course->>'courseDescription',
    p_course->>'targetAudience', array_to_string(ARRAY(SELECT jsonb_array_elements_text(p_course->'learningOutcomes')), E'\n'),
    p_course->>'language', p_course->>'courseSize', p_course->>'style',
    'semi_automatic', jsonb_build_object(
      'includeWebResearch', false, 'includeBusinessContextSources', false,
      'roleGuideId', guide.id, 'roleGuideSourceVersion', current_source_version
    ), false, NOW(), NOW()
  );

  INSERT INTO course_job_instruction_sources(
    course_id, organization_id, job_instruction_id, source_version, source_content_hash,
    origin_binding_id, origin_command_id
  ) VALUES (
    p_course_id, p_organization_id, guide.id, current_source_version, current_content_hash,
    p_binding_id, p_command_id
  );

  INSERT INTO job_outbox(entity_id, queue_name, job_data, job_options, target_queue)
  VALUES (
    p_course_id, 'structure_analysis',
    jsonb_build_object(
      'jobType', 'structure_analysis', 'organizationId', p_organization_id,
      'courseId', p_course_id, 'userId', p_user_id, 'createdAt', NOW(),
      'title', p_course->>'title', 'settings', jsonb_build_object(
        'includeWebResearch', false, 'includeBusinessContextSources', false,
        'roleGuideId', guide.id, 'roleGuideSourceVersion', current_source_version
      ), 'courseSize', p_course->>'courseSize'
    ), jsonb_build_object('priority', 0), 'course-generation'
  );
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION claim_scheduled_helixa_generation_command(p_binding_id TEXT, p_command_id TEXT)
RETURNS TABLE(
  command_id TEXT, command_hash TEXT, proposal_payload_hash TEXT, object_kind TEXT,
  object_id UUID, status TEXT, accepted_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
  lease_token UUID, claim_generation INTEGER, command_kind TEXT, proposal_id TEXT,
  approved_revision BIGINT, safe_error_code TEXT, native_completed_at TIMESTAMPTZ,
  outbox_event_id TEXT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY WITH claimed AS (
    UPDATE helixa_generation_commands command SET
      observation_generation = command.observation_generation + 1,
      observation_lease_token = gen_random_uuid(),
      observation_lease_expires_at = NOW() + INTERVAL '2 minutes', updated_at = NOW()
    WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id
      AND command.status = 'scheduled'
      AND (command.observation_lease_token IS NULL OR command.observation_lease_expires_at <= NOW())
    RETURNING command.*
  ) SELECT claimed.command_id, claimed.command_hash, claimed.proposal_payload_hash,
    claimed.object_kind, claimed.object_id, claimed.status, claimed.accepted_at, claimed.updated_at,
    claimed.observation_lease_token, claimed.observation_generation, claimed.command_kind,
    claimed.proposal_id, claimed.approved_revision, claimed.safe_error_code,
    claimed.native_completed_at, NULL::TEXT FROM claimed;
END;
$$;

CREATE OR REPLACE FUNCTION observe_helixa_native_generation(
  p_organization_id UUID, p_object_kind TEXT, p_object_id UUID
) RETURNS TABLE(outcome TEXT, native_completed_at TIMESTAMPTZ, outbox_event_id TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_native_status TEXT;
DECLARE v_completed_at TIMESTAMPTZ;
DECLARE v_event_id TEXT;
BEGIN
  IF p_object_kind = 'COURSE' THEN
    SELECT generation_status::TEXT, generation_completed_at INTO v_native_status, v_completed_at
    FROM courses WHERE id = p_object_id AND organization_id = p_organization_id;
  ELSIF p_object_kind = 'ROLE_GUIDE' THEN
    SELECT status, completed_at INTO v_native_status, v_completed_at
    FROM career_playbooks WHERE id = p_object_id AND organization_id = p_organization_id;
  ELSE
    RAISE EXCEPTION 'Unsupported native generation object kind';
  END IF;
  IF NOT FOUND THEN RETURN QUERY SELECT 'missing', NULL::TIMESTAMPTZ, NULL::TEXT; RETURN; END IF;
  IF v_native_status = 'failed' THEN RETURN QUERY SELECT 'failed', NULL::TIMESTAMPTZ, NULL::TEXT; RETURN; END IF;
  IF v_native_status <> 'completed' OR v_completed_at IS NULL THEN
    RETURN QUERY SELECT 'running', NULL::TIMESTAMPTZ, NULL::TEXT; RETURN;
  END IF;
  SELECT outbox.event_id INTO v_event_id FROM helixa_knowledge_sync_outbox outbox
  WHERE outbox.object_kind = p_object_kind AND outbox.object_id = p_object_id
    AND outbox.completed_at = v_completed_at ORDER BY outbox.event_id LIMIT 1;
  IF v_event_id IS NULL THEN
    RETURN QUERY SELECT 'succeeded_awaiting_signed_import', v_completed_at, NULL::TEXT;
  ELSE
    RETURN QUERY SELECT 'completed', v_completed_at, v_event_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION return_scheduled_helixa_generation_command(
  p_binding_id TEXT, p_command_id TEXT, p_object_id UUID, p_lease_token UUID, p_claim_generation INTEGER
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed INTEGER;
BEGIN
  UPDATE helixa_generation_commands command SET observation_lease_token = NULL,
    observation_lease_expires_at = NULL, updated_at = NOW()
  WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id
    AND command.object_id = p_object_id AND command.status = 'scheduled'
    AND command.observation_lease_token = p_lease_token AND command.observation_generation = p_claim_generation
    AND command.observation_lease_expires_at > NOW();
  GET DIAGNOSTICS changed = ROW_COUNT; RETURN changed = 1;
END;
$$;

CREATE OR REPLACE FUNCTION fail_observed_helixa_generation_command(
  p_binding_id TEXT, p_command_id TEXT, p_object_id UUID, p_lease_token UUID, p_observation_generation INTEGER
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed INTEGER;
BEGIN
  UPDATE helixa_generation_commands command SET status = 'action_required',
    safe_error_code = 'megacampus_generation_native_failed', observation_lease_token = NULL,
    observation_lease_expires_at = NULL, updated_at = NOW()
  WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id
    AND command.object_id = p_object_id AND command.status = 'scheduled'
    AND command.observation_lease_token = p_lease_token
    AND command.observation_generation = p_observation_generation
    AND command.observation_lease_expires_at > NOW();
  GET DIAGNOSTICS changed = ROW_COUNT; RETURN changed = 1;
END;
$$;

CREATE OR REPLACE FUNCTION complete_observed_helixa_generation_command(
  p_binding_id TEXT, p_command_id TEXT, p_object_id UUID, p_lease_token UUID,
  p_observation_generation INTEGER, p_native_completed_at TIMESTAMPTZ, p_outbox_event_id TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM helixa_knowledge_sync_outbox outbox
    WHERE outbox.binding_id = p_binding_id AND outbox.object_id = p_object_id
      AND outbox.completed_at = p_native_completed_at AND outbox.event_id = p_outbox_event_id
  ) THEN RAISE EXCEPTION 'Native completion proof is unavailable'; END IF;
  UPDATE helixa_generation_commands command SET status = 'native_completed',
    native_completed_at = p_native_completed_at, safe_error_code = NULL,
    observation_lease_token = NULL, observation_lease_expires_at = NULL, updated_at = NOW()
  WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id
    AND command.object_id = p_object_id AND command.status = 'scheduled'
    AND command.observation_lease_token = p_lease_token
    AND command.observation_generation = p_observation_generation
    AND command.observation_lease_expires_at > NOW();
  GET DIAGNOSTICS changed = ROW_COUNT; RETURN changed = 1;
END;
$$;

REVOKE ALL ON FUNCTION helixa_role_guide_content_v1(TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION schedule_helixa_course_from_role_guide(TEXT, TEXT, UUID, UUID, UUID, JSONB, JSONB, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION claim_scheduled_helixa_generation_command(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION observe_helixa_native_generation(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION return_scheduled_helixa_generation_command(TEXT, TEXT, UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fail_observed_helixa_generation_command(TEXT, TEXT, UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_observed_helixa_generation_command(TEXT, TEXT, UUID, UUID, INTEGER, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION helixa_role_guide_content_v1(TEXT, JSONB, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION schedule_helixa_course_from_role_guide(TEXT, TEXT, UUID, UUID, UUID, JSONB, JSONB, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION claim_scheduled_helixa_generation_command(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION observe_helixa_native_generation(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION return_scheduled_helixa_generation_command(TEXT, TEXT, UUID, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION fail_observed_helixa_generation_command(TEXT, TEXT, UUID, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION complete_observed_helixa_generation_command(TEXT, TEXT, UUID, UUID, INTEGER, TIMESTAMPTZ, TEXT) TO service_role;

COMMIT;
