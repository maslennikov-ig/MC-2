-- Add CREATE_COURSE to the governed generation-command ledger. The command's
-- selectedSources identify Helixa-owned documents and therefore remain immutable
-- provenance in command_payload; they are not materialized as MegaCampus files.
-- The native course follows the product's no-file structure-analysis path and the
-- existing completion triggers return it through the signed knowledge-sync outbox.

BEGIN;

ALTER TABLE helixa_generation_commands
  DROP CONSTRAINT helixa_generation_commands_command_id_check,
  DROP CONSTRAINT helixa_generation_commands_command_kind_check,
  DROP CONSTRAINT helixa_generation_command_object_kind_check,
  ADD CONSTRAINT helixa_generation_commands_command_id_check CHECK (
    command_id ~ '^megacampus_generation_command:(create_job_instruction|create_course_from_job_instruction|create_course):v1:[a-f0-9]{64}$'
  ),
  ADD CONSTRAINT helixa_generation_commands_command_kind_check CHECK (
    command_kind IN ('CREATE_JOB_INSTRUCTION', 'CREATE_COURSE_FROM_JOB_INSTRUCTION', 'CREATE_COURSE')
  ),
  ADD CONSTRAINT helixa_generation_command_object_kind_check CHECK (
    (command_kind = 'CREATE_JOB_INSTRUCTION' AND object_kind = 'ROLE_GUIDE') OR
    (command_kind IN ('CREATE_COURSE_FROM_JOB_INSTRUCTION', 'CREATE_COURSE') AND object_kind = 'COURSE')
  );

-- A changed OUT row is a changed PostgreSQL return type, so replace the function
-- instead of creating an ambiguous overload for PostgREST.
DROP FUNCTION resolve_helixa_generation_binding(TEXT);

