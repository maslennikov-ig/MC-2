-- Helixa CREATE_JOB_INSTRUCTION: schedule a career playbook from a generation command.
--
-- `schedule_helixa_course_from_role_guide` has done this for courses since 2026-08-23.
-- The job-instruction half had no scheduler at all, so a live CREATE_JOB_INSTRUCTION
-- command could only be refused. This is its counterpart, and it follows the same shape:
-- take the command under its lease fence, prove the service principal, prove the payload
-- being relayed is the payload the ledger stored, then write the native row.
--
-- One deliberate difference. The course function also enqueues, by inserting into
-- `job_outbox` in the same transaction. That is not available here: `job_outbox.entity_id`
-- is `REFERENCES courses(id)`, and a career playbook id is not a course id. So this
-- function writes the `career_playbooks` row and the caller enqueues afterwards, which is
-- exactly what the product's own `approveCareerPlaybookGeneration` does — row first, job
-- second, and a compensating write if the enqueue fails. `fail_helixa_role_guide_generation`
-- below is that compensation, under the same fence.
--
-- `SET search_path = public, extensions` on both, per the 2026-09-05 convention: pgcrypto
-- lives in `extensions` on this project, and a function that pins `public` alone cannot
-- resolve anything from it. Neither function hashes today; the search path is there so
-- neither acquires the defect later.

BEGIN;

-- Returns TRUE when the playbook row is in `generating` and the caller must enqueue the
-- generation job. Returns FALSE when a playbook with this id already exists in some other
-- state, which means an earlier claim already took it further and there is nothing to start.
CREATE OR REPLACE FUNCTION schedule_helixa_role_guide(
  p_binding_id TEXT, p_command_id TEXT, p_playbook_id UUID, p_organization_id UUID,
  p_user_id UUID, p_job_instruction JSONB, p_selected_sources JSONB, p_qa_data JSONB,
  p_lease_token UUID, p_claim_generation INTEGER
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE command helixa_generation_commands%ROWTYPE;
DECLARE existing career_playbooks%ROWTYPE;
DECLARE command_language TEXT;
BEGIN
  SELECT * INTO command FROM helixa_generation_commands c
  WHERE c.binding_id = p_binding_id AND c.command_id = p_command_id
    AND c.command_kind = 'CREATE_JOB_INSTRUCTION'
    AND c.object_kind = 'ROLE_GUIDE' AND c.object_id = p_playbook_id
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
      AND binding.enabled AND binding.job_instruction_creation_enabled
      AND binding.generation_service_principal_user_id = p_user_id
      AND COALESCE(principal.raw_app_meta_data->>'kind', '') = 'service_principal'
      AND NOT COALESCE((principal.raw_app_meta_data->>'interactive_login_allowed')::BOOLEAN, true)
  ) THEN RAISE EXCEPTION 'GENERATION_SERVICE_PRINCIPAL_INVALID'; END IF;

  -- The ledger stored the command payload at reserve time. The caller must be relaying
  -- that payload and not a rewritten one, or the row would not describe the command
  -- Helixa approved.
  IF command.command_payload->'jobInstruction' <> p_job_instruction
    OR command.command_payload->'selectedSources' <> p_selected_sources
  THEN RAISE EXCEPTION 'GENERATION_COMMAND_PAYLOAD_MISMATCH'; END IF;

  command_language := p_job_instruction->>'language';
  IF COALESCE(p_job_instruction->>'roleTitle', '') = ''
    OR command_language IS NULL
    OR jsonb_typeof(p_qa_data) <> 'object'
  THEN RAISE EXCEPTION 'ROLE_GUIDE_COMMAND_PAYLOAD_INCOMPLETE'; END IF;

  -- Idempotent on the command: `object_id` is assigned once at reservation and never
  -- changes, so a reclaimed lease reaching here again finds its own earlier row.
  SELECT * INTO existing FROM career_playbooks p
  WHERE p.id = p_playbook_id AND p.organization_id = p_organization_id
  FOR UPDATE;
  IF FOUND THEN RETURN existing.status = 'generating'; END IF;

  INSERT INTO career_playbooks(
    id, user_id, organization_id, status, language, position_title,
    q_a_data, generated_blocks, created_at, updated_at
  ) VALUES (
    p_playbook_id, p_user_id, p_organization_id, 'generating', command_language,
    p_job_instruction->>'roleTitle', p_qa_data, '{}'::jsonb, NOW(), NOW()
  );

  RETURN true;
END;
$$;

-- Compensation for a failed enqueue, mirroring what `approveCareerPlaybookGeneration`
-- does when `addJob` throws: the row must not sit in `generating` with no job behind it.
CREATE OR REPLACE FUNCTION fail_helixa_role_guide_generation(
  p_binding_id TEXT, p_command_id TEXT, p_playbook_id UUID, p_organization_id UUID,
  p_lease_token UUID, p_claim_generation INTEGER, p_reason TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE changed INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM helixa_generation_commands c
    WHERE c.binding_id = p_binding_id AND c.command_id = p_command_id
      AND c.command_kind = 'CREATE_JOB_INSTRUCTION'
      AND c.object_kind = 'ROLE_GUIDE' AND c.object_id = p_playbook_id
      AND c.organization_id = p_organization_id
      AND c.lease_token = p_lease_token AND c.claim_generation = p_claim_generation
      AND c.status IN ('reserved', 'executing') AND c.lease_expires_at > NOW()
  ) THEN RAISE EXCEPTION 'GENERATION_COMMAND_FENCE_LOST'; END IF;

  UPDATE career_playbooks p SET status = 'failed',
    q_a_data = jsonb_set(
      CASE WHEN jsonb_typeof(p.q_a_data) = 'object' THEN p.q_a_data ELSE '{}'::jsonb END,
      '{generation_error}', to_jsonb(COALESCE(NULLIF(p_reason, ''), 'Helixa generation enqueue failed'))
    ),
    updated_at = NOW()
  WHERE p.id = p_playbook_id AND p.organization_id = p_organization_id AND p.status = 'generating';
  GET DIAGNOSTICS changed = ROW_COUNT; RETURN changed = 1;
END;
$$;

REVOKE ALL ON FUNCTION schedule_helixa_role_guide(TEXT, TEXT, UUID, UUID, UUID, JSONB, JSONB, JSONB, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fail_helixa_role_guide_generation(TEXT, TEXT, UUID, UUID, UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION schedule_helixa_role_guide(TEXT, TEXT, UUID, UUID, UUID, JSONB, JSONB, JSONB, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION fail_helixa_role_guide_generation(TEXT, TEXT, UUID, UUID, UUID, INTEGER, TEXT) TO service_role;

COMMIT;
