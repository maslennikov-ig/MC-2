/**
 * Transactional Outbox Pattern Types
 * @module @megacampus/shared-types/transactional-outbox
 *
 * Defines TypeScript types for the Transactional Outbox infrastructure.
 * Eliminates race conditions between FSM initialization and job creation
 * by storing job metadata within PostgreSQL transactions.
 *
 * Architecture:
 * - job_outbox: Atomic job queue within PostgreSQL transaction
 * - idempotency_keys: Request deduplication for retry safety
 * - fsm_events: Audit trail for FSM state transitions
 *
 * Reference: packages/course-gen-platform/supabase/migrations/20251118094238_create_transactional_outbox_tables.sql
 */

import { z } from 'zod';

// ============================================================================
// FSM Event Types
// ============================================================================

/**
 * FSM Event Type - Event classification for audit trail
 *
 * Describes the type of state machine event that occurred:
 * - FSM_INITIALIZED: New FSM state created
 * - STATE_TRANSITIONED: FSM state changed
 * - JOB_CREATED: BullMQ job created from outbox
 * - JOB_COMPLETED: BullMQ job finished successfully
 * - JOB_FAILED: BullMQ job failed
 * - ERROR_OCCURRED: Error during processing
 */
export type FSMEventType =
  | 'FSM_INITIALIZED'
  | 'STATE_TRANSITIONED'
  | 'JOB_CREATED'
  | 'JOB_COMPLETED'
  | 'JOB_FAILED'
  | 'ERROR_OCCURRED';

/**
 * FSM Event Source - Who triggered the event
 *
 * Tracks the source of FSM state transitions:
 * - API: User request via tRPC/HTTP
 * - QUEUE: BullMQ job processing
 * - WORKER: Background processor
 * - ADMIN: Manual admin action
 * - TEST: Test harness
 */
export type FSMEventSource = 'API' | 'QUEUE' | 'WORKER' | 'ADMIN' | 'TEST';

// ============================================================================
// Table Interfaces (Database Schema)
// ============================================================================

/**
 * Job Outbox Entry - Transactional job queue row
 *
 * Represents a pending or processed job creation request stored within
 * a PostgreSQL transaction. The background processor polls this table
 * and creates BullMQ jobs asynchronously AFTER transaction commit.
 *
 * Lifecycle:
 * 1. INSERT (API within transaction)
 * 2. SELECT (background processor polling)
 * 3. UPDATE processed_at (after BullMQ job created)
 *
 * Retention: 30 days after processing (cleanup via pg_cron)
 *
 * Reference: job_outbox table schema
 */
export interface JobOutboxEntry {
  /** Unique identifier for outbox entry (not related to BullMQ job ID) */
  outbox_id: string;

  /** Foreign key to courses.id (course being generated) */
  entity_id: string;

  /** Target BullMQ queue name (e.g., "document-processing", "summarization") */
  queue_name: string;

  /** JSONB payload for BullMQ job.add(name, data) */
  job_data: Record<string, unknown>;

  /** JSONB options for BullMQ job.add(name, data, options) - priority, delay, attempts, etc. */
  job_options?: Record<string, unknown>;

  /** Timestamp when outbox entry was created (within transaction) */
  created_at: Date;

  /** Timestamp when BullMQ job was successfully created (NULL = pending) */
  processed_at: Date | null;

  /** Number of times processor attempted to create BullMQ job (for retry tracking) */
  attempts: number;

  /** Error message from last failed BullMQ job creation attempt */
  last_error: string | null;

  /** Timestamp of last processing attempt (successful or failed) */
  last_attempt_at: Date | null;
}

/**
 * Idempotency Key - Request deduplication record
 *
 * Prevents duplicate course generation requests on retry/refresh by
 * caching the result of the initial request. If a duplicate request
 * arrives within the expiration window, the cached result is returned.
 *
 * Lifecycle:
 * 1. INSERT (API on first request)
 * 2. SELECT (API on retry with same key)
 * 3. DELETE (cleanup via pg_cron after expiration)
 *
 * Retention: Expires after 24 hours (configurable via expires_at)
 *
 * Reference: idempotency_keys table schema
 */
export interface IdempotencyKey {
  /** Idempotency key from request header (X-Idempotency-Key) or generated from request hash */
  key: string;

