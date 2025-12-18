---
investigation_id: INV-2025-12-02-001
status: completed
timestamp: 2025-12-02
investigator: investigation-agent
related_files:
  - packages/web/components/generation-graph/hooks/useGraphData.ts
  - packages/web/components/generation-graph/panels/NodeDetailsModal/index.tsx
  - packages/web/components/generation-graph/nodes/DocumentNode.tsx
  - packages/web/components/generation-graph/panels/AdminPanel.tsx
tags:
  - bug
  - graph-view
  - document-processing
  - state-management
  - react
---

# Investigation Report: Document Stages Display Bug

## Executive Summary

### Problem
The graph view displays "Этап 0 из 1" (Stage 0 of 1) for all document nodes instead of showing actual processing progress (e.g., "Этап 3 из 7"). Additionally, the NodeDetailsModal shows no stages when a document node is double-clicked, despite database traces containing all 7 processing steps.

### Root Cause
**State Mutation Bug in `useGraphData.ts`**: The `setDocumentSteps` callback creates a shallow copy of the Map but mutates the shared `DocumentWithSteps` objects from the previous state. React's change detection fails because the Map values are the same object references, causing the graph rebuild effect to use stale data with incomplete step arrays.

### Recommended Solution
Implement proper immutable state updates by creating new `DocumentWithSteps` objects with new `steps` arrays instead of mutating shared references from previous state.

### Impact
- **Severity**: High - Blocks users from monitoring document processing progress
- **Affected Component**: Graph View, NodeDetailsModal
- **User Experience**: Users cannot see real-time document processing stages
- **Data Integrity**: Database has correct data, only frontend display is broken

---

## Problem Statement

### Observed Behavior

**Problem 1: Graph View - "0 из 1" for document stages**
- When 4 documents are uploaded, 4 document nodes ARE created correctly
- Each document shows "Этап 0 из 1" (Stage 0 of 1) instead of real progress
- Expected: Should show "Этап X из 7" based on actual processing progress
- Double-clicking a document node opens NodeDetailsModal but shows NO stages/steps inside
- The modal accordion should display all 7 document processing steps

**Problem 2: Admin Panel Filter Issue**
- Admin monitor shows "All stages" filter but primarily displays stage_2 traces
- Stage filter changes don't consistently update the displayed traces
- This is a secondary issue related to filtering logic

### Expected Behavior

**Document Nodes Should Display**:
- Accurate stage progress: "Этап 3 из 7" if 3 of 7 stages completed
- Each document should show its current processing stage
- Double-clicking should reveal all processing steps in the modal

**Modal Should Show**:
- All 7 document processing stages:
  1. start
  2. docling_conversion
  3. hierarchical_chunking
  4. generate_embeddings
  5. qdrant_upload
  6. generate_summary
  7. finish

### Environment

- **Component**: Graph View, NodeDetailsModal
- **Related Files**:
  - `packages/web/components/generation-graph/hooks/useGraphData.ts`
  - `packages/web/components/generation-graph/panels/NodeDetailsModal/index.tsx`
  - `packages/web/components/generation-graph/nodes/DocumentNode.tsx`
- **Backend**: Stage 2 orchestrator correctly creates 7 traces per document
- **Database**: Verified via SQL query that traces contain correct `fileId` and `step_name` values

---

## Investigation Process

### Hypotheses Tested

1. ✅ **Database Missing Data**: REJECTED - SQL queries confirmed all 7 traces exist with correct `fileId` values
2. ✅ **Frontend Not Fetching Traces**: REJECTED - `useGenerationRealtime` correctly fetches all traces
3. ✅ **`extractDocumentId` Not Finding fileId**: REJECTED - Function correctly checks multiple field name variants including `fileId`
4. ✅ **Recent Fix Didn't Apply**: REJECTED - The fix to move Stage 2 processing outside `setParallelItems` was correctly applied
5. ✅ **State Mutation Bug**: **CONFIRMED** - Root cause identified in `setDocumentSteps` callback

