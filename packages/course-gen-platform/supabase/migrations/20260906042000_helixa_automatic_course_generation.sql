-- Helixa course commands represent the owner's single approval. New native courses
-- from either supported Course operation therefore enter the existing automatic
-- Stage 4 -> 5 -> 6 pipeline. The application still enforces its structural and
-- lesson publishability/quality gates; this migration changes no completed or
-- in-flight row.
--
-- CREATE OR REPLACE keeps each function's existing owner and ACL. Do not restate
-- grants here: production ACLs are part of the already-applied Helixa migrations.
BEGIN;

CREATE OR REPLACE FUNCTION schedule_helixa_course_from_role_guide(
  p_binding_id TEXT, p_command_id TEXT, p_course_id UUID, p_organization_id UUID,
  p_user_id UUID, p_course JSONB, p_source_job_instruction JSONB,
  p_lease_token UUID, p_claim_generation INTEGER, p_target_queue TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE command helixa_generation_commands%ROWTYPE;
DECLARE guide career_playbooks%ROWTYPE;
DECLARE current_source_version TEXT;
DECLARE current_source_content TEXT;
DECLARE current_content_hash TEXT;
DECLARE native_source_file_id UUID;
BEGIN
  IF COALESCE(p_target_queue, '') = '' THEN RAISE EXCEPTION 'GENERATION_TARGET_QUEUE_REQUIRED'; END IF;

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
  current_content_hash := encode(extensions.digest(convert_to(current_source_content, 'UTF8'), 'sha256'), 'hex');
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
    generation_mode, auto_finalize_after_stage6, settings, has_files, created_at, updated_at
  ) VALUES (
    p_course_id, p_course->>'title', 'helixa-' || replace(p_course_id::TEXT, '-', ''),
    p_user_id, p_organization_id, 'draft', p_course->>'courseDescription',
    p_course->>'targetAudience', array_to_string(ARRAY(SELECT jsonb_array_elements_text(p_course->'learningOutcomes')), E'\n'),
    p_course->>'language', p_course->>'courseSize', p_course->>'style',
    'automatic', true, jsonb_build_object(
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
    ), jsonb_build_object('priority', 0), p_target_queue
  );
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION schedule_helixa_course(
  p_binding_id TEXT, p_command_id TEXT, p_course_id UUID, p_organization_id UUID,
  p_user_id UUID, p_course JSONB, p_selected_sources JSONB,
  p_lease_token UUID, p_claim_generation INTEGER, p_target_queue TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE command helixa_generation_commands%ROWTYPE;
BEGIN
  IF COALESCE(p_target_queue, '') = ''
  THEN RAISE EXCEPTION 'GENERATION_TARGET_QUEUE_REQUIRED'; END IF;

  SELECT * INTO command FROM helixa_generation_commands c
  WHERE c.binding_id = p_binding_id AND c.command_id = p_command_id
    AND c.command_kind = 'CREATE_COURSE'
    AND c.object_kind = 'COURSE' AND c.object_id = p_course_id
    AND c.organization_id = p_organization_id
    AND c.lease_token = p_lease_token AND c.claim_generation = p_claim_generation
    AND c.status IN ('reserved', 'executing') AND c.lease_expires_at > NOW()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GENERATION_COMMAND_FENCE_LOST'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM helixa_knowledge_sync_bindings binding
    JOIN auth.users principal ON principal.id = binding.generation_service_principal_user_id
    JOIN users public_user
      ON public_user.id = principal.id
      AND public_user.organization_id = binding.organization_id
    JOIN organization_members membership
      ON membership.user_id = principal.id
      AND membership.organization_id = binding.organization_id
      AND membership.role::TEXT IN ('owner', 'admin', 'instructor')
    WHERE binding.binding_id = p_binding_id
      AND binding.organization_id = p_organization_id
      AND binding.enabled AND binding.course_creation_enabled
      AND binding.generation_service_principal_user_id = p_user_id
      AND COALESCE(principal.raw_app_meta_data->>'kind', '') = 'service_principal'
      AND NOT COALESCE((principal.raw_app_meta_data->>'interactive_login_allowed')::BOOLEAN, true)
  ) THEN RAISE EXCEPTION 'GENERATION_SERVICE_PRINCIPAL_INVALID'; END IF;

  IF command.command_payload->'course' <> p_course
    OR command.command_payload->'selectedSources' <> p_selected_sources
  THEN RAISE EXCEPTION 'GENERATION_COMMAND_PAYLOAD_MISMATCH'; END IF;
  IF jsonb_typeof(p_selected_sources) <> 'array'
    OR jsonb_array_length(p_selected_sources) < 1
    OR COALESCE(p_course->>'title', '') = ''
    OR p_course->>'language' NOT IN ('ru', 'en')
    OR jsonb_typeof(p_course->'learningOutcomes') <> 'array'
    OR jsonb_array_length(p_course->'learningOutcomes') < 1
  THEN RAISE EXCEPTION 'COURSE_COMMAND_PAYLOAD_INCOMPLETE'; END IF;

  INSERT INTO courses(
    id, title, slug, user_id, organization_id, status, course_description,
    target_audience, learning_outcomes, language, course_size, style,
    generation_mode, auto_finalize_after_stage6, settings, has_files, created_at, updated_at
  ) VALUES (
    p_course_id, p_course->>'title', 'helixa-' || replace(p_course_id::TEXT, '-', ''),
    p_user_id, p_organization_id, 'draft', p_course->>'courseDescription',
    p_course->>'targetAudience',
    array_to_string(ARRAY(SELECT jsonb_array_elements_text(p_course->'learningOutcomes')), E'\n'),
    p_course->>'language', p_course->>'courseSize', p_course->>'style',
    'automatic', true, jsonb_build_object(
      'includeWebResearch', false, 'includeBusinessContextSources', false
    ), false, NOW(), NOW()
  );

  INSERT INTO job_outbox(entity_id, queue_name, job_data, job_options, target_queue)
  VALUES (
    p_course_id, 'structure_analysis',
    jsonb_build_object(
      'jobType', 'structure_analysis', 'organizationId', p_organization_id,
      'courseId', p_course_id, 'userId', p_user_id, 'createdAt', NOW(),
      'title', p_course->>'title', 'settings', jsonb_build_object(
        'includeWebResearch', false, 'includeBusinessContextSources', false
      ), 'courseSize', p_course->>'courseSize'
    ), jsonb_build_object('priority', 0), p_target_queue
  );
  RETURN true;
END;
$$;

COMMIT;
