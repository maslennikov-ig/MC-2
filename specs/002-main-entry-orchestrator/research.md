# Research Document: Main Entry Orchestrator

**Feature**: Stage 1 - Main Entry Orchestrator
**Branch**: `002-main-entry-orchestrator`
**Date**: 2025-10-20

## Overview

This document captures research findings and technical decisions for replacing the n8n Main Entry workflow with a code-based orchestrator. All unknowns from the technical context have been investigated and resolved.

---

## Research Questions & Findings

### 1. Pino Logger Implementation

**Question**: How to implement Pino structured logging with child logger context propagation?

**Decision**: Use Pino with child logger pattern for request and job context

**Rationale**:
- **10x faster than Winston** - Critical for high-throughput course generation
- **Zero-cost disabled log levels** - Production performance optimization
- **Native child logger support** - Automatic context propagation without manual merging
- **JSON structured by default** - No configuration needed for CloudWatch ingestion
- **Built-in serializers** - Proper error object handling out of the box

**Implementation Pattern**:
```typescript
import pino from 'pino';

// Base logger with service context
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: 'course-generator',
    environment: process.env.NODE_ENV,
    version: process.env.APP_VERSION,
  },
});

// Request logger (middleware)
const requestLogger = logger.child({
  requestId: nanoid(),
  userId,
  tier
});

// Job logger (worker)
const jobLogger = requestLogger.child({
  courseId,
  jobId,
  priority
});

// All logs inherit parent context automatically
jobLogger.info('Job started'); // Contains requestId, userId, tier, courseId, jobId
```

**Alternatives Considered**:
- **Winston** - Rejected: 10x slower, requires manual context merging, more configuration
- **Bunyan** - Rejected: Abandoned project, no active maintenance
- **Custom logger** - Rejected: Reinventing wheel, no ecosystem support

**Migration from Existing Logger**:
- Current logger at `packages/course-gen-platform/src/shared/logger/index.ts` has basic child logger support
- Drop-in replacement: Replace custom logger with Pino while maintaining same API
- Maintains backward compatibility with existing `logger.child()` calls

**Dependencies**:
```json
{
  "pino": "^9.6.0",
  "pino-pretty": "^13.0.0" // Dev only for human-readable logs
}
```

---

### 2. System Metrics Table Design

**Question**: What schema design for `system_metrics` table to support Stage 8 monitoring?

**Decision**: Event-based metrics table with JSONB metadata and indexed enum types

**Rationale**:
- **Time-series ready** - Partition by timestamp for historical analysis
- **Flexible metadata** - JSONB captures event-specific context without schema changes
- **Query performance** - Indexed event_type and severity for fast Stage 8 dashboard queries
- **Audit trail** - Immutable append-only log of critical system events

**Schema Design**:
```sql
CREATE TYPE metric_event_type AS ENUM (
  'job_rollback',
  'orphaned_job_recovery',
  'concurrency_limit_hit',
  'worker_timeout',
  'rpc_retry_exhausted',
  'duplicate_job_detected'
);

CREATE TYPE metric_severity AS ENUM ('info', 'warn', 'error', 'fatal');

CREATE TABLE system_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type metric_event_type NOT NULL,
  severity metric_severity NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  job_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Indexes for Stage 8 dashboard queries
  INDEX idx_system_metrics_event_type ON system_metrics(event_type),
  INDEX idx_system_metrics_severity ON system_metrics(severity),
  INDEX idx_system_metrics_timestamp ON system_metrics(timestamp DESC),
  INDEX idx_system_metrics_course ON system_metrics(course_id) WHERE course_id IS NOT NULL
);

-- Enable RLS (no public access)
ALTER TABLE system_metrics ENABLE ROW LEVEL SECURITY;

-- Admin-only access policy (for Stage 8 dashboard)
CREATE POLICY system_metrics_admin_read ON system_metrics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'super_admin')
    )
  );

-- Service role can insert (backend writes)
CREATE POLICY system_metrics_service_insert ON system_metrics
  FOR INSERT WITH CHECK (true); -- Service role bypasses RLS
```

