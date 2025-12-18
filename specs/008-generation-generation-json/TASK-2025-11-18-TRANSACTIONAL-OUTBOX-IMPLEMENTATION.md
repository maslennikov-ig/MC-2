# Technical Specification: Transactional Outbox Pattern Implementation

**Task ID:** TASK-2025-11-18-TRANSACTIONAL-OUTBOX
**Priority:** HIGH (Production Reliability)
**Estimated Effort:** 3.5 weeks
**Target Completion:** 2025-12-13

---

## Background & Context

### Original Problem
This task is part of a larger FSM migration effort documented in:
- **Primary Task**: `TASK-2025-11-17-COMPLETE-FSM-MIGRATION.md`
- **Migration**: `20251117103031_create_fsm_state_enum.sql` (completed)
- **RPC Update**: `20251117150000_update_rpc_for_new_fsm.sql` (completed)

### Discovery of Dual-Path Initialization Gap
After completing Phases 1-7 of FSM migration:
- ✅ Database schema updated with new FSM enum
- ✅ RPC function updated for new states
- ❌ E2E test T053 still failing with "Invalid state transition"

**Root Cause** (documented in `INV-2025-11-17-016`):
Course generation has TWO code paths:
1. **API Path** (works): `generation.initiate` endpoint → initializes FSM → creates jobs
2. **Test/Direct Path** (fails): `addJob()` directly → NO FSM init → workers fail

The test bypasses the endpoint, creating jobs before FSM initialization, causing race conditions.

### Investigation History
- **INV-2025-11-17-015**: FSM stage2 initialization missing (partial fix attempted)
- **INV-2025-11-17-016**: Dual-path FSM initialization gap (comprehensive analysis)
  - Identified architectural gap: FSM init not guaranteed before job execution
  - Recommended Defense-in-Depth with Transactional Outbox

### Deep Research
Conducted comprehensive industry research:
- **Document**: `FSM State Initialization in Multi-Entry-Point Job Queue Systems Production Architecture Research.md`
- **Finding**: Transactional Outbox is industry standard (Temporal, AWS Step Functions, Camunda)
- **Conclusion**: Variant B (Full Outbox) recommended over Variant A (Simplified)

### Production Requirement
User confirmed production-grade solution required:
> "Хватит ли для продакшна варианта А?" (Is Variant A sufficient for production?)

**Decision**: Variant B (Full Transactional Outbox) for reliability over simplicity.

---

## Related Documents

### Task Dependencies
- **Upstream**: `TASK-2025-11-17-COMPLETE-FSM-MIGRATION.md` (Phases 1-7 completed)
- **Migrations**:
  - `20251117103031_create_fsm_state_enum.sql` (FSM schema)
  - `20251117150000_update_rpc_for_new_fsm.sql` (RPC update)

### Investigation Reports
- **INV-2025-11-17-016**: Dual-path FSM initialization gap
  - Location: `docs/investigations/INV-2025-11-17-016-dual-path-fsm-initialization.md`
  - Finding: Two code paths create jobs, only one initializes FSM
- **INV-2025-11-17-015**: FSM stage2 initialization missing
  - Location: `docs/investigations/INV-2025-11-17-015-fsm-stage2-initialization-missing.md`
  - Outcome: Partial fix, did not solve dual-path issue

### Research Documents
- **Deep Research**: `FSM State Initialization in Multi-Entry-Point Job Queue Systems Production Architecture Research.md`
  - Location: `specs/008-generation-generation-json/research-decisions/`
  - Variants Analyzed: A (Simplified), B (Full Outbox), C-E (alternatives)
  - Recommendation: Variant B with Defense-in-Depth

### Code References
- **Current FSM Init**: `packages/course-gen-platform/src/server/routers/generation.ts:390-419`
- **Race Condition**: `generation.ts:360-368` (jobs created before FSM init)
- **Test Path**: T053 E2E test bypasses endpoint, uses `addJob()` directly

---

## Executive Summary

Implement production-grade Transactional Outbox pattern to achieve 99.9% reliability for FSM state initialization and job creation. This eliminates race conditions between PostgreSQL state management and BullMQ job orchestration through atomic coordination.

**Current State:** FSM initialization works in production API but has race conditions (jobs created before FSM init) and no atomic guarantees.

**Target State:** Bulletproof atomic coordination where FSM state and job creation commit in single PostgreSQL transaction, with guaranteed eventual delivery via background outbox processor.

**Business Impact:**
- Eliminates data corruption under high load
- Provides complete audit trail for debugging
- Enables graceful degradation when Redis unavailable
- Improves user-facing latency by 8ms (30ms → 22ms)
- Addresses 14 implementation gaps for production readiness

---

## Architecture Overview

### Three-Layer Defense-in-Depth

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: PRIMARY - Transactional Outbox                │
│ ├─ API endpoint writes FSM + jobs to PostgreSQL        │
│ ├─ Single atomic transaction (both succeed or rollback)│
│ └─ Background processor creates BullMQ jobs async      │
├─────────────────────────────────────────────────────────┤
│ Layer 2: BACKUP - QueueEvents Listener                 │
│ ├─ Catches jobs created outside normal flow            │
│ ├─ Initializes FSM if missing (safety net)             │
│ └─ Handles admin tools, retries, edge cases            │
├─────────────────────────────────────────────────────────┤
│ Layer 3: SAFETY NET - Worker Validation                │
│ ├─ Workers check FSM state before processing           │
│ ├─ Last-resort initialization if pending               │
│ └─ Non-fatal errors, logs warnings                     │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

```
User Request
    ↓
┌─────────────────────────────────────┐
│ generation.initiate (tRPC endpoint) │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ PostgreSQL Transaction (ATOMIC)│ │
│ │ ├─ INSERT fsm_states           │ │
│ │ ├─ INSERT job_outbox (4 rows)  │ │
│ │ ├─ INSERT idempotency_keys     │ │
│ │ └─ COMMIT                       │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Return success (22ms latency)      │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ Background Outbox Processor         │
│ (runs every 1 second)               │
│                                     │
│ 1. SELECT unprocessed jobs          │
│ 2. CREATE jobs in BullMQ            │
│ 3. UPDATE processed_at              │
│ 4. Retry failures with backoff      │
└─────────────────────────────────────┘
    ↓
BullMQ Workers Process Jobs
```

---

## Decision Rationale: Why Variant B (Full Transactional Outbox)?

### Options Considered

**Variant A (Simplified)**:
- Single layer: Update generation.initiate endpoint only
- Add InitializeFSMCommand with Redis cache
- Pros: Simple, minimal changes
- Cons: Race conditions still possible, test path still broken

**Variant B (Full Transactional Outbox)** ✅ **SELECTED**:
- Three layers: Outbox + QueueEvents + Worker Validation
- PostgreSQL transaction coordinates FSM + jobs atomically
- Pros: Eliminates race conditions, production-ready, industry standard
- Cons: More complex, ~10-20ms overhead per course

**Variant C-E**: Various Defense-in-Depth alternatives (evaluated in research)

### Production Requirements Analysis

**User Question**: "Хватит ли для продакшна варианта А?"
(Is Variant A sufficient for production?)

**Answer: NO**
- Variant A still has race conditions (jobs created before FSM init)
- Test path remains broken (no endpoint coordination)
- No transactional guarantees
- Not suitable for production reliability requirements

### Performance Impact Analysis

**User Question**: "А с точки зрения нагрузки на систему, вариант B увеличивает ее и на сколько?"
(From load perspective, does Variant B increase it and by how much?)

**Overhead Breakdown**:
- Outbox write: ~5ms (single INSERT)
- Processor polling: ~2ms per course (1s interval, shared across all)
- Transaction coordination: ~3-5ms
- Redis cache: ~1-2ms (with graceful degradation)
- **Total**: ~10-20ms per course initialization

**Negligible for Production**:
- Course creation is infrequent (minutes/hours between courses)
- User already waits seconds for document upload
- 20ms is <1% of total course generation time (~minutes)
- Reliability benefit >> performance cost

### Industry Standard Validation

From Deep Research document:
- **Temporal**: Uses activity outbox for exactly-once semantics
- **AWS Step Functions**: DynamoDB coordination with SQS
- **Camunda**: Optimistic locking + job executor

All use similar transactional coordination patterns.

**Conclusion**: Variant B is production-ready, industry-proven, and overhead is negligible.

---

## Task Assignment Summary

The following 13 tasks will be executed by specialized subagents. Each task has detailed deliverables, success criteria, and dependencies.

| Task | Subagent | Estimated Time | Dependencies |
|------|----------|----------------|--------------|
| 1. Database Schema | database-architect | 1.5 days | None |
| 2. Command Pattern | typescript-types-specialist + api-builder | 2 days | Task 1 |
| 3. PostgreSQL Function | database-architect | 1.5 days | Task 1 |
| 4. Outbox Processor | infrastructure-specialist | 2.5 days | Task 1, 3 |
| 5. Update Endpoint | api-builder | 1.5 days | Task 2, 3 |
| 6. QueueEvents Backup | infrastructure-specialist | 1.5 days | Task 3 |
| 7.1 Worker Validation (doc) | fullstack-nextjs-specialist | 0.5 days | Task 3 |
| 7.2 Worker Validation (stage4) | fullstack-nextjs-specialist | 0.5 days | Task 3 |
| 7.3 Worker Validation (stage5) | fullstack-nextjs-specialist | 0.5 days | Task 3 |
| 8. Integration Tests | integration-tester | 2 days | Tasks 1-7 |
| 9. Unit Tests | test-writer | 1.5 days | Tasks 2-6 |
| 10. Metrics & Monitoring | infrastructure-specialist | 2 days | Task 4 |
| 11. Documentation | technical-writer | 1.5 days | All tasks |
| 12. Deployment | infrastructure-specialist | 1 day | All tasks |
| 13. Existing Courses Migration | database-architect | 1 day | Task 12 |