  /** JSONB containing cached API response (course_id, status, etc.) for duplicate requests */
  result: Record<string, unknown>;

  /** Timestamp when key was first stored */
  created_at: Date;

  /** Expiration timestamp (default 24 hours) - keys deleted after this time */
  expires_at: Date;

  /** Foreign key to courses.id (course created by this request) */
  entity_id: string | null;
}

/**
 * FSM Event - Audit trail record
 *
 * Immutable log of all FSM state transitions for debugging and analytics.
 * Used to trace race conditions, understand state machine behavior, and
 * generate admin dashboards.
 *
 * Lifecycle:
 * 1. INSERT (trigger or application code)
 * 2. SELECT (admin dashboard, debugging)
 * 3. Never deleted (indefinite retention)
 *
 * Retention: Indefinite (consider partitioning by created_at for large volumes)
 *
 * Reference: fsm_events table schema
 */
export interface FSMEvent {
  /** Unique identifier for event (UUID) */
  event_id: string;

  /** Foreign key to courses.id (course experiencing state transition) */
  entity_id: string;

  /** Event type (e.g., "state_transition", "job_created", "error_occurred") */
  event_type: FSMEventType;

  /** JSONB containing event details: old_state, new_state, trigger_source, error_message, etc. */
  event_data: Record<string, unknown>;

  /** Timestamp when event occurred */
  created_at: Date;

  /** Source of event: API (user request), QUEUE (BullMQ job), WORKER (background processor) */
  created_by: FSMEventSource;

  /** User who triggered event (NULL for system-initiated events) */
  user_id: string | null;
}

// ============================================================================
// Command/Result Types (Application Layer)
// ============================================================================

/**
 * Initialize FSM Command - Input for FSM initialization RPC
 *
 * Encapsulates all data needed to initialize a new FSM state and
 * enqueue jobs atomically within a single PostgreSQL transaction.
 *
 * Used by API handlers to create new generation workflows with
 * guaranteed consistency between FSM state and job queue.
 *
 * Reference: TASK-2025-11-18-TRANSACTIONAL-OUTBOX-IMPLEMENTATION.md
 */
export interface InitializeFSMCommand {
  /** Course UUID (entity being initialized) */
  entityId: string;

  /** User UUID (for audit trail) */
  userId: string;

  /** Organization UUID (for RLS) */
  organizationId: string;

  /** Idempotency key for request deduplication (min 8 characters) */
  idempotencyKey: string;

  /** Source of initialization request */
  initiatedBy: FSMEventSource;

  /** Initial FSM state (e.g., 'stage_2_init', 'stage_4_init') */
  initialState: string;

  /** State-specific data to store in generation_status JSONB column */
  data: Record<string, unknown>;

  /** Jobs to create in outbox (will be processed asynchronously) */
  jobs: Array<{
    /** BullMQ queue name */
    queue: string;

    /** Job payload */
    data: Record<string, unknown>;

    /** Job options (priority, delay, attempts, etc.) */
    options?: Record<string, unknown>;
  }>;
}

/**
 * Initialize FSM Result - Output from FSM initialization RPC
 *
 * Returns the created FSM state, outbox entries, and cache status
 * to the caller. If the request was deduplicated via idempotency key,
 * fromCache will be true and the original result will be returned.
 *
 * Reference: TASK-2025-11-18-TRANSACTIONAL-OUTBOX-IMPLEMENTATION.md
 */
export interface InitializeFSMResult {
  /** Created FSM state metadata */
  fsmState: {
    /** Course UUID */
    entity_id: string;

    /** FSM state name (e.g., 'stage_2_init') */
    state: string;

    /** State version (increments on each transition) */
    version: number;

    /** User who initiated state */
    created_by: string;

    /** Timestamp when state was created */
    created_at: Date;
  };

  /** Created outbox entries (pending BullMQ job creation) */
  outboxEntries: JobOutboxEntry[];

  /** Whether result was returned from idempotency cache */
  fromCache: boolean;
}

// ============================================================================
// Zod Schemas (Runtime Validation)
// ============================================================================

/**
 * FSM Event Type Schema - Runtime validation for event types
 */
