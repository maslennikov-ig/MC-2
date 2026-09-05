-- A completed object can be exported through more than one binding in the same
-- organization. Observation must return proof from the command's exact binding;
-- otherwise the later fenced completion rejects the foreign outbox event.

BEGIN;

DROP FUNCTION IF EXISTS observe_helixa_native_generation(UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION observe_helixa_native_generation(
  p_binding_id TEXT, p_organization_id UUID, p_object_kind TEXT, p_object_id UUID
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
  WHERE outbox.binding_id = p_binding_id
    AND outbox.organization_id = p_organization_id
    AND outbox.object_kind = p_object_kind AND outbox.object_id = p_object_id
    AND outbox.completed_at = v_completed_at ORDER BY outbox.event_id LIMIT 1;
  IF v_event_id IS NULL THEN
    RETURN QUERY SELECT 'succeeded_awaiting_signed_import', v_completed_at, NULL::TEXT;
  ELSE
    RETURN QUERY SELECT 'completed', v_completed_at, v_event_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION observe_helixa_native_generation(TEXT, UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION observe_helixa_native_generation(TEXT, UUID, TEXT, UUID)
  TO service_role;

COMMIT;