### Files Examined

**Primary Investigation Files**:
1. `/packages/web/components/generation-graph/hooks/useGraphData.ts` (1103 lines)
   - Lines 419-664: `processTraces` function
   - Lines 444-527: Stage 2 trace processing logic
   - Lines 667-1055: Graph rebuild effect
   - Lines 715-808: Document node creation

2. `/packages/web/components/generation-graph/panels/NodeDetailsModal/index.tsx` (792 lines)
   - Lines 447-632: Document stages accordion rendering
   - Lines 451-452: Checks for `docNode.data.stages` array

3. `/packages/web/components/generation-graph/nodes/DocumentNode.tsx` (220 lines)
   - Lines 186-204: Stage progress display logic
   - Displays `{data.completedStages}/{data.totalStages} этапов`

4. `/packages/course-gen-platform/src/stages/stage2-document-processing/orchestrator.ts`
   - Confirmed 7 `logTrace` calls with consistent `fileId` in `inputData`

5. `/packages/web/components/generation-graph/panels/AdminPanel.tsx` (90 lines)
   - Lines 21-26: Filter logic for stage and status

### Commands Executed

```bash
# Find admin panel location
find packages/web -name "*admin*panel*" -type f

# Check orchestrator trace logging
grep -A 5 "logTrace" packages/course-gen-platform/src/stages/stage2-document-processing/orchestrator.ts

# Verify shared types for DocumentStageData
cat packages/shared-types/src/generation-graph.ts | grep -A 20 "DocumentStageData"
```

---

## Root Cause Analysis

### Primary Cause: State Mutation in `setDocumentSteps`

**Location**: `packages/web/components/generation-graph/hooks/useGraphData.ts`, lines 447-526

**The Bug**:

```typescript
setDocumentSteps(prevDocs => {
    const nextDocs = new Map(prevDocs);  // ← SHALLOW COPY (Line 448)

    stage2Traces.forEach(trace => {
        // ... extract docId, stepId, etc.

        const existingDoc = nextDocs.get(docId);  // ← Line 458: Gets shared reference

        if (existingDoc) {
            const stepIdx = existingDoc.steps.findIndex(s => s.id === stepId);
            if (stepIdx >= 0) {
                // ❌ BUG: Mutating shared object from prevDocs
                existingDoc.steps[stepIdx] = {  // ← Line 494: MUTATION
                    ...existingDoc.steps[stepIdx],
                    status: finalStatus,
                    attempts: [...existingAttempts, newAttempt],
                    // ...
                };
            } else {
                // ❌ BUG: Mutating shared array from prevDocs
                existingDoc.steps.push(newStep);  // ← Line 502: MUTATION
            }
        }
    });

    return nextDocs;
});
```

**Why This Breaks React**:

1. `new Map(prevDocs)` creates a **shallow copy** - the Map structure is new, but the VALUES (DocumentWithSteps objects) are the SAME references from `prevDocs`
2. `existingDoc.steps.push()` and `existingDoc.steps[stepIdx] = ...` **mutate the shared object**
3. React compares `prevDocs` vs `nextDocs` by reference
4. Since the Map VALUES are the same object instances, React may not detect the change
5. The graph rebuild effect (line 667-1055) may use stale data
6. Result: `doc.steps.length` appears as 1 instead of 7, causing "0 из 1" display

**Evidence**:
- User reports: "4 document nodes ARE created" (Map has 4 entries) but shows "0 из 1" (each entry has only 1 step)
- Database has all 7 traces per document (confirmed by SQL)
- Frontend correctly fetches all traces (realtime provider working)
- The bug is in the state update logic, not data fetching

### Mechanism of Failure