**Total Estimated Time**: 3.5 weeks (17.5 working days)

---

## Orchestrator Instructions

### Your Role
You are the orchestrator for this implementation. Your responsibilities:
1. Launch subagents with complete context
2. **Verify their work thoroughly** - do NOT trust their answers ("не доверяя их ответу")
3. Re-delegate with specific corrections if work is incorrect
4. Mark tasks complete only after verification passes
5. Escalate to user if blocked or uncertain

### Core Principle
**Trust but Verify**: Subagents make mistakes. Always run verification commands yourself.

### Execution Pattern for Each Task

```
FOR EACH TASK (1-13):
1. Read task description completely
2. Provide subagent with:
   - Full task context
   - Code snippets from related files
   - Links to investigation reports
   - Expected deliverables
3. Launch subagent (use Task tool)
4. After subagent completes:
   a. Read ALL modified files
   b. Run verification commands (see checklist below)
   c. Check Success Criteria met
   d. Look for common mistakes (see per-task section)
5. If incorrect:
   a. Document specific issues
   b. Re-delegate to same subagent with corrections
   c. Provide error messages, expected vs actual
6. If correct:
   a. Mark task complete in TodoWrite
   b. Mark [X] in tasks.md
   c. Run /push patch
   d. Proceed to next task
```

### Master Verification Checklist

**After Every Subagent Completion:**
- [ ] Run `pnpm type-check` - MUST pass
- [ ] Read all modified files completely
- [ ] Verify Success Criteria from task description
- [ ] Check for hardcoded values (should use env vars)
- [ ] Check for missing error handling
- [ ] Check for missing graceful degradation
- [ ] Verify RLS policies if database changes
- [ ] Run relevant tests if available

### Per-Task Verification Procedures

#### Task 1: Database Schema (database-architect)
**What to Check:**
1. Connect to database: `supabase db inspect`
2. Verify tables exist:
   ```sql
   \dt job_outbox
   \dt idempotency_keys
   \dt fsm_events
   ```
3. Check indexes created:
   ```sql
   \di job_outbox*
   ```
4. Verify RLS policies:
   ```sql
   SELECT tablename, policyname, permissive, roles, qual
   FROM pg_policies
   WHERE tablename IN ('job_outbox', 'idempotency_keys', 'fsm_events');
   ```
5. Test pg_cron job created:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'cleanup_old_outbox_jobs';
   ```

**Red Flags:**
- ❌ Missing indexes on (processed_at, created_at, entity_id)
- ❌ RLS not enabled (security vulnerability)
- ❌ Foreign key missing to generation_progress
- ❌ No CASCADE on delete (orphaned records)

**Common Mistakes:**
- Forgetting to enable RLS
- Using TEXT instead of JSONB for job_data
- Missing created_at index (slow queries)

#### Task 2: Command Pattern (typescript-types-specialist + api-builder)
**What to Check:**
1. Run type-check: `pnpm type-check`
2. Read files:
   - src/commands/initialize-fsm/types.ts
   - src/commands/initialize-fsm/handler.ts
   - src/commands/initialize-fsm/index.ts
3. Verify exports in index.ts:
   ```typescript
   export { InitializeFSMCommand, InitializeFSMResult } from './types';
   export { InitializeFSMCommandHandler } from './handler';
   ```
4. Check Redis graceful degradation:
   ```typescript
   try {
     await redis.get(...);
   } catch (redisError) {
     logger.warn(...); // Non-fatal
   }
   ```
5. Verify idempotency logic present

**Red Flags:**
- ❌ Redis failure crashes handler (no try/catch)
- ❌ No idempotency check
- ❌ Missing Zod schema validation
- ❌ Types not exported

**Common Mistakes:**
- Forgetting graceful degradation for Redis
- Not caching result after DB call
- Missing logger statements

#### Task 3: PostgreSQL Function (database-architect)
**What to Check:**
1. Verify function exists:
   ```sql
   \df initialize_fsm_with_outbox
   ```
2. Test atomicity (should rollback on error):
   ```sql
   -- This should FAIL and rollback everything
   SELECT initialize_fsm_with_outbox(
     'nonexistent-course-id',
     'stage_2_init',
     '[]'::jsonb,
     'test-idempotency-key'
   );
   -- Check no outbox records created
   SELECT COUNT(*) FROM job_outbox WHERE entity_id = 'nonexistent-course-id';
   -- Should be 0
   ```
3. Test success case:
   ```sql
   SELECT initialize_fsm_with_outbox(
     'valid-course-id',
     'stage_2_init',
     '[{"queue": "document-processing", "data": {...}}]'::jsonb,
     'test-key-' || gen_random_uuid()::text
   );
   ```
4. Verify idempotency (second call with same key returns cached):
   ```sql
   SELECT initialize_fsm_with_outbox(...same params...);
   -- Should return same result
   ```

**Red Flags:**
- ❌ No EXCEPTION handling (transaction doesn't rollback)
- ❌ Missing idempotency_keys INSERT
- ❌ outbox_id not set as job_options.jobId
- ❌ No validation of initial_state (accepts invalid states)

**Common Mistakes:**
- Forgetting BEGIN/COMMIT block
- Not using EXCEPTION for rollback
- Missing fsm_events audit log

#### Task 4: Outbox Processor (infrastructure-specialist)
**What to Check:**
1. Read file: src/services/outbox-processor.ts
2. Verify graceful shutdown:
   ```typescript
   process.on('SIGTERM', () => processor.stop());
   process.on('SIGINT', () => processor.stop());
   ```
3. Check retry logic with exponential backoff:
   ```typescript
   const backoff = Math.min(1000 * Math.pow(2, attempt), 30000);
   ```
4. Test health endpoint:
   ```bash
   curl http://localhost:3000/api/health/outbox
   # Should return {"healthy": true, "lastCheck": "..."}
   ```
5. Verify connection error handling (not permanent failure)

**Red Flags:**
- ❌ No process signal handlers (unclean shutdown)
- ❌ Connection errors marked permanent (should retry)
- ❌ No health check endpoint
- ❌ Polling interval too fast (<500ms, hammers DB)

**Common Mistakes:**
- Treating ECONNREFUSED as permanent error
- Not clearing interval on stop()
- Missing lastHealthCheck tracking

#### Task 5: Update generation.initiate (api-builder)
**What to Check:**
1. Read file: src/server/routers/generation.ts
2. Verify dual-path logic:
   ```typescript
   const hasFiles = uploadedFiles && uploadedFiles.length > 0;
   if (hasFiles) {
     initialState = 'stage_2_init';
     jobs = uploadedFiles.map(...);
   } else {
     initialState = 'stage_4_init';
     jobs = [{ queue: 'structure-analysis', ... }];
   }
   ```
3. Check command handler integration:
   ```typescript
   const result = await commandHandler.handle(command);
   if (result.fromCache) {
     return ctx.json({ courseId, cached: true });
   }
   ```
4. Verify job creation REMOVED (now in outbox):
   ```typescript
   // ❌ OLD CODE (should be deleted):
   // await addJob('document-processing', ...);
   ```

**Red Flags:**
- ❌ Still calling addJob() directly (race condition not fixed)
- ❌ No hasFiles=false path (crashes on analysis-only)
- ❌ Not using command handler
- ❌ Missing cache hit response

**Common Mistakes:**
- Forgetting to delete old addJob() calls
- Not handling analysis-only path
- Wrong queue names in jobs array

#### Task 6: QueueEvents Backup (infrastructure-specialist)
**What to Check:**
1. Read file: src/workers/queue-events-backup.ts
2. Verify all 3 queues covered:
   ```typescript
   const queueConfigs = [
     { queue: 'document-processing', state: 'stage_2_init' },
     { queue: 'structure-analysis', state: 'stage_4_init' },
     { queue: 'generation', state: 'stage_5_init' }
   ];
   ```
3. Check FSM state query before init:
   ```typescript
   const { data: progress } = await supabase
     .from('generation_progress')
     .select('fsm_state')
     .eq('course_id', courseId)
     .single();

   if (progress?.fsm_state !== 'pending') return; // Already initialized
   ```
4. Verify graceful shutdown

**Red Flags:**
- ❌ Only listening to 1 queue (other jobs not caught)
- ❌ No FSM state check (re-initializes already initialized courses)
- ❌ Wrong state mappings (structure-analysis → stage_2_init is wrong)

**Common Mistakes:**
- Hardcoding single queue name
- Not checking current FSM state
- Missing await on supabase queries

#### Task 7.1-7.3: Worker Validation (fullstack-nextjs-specialist)
**What to Check:**
1. Read all 3 handler files:
   - src/orchestrator/handlers/document-processing.ts
   - src/orchestrator/handlers/stage4-analysis.ts
   - src/orchestrator/handlers/stage5-generation.ts
2. Verify fallback logic at START of each handler:
   ```typescript
   const { data: progress } = await supabase
     .from('generation_progress')
     .select('fsm_state')
     .eq('course_id', job.data.courseId)
     .single();

   if (progress?.fsm_state === 'pending') {
     logger.warn({ courseId }, 'FSM not initialized, using fallback');
     await fallbackInitialize(courseId, 'stage_X_init');
   }
   ```
3. Check correct state for each worker:
   - document-processing → stage_2_init
   - stage4-analysis → stage_4_init
   - stage5-generation → stage_5_init

**Red Flags:**
- ❌ Validation only in 1/3 workers (other 2 still fail)
- ❌ Wrong state in fallback (stage4 using stage_2_init)
- ❌ Fallback after job processing (should be BEFORE)
- ❌ No logger.warn (silent failures)

**Common Mistakes:**
- Copy-pasting wrong state from another worker
- Placing validation after await job.updateProgress(...)
- Not using await on fallback call

#### Tasks 8-13: Testing, Metrics, Docs, Deployment
See task-specific Success Criteria in each task section.

### When to Re-Delegate
Re-delegate to the SAME subagent with corrections if:
- Type-check fails
- Tests fail
- Success Criteria not met
- Red flags found
- Common mistakes present

**Provide**:
- Exact error messages
- File:line references
- Expected vs actual behavior
- Code snippets showing the issue

### When to Escalate to User
Ask user if:
- Subagent fails after 3 attempts
- Fundamental architecture decision needed
- Breaking change to public API
- Security concern discovered
- Task blocked by external dependency (Redis down, Supabase unavailable)

### Rollback Procedures
If subagent work causes breakage:
1. Identify which files were modified (use git status)
2. Run: `git checkout HEAD -- <file>` to revert
3. Document what went wrong
4. Re-delegate with corrections
5. Do NOT proceed to next task until current task correct

### Progress Tracking
Use TodoWrite to track:
- Mark in_progress BEFORE launching subagent
- Mark completed AFTER verification passes
- Update tasks.md with [X] and artifact links
- Run /push patch after each task

### Quality Gates (MANDATORY)
Before marking any task complete:
- [ ] Type-check passes: `pnpm type-check`
- [ ] No console errors in build
- [ ] Success Criteria met
- [ ] No red flags present
- [ ] Common mistakes checked

**Remember**: Your job is to catch mistakes, not to assume subagents are correct.

---

## Database Schema Changes

### Task 1: Create Outbox Infrastructure Tables

**Assigned to:** `database-architect`

**Tables to Create:**

#### 1.1 `job_outbox` - Transactional Job Queue

```sql
CREATE TABLE job_outbox (
  outbox_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL,
  queue_name VARCHAR(100) NOT NULL,
  job_data JSONB NOT NULL,
  job_options JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  last_attempt_at TIMESTAMP,

  CONSTRAINT fk_entity FOREIGN KEY (entity_id)
    REFERENCES generation_progress(course_id) ON DELETE CASCADE
);