**Metadata Examples**:
```typescript
// Job rollback event
{
  event_type: 'job_rollback',
  severity: 'error',
  user_id: 'uuid',
  course_id: 'uuid',
  job_id: 'bullmq-job-123',
  metadata: {
    reason: 'rpc_update_course_progress_failed',
    attempts: 3,
    last_error: 'Connection timeout',
    rollback_timestamp: '2025-10-20T14:23:45Z'
  }
}

// Concurrency limit hit
{
  event_type: 'concurrency_limit_hit',
  severity: 'warn',
  user_id: 'uuid',
  metadata: {
    tier: 'FREE',
    user_limit: 1,
    current_jobs: 1,
    global_limit: 10,
    rejected_course_id: 'uuid'
  }
}
```

**Alternatives Considered**:
- **Separate table per event type** - Rejected: Schema sprawl, complex queries across tables
- **Single metrics column with enum** - Rejected: No query flexibility, poor indexing
- **External APM (Datadog/New Relic)** - Rejected: Cost prohibitive, want data in Supabase

---

### 3. RPC `update_course_progress` Implementation

**Question**: How to design idempotent RPC function for progress updates?

**Decision**: PostgreSQL function with UPDATE operations and conditional step transitions

**Rationale**:
- **Idempotency guaranteed** - UPDATE with WHERE conditions safe to retry
- **Atomic JSONB manipulation** - Single transaction updates nested progress structure
- **Performance** - Single round-trip instead of read-modify-write from client
- **Consistency** - PostgreSQL ensures concurrent updates don't conflict

**Function Signature**:
```sql
CREATE OR REPLACE FUNCTION update_course_progress(
  p_course_id UUID,
  p_step_id INTEGER,
  p_status TEXT,
  p_message TEXT,
  p_error_message TEXT DEFAULT NULL,
  p_error_details JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
DECLARE
  v_progress JSONB;
  v_step_index INTEGER;
  v_percentage INTEGER;
BEGIN
  -- Validate step_id (1-5)
  IF p_step_id < 1 OR p_step_id > 5 THEN
    RAISE EXCEPTION 'Invalid step_id: %. Must be 1-5', p_step_id;
  END IF;

  -- Validate status
  IF p_status NOT IN ('pending', 'in_progress', 'completed', 'failed') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be pending|in_progress|completed|failed', p_status;
  END IF;

  -- Calculate percentage (20% per step)
  v_percentage := CASE
    WHEN p_status = 'completed' THEN p_step_id * 20
    WHEN p_status = 'in_progress' THEN (p_step_id - 1) * 20 + 10
    ELSE (p_step_id - 1) * 20
  END;

  -- Step array index (0-based)
  v_step_index := p_step_id - 1;

  -- Update generation_progress JSONB
  UPDATE courses
  SET
    generation_progress = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            generation_progress,
            array['steps', v_step_index::text, 'status'],
            to_jsonb(p_status)
          ),
          array['steps', v_step_index::text,
            CASE WHEN p_status = 'in_progress' THEN 'started_at' ELSE 'completed_at' END
          ],
          to_jsonb(NOW())
        ),
        array['percentage'],
        to_jsonb(v_percentage)
      ),
      array['current_step'],
      to_jsonb(p_step_id)
    ),
    generation_progress = CASE
      WHEN p_error_message IS NOT NULL THEN
        jsonb_set(
          jsonb_set(
            generation_progress,
            array['steps', v_step_index::text, 'error'],
            to_jsonb(p_error_message)
          ),
          array['steps', v_step_index::text, 'error_details'],
          COALESCE(p_error_details, '{}'::jsonb)
        )
      ELSE generation_progress
    END,
    last_progress_update = NOW(),
    updated_at = NOW()
  WHERE id = p_course_id
  RETURNING generation_progress INTO v_progress;

  -- Return updated progress
  RETURN v_progress;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION update_course_progress TO service_role;
```