**Data Flow**:
```
Database (7 traces)
  → useGenerationRealtime (fetches all)
  → processTraces (filters unprocessed)
  → setDocumentSteps (MUTATION BUG HERE)
  → Graph Rebuild Effect (reads stale documentSteps)
  → Document Nodes (shows wrong totalStages)
```

**Timeline of Events**:
1. Component mounts, `documentSteps` = empty Map
2. Realtime fetches 7 traces for Document A
3. `processTraces` is called with all 7 traces
4. First trace: `setDocumentSteps` creates entry with 1 step
5. Traces 2-7: `setDocumentSteps` tries to push to `steps` array
6. **BUG**: Pushing to shared array reference from previous state
7. React doesn't detect change (same object reference)
8. Graph rebuild uses stale Map with 1 step per document
9. UI displays "0 из 1" instead of "3 из 7"

### Contributing Factors

1. **Shallow Copy Pattern**: Using `new Map(prevDocs)` without deep cloning values
2. **Array Mutation**: Calling `.push()` on shared array reference
3. **No Immutability Validation**: No runtime checks for state mutations
4. **Complex State Structure**: Nested Map → Object → Array makes immutability harder

---

## Proposed Solutions

### Solution 1: Proper Immutable State Updates (Recommended)

**Approach**: Create new `DocumentWithSteps` objects with new `steps` arrays instead of mutating shared references.

**Implementation**:

```typescript
setDocumentSteps(prevDocs => {
    const nextDocs = new Map(prevDocs);

    stage2Traces.forEach(trace => {
        const docId = extractDocumentId(trace);
        const docName = extractDocumentName(trace);
        const stepName = trace.step_name || trace.phase || 'Processing';

        if (!docId) return;

        const existingDoc = nextDocs.get(docId);
        const stepId = `${docId}_${stepName.replace(/[^a-zA-Z0-9-_]/g, '_')}`;

        const newAttempt = traceToAttempt(trace, 1);

        // Determine status
        const isFinishStep = stepName === 'finish' || trace.phase === 'complete';
        const stepStatus: NodeStatus = trace.error_data
            ? 'error'
            : (trace.output_data || isFinishStep)
                ? 'completed'
                : 'active';

        const newStep: DocumentStepData = {
            id: stepId,
            stepName: translateStepName(stepName),
            status: stepStatus,
            traceId: trace.id,
            timestamp: new Date(trace.created_at).getTime(),
            attempts: [newAttempt],
            inputData: trace.input_data,
            outputData: trace.output_data
        };

        if (existingDoc) {
            // ✅ FIX: Create NEW object with NEW array
            const stepIdx = existingDoc.steps.findIndex(s => s.id === stepId);

            let updatedSteps: DocumentStepData[];
            if (stepIdx >= 0) {
                // Update existing step (create new array)
                const existingStatus = existingDoc.steps[stepIdx].status;
                const finalStatus = existingStatus === 'completed' ? 'completed' : stepStatus;
                const existingAttempts = existingDoc.steps[stepIdx].attempts || [];
                newAttempt.attemptNumber = existingAttempts.length + 1;

                updatedSteps = [
                    ...existingDoc.steps.slice(0, stepIdx),
                    {
                        ...existingDoc.steps[stepIdx],
                        status: finalStatus,
                        attempts: [...existingAttempts, newAttempt],
                        inputData: newStep.inputData,
                        outputData: newStep.outputData
                    },
                    ...existingDoc.steps.slice(stepIdx + 1)
                ];
            } else {
                // Add new step (create new array)
                updatedSteps = [...existingDoc.steps, newStep];
                // Sort by timestamp
                updatedSteps.sort((a, b) => a.timestamp - b.timestamp);
            }

            // Update name if better
            const betterName = docName || getFilenameRef.current?.(docId);
            const finalName = (betterName && existingDoc.name.startsWith('Документ '))
                ? betterName
                : existingDoc.name;

            // ✅ Create NEW DocumentWithSteps object
            nextDocs.set(docId, {
                ...existingDoc,
                name: finalName,
                steps: updatedSteps  // NEW array
            });
        } else {
            // Create new document entry
            const displayName = docName || getFilenameRef.current?.(docId) || `Документ ${docId.substring(0, 8)}...`;
            nextDocs.set(docId, {
                id: docId,
                name: displayName,
                steps: [newStep],  // NEW array
                priority: trace.input_data?.priority as 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY' | undefined
            });
        }
    });

    return nextDocs;
});
```

