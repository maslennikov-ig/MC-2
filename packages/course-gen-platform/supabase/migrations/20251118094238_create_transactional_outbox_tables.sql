-- ============================================================================
-- Transactional Outbox Infrastructure
-- Purpose: Eliminate race conditions between FSM initialization and job creation
-- Date: 2025-11-18
-- Investigation: TASK-2025-11-18-TRANSACTIONAL-OUTBOX-IMPLEMENTATION.md
-- ============================================================================
--
-- Problem:
--   Current architecture creates BullMQ jobs BEFORE FSM state initialization,
--   leading to "Invalid state transition" errors when workers execute before
--   database commit completes.
--
-- Solution:
--   Implement Transactional Outbox pattern with 3 tables:
--   1. job_outbox: Atomic job queue within PostgreSQL transaction
--   2. idempotency_keys: Request deduplication for retry safety
--   3. fsm_events: Audit trail for FSM state transitions
--
--   Background processor reads outbox → creates BullMQ jobs asynchronously
--   AFTER PostgreSQL transaction commits, guaranteeing FSM state exists.
--
-- Architecture:
--   API Request → BEGIN TRANSACTION
--     1. Initialize FSM state in courses.generation_status
--     2. Insert job metadata to job_outbox
--     3. Store idempotency key with course_id
--   COMMIT TRANSACTION (atomic)
--
--   Background Processor (polling):
--     1. SELECT unprocessed entries from job_outbox
--     2. Create BullMQ jobs for each entry
--     3. Mark job_outbox.processed_at = NOW()
--
-- ============================================================================

-- ============================================================================
-- Table 1: job_outbox (Transactional Job Queue)
-- ============================================================================
-- Purpose: Store job creation requests within PostgreSQL transaction
-- Lifecycle: INSERT (API) → SELECT (processor) → UPDATE processed_at (processor)
-- Retention: 30 days after processing (cleanup via pg_cron)

CREATE TABLE IF NOT EXISTS job_outbox (
  -- Primary Key
  outbox_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign Key: Links to course entity
  entity_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

  -- Job Metadata
  queue_name VARCHAR(100) NOT NULL CHECK (length(queue_name) > 0),
  job_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  job_options JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Processing State
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ DEFAULT NULL,
  attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT DEFAULT NULL,
  last_attempt_at TIMESTAMPTZ DEFAULT NULL
);

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_job_outbox_unprocessed
  ON job_outbox(created_at)
  WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_job_outbox_entity
  ON job_outbox(entity_id);

CREATE INDEX IF NOT EXISTS idx_job_outbox_cleanup
  ON job_outbox(processed_at)
  WHERE processed_at IS NOT NULL;

-- Table Comment
COMMENT ON TABLE job_outbox IS 'Transactional job queue for BullMQ. Ensures jobs created AFTER FSM state initialization via atomic PostgreSQL commit.';

-- Column Comments
COMMENT ON COLUMN job_outbox.outbox_id IS 'Unique identifier for outbox entry (not related to BullMQ job ID)';
COMMENT ON COLUMN job_outbox.entity_id IS 'Foreign key to courses.id (course being generated)';
COMMENT ON COLUMN job_outbox.queue_name IS 'Target BullMQ queue name (e.g., "document-processing", "summarization")';
COMMENT ON COLUMN job_outbox.job_data IS 'JSONB payload for BullMQ job.add(name, data)';
COMMENT ON COLUMN job_outbox.job_options IS 'JSONB options for BullMQ job.add(name, data, options) - priority, delay, attempts, etc.';
COMMENT ON COLUMN job_outbox.created_at IS 'Timestamp when outbox entry was created (within transaction)';
COMMENT ON COLUMN job_outbox.processed_at IS 'Timestamp when BullMQ job was successfully created (NULL = pending)';
COMMENT ON COLUMN job_outbox.attempts IS 'Number of times processor attempted to create BullMQ job (for retry tracking)';
COMMENT ON COLUMN job_outbox.last_error IS 'Error message from last failed BullMQ job creation attempt';
COMMENT ON COLUMN job_outbox.last_attempt_at IS 'Timestamp of last processing attempt (successful or failed)';

-- ============================================================================
-- Table 2: idempotency_keys (Request Deduplication)
-- ============================================================================
-- Purpose: Prevent duplicate course generation requests on retry/refresh
-- Lifecycle: INSERT (API) → SELECT (API on retry) → DELETE (cleanup via pg_cron)
-- Retention: Expires after 24 hours (configurable via expires_at)

CREATE TABLE IF NOT EXISTS idempotency_keys (
  -- Primary Key: User-provided or generated idempotency key
  key VARCHAR(255) PRIMARY KEY CHECK (length(key) >= 8),

  -- Stored Result: Return cached response for duplicate requests
  result JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),

  -- Foreign Key: Links to created course entity
  entity_id UUID REFERENCES courses(id) ON DELETE CASCADE
);

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_idempotency_expires
  ON idempotency_keys(expires_at);