CREATE OR REPLACE FUNCTION resolve_helixa_generation_binding(p_binding_id TEXT)
RETURNS TABLE(
  binding_id TEXT, organization_id UUID, environment TEXT, destination_binding_id TEXT,
  service_principal_user_id UUID, job_instruction_creation_enabled BOOLEAN,
  course_from_job_instruction_creation_enabled BOOLEAN, course_creation_enabled BOOLEAN,
  principal_exists_in_auth BOOLEAN, principal_exists_in_public BOOLEAN,
  principal_organization_id UUID, principal_role TEXT, principal_kind TEXT,
  interactive_login_allowed BOOLEAN
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT b.binding_id, b.organization_id, b.environment, b.destination_binding_id,
    b.generation_service_principal_user_id, b.job_instruction_creation_enabled,
    b.course_from_job_instruction_creation_enabled, b.course_creation_enabled,
    a.id IS NOT NULL, u.id IS NOT NULL, m.organization_id, COALESCE(m.role::TEXT, ''),
    COALESCE(a.raw_app_meta_data->>'kind', ''),
    COALESCE((a.raw_app_meta_data->>'interactive_login_allowed')::BOOLEAN, true)
  FROM helixa_knowledge_sync_bindings b
  LEFT JOIN auth.users a ON a.id = b.generation_service_principal_user_id
  LEFT JOIN users u ON u.id = b.generation_service_principal_user_id
  LEFT JOIN organization_members m
    ON m.organization_id = b.organization_id
    AND m.user_id = b.generation_service_principal_user_id
  WHERE b.binding_id = p_binding_id AND b.enabled;
$$;

CREATE OR REPLACE FUNCTION reserve_helixa_generation_command(
  p_binding_id TEXT, p_command_id TEXT, p_command_kind TEXT, p_proposal_id TEXT,
  p_approved_revision BIGINT, p_proposal_payload_hash TEXT, p_command_hash TEXT,
  p_command_payload JSONB, p_object_kind TEXT
) RETURNS TABLE(
  command_id TEXT, command_hash TEXT, proposal_payload_hash TEXT, object_kind TEXT,
  object_id UUID, status TEXT, accepted_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
  conflict BOOLEAN, mutation_owner BOOLEAN, lease_token UUID, claim_generation INTEGER,
  command_kind TEXT, proposal_id TEXT, approved_revision BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  binding helixa_knowledge_sync_bindings%ROWTYPE;
  principal auth.users%ROWTYPE;
  existing helixa_generation_commands%ROWTYPE;
  inserted INTEGER := 0;
  claimed INTEGER := 0;
BEGIN
  SELECT * INTO binding FROM helixa_knowledge_sync_bindings b
  WHERE b.binding_id = p_binding_id AND b.enabled;
  IF NOT FOUND OR binding.generation_service_principal_user_id IS NULL OR
    (p_command_kind = 'CREATE_JOB_INSTRUCTION' AND NOT binding.job_instruction_creation_enabled) OR
    (p_command_kind = 'CREATE_COURSE_FROM_JOB_INSTRUCTION' AND NOT binding.course_from_job_instruction_creation_enabled) OR
    (p_command_kind = 'CREATE_COURSE' AND NOT binding.course_creation_enabled) OR
    p_command_kind NOT IN ('CREATE_JOB_INSTRUCTION', 'CREATE_COURSE_FROM_JOB_INSTRUCTION', 'CREATE_COURSE')
  THEN RAISE EXCEPTION 'Generation binding is not active'; END IF;

  SELECT * INTO principal FROM auth.users u
  WHERE u.id = binding.generation_service_principal_user_id;
  IF NOT FOUND OR COALESCE(principal.raw_app_meta_data->>'kind', '') <> 'service_principal'
    OR COALESCE((principal.raw_app_meta_data->>'interactive_login_allowed')::BOOLEAN, true)
    OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = principal.id)
    OR NOT EXISTS (
      SELECT 1 FROM organization_members m
      WHERE m.organization_id = binding.organization_id AND m.user_id = principal.id
        AND m.role::TEXT IN ('owner', 'admin', 'instructor')
    )
  THEN RAISE EXCEPTION 'Generation service principal is invalid'; END IF;

  INSERT INTO helixa_generation_commands(
    binding_id, organization_id, environment, destination_binding_id,
    command_id, command_kind, proposal_id, approved_revision, proposal_payload_hash,
    command_hash, command_payload, object_kind
  ) VALUES (
    binding.binding_id, binding.organization_id, binding.environment, binding.destination_binding_id,
    p_command_id, p_command_kind, p_proposal_id, p_approved_revision, p_proposal_payload_hash,
    p_command_hash, p_command_payload, p_object_kind
  ) ON CONFLICT ON CONSTRAINT helixa_generation_commands_binding_command_key DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  SELECT * INTO existing FROM helixa_generation_commands command
  WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id;

  IF inserted = 0 AND existing.command_hash = p_command_hash
    AND existing.status IN ('reserved', 'executing')
    AND existing.lease_expires_at <= NOW()
  THEN
    UPDATE helixa_generation_commands command SET
      claim_generation = command.claim_generation + 1,
      lease_token = gen_random_uuid(), lease_expires_at = NOW() + INTERVAL '2 minutes',
      status = 'executing', started_at = COALESCE(command.started_at, NOW()), updated_at = NOW()
    WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id
      AND command.command_hash = p_command_hash
      AND command.claim_generation = existing.claim_generation
      AND command.lease_token = existing.lease_token
      AND command.lease_expires_at <= NOW()
    RETURNING command.* INTO existing;
    GET DIAGNOSTICS claimed = ROW_COUNT;
    IF claimed = 0 THEN
      SELECT * INTO existing FROM helixa_generation_commands command
      WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id;
    END IF;
  END IF;

  RETURN QUERY SELECT existing.command_id, existing.command_hash,
    existing.proposal_payload_hash, existing.object_kind, existing.object_id,
    existing.status, existing.accepted_at, existing.updated_at,
    existing.command_hash <> p_command_hash, inserted = 1 OR claimed = 1,
    CASE WHEN inserted = 1 OR claimed = 1 THEN existing.lease_token ELSE NULL END,
    existing.claim_generation, existing.command_kind, existing.proposal_id,
    existing.approved_revision;
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
    generation_mode, settings, has_files, created_at, updated_at
  ) VALUES (
    p_course_id, p_course->>'title', 'helixa-' || replace(p_course_id::TEXT, '-', ''),
    p_user_id, p_organization_id, 'draft', p_course->>'courseDescription',
    p_course->>'targetAudience',
    array_to_string(ARRAY(SELECT jsonb_array_elements_text(p_course->'learningOutcomes')), E'\n'),
    p_course->>'language', p_course->>'courseSize', p_course->>'style',
    'semi_automatic', jsonb_build_object(
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

REVOKE ALL ON FUNCTION resolve_helixa_generation_binding(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reserve_helixa_generation_command(TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION schedule_helixa_course(TEXT, TEXT, UUID, UUID, UUID, JSONB, JSONB, UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION resolve_helixa_generation_binding(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION reserve_helixa_generation_command(TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION schedule_helixa_course(TEXT, TEXT, UUID, UUID, UUID, JSONB, JSONB, UUID, INTEGER, TEXT) TO service_role;

COMMIT;
