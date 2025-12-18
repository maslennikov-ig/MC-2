# Technical Specification: Fix Transaction Visibility Issue in Transactional Outbox E2E Test

**Task ID:** TASK-2025-11-18-FIX-TRANSACTION-VISIBILITY
**Priority:** HIGH (Blocks Production Deployment)
**Estimated Effort:** 1-2 days
**Target Completion:** 2025-11-20
**Created:** 2025-11-18

---

## Executive Summary

**Problem:** E2E test T053 fails because RPC function `initialize_fsm_with_outbox()` returns success with outbox entries in JSONB response, but those entries are **not visible** in the database when queried immediately after.

**Impact:** Blocks deployment of Transactional Outbox implementation to production, despite architecture being correct and race conditions eliminated.

**Root Cause:** Database transaction visibility issue - RPC function commits data, but test queries don't see committed records.

**Scope:** Diagnose and fix transaction visibility, ensure E2E test passes, validate that outbox pattern works end-to-end.

---

## Background & Context

### Upstream Work Completed

**Task:** `TASK-2025-11-18-TRANSACTIONAL-OUTBOX-IMPLEMENTATION.md`
**Status:** 12/13 tasks complete (92%), Implementation architecturally sound
**Achievement:** Race conditions between FSM initialization and job creation **ELIMINATED**

**Original Problem (INV-2025-11-17-016):**
- Course generation had TWO code paths for job creation
- Only ONE path initialized FSM state
- Test path bypassed API, called `addJob()` directly
- Workers executed before FSM initialized → `"Invalid state transition"` errors

**Solution Implemented:**
- Transactional Outbox pattern with atomic PostgreSQL transaction
- Three-layer Defense-in-Depth architecture
- Updated E2E test T053 to use `InitializeFSMCommandHandler`
- Background processor creates BullMQ jobs asynchronously

### Current Blocker

E2E test execution reveals technical issue:

```bash
✓ Stage 2 FSM initialized: stage_2_init
✓ Stage 2 outbox entries created: 4    ← RPC returns 4 entries

❌ FAIL: No outbox entries found        ← SELECT returns 0 entries
   at waitForOutboxProcessing (tests/e2e/t053-synergy-sales-course.test.ts:288:13)
```

**Critical Finding:**
1. Command handler calls RPC successfully
2. RPC returns JSONB with 4 outbox entries
3. Test helper queries `job_outbox` table immediately after
4. Query returns **zero** records
5. Same for `fsm_events` and `idempotency_keys` tables

**Architecture is CORRECT** - race conditions are solved by design. This is a **technical bug** preventing validation.

---

## Related Documents

### Implementation Tasks
- **Upstream:** `TASK-2025-11-18-TRANSACTIONAL-OUTBOX-IMPLEMENTATION.md` (12/13 complete)
- **Deployment:** `docs/DEPLOYMENT-CHECKLIST.md` (ready but blocked)
- **Progress:** `specs/008-generation-generation-json/TRANSACTIONAL-OUTBOX-PROGRESS.md`

### Investigation Reports
- **INV-2025-11-17-016:** Dual-path FSM initialization gap (original problem - SOLVED)
- **E2E Test Analysis:** Full report generated 2025-11-18 by integration-tester agent

### Code References
- **Test File:** `packages/course-gen-platform/tests/e2e/t053-synergy-sales-course.test.ts` (line 600 failure)
- **Command Handler:** `packages/course-gen-platform/src/services/fsm-initialization-command-handler.ts`
- **RPC Function:** Migration `20251118095804_create_initialize_fsm_with_outbox_rpc.sql`
- **Helper Function:** `waitForOutboxProcessing()` at line 272-300 in test file

### Database Schema
- **Tables:** `job_outbox`, `idempotency_keys`, `fsm_events`
- **Migration:** `20251118094238_create_transactional_outbox_tables.sql`
- **RPC:** `initialize_fsm_with_outbox(...)` - SECURITY DEFINER function

---

## Problem Analysis

### What Works

