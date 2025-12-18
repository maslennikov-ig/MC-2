/**
 * FSM Initialization Command Handler - Transactional Outbox Pattern
 *
 * @module shared/fsm/fsm-initialization-command-handler
 *
 * Orchestrates atomic FSM initialization using the Transactional Outbox pattern
 * to eliminate race conditions between FSM state creation and job queue operations.
 *
 * Three-Layer Idempotency Strategy:
 * 1. Redis cache (fast path, 24-hour TTL)
 * 2. PostgreSQL RPC transaction (atomic FSM + outbox creation)
 * 3. Redis cache write (for future requests)
 *
 * Architecture:
 * - Layer 1: Check Redis for cached result (idempotency fast path)
 * - Layer 2: Execute PostgreSQL RPC `initialize_fsm_with_outbox()` (atomic transaction)
 * - Layer 3: Cache result in Redis with 24-hour TTL
 *
 * Error Handling:
 * - Redis failures: Non-fatal, graceful degradation to database-only
 * - Database failures: Fatal, throw error to caller
 * - Idempotency: Return cached result if found (prevents duplicate FSM creation)
 *
 * Reference: TASK-2025-11-18-TRANSACTIONAL-OUTBOX-IMPLEMENTATION.md
 *
 * @see packages/shared-types/src/transactional-outbox.ts
 * @see packages/course-gen-platform/supabase/migrations/20251118094238_create_transactional_outbox_tables.sql
 */

import { getSupabaseAdmin } from '@/shared/supabase/admin';
import type { InitializeFSMCommand, InitializeFSMResult } from '@megacampus/shared-types/transactional-outbox';
import logger from '@/shared/logger';
import { getRedisClient } from '@/shared/cache/redis';
import { metricsStore } from '@/orchestrator/metrics';
import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import type { Database } from '@megacampus/shared-types';

interface InitializeRPCParams {
  p_entity_id: string;
  p_user_id: string;
  p_organization_id: string;
  p_idempotency_key: string;
  p_initiated_by: string;
  p_initial_state: string;
  p_job_data: unknown;
  p_metadata: unknown;
}

type SupabaseClientWithRpc = SupabaseClient<Database> & {
  rpc(
    fn: 'initialize_fsm_with_outbox',
    args: InitializeRPCParams
  ): Promise<{ data: Omit<InitializeFSMResult, 'fromCache'> | null; error: PostgrestError | null }>;
};

/**
 * Command Handler for FSM Initialization with Transactional Outbox
 *
 * Implements three-layer idempotency:
 * 1. Redis cache check (fast path)
 * 2. Database transaction (atomic FSM + outbox)
 * 3. Redis cache write (for future requests)
 *
 * Redis failures are handled gracefully (non-fatal) - system continues
 * to work with database-only idempotency if Redis is unavailable.
 *
 * Usage:
 * ```typescript
 * const handler = new InitializeFSMCommandHandler();
 * const result = await handler.handle({
 *   entityId: 'course-uuid',
 *   userId: 'user-uuid',
 *   organizationId: 'org-uuid',
 *   idempotencyKey: 'unique-request-key',
 *   initiatedBy: 'API',
 *   initialState: 'stage_2_init',
 *   data: { generation_id: 'gen-uuid' },
 *   jobs: [
 *     {
 *       queue: 'document-processing',
 *       data: { entityId: 'course-uuid' },
 *       options: { priority: 10 }
 *     }
 *   ]
 * });
 * ```
 */
export class InitializeFSMCommandHandler {
  private supabase = getSupabaseAdmin();
  private redis = getRedisClient();

  /**
   * Handle FSM initialization command
   *
   * Three-layer idempotency strategy:
   * 1. Check Redis cache for cached result (fast path, ~1ms)
   * 2. Execute PostgreSQL transaction if cache miss (~50-100ms)
   * 3. Cache result in Redis for 24 hours
   *
   * @param command - FSM initialization command with entity, user, jobs, etc.
   * @returns FSM initialization result with state, outbox entries, and cache status
   * @throws Error if database transaction fails
   */
  async handle(command: InitializeFSMCommand): Promise<InitializeFSMResult> {
    const startTime = Date.now();
    let fromCache = false;

    try {
      // Layer 1: Idempotency check (fast path - Redis cache)
      const cacheKey = `idempotency:${command.idempotencyKey}`;

      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          fromCache = true;
          const duration = Date.now() - startTime;

          // Track metrics: success from cache
          metricsStore.recordFSMInit(true, duration, true);

          logger.info(
            {
              entityId: command.entityId,
              idempotencyKey: command.idempotencyKey,
              initiatedBy: command.initiatedBy,
              duration,
            },
            'FSM initialization returned from Redis cache (fast path)'
          );

          return { ...JSON.parse(cached), fromCache: true };
        }
      } catch (redisError: unknown) {
        // Redis failures are non-fatal - graceful degradation to database-only
        logger.warn(
          {
            error: redisError instanceof Error ? redisError.message : String(redisError),
            idempotencyKey: command.idempotencyKey,
          },
          'Redis cache read failed - fallback to database transaction (graceful degradation)'
        );
        // Continue to database transaction
      }

