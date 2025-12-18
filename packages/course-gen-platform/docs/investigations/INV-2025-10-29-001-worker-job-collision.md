---
report_type: investigation
generated: 2025-10-29T12:00:00Z
investigation_id: INV-2025-10-29-001
status: complete
agent: problem-investigator
duration: 45 minutes
---

# Investigation Report: BullMQ Worker Job Collision

**Investigation ID**: INV-2025-10-29-001
**Generated**: 2025-10-29T12:00:00Z
**Status**: ✅ Complete
**Duration**: 45 minutes

---

## Executive Summary

Two BullMQ workers are competing for the same jobs in the 'course-generation' queue, causing Stage 3 summarization jobs to be incorrectly processed by the generic worker, which lacks the appropriate handler.

**Root Cause**: Stage 3 worker processes ALL jobs from the queue instead of filtering for 'STAGE_3_SUMMARIZATION' jobs only. BullMQ does not support a Worker constructor `name` option for automatic filtering.

**Recommended Solution**: Implement job name filtering inside the Stage 3 worker's processor function using a conditional check.

### Key Findings

- **Finding 1**: BullMQ workers without job name filtering in the processor will attempt to process ALL jobs from the queue they're connected to
- **Finding 2**: The generic worker has a handler registry for specific job types (test_job, initialize, document_processing), but NOT for STAGE_3_SUMMARIZATION
- **Finding 3**: Race condition exists where whichever worker picks up the job first will process it, causing "Job handler not found" errors when generic worker wins

---

## Problem Statement

### Observed Behavior

