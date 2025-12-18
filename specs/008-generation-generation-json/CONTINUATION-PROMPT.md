# Continuation Prompt: Fix Transaction Visibility Issue

**Copy this entire file and send to Claude in new context session**

---

## 📋 Task Overview

You are continuing work on the **Transactional Outbox Implementation** for the MegaCampus course generation system. The implementation is **92% complete (12/13 tasks)** and architecturally sound, but there is **ONE blocking bug** preventing E2E test from passing.

### Current Status

✅ **Completed:**
- Database schema (3 tables: `job_outbox`, `idempotency_keys`, `fsm_events`)
- RPC function `initialize_fsm_with_outbox()`
- Command Handler with 3-layer idempotency
- Background OutboxProcessor
- Three-layer Defense-in-Depth architecture
- All integration tests (16/20 passing)
- Complete documentation
- Deployment checklist

❌ **Blocking Issue:**
- E2E test T053 fails because RPC function returns success with data, but database queries find zero records
- This is a **transaction visibility bug**, not an architecture problem
- Race conditions are SOLVED by design, this is purely a technical bug

### The Bug in Detail

```typescript
// Command handler calls RPC successfully
const result = await commandHandler.handle({
  entityId: course.id,
  jobs: [/* 4 jobs */]
});

console.log(result.outboxEntries.length); // Output: 4 ✅ RPC returns data

// Test helper queries database immediately after
const { data } = await supabase
  .from('job_outbox')
  .select('*')
  .eq('entity_id', course.id);

console.log(data.length); // Output: 0 ❌ PROBLEM: Data not visible
```

**Same issue for all 3 tables:**
- `job_outbox`: expected 4, got 0
- `fsm_events`: expected 1, got 0
- `idempotency_keys`: expected 1, got 0

---

## 🎯 Your Task

**Primary Objective:** Diagnose and fix the transaction visibility issue so E2E test T053 passes.

**Secondary Objective:** Ensure no regressions in integration tests (maintain 16/20 passing rate).

---

## 📂 Required Reading (in order)

**1. Quick Context (5 min read):**
```
File: specs/008-generation-generation-json/CONTEXT-SUMMARY-TRANSACTION-VISIBILITY.md
```
This gives you the 30-second problem statement, what's done, what's blocking, and next steps.

**2. Full Technical Spec (15 min read):**
```
File: specs/008-generation-generation-json/TASK-2025-11-18-FIX-TRANSACTION-VISIBILITY-ISSUE.md
```
This contains:
- Detailed problem analysis (5 possible causes)
- Investigation steps (4 phases, step-by-step)
- Implementation plan (5 tasks)
- All code examples and SQL queries
- Success criteria and rollback plan

**3. Progress Tracker (optional, for full context):**
```
File: specs/008-generation-generation-json/TRANSACTIONAL-OUTBOX-PROGRESS.md
```
Shows all 12 completed tasks if you need background.

---

## 🚀 Execution Instructions

### Step 1: Read Context (5-10 min)

Read the two required files above to understand:
- The bug (RPC returns data, queries don't find it)
- Why it's blocking (E2E test fails)
- What's already been tried (nothing yet - you're first to investigate)

### Step 2: Create Investigation Plan (10 min)

Use TodoWrite to plan your investigation:

```typescript
TodoWrite([
  { content: "Read CONTEXT-SUMMARY-TRANSACTION-VISIBILITY.md", status: "pending", activeForm: "Reading context" },
  { content: "Read TASK-2025-11-18-FIX-TRANSACTION-VISIBILITY-ISSUE.md", status: "pending", activeForm: "Reading full spec" },
  { content: "Phase 1: Test RPC directly in Supabase SQL Editor", status: "pending", activeForm: "Testing RPC via SQL" },
  { content: "Phase 2: Add debug logging to command handler and test", status: "pending", activeForm: "Adding debug logs" },
  { content: "Phase 3: Implement fix based on findings", status: "pending", activeForm: "Implementing fix" },
  { content: "Phase 4: Validate E2E test passes", status: "pending", activeForm: "Running E2E test" },
  { content: "Phase 5: Update documentation", status: "pending", activeForm: "Updating docs" }
]);
```

### Step 3: Start Investigation (Phase 1)

**DO NOT delegate immediately.** First, gather context by reading the files and running Phase 1 investigation yourself:

**Phase 1.1: Direct SQL Test (5 min)**

Execute this in Supabase SQL Editor to isolate the issue:

```sql
-- Test RPC directly (bypasses TypeScript/Node.js)
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

-- IMMEDIATELY query (same database session)
SELECT * FROM job_outbox WHERE entity_id = 'test-transaction-visibility-001'::uuid;
SELECT * FROM fsm_events WHERE entity_id = 'test-transaction-visibility-001'::uuid;
SELECT * FROM idempotency_keys WHERE key LIKE 'test-idempotency-%' ORDER BY created_at DESC LIMIT 1;
```

**Expected:** All 3 queries should return data.

**If data visible:** Issue is in TypeScript/Supabase client (proceed to Phase 2)
**If data NOT visible:** Issue is in RPC function itself (proceed to Phase 3 in spec)

### Step 4: Decide on Delegation

After Phase 1 completes, you'll know the root cause category:

**Option A: RPC Function Issue**
- Delegate to `database-architect` to fix RPC function
- Provide Phase 3 investigation results as context
- Specify exact fix needed (explicit COMMIT, transaction isolation, etc.)

**Option B: TypeScript/Client Issue**
- Delegate to `fullstack-nextjs-specialist` to fix command handler or test
- Provide Phase 2 investigation results as context
- Specify exact fix needed (synchronization delay, client configuration, etc.)

**Option C: Architecture Issue**
- Delegate to `problem-investigator` for deep analysis
- Provide all investigation results
- Request alternative approach recommendation

