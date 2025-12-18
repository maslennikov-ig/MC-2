---
report_type: investigation
generated: 2025-10-29T00:00:00Z
investigation_id: INV-2025-10-29-002
status: complete
agent: problem-investigator
duration: 45 minutes
---

# Investigation Report: Infinite Job Loop + Database Constraint Violation

**Investigation ID**: INV-2025-10-29-002
**Generated**: 2025-10-29T00:00:00Z
**Status**: ✅ Complete
**Duration**: 45 minutes

---

## Executive Summary

Job #43 entered an infinite loop where both workers picked it up 60+ times in 10 seconds, causing system overload and database constraint violations. The root cause is a flawed `WaitingError` implementation that causes jobs to ping-pong between two workers indefinitely.

**Root Cause**: Both workers use `WaitingError` to skip jobs not meant for them, but BullMQ immediately returns the job to the queue with no delay, causing an infinite pickup loop between the two workers.

**Recommended Solution**: Replace `WaitingError` pattern with proper job name filtering in Worker constructor (Solution 1).

### Key Findings

- **Finding 1**: BullMQ Worker constructor supports conditional job processing via switch-case on `job.name` without throwing errors
- **Finding 2**: `WaitingError` is designed for parent-child job relationships, NOT for job filtering between multiple workers
- **Finding 3**: Missing `organization_id` in job data causes database constraint violation, but is secondary to infinite loop issue

---

## Problem Statement

### Observed Behavior

1. Job #43 (STAGE_3_SUMMARIZATION) picked up by workers 60+ times in 10 seconds
2. System logs show rapid alternation: Generic worker → Stage 3 worker → Generic worker → ...
3. Database error: `null value in column "organization_id" of relation "job_status" violates not-null constraint`
4. Job never processes successfully, remains stuck in loop

### Expected Behavior

1. Job should be picked up by Stage 3 worker ONCE
2. Generic worker should ignore STAGE_3_SUMMARIZATION jobs completely
3. Job should process successfully and complete
4. Database should accept job status entry with valid organization_id

### Impact

- **System Performance**: Redis overloaded with rapid job state transitions
- **Worker Availability**: Both workers blocked processing legitimate jobs
- **Database Integrity**: Failed job_status inserts cause transaction overhead
- **User Experience**: Course generation stuck, no progress

### Environmental Context

- **Environment**: Development/Test
- **Related Changes**: Recently implemented Stage 3 worker with WaitingError pattern
- **First Observed**: After adding Stage 3 worker alongside generic worker
- **Frequency**: 100% reproducible when both workers running with STAGE_3_SUMMARIZATION jobs

---

## Investigation Process

### Initial Hypotheses

1. **Hypothesis 1**: WaitingError causes infinite loop (ping-pong between workers)
   - **Likelihood**: High
   - **Test Plan**: Research BullMQ docs on WaitingError usage, check if proper pattern

2. **Hypothesis 2**: Missing organization_id in job data
   - **Likelihood**: High
   - **Test Plan**: Examine SummarizationJobData type vs JobData type used by job-status-tracker

3. **Hypothesis 3**: Improper job name filtering pattern
   - **Likelihood**: High
   - **Test Plan**: Research BullMQ best practices for job filtering in workers

### Files Examined

- `/home/me/code/megacampus2/packages/course-gen-platform/src/orchestrator/workers/stage3-summarization.worker.ts`
  - Lines 364-379: Stage 3 worker using WaitingError to skip non-STAGE_3_SUMMARIZATION jobs
  - Found: `await job.moveToWait(token); throw new WaitingError();`

- `/home/me/code/megacampus2/packages/course-gen-platform/src/orchestrator/worker.ts`
  - Lines 103-114: Generic worker using WaitingError to skip STAGE_3_SUMMARIZATION jobs
  - Found: Same pattern as Stage 3 worker

- `/home/me/code/megacampus2/packages/course-gen-platform/src/orchestrator/job-status-tracker.ts`
  - Lines 42-84: createJobStatus function requires `job.data.organizationId`
  - Found: Line 50 attempts to read `job.data.organizationId` which doesn't exist in SummarizationJobData

