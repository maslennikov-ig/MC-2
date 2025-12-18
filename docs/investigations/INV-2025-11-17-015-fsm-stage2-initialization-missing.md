# Investigation Report: FSM Stage 2 Initialization Missing

---

**Investigation ID**: INV-2025-11-17-015
**Date**: 2025-11-17
**Investigator**: Problem Investigator Agent
**Status**: ✅ Root Cause Identified
**Severity**: 🔴 Critical
**Component**: Stage 2 Document Processing Pipeline

---

## Executive Summary

**Problem**: Course generation status remains stuck in `pending` throughout the entire pipeline, causing all FSM transitions to fail with "Invalid generation status transition: pending → stage_X_*" errors.

**Root Cause**: Stage 2 document processing pipeline is missing the REQUIRED initial FSM transition `pending → stage_2_init` before document processing begins. The `updateDocumentProcessingProgress()` function is called AFTER vectorization completes (when `completed >= 1`), attempting to transition directly from `pending → stage_2_processing`, which violates the FSM constraints.

**Impact**: Complete pipeline failure - no course can progress beyond Stage 2 because the FSM rejects all state transitions from the initial `pending` state.

**Recommended Solution**: Add initial FSM transition call (`pending → stage_2_init`) in `generation.initiate` tRPC endpoint IMMEDIATELY AFTER creating document processing jobs and BEFORE jobs execute.

**Implementation Priority**: 🔴 CRITICAL - Blocks all course generation with uploaded files.

---

## Problem Statement

### Observed Behavior

1. **Course Creation**: Course created with `generation_status = 'pending'` ✅
2. **Stage 2 Processing**: Documents process successfully, vectorization completes ✅
3. **Stage 3 Processing**: Summaries generate successfully ✅
4. **FSM Failure**: Course NEVER transitions from `pending` status ❌
5. **All RPC Calls Fail** with identical error pattern:

```
Invalid generation status transition: pending → stage_2_processing
Invalid generation status transition: pending → stage_2_complete
Invalid generation status transition: pending → stage_3_summarizing
Invalid generation status transition: pending → stage_3_complete
Invalid generation status transition: pending → stage_4_init
```

### Expected Behavior

Course should transition through FSM states in linear progression:

```
pending → stage_2_init → stage_2_processing → stage_2_complete →
stage_3_init → stage_3_summarizing → stage_3_complete →
stage_4_init → stage_4_analyzing → stage_4_complete →
stage_5_init → stage_5_generating → stage_5_complete →
finalizing → completed
```

### Impact

- **Severity**: CRITICAL - Complete pipeline failure
- **Scope**: ALL courses with uploaded files (4-file scenario confirmed)
- **User Impact**: No course generation possible for document-based workflows
- **Data Integrity**: Courses stuck in `pending` state indefinitely

### Environment

- **Branch**: `008-generation-generation-json`
- **Test Log**: `/tmp/t053-final-fix-test.log`
- **Migration Applied**: `20251117103031_redesign_generation_status.sql` (FSM redesign)
- **Migration Applied**: `20251117150000_update_rpc_for_new_fsm.sql` (RPC update)

---

## Investigation Process

### Phase 1: Code Analysis (Tier 0 - Project Internal)

**Files Examined**:
1. `src/server/routers/generation.ts` (tRPC endpoint - course creation)
2. `src/orchestrator/handlers/document-processing.ts` (Stage 2 handler)
3. `src/orchestrator/handlers/stage3-summarization.ts` (Stage 3 handler)
4. `src/orchestrator/handlers/stage4-analysis.ts` (Stage 4 handler)
5. `supabase/migrations/20251117103031_redesign_generation_status.sql` (FSM transitions)
6. `supabase/migrations/20251117150000_update_rpc_for_new_fsm.sql` (RPC function)

**Key Findings**:

**Finding 1: Stage 4 Handler Has Explicit Initialization** ✅

```typescript
// stage4-analysis.ts:206-219
jobLogger.info('Setting course status to stage_4_init');

const { error: statusInitError} = await supabaseAdmin
  .from('courses')
  .update({
    generation_status: 'stage_4_init' as const,
    updated_at: new Date().toISOString(),
  })
  .eq('id', course_id)
  .eq('organization_id', organization_id);

if (statusInitError) {
  throw new Error(`Failed to update status to stage_4_init: ${statusInitError.message}`);
}
```

