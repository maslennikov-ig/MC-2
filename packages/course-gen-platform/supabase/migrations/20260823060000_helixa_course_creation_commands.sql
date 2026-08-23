BEGIN;

ALTER TABLE helixa_knowledge_sync_bindings
  ADD COLUMN course_creation_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN source_helixa_organization_id TEXT,
  ADD COLUMN source_helixa_project_id TEXT,
  ADD CONSTRAINT helixa_course_creation_source_check CHECK (
    NOT course_creation_enabled OR (
      btrim(COALESCE(source_helixa_organization_id, '')) <> '' AND
      btrim(COALESCE(source_helixa_project_id, '')) <> ''
    )
  );

CREATE TABLE helixa_course_creation_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_id TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  environment TEXT NOT NULL,
  destination_binding_id TEXT NOT NULL,
  command_id TEXT NOT NULL CHECK (command_id ~ '^megacampus_course_command:[a-f0-9]{64}$'),
  proposal_id TEXT NOT NULL CHECK (btrim(proposal_id) <> '' AND char_length(proposal_id) <= 300),
  approved_revision BIGINT NOT NULL CHECK (approved_revision BETWEEN 1 AND 9007199254740991),
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  course_id UUID NOT NULL DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'action_required')),
  claim_generation INTEGER NOT NULL DEFAULT 1 CHECK (claim_generation > 0),
  lease_token UUID DEFAULT gen_random_uuid(),
  lease_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '2 minutes'),
  safe_error TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT helixa_course_command_binding_fk FOREIGN KEY (
    binding_id, organization_id, environment, destination_binding_id
  ) REFERENCES helixa_knowledge_sync_bindings (
    binding_id, organization_id, environment, destination_binding_id
  ) ON DELETE RESTRICT,
  CONSTRAINT helixa_course_creation_commands_binding_command_key UNIQUE (binding_id, command_id),
  UNIQUE (course_id),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  CHECK (
    (status = 'pending' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL) OR
    (status <> 'pending' AND lease_token IS NULL AND lease_expires_at IS NULL)
  )
);

ALTER TABLE helixa_course_creation_commands ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION reserve_helixa_course_creation_command(
  p_binding_id TEXT, p_organization_id UUID, p_environment TEXT,
  p_destination_binding_id TEXT, p_command_id TEXT, p_proposal_id TEXT,
  p_approved_revision BIGINT, p_payload_hash TEXT
) RETURNS TABLE(
  command_id TEXT, payload_hash TEXT, course_id UUID, status TEXT, conflict BOOLEAN,
  mutation_owner BOOLEAN, lease_token UUID, claim_generation INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  existing helixa_course_creation_commands%ROWTYPE;
  inserted INTEGER;
  claimed INTEGER := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM helixa_knowledge_sync_bindings binding
    WHERE binding.binding_id = p_binding_id AND binding.organization_id = p_organization_id
      AND binding.environment = p_environment AND binding.destination_binding_id = p_destination_binding_id
      AND binding.enabled AND binding.course_creation_enabled
  ) THEN RAISE EXCEPTION 'Course creation binding is not active'; END IF;
  INSERT INTO helixa_course_creation_commands(
    binding_id, organization_id, environment, destination_binding_id, command_id,
    proposal_id, approved_revision, payload_hash
  ) VALUES (
    p_binding_id, p_organization_id, p_environment, p_destination_binding_id, p_command_id,
    p_proposal_id, p_approved_revision, p_payload_hash
  ) ON CONFLICT ON CONSTRAINT helixa_course_creation_commands_binding_command_key DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  SELECT * INTO existing FROM helixa_course_creation_commands AS command
  WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id;

  IF inserted = 0 AND existing.payload_hash = p_payload_hash AND existing.status = 'pending'
    AND existing.lease_expires_at <= NOW() THEN
    UPDATE helixa_course_creation_commands AS command
    SET claim_generation = command.claim_generation + 1,
        lease_token = gen_random_uuid(), lease_expires_at = NOW() + INTERVAL '2 minutes',
        updated_at = NOW()
    WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id
      AND command.status = 'pending' AND command.payload_hash = p_payload_hash
      AND command.lease_token = existing.lease_token
      AND command.claim_generation = existing.claim_generation
      AND command.lease_expires_at <= NOW()
    RETURNING command.* INTO existing;
    GET DIAGNOSTICS claimed = ROW_COUNT;
    IF claimed = 0 THEN
      SELECT * INTO existing FROM helixa_course_creation_commands AS command
      WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id;
    END IF;
  END IF;

  RETURN QUERY SELECT existing.command_id, existing.payload_hash, existing.course_id,
    existing.status, existing.payload_hash <> p_payload_hash, inserted = 1 OR claimed = 1,
    CASE WHEN inserted = 1 OR claimed = 1 THEN existing.lease_token ELSE NULL END,
    existing.claim_generation;
END;
$$;

CREATE OR REPLACE FUNCTION renew_helixa_course_creation_command(
  p_binding_id TEXT, p_command_id TEXT, p_course_id UUID,
  p_lease_token UUID, p_claim_generation INTEGER
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed INTEGER;
BEGIN
  UPDATE helixa_course_creation_commands AS command
  SET lease_expires_at = NOW() + INTERVAL '2 minutes', updated_at = NOW()
  WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id
    AND command.course_id = p_course_id AND command.status = 'pending'
    AND command.lease_token = p_lease_token
    AND command.claim_generation = p_claim_generation
    AND command.lease_expires_at > NOW();
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$$;

CREATE OR REPLACE FUNCTION complete_helixa_course_creation_command(
  p_binding_id TEXT, p_command_id TEXT, p_course_id UUID,
  p_lease_token UUID, p_claim_generation INTEGER
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed INTEGER;
BEGIN
  UPDATE helixa_course_creation_commands AS command
  SET status = 'completed', completed_at = NOW(), safe_error = NULL,
      lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
  WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id
    AND command.course_id = p_course_id AND command.status = 'pending'
    AND command.lease_token = p_lease_token
    AND command.claim_generation = p_claim_generation
    AND command.lease_expires_at > NOW();
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$$;

CREATE OR REPLACE FUNCTION action_required_helixa_course_creation_command(
  p_binding_id TEXT, p_command_id TEXT, p_course_id UUID, p_safe_error TEXT,
  p_lease_token UUID, p_claim_generation INTEGER
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed INTEGER;
BEGIN
  UPDATE helixa_course_creation_commands AS command
  SET status = 'action_required', safe_error = left(COALESCE(p_safe_error, 'Unspecified failure'), 300),
      lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
  WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id
    AND command.course_id = p_course_id AND command.status = 'pending'
    AND command.lease_token = p_lease_token
    AND command.claim_generation = p_claim_generation
    AND command.lease_expires_at > NOW();
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$$;

REVOKE ALL ON FUNCTION reserve_helixa_course_creation_command(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION renew_helixa_course_creation_command(TEXT, TEXT, UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_helixa_course_creation_command(TEXT, TEXT, UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION action_required_helixa_course_creation_command(TEXT, TEXT, UUID, TEXT, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reserve_helixa_course_creation_command(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION renew_helixa_course_creation_command(TEXT, TEXT, UUID, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION complete_helixa_course_creation_command(TEXT, TEXT, UUID, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION action_required_helixa_course_creation_command(TEXT, TEXT, UUID, TEXT, UUID, INTEGER) TO service_role;

COMMENT ON TABLE helixa_course_creation_commands IS
  'Durable fake-only course creation command ledger. Roll back by disabling course_creation_enabled, draining, and retaining ledger and outbox records.';

COMMIT;