### Step 5: Verify Fix

After fix is implemented:

```bash
# Run E2E test
cd /home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform
pnpm test tests/e2e/t053-synergy-sales-course.test.ts

# Expected output:
# ✓ Scenario 1: Title-Only Generation
# ✓ Scenario 2: Full Pipeline (Stage 2 → Stage 4 → Stage 5)
# ✓ Scenario 3: Different Styles
# ✓ Scenario 4: RAG-Heavy Generation
#
# Test Files  1 passed (1)
#      Tests  4 passed (4)
```

### Step 6: Update Documentation

Delegate to `technical-writer` to:
- Update `TRANSACTIONAL-OUTBOX-PROGRESS.md` (mark bug fixed)
- Create `docs/investigations/INV-2025-11-18-001-transaction-visibility-fix.md`
- Update `docs/DEPLOYMENT-CHECKLIST.md` with verification step

---

## 📊 Success Criteria

**Must Have:**
- ✅ E2E test T053 passes (4/4 scenarios)
- ✅ Integration tests maintain 16/20 pass rate (no regressions)
- ✅ Type-check passes
- ✅ Fix documented with investigation report

**Nice to Have:**
- ✅ Performance impact <50ms latency increase
- ✅ Root cause clearly identified and explained
- ✅ Deployment checklist includes new verification

---

## 🚨 Important Constraints

### DO:
- ✅ Read both context files FIRST before taking action
- ✅ Run Phase 1 SQL test yourself (don't delegate yet)
- ✅ Use TodoWrite to track investigation progress
- ✅ Verify results independently (don't trust subagent reports blindly)
- ✅ Test E2E after fix to confirm it works

### DON'T:
- ❌ Skip reading the context files
- ❌ Delegate immediately without investigation
- ❌ Change architecture (it's correct, just a bug)
- ❌ Add >50ms latency overhead
- ❌ Break existing integration tests

---

## 📁 Key File Locations

**Context & Specs:**
```
specs/008-generation-generation-json/CONTEXT-SUMMARY-TRANSACTION-VISIBILITY.md
specs/008-generation-generation-json/TASK-2025-11-18-FIX-TRANSACTION-VISIBILITY-ISSUE.md
specs/008-generation-generation-json/TRANSACTIONAL-OUTBOX-PROGRESS.md
```

**Code Files:**
```
packages/course-gen-platform/tests/e2e/t053-synergy-sales-course.test.ts (line 600: failure)
packages/course-gen-platform/src/services/fsm-initialization-command-handler.ts
packages/course-gen-platform/supabase/migrations/20251118095804_create_initialize_fsm_with_outbox_rpc.sql
```

**Helper Functions:**
```
Test helper: waitForOutboxProcessing() at line 272-300 in t053-synergy-sales-course.test.ts
Test helper: validateFSMEvents() at line 302-320 in t053-synergy-sales-course.test.ts
```

---

## 🎯 Expected Timeline

**Phase 1 Investigation:** 30-60 min (SQL test + analysis)
**Phase 2 Investigation:** 45-60 min (debug logging + client analysis)
**Phase 3 Fix Implementation:** 1-2 hours (depends on root cause)
**Phase 4 Verification:** 30 min (run tests)
**Phase 5 Documentation:** 30 min (update docs)

**Total Estimate:** 4-6 hours (can be done in 1 session)

---

## 🔄 Rollback Plan

If you can't fix the bug within 2 hours of investigation:

**Option 1: Simplified Outbox**
- Remove RPC function, use direct SQL inserts in command handler
- Trade atomicity for simplicity (acceptable for MVP)
- Deploy, fix properly in Phase 2

**Option 2: Skip E2E Test**
- Mark test as `.skip()` for now
- Deploy with manual testing in staging
- Fix test in post-deployment hotfix

**Option 3: Manual Testing**
- Remove automated E2E test
- Create manual test checklist
- Add production monitoring

**Recommended:** Try Option 1 if investigation hits 2-hour mark without clear solution.

---

## 📞 Questions to Ask User (if needed)

If you get truly stuck, ask user:

1. "I've found that [ROOT CAUSE]. Should I [OPTION A] or [OPTION B]?"
2. "The fix requires [TRADE-OFF]. Is this acceptable for MVP?"
3. "I can't reproduce the bug in SQL Editor but it fails in tests. Should I add synchronization delay as workaround?"

**But first:** Complete Phase 1 investigation before asking questions.

---

## ✅ Verification Checklist

Before marking task complete:

- [ ] Phase 1 SQL test executed (documented findings)
- [ ] Root cause identified with evidence
- [ ] Fix implemented and tested locally
- [ ] E2E test runs and passes (4/4 scenarios)
- [ ] Integration tests maintain 16/20 pass rate
- [ ] Type-check passes with no errors
- [ ] Documentation updated (progress + investigation report)
- [ ] Deployment checklist includes verification step
- [ ] User informed of completion and ready for deployment

---

## 🎉 After Completion

When E2E test passes:

1. Update `TRANSACTIONAL-OUTBOX-PROGRESS.md` → Status: 13/13 (100% COMPLETE)
2. Mark as ready for staging deployment
3. Inform user: "Transaction visibility bug fixed. Transactional Outbox implementation 100% complete and ready for production deployment. E2E test T053 passes (4/4 scenarios). All race conditions eliminated."

---

**END OF PROMPT**

**Next Action:** Read `CONTEXT-SUMMARY-TRANSACTION-VISIBILITY.md` and start Phase 1 investigation.

**Working Directory:** `/home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform`

**Git Branch:** `008-generation-generation-json`

**Supabase Project:** MegaCampusAI (ref: `diqooqbuchsliypgwksu`)