-- Critical index for processor performance
CREATE INDEX idx_job_outbox_unprocessed
  ON job_outbox(created_at)
  WHERE processed_at IS NULL;

CREATE INDEX idx_job_outbox_entity
  ON job_outbox(entity_id);

-- Cleanup old processed entries (retention: 30 days)
CREATE INDEX idx_job_outbox_cleanup
  ON job_outbox(processed_at)
  WHERE processed_at IS NOT NULL;
```

#### 1.2 `idempotency_keys` - Request Deduplication

```sql
CREATE TABLE idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  result JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  entity_id UUID,

  CONSTRAINT fk_entity FOREIGN KEY (entity_id)
    REFERENCES generation_progress(course_id) ON DELETE CASCADE
);

CREATE INDEX idx_idempotency_expires
  ON idempotency_keys(expires_at);

CREATE INDEX idx_idempotency_entity
  ON idempotency_keys(entity_id);
```

#### 1.3 `fsm_events` - Audit Trail (Optional)

```sql
CREATE TABLE fsm_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by VARCHAR(20) NOT NULL, -- 'API', 'QUEUE', 'WORKER'
  user_id UUID,

  CONSTRAINT fk_entity FOREIGN KEY (entity_id)
    REFERENCES generation_progress(course_id) ON DELETE CASCADE
);

CREATE INDEX idx_fsm_events_entity
  ON fsm_events(entity_id, created_at DESC);

CREATE INDEX idx_fsm_events_type
  ON fsm_events(event_type);
```

#### 1.4 Cleanup Functions

```sql
-- Auto-cleanup expired idempotency keys (run daily)
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys()
RETURNS void AS $$
BEGIN
  DELETE FROM idempotency_keys
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Auto-cleanup old processed outbox entries (run weekly)
CREATE OR REPLACE FUNCTION cleanup_old_outbox_entries()
RETURNS void AS $$
BEGIN
  DELETE FROM job_outbox
  WHERE processed_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;
```

#### 1.5 Row Level Security Policies

```sql
-- Enable RLS for outbox tables (system-only access)
ALTER TABLE job_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE fsm_events ENABLE ROW LEVEL SECURITY;

-- Block all direct access (only RPC functions can write)
CREATE POLICY "job_outbox_system_only"
  ON job_outbox FOR ALL TO authenticated
  USING (false);

CREATE POLICY "idempotency_keys_system_only"
  ON idempotency_keys FOR ALL TO authenticated
  USING (false);

-- fsm_events: Allow read for debugging, block write
CREATE POLICY "fsm_events_read_only"
  ON fsm_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR auth.jwt()->>'role' = 'service_role');

CREATE POLICY "fsm_events_system_write"
  ON fsm_events FOR INSERT TO authenticated
  USING (false); -- Only RPC functions can insert
```

#### 1.6 Scheduled Cleanup Jobs

```sql
-- Schedule cleanup jobs (pg_cron extension)
-- Note: pg_cron must be enabled in Supabase dashboard first

-- Daily cleanup of expired idempotency keys (3 AM UTC)
SELECT cron.schedule(
  'cleanup-idempotency-keys',
  '0 3 * * *',
  $$SELECT cleanup_expired_idempotency_keys()$$
);

-- Weekly cleanup of old outbox entries (Sunday 2 AM UTC)
SELECT cron.schedule(
  'cleanup-outbox-entries',
  '0 2 * * 0',
  $$SELECT cleanup_old_outbox_entries()$$
);
```

**Alternative if pg_cron not available:**

```typescript
// packages/course-gen-platform/src/services/cleanup-scheduler.ts
import { CronJob } from 'cron';
import { getSupabaseAdmin } from '@/shared/supabase/admin';

const supabase = getSupabaseAdmin();

// Daily cleanup of idempotency keys
new CronJob('0 3 * * *', async () => {
  await supabase.rpc('cleanup_expired_idempotency_keys');
}, null, true);

// Weekly cleanup of outbox entries
new CronJob('0 2 * * 0', async () => {
  await supabase.rpc('cleanup_old_outbox_entries');
}, null, true);
```

**Deliverables:**
- Migration file: `packages/course-gen-platform/supabase/migrations/YYYYMMDDHHMMSS_create_transactional_outbox_tables.sql`
- Applied via Supabase MCP
- Verified schema with `list_tables` tool
- Document in DATABASE-SCHEMA.md

**Success Criteria:**
- All tables created successfully
- Indexes exist and performant (EXPLAIN ANALYZE)
- Foreign key constraints work
- Cleanup functions execute without errors
- RLS policies prevent direct access

---

## Backend Implementation

### Task 2: Command Pattern Infrastructure

**Assigned to:** `typescript-types-specialist` + `api-builder`

**Subtask 2.1: TypeScript Types and Interfaces**

**Assigned to:** `typescript-types-specialist`

Create shared types in `packages/shared-types/src/`:

```typescript
// transactional-outbox.ts

export interface JobOutboxEntry {
  outbox_id: string;
  entity_id: string;
  queue_name: string;
  job_data: Record<string, unknown>;
  job_options?: Record<string, unknown>;
  created_at: Date;
  processed_at: Date | null;
  attempts: number;
  last_error: string | null;
  last_attempt_at: Date | null;
}

export interface IdempotencyKey {
  key: string;
  result: Record<string, unknown>;
  created_at: Date;
  expires_at: Date;
  entity_id: string | null;
}

export interface FSMEvent {
  event_id: string;
  entity_id: string;
  event_type: FSMEventType;
  event_data: Record<string, unknown>;
  created_at: Date;
  created_by: 'API' | 'QUEUE' | 'WORKER' | 'ADMIN' | 'TEST';
}

export type FSMEventType =
  | 'FSM_INITIALIZED'
  | 'STATE_TRANSITIONED'
  | 'JOB_CREATED'
  | 'JOB_COMPLETED'
  | 'JOB_FAILED';

