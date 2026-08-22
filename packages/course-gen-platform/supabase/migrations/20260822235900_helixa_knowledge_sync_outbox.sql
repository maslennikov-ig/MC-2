BEGIN;

CREATE TABLE helixa_knowledge_sync_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  object_kind TEXT NOT NULL CHECK (object_kind IN ('COURSE', 'ROLE_GUIDE')),
  object_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'retryable', 'delivered', 'terminal')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  payload_hash TEXT CHECK (payload_hash IS NULL OR payload_hash ~ '^[a-f0-9]{64}$'),
  raw_body BYTEA,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (object_kind, object_id, completed_at),
  CHECK ((raw_body IS NULL AND payload_hash IS NULL) OR (raw_body IS NOT NULL AND payload_hash IS NOT NULL)),
  CHECK (octet_length(raw_body) IS NULL OR octet_length(raw_body) <= 268435456)
);

CREATE INDEX idx_helixa_knowledge_sync_outbox_pending
  ON helixa_knowledge_sync_outbox(next_attempt_at, created_at)
  WHERE status IN ('pending', 'retryable');

CREATE INDEX idx_helixa_knowledge_sync_outbox_stale_claims
  ON helixa_knowledge_sync_outbox(last_attempt_at)
  WHERE status = 'processing';

ALTER TABLE helixa_knowledge_sync_outbox ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION claim_helixa_knowledge_sync_outbox(p_batch_size INTEGER DEFAULT 10)
RETURNS TABLE(id UUID, event_id TEXT, object_kind TEXT, object_id UUID, organization_id UUID, completed_at TIMESTAMPTZ, raw_body_base64 TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT item.id FROM helixa_knowledge_sync_outbox item
    WHERE (item.status IN ('pending', 'retryable') AND item.next_attempt_at <= NOW())
       OR (item.status = 'processing' AND item.last_attempt_at < NOW() - INTERVAL '15 minutes')
    ORDER BY item.next_attempt_at, item.created_at
    FOR UPDATE SKIP LOCKED LIMIT LEAST(GREATEST(p_batch_size, 1), 100)
  )
  UPDATE helixa_knowledge_sync_outbox item
  SET status = 'processing', attempts = attempts + 1, last_attempt_at = NOW(), updated_at = NOW()
  FROM claimed WHERE item.id = claimed.id
  RETURNING item.id, item.event_id, item.object_kind, item.object_id, item.organization_id,
    item.completed_at, CASE WHEN item.raw_body IS NULL THEN NULL ELSE encode(item.raw_body, 'base64') END;
END;
$$;

CREATE OR REPLACE FUNCTION freeze_helixa_knowledge_sync_payload(p_id UUID, p_raw_body_utf8 TEXT, p_payload_hash TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE frozen BYTEA;
BEGIN
  IF p_payload_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid payload hash'; END IF;
  UPDATE helixa_knowledge_sync_outbox
  SET raw_body = convert_to(p_raw_body_utf8, 'UTF8'), payload_hash = p_payload_hash, updated_at = NOW()
  WHERE id = p_id AND raw_body IS NULL
  RETURNING raw_body INTO frozen;
  IF frozen IS NULL THEN
    SELECT raw_body INTO frozen FROM helixa_knowledge_sync_outbox WHERE id = p_id;
  END IF;
  IF frozen IS NULL THEN
    RAISE EXCEPTION 'Unable to freeze payload';
  END IF;
  RETURN encode(frozen, 'base64');
END;
$$;

CREATE OR REPLACE FUNCTION reconcile_helixa_knowledge_sync_intent(
  p_event_id TEXT, p_object_kind TEXT, p_object_id UUID, p_organization_id UUID, p_completed_at TIMESTAMPTZ
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inserted_count INTEGER;
BEGIN
  IF p_object_kind NOT IN ('COURSE', 'ROLE_GUIDE') THEN RAISE EXCEPTION 'Unsupported knowledge object kind'; END IF;
  INSERT INTO helixa_knowledge_sync_outbox(event_id, object_kind, object_id, organization_id, completed_at)
  VALUES (p_event_id, p_object_kind, p_object_id, p_organization_id, p_completed_at)
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION claim_helixa_knowledge_sync_outbox(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION freeze_helixa_knowledge_sync_payload(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reconcile_helixa_knowledge_sync_intent(TEXT, TEXT, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_helixa_knowledge_sync_outbox(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION freeze_helixa_knowledge_sync_payload(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION reconcile_helixa_knowledge_sync_intent(TEXT, TEXT, UUID, UUID, TIMESTAMPTZ) TO service_role;

CREATE OR REPLACE FUNCTION enqueue_helixa_course_knowledge_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.generation_status = 'completed' AND NEW.generation_completed_at IS NOT NULL THEN
    INSERT INTO helixa_knowledge_sync_outbox(event_id, object_kind, object_id, organization_id, completed_at)
    VALUES ('mc2:COURSE:' || NEW.organization_id || ':' || NEW.id || ':' || to_char(NEW.generation_completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'COURSE', NEW.id, NEW.organization_id, NEW.generation_completed_at)
    ON CONFLICT (event_id) DO NOTHING;
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
    INSERT INTO helixa_knowledge_sync_outbox(event_id, object_kind, object_id, organization_id, completed_at)
    VALUES ('mc2:ROLE_GUIDE:' || NEW.organization_id || ':' || NEW.id || ':' || to_char(NEW.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'ROLE_GUIDE', NEW.id, NEW.organization_id, NEW.completed_at)
    ON CONFLICT (event_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enqueue_helixa_role_guide_knowledge_sync_trigger
AFTER INSERT OR UPDATE OF status, completed_at ON career_playbooks
FOR EACH ROW EXECUTE FUNCTION enqueue_helixa_role_guide_knowledge_sync();

COMMENT ON TABLE helixa_knowledge_sync_outbox IS
  'Dedicated durable intent and immutable raw request store for local MegaCampus-to-Helixa knowledge sync. Secrets and destination configuration are never persisted.';

COMMIT;