**Finding 2: Stage 3 Handler Uses RPC for Progress** ✅

```typescript
// stage3-summarization.ts:116-123
if (completed < total) {
  // Still processing summaries
  const { error: rpcError } = await supabaseAdmin.rpc('update_course_progress', {
    p_course_id: courseId,
    p_step_id: 3,
    p_status: 'in_progress',
    p_message: `Создание резюме... (${completed}/${total})`,
  });
}
```

**Finding 3: Stage 2 Handler Has Progress Function BUT Called Too Late** ❌

```typescript
// document-processing.ts:645-758
private async updateDocumentProcessingProgress(
  courseId: string,
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>
): Promise<void> {
  // Count completed documents (vector_status='indexed')
  const { count: completedCount } = await supabaseAdmin
    .from('file_catalog')
    .select('*', { count: 'exact', head: true })
    .eq('course_id', courseId)
    .eq('vector_status', 'indexed');

  const completed = completedCount || 0;
  const total = totalCount || 0;

  // PROBLEMATIC LOGIC:
  // Handle initial transition: pending → stage_2_init
  if (completed === 0 && total > 0) {  // ❌ This condition NEVER triggers!
    // First document just started processing, initialize Stage 2
    const { error: rpcError } = await supabaseAdmin.rpc('update_course_progress', {
      p_course_id: courseId,
      p_step_id: 2,
      p_status: 'pending',
      p_message: 'Начало обработки документов',
    });
  } else if (completed < total) {  // ✅ This ALWAYS executes on first call!
    // Still processing documents
    const { error: rpcError } = await supabaseAdmin.rpc('update_course_progress', {
      p_course_id: courseId,
      p_step_id: 2,
      p_status: 'in_progress',  // Maps to stage_2_processing - INVALID from pending!
      p_message: `Обработка документов... (${completed}/${total})`,
    });
  }
}
```

**WHY THE CONDITION FAILS**:

The function is called AFTER vectorization completes:

```typescript
// document-processing.ts:200-204
// Step 9: Finalize (95% progress)
// Note: vector_status is already updated to 'indexed' with chunk_count by uploadChunksToQdrant()
await this.updateProgress(job, 95, 'Finalizing indexing');

// Update course progress (NEW)
const supabase = getSupabaseAdmin();
await this.updateDocumentProcessingProgress(jobData.courseId, supabase);
```

**Timeline**:
1. Document 1 starts processing
2. Document 1 vectorizes → `vector_status='indexed'`
3. ✅ **uploadChunksToQdrant() sets vector_status='indexed'**
4. ❌ **updateDocumentProcessingProgress() called** → `completed=1` (NOT 0!)
5. Falls into `else if (completed < total)` → tries `pending → stage_2_processing`
6. FSM rejects: "Invalid transition: pending → stage_2_processing"

**Finding 4: generation.initiate Does NOT Initialize Stage 2** ❌

```typescript
// generation.ts:392-424
// T017: Update progress with retry
try {
  const progressMessage = hasFiles
    ? `Инициализация завершена. Обработка ${uploadedFiles?.length || 0} файлов`
    : 'Инициализация завершена';

  logger.debug({ requestId, courseId, jobId, jobIds }, 'Calling update_course_progress RPC');
  await retryWithBackoff(
    async () => {
      const { error, data } = await (supabase as any).rpc('update_course_progress', {
        p_course_id: courseId,
        p_step_id: 1,  // ❌ WRONG! Step 1 removed in FSM redesign
        p_status: 'completed',
        p_message: progressMessage,
        // ... metadata
      });
```

**Problem**: The endpoint calls `p_step_id: 1`, but Step 1 was REMOVED in the FSM redesign (migration 20251117150000_update_rpc_for_new_fsm.sql validates `step_id` must be 2-6).

**Finding 5: FSM Validation Enforces Strict Transitions** ✅

```sql
-- migration 20251117103031:163-181
v_valid_transitions := '{
  "pending": ["stage_2_init", "cancelled"],  -- ONLY these 2 transitions allowed!
  "stage_2_init": ["stage_2_processing", "failed", "cancelled"],
  "stage_2_processing": ["stage_2_complete", "failed", "cancelled"],
  "stage_2_complete": ["stage_3_init", "failed", "cancelled"],
  ...
}'::JSONB;
```

