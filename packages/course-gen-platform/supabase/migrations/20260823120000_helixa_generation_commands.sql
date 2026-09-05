BEGIN;

ALTER TABLE helixa_knowledge_sync_bindings
  ADD COLUMN generation_service_principal_user_id UUID,
  ADD COLUMN job_instruction_creation_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN course_from_job_instruction_creation_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT helixa_generation_principal_auth_fk
    FOREIGN KEY (generation_service_principal_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT helixa_generation_principal_public_fk
    FOREIGN KEY (generation_service_principal_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT helixa_generation_enabled_principal_check CHECK (
    NOT (job_instruction_creation_enabled OR course_from_job_instruction_creation_enabled)
    OR generation_service_principal_user_id IS NOT NULL
  );

CREATE TABLE helixa_generation_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_id TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  environment TEXT NOT NULL,
  destination_binding_id TEXT NOT NULL,
  command_id TEXT NOT NULL CHECK (
    command_id ~ '^megacampus_generation_command:(create_job_instruction|create_course_from_job_instruction):v1:[a-f0-9]{64}$'
  ),
  command_kind TEXT NOT NULL CHECK (command_kind IN ('CREATE_JOB_INSTRUCTION', 'CREATE_COURSE_FROM_JOB_INSTRUCTION')),
  proposal_id TEXT NOT NULL CHECK (btrim(proposal_id) <> '' AND char_length(proposal_id) <= 300),
  approved_revision BIGINT NOT NULL CHECK (approved_revision BETWEEN 1 AND 9007199254740991),
  proposal_payload_hash TEXT NOT NULL CHECK (proposal_payload_hash ~ '^[a-f0-9]{64}$'),
  command_hash TEXT NOT NULL CHECK (command_hash ~ '^[a-f0-9]{64}$'),
  command_payload JSONB NOT NULL,
  object_kind TEXT NOT NULL CHECK (object_kind IN ('ROLE_GUIDE', 'COURSE')),
  object_id UUID NOT NULL DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'scheduled', 'executing', 'native_completed', 'action_required')),
  accepted_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  native_completed_at TIMESTAMPTZ,
  claim_generation INTEGER NOT NULL DEFAULT 1 CHECK (claim_generation > 0),
  lease_token UUID DEFAULT gen_random_uuid(),
  lease_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '2 minutes'),
  safe_error_code TEXT CHECK (safe_error_code IS NULL OR safe_error_code IN (
    'megacampus_generation_binding_unavailable',
    'megacampus_generation_service_principal_invalid',
    'megacampus_generation_source_unavailable',
    'megacampus_generation_source_stale',
    'megacampus_generation_transient',
    'megacampus_generation_outcome_uncertain',
    'megacampus_generation_native_failed',
    'megacampus_generation_awaiting_signed_import',
    'megacampus_generation_signed_correlation_invalid'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT helixa_generation_binding_fk FOREIGN KEY (
    binding_id, organization_id, environment, destination_binding_id
  ) REFERENCES helixa_knowledge_sync_bindings (
    binding_id, organization_id, environment, destination_binding_id
  ) ON DELETE RESTRICT,
  CONSTRAINT helixa_generation_commands_binding_command_key UNIQUE (binding_id, command_id),
  CONSTRAINT helixa_generation_commands_binding_object_key UNIQUE (binding_id, object_kind, object_id),
  CONSTRAINT helixa_generation_command_object_kind_check CHECK (
    (command_kind = 'CREATE_JOB_INSTRUCTION' AND object_kind = 'ROLE_GUIDE') OR
    (command_kind = 'CREATE_COURSE_FROM_JOB_INSTRUCTION' AND object_kind = 'COURSE')
  ),
  CHECK ((status IN ('reserved', 'executing')) = (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK ((status = 'native_completed') = (native_completed_at IS NOT NULL)),
  CHECK ((status = 'action_required') = (safe_error_code IS NOT NULL))
);

CREATE TABLE role_guide_generation_proofs (
  playbook_id UUID PRIMARY KEY REFERENCES career_playbooks(id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  source_version TEXT NOT NULL CHECK (btrim(source_version) <> ''),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  origin_binding_id TEXT NOT NULL,
  origin_command_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT role_guide_generation_proof_origin_fk FOREIGN KEY (origin_binding_id, origin_command_id)
    REFERENCES helixa_generation_commands(binding_id, command_id) ON DELETE RESTRICT,
  UNIQUE (origin_binding_id, origin_command_id)
);

CREATE TABLE course_job_instruction_sources (
  course_id UUID PRIMARY KEY REFERENCES courses(id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  job_instruction_id UUID NOT NULL REFERENCES career_playbooks(id) ON DELETE RESTRICT,
  source_version TEXT NOT NULL CHECK (btrim(source_version) <> ''),
  source_content_hash TEXT NOT NULL CHECK (source_content_hash ~ '^[a-f0-9]{64}$'),
  origin_binding_id TEXT NOT NULL,
  origin_command_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT course_job_instruction_source_origin_fk FOREIGN KEY (origin_binding_id, origin_command_id)
    REFERENCES helixa_generation_commands(binding_id, command_id) ON DELETE RESTRICT,
  UNIQUE (origin_binding_id, origin_command_id)
);

ALTER TABLE helixa_generation_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_guide_generation_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_job_instruction_sources ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION prevent_helixa_generation_proof_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Helixa generation provenance is immutable';
END;
$$;

CREATE TRIGGER role_guide_generation_proofs_immutable
  BEFORE UPDATE OR DELETE ON role_guide_generation_proofs
  FOR EACH ROW EXECUTE FUNCTION prevent_helixa_generation_proof_mutation();
CREATE TRIGGER course_job_instruction_sources_immutable
  BEFORE UPDATE OR DELETE ON course_job_instruction_sources
  FOR EACH ROW EXECUTE FUNCTION prevent_helixa_generation_proof_mutation();

CREATE OR REPLACE FUNCTION validate_course_job_instruction_source()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE command helixa_generation_commands%ROWTYPE;
BEGIN
  SELECT * INTO command FROM helixa_generation_commands c
  WHERE c.binding_id = NEW.origin_binding_id AND c.command_id = NEW.origin_command_id;
  IF NOT FOUND OR command.command_kind <> 'CREATE_COURSE_FROM_JOB_INSTRUCTION'
    OR command.object_kind <> 'COURSE' OR command.object_id <> NEW.course_id
    OR command.organization_id <> NEW.organization_id
    OR command.command_payload->'sourceJobInstruction'->>'kind' <> 'ROLE_GUIDE'
    OR command.command_payload->'sourceJobInstruction'->>'id' <> NEW.job_instruction_id::TEXT
    OR command.command_payload->'sourceJobInstruction'->>'sourceVersion' <> NEW.source_version
    OR command.command_payload->'sourceJobInstruction'->>'contentHash' <> NEW.source_content_hash
    OR NOT EXISTS (SELECT 1 FROM courses course WHERE course.id = NEW.course_id AND course.organization_id = NEW.organization_id)
    OR NOT EXISTS (SELECT 1 FROM career_playbooks guide WHERE guide.id = NEW.job_instruction_id AND guide.organization_id = NEW.organization_id AND guide.status = 'completed')
    OR NOT EXISTS (
      SELECT 1 FROM role_guide_generation_proofs proof
      WHERE proof.playbook_id = NEW.job_instruction_id AND proof.organization_id = NEW.organization_id
        AND proof.source_version = NEW.source_version AND proof.content_hash = NEW.source_content_hash
    )
  THEN RAISE EXCEPTION 'Course Job Instruction source relation is invalid'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_course_job_instruction_source_insert
  BEFORE INSERT ON course_job_instruction_sources
  FOR EACH ROW EXECUTE FUNCTION validate_course_job_instruction_source();

CREATE OR REPLACE FUNCTION resolve_helixa_generation_binding(p_binding_id TEXT)
RETURNS TABLE(
  binding_id TEXT, organization_id UUID, environment TEXT, destination_binding_id TEXT,
  service_principal_user_id UUID, job_instruction_creation_enabled BOOLEAN,
  course_from_job_instruction_creation_enabled BOOLEAN, principal_exists_in_auth BOOLEAN,
  principal_exists_in_public BOOLEAN, principal_organization_id UUID, principal_role TEXT,
  principal_kind TEXT, interactive_login_allowed BOOLEAN
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT b.binding_id, b.organization_id, b.environment, b.destination_binding_id,
    b.generation_service_principal_user_id,
    b.job_instruction_creation_enabled, b.course_from_job_instruction_creation_enabled,
    a.id IS NOT NULL, u.id IS NOT NULL, m.organization_id, COALESCE(m.role::TEXT, ''),
    COALESCE(a.raw_app_meta_data->>'kind', ''),
    COALESCE((a.raw_app_meta_data->>'interactive_login_allowed')::BOOLEAN, true)
  FROM helixa_knowledge_sync_bindings b
  LEFT JOIN auth.users a ON a.id = b.generation_service_principal_user_id
  LEFT JOIN users u ON u.id = b.generation_service_principal_user_id
  LEFT JOIN organization_members m ON m.organization_id = b.organization_id AND m.user_id = b.generation_service_principal_user_id
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
    (p_command_kind = 'CREATE_COURSE_FROM_JOB_INSTRUCTION' AND NOT binding.course_from_job_instruction_creation_enabled)
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

  IF inserted = 0 AND existing.command_hash = p_command_hash AND existing.status IN ('reserved', 'executing')
    AND existing.lease_expires_at <= NOW() THEN
    UPDATE helixa_generation_commands command SET
      claim_generation = command.claim_generation + 1,
      lease_token = gen_random_uuid(), lease_expires_at = NOW() + INTERVAL '2 minutes',
      status = 'executing', started_at = COALESCE(command.started_at, NOW()), updated_at = NOW()
    WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id
      AND command.command_hash = p_command_hash AND command.claim_generation = existing.claim_generation
      AND command.lease_token = existing.lease_token AND command.lease_expires_at <= NOW()
    RETURNING command.* INTO existing;
    GET DIAGNOSTICS claimed = ROW_COUNT;
    IF claimed = 0 THEN SELECT * INTO existing FROM helixa_generation_commands command
      WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id; END IF;
  END IF;

  RETURN QUERY SELECT existing.command_id, existing.command_hash, existing.proposal_payload_hash,
    existing.object_kind, existing.object_id, existing.status, existing.accepted_at, existing.updated_at,
    existing.command_hash <> p_command_hash, inserted = 1 OR claimed = 1,
    CASE WHEN inserted = 1 OR claimed = 1 THEN existing.lease_token ELSE NULL END,
    existing.claim_generation, existing.command_kind, existing.proposal_id, existing.approved_revision;
END;
$$;

CREATE OR REPLACE FUNCTION renew_helixa_generation_command(
  p_binding_id TEXT, p_command_id TEXT, p_object_id UUID, p_lease_token UUID, p_claim_generation INTEGER
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed INTEGER;
BEGIN
  UPDATE helixa_generation_commands command SET lease_expires_at = NOW() + INTERVAL '2 minutes', updated_at = NOW()
  WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id
    AND command.object_id = p_object_id AND command.status IN ('reserved', 'executing')
    AND command.lease_token = p_lease_token AND command.claim_generation = p_claim_generation
    AND command.lease_expires_at > NOW();
  GET DIAGNOSTICS changed = ROW_COUNT; RETURN changed = 1;
END;
$$;

CREATE OR REPLACE FUNCTION schedule_helixa_generation_command(
  p_binding_id TEXT, p_command_id TEXT, p_object_id UUID, p_lease_token UUID, p_claim_generation INTEGER
) RETURNS TABLE(
  command_id TEXT, command_hash TEXT, proposal_payload_hash TEXT, object_kind TEXT,
  object_id UUID, status TEXT, accepted_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
  lease_token UUID, claim_generation INTEGER, command_kind TEXT, proposal_id TEXT,
  approved_revision BIGINT, safe_error_code TEXT, native_completed_at TIMESTAMPTZ,
  outbox_event_id TEXT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY WITH scheduled AS (
    UPDATE helixa_generation_commands command SET
      status = 'scheduled', accepted_at = COALESCE(command.accepted_at, NOW()),
      lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
    WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id
      AND command.object_id = p_object_id AND command.status IN ('reserved', 'executing')
      AND command.lease_token = p_lease_token AND command.claim_generation = p_claim_generation
      AND command.lease_expires_at > NOW()
    RETURNING command.*
  ) SELECT scheduled.command_id, scheduled.command_hash, scheduled.proposal_payload_hash,
      scheduled.object_kind, scheduled.object_id, scheduled.status, scheduled.accepted_at,
      scheduled.updated_at, scheduled.lease_token, scheduled.claim_generation,
      scheduled.command_kind, scheduled.proposal_id, scheduled.approved_revision,
      scheduled.safe_error_code, scheduled.native_completed_at,
      NULL::TEXT AS outbox_event_id FROM scheduled;
END;
$$;

CREATE OR REPLACE FUNCTION lookup_helixa_generation_command(p_binding_id TEXT, p_command_id TEXT)
RETURNS TABLE(
  command_id TEXT, command_hash TEXT, proposal_payload_hash TEXT, object_kind TEXT,
  object_id UUID, status TEXT, accepted_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
  lease_token UUID, claim_generation INTEGER, command_kind TEXT, proposal_id TEXT,
  approved_revision BIGINT, safe_error_code TEXT, native_completed_at TIMESTAMPTZ,
  outbox_event_id TEXT
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT command.command_id, command.command_hash, command.proposal_payload_hash,
    command.object_kind, command.object_id, command.status, command.accepted_at, command.updated_at,
    command.lease_token, command.claim_generation, command.command_kind, command.proposal_id,
    command.approved_revision, command.safe_error_code, command.native_completed_at, outbox.event_id
  FROM helixa_generation_commands command
  LEFT JOIN helixa_knowledge_sync_outbox outbox
    ON outbox.binding_id = command.binding_id AND outbox.object_kind = command.object_kind
    AND outbox.object_id = command.object_id AND outbox.completed_at = command.native_completed_at
  WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id;
$$;

CREATE OR REPLACE FUNCTION reconcile_completed_helixa_generation_command(
  p_binding_id TEXT, p_command_id TEXT, p_object_id UUID, p_lease_token UUID,
  p_claim_generation INTEGER, p_native_completed_at TIMESTAMPTZ, p_outbox_event_id TEXT
) RETURNS TABLE(
  command_id TEXT, command_hash TEXT, proposal_payload_hash TEXT, object_kind TEXT,
  object_id UUID, status TEXT, accepted_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
  lease_token UUID, claim_generation INTEGER, command_kind TEXT, proposal_id TEXT,
  approved_revision BIGINT, safe_error_code TEXT, native_completed_at TIMESTAMPTZ,
  outbox_event_id TEXT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM helixa_knowledge_sync_outbox outbox
    JOIN helixa_generation_commands command ON command.binding_id = outbox.binding_id
      AND command.object_kind = outbox.object_kind AND command.object_id = outbox.object_id
    WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id
      AND command.object_id = p_object_id AND outbox.completed_at = p_native_completed_at
      AND outbox.event_id = p_outbox_event_id
  ) THEN RAISE EXCEPTION 'Native completion proof is unavailable'; END IF;
  RETURN QUERY WITH completed AS (
    UPDATE helixa_generation_commands command SET status = 'native_completed',
      accepted_at = COALESCE(command.accepted_at, NOW()), native_completed_at = p_native_completed_at,
      lease_token = NULL, lease_expires_at = NULL, safe_error_code = NULL, updated_at = NOW()
    WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id
      AND command.object_id = p_object_id AND command.status IN ('reserved', 'executing')
      AND command.lease_token = p_lease_token AND command.claim_generation = p_claim_generation
      AND command.lease_expires_at > NOW()
    RETURNING command.*
  ) SELECT completed.command_id, completed.command_hash, completed.proposal_payload_hash,
      completed.object_kind, completed.object_id, completed.status, completed.accepted_at,
      completed.updated_at, completed.lease_token, completed.claim_generation,
      completed.command_kind, completed.proposal_id, completed.approved_revision,
      completed.safe_error_code, completed.native_completed_at, p_outbox_event_id FROM completed;
END;
$$;

CREATE OR REPLACE FUNCTION action_required_helixa_generation_command(
  p_binding_id TEXT, p_command_id TEXT, p_object_id UUID, p_safe_error_code TEXT,
  p_lease_token UUID, p_claim_generation INTEGER
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed INTEGER;
BEGIN
  UPDATE helixa_generation_commands command SET status = 'action_required',
    safe_error_code = p_safe_error_code, lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
  WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id
    AND command.object_id = p_object_id AND command.status IN ('reserved', 'executing')
    AND command.lease_token = p_lease_token AND command.claim_generation = p_claim_generation
    AND command.lease_expires_at > NOW();
  GET DIAGNOSTICS changed = ROW_COUNT; RETURN changed = 1;
END;
$$;

CREATE OR REPLACE FUNCTION helixa_canonical_json_v1(value JSONB)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = public AS $$
DECLARE result TEXT;
DECLARE numeric_value NUMERIC;
BEGIN
  CASE jsonb_typeof(value)
    WHEN 'object' THEN
      SELECT '{' || COALESCE(string_agg(to_json(item.key)::TEXT || ':' || helixa_canonical_json_v1(item.value), ',' ORDER BY convert_to(item.key, 'UTF8')), '') || '}'
      INTO result FROM jsonb_each(value) item;
      RETURN result;
    WHEN 'array' THEN
      SELECT '[' || COALESCE(string_agg(helixa_canonical_json_v1(item.value), ',' ORDER BY item.ordinality), '') || ']'
      INTO result FROM jsonb_array_elements(value) WITH ORDINALITY item(value, ordinality);
      RETURN result;
    WHEN 'number' THEN
      numeric_value := (value #>> '{}')::NUMERIC;
      IF trunc(numeric_value) <> numeric_value OR numeric_value < -9007199254740991 OR numeric_value > 9007199254740991 THEN
        RAISE EXCEPTION 'canonical JSON requires safe integers';
      END IF;
      RETURN numeric_value::BIGINT::TEXT;
    WHEN 'string' THEN RETURN value::TEXT;
    WHEN 'boolean' THEN RETURN value::TEXT;
    WHEN 'null' THEN RETURN 'null';
    ELSE RAISE EXCEPTION 'canonical JSON requires JSON-compatible values';
  END CASE;
END;
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
      content_hash := encode(digest(convert_to(helixa_canonical_json_v1(jsonb_build_object(
        'summaryMarkdown', NEW.final_markdown,
        'structure', jsonb_build_object('roleProfileSpec', COALESCE(NEW.role_profile_spec, '{}'::jsonb)),
        'blocks', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', item.key, 'value', item.value) ORDER BY item.key)
          FROM jsonb_each(COALESCE(NEW.generated_blocks, '{}'::jsonb)) item), '[]'::jsonb),
        'lessons', '[]'::jsonb
      )), 'UTF8'), 'sha256'), 'hex');
      INSERT INTO role_guide_generation_proofs(playbook_id, organization_id, source_version, content_hash, origin_binding_id, origin_command_id)
      VALUES (NEW.id, NEW.organization_id, source_version, content_hash, command.binding_id, command.command_id)
      ON CONFLICT (playbook_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER a_capture_helixa_role_guide_generation_proof
  AFTER INSERT OR UPDATE OF status, completed_at ON career_playbooks
  FOR EACH ROW EXECUTE FUNCTION capture_helixa_role_guide_generation_proof();

CREATE OR REPLACE FUNCTION mark_helixa_generation_native_completed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'career_playbooks' THEN
    IF NEW.status = 'completed' AND NEW.completed_at IS NOT NULL THEN
      UPDATE helixa_generation_commands SET status = 'native_completed', native_completed_at = NEW.completed_at,
        lease_token = NULL, lease_expires_at = NULL, safe_error_code = NULL, updated_at = NOW()
      WHERE organization_id = NEW.organization_id AND object_kind = 'ROLE_GUIDE' AND object_id = NEW.id
        AND status IN ('scheduled', 'executing');
    END IF;
  ELSE
    IF NEW.generation_status = 'completed' AND NEW.generation_completed_at IS NOT NULL THEN
      UPDATE helixa_generation_commands SET status = 'native_completed', native_completed_at = NEW.generation_completed_at,
        lease_token = NULL, lease_expires_at = NULL, safe_error_code = NULL, updated_at = NOW()
      WHERE organization_id = NEW.organization_id AND object_kind = 'COURSE' AND object_id = NEW.id
        AND status IN ('scheduled', 'executing');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER z_mark_helixa_role_guide_generation_completed
  AFTER INSERT OR UPDATE OF status, completed_at ON career_playbooks
  FOR EACH ROW EXECUTE FUNCTION mark_helixa_generation_native_completed();
CREATE TRIGGER z_mark_helixa_course_generation_completed
  AFTER INSERT OR UPDATE OF generation_status, generation_completed_at ON courses
  FOR EACH ROW EXECUTE FUNCTION mark_helixa_generation_native_completed();

REVOKE ALL ON FUNCTION reserve_helixa_generation_command(TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION helixa_canonical_json_v1(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION validate_course_job_instruction_source() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION resolve_helixa_generation_binding(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION renew_helixa_generation_command(TEXT, TEXT, UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION schedule_helixa_generation_command(TEXT, TEXT, UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION action_required_helixa_generation_command(TEXT, TEXT, UUID, TEXT, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION lookup_helixa_generation_command(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reconcile_completed_helixa_generation_command(TEXT, TEXT, UUID, UUID, INTEGER, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION resolve_helixa_generation_binding(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION helixa_canonical_json_v1(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION reserve_helixa_generation_command(TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION renew_helixa_generation_command(TEXT, TEXT, UUID, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION schedule_helixa_generation_command(TEXT, TEXT, UUID, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION action_required_helixa_generation_command(TEXT, TEXT, UUID, TEXT, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION lookup_helixa_generation_command(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION reconcile_completed_helixa_generation_command(TEXT, TEXT, UUID, UUID, INTEGER, TIMESTAMPTZ, TEXT) TO service_role;

COMMENT ON TABLE helixa_generation_commands IS 'Binding-scoped durable ledger for the two server-only Helixa generation commands; separate from the legacy course-create ledger.';
COMMENT ON TABLE role_guide_generation_proofs IS 'Immutable exact signed ROLE_GUIDE source version and content hash for command-created guides.';
COMMENT ON TABLE course_job_instruction_sources IS 'Immutable normalized Course-to-ROLE_GUIDE source relation for command-created Courses.';

COMMIT;