**Pros**:
- ✅ Fixes root cause by ensuring immutable updates
- ✅ React's change detection works correctly
- ✅ No external dependencies required
- ✅ Follows React best practices
- ✅ Minimal changes to existing logic

**Cons**:
- Slightly more verbose code
- Creates more object allocations (negligible performance impact)

**Complexity**: Low
**Risk**: Low
**Estimated Effort**: 30 minutes

---

### Solution 2: Use Immer for Immutable Updates (Alternative)

**Approach**: Use Immer library to handle immutable updates with mutable-looking syntax.

**Implementation**:

```bash
npm install immer
```

```typescript
import { produce } from 'immer';

setDocumentSteps(prevDocs => produce(prevDocs, draft => {
    stage2Traces.forEach(trace => {
        const docId = extractDocumentId(trace);
        if (!docId) return;

        const existingDoc = draft.get(docId);
        if (existingDoc) {
            // Can mutate draft directly - Immer handles immutability
            existingDoc.steps.push(newStep);
        } else {
            draft.set(docId, { ...newDocument });
        }
    });
}));
```

**Pros**:
- ✅ Cleaner syntax (write mutations, get immutability)
- ✅ Prevents accidental mutations automatically
- ✅ Widely used in React ecosystem

**Cons**:
- ❌ Adds external dependency
- ❌ Slightly larger bundle size
- ❌ Team needs to learn Immer patterns

**Complexity**: Low
**Risk**: Low
**Estimated Effort**: 1 hour (including dependency setup)

---

### Solution 3: Use `useImmer` Hook (Alternative)

**Approach**: Replace `useState` with `useImmer` from `use-immer` package.

**Implementation**:

```bash
npm install use-immer
```

```typescript
import { useImmer } from 'use-immer';

// Replace:
const [documentSteps, setDocumentSteps] = useState<Map<string, DocumentWithSteps>>(new Map());

// With:
const [documentSteps, updateDocumentSteps] = useImmer<Map<string, DocumentWithSteps>>(new Map());

// Then use draft-based updates:
updateDocumentSteps(draft => {
    stage2Traces.forEach(trace => {
        const docId = extractDocumentId(trace);
        if (!docId) return;

        const existingDoc = draft.get(docId);
        if (existingDoc) {
            existingDoc.steps.push(newStep);  // Direct mutation works
        }
    });
});
```

**Pros**:
- ✅ Most ergonomic API
- ✅ Built on Immer (production-ready)
- ✅ Simplifies all state updates

**Cons**:
- ❌ Adds two dependencies (use-immer + immer)
- ❌ Largest scope change
- ❌ Requires refactoring all `setDocumentSteps` calls

**Complexity**: Medium
**Risk**: Medium
**Estimated Effort**: 2 hours

---

## Implementation Guidance

### Recommended Approach: Solution 1 (Proper Immutable Updates)

**Priority**: High
**Files to Modify**:
1. `/packages/web/components/generation-graph/hooks/useGraphData.ts`

**Implementation Steps**:

1. **Backup Current Implementation**
   ```bash
   cp packages/web/components/generation-graph/hooks/useGraphData.ts \
      packages/web/components/generation-graph/hooks/useGraphData.ts.backup
   ```

2. **Apply Fix to `setDocumentSteps` Callback** (lines 447-526)
   - Replace `existingDoc.steps[stepIdx] = {...}` with array spread
   - Replace `existingDoc.steps.push(newStep)` with array spread
   - Create new `DocumentWithSteps` object for each update
   - See Solution 1 code above for complete implementation