**From `pending` state, ONLY valid transitions are**:
- `pending → stage_2_init` ✅
- `pending → cancelled` ✅

**All other transitions REJECTED**:
- `pending → stage_2_processing` ❌
- `pending → stage_2_complete` ❌
- `pending → stage_3_init` ❌

---

### Phase 2: Execution Flow Tracing

**Complete Execution Flow (Current - BROKEN)**:

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. generation.initiate tRPC Endpoint                            │
│    - Create course with generation_status='pending'             │
│    - Create 4 document processing jobs (parallel)               │
│    - Call RPC with p_step_id=1 (FAILS - step 1 removed!)       │
│    - Status remains: pending                                    │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Document Processing Handler (Job 1-4 in parallel)           │
│    - Read file, process with Docling                            │
│    - Chunk markdown                                             │
│    - Generate embeddings                                        │
│    - Upload to Qdrant → vector_status='indexed' ✅             │
│    - Call updateDocumentProcessingProgress()                    │
│      - Query: completed=1, total=4                              │
│      - Falls into: else if (completed < total)                  │
│      - Calls RPC: p_step_id=2, p_status='in_progress'          │
│      - RPC maps: step=2 + in_progress → stage_2_processing     │
│      - FSM rejects: pending → stage_2_processing ❌            │
│    - Status remains: pending (RPC failed)                       │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Stage 3 Summarization Handler (triggered after vectorization)│
│    - Generate summary for each document                         │
│    - Call updateCourseProgress()                                │
│      - Calls RPC: p_step_id=3, p_status='in_progress'          │
│      - RPC maps: step=3 + in_progress → stage_3_summarizing    │
│      - FSM rejects: pending → stage_3_summarizing ❌           │
│    - Status remains: pending (RPC failed)                       │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Stage 4 Analysis Handler (NEVER RUNS - barrier blocks)      │
│    - Would set status: stage_4_init                             │
│    - Never reached because Stage 3 never completes              │
└─────────────────────────────────────────────────────────────────┘
```

**Evidence from Test Logs**:

```json
// First document completes vectorization
{"time":1763380154738, "msg":"Document processing pipeline complete", "vectorsIndexed":74}

// updateDocumentProcessingProgress() called - FIRST RPC failure
{"time":1763380155638, "error": {
  "code":"P0001",
  "hint":"Valid transitions from pending: [\"stage_2_init\", \"cancelled\"]",
  "message":"Invalid generation status transition: pending → stage_2_processing (course_id: 06ee700a-8b91-4924-aae1-00a85edbab01)"
}, "msg":"Failed to update course progress (non-fatal)"}

// All 4 documents complete vectorization (time: 173-174s)
{"time":1763380173048, "msg":"Document processing pipeline complete"}
{"time":1763380173316, "msg":"Document processing pipeline complete"}
{"time":1763380173324, "msg":"Document processing pipeline complete"}

// Subsequent RPC failures for stage_2_complete
{"time":1763380174120, "message":"Invalid generation status transition: pending → stage_2_complete"}

// Stage 3 summaries complete, but status still pending
{"time":1763380177578, "msg":"All summaries counted as complete - validating Stage 4 barrier"}