      // Layer 2: Database transaction with outbox
      const result = await this.executeTransaction(command);

      // Layer 3: Cache result (24 hours TTL) - non-fatal if Redis down
      try {
        await this.redis.setex(cacheKey, 86400, JSON.stringify(result));
        logger.debug(
          {
            idempotencyKey: command.idempotencyKey,
            ttl: 86400,
          },
          'FSM initialization result cached in Redis (24-hour TTL)'
        );
      } catch (redisError: unknown) {
        // Redis failures are non-fatal - system continues without cache
        logger.warn(
          {
            error: redisError instanceof Error ? redisError.message : String(redisError),
            idempotencyKey: command.idempotencyKey,
          },
          'Redis cache write failed (non-fatal, system continues without cache)'
        );
      }

      const duration = Date.now() - startTime;

      // Track metrics: success from database
      metricsStore.recordFSMInit(true, duration, false);

      return { ...result, fromCache: false };
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Track metrics: failure
      metricsStore.recordFSMInit(false, duration, fromCache, errorMessage);

      throw error;
    }
  }

  /**
   * Execute database transaction for FSM initialization
   *
   * Calls PostgreSQL RPC function `initialize_fsm_with_outbox()` which:
   * 1. Checks idempotency_keys table for duplicate request
   * 2. Creates FSM state in generation_status table
   * 3. Inserts jobs into job_outbox table
   * 4. Records FSM_INITIALIZED event in fsm_events table
   * 5. Returns created state and outbox entries
   *
   * All operations are atomic within a single PostgreSQL transaction.
   *
   * @param command - FSM initialization command
   * @returns FSM state and outbox entries created by transaction
   * @throws Error if RPC call fails or transaction is rolled back
   */
  private async executeTransaction(
    command: InitializeFSMCommand
  ): Promise<Omit<InitializeFSMResult, 'fromCache'>> {
    // NOTE: This calls the RPC function created in Task 3
    // The RPC function signature is:
    //
    // CREATE FUNCTION initialize_fsm_with_outbox(
    //   p_entity_id UUID,
    //   p_user_id UUID,
    //   p_organization_id UUID,
    //   p_idempotency_key TEXT,
    //   p_initiated_by TEXT,
    //   p_initial_state TEXT,
    //   p_job_data JSONB,
    //   p_metadata JSONB
    // ) RETURNS JSONB
    //
    // For now, we use type assertion since RPC doesn't exist yet (Task 3 pending)

    const { data, error } = await (this.supabase as unknown as SupabaseClientWithRpc).rpc(
      'initialize_fsm_with_outbox',
      {
        p_entity_id: command.entityId,
        p_user_id: command.userId,
        p_organization_id: command.organizationId,
        p_idempotency_key: command.idempotencyKey,
        p_initiated_by: command.initiatedBy,
        p_initial_state: command.initialState,
        p_job_data: command.jobs,
        p_metadata: command.data,
      }
    );

    if (error) {
      logger.error(
        {
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          entityId: command.entityId,
          idempotencyKey: command.idempotencyKey,
          initiatedBy: command.initiatedBy,
        },
        'FSM initialization database transaction failed'
      );

      throw new Error(`FSM initialization failed: ${error.message}`);
    }

    if (!data) {
      logger.error(
        {
          entityId: command.entityId,
          idempotencyKey: command.idempotencyKey,
        },
        'FSM initialization returned no data (unexpected)'
      );

      throw new Error('FSM initialization failed: No data returned from database');
    }

    logger.info(
      {
        entityId: command.entityId,
        userId: command.userId,
        organizationId: command.organizationId,
        initiatedBy: command.initiatedBy,
        initialState: command.initialState,
        jobCount: command.jobs.length,
        fsmState: data.fsmState?.state,
        fsmVersion: data.fsmState?.version,
        outboxEntries: data.outboxEntries?.length,
      },
      'FSM initialized successfully via database transaction'
    );

    return data;
  }
}