✅ **Command Handler Execution:**
```typescript
const result = await commandHandler.handle({
  entityId: course.id,
  userId: testUser.id,
  organizationId: testOrg.id,
  idempotencyKey: `t053-scenario2-stage2-${Date.now()}`,
  initiatedBy: 'TEST',
  initialState: 'stage_2_init',
  data: { courseTitle: course.title, scenario: 'full-pipeline-stage2' },
  jobs: documentJobs, // Array of 4 jobs
});

// Returns successfully with:
// result.outboxEntries = [{ outbox_id: '...', queue_name: '...', ... }, ...]
console.log(`✓ Stage 2 outbox entries created: ${result.outboxEntries.length}`);
// Output: 4
```

✅ **RPC Function Logic (Simplified):**
```sql
CREATE OR REPLACE FUNCTION initialize_fsm_with_outbox(
  p_entity_id UUID,
  p_user_id UUID,
  p_organization_id UUID,
  p_idempotency_key TEXT,
  p_initiated_by TEXT,
  p_initial_state generation_status,
  p_job_data JSONB,
  p_metadata JSONB
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_outbox_entries JSONB[] := ARRAY[]::JSONB[];
BEGIN
  -- Check idempotency
  SELECT result INTO v_result FROM idempotency_keys WHERE key = p_idempotency_key;
  IF FOUND THEN
    RETURN v_result;
  END IF;

  -- Update FSM state
  UPDATE courses
  SET generation_status = p_initial_state, updated_at = NOW()
  WHERE id = p_entity_id AND organization_id = p_organization_id;

  -- Insert outbox entries
  FOR i IN 0..jsonb_array_length(p_job_data) - 1 LOOP
    INSERT INTO job_outbox (entity_id, queue_name, job_data, ...)
    VALUES (...) RETURNING to_jsonb(job_outbox.*) INTO v_outbox_entry;

    v_outbox_entries := array_append(v_outbox_entries, v_outbox_entry);
  END LOOP;

  -- Insert FSM event
  INSERT INTO fsm_events (entity_id, event_type, old_state, new_state, ...)
  VALUES (...);

  -- Store idempotency key
  v_result := jsonb_build_object('success', true, 'outboxEntries', to_jsonb(v_outbox_entries));
  INSERT INTO idempotency_keys (key, result, ...) VALUES (p_idempotency_key, v_result, ...);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### What Fails

❌ **Database Queries Immediately After:**
```typescript
// Helper function: waitForOutboxProcessing()
async function waitForOutboxProcessing(courseId: string, timeout = 10000): Promise<void> {
  const supabase = getSupabaseAdmin();
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const { data: outboxEntries, error } = await supabase
      .from('job_outbox')
      .select('processed_at, retry_count, last_error')
      .eq('entity_id', courseId);

    console.log(`[DEBUG] Query result:`, { count: outboxEntries?.length, error });
    // Output: { count: 0, error: null }  ← PROBLEM: Expected 4, got 0

    if (!outboxEntries || outboxEntries.length === 0) {
      throw new Error(`No outbox entries found for course ${courseId}`);
    }
    // ...
  }
}
```

❌ **Direct SQL Verification (also returns empty):**
```sql
-- Executed via Supabase client after RPC call
SELECT * FROM job_outbox WHERE entity_id = 'a91fc4ad-ace4-47d2-8008-0e68fed2344b';
-- Result: 0 rows

SELECT * FROM fsm_events WHERE entity_id = 'a91fc4ad-ace4-47d2-8008-0e68fed2344b';
-- Result: 0 rows

SELECT * FROM idempotency_keys WHERE key LIKE 't053-scenario2-stage2-%';
-- Result: 0 rows
```

### Possible Causes

**1. Transaction Not Committed**
- plpgsql functions auto-commit by default, but RPC might have issue
- Check if SECURITY DEFINER changes transaction behavior
- Verify `search_path` setting doesn't affect commit

**2. Different Database Connection/Session**
- Command handler uses one Supabase client instance
- Test helper uses different instance (via `getSupabaseAdmin()`)
- Connection pooling might isolate transactions

**3. Transaction Isolation Level**
- PostgreSQL default: READ COMMITTED
- Test query might execute before COMMIT visible
- Supabase client might not wait for commit acknowledgment

**4. RPC Returning Cached Data**
- RPC builds JSONB response from local variables
- Returns data before COMMIT finishes
- Test receives response before database persists changes

**5. Test Timing Issue**
- Network latency between RPC call and query
- Need explicit synchronization barrier
- Missing await somewhere in promise chain

---

## Technical Requirements

### Success Criteria

1. **E2E Test Passes:** T053 executes without "No outbox entries found" error
2. **Data Visible:** Queries after RPC call return inserted records
3. **No Race Conditions:** FSM state and outbox entries both visible
4. **Atomicity Preserved:** All-or-nothing guarantees still hold
5. **Performance Acceptable:** Fix doesn't add >50ms latency

### Acceptance Tests

```typescript
// Test 1: RPC creates visible records
test('RPC function creates visible outbox entries', async () => {
  const course = await createTestCourse();

  const result = await commandHandler.handle({
    entityId: course.id,
    // ... other params
    jobs: [{ queue: 'test', data: {} }],
  });

  expect(result.outboxEntries).toHaveLength(1);

  // Query immediately after
  const { data: outboxEntries } = await supabase
    .from('job_outbox')
    .select('*')
    .eq('entity_id', course.id);

  expect(outboxEntries).toHaveLength(1); // ✅ Should pass
});