// Stage 3 RPC calls also fail
{"time":1763380178570, "message":"Invalid generation status transition: pending → stage_3_complete"}
```

**Timeline Proof**: The first RPC failure occurs AFTER vectorization completes (time: 154.738s → 155.638s), proving the function is called too late.

---

### Phase 3: Comparison with Working Stages

**Stage 3 Pattern** (WORKS):

```typescript
// stage3-summarization.ts:62-142
async function updateCourseProgress(
  courseId: string,
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>
): Promise<void> {
  // Count completed summaries
  const { count: completedCount } = await supabaseAdmin
    .from('file_catalog')
    .select('*', { count: 'exact', head: true })
    .eq('course_id', courseId)
    .not('processed_content', 'is', null);

  const completed = completedCount || 0;
  const total = totalCount || 0;

  if (completed < total) {
    // Still processing summaries
    const { error: rpcError } = await supabaseAdmin.rpc('update_course_progress', {
      p_course_id: courseId,
      p_step_id: 3,
      p_status: 'in_progress',  // Maps to stage_3_summarizing
      p_message: `Создание резюме... (${completed}/${total})`,
    });
  }
}
```

**Why Stage 3 would work** (if Stage 2 initialized properly):
- Assumes course is ALREADY in `stage_2_complete` or `stage_3_init`
- Transitions `stage_3_init → stage_3_summarizing` ✅ (valid)
- But Stage 2 never transitions from `pending`, so Stage 3 also fails!

**Stage 4 Pattern** (EXPLICIT INITIALIZATION):

```typescript
// stage4-analysis.ts:203-236
try {
  // STEP 0: Update Status to Stage 4 Init
  jobLogger.info('Setting course status to stage_4_init');

  const { error: statusInitError} = await supabaseAdmin
    .from('courses')
    .update({
      generation_status: 'stage_4_init' as const,  // Direct DB update!
      updated_at: new Date().toISOString(),
    })
    .eq('id', course_id)
    .eq('organization_id', organization_id);

  if (statusInitError) {
    throw new Error(`Failed to update status to stage_4_init: ${statusInitError.message}`);
  }

  // STEP 0.5: Update Status to Stage 4 Analyzing
  jobLogger.info('Setting course status to stage_4_analyzing');

  const { error: statusAnalyzeError } = await supabaseAdmin
    .from('courses')
    .update({
      generation_status: 'stage_4_analyzing' as const,
      updated_at: new Date().toISOString(),
    })
    .eq('id', course_id)
    .eq('organization_id', organization_id);
}
```

**Why Stage 4 works**:
- Uses **DIRECT DATABASE UPDATE** (not RPC)
- Updates `generation_status` column directly → **bypasses FSM validation trigger**
- Initializes state BEFORE executing stage logic

**CRITICAL INSIGHT**: Stage 4 bypasses the FSM trigger by directly updating the column! This is why it "works" but is architecturally inconsistent.

---

## Root Cause Analysis

### Primary Root Cause

**Missing FSM Initialization in Stage 2 Pipeline**

The Stage 2 document processing pipeline lacks the REQUIRED initial FSM transition `pending → stage_2_init` before document processing begins.

**Mechanism of Failure**:

1. **Course Creation**: `generation.initiate` creates course with `generation_status='pending'`
2. **No Initialization**: No code transitions `pending → stage_2_init` before jobs execute
3. **Jobs Execute**: Document processing jobs run in parallel
4. **Vectorization Completes**: First job completes → `vector_status='indexed'`
5. **Progress Function Called**: `updateDocumentProcessingProgress()` executes
6. **Condition Fails**: `if (completed === 0 && total > 0)` is FALSE (completed=1)
7. **Wrong Branch**: Falls into `else if (completed < total)`
8. **Invalid Transition**: Calls RPC with `p_status='in_progress'` → maps to `stage_2_processing`
9. **FSM Rejection**: Trigger validates: `pending → stage_2_processing` is INVALID
10. **Stuck Forever**: All subsequent transitions fail (status remains `pending`)

### Contributing Factors

1. **Removed Step 1**: FSM redesign removed Step 1 from RPC function (step_id 2-6 only)
   - `generation.initiate` still calls `p_step_id: 1` → fails validation
   - No initialization logic added to replace Step 1 functionality

2. **Async Job Execution**: Document processing jobs run in parallel
   - First job to complete triggers progress update
   - By the time function runs, `completed >= 1` (too late for initialization)

3. **Incorrect Condition**: `if (completed === 0 && total > 0)` cannot detect initialization
   - Called AFTER vectorization completes
   - `completed` is always >= 1 when function runs

4. **Inconsistent Patterns**: Stage 4 uses direct DB updates, Stage 3 uses RPC
   - No consistent initialization pattern across stages
   - Stage 2 follows neither pattern correctly

### Evidence Supporting Root Cause

1. **Test Log Evidence**: All RPC failures show "pending → stage_X_*" pattern
2. **FSM Validation**: Migration 20251117103031 line 164: `"pending": ["stage_2_init", "cancelled"]`
3. **Code Inspection**: No code path executes `pending → stage_2_init` transition
4. **Timeline Analysis**: First RPC failure occurs after first document completes (not before)

---

## Proposed Solutions

### Solution 1: Add Stage 2 Initialization in generation.initiate (RECOMMENDED)

**Description**: Add RPC call to transition `pending → stage_2_init` in the `generation.initiate` endpoint IMMEDIATELY AFTER creating document processing jobs.

**Implementation Steps**:

1. **Remove Step 1 RPC Call** (currently fails):
```typescript
// generation.ts:392-424 - REMOVE THIS BLOCK
await retryWithBackoff(
  async () => {
    const { error, data } = await (supabase as any).rpc('update_course_progress', {
      p_course_id: courseId,
      p_step_id: 1,  // FAILS - step 1 removed
      p_status: 'completed',
      // ...
    });
  }
);
```

2. **Add Stage 2 Initialization** (AFTER job creation):
```typescript
// generation.ts:340-368 - AFTER document processing jobs created
if (jobType === JobType.DOCUMENT_PROCESSING && uploadedFiles && uploadedFiles.length > 0) {
  // Create one job per file with complete metadata
  for (const file of uploadedFiles) {
    // ... existing job creation code ...
    const job = await addJob(jobType, jobData, { priority });
    jobIds.push(job.id as string);
  }

  // Use first job ID for backward compatibility
  jobId = jobIds[0];
  logger.info({ requestId, jobIds, fileCount: uploadedFiles.length }, 'All document processing jobs created');

  // ✅ NEW: Initialize Stage 2 BEFORE jobs execute
  try {
    await retryWithBackoff(
      async () => {
        const { error } = await (supabase as any).rpc('update_course_progress', {
          p_course_id: courseId,
          p_step_id: 2,
          p_status: 'pending',  // Maps to stage_2_init
          p_message: `Начало обработки ${uploadedFiles.length} документов`,
          p_metadata: {
            job_ids: jobIds,
            file_count: uploadedFiles.length,
            executor: 'orchestrator',
            tier,
            priority,
            request_id: requestId,
          },
        });

        if (error) {
          logger.error({ requestId, error }, 'RPC update_course_progress (stage_2_init) failed');
          throw error;
        }
        logger.info({ requestId, courseId }, 'Stage 2 initialized: pending → stage_2_init');
      },
      { maxRetries: 3, delays: [100, 200, 400] }
    );
  } catch (progressError) {
    // Rollback: Remove all created jobs and release concurrency
    // ... existing rollback logic ...
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Не удалось инициализировать обработку документов. Попробуйте позже.',
    });
  }
}
```

3. **Update updateDocumentProcessingProgress()** (remove broken initialization logic):
```typescript
// document-processing.ts:645-758
private async updateDocumentProcessingProgress(
  courseId: string,
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>
): Promise<void> {
  // Count completed documents (vector_status='indexed')
  const { count: completedCount } = await supabaseAdmin
    .from('file_catalog')
    .select('*', { count: 'exact', head: true })
    .eq('course_id', courseId)
    .eq('vector_status', 'indexed');

  const { count: totalCount } = await supabaseAdmin
    .from('file_catalog')
    .select('*', { count: 'exact', head: true })
    .eq('course_id', courseId);

  const completed = completedCount || 0;
  const total = totalCount || 0;

  // ❌ REMOVE broken initialization logic:
  // if (completed === 0 && total > 0) { ... }

  // ✅ SIMPLIFIED: Only 2 states now (in_progress or completed)
  if (completed < total) {
    // Still processing documents
    const { error: rpcError } = await supabaseAdmin.rpc('update_course_progress', {
      p_course_id: courseId,
      p_step_id: 2,
      p_status: 'in_progress',  // Now valid: stage_2_init → stage_2_processing
      p_message: `Обработка документов... (${completed}/${total})`,
    });

    if (rpcError) {
      logger.error({ courseId, error: rpcError }, 'Failed to update course progress (non-fatal)');
    } else {
      logger.info({ courseId, completedCount: completed, totalCount: total }, 'Course progress updated: stage_2_processing');
    }
  } else {
    // All documents complete
    const { error: rpcError } = await supabaseAdmin.rpc('update_course_progress', {
      p_course_id: courseId,
      p_step_id: 2,
      p_status: 'completed',  // stage_2_processing → stage_2_complete
      p_message: 'Документы обработаны',
    });

    if (rpcError) {
      logger.error({ courseId, error: rpcError }, 'Failed to update course progress to stage_2_complete (non-fatal)');
    } else {
      logger.info({ courseId, totalCount: total }, 'All documents complete for course');
    }
  }
}
```

**Pros**:
- ✅ Fixes root cause (adds missing initialization)
- ✅ Consistent with Stage 3 pattern (RPC-based)
- ✅ Proper error handling (rollback on failure)
- ✅ Maintains FSM integrity (all transitions valid)
- ✅ Single source of truth (initialization in one place)

**Cons**:
- ⚠️ Adds RPC call to critical path (generation.initiate)
- ⚠️ Requires retry logic duplication

**Complexity**: Medium
**Risk**: Low
**Estimated Effort**: 2-3 hours

---

### Solution 2: Use Direct DB Update Like Stage 4 (ALTERNATIVE)

**Description**: Bypass FSM validation by directly updating `generation_status` column in the database, similar to Stage 4 handler.

**Implementation**:

1. **In generation.initiate** (AFTER job creation):
```typescript
// Direct DB update (bypasses FSM trigger)
const { error: statusError } = await supabase
  .from('courses')
  .update({
    generation_status: 'stage_2_init' as const,
    updated_at: new Date().toISOString(),
  })
  .eq('id', courseId);

