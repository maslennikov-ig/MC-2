# TASK: Fix Stage 2 Handler Course Status Update

**Task ID**: TASK-2025-11-17-FIX-STAGE2-STATUS-UPDATE
**Date**: 2025-11-17
**Priority**: Critical (blocks Stage 3 and Stage 4 transitions)
**Status**: PENDING
**Assignee**: TBD
**Related Investigation**: INV-2025-11-17-014-fsm-migration-blocking-t053.md

---

## Executive Summary

**Problem**: The Stage 2 document processing handler (`document-processing.ts`) does NOT call `update_course_progress` RPC, causing courses to remain stuck in 'pending' status after Stage 2 completes. This blocks FSM transitions to Stage 3 and Stage 4.

**Root Cause**: Missing RPC call in Stage 2 handler's job completion logic. Stage 3 handler already has this pattern implemented (lines 160-165 in `stage3-summarization.ts`).

**Solution**: Add course progress tracking to Stage 2 handler, similar to Stage 3's pattern. Update RPC calls after all document processing jobs complete for a course.

**Impact**: Unblocks T053 E2E test and production course generation pipeline.

---

## Background

### FSM Migration Context

Migration `20251117150000_update_rpc_for_new_fsm.sql` fixed RPC function mappings for NEW FSM enum values:
- Step 2 (Document Processing):
  - `pending` → `stage_2_init`
  - `in_progress` → `stage_2_processing`
  - `completed` → `stage_2_complete`
- Step 3 (Summarization):
  - `pending` → `stage_3_init`
  - `in_progress` → `stage_3_summarizing`
  - `completed` → `stage_3_complete`

### Previous Solution (INV-2025-11-03-001)

Investigation `INV-2025-11-03-001-document-processing-stuck.md` identified missing job chaining between Stage 2 and Stage 3. Solution implemented:
- Added `STAGE_3_SUMMARIZATION` job creation in `document-processing.ts` (lines 202-263)
- This fixed **job orchestration** but not **course status updates**

### Current Problem (NEW)

E2E test `T053-synergy-sales-course.test.ts` fails with:
```
Invalid generation status transition: pending → stage_3_complete
```

**Evidence**:
1. Stage 2 completes successfully (all documents vectorized)
2. Stage 3 completes successfully (all summaries generated)
3. Course `generation_status` remains 'pending' (never updated by Stage 2)
4. Stage 3 tries to transition `pending → stage_3_complete` (INVALID per FSM trigger)

**Search Results**:
```bash
grep -r "update_course_progress.*step.*2" packages/course-gen-platform/src/
# NO MATCHES FOUND
```

Stage 3 handler DOES call RPC (lines 160-165 in `stage3-summarization.ts`):
```typescript
const { error: rpcError } = await supabaseAdmin.rpc('update_course_progress', {
  p_course_id: courseId,
  p_step_id: 3,
  p_status: 'completed',
  p_message: 'Резюме создано',
});
```

Stage 2 handler does NOT call RPC anywhere.

---

## Requirements

### Functional Requirements

**FR1**: Stage 2 handler MUST call `update_course_progress` RPC when all document processing jobs complete for a course

**FR2**: RPC calls MUST use correct parameters:
- `p_course_id`: Course UUID
- `p_step_id`: 2 (Document Processing)
- `p_status`: 'in_progress' | 'completed'
- `p_message`: Russian-language progress message

**FR3**: Status transitions MUST follow FSM rules:
- Start of first job: `pending → stage_2_processing`
- Completion of all jobs: `stage_2_processing → stage_2_complete`

**FR4**: Progress messages MUST be in Russian (matching existing Stage 3 pattern):
- In-progress: `"Обработка документов... (N/total)"`
- Completed: `"Документы обработаны"`

### Non-Functional Requirements

**NFR1**: Implementation MUST follow existing Stage 3 pattern (`updateCourseProgress` function in `stage3-summarization.ts:62-207`)

**NFR2**: RPC errors MUST NOT fail document processing jobs (non-fatal logging)

**NFR3**: Count queries MUST be efficient (use `count: 'exact', head: true`)

**NFR4**: Changes MUST NOT break existing Stage 2 functionality (document processing, vectorization, summarization job creation)

---

## Implementation Guidance

### Files to Modify

**1. `/home/me/code/megacampus2-worktrees/generation-json/packages/course-gen-platform/src/orchestrator/handlers/document-processing.ts`**

**Change Type**: Add course progress tracking function and RPC calls

**Line Range**: After line 321 (end of execute method)

**Changes**:

1. **Add `updateCourseProgress` helper function** (similar to Stage 3):
   ```typescript
   /**
    * Update course progress based on completed document processing jobs
    *
    * Counts completed documents (vector_status='indexed') and updates progress RPC.
    * When all documents are complete, transitions to stage_2_complete status.
    *
    * @param courseId - Course UUID
    * @param supabaseAdmin - Supabase admin client
    */
   private async updateCourseProgress(
     courseId: string,
     supabaseAdmin: ReturnType<typeof getSupabaseAdmin>
   ): Promise<void> {
     try {
       // Count completed documents (vector_status='indexed')
       const { count: completedCount, error: completedError } = await supabaseAdmin
         .from('file_catalog')
         .select('*', { count: 'exact', head: true })
         .eq('course_id', courseId)
         .eq('vector_status', 'indexed');

       if (completedError) {
         logger.error(
           { courseId, error: completedError },
           'Failed to count completed documents (non-fatal)'
         );
         return;
       }

       // Count total documents
       const { count: totalCount, error: totalError } = await supabaseAdmin
         .from('file_catalog')
         .select('*', { count: 'exact', head: true })
         .eq('course_id', courseId);

       if (totalError) {
         logger.error(
           { courseId, error: totalError },
           'Failed to count total documents (non-fatal)'
         );
         return;
       }

       const completed = completedCount || 0;
       const total = totalCount || 0;

       logger.debug(
         { courseId, completedCount: completed, totalCount: total },
         'Course progress calculated'
       );

       // Update progress RPC (existing from Stage 1)
       // Stage 2 = Document Processing (step 2 in course progress)
       if (completed < total) {
         // Still processing documents
         const { error: rpcError } = await supabaseAdmin.rpc('update_course_progress', {
           p_course_id: courseId,
           p_step_id: 2,
           p_status: 'in_progress',
           p_message: `Обработка документов... (${completed}/${total})`,
         });

         if (rpcError) {
           logger.error(
             { courseId, error: rpcError },
             'Failed to update course progress (non-fatal)'
           );
         } else {
           logger.info(
             { courseId, completedCount: completed, totalCount: total },
             'Course progress updated: stage_2_processing'
           );
         }
       } else {
         // All documents complete
         const { error: rpcError } = await supabaseAdmin.rpc('update_course_progress', {
           p_course_id: courseId,
           p_step_id: 2,
           p_status: 'completed',
           p_message: 'Документы обработаны',
         });

         if (rpcError) {
           logger.error(
             { courseId, error: rpcError },
             'Failed to update course progress to stage_2_complete (non-fatal)'
           );
         } else {
           logger.info(
             { courseId, totalCount: total },
             'All documents complete for course'
           );
         }
       }
     } catch (err) {
       logger.error(
         { courseId, error: err },
         'Exception while updating course progress (non-fatal)'
       );
     }
   }
   ```

2. **Call `updateCourseProgress` after vectorization completes** (around line 198):
   ```typescript
   // Step 9: Finalize (95% progress)
   // Note: vector_status is already updated to 'indexed' with chunk_count by uploadChunksToQdrant()
   await this.updateProgress(job, 95, 'Finalizing indexing');

   this.log(job, 'info', 'Document processing pipeline complete', {
     fileId,
     vectorsIndexed: uploadResult.points_uploaded,
     status: 'indexed',
   });

   this.log(job, 'info', 'Vector status updated to indexed', { fileId });

   // Update course progress (NEW)
   const supabase = getSupabaseAdmin();
   await this.updateCourseProgress(jobData.courseId, supabase);

   // Step 10: Create Stage 3 Summarization job (96% progress)
   // ... existing code ...
   ```

### Validation Criteria

**Pre-Implementation Checks**:
- ✅ Read existing Stage 3 implementation (`stage3-summarization.ts:62-207`)
- ✅ Understand RPC function signature (`update_course_progress`)
- ✅ Review FSM transition rules (migration `20251117103031_redesign_generation_status.sql`)

**Post-Implementation Validation**:
- ✅ Course status transitions: `pending → stage_2_processing → stage_2_complete`
- ✅ Stage 3 handler successfully transitions: `stage_2_complete → stage_3_summarizing → stage_3_complete`
- ✅ Stage 4 handler successfully transitions: `stage_3_complete → stage_4_analyzing → stage_4_complete`
- ✅ T053 E2E test passes without FSM validation errors
- ✅ RPC errors logged but don't fail document processing jobs
- ✅ Existing functionality unchanged (document processing, vectorization, summarization job creation)

**Testing Strategy**:

1. **Unit Test** (create new test):
   ```typescript
   describe('DocumentProcessingHandler - Course Progress', () => {
     it('should update course progress after all documents complete', async () => {
       // Mock: 3 documents, all indexed
       // Verify: RPC called with step_id=2, status='completed'
     });

     it('should update in-progress status when documents incomplete', async () => {
       // Mock: 3 documents, 1 indexed, 2 pending
       // Verify: RPC called with step_id=2, status='in_progress', message='Обработка документов... (1/3)'
     });

     it('should not fail job if RPC call fails', async () => {
       // Mock: RPC error
       // Verify: Job completes successfully, error logged
     });
   });
   ```

2. **Integration Test** (existing T053 should pass):
   ```bash
   cd packages/course-gen-platform
   pnpm vitest run tests/e2e/t053-synergy-sales-course.test.ts
   ```

3. **Manual Verification**:
   ```sql
   -- After test completes, check generation_status_history
   SELECT old_status, new_status, changed_at, trigger_source
   FROM generation_status_history
   WHERE course_id = '{test-course-id}'
   ORDER BY changed_at ASC;

   -- Expected transitions:
   -- NULL → pending (initial)
   -- pending → stage_2_processing (first document starts)
   -- stage_2_processing → stage_2_complete (all documents done)
   -- stage_2_complete → stage_3_summarizing (summarization starts)
   -- stage_3_summarizing → stage_3_complete (all summaries done)
   -- stage_3_complete → stage_4_analyzing (analysis starts)
   ```

---

## Risks and Mitigations

**Risk 1**: RPC call failure causes document processing to fail
- **Mitigation**: Wrap RPC calls in try-catch, log errors, but don't throw (non-fatal)
- **Rationale**: Vectorization already succeeded; progress tracking is best-effort

**Risk 2**: Race condition when multiple document jobs complete simultaneously
- **Mitigation**: RPC function uses PostgreSQL transactions (atomic updates)
- **Validation**: FSM trigger validates all transitions (prevents invalid states)

**Risk 3**: Count queries may be inefficient for large courses
- **Mitigation**: Use `count: 'exact', head: true` (query planning optimization)
- **Future**: Add index on `(course_id, vector_status)` if performance degrades

---

## Related Documents

### Investigations
- `docs/investigations/INV-2025-11-17-014-fsm-migration-blocking-t053.md` - Current issue
- `docs/investigations/INV-2025-11-03-001-document-processing-stuck.md` - Previous job chaining solution

### Migrations
- `packages/course-gen-platform/supabase/migrations/20251117103031_redesign_generation_status.sql` - FSM redesign
- `packages/course-gen-platform/supabase/migrations/20251117150000_update_rpc_for_new_fsm.sql` - RPC function update

### Handlers
- `packages/course-gen-platform/src/orchestrator/handlers/document-processing.ts` - **Target file**
- `packages/course-gen-platform/src/orchestrator/handlers/stage3-summarization.ts` - **Reference implementation** (lines 62-207)

### Tests
- `packages/course-gen-platform/tests/e2e/t053-synergy-sales-course.test.ts` - E2E validation

---

## Implementation Steps

1. **Read reference implementation**:
   - Study `stage3-summarization.ts:62-207` (`updateCourseProgress` function)
   - Note RPC parameters, error handling, logging

2. **Add `updateCourseProgress` method**:
   - Copy pattern from Stage 3
   - Adapt for Stage 2 (count `vector_status='indexed'` instead of `processed_content !== null`)
   - Use Russian messages: "Обработка документов... (N/total)" / "Документы обработаны"

3. **Call `updateCourseProgress`**:
   - Insert call after line 200 (after vectorization completes)
   - Before Stage 3 summarization job creation (line 202)

4. **Test implementation**:
   - Run T053 E2E test
   - Verify FSM transitions in database
   - Check logs for RPC calls

5. **Update documentation** (if needed):
   - Mark task as COMPLETE
   - Update `DATABASE-SCHEMA.md` if RPC contract changed (unlikely)

---

## Success Criteria

- ✅ Course `generation_status` transitions: `pending → stage_2_processing → stage_2_complete`
- ✅ T053 E2E test passes without FSM validation errors
- ✅ Stage 3 and Stage 4 transitions work correctly
- ✅ No breaking changes to existing Stage 2 functionality
- ✅ All validation criteria met

---

## Task Status

- **Created**: 2025-11-17
- **Status**: PENDING
- **Assigned To**: TBD (await orchestrator delegation)
- **Estimated Effort**: 30-45 minutes
- **Priority**: Critical (blocks production pipeline)

---

**END OF TASK DOCUMENT**