// Test 2: FSM events visible
test('RPC function creates visible FSM events', async () => {
  const course = await createTestCourse();

  await commandHandler.handle({ /* ... */ });

  const { data: events } = await supabase
    .from('fsm_events')
    .select('*')
    .eq('entity_id', course.id);

  expect(events!.length).toBeGreaterThan(0); // ✅ Should pass
});

// Test 3: Idempotency keys stored
test('RPC function stores idempotency keys', async () => {
  const course = await createTestCourse();
  const idempotencyKey = `test-${Date.now()}`;

  await commandHandler.handle({ idempotencyKey, /* ... */ });

  const { data: keys } = await supabase
    .from('idempotency_keys')
    .select('*')
    .eq('key', idempotencyKey);

  expect(keys).toHaveLength(1); // ✅ Should pass
});
```

---

## Investigation Steps

### Phase 1: Direct RPC Testing (30 minutes)

**Objective:** Isolate whether issue is in RPC function or test infrastructure.

**Step 1.1: Test RPC via Supabase SQL Editor**

```sql
-- Execute in Supabase Dashboard → SQL Editor
-- Project: MegaCampusAI (diqooqbuchsliypgwksu)

-- Create test course (if not exists)
INSERT INTO courses (id, title, organization_id, user_id, generation_status)
VALUES (
  'test-transaction-visibility-001'::uuid,
  'Test Course for Transaction Visibility',
  (SELECT id FROM organizations LIMIT 1),
  (SELECT id FROM users LIMIT 1),
  'pending'
) ON CONFLICT (id) DO NOTHING;

-- Call RPC function
SELECT initialize_fsm_with_outbox(
  'test-transaction-visibility-001'::uuid,
  (SELECT id FROM users LIMIT 1),
  (SELECT id FROM organizations LIMIT 1),
  'test-idempotency-' || NOW()::text,
  'TEST',
  'stage_2_init',
  '[{"queue": "document-processing", "data": {"test": true}}]'::jsonb,
  '{}'::jsonb
);

-- IMMEDIATELY query outbox (same session)
SELECT * FROM job_outbox WHERE entity_id = 'test-transaction-visibility-001'::uuid;

-- IMMEDIATELY query FSM events (same session)
SELECT * FROM fsm_events WHERE entity_id = 'test-transaction-visibility-001'::uuid;

-- IMMEDIATELY query idempotency keys
SELECT * FROM idempotency_keys WHERE key LIKE 'test-idempotency-%' ORDER BY created_at DESC LIMIT 1;
```

**Expected Result:** All 3 queries should return data (1 outbox entry, 1 FSM event, 1 idempotency key)

**Outcome Analysis:**
- If data visible → RPC works, issue is in test infrastructure
- If data NOT visible → RPC has transaction commit issue

**Step 1.2: Check RPC Function Transaction Behavior**

```sql
-- Verify SECURITY DEFINER settings
SELECT
  p.proname,
  p.prosecdef,
  p.proconfig,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
WHERE p.proname = 'initialize_fsm_with_outbox';

-- Check if function has explicit transaction commands
-- Look for: BEGIN, COMMIT, ROLLBACK, SAVEPOINT
```

**Step 1.3: Test with Explicit Transaction**

```sql
-- Wrap RPC call in explicit transaction
BEGIN;
  SELECT initialize_fsm_with_outbox(...);
COMMIT;