3. **Verify Similar Patterns**
   - Search for other `.push()` calls in state updates
   - Check `setParallelItems` callback (lines 530-582) for similar issues
   - Verify `attemptsMap` updates (lines 619-662) are immutable

4. **Add Code Comment**
   ```typescript
   // IMPORTANT: Create new objects/arrays for React change detection
   // DO NOT mutate prevDocs values directly
   ```

5. **Type-Check**
   ```bash
   cd packages/web
   npm run type-check
   ```

6. **Test Locally**
   - Upload 4 documents
   - Verify graph shows "Этап X из 7" progress
   - Double-click document node
   - Verify modal shows all 7 stages
   - Confirm completedStages increments as processing continues

7. **Monitor for Race Conditions**
   - Test with rapid document uploads
   - Verify no stages are lost
   - Check that sorting by timestamp works correctly

### Validation Criteria

**Success Indicators**:
- ✅ Document nodes display correct stage count (e.g., "Этап 3 из 7")
- ✅ `totalStages` equals 7 (not 1)
- ✅ `completedStages` increments as stages complete
- ✅ NodeDetailsModal shows all 7 stages in accordion
- ✅ Stage names are translated correctly (Russian labels)
- ✅ No console errors related to state updates

**Regression Checks**:
- ✅ Stage 6 (lessons/modules) still render correctly
- ✅ Merge nodes still appear after parallel stages
- ✅ Graph layout doesn't break
- ✅ Realtime updates still work for non-document nodes

### Testing Requirements

**Unit Tests** (Optional but Recommended):
```typescript
describe('documentSteps immutability', () => {
  it('should not mutate previous state when adding steps', () => {
    const prevDocs = new Map([
      ['doc1', { id: 'doc1', name: 'Test', steps: [step1] }]
    ]);

    const nextDocs = updateDocumentStepsImmutably(prevDocs, newTrace);

    // Verify prevDocs unchanged
    expect(prevDocs.get('doc1')!.steps.length).toBe(1);
    // Verify nextDocs updated
    expect(nextDocs.get('doc1')!.steps.length).toBe(2);
    // Verify different object references
    expect(nextDocs.get('doc1')).not.toBe(prevDocs.get('doc1'));
  });
});
```

**Integration Test**:
- Start course generation with 2+ documents
- Monitor `documentSteps` Map via React DevTools
- Verify `steps` array grows from 1 → 7 for each document
- Confirm UI updates in real-time

**Edge Cases**:
- Documents arriving out of order (earlier stage processed after later stage)
- Duplicate traces for same step (retry scenarios)
- Missing `fileId` in some traces (fallback behavior)
- Very rapid trace arrivals (< 100ms apart)

---

## Risks and Considerations

### Implementation Risks

**Risk 1: Performance Impact**
- **Likelihood**: Low
- **Impact**: Low
- **Mitigation**: Array spreads are O(n) but n ≤ 7 (small)

**Risk 2: Introduces New Bugs**
- **Likelihood**: Low
- **Impact**: Medium
- **Mitigation**: Comprehensive testing, code review, gradual rollout

**Risk 3: Doesn't Fix Issue**
- **Likelihood**: Very Low
- **Impact**: High
- **Mitigation**: Root cause analysis is thorough; fix directly addresses mutation

### Performance Impact

**Before Fix** (with mutation):
- Map shallow copy: O(1)
- Array push: O(1) amortized
- Object mutation: O(1)
- **Total**: O(1) per trace

**After Fix** (immutable):
- Map shallow copy: O(1)
- Array spread: O(n) where n = steps.length (max 7)
- Object spread: O(k) where k = object keys (small)
- **Total**: O(n) per trace, but n is bounded by 7

**Conclusion**: Negligible performance difference for typical use case (7 steps per document).

### Breaking Changes