if (statusError) {
  // Rollback jobs...
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Failed to initialize Stage 2',
  });
}
```

2. **Keep updateDocumentProcessingProgress() unchanged** (uses RPC for progress/complete)

**Pros**:
- ✅ Simplest implementation (1 DB query)
- ✅ No RPC dependency for initialization
- ✅ Consistent with Stage 4 pattern

**Cons**:
- ❌ **Bypasses FSM validation** (architectural violation)
- ❌ No audit trail (FSM trigger not fired)
- ❌ Inconsistent with Stage 3 pattern
- ❌ Violates FSM design principles

**Complexity**: Low
**Risk**: Medium (bypasses FSM)
**Estimated Effort**: 1 hour

**Recommendation**: ❌ NOT RECOMMENDED - Bypassing FSM validation defeats the purpose of having a state machine.

---

### Solution 3: Initialize in First Document Processing Job (NOT RECOMMENDED)

**Description**: Add initialization logic to the document processing handler's `execute()` method using a distributed lock.

**Implementation**:

1. **Add Redis lock check** in document-processing.ts:
```typescript
async execute(jobData: DocumentProcessingJobData, job: Job): Promise<JobResult> {
  const { courseId, fileId, filePath } = jobData;

  // Attempt to acquire initialization lock (Redis)
  const lockKey = `stage2:init:${courseId}`;
  const lockAcquired = await redisClient.set(lockKey, 'locked', {
    NX: true,  // Only set if not exists
    EX: 60,    // Expire after 60s
  });

  if (lockAcquired) {
    // This job won the race - initialize Stage 2
    await supabaseAdmin.rpc('update_course_progress', {
      p_course_id: courseId,
      p_step_id: 2,
      p_status: 'pending',  // pending → stage_2_init
      p_message: 'Начало обработки документов',
    });
  }

  // Continue with normal processing...
}
```

**Pros**:
- ✅ Initialization happens before first document processes

**Cons**:
- ❌ Requires Redis dependency (new infrastructure)
- ❌ Complex distributed locking logic
- ❌ Race conditions possible (4 jobs compete)
- ❌ Single point of failure (Redis outage blocks pipeline)
- ❌ Lock expiration edge cases (60s may not be enough)
- ❌ Inconsistent with Stage 3/4 patterns

**Complexity**: High
**Risk**: High (distributed systems complexity)
**Estimated Effort**: 8-10 hours

**Recommendation**: ❌ NOT RECOMMENDED - Overengineered solution with unnecessary infrastructure dependencies.

---

## Implementation Guidance

### Recommended Implementation: Solution 1

**Priority**: 🔴 CRITICAL
**Target**: Fix in current sprint (blocking all document-based generation)

**Files to Modify**:

1. **`src/server/routers/generation.ts`** (lines 340-424):
   - Remove Step 1 RPC call (lines 392-424)
   - Add Stage 2 initialization RPC call after job creation (line 368)
   - Add rollback logic for initialization failure

2. **`src/orchestrator/handlers/document-processing.ts`** (lines 645-758):
   - Remove broken initialization condition (`if (completed === 0 && total > 0)`)
   - Simplify to 2-state logic (in_progress, completed)

**Validation Criteria**:

1. **Unit Test**: Course transitions `pending → stage_2_init` after job creation
2. **Integration Test**: 4-document scenario completes full pipeline:
   - `pending → stage_2_init → stage_2_processing → stage_2_complete`
   - `stage_2_complete → stage_3_init → stage_3_summarizing → stage_3_complete`
   - `stage_3_complete → stage_4_init → stage_4_analyzing → stage_4_complete`

3. **Error Test**: Initialization failure rolls back jobs and releases concurrency

**Testing Strategy**:

```bash
# Run existing T053 test (should pass after fix)
npm run test:integration -- -t "T053"

