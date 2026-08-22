BEGIN;

CREATE TABLE helixa_knowledge_sync_bindings (
  binding_id TEXT PRIMARY KEY CHECK (btrim(binding_id) <> ''),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (btrim(environment) <> ''),
  destination_binding_id TEXT NOT NULL CHECK (btrim(destination_binding_id) <> ''),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (binding_id, organization_id, environment, destination_binding_id)
);

CREATE TABLE helixa_knowledge_sync_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  destination_binding_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  object_kind TEXT NOT NULL CHECK (object_kind IN ('COURSE', 'ROLE_GUIDE')),
  object_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'retryable', 'delivered', 'action_required')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 8),
  claim_generation INTEGER NOT NULL DEFAULT 0 CHECK (claim_generation >= 0),
  lease_token UUID,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  payload_hash TEXT CHECK (payload_hash IS NULL OR payload_hash ~ '^[a-f0-9]{64}$'),
  raw_body BYTEA,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT helixa_sync_outbox_binding_fk FOREIGN KEY (
    binding_id, organization_id, environment, destination_binding_id
  ) REFERENCES helixa_knowledge_sync_bindings (
    binding_id, organization_id, environment, destination_binding_id
  ) ON DELETE RESTRICT,
  UNIQUE (binding_id, event_id),
  UNIQUE (binding_id, object_kind, object_id, completed_at),
  CHECK ((status = 'processing') = (lease_token IS NOT NULL)),
  CHECK ((raw_body IS NULL AND payload_hash IS NULL) OR (raw_body IS NOT NULL AND payload_hash IS NOT NULL)),
  CHECK (octet_length(raw_body) IS NULL OR octet_length(raw_body) <= 268435456)
);

CREATE INDEX idx_helixa_knowledge_sync_outbox_pending
  ON helixa_knowledge_sync_outbox(binding_id, next_attempt_at, created_at)
  WHERE status IN ('pending', 'retryable');
CREATE INDEX idx_helixa_knowledge_sync_outbox_stale_claims
  ON helixa_knowledge_sync_outbox(binding_id, last_attempt_at)
  WHERE status = 'processing';

ALTER TABLE helixa_knowledge_sync_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE helixa_knowledge_sync_outbox ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION claim_helixa_knowledge_sync_outbox(
  p_binding_id TEXT, p_organization_id UUID, p_environment TEXT,
  p_destination_binding_id TEXT, p_batch_size INTEGER DEFAULT 10
) RETURNS TABLE(
  id UUID, event_id TEXT, object_kind TEXT, object_id UUID, organization_id UUID,
  completed_at TIMESTAMPTZ, raw_body_base64 TEXT, attempts INTEGER,
  claim_generation INTEGER, lease_token UUID, binding_id TEXT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM helixa_knowledge_sync_bindings binding
    WHERE binding.binding_id = p_binding_id AND binding.organization_id = p_organization_id
      AND binding.environment = p_environment
      AND binding.destination_binding_id = p_destination_binding_id AND binding.enabled
  ) THEN RAISE EXCEPTION 'Knowledge sync binding is not active'; END IF;

  UPDATE helixa_knowledge_sync_outbox item
  SET status = 'action_required', lease_token = NULL,
      last_error = 'Retry budget exhausted', updated_at = NOW()
  WHERE item.binding_id = p_binding_id
    AND item.organization_id = p_organization_id
    AND item.environment = p_environment
    AND item.destination_binding_id = p_destination_binding_id
    AND item.attempts >= 8
    AND (
      item.status IN ('pending', 'retryable')
      OR (item.status = 'processing' AND item.last_attempt_at < NOW() - INTERVAL '15 minutes')
    );

  RETURN QUERY
  WITH claimed AS (
    SELECT item.id FROM helixa_knowledge_sync_outbox item
    WHERE item.binding_id = p_binding_id
      AND item.organization_id = p_organization_id
      AND item.environment = p_environment
      AND item.destination_binding_id = p_destination_binding_id
      AND item.attempts < 8
      AND (
        (item.status IN ('pending', 'retryable') AND item.next_attempt_at <= NOW())
        OR (item.status = 'processing' AND item.last_attempt_at < NOW() - INTERVAL '15 minutes')
      )
    ORDER BY item.next_attempt_at, item.created_at
    FOR UPDATE SKIP LOCKED LIMIT LEAST(GREATEST(p_batch_size, 1), 100)
  )
  UPDATE helixa_knowledge_sync_outbox item
  SET status = 'processing', attempts = attempts + 1,
      claim_generation = claim_generation + 1, lease_token = gen_random_uuid(),
      last_attempt_at = NOW(), updated_at = NOW()
  FROM claimed WHERE item.id = claimed.id
  RETURNING item.id, item.event_id, item.object_kind, item.object_id, item.organization_id,
    item.completed_at, CASE WHEN item.raw_body IS NULL THEN NULL ELSE encode(item.raw_body, 'base64') END,
    item.attempts, item.claim_generation, item.lease_token, item.binding_id;
