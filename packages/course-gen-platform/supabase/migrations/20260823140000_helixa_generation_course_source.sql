BEGIN;

CREATE TABLE course_job_instruction_native_sources (
  course_id UUID PRIMARY KEY REFERENCES course_job_instruction_sources(course_id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  file_catalog_id UUID NOT NULL UNIQUE REFERENCES file_catalog(id) ON DELETE RESTRICT,
  source_canonical_content TEXT NOT NULL CHECK (octet_length(source_canonical_content) > 0),
  source_content_hash TEXT NOT NULL CHECK (source_content_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE course_job_instruction_native_sources ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER course_job_instruction_native_sources_immutable
  BEFORE UPDATE OR DELETE ON course_job_instruction_native_sources
  FOR EACH ROW EXECUTE FUNCTION prevent_helixa_generation_proof_mutation();

CREATE OR REPLACE FUNCTION validate_course_job_instruction_native_source()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM course_job_instruction_sources relation
    JOIN file_catalog file ON file.id = NEW.file_catalog_id
    WHERE relation.course_id = NEW.course_id
      AND relation.organization_id = NEW.organization_id
      AND relation.source_content_hash = NEW.source_content_hash
      AND file.course_id = NEW.course_id
      AND file.organization_id = NEW.organization_id
      AND file.hash = NEW.source_content_hash
      AND file.processed_content = NEW.source_canonical_content
      AND file.markdown_content = NEW.source_canonical_content
      AND file.vector_status = 'indexed'
  ) OR encode(digest(convert_to(NEW.source_canonical_content, 'UTF8'), 'sha256'), 'hex') <> NEW.source_content_hash
  THEN
    RAISE EXCEPTION 'Native ROLE_GUIDE source proof is invalid';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER course_job_instruction_native_sources_validate
  BEFORE INSERT ON course_job_instruction_native_sources
  FOR EACH ROW EXECUTE FUNCTION validate_course_job_instruction_native_source();

CREATE OR REPLACE FUNCTION prevent_helixa_native_source_file_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM course_job_instruction_native_sources source
    WHERE source.file_catalog_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Native ROLE_GUIDE source file is immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER file_catalog_helixa_native_source_immutable
  BEFORE UPDATE OR DELETE ON file_catalog
  FOR EACH ROW EXECUTE FUNCTION prevent_helixa_native_source_file_mutation();

CREATE OR REPLACE FUNCTION schedule_helixa_course_from_role_guide(
  p_binding_id TEXT, p_command_id TEXT, p_course_id UUID, p_organization_id UUID,
  p_user_id UUID, p_course JSONB, p_source_job_instruction JSONB,
  p_lease_token UUID, p_claim_generation INTEGER
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE command helixa_generation_commands%ROWTYPE;
DECLARE guide career_playbooks%ROWTYPE;
DECLARE current_source_version TEXT;
DECLARE current_source_content TEXT;
DECLARE current_content_hash TEXT;
DECLARE native_source_file_id UUID;
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
  current_source_content := helixa_canonical_json_v1(
    helixa_role_guide_content_v1(guide.final_markdown, guide.role_profile_spec, guide.generated_blocks)
  );
  current_content_hash := encode(digest(convert_to(current_source_content, 'UTF8'), 'sha256'), 'hex');
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
    ), true, NOW(), NOW()
  );

  INSERT INTO course_job_instruction_sources(
    course_id, organization_id, job_instruction_id, source_version, source_content_hash,
    origin_binding_id, origin_command_id
  ) VALUES (
    p_course_id, p_organization_id, guide.id, current_source_version, current_content_hash,
    p_binding_id, p_command_id
  );

  INSERT INTO file_catalog(
    organization_id, course_id, filename, original_name, file_type, file_size,
    storage_path, hash, mime_type, vector_status, markdown_content, processed_content,
    processing_method, summary_metadata, priority
  ) VALUES (
    p_organization_id, p_course_id, 'role-guide-' || guide.id::TEXT || '.json',
    'ROLE_GUIDE ' || guide.id::TEXT, 'json', octet_length(current_source_content),
    'helixa-generation://role-guide/' || guide.id::TEXT || '/' || current_content_hash,
    current_content_hash, 'application/json', 'indexed', current_source_content,
    current_source_content, 'full_text', jsonb_build_object(
      'source', 'helixa_role_guide', 'source_version_hash', current_content_hash,
      'original_tokens', greatest(1, octet_length(current_source_content) / 4),
      'summary_tokens', greatest(1, octet_length(current_source_content) / 4),
      'compression_ratio', 1, 'quality_score', 1
    ), 'CORE'
  ) RETURNING id INTO native_source_file_id;

  INSERT INTO course_job_instruction_native_sources(
    course_id, organization_id, file_catalog_id, source_canonical_content, source_content_hash
  ) VALUES (
    p_course_id, p_organization_id, native_source_file_id, current_source_content, current_content_hash
  );

  INSERT INTO job_outbox(entity_id, queue_name, job_data, job_options, target_queue)
  VALUES (
    p_course_id, 'structure_analysis',
    jsonb_build_object(
      'jobType', 'structure_analysis', 'organizationId', p_organization_id,
      'courseId', p_course_id, 'userId', p_user_id, 'createdAt', NOW(),
      'title', p_course->>'title', 'settings', jsonb_build_object(
        'includeWebResearch', false, 'includeBusinessContextSources', false,
        'roleGuideId', guide.id, 'roleGuideSourceVersion', current_source_version,
        'roleGuideSourceFileId', native_source_file_id
      ), 'courseSize', p_course->>'courseSize'
    ), jsonb_build_object('priority', 0), 'course-generation'
  );
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION complete_observed_helixa_generation_command(
  p_binding_id TEXT, p_command_id TEXT, p_object_id UUID, p_lease_token UUID,
  p_observation_generation INTEGER, p_native_completed_at TIMESTAMPTZ, p_outbox_event_id TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM helixa_generation_commands command
    JOIN helixa_knowledge_sync_outbox outbox
      ON outbox.binding_id = command.binding_id
      AND outbox.object_kind = command.object_kind
      AND outbox.object_id = command.object_id
    WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id
      AND command.object_id = p_object_id
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

REVOKE ALL ON TABLE course_job_instruction_native_sources FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION validate_course_job_instruction_native_source() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION prevent_helixa_native_source_file_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION schedule_helixa_course_from_role_guide(TEXT, TEXT, UUID, UUID, UUID, JSONB, JSONB, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_observed_helixa_generation_command(TEXT, TEXT, UUID, UUID, INTEGER, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE course_job_instruction_native_sources TO service_role;
GRANT EXECUTE ON FUNCTION schedule_helixa_course_from_role_guide(TEXT, TEXT, UUID, UUID, UUID, JSONB, JSONB, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION complete_observed_helixa_generation_command(TEXT, TEXT, UUID, UUID, INTEGER, TIMESTAMPTZ, TEXT) TO service_role;

COMMIT;