export interface InitializeFSMCommand {
  entityId: string;
  userId: string;
  organizationId: string;
  idempotencyKey: string;
  initiatedBy: 'API' | 'QUEUE' | 'WORKER' | 'ADMIN' | 'TEST';
  initialState: string;
  data: Record<string, unknown>;
  jobs: Array<{
    queue: string;
    data: Record<string, unknown>;
    options?: Record<string, unknown>;
  }>;
}

export interface InitializeFSMResult {
  fsmState: {
    entity_id: string;
    state: string;
    version: number;
    created_by: string;
    created_at: Date;
  };
  outboxEntries: JobOutboxEntry[];
  fromCache: boolean;
}
```

**Deliverables:**
- File: `packages/shared-types/src/transactional-outbox.ts`
- Export from `packages/shared-types/src/index.ts`
- Zod schemas for validation
- Type-check passes

**Subtask 2.2: Command Handler Implementation**

**Assigned to:** `api-builder`

Create command handler in `packages/course-gen-platform/src/services/`:

```typescript
// fsm-initialization-command-handler.ts

import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { InitializeFSMCommand, InitializeFSMResult } from '@megacampus/shared-types';
import { logger } from '@/shared/logger';
import { getRedisClient } from '@/shared/cache/redis';

export class InitializeFSMCommandHandler {
  private supabase = getSupabaseAdmin();
  private redis = getRedisClient();

