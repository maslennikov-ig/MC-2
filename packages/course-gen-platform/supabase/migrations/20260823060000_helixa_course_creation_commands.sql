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
  command_id TEXT NOT NULL CHECK (btrim(command_id) <> ''),
  proposal_id TEXT NOT NULL CHECK (btrim(proposal_id) <> ''),
  approved_revision INTEGER NOT NULL CHECK (approved_revision > 0),
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  course_id UUID NOT NULL DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'action_required')),
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
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);

ALTER TABLE helixa_course_creation_commands ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION reserve_helixa_course_creation_command(
  p_binding_id TEXT, p_organization_id UUID, p_environment TEXT,
  p_destination_binding_id TEXT, p_command_id TEXT, p_proposal_id TEXT,
  p_approved_revision INTEGER, p_payload_hash TEXT
) RETURNS TABLE(command_id TEXT, payload_hash TEXT, course_id UUID, status TEXT, conflict BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing helixa_course_creation_commands%ROWTYPE;
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
  SELECT * INTO existing FROM helixa_course_creation_commands AS command
  WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id;
  RETURN QUERY SELECT existing.command_id, existing.payload_hash, existing.course_id,
    existing.status, existing.payload_hash <> p_payload_hash;
END;
$$;

CREATE OR REPLACE FUNCTION complete_helixa_course_creation_command(
  p_binding_id TEXT, p_command_id TEXT, p_course_id UUID
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed INTEGER;
BEGIN
  UPDATE helixa_course_creation_commands AS command
  SET status = 'completed', completed_at = NOW(), safe_error = NULL, updated_at = NOW()
  WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id
    AND command.course_id = p_course_id AND command.status = 'pending';
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$$;

CREATE OR REPLACE FUNCTION action_required_helixa_course_creation_command(
  p_binding_id TEXT, p_command_id TEXT, p_course_id UUID, p_safe_error TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed INTEGER;
BEGIN
  UPDATE helixa_course_creation_commands AS command
  SET status = 'action_required', safe_error = left(COALESCE(p_safe_error, 'Unspecified failure'), 300), updated_at = NOW()
  WHERE command.binding_id = p_binding_id AND command.command_id = p_command_id
    AND command.course_id = p_course_id AND command.status = 'pending';
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$$;

REVOKE ALL ON FUNCTION reserve_helixa_course_creation_command(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION complete_helixa_course_creation_command(TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION action_required_helixa_course_creation_command(TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reserve_helixa_course_creation_command(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION complete_helixa_course_creation_command(TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION action_required_helixa_course_creation_command(TEXT, TEXT, UUID, TEXT) TO service_role;

COMMENT ON TABLE helixa_course_creation_commands IS
  'Durable fake-only course creation command ledger. Roll back by disabling course_creation_enabled, draining, and retaining ledger and outbox records.';

COMMIT;