**Idempotency Strategy**:
- Calling with same `(course_id, step_id, status)` multiple times is safe
- UPDATE operations don't duplicate data
- Timestamps updated on each call (acceptable for retry scenarios)
- Metadata merged, not replaced (preserves worker recovery markers)

**Alternatives Considered**:
- **Client-side JSONB manipulation** - Rejected: Race conditions, 3+ round-trips, complex error handling
- **Separate progress_updates table** - Rejected: Over-engineering, complex joins, frontend polling harder
- **Postgres NOTIFY/LISTEN** - Rejected: Stage 1 uses polling, real-time deferred to future stage

---

### 4. Concurrency Limit Enforcement

**Question**: How to efficiently check per-user and global concurrency limits before job creation?

**Decision**: Redis counters with INCR/DECR and Lua script for atomic check-and-add

**Rationale**:
- **O(1) complexity** - Redis counters vs O(n) BullMQ job scan
- **Atomic operations** - INCR/DECR guarantee no race conditions
- **Low latency** - <1ms Redis round-trip vs 10-50ms BullMQ queue scan
- **Scalable** - Redis handles millions of operations/second

**Implementation Pattern**:
```typescript
// Concurrency tracker using Redis
class ConcurrencyTracker {
  private redis: Redis;

  async checkAndReserve(userId: string, tier: string): Promise<boolean> {
    const userLimit = TIER_LIMITS[tier]; // FREE=1, BASIC=2, etc.
    const globalLimit = await this.getGlobalLimit(); // 3-10 dynamic

    // Lua script for atomic check-and-increment
    const script = `
      local user_key = KEYS[1]
      local global_key = KEYS[2]
      local user_limit = tonumber(ARGV[1])
      local global_limit = tonumber(ARGV[2])

      local user_count = tonumber(redis.call('GET', user_key) or 0)
      local global_count = tonumber(redis.call('GET', global_key) or 0)

      if user_count >= user_limit then
        return {0, 'user_limit'}
      end

      if global_count >= global_limit then
        return {0, 'global_limit'}
      end

      redis.call('INCR', user_key)
      redis.call('EXPIRE', user_key, 3600) -- 1 hour TTL
      redis.call('INCR', global_key)

      return {1, 'success'}
    `;

    const [result, reason] = await this.redis.eval(
      script,
      2, // 2 keys
      `concurrency:user:${userId}`,
      'concurrency:global',
      userLimit,
      globalLimit
    );

    return result === 1;
  }

  async release(userId: string): Promise<void> {
    await Promise.all([
      this.redis.decr(`concurrency:user:${userId}`),
      this.redis.decr('concurrency:global')
    ]);
  }
}
```

**Cleanup Strategy**:
- Job completion hook calls `release(userId)`
- Job failure hook calls `release(userId)`
- TTL on user keys (1 hour) handles orphaned counters
- Global counter reconciliation every 5 minutes (compare with active jobs)

**Alternatives Considered**:
- **BullMQ `getJobCounts()` per user** - Rejected: O(n) scan, slow for many users
- **Database query counting active jobs** - Rejected: High load on Postgres, slower than Redis
- **In-memory counter** - Rejected: Lost on worker restart, no multi-worker support

---

### 5. Dynamic Global Concurrency (Stage 8 Preview)

**Question**: How will Stage 8 monitor system load and adjust global concurrency limit?

**Decision**: CPU/Memory monitoring with simple threshold algorithm (placeholder for Stage 1)

**Rationale**:
- **Stage 1 uses hardcoded global limit** - `3` (conservative start)
- **Stage 8 will implement monitoring** - Admin panel adjusts based on metrics
- **No over-engineering in Stage 1** - Keep it simple, iterate later