  async handle(command: InitializeFSMCommand): Promise<InitializeFSMResult> {
    // Layer 1: Idempotency check (fast path - Redis cache)
    const cacheKey = `idempotency:${command.idempotencyKey}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.info({
          entityId: command.entityId,
          idempotencyKey: command.idempotencyKey
        }, 'FSM initialization returned from cache');

        return { ...JSON.parse(cached), fromCache: true };
      }
    } catch (redisError) {
      logger.warn({ error: redisError }, 'Redis cache unavailable, fallback to DB');
      // Continue to DB transaction (graceful degradation)
    }

    // Layer 2: Database transaction with outbox
    const result = await this.executeTransaction(command);

    // Layer 3: Cache result (24 hours TTL) - non-fatal if Redis down
    try {
      await this.redis.setex(cacheKey, 86400, JSON.stringify(result));
    } catch (redisError) {
      logger.warn({ error: redisError }, 'Redis cache write failed (non-fatal)');
    }

    return { ...result, fromCache: false };
  }

  private async executeTransaction(
    command: InitializeFSMCommand
  ): Promise<Omit<InitializeFSMResult, 'fromCache'>> {
    const { data, error } = await this.supabase.rpc('initialize_fsm_with_outbox', {
      p_entity_id: command.entityId,
      p_user_id: command.userId,
      p_organization_id: command.organizationId,
      p_idempotency_key: command.idempotencyKey,
      p_initiated_by: command.initiatedBy,
      p_initial_state: command.initialState,
      p_job_data: command.jobs,
      p_metadata: command.data,
    });

    if (error) {
      logger.error({
        error,
        entityId: command.entityId,
        idempotencyKey: command.idempotencyKey
      }, 'FSM initialization failed');

      throw new Error(`FSM initialization failed: ${error.message}`);
    }

    logger.info({
      entityId: command.entityId,
      initiatedBy: command.initiatedBy,
      jobCount: command.jobs.length
    }, 'FSM initialized successfully');

    return data;
  }
}
```

**Deliverables:**
- File: `packages/course-gen-platform/src/services/fsm-initialization-command-handler.ts`
- Unit tests: `packages/course-gen-platform/src/services/fsm-initialization-command-handler.test.ts`
- Integration with Redis cache (graceful degradation)
- Error handling with retry logic

**Success Criteria:**
- Type-check passes
- Unit tests pass (mocked Supabase, Redis)
- Idempotency works (same command twice → same result)
- Cache hit returns instantly (<5ms)
- Redis failures handled gracefully (fallback to DB)

---

### Task 3: PostgreSQL Stored Procedure

**Assigned to:** `database-architect`

Create atomic initialization function:

```sql
-- Function: initialize_fsm_with_outbox
-- Purpose: Atomically initialize FSM state and create job outbox entries
-- Returns: { fsmState, outboxEntries }

CREATE OR REPLACE FUNCTION initialize_fsm_with_outbox(
  p_entity_id UUID,
  p_user_id UUID,
  p_organization_id UUID,
  p_idempotency_key VARCHAR(255),
  p_initiated_by VARCHAR(20),
  p_initial_state VARCHAR(50),
  p_job_data JSONB,
  p_metadata JSONB DEFAULT '{}'
) RETURNS JSONB AS $$
DECLARE
  v_fsm_state RECORD;
  v_outbox_entries JSONB;
  v_existing_idempotency RECORD;
  v_job JSONB;
  v_outbox_id UUID;
BEGIN
  -- Check idempotency first (database-level, in case Redis cache miss)
  SELECT * INTO v_existing_idempotency
  FROM idempotency_keys
  WHERE key = p_idempotency_key;

  IF FOUND THEN
    -- Return cached result
    RETURN v_existing_idempotency.result;
  END IF;

  -- Initialize FSM state
  INSERT INTO generation_progress (
    course_id,
    user_id,
    organization_id,
    generation_status,
    updated_at
  ) VALUES (
    p_entity_id,
    p_user_id,
    p_organization_id,
    p_initial_state::generation_status,
    NOW()
  )
  ON CONFLICT (course_id) DO UPDATE
  SET
    generation_status = CASE
      WHEN generation_progress.generation_status = 'pending'
      THEN p_initial_state::generation_status
      ELSE generation_progress.generation_status
    END,
    updated_at = NOW()
  RETURNING * INTO v_fsm_state;

  -- Record FSM event (audit trail)
  INSERT INTO fsm_events (
    entity_id,
    event_type,
    event_data,
    created_by,
    user_id
  ) VALUES (
    p_entity_id,
    'FSM_INITIALIZED',
    jsonb_build_object(
      'initial_state', p_initial_state,
      'metadata', p_metadata
    ),
    p_initiated_by,
    p_user_id
  );

  -- Create job outbox entries (SAME TRANSACTION!)
  v_outbox_entries := '[]'::jsonb;

  FOR v_job IN SELECT * FROM jsonb_array_elements(p_job_data)
  LOOP
    INSERT INTO job_outbox (
      entity_id,
      queue_name,
      job_data,
      job_options
    ) VALUES (
      p_entity_id,
      v_job->>'queue',
      v_job->'data',
      COALESCE(v_job->'options', '{}'::jsonb)
    ) RETURNING outbox_id INTO v_outbox_id;

    v_outbox_entries := v_outbox_entries || jsonb_build_object(
      'outbox_id', v_outbox_id,
      'queue_name', v_job->>'queue'
    );
  END LOOP;

  -- Record idempotency key
  INSERT INTO idempotency_keys (
    key,
    result,
    entity_id,
    expires_at
  ) VALUES (
    p_idempotency_key,
    jsonb_build_object(
      'fsmState', row_to_json(v_fsm_state),
      'outboxEntries', v_outbox_entries
    ),
    p_entity_id,
    NOW() + INTERVAL '48 hours'
  );

  -- Return result
  RETURN jsonb_build_object(
    'fsmState', row_to_json(v_fsm_state),
    'outboxEntries', v_outbox_entries
  );
END;
$$ LANGUAGE plpgsql;
```

**Deliverables:**
- Migration file: `packages/course-gen-platform/supabase/migrations/YYYYMMDDHHMMSS_create_initialize_fsm_with_outbox_function.sql`
- Applied via Supabase MCP
- Integration tests for function
- Concurrency test script: `test-concurrent-init.sql`

**Success Criteria:**
- Function executes successfully
- Atomicity: both FSM + outbox commit or both rollback
- Idempotency: calling twice with same key returns cached result
- Performance: <30ms execution time
- Concurrency test: 100 simultaneous calls create exactly 1 FSM state
- Race condition test: Concurrent calls with same idempotency key return identical results
- Performance test under load: <50ms p95 latency with 10 concurrent requests

---

### Task 4: Background Outbox Processor

**Assigned to:** `infrastructure-specialist`

Create background processor worker:

```typescript
// packages/course-gen-platform/src/orchestrator/outbox-processor.ts

import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { addJob } from './queue';
import { logger } from '@/shared/logger';
import { JobOutboxEntry } from '@megacampus/shared-types';

export class OutboxProcessor {
  private supabase = getSupabaseAdmin();
  private pollInterval = 1000; // Start at 1 second
  private isRunning = false;
  private maxPollInterval = 30000; // Max 30 seconds during idle
  private lastProcessedAt: Date = new Date();
  private currentQueueDepth: number = 0;

  async start() {
    this.isRunning = true;
    logger.info('Outbox processor started');

    while (this.isRunning) {
      try {
        const processed = await this.processBatch();

        // Update health metrics
        this.lastProcessedAt = new Date();

        // Adaptive polling: backoff if idle, reset if work found
        if (processed === 0) {
          this.pollInterval = Math.min(
            this.pollInterval * 1.5,
            this.maxPollInterval
          );
        } else {
          this.pollInterval = 1000; // Reset to 1s
        }

        await this.sleep(this.pollInterval);
      } catch (error) {
        logger.error({ error }, 'Outbox processor error');
        await this.sleep(5000); // Wait 5s on error
      }
    }
  }

  async stop() {
    this.isRunning = false;
    logger.info('Outbox processor stopped');
  }

  getHealth(): {
    alive: boolean;
    lastProcessed: Date;
    queueDepth: number;
    pollInterval: number;
  } {
    const timeSinceLastProcess = Date.now() - this.lastProcessedAt.getTime();

    return {
      alive: this.isRunning && timeSinceLastProcess < 60000, // Alert if >1 min
      lastProcessed: this.lastProcessedAt,
      queueDepth: this.currentQueueDepth,
      pollInterval: this.pollInterval,
    };
  }

  private async processBatch(): Promise<number> {
    // Fetch unprocessed jobs (limit 100 per batch)
    const { data: pendingJobs, error } = await this.supabase
      .from('job_outbox')
      .select('*')
      .is('processed_at', null)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error || !pendingJobs || pendingJobs.length === 0) {
      this.currentQueueDepth = 0;
      return 0;
    }

    this.currentQueueDepth = pendingJobs.length;
    logger.info({ count: pendingJobs.length }, 'Processing outbox batch');

    // Process jobs in parallel (batches of 10)
    const batchSize = 10;
    for (let i = 0; i < pendingJobs.length; i += batchSize) {
      const batch = pendingJobs.slice(i, i + batchSize);
      await Promise.all(batch.map(job => this.processJob(job)));
    }

    return pendingJobs.length;
  }

  private async processJob(job: JobOutboxEntry): Promise<void> {
    const maxRetries = 5;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        // Create job in BullMQ (idempotent via job ID)
        await addJob(
          job.queue_name as any,
          job.job_data as any,
          {
            ...job.job_options,
            jobId: job.outbox_id, // Ensures idempotency
          }
        );

        // Mark as processed
        await this.supabase
          .from('job_outbox')
          .update({ processed_at: new Date().toISOString() })
          .eq('outbox_id', job.outbox_id);

        logger.info({
          outboxId: job.outbox_id,
          entityId: job.entity_id,
          queue: job.queue_name
        }, 'Outbox job processed successfully');

        return;

      } catch (error) {
        attempt++;

        // Check if connection error (retry) or permanent error (fail)
        const isConnectionError =
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('ENOTFOUND') ||
          error.message.includes('timeout');

        if (!isConnectionError || attempt >= maxRetries) {
          // Permanent error or max retries reached
          await this.supabase
            .from('job_outbox')
            .update({
              attempts: job.attempts + attempt,
              last_error: error instanceof Error ? error.message : String(error),
              last_attempt_at: new Date().toISOString(),
            })
            .eq('outbox_id', job.outbox_id);

          logger.error({
            error,
            outboxId: job.outbox_id,
            attempts: attempt
          }, 'Outbox job failed permanently');
          return;
        }

        // Exponential backoff for connection errors
        const backoff = Math.min(1000 * Math.pow(2, attempt), 30000);
        logger.warn({
          error,
          attempt,
          backoff
        }, 'BullMQ connection error, retrying...');

        await this.sleep(backoff);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const outboxProcessor = new OutboxProcessor();

// Start processor if not in test environment
if (process.env.NODE_ENV !== 'test') {
  outboxProcessor.start();

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal, stopping outbox processor...');

    await outboxProcessor.stop();

    // Close database connections
    // Note: Supabase client manages connection pooling automatically

    logger.info('Outbox processor stopped gracefully');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
```

**Connection Pooling Note:**

```typescript
// Note: Connection pooling is handled by Supabase client
// Default pool size: 10 connections
// Outbox processor uses 1 connection for polling
// Batch processing reuses same connection
// No additional pooling config needed

// If scaling to multiple processor instances:
const supabase = createClient(url, key, {
  db: {
    pool: {
      max: 20, // Increase pool size
      min: 2,
      idleTimeoutMillis: 30000,
    }
  }
});
```

**Health Check Endpoint:**

```typescript
// Add health endpoint to API
// In packages/course-gen-platform/src/server/routers/health.ts
export const healthRouter = router({
  outbox: publicProcedure.query(async () => {
    return outboxProcessor.getHealth();
  }),
});
```

**Deliverables:**
- File: `packages/course-gen-platform/src/orchestrator/outbox-processor.ts`
- Integration with BullMQ queue
- Error handling with retry logic and exponential backoff
- Adaptive polling for CPU efficiency
- Graceful shutdown handlers
- Health check method
- Unit tests with mocked dependencies

**Success Criteria:**
- Processor starts automatically on app startup
- Processes jobs successfully
- Handles BullMQ failures gracefully (retries with backoff)
- CPU usage <1% during idle
- Batch processing reduces query count by 10x
- Graceful shutdown on SIGTERM/SIGINT
- Health check reports accurate status

---

### Task 5: Update generation.initiate Endpoint

**Assigned to:** `api-builder`

Refactor `packages/course-gen-platform/src/server/routers/generation.ts`:

**Changes:**
1. Remove direct `addJob()` calls
2. Replace with `InitializeFSMCommandHandler`
3. Build job data array for outbox
4. Remove manual FSM init RPC calls
5. Remove rollback logic (handled by transaction)
6. Handle BOTH hasFiles=true (Stage 2) and hasFiles=false (Stage 4) paths

```typescript
// generation.ts (lines 360-464 replacement)

import { InitializeFSMCommandHandler } from '@/services/fsm-initialization-command-handler';

const commandHandler = new InitializeFSMCommandHandler();

// ... inside generation.initiate mutation ...

// Determine flow path based on file presence
const hasFiles = uploadedFiles && uploadedFiles.length > 0;

let jobs: Array<{
  queue: string;
  data: Record<string, unknown>;
  options?: Record<string, unknown>;
}>;
let initialState: string;

if (hasFiles) {
  // Path 1: Document processing (hasFiles=true, start at Stage 2)
  jobs = uploadedFiles.map(file => ({
    queue: 'document-processing',
    data: {
      jobType: JobType.DOCUMENT_PROCESSING,
      organizationId: currentUser.organizationId,
      courseId,
      userId,
      createdAt: new Date().toISOString(),
      fileId: file.id,
      filePath: absoluteFilePath,
      mimeType: file.mime_type,
      chunkSize: 512,
      chunkOverlap: 50,
    },
    options: { priority },
  }));
  initialState = 'stage_2_init';

  logger.info({
    requestId,
    courseId,
    fileCount: uploadedFiles.length
  }, 'Course generation path: document processing (Stage 2)');

} else {
  // Path 2: Analysis-only (hasFiles=false, skip to Stage 4)
  jobs = [{
    queue: 'structure-analysis',
    data: {
      jobType: JobType.STRUCTURE_ANALYSIS,
      organizationId: currentUser.organizationId,
      courseId,
      userId,
      createdAt: new Date().toISOString(),
    },
    options: { priority },
  }];
  initialState = 'stage_4_init';

  logger.info({
    requestId,
    courseId
  }, 'Course generation path: analysis-only (Stage 4, no documents)');
}

// Execute command (atomic FSM init + outbox creation)
const result = await commandHandler.handle({
  entityId: courseId,
  userId,
  organizationId: currentUser.organizationId,
  idempotencyKey: `generation-${courseId}-${Date.now()}`,
  initiatedBy: 'API',
  initialState,
  data: {
    courseTitle: course.title,
    fileCount: hasFiles ? uploadedFiles.length : 0,
    hasFiles,
  },
  jobs,
});

logger.info({
  requestId,
  courseId,
  jobCount: result.outboxEntries.length,
  fromCache: result.fromCache,
  initialState,
}, 'Course generation initiated via transactional outbox');

return {
  success: true,
  jobId: result.outboxEntries[0]?.outbox_id,
  message: 'Генерация курса инициализирована',
  courseId,
};
```

**Deliverables:**
- Updated generation.ts with command pattern
- Removed old direct addJob() calls
- Removed manual RPC calls
- Support for both hasFiles=true (Stage 2) and hasFiles=false (Stage 4) paths
- Type-check passes
- Integration tests pass

**Success Criteria:**
- Endpoint works end-to-end for both paths
- FSM + jobs created atomically
- Idempotency works (duplicate requests cached)
- User-facing latency <30ms
- hasFiles=true → Stage 2 init with document-processing jobs
- hasFiles=false → Stage 4 init with structure-analysis job

---

### Task 6: QueueEvents Backup Layer

**Assigned to:** `infrastructure-specialist`

Create backup initialization listener for ALL job queues:

```typescript
// packages/course-gen-platform/src/orchestrator/queue-events-backup.ts

import { QueueEvents } from 'bullmq';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import { InitializeFSMCommandHandler } from '@/services/fsm-initialization-command-handler';
import { logger } from '@/shared/logger';
import { getQueue } from './queue';

const commandHandler = new InitializeFSMCommandHandler();
const supabase = getSupabaseAdmin();

// Listen to all relevant queues
const queues = ['document-processing', 'structure-analysis', 'structure-generation'];

queues.forEach(queueName => {
  const queueEvents = new QueueEvents(queueName);

  queueEvents.on('added', async ({ jobId, name }) => {
    try {
      // Get job data
      const job = await getQueue(queueName).getJob(jobId);
      if (!job) return;

      const { courseId, userId, organizationId } = job.data;

      // Check if FSM state exists
      const { data: course } = await supabase
        .from('generation_progress')
        .select('generation_status')
        .eq('course_id', courseId)
        .single();

      if (course && course.generation_status !== 'pending') {
        // Already initialized, skip
        return;
      }

      // FSM missing or still pending - initialize as backup
      // Determine initial state based on queue type
      const initialState = queueName === 'document-processing'
        ? 'stage_2_init'
        : 'stage_4_init';

      logger.warn({
        courseId,
        jobId,
        queue: queueName
      }, 'QueueEvents backup: initializing FSM (job created outside normal flow)');

      await commandHandler.handle({
        entityId: courseId,
        userId: userId || 'system',
        organizationId: organizationId || 'unknown',
        idempotencyKey: `queue-backup-${queueName}-${jobId}`,
        initiatedBy: 'QUEUE',
        initialState,
        data: { trigger: 'queue_events_backup', queue: queueName },
        jobs: [], // Job already exists, no outbox entries needed
      });

      logger.info({
        courseId,
        jobId,
        queue: queueName
      }, 'QueueEvents backup: FSM initialized successfully');

    } catch (error) {
      // Non-fatal: worker will catch this too
      logger.warn({
        error,
        jobId,
        queue: queueName
      }, 'QueueEvents backup initialization failed (non-fatal)');
    }
  });

  logger.info({ queue: queueName }, 'QueueEvents backup listener started');
});

logger.info('QueueEvents backup layer started for all queues');
```

**Deliverables:**
- File: `packages/course-gen-platform/src/orchestrator/queue-events-backup.ts`
- Integration with BullMQ QueueEvents for ALL queues
- Non-fatal error handling
- Metrics tracking

**Success Criteria:**
- Listeners start on app startup for all queues
- Catches jobs created outside API flow
- Initializes FSM successfully with correct initial state
- Non-fatal failures logged only

---

### Task 7: Worker Validation Layer

**Assigned to:** `fullstack-nextjs-specialist`

**Task 7.1: Worker Validation for document-processing.ts**

Update `packages/course-gen-platform/src/orchestrator/handlers/document-processing.ts`:

Add validation at start of `execute()` method (after line 97):

```typescript
// Layer 3: Worker validation and fallback initialization
const { data: course } = await supabaseAdmin
  .from('generation_progress')
  .select('generation_status')
  .eq('course_id', courseId)
  .single();

if (!course) {
  logger.error({ courseId, jobId: job.id }, 'Worker validation: Course not found');
  throw new Error('Course not found');
}

if (course.generation_status === 'pending') {
  // FSM not initialized - last resort fallback
  logger.warn({
    courseId,
    jobId: job.id
  }, 'Worker validation: FSM still pending, initializing as fallback');

  try {
    const commandHandler = new InitializeFSMCommandHandler();
    await commandHandler.handle({
      entityId: courseId,
      userId: job.data.userId || 'system',
      organizationId: job.data.organizationId || 'unknown',
      idempotencyKey: `worker-fallback-stage2-${job.id}`,
      initiatedBy: 'WORKER',
      initialState: 'stage_2_init',
      data: { trigger: 'worker_fallback_stage2' },
      jobs: [], // Job already exists
    });

    logger.info({ courseId, jobId: job.id }, 'Worker fallback: FSM initialized successfully');

  } catch (error) {
    // Non-fatal: log warning and continue
    logger.warn({
      courseId,
      jobId: job.id,
      error
    }, 'Worker fallback initialization failed (continuing processing)');
  }
}

// Continue normal processing...
```

**Task 7.2: Worker Validation for stage4-analysis.ts**

Update `packages/course-gen-platform/src/orchestrator/handlers/stage4-analysis.ts`:

Add validation at start of `execute()` method:

```typescript
// Layer 3: Worker validation and fallback initialization for Stage 4
const { data: course } = await supabaseAdmin
  .from('generation_progress')
  .select('generation_status')
  .eq('course_id', courseId)
  .single();

if (!course) {
  logger.error({ courseId, jobId: job.id }, 'Worker validation: Course not found');
  throw new Error('Course not found');
}

// Check if Stage 4 is initialized (valid states: stage_4_init, stage_4_analyzing)
// If still in earlier stages (pending, stage_2_*, stage_3_*), initialize Stage 4
if (
  course.generation_status === 'pending' ||
  course.generation_status === 'stage_2_complete' ||
  course.generation_status === 'stage_3_complete'
) {
  logger.warn({
    courseId,
    jobId: job.id,
    currentStatus: course.generation_status
  }, 'Worker validation: Stage 4 not initialized, initializing as fallback');

  try {
    const commandHandler = new InitializeFSMCommandHandler();
    await commandHandler.handle({
      entityId: courseId,
      userId: job.data.userId || 'system',
      organizationId: job.data.organizationId || 'unknown',
      idempotencyKey: `worker-fallback-stage4-${job.id}`,
      initiatedBy: 'WORKER',
      initialState: 'stage_4_init',
      data: { trigger: 'worker_fallback_stage4' },
      jobs: [],
    });

    logger.info({ courseId, jobId: job.id }, 'Worker fallback: Stage 4 initialized successfully');

  } catch (error) {
    logger.warn({
      courseId,
      jobId: job.id,
      error
    }, 'Worker fallback initialization failed (continuing processing)');
  }
}

// Continue normal processing...
```

**Task 7.3: Worker Validation for stage5-generation.ts**

Update `packages/course-gen-platform/src/orchestrator/handlers/stage5-generation.ts`:

Add validation at start of `execute()` method:

```typescript
// Layer 3: Worker validation and fallback initialization for Stage 5
const { data: course } = await supabaseAdmin
  .from('generation_progress')
  .select('generation_status')
  .eq('course_id', courseId)
  .single();

if (!course) {
  logger.error({ courseId, jobId: job.id }, 'Worker validation: Course not found');
  throw new Error('Course not found');
}

// Check if Stage 5 is initialized (valid states: stage_5_init, stage_5_generating)
if (
  course.generation_status !== 'stage_5_init' &&
  course.generation_status !== 'stage_5_generating'
) {
  logger.warn({
    courseId,
    jobId: job.id,
    currentStatus: course.generation_status
  }, 'Worker validation: Stage 5 not initialized, initializing as fallback');

  try {
    const commandHandler = new InitializeFSMCommandHandler();
    await commandHandler.handle({
      entityId: courseId,
      userId: job.data.userId || 'system',
      organizationId: job.data.organizationId || 'unknown',
      idempotencyKey: `worker-fallback-stage5-${job.id}`,
      initiatedBy: 'WORKER',
      initialState: 'stage_5_init',
      data: { trigger: 'worker_fallback_stage5' },
      jobs: [],
    });

    logger.info({ courseId, jobId: job.id }, 'Worker fallback: Stage 5 initialized successfully');

  } catch (error) {
    logger.warn({
      courseId,
      jobId: job.id,
      error
    }, 'Worker fallback initialization failed (continuing processing)');
  }
}

// Continue normal processing...
```

**Deliverables:**
- Updated document-processing.ts handler (Task 7.1)
- Updated stage4-analysis.ts handler (Task 7.2)
- Updated stage5-generation.ts handler (Task 7.3)
- Worker validation at execution start for all stages
- Fallback initialization with command handler
- Non-fatal error handling

**Success Criteria:**
- Workers check FSM state before processing
- Fallback initialization works for all stages
- Processing continues even if fallback fails
- Metrics track fallback frequency

---

## Testing Strategy

### Task 8: Integration Tests

**Assigned to:** `integration-tester`

Create comprehensive test suite:

```typescript
// packages/course-gen-platform/tests/integration/transactional-outbox.test.ts

describe('Transactional Outbox Integration', () => {
  describe('Atomic Coordination', () => {
    test('FSM and outbox created atomically', async () => {
      const result = await commandHandler.handle(testCommand);

      // Verify FSM state
      const fsm = await db('generation_progress')
        .where({ course_id: testCommand.entityId })
        .first();
      expect(fsm.generation_status).toBe('stage_2_init');

      // Verify outbox entries
      const outbox = await db('job_outbox')
        .where({ entity_id: testCommand.entityId });
      expect(outbox).toHaveLength(4);
    });

    test('Transaction rollback on failure', async () => {
      // Mock Supabase RPC to fail
      mockSupabaseRPC.mockRejectedValueOnce(new Error('DB error'));

      await expect(commandHandler.handle(testCommand)).rejects.toThrow();

      // Verify NOTHING created (atomic rollback)
      const fsm = await db('generation_progress')
        .where({ course_id: testCommand.entityId });
      expect(fsm).toHaveLength(0);

      const outbox = await db('job_outbox')
        .where({ entity_id: testCommand.entityId });
      expect(outbox).toHaveLength(0);
    });
  });

  describe('Idempotency', () => {
    test('Same command twice returns cached result', async () => {
      const result1 = await commandHandler.handle(testCommand);
      const result2 = await commandHandler.handle(testCommand);

      expect(result1).toEqual(result2);
      expect(result2.fromCache).toBe(true);

      // Verify only one FSM created
      const fsm = await db('generation_progress')
        .where({ course_id: testCommand.entityId });
      expect(fsm).toHaveLength(1);
    });

    test('100 concurrent requests create one FSM', async () => {
      const promises = Array(100).fill(null).map(() =>
        commandHandler.handle({
          ...testCommand,
          idempotencyKey: 'same-key-for-all',
        })
      );

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach(r => expect(r.fsmState).toBeDefined());

      // Only one FSM created
      const fsm = await db('generation_progress')
        .where({ course_id: testCommand.entityId });
      expect(fsm).toHaveLength(1);
    });
  });

  describe('Outbox Processor', () => {
    test('Processes pending jobs', async () => {
      // Create outbox entries
      await commandHandler.handle(testCommand);

      // Wait for processor
      await sleep(2000);

      // Verify jobs created in BullMQ
      const jobs = await queue.getJobs(['waiting', 'active']);
      expect(jobs.filter(j => j.data.courseId === testCommand.entityId))
        .toHaveLength(4);

      // Verify outbox entries marked processed
      const outbox = await db('job_outbox')
        .where({ entity_id: testCommand.entityId });
      outbox.forEach(entry => {
        expect(entry.processed_at).not.toBeNull();
      });
    });

    test('Retries failed jobs', async () => {
      // Mock BullMQ to fail first attempt
      mockQueue.add.mockRejectedValueOnce(new Error('Redis down'));

      await commandHandler.handle(testCommand);
      await sleep(2000); // First attempt fails

      // Verify error recorded
      const outbox = await db('job_outbox')
        .where({ entity_id: testCommand.entityId })
        .first();
      expect(outbox.attempts).toBe(1);
      expect(outbox.last_error).toContain('Redis down');

      // Restore mock, wait for retry
      mockQueue.add.mockResolvedValue({ id: 'job-123' });
      await sleep(2000); // Retry succeeds

      // Verify processed
      const updated = await db('job_outbox')
        .where({ outbox_id: outbox.outbox_id })
        .first();
      expect(updated.processed_at).not.toBeNull();
    });
  });

  describe('Defense Layers', () => {
    test('QueueEvents backup catches direct job creation', async () => {
      // Create job directly (bypass API)
      await queue.add('document-processing', {
        courseId: 'test-course',
        userId: 'test-user',
      });

      // Wait for QueueEvents listener
      await sleep(1000);

      // Verify FSM initialized by backup layer
      const fsm = await db('generation_progress')
        .where({ course_id: 'test-course' })
        .first();
      expect(fsm.generation_status).toBe('stage_2_init');
    });

    test('Worker fallback initializes if FSM missing', async () => {
      // Create course in pending state (FSM not initialized)
      await db('generation_progress').insert({
        course_id: 'test-course',
        generation_status: 'pending',
      });

      // Create job directly
      const job = await queue.add('document-processing', {
        courseId: 'test-course',
      });

      // Process job (worker should initialize FSM)
      await worker.process(job);

      // Verify FSM initialized
      const fsm = await db('generation_progress')
        .where({ course_id: 'test-course' })
        .first();
      expect(fsm.generation_status).toBe('stage_2_init');
    });
  });
});
```

**Deliverables:**
- Integration test suite with 15+ tests
- Coverage for all scenarios (success, failure, concurrency)
- Mock strategies for Supabase, Redis, BullMQ
- CI/CD integration

**Success Criteria:**
- All tests pass
- Coverage >90% for new code
- Tests run in <60 seconds
- No flaky tests

---

### Task 9: E2E Test Validation

**Assigned to:** `integration-tester`

Update T053 test to validate new flow:

```typescript
// packages/course-gen-platform/tests/e2e/t053-synergy-sales-course.test.ts

test('T053: Full pipeline with Transactional Outbox', async () => {
  // Create course via API (uses command handler)
  const response = await apiClient.post('/api/generation/initiate', {
    topic: 'Продажи образовательных продуктов',
    files: uploadedFiles,
  });

  expect(response.status).toBe(200);
  const { courseId } = response.data;

  // Verify FSM initialized
  const { data: course } = await supabase
    .from('generation_progress')
    .select('generation_status')
    .eq('course_id', courseId)
    .single();

  expect(course.generation_status).toBe('stage_2_init');

  // Verify outbox entries created
  const { data: outbox } = await supabase
    .from('job_outbox')
    .select('*')
    .eq('entity_id', courseId);

  expect(outbox).toHaveLength(4); // One per file

  // Wait for outbox processor
  await sleep(3000);

  // Verify jobs created in BullMQ
  const jobs = await queue.getJobs(['waiting', 'active']);
  const courseJobs = jobs.filter(j => j.data.courseId === courseId);
  expect(courseJobs).toHaveLength(4);

  // Verify outbox entries marked processed
  const { data: processed } = await supabase
    .from('job_outbox')
    .select('*')
    .eq('entity_id', courseId);

  processed.forEach(entry => {
    expect(entry.processed_at).not.toBeNull();
  });

  // Continue with normal T053 validation...
  // (Stage 3, 4, 5 processing)
});
```

**Deliverables:**
- Updated T053 test with outbox validation
- Test passes end-to-end
- Validates all FSM transitions
- No "Invalid generation status transition" errors

**Success Criteria:**
- T053 test passes consistently
- FSM transitions correctly through all stages
- Outbox processor completes within 5 seconds
- No errors in logs

---

## Monitoring and Observability

### Task 10: Metrics and Alerts

**Assigned to:** `infrastructure-specialist`

**Infrastructure Setup Prerequisites:**

Before implementing metrics, ensure the following infrastructure is configured:

**1. Prometheus Setup:**
- Install Prometheus (https://prometheus.io/download/)
- Configure scrape endpoint: `http://localhost:3000/metrics`
- Retention: 30 days

**2. Grafana Setup:**
- Install Grafana (https://grafana.com/grafana/download)
- Add Prometheus datasource
- Import dashboard: `dashboards/outbox-health.json`

**3. Node.js Metrics Exporter:**
- Install: `prom-client`
- Endpoint: `/metrics` (express middleware)

Example metrics endpoint setup:

```typescript
import { register, collectDefaultMetrics } from 'prom-client';

collectDefaultMetrics();

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

**Metrics Tracking Implementation:**

```typescript
// packages/course-gen-platform/src/services/metrics.ts

import { metrics } from '@/shared/metrics';

// FSM initialization metrics
export function trackFSMInitialization(
  initiatedBy: string,
  success: boolean,
  duration: number,
  fromCache: boolean
) {
  metrics.increment('fsm.init.total', { initiated_by: initiatedBy });

  if (success) {
    metrics.increment('fsm.init.success');
  } else {
    metrics.increment('fsm.init.failed');
  }

  if (fromCache) {
    metrics.increment('fsm.init.cache_hit');
  }

  metrics.histogram('fsm.init.duration_ms', duration);
}

// Outbox processor metrics
export function trackOutboxProcessing(
  queueDepth: number,
  processed: number,
  failed: number,
  latency: number
) {
  metrics.gauge('outbox.queue_depth', queueDepth);
  metrics.increment('outbox.processed', processed);
  metrics.increment('outbox.failed', failed);
  metrics.histogram('outbox.latency_ms', latency);
}

// Worker metrics
export function trackWorkerFallback(
  success: boolean,
  courseId: string
) {
  if (success) {
    metrics.increment('worker.fsm_fallback.success');
  } else {
    metrics.increment('worker.fsm_fallback.failed');
  }

  logger.warn({ courseId }, 'Worker fallback triggered (FSM was missing)');
}
```

**Alert Configuration:**

```yaml
# packages/course-gen-platform/config/alerts.yml

alerts:
  - name: FSM initialization failure rate high
    metric: fsm.init.failed / fsm.init.total
    threshold: 0.05
    duration: 5m
    severity: critical
    message: "FSM initialization failures >5% for 5 minutes"

  - name: Outbox queue depth growing
    metric: outbox.queue_depth
    threshold: 1000
    duration: 10m
    severity: warning
    message: "Outbox processor falling behind (queue >1000 for 10 min)"

  - name: Worker fallback frequency high
    metric: worker.fsm_fallback.success
    threshold: 10
    duration: 5m
    severity: warning
    message: "Workers finding missing FSM states (>10 in 5 min)"

  - name: Outbox processor not running
    metric: outbox.processed
    threshold: 0
    duration: 5m
    severity: critical
    message: "Outbox processor hasn't processed any jobs for 5 minutes"
```

**Deliverables:**
- Infrastructure setup documentation (Prometheus, Grafana)
- Metrics tracking in all components
- Alert configuration
- Grafana dashboard JSON
- Documentation for runbooks

**Success Criteria:**
- Metrics flowing to monitoring system
- Alerts trigger correctly in test scenarios
- Dashboard shows real-time outbox health
- Runbooks documented

---

## Documentation

### Task 11: Technical Documentation

**Assigned to:** `technical-writer`

Update documentation files:

#### 11.1 DATABASE-SCHEMA.md

Add sections:
- Transactional Outbox tables
- FSM state flow diagram
- Idempotency key usage
- Cleanup procedures

#### 11.2 ARCHITECTURE.md

Add sections:
- Command Pattern architecture
- Defense-in-depth layers
- Atomic coordination guarantees
- Failure scenarios and recovery

#### 11.3 RUNBOOKS.md

Create runbooks for:
- Outbox processor stuck
- Queue depth growing
- Worker fallback frequency high
- Idempotency key conflicts

#### 11.4 MIGRATIONS.md

Document new migrations:
- Outbox tables creation
- RPC function creation
- Indexes and cleanup functions

**Deliverables:**
- Updated documentation files
- Architecture diagrams (Mermaid)
- Runbook procedures
- Migration documentation

**Success Criteria:**
- Documentation complete and accurate
- Diagrams render correctly
- Runbooks tested by team
- Migration docs reviewed

---

## Deployment Strategy

### Task 12: Staged Rollout

**Assigned to:** `fullstack-nextjs-specialist`

#### Migration Execution Order

**Phase 0: Database Migrations (MUST run first, in order)**

1. Verify existing migrations applied:
   - Check `20251117150000_update_rpc_for_new_fsm.sql` (already done)
   - Verify with: `SELECT * FROM supabase_migrations.schema_migrations;`

2. Apply new migrations in sequence:
   - Apply `YYYYMMDDHHMMSS_create_transactional_outbox_tables.sql` (Task 1)
   - Apply `YYYYMMDDHHMMSS_create_initialize_fsm_with_outbox_function.sql` (Task 3)

3. Verify migrations successful:
   - Run: `SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;`
   - Check tables exist: `\dt job_outbox`, `\dt idempotency_keys`, `\dt fsm_events`

**Phase 1: Testing Environment (Week 1)**
- Deploy all backend code components (Tasks 2-7)
- Start outbox processor
- Deploy API endpoint changes
- Run full test suite
- Load testing with 1000 concurrent requests
- Monitor metrics for 48 hours

**Phase 2: Canary Deployment (Week 2)**
- Deploy to 10% of production traffic
- Monitor error rates, latency, queue depth
- Compare metrics with old flow
- Rollback plan ready
- Monitor for 10 minutes before scaling up

**Phase 3: Full Production (Week 3)**
- Deploy to 100% traffic
- Monitor for 72 hours
- Verify all metrics healthy
- Document learnings

**Rollback Plan (if issues detected):**
1. Revert API endpoint code (generation.ts to direct addJob() calls)
2. Stop outbox processor
3. Switch back to direct addJob() calls
4. Keep migrations (no rollback needed - tables harmless if unused)
5. Keep outbox tables for data preservation and debugging

**Deliverables:**
- Deployment checklist
- Migration execution order documentation
- Rollback procedure
- Monitoring dashboard
- Post-deployment report

**Success Criteria:**
- Zero downtime deployment
- Error rate <0.1%
- User-facing latency improvement
- Outbox queue depth <100
- All migrations applied successfully

---

### Task 13: Migrate Existing Courses to Outbox Pattern

**Assigned to:** `database-architect`

**Objective:** Ensure existing courses in database work with new Transactional Outbox system.

**Strategy:**

```sql
-- Audit existing courses
SELECT
  generation_status,
  COUNT(*) as count
FROM generation_progress
WHERE generation_status IN (
  'pending',
  'stage_2_init',
  'stage_2_processing',
  'stage_3_pending',
  'stage_3_processing'
)
GROUP BY generation_status;

-- Check for courses in active processing states
SELECT
  course_id,
  generation_status,
  updated_at,
  EXTRACT(EPOCH FROM (NOW() - updated_at)) / 3600 as hours_since_update
FROM generation_progress
WHERE generation_status IN (
  'pending',
  'stage_2_init',
  'stage_2_processing',
  'stage_3_pending'
)
ORDER BY updated_at DESC;
```

**Decision: No Migration Needed (Recommended)**

**Rationale:**
- New outbox pattern ONLY applies to new courses created after deployment
- Existing in-flight courses complete via old flow (already in progress)
- Worker validation layer (Task 7) provides safety net for edge cases
- Minimal risk: Most courses complete within hours, not days
- Attempting migration adds complexity with minimal benefit

**Alternative Strategy (If Migration Required):**

Only migrate if:
1. Courses stuck in `pending` for >24 hours (likely orphaned)
2. Courses in `stage_2_init` with no corresponding BullMQ jobs

```sql
-- Find potentially orphaned courses
SELECT
  course_id,
  generation_status,
  updated_at
FROM generation_progress
WHERE generation_status = 'pending'
  AND updated_at < NOW() - INTERVAL '24 hours';

-- Manual intervention: re-initialize via admin panel
-- Do NOT use bulk migration - handle case-by-case
```

**Deliverables:**
- Audit query results
- Decision document: no migration needed (with rationale)
- Documentation for handling edge cases
- Monitoring plan for in-flight courses during deployment

**Success Criteria:**
- All existing courses tracked in audit
- Migration strategy documented and approved
- No orphaned courses after deployment
- Worker validation layer handles edge cases

---

## Success Criteria (Overall)

### Functional Requirements
- ✅ FSM and jobs created atomically (100% success rate)
- ✅ Idempotent initialization (duplicate requests cached)
- ✅ Works for all entry points (API, test, admin, retries)
- ✅ Graceful degradation when Redis unavailable
- ✅ Complete audit trail via fsm_events
- ✅ Supports both hasFiles=true (Stage 2) and hasFiles=false (Stage 4) paths

### Non-Functional Requirements
- ✅ User-facing latency <30ms (target: 22ms)
- ✅ Outbox processor latency <1s (target: <500ms)
- ✅ CPU overhead <1% (target: 0.5%)
- ✅ Memory overhead <100MB (target: 50MB)
- ✅ PostgreSQL load <2 QPS increase (target: 1.2 QPS)

### Testing Requirements
- ✅ Integration tests >90% coverage
- ✅ E2E test (T053) passes consistently
- ✅ Load test handles 1000 concurrent requests
- ✅ Chaos test (Redis failure) recovers gracefully
- ✅ Concurrency test: 100 simultaneous calls create exactly 1 FSM

### Operational Requirements
- ✅ Metrics tracking all components
- ✅ Alerts configured and tested
- ✅ Runbooks documented
- ✅ Monitoring dashboard deployed
- ✅ Graceful shutdown on SIGTERM/SIGINT
- ✅ Health check endpoint available

### Production Readiness (14 Gaps Closed)
- ✅ No-files scenario handled (Gap 1)
- ✅ Worker validation for all stages (Gaps 2, 7.2, 7.3)
- ✅ RLS policies configured (Gap 3)
- ✅ Redis failure handling (Gap 4)
- ✅ Graceful shutdown (Gap 5)
- ✅ Health check endpoint (Gap 6)
- ✅ QueueEvents for multiple queues (Gap 7)
- ✅ Concurrency testing (Gap 8)
- ✅ Cleanup cron jobs (Gap 9)
- ✅ Metrics infrastructure setup (Gap 10)
- ✅ Migration ordering documented (Gap 11)
- ✅ Existing courses strategy (Gap 12)
- ✅ Connection pooling documented (Gap 13)
- ✅ BullMQ reconnection strategy (Gap 14)

---

## Task Assignment Summary

| Task | Assigned To | Estimated Time | Dependencies |
|------|-------------|----------------|--------------|
| **1. Database Schema** | `database-architect` | 1.5 days | None |
| **2.1 TypeScript Types** | `typescript-types-specialist` | 0.5 day | Task 1 |
| **2.2 Command Handler** | `api-builder` | 1.5 days | Task 2.1 |
| **3. PostgreSQL Function** | `database-architect` | 1.5 days | Task 1 |
| **4. Outbox Processor** | `infrastructure-specialist` | 2.5 days | Task 1, 2 |
| **5. Update Endpoint** | `api-builder` | 1.5 days | Task 2, 3 |
| **6. QueueEvents Backup** | `infrastructure-specialist` | 1.5 days | Task 2 |
| **7.1 Worker Validation (Stage 2)** | `fullstack-nextjs-specialist` | 0.5 day | Task 2 |
| **7.2 Worker Validation (Stage 4)** | `fullstack-nextjs-specialist` | 0.5 day | Task 2 |
| **7.3 Worker Validation (Stage 5)** | `fullstack-nextjs-specialist` | 0.5 day | Task 2 |
| **8. Integration Tests** | `integration-tester` | 2.5 days | Task 1-7 |
| **9. E2E Test (T053)** | `integration-tester` | 1 day | Task 1-7 |
| **10. Metrics & Alerts** | `infrastructure-specialist` | 1.5 days | Task 1-7 |
| **11. Documentation** | `technical-writer` | 1.5 days | Task 1-10 |
| **12. Deployment** | `fullstack-nextjs-specialist` | 1 week | All tasks |
| **13. Data Migration Analysis** | `database-architect` | 0.5 day | Task 1 |

**Total Estimated Time:** 3.5 weeks (17.5 working days)

---

## Next Steps

1. ✅ Review this specification with team
2. ⏳ Create GitHub issues for each task
3. ⏳ Assign tasks to subagents
4. ⏳ Set up project board for tracking
5. ⏳ Schedule daily standups for coordination
6. ⏳ Begin implementation (Task 1: Database Schema)

---

**Document Version:** 2.0
**Created:** 2025-11-18
**Last Updated:** 2025-11-18
**Status:** Ready for Implementation (All 14 Gaps Addressed)