# Verify FSM transitions in logs
grep "generation_status" /tmp/test.log | grep -E "(pending|stage_2_init|stage_2_processing)"

# Check for RPC errors (should be 0)
grep "Invalid generation status transition" /tmp/test.log | wc -l
# Expected: 0
```

**Rollback Considerations**:

- **Risk**: Low (changes isolated to Stage 2 initialization)
- **Rollback**: Revert 2 files (generation.ts, document-processing.ts)
- **Data Impact**: None (only affects new courses, existing courses unaffected)

**Performance Impact**:

- **Additional RPC Call**: +1 RPC call per course generation (negligible)
- **Latency**: +10-50ms for RPC roundtrip (within acceptable range)
- **Concurrency**: No change (jobs still execute in parallel)

---

## Risks and Considerations

### Implementation Risks

1. **RPC Failure in Critical Path** (MEDIUM):
   - Adding RPC call to `generation.initiate` creates new failure point
   - **Mitigation**: Implement robust retry logic (3 attempts, exponential backoff)
   - **Rollback**: Remove all created jobs and release concurrency slot

2. **Race Condition in Parallel Jobs** (LOW):
   - Multiple jobs may call `updateDocumentProcessingProgress()` simultaneously
   - **Mitigation**: PostgreSQL transaction isolation handles concurrent RPC calls
   - **Evidence**: Stage 3 uses same pattern without issues

3. **Step 1 Removal Breaking Change** (LOW):
   - Old code may reference Step 1 in other places
   - **Mitigation**: Grep codebase for `p_step_id: 1` references before deployment

### Performance Impact

- **Initialization**: +1 RPC call per course (~10-50ms latency)
- **Progress Updates**: No change (same RPC calls as before)
- **Database Load**: Negligible (1 additional RPC call per course)

### Breaking Changes

- **None**: Changes are backward compatible
- **API**: No API changes (internal RPC logic only)
- **Database**: No schema changes (uses existing RPC function)

---

## Documentation References

### Tier 0: Project Internal (Primary Evidence)

**Code Files**:
- `src/server/routers/generation.ts:392-424` - Step 1 RPC call (broken)
- `src/orchestrator/handlers/document-processing.ts:645-758` - updateDocumentProcessingProgress() (broken initialization)
- `src/orchestrator/handlers/stage3-summarization.ts:62-142` - Working RPC pattern
- `src/orchestrator/handlers/stage4-analysis.ts:203-236` - Direct DB update pattern

**Migrations**:
- `20251117103031_redesign_generation_status.sql:163-181` - FSM valid transitions
- `20251117150000_update_rpc_for_new_fsm.sql:48-200` - RPC function mapping logic

**Test Evidence**:
- `/tmp/t053-final-fix-test.log:301` - First RPC failure: "pending → stage_2_processing"
- `/tmp/t053-final-fix-test.log:415` - Second RPC failure: "pending → stage_2_complete"
- `/tmp/t053-final-fix-test.log:463` - Stage 3 failure: "pending → stage_3_complete"

**Git History**:
- Commit `8af7c1d`: "fix(stage5): remove hardcoded JSON examples" (recent FSM work)
- Commit `f96c64e`: "refactor: FSM redesign + quality validator fix" (FSM redesign commit)

### Tier 1: Context7 MCP (Not Applicable)

No external library/framework issues detected. This is a project-specific FSM implementation bug.

### Tier 2/3: Official Docs (Not Applicable)

No external documentation needed. Root cause identified from internal code analysis.

---

## MCP Server Usage

**Tools Used**:

1. **Project Internal Search** (Tier 0):
   - Read tool: 5 TypeScript files + 2 SQL migrations
   - Grep tool: Log file pattern matching (FSM errors)
   - Git log: Recent commit history review

2. **Sequential Thinking MCP**: Not used (straightforward investigation)

3. **Supabase MCP**: Not used (migrations already on disk)

**Research Results**:
- **Tier 0 (Project Internal)**: ✅ Root cause identified from code inspection
- **Tier 1 (Context7)**: N/A (no external dependencies involved)
- **Tier 2/3 (Web)**: N/A (project-specific bug)

---

## Next Steps

### For Orchestrator/User

1. **Review Investigation Report**: Validate findings and proposed solution
2. **Select Solution Approach**: Approve Solution 1 (RPC-based initialization)
3. **Assign Implementation**: Delegate to TypeScript/Backend worker agent
4. **Schedule Testing**: Plan integration test execution after fix

### For Implementation Agent

**Task Specification**:

```
Task: Fix FSM Stage 2 Initialization Missing