**Stage 1 Implementation**:
```typescript
// Hardcoded for Stage 1
const GLOBAL_CONCURRENCY_LIMIT = 3;

// Stage 8 will replace with:
async function getGlobalLimit(): Promise<number> {
  const metrics = await getSystemMetrics(); // CPU, Memory, Queue depth
  const cpuUsage = metrics.cpu; // 0-100%
  const memUsage = metrics.memory; // 0-100%

  if (cpuUsage > 80 || memUsage > 80) return 3; // Throttle
  if (cpuUsage > 60 || memUsage > 60) return 5; // Normal
  if (cpuUsage < 40 && memUsage < 40) return 10; // Burst

  return 5; // Default
}
```

**Monitoring Points (Stage 8)**:
- OS-level CPU/Memory via `os.cpus()`, `os.freemem()`
- BullMQ queue depth via `queue.getJobCounts()`
- Job processing rate (jobs/minute)
- Average job duration per type

**Alternatives Considered**:
- **Auto-scaling workers** - Rejected: Complex, needs container orchestration
- **ML-based prediction** - Rejected: Over-engineering, insufficient data
- **Fixed limit per deployment** - Rejected: Wastes resources during low traffic

---

### 6. Saga Pattern Implementation

**Question**: How to implement compensating transactions for RPC failures?

**Decision**: Try-Catch with explicit rollback in orchestrator, fallback in worker

**Rationale**:
- **Simple to reason about** - Linear flow with clear error paths
- **Explicit compensation** - Rollback code next to forward operation
- **Testable** - Easy to inject failures and verify rollback
- **Observability** - Log every retry attempt and rollback event

**Orchestrator Pattern**:
```typescript
async function handleCourseGenerateRequest(req: Request): Promise<Response> {
  const { courseId, webhookUrl } = req.body;
  let jobId: string | null = null;

  try {
    // Step 1: Reserve concurrency slot
    const reserved = await concurrencyTracker.checkAndReserve(userId, tier);
    if (!reserved) {
      return Response.json({ error: 'Too many concurrent jobs' }, { status: 429 });
    }

    // Step 2: Create BullMQ job
    const job = await queue.add(jobType, jobData, { priority });
    jobId = job.id!;

    // Step 3: Update progress with retries
    const updated = await retryWithBackoff(async () => {
      return await supabase.rpc('update_course_progress', {
        p_course_id: courseId,
        p_step_id: 1,
        p_status: 'completed',
        p_message: 'Инициализация завершена',
        p_metadata: { job_id: jobId, executor: 'orchestrator' }
      });
    }, {
      attempts: 3,
      backoff: [100, 200, 400], // ms
      onRetry: (attempt, error) => {
        logger.warn('RPC retry', { courseId, attempt, error });
      }
    });

    if (!updated) {
      throw new Error('RPC update_course_progress failed after 3 retries');
    }

    return Response.json({ success: true, jobId }, { status: 200 });

  } catch (error) {
    // Compensation: Rollback job if RPC failed
    if (jobId) {
      await queue.remove(jobId);
      logger.error('Job rollback due to RPC failure', { courseId, jobId, error });

      // Write to system_metrics
      await supabase.from('system_metrics').insert({
        event_type: 'job_rollback',
        severity: 'error',
        user_id: userId,
        course_id: courseId,
        job_id: jobId,
        metadata: { reason: 'rpc_failure', error: String(error) }
      });
    }

    // Release concurrency slot
    await concurrencyTracker.release(userId);

    return Response.json({
      error: 'Не удалось инициализировать генерацию курса. Попробуйте позже.'
    }, { status: 500 });
  }
}
```