export const FSMEventTypeSchema = z.enum([
  'FSM_INITIALIZED',
  'STATE_TRANSITIONED',
  'JOB_CREATED',
  'JOB_COMPLETED',
  'JOB_FAILED',
  'ERROR_OCCURRED',
]);

/**
 * FSM Event Source Schema - Runtime validation for event sources
 */
export const FSMEventSourceSchema = z.enum(['API', 'QUEUE', 'WORKER', 'ADMIN', 'TEST']);

/**
 * Job Outbox Entry Schema - Runtime validation for outbox entries
 *
 * Used to validate data read from job_outbox table before processing.
 */
export const JobOutboxEntrySchema = z.object({
  outbox_id: z.string().uuid(),
  entity_id: z.string().uuid(),
  queue_name: z.string().min(1),
  job_data: z.record(z.unknown()),
  job_options: z.record(z.unknown()).optional(),
  created_at: z.date(),
  processed_at: z.date().nullable(),
  attempts: z.number().int().min(0),
  last_error: z.string().nullable(),
  last_attempt_at: z.date().nullable(),
});

/**
 * Idempotency Key Schema - Runtime validation for idempotency keys
 *
 * Used to validate data read from idempotency_keys table.
 */
export const IdempotencyKeySchema = z.object({
  key: z.string().min(8),
  result: z.record(z.unknown()),
  created_at: z.date(),
  expires_at: z.date(),
  entity_id: z.string().uuid().nullable(),
});

/**
 * FSM Event Schema - Runtime validation for FSM events
 *
 * Used to validate data read from fsm_events table.
 */
export const FSMEventSchema = z.object({
  event_id: z.string().uuid(),
  entity_id: z.string().uuid(),
  event_type: FSMEventTypeSchema,
  event_data: z.record(z.unknown()),
  created_at: z.date(),
  created_by: FSMEventSourceSchema,
  user_id: z.string().uuid().nullable(),
});

/**
 * Initialize FSM Command Schema - Runtime validation for command input
 *
 * Validates input to FSM initialization RPC. Ensures all required fields
 * are present and correctly typed before executing transaction.
 */
export const InitializeFSMCommandSchema = z.object({
  entityId: z.string().uuid(),
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
  idempotencyKey: z.string().min(8),
  initiatedBy: FSMEventSourceSchema,
  initialState: z.string().min(1),
  data: z.record(z.unknown()),
  jobs: z.array(
    z.object({
      queue: z.string().min(1),
      data: z.record(z.unknown()),
      options: z.record(z.unknown()).optional(),
    })
  ),
});

/**
 * Initialize FSM Result Schema - Runtime validation for command result
 *
 * Validates output from FSM initialization RPC before returning to caller.
 */
export const InitializeFSMResultSchema = z.object({
  fsmState: z.object({
    entity_id: z.string().uuid(),
    state: z.string().min(1),
    version: z.number().int().min(0),
    created_by: z.string().uuid(),
    created_at: z.date(),
  }),
  outboxEntries: z.array(JobOutboxEntrySchema),
  fromCache: z.boolean(),
});

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate job outbox entry
 * @param entry - Raw entry data to validate
 * @returns Validation result with parsed data or errors
 */
export function validateJobOutboxEntry(entry: unknown) {
  return JobOutboxEntrySchema.safeParse(entry);
}

/**
 * Validate idempotency key
 * @param key - Raw key data to validate
 * @returns Validation result with parsed data or errors
 */
export function validateIdempotencyKey(key: unknown) {
  return IdempotencyKeySchema.safeParse(key);
}

/**
 * Validate FSM event
 * @param event - Raw event data to validate
 * @returns Validation result with parsed data or errors
 */
export function validateFSMEvent(event: unknown) {
  return FSMEventSchema.safeParse(event);
}

/**
 * Validate initialize FSM command
 * @param command - Raw command data to validate
 * @returns Validation result with parsed data or errors
 */
export function validateInitializeFSMCommand(command: unknown) {
  return InitializeFSMCommandSchema.safeParse(command);
}

/**
 * Validate initialize FSM result
 * @param result - Raw result data to validate
 * @returns Validation result with parsed data or errors
 */
export function validateInitializeFSMResult(result: unknown) {
  return InitializeFSMResultSchema.safeParse(result);
}