CREATE INDEX IF NOT EXISTS idx_idempotency_entity
  ON idempotency_keys(entity_id);

-- Table Comment
COMMENT ON TABLE idempotency_keys IS 'Request deduplication for API idempotency. Caches course creation results for 24 hours to handle retries safely.';

-- Column Comments
COMMENT ON COLUMN idempotency_keys.key IS 'Idempotency key from request header (X-Idempotency-Key) or generated from request hash';
COMMENT ON COLUMN idempotency_keys.result IS 'JSONB containing cached API response (course_id, status, etc.) for duplicate requests';
COMMENT ON COLUMN idempotency_keys.created_at IS 'Timestamp when key was first stored';
COMMENT ON COLUMN idempotency_keys.expires_at IS 'Expiration timestamp (default 24 hours) - keys deleted after this time';
COMMENT ON COLUMN idempotency_keys.entity_id IS 'Foreign key to courses.id (course created by this request)';

-- ============================================================================
-- Table 3: fsm_events (Audit Trail)
-- ============================================================================
-- Purpose: Immutable log of all FSM state transitions for debugging/analytics
-- Lifecycle: INSERT (trigger) → SELECT (admin dashboard) → Never deleted
-- Retention: Indefinite (consider partitioning by created_at for large volumes)

CREATE TABLE IF NOT EXISTS fsm_events (
  -- Primary Key
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign Key: Links to course entity
  entity_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

  -- Event Metadata
  event_type VARCHAR(50) NOT NULL CHECK (length(event_type) > 0),
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Audit Fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(20) NOT NULL CHECK (created_by IN ('API', 'QUEUE', 'WORKER')),
  user_id UUID DEFAULT NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_fsm_events_entity
  ON fsm_events(entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fsm_events_type
  ON fsm_events(event_type);

-- Table Comment
COMMENT ON TABLE fsm_events IS 'Immutable audit trail of FSM state transitions. Used for debugging race conditions and analytics.';

-- Column Comments
COMMENT ON COLUMN fsm_events.event_id IS 'Unique identifier for event (UUID)';
COMMENT ON COLUMN fsm_events.entity_id IS 'Foreign key to courses.id (course experiencing state transition)';
COMMENT ON COLUMN fsm_events.event_type IS 'Event type (e.g., "state_transition", "job_created", "error_occurred")';
COMMENT ON COLUMN fsm_events.event_data IS 'JSONB containing event details: old_state, new_state, trigger_source, error_message, etc.';
COMMENT ON COLUMN fsm_events.created_at IS 'Timestamp when event occurred';
COMMENT ON COLUMN fsm_events.created_by IS 'Source of event: API (user request), QUEUE (BullMQ job), WORKER (background processor)';
COMMENT ON COLUMN fsm_events.user_id IS 'User who triggered event (NULL for system-initiated events)';

-- ============================================================================
-- Cleanup Functions
-- ============================================================================

-- Function 1: Cleanup expired idempotency keys (daily)
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys()
RETURNS void AS $$
DECLARE
  v_deleted_count INT;
BEGIN
  DELETE FROM idempotency_keys WHERE expires_at < NOW();
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Log cleanup to system_metrics
  INSERT INTO system_metrics (event_type, severity, metadata)
  VALUES (
    'orphaned_job_recovery'::metric_event_type,
    'info'::metric_severity,
    jsonb_build_object(
      'cleanup_type', 'idempotency_keys',
      'deleted_count', v_deleted_count,
      'timestamp', NOW()
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_expired_idempotency_keys IS 'Delete expired idempotency keys (runs daily via pg_cron). Logs cleanup count to system_metrics.';

-- Function 2: Cleanup old processed outbox entries (weekly)
CREATE OR REPLACE FUNCTION cleanup_old_outbox_entries()
RETURNS void AS $$
DECLARE
  v_deleted_count INT;
BEGIN
  DELETE FROM job_outbox
  WHERE processed_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Log cleanup to system_metrics
  INSERT INTO system_metrics (event_type, severity, metadata)
  VALUES (
    'orphaned_job_recovery'::metric_event_type,
    'info'::metric_severity,
    jsonb_build_object(
      'cleanup_type', 'job_outbox',
      'deleted_count', v_deleted_count,
      'retention_days', 30,
      'timestamp', NOW()
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_old_outbox_entries IS 'Delete processed outbox entries older than 30 days (runs weekly via pg_cron). Logs cleanup count to system_metrics.';

-- ============================================================================
-- Row-Level Security (RLS) Policies
-- ============================================================================
-- Security Model: System-only access - no direct user/service queries allowed
-- All access must go through background processor or application RPCs

-- Enable RLS on all tables
ALTER TABLE job_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE fsm_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policy 1: job_outbox - Block ALL direct access
-- ============================================================================
-- Rationale: Job outbox is internal infrastructure table
-- Access pattern: Only via background processor (service_role with RLS bypass)

DROP POLICY IF EXISTS job_outbox_system_only ON job_outbox;
CREATE POLICY job_outbox_system_only ON job_outbox
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON POLICY job_outbox_system_only ON job_outbox IS 'Block ALL direct access. Access only via service_role (RLS bypass) or application RPCs.';

-- ============================================================================
-- RLS Policy 2: idempotency_keys - Block ALL direct access
-- ============================================================================
-- Rationale: Idempotency keys are internal infrastructure table
-- Access pattern: Only via API middleware (service_role with RLS bypass)

DROP POLICY IF EXISTS idempotency_keys_system_only ON idempotency_keys;
CREATE POLICY idempotency_keys_system_only ON idempotency_keys
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON POLICY idempotency_keys_system_only ON idempotency_keys IS 'Block ALL direct access. Access only via service_role (RLS bypass) or application RPCs.';

-- ============================================================================
-- RLS Policy 3: fsm_events - Allow SELECT for authenticated users (own events)
-- ============================================================================
-- Rationale: Users can view audit trail for their own courses
-- Write access: System only (triggers, background processors)

DROP POLICY IF EXISTS fsm_events_user_read ON fsm_events;
CREATE POLICY fsm_events_user_read ON fsm_events
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR
    auth.jwt() ->> 'role' = 'service_role'
  );

COMMENT ON POLICY fsm_events_user_read ON fsm_events IS 'Allow users to read their own FSM events. Allow service_role to read all events.';

DROP POLICY IF EXISTS fsm_events_system_write ON fsm_events;
CREATE POLICY fsm_events_system_write ON fsm_events
  FOR INSERT
  WITH CHECK (false);

COMMENT ON POLICY fsm_events_system_write ON fsm_events IS 'Block direct INSERT. Events created via service_role (RLS bypass) or database triggers only.';

-- ============================================================================
-- pg_cron Jobs (Automated Cleanup)
-- ============================================================================
-- Requires pg_cron extension (already installed per list_extensions output)
-- Jobs run in UTC timezone

-- Job 1: Daily cleanup of expired idempotency keys (3 AM UTC)
DO $cron_setup$
BEGIN
  -- Check if job already exists (avoid duplicate on migration replay)
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'cleanup_expired_idempotency_keys'
  ) THEN
    PERFORM cron.schedule(
      'cleanup_expired_idempotency_keys',
      '0 3 * * *',
      'SELECT cleanup_expired_idempotency_keys();'
    );
  END IF;
END $cron_setup$;

-- Job 2: Weekly cleanup of old outbox entries (Sunday 2 AM UTC)
DO $cron_setup2$
BEGIN
  -- Check if job already exists (avoid duplicate on migration replay)
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'cleanup_old_outbox_entries'
  ) THEN
    PERFORM cron.schedule(
      'cleanup_old_outbox_entries',
      '0 2 * * 0',
      'SELECT cleanup_old_outbox_entries();'
    );
  END IF;
END $cron_setup2$;

-- ============================================================================
-- Grant Permissions
-- ============================================================================
-- Background processor and API middleware use service_role (bypasses RLS)
-- No need for GRANT here - service_role has superuser privileges

-- Grant execute permissions for cleanup functions to service_role
GRANT EXECUTE ON FUNCTION cleanup_expired_idempotency_keys TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_outbox_entries TO service_role;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Created Tables:
--   1. job_outbox (3 indexes, 1 FK)
--   2. idempotency_keys (2 indexes, 1 FK)
--   3. fsm_events (2 indexes, 2 FKs)
--
-- Created Functions:
--   1. cleanup_expired_idempotency_keys (daily via pg_cron)
--   2. cleanup_old_outbox_entries (weekly via pg_cron)
--
-- Created RLS Policies:
--   1. job_outbox_system_only (block all)
--   2. idempotency_keys_system_only (block all)
--   3. fsm_events_user_read (allow SELECT for own events)
--   4. fsm_events_system_write (block INSERT)
--
-- Created pg_cron Jobs:
--   1. cleanup_expired_idempotency_keys (daily 3 AM UTC)
--   2. cleanup_old_outbox_entries (weekly Sunday 2 AM UTC)
--
-- Next Steps:
--   1. Implement background processor (polls job_outbox every 100ms)
--   2. Update API handlers to use transactional outbox pattern
--   3. Add idempotency middleware to API routes
--   4. Create monitoring dashboard for outbox processing lag
--
-- Testing:
--   1. Verify FK cascades: DELETE course → CASCADE to all 3 tables
--   2. Verify RLS blocks direct access (SELECT should return 0 rows)
--   3. Verify cleanup functions run without errors
--   4. Verify pg_cron jobs scheduled (SELECT * FROM cron.job)
--
-- Performance Notes:
--   - idx_job_outbox_unprocessed: Partial index for fast polling
--   - Outbox processing lag target: <1 second (monitor via system_metrics)
--   - Cleanup retention: 30 days outbox, 24 hours idempotency
--
-- Security Notes:
--   - ALL tables use RLS with restrictive policies
--   - Direct access blocked - only service_role can bypass
--   - Audit trail (fsm_events) is immutable (no UPDATE/DELETE policies)
--