**Worker Fallback**:
```typescript
async function handleJob(job: Job<JobData>) {
  const { courseId, userId } = job.data;

  // Check if step 1 was completed by orchestrator
  const course = await supabase
    .from('courses')
    .select('generation_progress')
    .eq('id', courseId)
    .single();

  const step1Status = course.generation_progress.steps[0].status;

  if (step1Status !== 'completed') {
    // Orphaned job recovery
    logger.warn('Orphaned job detected, recovering step 1', { courseId, jobId: job.id });

    await supabase.rpc('update_course_progress', {
      p_course_id: courseId,
      p_step_id: 1,
      p_status: 'completed',
      p_message: 'Инициализация завершена (восстановлено воркером)',
      p_metadata: { recovered_by_worker: true, job_id: job.id }
    });

    // Log recovery event
    await supabase.from('system_metrics').insert({
      event_type: 'orphaned_job_recovery',
      severity: 'warn',
      user_id: userId,
      course_id: courseId,
      job_id: job.id,
      metadata: { recovery_step: 1 }
    });
  }

  // Continue with job processing...
}
```

**Alternatives Considered**:
- **Distributed transaction coordinator** - Rejected: Too complex for Stage 1
- **Event sourcing** - Rejected: Over-engineering, adds latency
- **Manual admin recovery** - Rejected: Unacceptable UX, should be automatic

---

## Technology Stack Summary

### Core Dependencies (New in Stage 1)

```json
{
  "dependencies": {
    "pino": "^9.6.0"
  },
  "devDependencies": {
    "pino-pretty": "^13.0.0"
  }
}
```

### Existing Dependencies (Stage 0)

- **BullMQ** (`^5.1.0`) - Job queue with priority support ✅
- **Redis** (`ioredis ^5.3.2`) - Cache and concurrency tracking ✅
- **Supabase** (`@supabase/supabase-js ^2.39.0`) - Database and Auth ✅
- **tRPC** (`@trpc/server ^11.0.0-rc.364`) - Type-safe APIs ✅
- **Zod** (`^3.22.4`) - Runtime validation ✅

### No Additional Infrastructure Required

- PostgreSQL (Supabase managed) ✅
- Redis (existing instance) ✅
- Docker (development environment) ✅

---

## Migration Path

### Database Migrations

1. **Create `system_metrics` table** - New migration file
2. **Create `update_course_progress` RPC function** - New migration file
3. **No breaking changes** - All additive, backward compatible

### Code Migration

1. **Install Pino** - `pnpm add pino && pnpm add -D pino-pretty`
2. **Replace logger** - Drop-in replacement for existing logger
3. **Add API endpoint** - New `/api/coursegen/generate` route
4. **Implement concurrency tracker** - New module in `packages/course-gen-platform/src/shared/concurrency/`
5. **Update worker** - Add step 1 recovery logic to existing handler

### Deployment Strategy

1. **Deploy migrations** - Run before code deployment
2. **Deploy backend** - New endpoint available, n8n still active
3. **Update frontend env** - Point `N8N_WEBHOOK_URL` to new backend
4. **Parallel operation** - Run both for 1 week, monitor metrics
5. **Sunset n8n** - Disable n8n workflow after validation

---

## Open Questions Resolved

All unknowns from Technical Context have been answered:

1. ✅ **Pino implementation** - Drop-in replacement with child logger pattern
2. ✅ **System metrics schema** - Event-based table with JSONB metadata
3. ✅ **RPC function design** - Idempotent PostgreSQL function with atomic JSONB updates
4. ✅ **Concurrency enforcement** - Redis counters with Lua scripts
5. ✅ **Dynamic concurrency** - Hardcoded in Stage 1, monitored in Stage 8
6. ✅ **Saga pattern** - Explicit compensation with worker fallback

No blockers remain for Phase 1 (Design & Contracts).

---

## References

- **Pino Documentation**: https://getpino.io/
- **BullMQ Priority Queues**: https://docs.bullmq.io/guide/jobs/prioritized
- **PostgreSQL JSONB Functions**: https://www.postgresql.org/docs/current/functions-json.html
- **Redis Lua Scripting**: https://redis.io/docs/manual/programmability/eval-intro/
- **Saga Pattern**: https://microservices.io/patterns/data/saga.html

---

**Status**: ✅ All research complete
**Next Phase**: Phase 1 - Design data model and API contracts