Investigation Report: docs/investigations/INV-2025-11-17-015-fsm-stage2-initialization-missing.md
Selected Solution: Solution 1 (RPC-based initialization in generation.initiate)

Files to Modify:
1. src/server/routers/generation.ts
   - Remove Step 1 RPC call (lines 392-424)
   - Add Stage 2 initialization RPC call after job creation
   - Add rollback logic for initialization failure

2. src/orchestrator/handlers/document-processing.ts
   - Remove broken initialization condition (lines 690-710)
   - Simplify to 2-state logic (in_progress, completed)

Validation:
- Run npm run test:integration -- -t "T053"
- Verify no "Invalid generation status transition" errors in logs
- Confirm FSM progression: pending → stage_2_init → stage_2_processing → stage_2_complete

Priority: CRITICAL
Estimated Effort: 2-3 hours
```

### Follow-Up Recommendations

1. **Architecture Cleanup**:
   - Standardize initialization pattern across ALL stages
   - Either: All stages use RPC (like Stage 3) OR all use direct DB updates (like Stage 4)
   - Current mixed approach causes confusion

2. **Add E2E FSM Test**:
   - Test file: `tests/integration/fsm-transitions.test.ts`
   - Verify EVERY FSM transition in the pipeline
   - Catch regressions early

3. **Documentation Update**:
   - Add FSM initialization requirements to stage handler documentation
   - Document "MUST call RPC with p_status='pending' before job execution"

---

## Investigation Log

**Timeline**:

1. **Phase 1 (10 min)**: Read core implementation files
   - generation.ts, document-processing.ts, stage3-summarization.ts, stage4-analysis.ts
   - FSM migrations (20251117103031, 20251117150000)

2. **Phase 2 (15 min)**: Trace execution flow
   - Analyzed test logs for FSM error patterns
   - Traced document processing pipeline from creation → completion
   - Identified timing issue (progress called after vectorization)

3. **Phase 3 (10 min)**: Compare with working stages
   - Stage 3: RPC-based progress updates ✅
   - Stage 4: Direct DB updates (bypasses FSM) ⚠️
   - Stage 2: Broken initialization logic ❌

4. **Phase 4 (15 min)**: Analyze root cause
   - Identified missing `pending → stage_2_init` transition
   - Traced condition failure: `completed === 0` never true
   - Verified FSM constraint: "pending" allows only ["stage_2_init", "cancelled"]

5. **Phase 5 (30 min)**: Design solution and document findings
   - Proposed 3 solutions (RPC-based, direct DB, distributed lock)
   - Recommended Solution 1 (RPC-based initialization)
   - Created comprehensive investigation report

**Total Duration**: 80 minutes

**Commands Run**:
```bash
# Read core files
Read generation.ts, document-processing.ts, stage3-summarization.ts, stage4-analysis.ts
Read 20251117103031_redesign_generation_status.sql
Read 20251117150000_update_rpc_for_new_fsm.sql

# Analyze test logs
Grep "Invalid generation status transition" /tmp/t053-final-fix-test.log
Grep "Document processing pipeline complete" /tmp/t053-final-fix-test.log
Grep "completedCount|totalCount" /tmp/t053-final-fix-test.log
```

**MCP Calls**: 0 (no external documentation needed)

---

## Status

✅ **Investigation Complete**

**Root Cause**: Identified
**Solution**: Designed
**Implementation Plan**: Ready
**Next Agent**: TypeScript/Backend Worker (for implementation)

**Returning control to main session.**

---

**Investigation Report Generated**
**Report**: `docs/investigations/INV-2025-11-17-015-fsm-stage2-initialization-missing.md`
**Date**: 2025-11-17