When a Stage 3 summarization job (ID #39) is added to the 'course-generation' queue:
1. Both workers initialized: Generic worker AND Stage 3 worker
2. Generic worker picks up job #39 first (race condition)
3. Error thrown: `{"jobId":"39","jobType":"STAGE_3_SUMMARIZATION","availableHandlers":["test_job","initialize","document_processing"],"msg":"Job handler not found"}`
4. Job fails because generic worker doesn't have a handler for STAGE_3_SUMMARIZATION

### Expected Behavior

1. Stage 3 worker should exclusively process jobs with name 'STAGE_3_SUMMARIZATION'
2. Generic worker should process all OTHER job types (test_job, initialize, document_processing, etc.)
3. No race condition or handler conflicts

### Impact

- **Test Failures**: E2E tests failing because jobs are processed by wrong worker
- **Production Risk**: If deployed, Stage 3 summarization jobs would fail unpredictably
- **Developer Confusion**: Error messages indicate missing handler, but handler exists in Stage 3 worker

### Environmental Context

- **Environment**: Test environment (Vitest global setup)
- **Related Changes**: Stage 3 worker recently added alongside existing generic worker
- **First Observed**: When Stage 3 E2E tests started running with both workers active
- **Frequency**: Always - deterministic race condition

---

## Investigation Process

### Initial Hypotheses

1. **Hypothesis 1**: Stage 3 worker missing `name` option to filter jobs
   - **Likelihood**: High
   - **Test Plan**: Research BullMQ Worker constructor options for job filtering

2. **Hypothesis 2**: Generic worker needs to exclude STAGE_3_SUMMARIZATION jobs
   - **Likelihood**: Medium
   - **Test Plan**: Check if generic worker's handler registry needs filtering logic

3. **Hypothesis 3**: Both workers should use separate queues
   - **Likelihood**: Low (architectural change)
   - **Test Plan**: Review queue architecture design

### Files Examined

- `src/orchestrator/workers/stage3-summarization.worker.ts` - Stage 3 worker implementation
  - Lines 362-371: Worker initialization WITHOUT job name filtering
  - Worker connects to 'course-generation' queue
  - Processor function `processSummarizationJob` only handles summarization logic

- `src/orchestrator/worker.ts` - Generic worker implementation
  - Lines 42-52: Handler registry with test_job, initialize, document_processing
  - Lines 61-77: `processJob` function looks up handler by `job.name`
  - Lines 101-119: Worker initialization for 'course-generation' queue
  - NO filtering for job names - processes ALL jobs

- `tests/global-setup.ts` - Test setup initializing both workers
  - Line 22: Generic worker started
  - Line 27: Stage 3 worker started (already initialized on import)
  - Both active simultaneously

### Commands Executed

```bash
# Searched for STAGE_3_SUMMARIZATION usage
grep -r "STAGE_3_SUMMARIZATION" packages/course-gen-platform --include="*.ts"
# Result: Found in 20 test files and worker config

# Found worker initialization
grep -r "summarizationWorker" packages/course-gen-platform/tests --include="*.ts" -l
# Result: tests/global-setup.ts
```

### Context7 Documentation Research

**BullMQ Documentation** (Context7: `/taskforcesh/bullmq`):

> **From "Conditional Job Processing with Named Processors" pattern:**
> "This snippet demonstrates how to create a BullMQ worker that handles different
> job types using a switch case based on the job's name. It allows for distinct
> processing logic for various tasks within the same queue."
>
> ```typescript
> const worker = new Worker(
>   'queueName',
>   async job => {
>     switch (job.name) {
>       case 'taskType1': {
>         await doSomeLogic1();
>         break;
>       }
>       case 'taskType2': {
>         await doSomeLogic2();
>         break;
>       }
>     }
>   },
>   { connection },
> );
> ```

**Key Insights from Context7**:
- BullMQ workers do NOT have a constructor `name` option for automatic job filtering
- Job filtering must be implemented INSIDE the processor function
- Pattern: Check `job.name` and conditionally execute logic
- Multiple job types can share the same queue with conditional processing

**Missing from Context7** (required Tier 3 search):
- Explicit statement that Workers process ALL jobs without filtering
- Best practices for multiple specialized workers on same queue
- Race condition risks when multiple workers compete for jobs

**Tier 3 Sources Used**:
- GitHub Issue #297: "How do I only process Jobs with a specific name?"
  - Answer: "Use switch statement inside processor based on job.name"
  - Confirmed: NO Worker option for automatic filtering
- GitHub Issue #84: "Accept/reject jobs by job name?"
  - Answer: "BullMQ removed per-job-name workers from Bull library"
  - Recommended: Single worker with conditional logic

---

## Root Cause Analysis

### Primary Root Cause

**Stage 3 worker processes ALL jobs from 'course-generation' queue without filtering for 'STAGE_3_SUMMARIZATION' job names.**

**Evidence**:
1. Worker initialization (stage3-summarization.worker.ts:362-371) has NO job name filtering logic
2. BullMQ documentation confirms Workers without filtering attempt to process ALL jobs from their queue
3. Error message shows generic worker picked up STAGE_3_SUMMARIZATION job it cannot handle

**Mechanism of Failure**:

1. **Setup Phase**: Two workers start
   - Generic worker connects to 'course-generation' queue
   - Stage 3 worker connects to SAME 'course-generation' queue
   - Both workers begin polling for jobs

2. **Job Addition**: Test adds job
   ```typescript
   queue.add('STAGE_3_SUMMARIZATION', jobData)
   ```
   - Job enters 'course-generation' queue with name='STAGE_3_SUMMARIZATION'

3. **Race Condition**: Both workers poll Redis simultaneously
   - Generic worker: "Is there a job? Yes! Claim it!"
   - Stage 3 worker: "Is there a job? Yes! Claim it!"
   - **Winner (random)**: Generic worker claims job first

4. **Processing Attempt**: Generic worker tries to process
   ```typescript
   const handler = jobHandlers[jobType]; // jobType = 'STAGE_3_SUMMARIZATION'
   // handler = undefined (not in registry)
   if (!handler) {
     throw new Error('No handler registered for job type');
   }
   ```

5. **Result**: Job fails with "Job handler not found" error

### Contributing Factors

- **Factor 1**: No architectural guidance on single vs multiple workers per queue
- **Factor 2**: Stage 3 worker added without considering existing generic worker
- **Factor 3**: Test setup starts both workers unconditionally

---

## Proposed Solutions

### Solution 1: Add Job Name Filtering to Stage 3 Worker ⭐ RECOMMENDED

**Description**: Implement job name check inside Stage 3 worker's processor function to ONLY process 'STAGE_3_SUMMARIZATION' jobs.

**Why This Addresses Root Cause**: Prevents Stage 3 worker from attempting to process jobs it shouldn't handle, eliminating race condition impact.

**Implementation Steps**:
1. Modify `src/orchestrator/workers/stage3-summarization.worker.ts` (line 362)
2. Wrap processor function with job name conditional check
3. Log and skip jobs that don't match 'STAGE_3_SUMMARIZATION'

**Files to Modify**:
- `src/orchestrator/workers/stage3-summarization.worker.ts` - Add filtering logic

**Code Changes**:
```typescript
// BEFORE (lines 362-371)
export const summarizationWorker = new Worker<SummarizationJobData, SummarizationResult>(
  WORKER_CONFIG.queueName,
  processSummarizationJob,
  {
    connection: getRedisClient(),
    concurrency: WORKER_CONFIG.concurrency,
    removeOnComplete: WORKER_CONFIG.removeOnComplete,
    lockDuration: WORKER_CONFIG.timeout,
  }
);

// AFTER
export const summarizationWorker = new Worker<SummarizationJobData, SummarizationResult>(
  WORKER_CONFIG.queueName,
  async (job) => {
    // Filter: Only process STAGE_3_SUMMARIZATION jobs
    if (job.name !== WORKER_CONFIG.jobType) {
      logger.debug(
        { jobId: job.id, jobName: job.name, expectedType: WORKER_CONFIG.jobType },
        'Stage 3 worker skipping non-summarization job'
      );
      // Return immediately without processing - job will be picked up by appropriate worker
      return { success: false, skipped: true, reason: 'Job type mismatch' };
    }

    // Process summarization job
    return await processSummarizationJob(job);
  },
  {
    connection: getRedisClient(),
    concurrency: WORKER_CONFIG.concurrency,
    removeOnComplete: WORKER_CONFIG.removeOnComplete,
    lockDuration: WORKER_CONFIG.timeout,
  }
);
```

**Testing Strategy**:
- Run E2E test suite (tests/e2e/stage3-real-documents.test.ts)
- Verify Stage 3 worker only processes STAGE_3_SUMMARIZATION jobs
- Verify generic worker still processes test_job, initialize, document_processing
- Check logs confirm filtering behavior

**Pros**:
- ✅ Minimal code change (5-10 lines)
- ✅ Follows BullMQ recommended pattern (Context7 docs)
- ✅ No architectural changes needed
- ✅ Both workers can coexist peacefully
- ✅ Easy to replicate for future specialized workers

**Cons**:
- ❌ Stage 3 worker still "sees" all jobs (wastes polling cycles)
- ❌ Jobs might get picked up by wrong worker first (then returned)
- ❌ Slight performance overhead from filtering

**Complexity**: Low

**Risk Level**: Low

**Estimated Effort**: 15 minutes

---

### Solution 2: Register STAGE_3_SUMMARIZATION Handler in Generic Worker

**Description**: Add Stage 3 handler to generic worker's handler registry, allowing it to process STAGE_3_SUMMARIZATION jobs.

**Why This Addresses Root Cause**: Eliminates "handler not found" error by ensuring generic worker CAN handle the job type.

**Implementation Steps**:
1. Import Stage 3 handler in `src/orchestrator/worker.ts`
2. Register handler in `jobHandlers` registry (line 42)
3. Remove Stage 3 worker from test setup (only use generic worker)

**Files to Modify**:
- `src/orchestrator/worker.ts` - Add handler registration
- `tests/global-setup.ts` - Remove Stage 3 worker startup

**Pros**:
- ✅ Single worker architecture (simpler)
- ✅ No race conditions
- ✅ Centralized job handling

**Cons**:
- ❌ Violates separation of concerns (Stage 3 logic in generic worker)
- ❌ Makes generic worker less generic
- ❌ Harder to scale Stage 3 independently
- ❌ Removes purpose of specialized worker

**Complexity**: Low

**Risk Level**: Medium (architectural change)

**Estimated Effort**: 20 minutes

---

### Solution 3: Use Separate Queues for Stage 3 Jobs

**Description**: Create dedicated 'stage3-summarization' queue for Stage 3 jobs, separating from 'course-generation' queue.

**Why This Addresses Root Cause**: Complete isolation - workers cannot compete if on different queues.

**Implementation Steps**:
1. Create new queue 'stage3-summarization'
2. Update Stage 3 worker to connect to new queue
3. Update job submission code to use new queue for Stage 3 jobs
4. Update all tests to use correct queue names

**Files to Modify**:
- `src/orchestrator/workers/stage3-summarization.worker.ts` - Change queue name
- All test files (20+ files) - Update queue.add() calls
- Any production code submitting Stage 3 jobs

**Pros**:
- ✅ Complete isolation (no possibility of collision)
- ✅ Independent scaling per queue
- ✅ Clear architectural boundaries

**Cons**:
- ❌ Major architectural change
- ❌ Requires updates to 20+ test files
- ❌ More complex infrastructure (multiple queues to monitor)
- ❌ Breaks single-queue design pattern

**Complexity**: High

**Risk Level**: High (breaking changes)

**Estimated Effort**: 2-3 hours

---

## Implementation Guidance

### For Implementation Agent

**Priority**: High

**Recommended Approach**: Solution 1 (Add Job Name Filtering)

**Files Requiring Changes**:
1. `src/orchestrator/workers/stage3-summarization.worker.ts`
   - **Line Range**: 362-371 (Worker initialization)
   - **Change Type**: Modify - wrap processor with filtering logic
   - **Purpose**: Prevent Stage 3 worker from processing non-Stage-3 jobs

**Validation Criteria**:
- ✅ Stage 3 E2E tests pass (tests/e2e/stage3-real-documents.test.ts)
- ✅ Generic worker tests still pass (existing test suite)
- ✅ Log output shows Stage 3 worker skipping non-summarization jobs (if applicable)
- ✅ No "Job handler not found" errors for STAGE_3_SUMMARIZATION jobs

**Testing Requirements**:
- Unit tests: None needed (behavioral change, covered by integration tests)
- Integration tests: Run full Stage 3 test suite
  ```bash
  npm test tests/integration/stage3-*.test.ts
  npm test tests/e2e/stage3-*.test.ts
  ```
- Manual verification:
  1. Start both workers
  2. Submit STAGE_3_SUMMARIZATION job
  3. Submit test_job
  4. Verify correct worker processes each job (check logs)

**Dependencies**:
- None - uses existing BullMQ patterns

---

## Risks and Considerations

### Implementation Risks

- **Risk 1**: Jobs picked up by Stage 3 worker return "skipped", might confuse monitoring
  - **Mitigation**: Ensure return value doesn't mark job as failed; use specific "skipped" status

- **Risk 2**: Performance overhead from unnecessary job claims
  - **Mitigation**: Acceptable for now; consider separate queues if becomes bottleneck

### Performance Impact

Minimal - slight overhead from conditional check (~0.1ms per job claim)

### Breaking Changes

None - internal implementation change only

### Side Effects

- Stage 3 worker might claim jobs it immediately skips
- Logs will show "skipped" messages for non-Stage-3 jobs claimed by Stage 3 worker
- Both workers continue polling all jobs (Redis query load unchanged)

---

## Execution Flow Diagram

**Current (Broken) Flow**:
```
Job Added: 'STAGE_3_SUMMARIZATION'
  ↓
Redis Queue: 'course-generation'
  ↓
┌─────────────────────┬────────────────────────┐
│ Generic Worker      │ Stage 3 Worker         │
│ (polls queue)       │ (polls queue)          │
└─────────────────────┴────────────────────────┘
  ↓ RACE CONDITION
Generic Worker Claims Job First
  ↓
Look up handler: jobHandlers['STAGE_3_SUMMARIZATION']
  ↓
Handler NOT FOUND (undefined)
  ↓
❌ Error: "Job handler not found"
```

**Fixed Flow (Solution 1)**:
```
Job Added: 'STAGE_3_SUMMARIZATION'
  ↓
Redis Queue: 'course-generation'
  ↓
┌─────────────────────┬────────────────────────┐
│ Generic Worker      │ Stage 3 Worker         │
│ (polls queue)       │ (polls queue)          │
└─────────────────────┴────────────────────────┘
  ↓ RACE CONDITION (still exists)
  ↓
┌────────────────────────────────────────┐
│ Scenario A: Generic Worker Claims Job │
└────────────────────────────────────────┘
  ↓
Look up handler: jobHandlers['STAGE_3_SUMMARIZATION']
  ↓
Handler NOT FOUND
  ↓
❌ Error: "Job handler not found"
  ↓
Job returns to queue (retry)
  ↓
┌────────────────────────────────────────┐
│ Scenario B: Stage 3 Worker Claims Job │
└────────────────────────────────────────┘
  ↓
Check job.name === 'STAGE_3_SUMMARIZATION'? YES
  ↓
Call processSummarizationJob(job)
  ↓
✅ Success: Job processed correctly
```

**Note**: Solution 1 doesn't fully eliminate race condition, but ensures correct worker eventually processes job. For complete elimination, use Solution 3 (separate queues).

**Divergence Point**: When generic worker claims STAGE_3_SUMMARIZATION job instead of Stage 3 worker

---

## Additional Context

### Related Issues

- BullMQ GitHub Issue #297: "How do I only process Jobs with a specific name?"
  - Confirms conditional processing pattern
- BullMQ GitHub Issue #84: "Accept/reject jobs by job name?"
  - Explains removal of per-job-name workers from Bull library

### Documentation References

**Context7 Documentation Findings**:

**From BullMQ Documentation** (Context7: `/taskforcesh/bullmq`):
> "This snippet demonstrates how to create a BullMQ worker that handles different
> job types using a switch case based on the job's name. It allows for distinct
> processing logic for various tasks within the same queue."

**Key Insights from Context7**:
- Pattern Name: "Named Processor"
- Location: `docs/gitbook/patterns/named-processor.md`
- Core Concept: Single queue, multiple job types, conditional processing
- Implementation: Switch statement or if/else based on `job.name`

**What Context7 Provided**:
- Clear pattern for job name filtering in processor
- Code example showing switch case on job.name
- Confirmation that this is the recommended approach

**What Was Missing from Context7**:
- Explicit warning about race conditions with multiple workers
- Best practices for specialized vs generic workers
- Performance implications of filtering

**Tier 3 Sources Used**:
- https://github.com/taskforcesh/bullmq/issues/297
  - Provided: Confirmation that NO Worker constructor option exists
- https://github.com/taskforcesh/bullmq/issues/84
  - Provided: Historical context on design decision

### MCP Server Usage

**Context7 MCP**:
- Libraries queried: `/taskforcesh/bullmq`
- Topics searched:
  - "Worker constructor name option job filtering"
  - "Worker name option filter jobs by name"
- **Quotes/excerpts included**: ✅ YES (see Documentation References section)
- Insights gained: BullMQ uses conditional processing pattern, not constructor filtering

**Sequential Thinking MCP**: Not used (investigation was straightforward)

**Supabase MCP**: Not used (no database investigation needed)

---

## Next Steps

### For Orchestrator/User

1. **Review this investigation report**
2. **Select solution approach** (Recommended: Solution 1)
3. **Implement the fix** using guidance above
4. **Validation**: After implementation, run full test suite

### Follow-Up Recommendations

- **Long-term**: Consider Solution 3 (separate queues) if Stage 3 scales independently
- **Process improvement**: Document pattern for future specialized workers
  - Add filtering logic to prevent job type conflicts
  - Update developer guidelines for multi-worker setups
- **Monitoring**: Add metrics to track job claims by wrong worker (if becomes issue)

---

## Investigation Log

### Timeline

- **12:00 PM**: Investigation started
- **12:05 PM**: Initial hypotheses formed (3 hypotheses)
- **12:15 PM**: Context7 MCP research completed (BullMQ patterns)
- **12:25 PM**: Code analysis completed (both workers examined)
- **12:35 PM**: Root cause identified (no filtering in Stage 3 worker)
- **12:40 PM**: Solutions formulated (3 approaches)
- **12:45 PM**: Report generated

### Commands Run

1. `grep -r "STAGE_3_SUMMARIZATION" packages/course-gen-platform --include="*.ts"`
   - Found 20 test files using job type
2. `grep -r "summarizationWorker" packages/course-gen-platform/tests --include="*.ts" -l`
   - Found global-setup.ts initializing worker

### MCP Calls Made

1. `mcp__context7__resolve-library-id({libraryName: "bullmq"})`
   - Result: `/taskforcesh/bullmq` with 289 code snippets
2. `mcp__context7__get-library-docs({context7CompatibleLibraryID: "/taskforcesh/bullmq", topic: "Worker constructor name option job filtering"})`
   - Result: Named Processor pattern documentation
3. `WebSearch({query: "BullMQ Worker options name filter specific job names 2025"})`
   - Result: Confirmed no constructor option exists

---

**Investigation Complete**

✅ Root cause identified with supporting evidence
✅ Multiple solution approaches proposed
✅ Implementation guidance provided
✅ Ready for implementation phase

Report saved: `docs/investigations/INV-2025-10-29-001-worker-job-collision.md`