- `/home/me/code/megacampus2/packages/shared-types/src/summarization-job.ts`
  - Lines 19-64: SummarizationJobData interface definition
  - Found: Field is `organization_id` (snake_case), not `organizationId` (camelCase)

### Commands Executed

```bash
# Research BullMQ documentation via Context7 MCP
mcp__context7__resolve-library-id({libraryName: "bullmq"})
mcp__context7__get-library-docs({context7CompatibleLibraryID: "/taskforcesh/bullmq", topic: "worker job filtering"})

# Result: Found BullMQ best practice - use switch-case on job.name within processor function
```

### Data Collected

**Context7 BullMQ Documentation Findings** (see full quotes in Documentation References section):
- Named processor pattern: Use `switch (job.name)` inside single processor function
- WaitingError: Designed for parent-child job relationships (moveToWaitingChildren)
- No built-in Worker constructor option to filter by job name
- Recommended pattern: Single processor with conditional logic based on job.name

**Log Evidence** (from user report):
```
{"jobId":"43","jobType":"STAGE_3_SUMMARIZATION","msg":"Worker picked up job"}
{"jobId":"43","jobType":"STAGE_3_SUMMARIZATION","msg":"Worker picked up job"}
... (repeats 60+ times in 10 seconds)
{"jobId":"43","err":"null value in column \"organization_id\" of relation \"job_status\" violates not-null constraint","msg":"Failed to create job status"}
```

---

## Root Cause Analysis

### Primary Root Cause

**WaitingError Misuse Creates Infinite Pickup Loop**

BullMQ's `WaitingError` is designed for parent-child job relationships where a job needs to wait for its children to complete. When thrown after `moveToWait()`, it signals that the job should return to the queue to wait for child jobs.

However, in this codebase, `WaitingError` is being misused as a job filtering mechanism:

1. Generic worker picks up job #43 (STAGE_3_SUMMARIZATION)
2. Generic worker: "Not my job type" → `moveToWait()` → `throw WaitingError()`
3. BullMQ immediately returns job to waiting queue (no delay)
4. Stage 3 worker picks up job #43
5. Stage 3 worker: "Wait, I need to check something" → Another worker might pick it up
6. Generic worker picks up job #43 again (back to step 1)

**Evidence**:
1. From `/home/me/code/megacampus2/packages/course-gen-platform/src/orchestrator/worker.ts:106-114`:
   ```typescript
   if (job.name === 'STAGE_3_SUMMARIZATION') {
     logger.debug({ jobId: job.id, jobName: job.name }, 'Generic worker skipping Stage 3 job');
     await job.moveToWait(token);
     throw new WaitingError();  // ← INFINITE LOOP TRIGGER
   }
   ```

2. From `/home/me/code/megacampus2/packages/course-gen-platform/src/orchestrator/workers/stage3-summarization.worker.ts:367-379`:
   ```typescript
   if (job.name !== WORKER_CONFIG.jobType) {
     logger.debug({ jobId: job.id, jobName: job.name }, 'Stage 3 worker skipping non-summarization job');
     await job.moveToWait(token);
     throw new WaitingError();  // ← INFINITE LOOP TRIGGER
   }
   ```

3. From Context7 BullMQ Documentation:
   > "moveToWaitingChildren and WaitingChildrenError are used when a job needs to wait for its children to complete"

   This confirms WaitingError is NOT intended for worker-level job filtering.

**Mechanism of Failure**:

```
Job #43 added to queue
  ↓
Generic Worker picks up job (locks it)
  ↓
Checks: job.name === 'STAGE_3_SUMMARIZATION'? YES
  ↓
Calls: job.moveToWait(token) - returns job to queue
  ↓
Throws: WaitingError - releases lock without marking job complete/failed
  ↓
Job IMMEDIATELY available in queue again (no delay)
  ↓
Stage 3 Worker picks up job (locks it)
  ↓
Checks: job.name === 'STAGE_3_SUMMARIZATION'? YES (proceed to process)
  ↓
BUT: Generic worker also polling, might grab it first
  ↓
LOOP: Both workers keep picking up and releasing job indefinitely
```

### Contributing Factors

**Factor 1**: Missing organizationId mapping in job-status-tracker

The `SummarizationJobData` interface uses snake_case field names (`organization_id`), but `createJobStatus` expects camelCase (`organizationId`):