END;
$$;

CREATE OR REPLACE FUNCTION freeze_helixa_knowledge_sync_payload(
  p_id UUID, p_lease_token UUID, p_raw_body_utf8 TEXT, p_payload_hash TEXT
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE frozen BYTEA;
BEGIN
  IF p_payload_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid payload hash'; END IF;
  UPDATE helixa_knowledge_sync_outbox
  SET raw_body = convert_to(p_raw_body_utf8, 'UTF8'), payload_hash = p_payload_hash, updated_at = NOW()
  WHERE id = p_id AND status = 'processing' AND lease_token = p_lease_token AND raw_body IS NULL
  RETURNING raw_body INTO frozen;
  IF frozen IS NULL THEN
    SELECT raw_body INTO frozen FROM helixa_knowledge_sync_outbox
    WHERE id = p_id AND status = 'processing' AND lease_token = p_lease_token;
  END IF;
  RETURN CASE WHEN frozen IS NULL THEN NULL ELSE encode(frozen, 'base64') END;
END;
$$;

CREATE OR REPLACE FUNCTION transition_helixa_knowledge_sync_outbox(
  p_id UUID, p_lease_token UUID, p_action TEXT, p_next_attempt_at TIMESTAMPTZ, p_error TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed INTEGER;
BEGIN
  IF p_action NOT IN ('delivered', 'retryable', 'action_required') THEN
    RAISE EXCEPTION 'Unsupported knowledge sync transition';
  END IF;
  IF p_action = 'retryable' AND p_next_attempt_at IS NULL THEN
    RAISE EXCEPTION 'Retry transition requires next attempt time';
  END IF;
  UPDATE helixa_knowledge_sync_outbox
  SET status = p_action,
      next_attempt_at = CASE WHEN p_action = 'retryable' THEN p_next_attempt_at ELSE next_attempt_at END,
      delivered_at = CASE WHEN p_action = 'delivered' THEN NOW() ELSE delivered_at END,
      last_error = CASE WHEN p_action = 'delivered' THEN NULL ELSE left(COALESCE(p_error, 'Unspecified failure'), 300) END,
      lease_token = NULL, updated_at = NOW()
  WHERE id = p_id AND status = 'processing' AND lease_token = p_lease_token;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$$;

CREATE OR REPLACE FUNCTION reconcile_helixa_knowledge_sync_intent(
  p_binding_id TEXT, p_environment TEXT, p_destination_binding_id TEXT,
  p_event_id TEXT, p_object_kind TEXT, p_object_id UUID,
  p_organization_id UUID, p_completed_at TIMESTAMPTZ
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inserted_count INTEGER;
BEGIN
  IF p_object_kind NOT IN ('COURSE', 'ROLE_GUIDE') THEN RAISE EXCEPTION 'Unsupported knowledge object kind'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM helixa_knowledge_sync_bindings binding
    WHERE binding.binding_id = p_binding_id AND binding.organization_id = p_organization_id
      AND binding.environment = p_environment
      AND binding.destination_binding_id = p_destination_binding_id AND binding.enabled
  ) THEN RAISE EXCEPTION 'Knowledge sync binding is not active'; END IF;
  INSERT INTO helixa_knowledge_sync_outbox(
    binding_id, environment, destination_binding_id, event_id,
    object_kind, object_id, organization_id, completed_at
  ) VALUES (
    p_binding_id, p_environment, p_destination_binding_id, p_event_id,
    p_object_kind, p_object_id, p_organization_id, p_completed_at
  ) ON CONFLICT (binding_id, event_id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count = 1;
END;
$$;

CREATE OR REPLACE FUNCTION reset_helixa_knowledge_sync_intent(
  p_binding_id TEXT, p_organization_id UUID, p_environment TEXT,
  p_destination_binding_id TEXT, p_event_id TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed INTEGER;
BEGIN
  UPDATE helixa_knowledge_sync_outbox
  SET status = 'pending', attempts = 0, lease_token = NULL, next_attempt_at = NOW(),
      last_attempt_at = NULL, last_error = NULL, delivered_at = NULL, updated_at = NOW()
  WHERE binding_id = p_binding_id AND organization_id = p_organization_id
    AND environment = p_environment AND destination_binding_id = p_destination_binding_id
    AND event_id = p_event_id AND status = 'action_required';
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$$;

CREATE OR REPLACE FUNCTION enqueue_helixa_course_knowledge_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.generation_status = 'completed' AND NEW.generation_completed_at IS NOT NULL THEN
    INSERT INTO helixa_knowledge_sync_outbox(
      binding_id, environment, destination_binding_id, event_id,
      object_kind, object_id, organization_id, completed_at
    ) SELECT binding.binding_id, binding.environment, binding.destination_binding_id,
      'mc2:COURSE:' || NEW.organization_id || ':' || NEW.id || ':' || to_char(NEW.generation_completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'COURSE', NEW.id, NEW.organization_id, NEW.generation_completed_at
    FROM helixa_knowledge_sync_bindings binding
    WHERE binding.organization_id = NEW.organization_id AND binding.enabled
    ON CONFLICT (binding_id, event_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enqueue_helixa_course_knowledge_sync_trigger
AFTER INSERT OR UPDATE OF generation_status, generation_completed_at ON courses
FOR EACH ROW EXECUTE FUNCTION enqueue_helixa_course_knowledge_sync();

CREATE OR REPLACE FUNCTION enqueue_helixa_role_guide_knowledge_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.completed_at IS NOT NULL THEN
    INSERT INTO helixa_knowledge_sync_outbox(
      binding_id, environment, destination_binding_id, event_id,
      object_kind, object_id, organization_id, completed_at
    ) SELECT binding.binding_id, binding.environment, binding.destination_binding_id,
      'mc2:ROLE_GUIDE:' || NEW.organization_id || ':' || NEW.id || ':' || to_char(NEW.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'ROLE_GUIDE', NEW.id, NEW.organization_id, NEW.completed_at
    FROM helixa_knowledge_sync_bindings binding
    WHERE binding.organization_id = NEW.organization_id AND binding.enabled
    ON CONFLICT (binding_id, event_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enqueue_helixa_role_guide_knowledge_sync_trigger
AFTER INSERT OR UPDATE OF status, completed_at ON career_playbooks
FOR EACH ROW EXECUTE FUNCTION enqueue_helixa_role_guide_knowledge_sync();

REVOKE ALL ON FUNCTION claim_helixa_knowledge_sync_outbox(TEXT, UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION freeze_helixa_knowledge_sync_payload(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION transition_helixa_knowledge_sync_outbox(UUID, UUID, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reconcile_helixa_knowledge_sync_intent(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reset_helixa_knowledge_sync_intent(TEXT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_helixa_knowledge_sync_outbox(TEXT, UUID, TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION freeze_helixa_knowledge_sync_payload(UUID, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION transition_helixa_knowledge_sync_outbox(UUID, UUID, TEXT, TIMESTAMPTZ, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION reconcile_helixa_knowledge_sync_intent(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, UUID, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION reset_helixa_knowledge_sync_intent(TEXT, UUID, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON TABLE helixa_knowledge_sync_bindings IS
  'Non-secret organization/environment/destination binding identity. Endpoint and credentials remain external runtime authority.';
COMMENT ON TABLE helixa_knowledge_sync_outbox IS
  'Binding-scoped durable intent and immutable raw request store for local MegaCampus-to-Helixa knowledge sync.';

COMMIT;