-- Query after COMMIT
SELECT * FROM job_outbox WHERE entity_id = 'test-transaction-visibility-001'::uuid;
```

### Phase 2: Test Infrastructure Analysis (45 minutes)

**Objective:** Diagnose Supabase client connection/transaction handling.

**Step 2.1: Add Debug Logging to Command Handler**

```typescript
// File: src/services/fsm-initialization-command-handler.ts
// Method: handle()

// BEFORE RPC call
logger.info({ entityId, idempotencyKey }, 'Calling RPC initialize_fsm_with_outbox');

// AFTER RPC call
logger.info({
  entityId,
  idempotencyKey,
  outboxCount: data.outboxEntries?.length,
  rpcResponse: data
}, 'RPC completed successfully');

// Add synchronization barrier
logger.info('Waiting 100ms for transaction commit propagation...');
await new Promise(resolve => setTimeout(resolve, 100));
logger.info('Continue with result return');

return data;
```

**Step 2.2: Add Debug Logging to Test Helper**

```typescript
// File: tests/e2e/t053-synergy-sales-course.test.ts
// Function: waitForOutboxProcessing()

async function waitForOutboxProcessing(courseId: string, timeout = 10000): Promise<void> {
  const supabase = getSupabaseAdmin();

  console.log(`[DEBUG] Starting outbox wait for course: ${courseId}`);
  console.log(`[DEBUG] Supabase client instance:`, {
    url: supabase.supabaseUrl,
    hasAuth: !!supabase.auth
  });

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    console.log(`[DEBUG] Polling job_outbox table...`);

    const { data: outboxEntries, error } = await supabase
      .from('job_outbox')
      .select('*') // Select all columns for debugging
      .eq('entity_id', courseId);

    console.log(`[DEBUG] Query result:`, {
      elapsed: Date.now() - startTime,
      count: outboxEntries?.length,
      error: error?.message,
      entries: outboxEntries
    });

    if (error) {
      console.error(`[DEBUG] Query error:`, error);
    }

    if (!outboxEntries || outboxEntries.length === 0) {
      console.log(`[DEBUG] No entries found, retrying in 1s...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      continue;
    }

    // Check processing status
    const allProcessed = outboxEntries.every(entry => entry.processed_at !== null);
    console.log(`[DEBUG] Processing status:`, {
      total: outboxEntries.length,
      processed: outboxEntries.filter(e => e.processed_at).length,
      allProcessed
    });

    if (allProcessed) {
      console.log(`[DEBUG] All entries processed successfully`);
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error(`Timeout waiting for outbox processing after ${timeout}ms`);
}
```

**Step 2.3: Verify Supabase Client Configuration**

```typescript
// Check if test uses same client instance as command handler
import { getSupabaseAdmin } from '../../src/shared/supabase/admin';

// In test setup
console.log('[DEBUG] Test Supabase client:', getSupabaseAdmin().supabaseUrl);

// In command handler
console.log('[DEBUG] Handler Supabase client:', this.supabase.supabaseUrl);

// Should be identical
```

**Step 2.4: Test with Forced Synchronization**

```typescript
// In test, after commandHandler.handle()
const result = await commandHandler.handle({ /* ... */ });

console.log('[DEBUG] Command handler returned, waiting 200ms for commit propagation...');
await new Promise(resolve => setTimeout(resolve, 200));

console.log('[DEBUG] Now querying database...');
await waitForOutboxProcessing(course.id, 10000);
```

### Phase 3: RPC Function Modification (if needed) (1 hour)

**Objective:** Ensure RPC function commits explicitly and returns after persistence.

**Step 3.1: Add Explicit COMMIT Verification**

```sql
-- Modify RPC function to verify commit
CREATE OR REPLACE FUNCTION initialize_fsm_with_outbox(...)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_verification_count INT;
BEGIN
  -- ... existing logic ...

  -- Build result
  v_result := jsonb_build_object('success', true, 'outboxEntries', to_jsonb(v_outbox_entries));

  -- Store idempotency key
  INSERT INTO idempotency_keys (key, result, ...) VALUES (p_idempotency_key, v_result, ...);

  -- NEW: Verify data persisted BEFORE returning
  SELECT COUNT(*) INTO v_verification_count
  FROM job_outbox
  WHERE entity_id = p_entity_id;

  IF v_verification_count = 0 THEN
    RAISE EXCEPTION 'Outbox entries not persisted (count: %)', v_verification_count;
  END IF;

  -- Log for debugging
  RAISE NOTICE 'Transaction complete, verified % outbox entries', v_verification_count;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;  -- Explicit schema
```

**Step 3.2: Add Transaction Isolation Level**

```sql
-- Set transaction isolation explicitly
CREATE OR REPLACE FUNCTION initialize_fsm_with_outbox(...)
RETURNS JSONB AS $$
BEGIN
  SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

  -- ... existing logic ...
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Step 3.3: Remove SECURITY DEFINER (test hypothesis)**

```sql
-- Create test version without SECURITY DEFINER
CREATE OR REPLACE FUNCTION initialize_fsm_with_outbox_test(...)
RETURNS JSONB AS $$
-- Same logic but without SECURITY DEFINER
$$ LANGUAGE plpgsql;  -- INVOKER rights

-- Test if this resolves issue
SELECT initialize_fsm_with_outbox_test(...);
```

### Phase 4: Alternative Approaches (if Phase 1-3 fail) (2 hours)

**Approach 4.1: Split RPC into Two Calls**

```typescript
// Call 1: Initialize FSM and create outbox entries
await supabase.rpc('initialize_fsm_with_outbox', { /* ... */ });

// Call 2: Verify entries persisted (forces new transaction)
const { data: verification } = await supabase
  .from('job_outbox')
  .select('count')
  .eq('entity_id', courseId);

if (verification[0].count === 0) {
  throw new Error('Transaction commit verification failed');
}
```

**Approach 4.2: Use Supabase Realtime Subscription**

```typescript
// Subscribe to job_outbox inserts
const subscription = supabase
  .channel('outbox-inserts')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'job_outbox' },
    (payload) => {
      console.log('Outbox entry created:', payload.new);
    }
  )
  .subscribe();

// Call RPC
await commandHandler.handle({ /* ... */ });

// Subscription receives real-time notification when data persisted
```

**Approach 4.3: Bypass RPC, Use Direct SQL**

```typescript
// In command handler, replace RPC call with direct SQL commands
const { data: course } = await this.supabase
  .from('courses')
  .update({ generation_status: initialState })
  .eq('id', entityId)
  .eq('organization_id', organizationId)
  .select()
  .single();

// Insert outbox entries
const outboxEntries = [];
for (const job of jobs) {
  const { data: entry } = await this.supabase
    .from('job_outbox')
    .insert({
      outbox_id: crypto.randomUUID(),
      entity_id: entityId,
      queue_name: job.queue,
      job_data: job.data,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  outboxEntries.push(entry);
}

// Insert FSM event
await this.supabase.from('fsm_events').insert({ /* ... */ });

// Insert idempotency key
await this.supabase.from('idempotency_keys').insert({ /* ... */ });

return { success: true, outboxEntries };
```

**Approach 4.4: Use PostgreSQL Advisory Locks**

```sql
-- In RPC function, add advisory lock to ensure serialization
CREATE OR REPLACE FUNCTION initialize_fsm_with_outbox(...)
RETURNS JSONB AS $$
DECLARE
  v_lock_acquired BOOLEAN;
BEGIN
  -- Acquire advisory lock on entity_id
  SELECT pg_try_advisory_xact_lock(hashtext(p_entity_id::text)) INTO v_lock_acquired;

  IF NOT v_lock_acquired THEN
    RAISE EXCEPTION 'Could not acquire lock for entity %', p_entity_id;
  END IF;

  -- ... existing logic ...

  -- Lock released automatically on transaction end
END;
$$ LANGUAGE plpgsql;
```

---

## Implementation Plan

### Task 1: Diagnose Root Cause (4 hours)

**Substep 1.1: Run Phase 1 Investigation**
- Execute RPC via Supabase SQL Editor (Step 1.1)
- Verify data visibility in same session
- Check RPC function transaction behavior (Step 1.2)
- Test with explicit transaction (Step 1.3)

**Substep 1.2: Run Phase 2 Investigation**
- Add debug logging to command handler (Step 2.1)
- Add debug logging to test helper (Step 2.2)
- Verify client configuration (Step 2.3)
- Test with forced synchronization (Step 2.4)

**Success Criteria:**
- Identified whether issue is in RPC function or test infrastructure
- Collected debug logs showing exact failure point
- Confirmed or ruled out transaction commit hypothesis

### Task 2: Implement Fix (2-4 hours, depends on root cause)

**If RPC Issue:**
- Implement Phase 3 modifications
- Add explicit commit verification (Step 3.1)
- Set transaction isolation level (Step 3.2)
- Test without SECURITY DEFINER (Step 3.3)

**If Test Infrastructure Issue:**
- Add synchronization barrier in command handler
- Use same Supabase client instance
- Add explicit delay after RPC call
- Implement realtime subscription (Approach 4.2)

**If Architecture Issue:**
- Evaluate alternative approaches (Phase 4)
- Choose best approach based on performance/reliability trade-offs
- Implement chosen approach
- Update documentation with rationale

**Success Criteria:**
- Fix implemented and tested locally
- E2E test passes consistently (5/5 runs)
- No performance degradation (latency <50ms increase)

### Task 3: Validate E2E Test (2 hours)

**Substep 3.1: Run Full T053 Test Suite**
```bash
cd /home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform
pnpm test tests/e2e/t053-synergy-sales-course.test.ts
```

**Expected Output:**
```
✓ Scenario 1: Title-Only Generation
✓ Scenario 2: Full Pipeline (Stage 2 → Stage 4 → Stage 5)
✓ Scenario 3: Different Styles
✓ Scenario 4: RAG-Heavy Generation

Test Files  1 passed (1)
     Tests  4 passed (4)
```

**Substep 3.2: Validate Helper Functions**
- `waitForOutboxProcessing()` completes without timeout
- `validateFSMEvents()` finds expected events
- No "Invalid state transition" errors in logs

**Substep 3.3: Check Database State After Test**
```sql
-- Verify cleanup
SELECT COUNT(*) FROM job_outbox WHERE entity_id LIKE 't053-%';
SELECT COUNT(*) FROM fsm_events WHERE entity_id LIKE 't053-%';
SELECT COUNT(*) FROM idempotency_keys WHERE key LIKE 't053-%';

-- Should be cleaned up by afterAll() hook
```

**Success Criteria:**
- All 4 scenarios pass
- No race condition errors
- Database properly cleaned up after test

### Task 4: Update Documentation (1 hour)

**Substep 4.1: Update TRANSACTIONAL-OUTBOX-PROGRESS.md**
```markdown
## Additional Task: Transaction Visibility Fix (Added 2025-11-18)

**Status:** ✅ COMPLETE

**Issue:** RPC function returned success but data not visible to subsequent queries

**Root Cause:** [Describe actual cause found during investigation]

**Solution:** [Describe implemented fix]

**Verification:** E2E test T053 now passes (4/4 scenarios)
```

**Substep 4.2: Document Lessons Learned**

Create new file: `docs/investigations/INV-2025-11-18-001-transaction-visibility-fix.md`

```markdown
# Investigation Report: Transaction Visibility Issue in Transactional Outbox

**Date:** 2025-11-18
**Investigator:** [Your name]
**Status:** Resolved

## Problem
RPC function `initialize_fsm_with_outbox()` returned success with outbox entries
in JSONB response, but queries immediately after found zero records in database.

## Root Cause
[Detailed explanation of actual cause]

## Solution
[Detailed explanation of fix]

## Verification
- E2E test T053 passes consistently
- All 3 tables populated correctly (job_outbox, fsm_events, idempotency_keys)
- No performance impact (<50ms latency increase)

## Lessons Learned
[Key takeaways for future development]
```

**Substep 4.3: Update Deployment Checklist**

Add verification step to `docs/DEPLOYMENT-CHECKLIST.md`:

```markdown
### Phase 2.5: Transaction Visibility Verification

**Objective:** Verify RPC function commits data before returning

**Test Script:**
```sql
-- Execute and verify data visible
SELECT initialize_fsm_with_outbox(...);
SELECT COUNT(*) FROM job_outbox WHERE entity_id = 'test-course-id';
-- Expected: >0
```

**Success Criteria:**
- Data visible immediately after RPC call
- No synchronization delays needed
```

**Success Criteria:**
- Progress document updated with resolution
- Investigation report created and detailed
- Deployment checklist includes new verification

### Task 5: Run Integration Tests (1 hour)

**Substep 5.1: Run Full Integration Test Suite**
```bash
pnpm test tests/integration/transactional-outbox.test.ts
```

**Expected:** 16/20 tests passing (same as before, 4 known failures in test design)

**Substep 5.2: Run All E2E Tests**
```bash
pnpm test tests/e2e/
```

**Expected:** All E2E tests pass (including T053)

**Substep 5.3: Type Check**
```bash
pnpm type-check
```

**Expected:** No TypeScript errors

**Success Criteria:**
- Integration tests maintain same pass rate
- E2E tests all pass
- No new TypeScript errors introduced

---

## Deliverables

### Code Changes
1. **RPC Function Fix** (if needed): `supabase/migrations/20251118095804_create_initialize_fsm_with_outbox_rpc.sql`
2. **Command Handler Update** (if needed): `src/services/fsm-initialization-command-handler.ts`
3. **Test Helper Update** (if needed): `tests/e2e/t053-synergy-sales-course.test.ts`

### Documentation
4. **Progress Update**: `specs/008-generation-generation-json/TRANSACTIONAL-OUTBOX-PROGRESS.md`
5. **Investigation Report**: `docs/investigations/INV-2025-11-18-001-transaction-visibility-fix.md`
6. **Deployment Checklist Update**: `docs/DEPLOYMENT-CHECKLIST.md`

### Verification
7. **E2E Test Results**: Screenshot or log showing 4/4 scenarios passing
8. **Integration Test Results**: Log showing 16/20 passing (no regressions)
9. **Performance Metrics**: Before/after latency comparison

---

## Success Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| E2E Test Pass Rate | 100% (4/4) | 0% (0/4) | ❌ |
| Integration Test Pass Rate | 80% (16/20) | 80% (16/20) | ✅ |
| Transaction Visibility | Immediate | Not visible | ❌ |
| FSM Race Conditions | 0 | 0 | ✅ |
| Added Latency | <50ms | Unknown | ⏳ |

**Deployment Readiness:** After all metrics ✅, ready for production

---

## Risk Assessment

### High Risk
- ❌ **RPC function has fundamental flaw**: Requires architecture change (use Approach 4.3)
- ❌ **Supabase client bug**: Requires workaround or library update

### Medium Risk
- ⚠️ **Performance impact**: May need caching or optimization
- ⚠️ **Complex fix required**: May delay production deployment

### Low Risk
- ✅ **Simple synchronization issue**: Add 50ms delay, test passes
- ✅ **Connection pooling config**: Update Supabase settings

---

## Rollback Plan

### If Fix Doesn't Work

**Option 1: Revert to Simplified Outbox (Variant A)**
- Remove RPC function, use direct SQL in command handler
- Trade atomicity for simplicity
- Acceptable for MVP, improve in Phase 2

**Option 2: Bypass Test for Now**
- Skip E2E test T053 until issue resolved
- Deploy other 95% of functionality
- Fix test in post-deployment hotfix

**Option 3: Manual Testing Only**
- Remove automated E2E test
- Perform manual verification in staging
- Create production monitoring to catch issues

**Recommended:** Option 1 if issue not resolved in 2 days

---

## References

### Key Files
- Test: `/packages/course-gen-platform/tests/e2e/t053-synergy-sales-course.test.ts`
- Handler: `/packages/course-gen-platform/src/services/fsm-initialization-command-handler.ts`
- RPC: `/packages/course-gen-platform/supabase/migrations/20251118095804_create_initialize_fsm_with_outbox_rpc.sql`

### Related Tasks
- Upstream: `TASK-2025-11-18-TRANSACTIONAL-OUTBOX-IMPLEMENTATION.md`
- Investigation: `INV-2025-11-17-016-dual-path-fsm-initialization.md`

### External Documentation
- PostgreSQL SECURITY DEFINER: https://www.postgresql.org/docs/current/sql-createfunction.html
- Supabase RPC Functions: https://supabase.com/docs/guides/database/functions
- plpgsql Transactions: https://www.postgresql.org/docs/current/plpgsql-transactions.html

---

**End of Specification**

**Next Actions:**
1. Start with Phase 1 Investigation (diagnose root cause)
2. Implement fix based on findings
3. Validate with E2E test
4. Update documentation
5. Deploy to staging

**Estimated Total Effort:** 10-14 hours (1.5-2 days)