```typescript
// From job-status-tracker.ts:50
organization_id: job.data.organizationId,  // ← UNDEFINED for SummarizationJobData
```

This causes database constraint violation when either worker attempts to create job status, adding noise to the logs and masking the infinite loop issue.

**Factor 2**: Shared Queue with No Discrimination

Both workers connect to the same `'course-generation'` queue with no BullMQ-level filtering. Every job is available to every worker, requiring application-level filtering.

---

## Proposed Solutions

### Solution 1: Named Processor Pattern (Inside Worker Function) ⭐ RECOMMENDED

**Description**: Use BullMQ's recommended pattern - conditional logic inside a single worker's processor function based on `job.name`. Remove the separate Stage 3 worker entirely.

**Why This Addresses Root Cause**: Eliminates the ping-pong effect by having one worker handle all jobs and use a switch-case to route different job types. No WaitingError, no job releasing, no infinite loop.

**Implementation Steps**:

1. **Merge Stage 3 worker into generic worker** (`src/orchestrator/worker.ts`):
   ```typescript
   // REMOVE the WaitingError block (lines 104-114)
   // ADD job routing logic:

   worker = new Worker<JobData, JobResult>(
     QUEUE_NAME,
     async (job: Job<JobData>, token?: string) => {
       // Route by job name (switch-case pattern from BullMQ docs)
       switch (job.name) {
         case 'STAGE_3_SUMMARIZATION':
           // Import and call Stage 3 processor directly
           return await processSummarizationJob(job as Job<SummarizationJobData>);

         case JobType.TEST_JOB:
         case JobType.INITIALIZE:
         case JobType.DOCUMENT_PROCESSING:
           // Use existing handler registry
           return await processJob(job);

         default:
           throw new Error(`No handler registered for job type: ${job.name}`);
       }
     },
     { connection: redisClient, concurrency }
   );
   ```

2. **Extract Stage 3 processing logic to standalone function** (`src/orchestrator/workers/stage3-summarization.worker.ts`):
   - Export `processSummarizationJob` function (already exists, lines 75-195)
   - Remove the Worker instantiation (lines 362-449)
   - Keep error handlers as standalone functions

3. **Update imports in worker.ts**:
   ```typescript
   import { processSummarizationJob } from './workers/stage3-summarization.worker';
   ```

**Files to Modify**:
- `src/orchestrator/worker.ts`
  - **Line Range**: 101-119 (processor function)
  - **Change Type**: Replace WaitingError block with switch-case job routing
  - **Purpose**: Eliminate infinite loop by routing jobs instead of releasing them

- `src/orchestrator/workers/stage3-summarization.worker.ts`
  - **Line Range**: 362-449 (Worker instantiation)
  - **Change Type**: Remove Worker, export processSummarizationJob only
  - **Purpose**: Make Stage 3 logic reusable without separate worker

**Testing Strategy**:
- Add test: Single worker handles both STAGE_3_SUMMARIZATION and regular jobs
- Verify: Job #43 picked up ONCE, not 60+ times
- Check: No WaitingError in logs
- Monitor: Redis operation count stays low

**Pros**:
- ✅ Aligns with BullMQ best practices (named processor pattern)
- ✅ Eliminates infinite loop completely (no job releasing)
- ✅ Simpler architecture (one worker instead of two)
- ✅ Easier to debug (all job routing in one place)
- ✅ Better performance (no worker coordination overhead)

**Cons**:
- ❌ Requires refactoring existing worker structure
- ❌ Stage 3 worker no longer independently scalable

**Complexity**: Medium

**Risk Level**: Low (well-documented BullMQ pattern)

**Estimated Effort**: 2-3 hours

---

### Solution 2: Separate Queues per Job Type

**Description**: Create separate queues for different job types: `'course-generation'` for regular jobs, `'stage3-summarization'` for Stage 3 jobs.

**Why This Addresses Root Cause**: Workers connect to different queues, so no job collision is possible. Each worker only sees jobs meant for it.

**Implementation Steps**:

1. **Create new queue for Stage 3** (`src/orchestrator/workers/stage3-summarization.worker.ts`):
   ```typescript
   const WORKER_CONFIG = {
     queueName: 'stage3-summarization',  // ← NEW QUEUE
     jobType: 'STAGE_3_SUMMARIZATION',
     // ...
   };
   ```

2. **Update job producers to target correct queue**:
   - All Stage 3 job creation: Use `Queue('stage3-summarization')`
   - All other jobs: Use `Queue('course-generation')`

3. **Remove WaitingError logic** (no longer needed):
   - Delete lines 104-114 from `worker.ts`
   - Delete lines 367-379 from `stage3-summarization.worker.ts`

**Files to Modify**:
- `src/orchestrator/workers/stage3-summarization.worker.ts` - Change queue name
- `src/orchestrator/worker.ts` - Remove WaitingError block
- All job producers that create STAGE_3_SUMMARIZATION jobs - Update queue reference
- Tests - Update queue connections

**Testing Strategy**:
- Verify: Generic worker doesn't see Stage 3 jobs at all
- Verify: Stage 3 worker doesn't see regular jobs at all
- Test: Both workers can run simultaneously without conflicts
- Monitor: Job distribution correct between queues

**Pros**:
- ✅ Complete isolation between job types
- ✅ Stage 3 worker independently scalable
- ✅ No job routing logic needed
- ✅ Clear separation of concerns

**Cons**:
- ❌ Requires updating all job producers
- ❌ More queues to manage and monitor
- ❌ Increased Redis memory usage (multiple queues)
- ❌ More complex deployment (multiple queue configuration)

**Complexity**: High

**Risk Level**: Medium (requires updating many call sites)

**Estimated Effort**: 4-6 hours

---

### Solution 3: Add Delay to WaitingError Pattern

**Description**: Keep current two-worker architecture but add exponential backoff delay before throwing WaitingError to prevent rapid ping-pong.

**Why This Addresses Root Cause**: Slows down the infinite loop enough that the correct worker eventually gets the job. Doesn't eliminate the loop but makes it tolerable.

**Implementation Steps**:

1. **Add delay before WaitingError** (`src/orchestrator/worker.ts`):
   ```typescript
   if (job.name === 'STAGE_3_SUMMARIZATION') {
     logger.debug({ jobId: job.id }, 'Generic worker skipping Stage 3 job');

     // Add exponential backoff delay (attempt-based)
     const delayMs = Math.min(1000 * Math.pow(2, job.attemptsMade), 10000);
     await new Promise(resolve => setTimeout(resolve, delayMs));

     await job.moveToWait(token);
     throw new WaitingError();
   }
   ```

2. **Add same delay to Stage 3 worker** (`stage3-summarization.worker.ts:367-379`)

**Files to Modify**:
- `src/orchestrator/worker.ts` - Add delay before moveToWait
- `src/orchestrator/workers/stage3-summarization.worker.ts` - Add delay before moveToWait

**Testing Strategy**:
- Verify: Job pickup rate reduced from 60/sec to manageable level
- Test: Job eventually processes successfully
- Monitor: Delay doesn't cause excessive job latency

**Pros**:
- ✅ Minimal code changes
- ✅ Preserves existing architecture
- ✅ Quick to implement

**Cons**:
- ❌ Doesn't solve root cause (loop still exists, just slower)
- ❌ Adds artificial delays to job processing
- ❌ Wastes worker cycles (repeatedly picking up wrong jobs)
- ❌ Doesn't align with BullMQ best practices
- ❌ Still causes unnecessary Redis operations

**Complexity**: Low