**None Expected**:
- API signatures unchanged
- External components use same interface
- Only internal state management changes

---

## Documentation References

### Tier 0: Project Internal (Mandatory First)

**Project Documentation**:
- `docs/Agents Ecosystem/AGENT-ORCHESTRATION.md` - Agent workflow patterns
- `docs/Agents Ecosystem/ARCHITECTURE.md` - System architecture
- `packages/web/components/generation-graph/README.md` - Graph component docs

**Code References**:
- `packages/web/components/generation-graph/hooks/useGraphData.ts:447-526` - Bug location
- `packages/shared-types/src/generation-graph.ts:121-142` - DocumentStageData type
- `packages/course-gen-platform/src/stages/stage2-document-processing/orchestrator.ts` - Trace creation

**Git History**:
- Recent commit: "fix(graph): final accessibility and dead code cleanup"
- Previous investigation: `INV-2025-11-25-001-user-role-not-updating.md`

### Tier 1: Context7 MCP (Used After Project Search)

**React Documentation** (via Context7):
- Topic: "state updates and immutability"
- Key Finding: "React compares previous and next state using Object.is(). Mutating state objects causes change detection to fail."
- Library ID: `/facebook/react`
- Direct Quote:
  > "Treat state as read-only. You should replace objects and arrays in state rather than mutating them."
  > "When you store objects in state, mutating them will not trigger renders and will change the state in previous render 'snapshots'."

**React Hooks Best Practices**:
- Topic: "useState with complex objects"
- Key Finding: "Always return new object references from state updaters"
- Recommendation: "Use spread operators to create new arrays and objects"

### Tier 2: Official Documentation (Not Needed - Context7 Sufficient)

Context7 provided sufficient information about React state immutability patterns.

### Tier 3: Community Resources (Not Needed)

Not required for this investigation.

---

## MCP Server Usage

### Tools Used

**Project Internal Search** (Tier 0 - MANDATORY):
- **Read**: Used to examine 6 files (useGraphData.ts, NodeDetailsModal, DocumentNode, orchestrator, etc.)
- **Grep**: Used to search for `completedStages`, `totalStages`, `step_name`, `phase` patterns
- **Glob**: Used to find AdminPanel location
- **Bash**: Used to check git history and file structure

**Context7 MCP** (Tier 1 - MANDATORY):
- **resolve-library-id**: `libraryName: "react"`
- **get-library-docs**: `context7CompatibleLibraryID: "/facebook/react", topic: "state immutability"`
- **Findings**: React official docs confirm that mutating state objects breaks change detection
- **Key Insight**: Must use spread operators and create new object references

**Sequential Thinking MCP**:
- Not used (investigation was straightforward; didn't require multi-step complex reasoning)

**Supabase MCP**:
- Not used (database structure already verified by user's SQL query)

---

## Next Steps

### For Orchestrator/User

1. **Review Investigation Report**: Verify root cause analysis aligns with observed symptoms
2. **Select Solution Approach**: Approve Solution 1 (recommended) or choose alternative
3. **Assign to Implementation Agent**: Provide this report + selected solution
4. **Define Testing Scope**: Specify required regression tests

### For Implementation Agent

**When Invoked**:
1. Read this investigation report: `docs/investigations/INV-2025-12-02-001-document-stages-display-bug.md`
2. Apply Solution 1 fixes to `useGraphData.ts`
3. Verify type-check passes
4. Test with 2+ document uploads
5. Confirm modal shows all 7 stages
6. Run regression checks (Stage 6, merge nodes, layout)

**Implementation Reference**:
```typescript
// File: packages/web/components/generation-graph/hooks/useGraphData.ts
// Lines: 447-526
// Task: Replace mutation logic with immutable array/object spreads
```

### Follow-up Recommendations

**Short Term** (this sprint):
1. Apply Solution 1 fix to `useGraphData.ts`
2. Add unit test for immutability
3. Deploy and monitor production

**Medium Term** (next sprint):
1. Audit codebase for similar mutation patterns
2. Add ESLint rule: `no-param-reassign` for state updaters
3. Consider Immer library for complex nested state

**Long Term** (future):
1. Document state management patterns in project wiki
2. Add React DevTools profiler checks in CI
3. Consider Redux Toolkit (has Immer built-in)

---

## Investigation Log

### Timeline

**2025-12-02 (Session Start)**
- 00:00 - Investigation initiated
- 00:05 - Read useGraphData.ts, NodeDetailsModal, DocumentNode
- 00:10 - Examined orchestrator trace logging
- 00:15 - Verified database has correct data (per user's SQL query)
- 00:20 - Traced data flow from DB → Realtime → processTraces → graph
- 00:25 - Identified state mutation bug in setDocumentSteps callback
- 00:30 - Confirmed root cause with code analysis
- 00:35 - Formulated 3 solution approaches
- 00:40 - Generated investigation report

### Commands Run

```bash
# Find admin panel
find packages/web/components/generation-graph -name "*admin*" -type f

# Check orchestrator logging
grep "logTrace" packages/course-gen-platform/src/stages/stage2-document-processing/orchestrator.ts

# Verify shared types
cat packages/shared-types/src/generation-graph.ts | grep -A 15 "interface DocumentStageData"

# Check git history
git log --oneline -10

# List investigation files
ls docs/investigations/
```

### MCP Calls Made

**Tier 0: Project Internal** (executed first):
1. `Read(useGraphData.ts)` - Read full file to understand processTraces logic
2. `Read(NodeDetailsModal/index.tsx)` - Check how stages are rendered
3. `Read(DocumentNode.tsx)` - Verify display logic
4. `Read(orchestrator.ts)` - Confirm trace creation
5. `Read(realtime-provider.tsx)` - Verify trace fetching
6. `Read(AdminPanel.tsx)` - Check filter logic
7. `Grep(pattern="completedStages|totalStages")` - Find usage locations
8. `Glob(pattern="**/AdminPanel.tsx")` - Locate admin panel
9. `Bash(command="grep logTrace ...")` - Check trace calls

**Tier 1: Context7** (executed after project search):
1. `resolve-library-id(libraryName="react")` → `/facebook/react`
2. `get-library-docs(context7CompatibleLibraryID="/facebook/react", topic="state immutability")`
   - Retrieved React official guidance on state updates
   - Confirmed that mutations break change detection
   - Validated solution approach aligns with React best practices

---

## Appendix

### A. Code Snippets

**Current Buggy Code** (useGraphData.ts:484-506):
```typescript
if (existingDoc) {
    const stepIdx = existingDoc.steps.findIndex(s => s.id === stepId);
    if (stepIdx >= 0) {
        // ❌ BUG: Mutating shared object
        existingDoc.steps[stepIdx] = {
            ...existingDoc.steps[stepIdx],
            status: finalStatus,
            attempts: [...existingAttempts, newAttempt],
            inputData: newStep.inputData,
            outputData: newStep.outputData
        };
    } else {
        // ❌ BUG: Mutating shared array
        existingDoc.steps.push(newStep);
        existingDoc.steps.sort((a, b) => a.timestamp - b.timestamp);
    }
}
```

**Fixed Code** (immutable version):
```typescript
if (existingDoc) {
    const stepIdx = existingDoc.steps.findIndex(s => s.id === stepId);

    let updatedSteps: DocumentStepData[];
    if (stepIdx >= 0) {
        // ✅ Create new array with updated step
        updatedSteps = [
            ...existingDoc.steps.slice(0, stepIdx),
            {
                ...existingDoc.steps[stepIdx],
                status: finalStatus,
                attempts: [...existingAttempts, newAttempt],
                inputData: newStep.inputData,
                outputData: newStep.outputData
            },
            ...existingDoc.steps.slice(stepIdx + 1)
        ];
    } else {
        // ✅ Create new array with new step
        updatedSteps = [...existingDoc.steps, newStep];
        updatedSteps.sort((a, b) => a.timestamp - b.timestamp);
    }

    // ✅ Create new DocumentWithSteps object
    nextDocs.set(docId, {
        ...existingDoc,
        steps: updatedSteps
    });
}
```

### B. Database Schema

**generation_trace Table** (relevant columns):
```sql
CREATE TABLE generation_trace (
  id UUID PRIMARY KEY,
  course_id UUID NOT NULL,
  lesson_id UUID NULL,
  stage TEXT NOT NULL,  -- 'stage_2', 'stage_3', etc.
  phase TEXT NOT NULL,  -- 'init', 'processing', 'chunking', etc.
  step_name TEXT NOT NULL,  -- 'start', 'docling_conversion', etc.
  input_data JSONB NOT NULL,  -- Contains { fileId, ... }
  output_data JSONB NULL,
  error_data JSONB NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Example Trace Row**:
```json
{
  "id": "trace_123",
  "course_id": "course_456",
  "stage": "stage_2",
  "phase": "processing",
  "step_name": "docling_conversion",
  "input_data": {
    "fileId": "86a60a91-18ad-47c9-83c2-aca460ae8495",
    "filePath": "/uploads/document.pdf",
    "tier": "standard"
  },
  "output_data": {
    "markdownLength": 15000,
    "pages": 10
  }
}
```

### C. Type Definitions

**DocumentWithSteps** (internal to useGraphData):
```typescript
interface DocumentWithSteps {
  id: string;  // Document UUID
  name: string;  // Human-readable filename
  steps: DocumentStepData[];  // Processing steps
  priority?: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
}
```

**DocumentStepData** (internal to useGraphData):
```typescript
interface DocumentStepData {
  id: string;  // docId_stepName
  stepName: string;  // Translated step name
  status: NodeStatus;  // 'pending' | 'active' | 'completed' | 'error'
  traceId: string;  // Original trace ID
  timestamp: number;  // For ordering
  attempts: TraceAttempt[];  // All attempts for this step
  inputData?: unknown;
  outputData?: unknown;
}
```

**DocumentStageData** (shared-types, used in node.data):
```typescript
export interface DocumentStageData {
  stageId: string;
  stageName: string;
  stageNumber: number;
  status: NodeStatus;
  attempts: TraceAttempt[];
  inputData?: Record<string, unknown>;
  outputData?: Record<string, unknown>;
}
```

---

## Admin Panel Issue (Secondary)

### Problem
Admin monitor filter shows "All stages" but predominantly displays stage_2 traces. Changing filters doesn't consistently update results.

### Analysis
**Location**: `packages/web/components/generation-graph/panels/AdminPanel.tsx:21-26`

**Filter Logic**:
```typescript
const filteredTraces = traces.filter(t => {
    if (stageFilter !== 'all' && t.stage !== stageFilter) return false;
    if (statusFilter === 'error' && !t.error_data) return false;
    if (statusFilter === 'success' && t.error_data) return false;
    return true;
});
```

**Findings**:
- Filter logic appears correct
- Issue likely due to:
  1. Most traces ARE stage_2 (7 traces per document vs 1 per other stage)
  2. UI doesn't clearly indicate active filters
  3. No visual feedback when filter yields 0 results

### Recommended Fix (Low Priority)
1. Add active filter indicator: "Showing 15 of 100 traces (Stage 2 only)"
2. Add "No results" empty state
3. Consider grouping traces by stage in timeline view
4. Add filter reset button (already exists but could be more prominent)

**Priority**: Low (cosmetic issue, doesn't block functionality)
**Estimated Effort**: 30 minutes

---

**Status**: ✅ Investigation Complete
**Next Action**: Forward to implementation agent with Solution 1
**Follow-up**: Monitor production after deployment