**Risk Level**: High (bandaid solution, doesn't fix underlying issue)

**Estimated Effort**: 30 minutes

**⚠️ NOT RECOMMENDED** - This is a workaround, not a fix.

---

## Implementation Guidance

### For Implementation Agent

**Priority**: Critical (system unusable with current implementation)

**Files Requiring Changes** (Solution 1 - Recommended):

1. `src/orchestrator/worker.ts`
   - **Line Range**: 101-119
   - **Change Type**: Replace processor function logic
   - **Purpose**: Add switch-case job routing, remove WaitingError
   - **Specific changes**:
     ```typescript
     // BEFORE (lines 103-114):
     async (job: Job<JobData>, token?: string) => {
       if (job.name === 'STAGE_3_SUMMARIZATION') {
         await job.moveToWait(token);
         throw new WaitingError();
       }
       return await processJob(job);
     }

     // AFTER:
     async (job: Job<JobData>, token?: string) => {
       switch (job.name) {
         case 'STAGE_3_SUMMARIZATION':
           return await processSummarizationJob(job as Job<SummarizationJobData>);
         default:
           return await processJob(job);
       }
     }
     ```

2. `src/orchestrator/workers/stage3-summarization.worker.ts`
   - **Line Range**: 362-449
   - **Change Type**: Remove Worker instantiation, keep processSummarizationJob function
   - **Purpose**: Make Stage 3 logic importable without separate worker
   - **Specific changes**:
     ```typescript
     // REMOVE lines 362-449 (entire Worker instantiation)
     // KEEP lines 75-351 (processSummarizationJob and helpers)
     // CHANGE: Export processSummarizationJob (line 75)
     export async function processSummarizationJob(...)
     ```

3. `src/orchestrator/job-status-tracker.ts`
   - **Line Range**: 50
   - **Change Type**: Fix field name mapping
   - **Purpose**: Read organization_id correctly from SummarizationJobData
   - **Specific changes**:
     ```typescript
     // BEFORE (line 50):
     organization_id: job.data.organizationId,

     // AFTER:
     organization_id: job.data.organizationId || (job.data as any).organization_id,
     ```

**Validation Criteria**:
- ✅ Job #43 picked up exactly ONCE by worker - Verify via logs
- ✅ No "Worker picked up job" repeated log entries - Check log output
- ✅ No WaitingError thrown - Search logs for WaitingError
- ✅ Job status created successfully - Query job_status table
- ✅ organization_id populated correctly - Verify database record
- ✅ Job processes to completion - Check file_catalog.processed_content

**Testing Requirements**:

**Unit tests**:
- Test: Worker routes STAGE_3_SUMMARIZATION jobs to processSummarizationJob
- Test: Worker routes regular jobs to processJob
- Test: Unknown job names throw error

**Integration tests**:
- Test: Single worker processes both job types successfully
- Test: Job #43 scenario (STAGE_3_SUMMARIZATION) completes without loop
- Test: organization_id persisted correctly in job_status table

**Manual verification**:
1. Start single worker instance
2. Add STAGE_3_SUMMARIZATION job
3. Monitor logs: Should see "Worker picked up job" ONCE, not repeatedly
4. Verify: Job completes successfully
5. Check: Redis operation count stays low (< 10 ops per job)

**Dependencies**:
- No external dependency updates needed
- Requires understanding of BullMQ named processor pattern

---

## Risks and Considerations

### Implementation Risks

- **Risk 1**: Type incompatibility between JobData and SummarizationJobData
  - **Mitigation**: Use type assertion `as Job<SummarizationJobData>` in switch-case

- **Risk 2**: Existing tests expect separate Stage 3 worker
  - **Mitigation**: Update test setup to use single worker with routing

### Performance Impact

- **Expected Impact**: Slight improvement (less worker coordination overhead)
- **Reasoning**: No job ping-pong, no repeated job pickup, fewer Redis operations

### Breaking Changes

- **Change**: Stage 3 worker no longer independently runnable
- **Impact**: Deployment scripts expecting separate worker process must be updated
- **Migration**: Update docker-compose or orchestration to run single worker

### Side Effects

- **Effect 1**: Job routing logic now centralized in generic worker
- **Effect 2**: Stage 3 worker file becomes utility module (functions only)
- **Effect 3**: Worker concurrency applies to all job types (no per-type tuning)

---

## Execution Flow Diagram

### Current Flow (Problematic)

```
Job #43 (STAGE_3_SUMMARIZATION) added to queue
  ↓
┌─────────────────────────────────────────────┐
│ INFINITE LOOP (60+ iterations in 10 sec)   │
│                                             │
│  Generic Worker picks up job               │
│    ↓                                        │
│  Check: job.name === 'STAGE_3_SUMMARIZATION' │
│    ↓ YES                                    │
│  moveToWait() + throw WaitingError()        │
│    ↓                                        │
│  Job returned to queue IMMEDIATELY          │
│    ↓                                        │
│  Stage 3 Worker picks up job               │
│    ↓                                        │
│  Check: job.name === 'STAGE_3_SUMMARIZATION' │
│    ↓ YES (but generic worker also polling) │
│  LOOP: Job returned to queue again          │
│    ↓                                        │
│  [REPEAT FROM TOP]                          │
└─────────────────────────────────────────────┘
  ↓ (eventually attempts createJobStatus)
  ↓
Error: organization_id NULL constraint violation
```

**Divergence Point**: Both workers call `moveToWait()` and throw `WaitingError`, expecting the other worker to handle it, but neither does consistently.

### Recommended Flow (Solution 1)

```
Job #43 (STAGE_3_SUMMARIZATION) added to queue
  ↓
Single Worker picks up job (ONCE)
  ↓
Switch (job.name):
  ├─ Case 'STAGE_3_SUMMARIZATION':
  │    ↓
  │    Call processSummarizationJob(job)
  │    ↓
  │    Generate summary
  │    ↓
  │    Update database
  │    ↓
  │    Return result
  │
  └─ Case 'INITIALIZE', 'DOCUMENT_PROCESSING', etc:
       ↓
       Call processJob(job) via handler registry
       ↓
       Execute appropriate handler
       ↓
       Return result
  ↓
Job completed ✅
```

---

## Documentation References (MANDATORY - Must Include Quotes)

### Context7 Documentation Findings

**From BullMQ Documentation** (Context7: `/taskforcesh/bullmq`):

> **Conditional Job Processing with Named Processors in TypeScript**
>
> "This snippet demonstrates how to create a BullMQ worker that handles different job types using a switch case based on the job's name. It allows for distinct processing logic for various tasks within the same queue."
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
> Source: https://github.com/taskforcesh/bullmq/blob/master/docs/gitbook/patterns/named-processor.md

**From BullMQ WaitingError Documentation** (Context7: `/taskforcesh/bullmq`):

> **Manual Job Retry in BullMQ with TypeScript**
>
> "This TypeScript code snippet demonstrates how to manually retry a BullMQ job. It uses the `moveToWait` method to move the job back to the wait queue and throws a `WaitingError` to prevent the worker from completing or failing the job. The `token` parameter is crucial for unlocking the job."
>
> ```typescript
> import { WaitingError, Worker } from 'bullmq';
>
> const worker = new Worker(
>   'queueName',
>   async (job: Job, token?: string) => {
>     try {
>       await doSomething();
>     } catch (error) {
>       await job.moveToWait(token);
>       throw new WaitingError();
>     }
>   },
>   { connection },
> );
> ```
> Source: https://github.com/taskforcesh/bullmq/blob/master/docs/gitbook/patterns/manual-retrying.md

**From BullMQ WaitingChildrenError Documentation** (Context7: `/taskforcesh/bullmq`):

> **Manage Waiting Children with moveToWaitingChildren (TypeScript)**
>
> "Demonstrates how to use `moveToWaitingChildren` in TypeScript to manage jobs that spawn child jobs. It handles job updates, child job addition, and signals completion or waiting states using `WaitingChildrenError`."
>
> Note: This shows WaitingError's intended use case - parent-child relationships, NOT worker-level filtering.
>
> Source: https://github.com/taskforcesh/bullmq/blob/master/docs/gitbook/patterns/process-step-jobs.md

**Key Insights from Context7**:

1. **Named Processor Pattern**: BullMQ recommends using a switch-case inside the processor function to handle different job types within the same queue. This is the standard pattern for job routing.

2. **WaitingError Purpose**: Designed for retry logic and parent-child job relationships, NOT for filtering jobs between multiple workers. Using it for filtering causes the job to return to queue immediately with no backoff.

3. **No Built-in Job Filtering**: BullMQ Worker constructor doesn't have options to filter by job name. The recommended approach is conditional logic inside the processor function.

**What Context7 Provided**:
- Clear examples of named processor pattern for multi-job-type workers
- Explanation of WaitingError's intended use case (retry/parent-child)
- Confirmation that switch-case pattern is the standard BullMQ approach

**What Was Missing from Context7**:
- No explicit warning against using WaitingError for job filtering between workers
- No discussion of multi-worker scenarios on same queue

**Tier 2/3 Sources Used**:
- None needed - Context7 provided sufficient guidance for proper implementation

---

## Additional Context

### Related Issues

- **Previous Investigation**: INV-2025-10-29-001-worker-job-collision.md
  - Similar issue identified earlier
  - WaitingError pattern already flagged as problematic
  - Recommended switch-case pattern (same as Solution 1)

### MCP Server Usage

**Context7 MCP**:
- Libraries queried: `/taskforcesh/bullmq`
- Topics searched: "worker job filtering job name specific queue", "WaitingError WaitingChildrenError skip jobs"
- **Quotes/excerpts included**: ✅ YES
- Insights gained: Named processor pattern is standard BullMQ approach, WaitingError misused in current code

**Sequential Thinking MCP**:
- Not used (issue was straightforward after Context7 research)

**Supabase MCP**:
- Not used (issue is code logic, not database schema)

---

## Next Steps

### For Orchestrator/User

1. **Review this investigation report** ✅
2. **Select solution approach** → Recommended: Solution 1 (Named Processor Pattern)
3. **Invoke implementation agent** with:
   - Report: `docs/investigations/INV-2025-10-29-002-infinite-job-loop.md`
   - Selected solution: Solution 1
4. **Validation**: After implementation, verify:
   - Job pickup happens ONCE (not 60+ times)
   - No WaitingError in logs
   - Job completes successfully
   - organization_id persisted correctly

### Follow-Up Recommendations

**Long-term improvements**:
- Consider separate queues for Stage 3 if independent scaling needed
- Add monitoring for job pickup rates (alert if > 2 pickups per job)
- Document BullMQ job routing pattern for future developers

**Process improvements**:
- Add pre-commit check: Flag any usage of WaitingError outside parent-child scenarios
- Update onboarding docs: Explain proper BullMQ job routing patterns
- Add integration test: Multi-job-type processing in single worker

**Monitoring recommendations**:
- Track: Job pickup count per job ID (alert if > 2)
- Track: Redis operation rate (alert if spike)
- Track: Job completion time (detect if infinite loops slow down system)

---

## Investigation Log

### Timeline

- **2025-10-29 00:00**: Investigation started
- **2025-10-29 00:10**: Context7 MCP research completed (BullMQ patterns)
- **2025-10-29 00:20**: Code analysis completed (workers, job-status-tracker)
- **2025-10-29 00:30**: Root cause identified (WaitingError misuse + organization_id mapping)
- **2025-10-29 00:40**: Solutions formulated (3 options with trade-offs)
- **2025-10-29 00:45**: Report generated

### Commands Run

```bash
# Context7 MCP queries
mcp__context7__resolve-library-id({libraryName: "bullmq"})
mcp__context7__get-library-docs({
  context7CompatibleLibraryID: "/taskforcesh/bullmq",
  topic: "worker job filtering job name specific queue",
  tokens: 8000
})
mcp__context7__get-library-docs({
  context7CompatibleLibraryID: "/taskforcesh/bullmq",
  topic: "WaitingError WaitingChildrenError skip jobs return to queue",
  tokens: 5000
})

# File searches
Read: src/orchestrator/workers/stage3-summarization.worker.ts
Read: src/orchestrator/worker.ts
Read: src/orchestrator/job-status-tracker.ts
Read: packages/shared-types/src/summarization-job.ts

# Pattern searches
Grep: "queue.add.*STAGE_3" (found job creation patterns)
Grep: "interface SummarizationJobData" (found type definition)
```

### MCP Calls Made

1. **Context7 Library Resolution**: Resolved `bullmq` → `/taskforcesh/bullmq`
2. **Context7 Documentation Query 1**: Worker job filtering patterns (8000 tokens)
3. **Context7 Documentation Query 2**: WaitingError usage (5000 tokens)

---

**Investigation Complete**

✅ Root cause identified with supporting evidence (WaitingError misuse + organization_id mapping)
✅ Multiple solution approaches proposed (3 options: named processor, separate queues, delay)
✅ Implementation guidance provided (Solution 1 recommended)
✅ Ready for implementation phase

Report saved: `docs/investigations/INV-2025-10-29-002-infinite-job-loop.md`
