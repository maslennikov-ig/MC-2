# Files Requiring Modification - Node Details Panel Refactoring

## Priority: CRITICAL (Must fix for basic functionality)

### 1. `packages/web/components/generation-graph/hooks/useGraphData.ts`
**Current Status:** Incomplete - No attempts mapping
**Lines affected:** 328-495, 698-836

**Changes needed:**
- [ ] Add `traceToAttempt()` function to convert GenerationTrace to TraceAttempt
- [ ] Implement trace grouping by nodeId in `processTraces()`
- [ ] Add `attemptsByNode` Map to track traces for each node
- [ ] Include `inputData` and `outputData` in node.data when creating nodes
- [ ] Include `attempts` array in node.data
- [ ] Add `retryCount` calculation in node.data

**Key functions to modify:**
- `processTraces()` (line 328)
- Graph rebuild useEffect (line 498)
- Node creation sections (lines 522-673, 725-739)

**Dependencies:**
- GenerationTrace interface (from realtime provider)
- TraceAttempt interface (from shared-types)

---

### 2. `packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx`
**Current Status:** Partially working - depends on attempts data
**Lines affected:** 47-55, 75-93, 96-119

**Changes needed:**
- [ ] Verify displayData logic works with new attempts structure
- [ ] Test selectedAttemptNum initialization
- [ ] Verify chat history construction with refinement messages
- [ ] Ensure fallback to latest attempt when no selection

**Key functions to modify:**
- Effect hook (line 47) - attempt selection
- `displayData` useMemo (line 75) - attempt lookup
- `chatHistory` useMemo (line 96) - history construction

**Dependencies:**
- Will depend on fixes to useGraphData.ts

---

### 3. `packages/web/components/generation-graph/panels/ActivityTab.tsx`
**Current Status:** Broken - incomplete filtering logic
**Lines affected:** 17-35

**Changes needed:**
- [ ] Enhance nodeId parsing to extract document_id and lesson_id
- [ ] Add matching logic for document nodes (`doc_` prefix)
- [ ] Add matching logic for lesson nodes (`lesson_` prefix)
- [ ] Add matching logic for step nodes (`step_` prefix)
- [ ] Match traces by input_data.document_id and lesson_id fields
- [ ] Handle merge node case (show no activities or all child activities)

**Pseudo-code for fix:**
```
if nodeId starts with 'stage_':
  extract stageNum and match t.stage === 'stage_N'
else if nodeId starts with 'doc_':
  extract documentId from nodeId
  match t.input_data.document_id === documentId AND t.stage === 'stage_2'
else if nodeId starts with 'lesson_':
  extract lessonId from nodeId
  match t.lesson_id === lessonId AND t.stage === 'stage_6'
else if nodeId starts with 'step_':
  extract documentId from step nodeId
  match t.input_data.document_id === documentId AND t.stage === 'stage_2'
else if nodeId starts with 'module_':
  match module's child lesson activities OR show warning
else if nodeId === 'merge_':
  show no activities or aggregate from source nodes
```

**Dependencies:**
- Trace structure (need to know exact field names for document_id and lesson_id)

---

## Priority: MEDIUM (Improves user experience)

### 4. `packages/web/components/generation-graph/panels/RefinementChat.tsx`
**Current Status:** Missing optimistic UI update
**Lines affected:** 43-49, 26-30

**Changes needed:**
- [ ] Implement local message history state
- [ ] Add optimistic update when user submits message
- [ ] Merge local and server-provided history for display
- [ ] Clear local history when backend confirms attempt

**Key functions to modify:**
- `handleSubmit()` (line 43)
- Chat history display (line 71-98)

**Options:**
- Option A: Add state in RefinementChat component
- Option B: Add callback in NodeDetailsDrawer to update chat history
- Option C: Add zustand store for refinement messages (over-engineering)

---

## Priority: LOW (Should work once dependencies fixed)

### 5. `packages/web/components/generation-graph/panels/AttemptSelector.tsx`
**Current Status:** Depends on attempts data
**Changes needed:** None - will work once attempts exist
**Verification:** Test with multiple attempts

---

### 6. `packages/web/components/generation-graph/panels/InputTab.tsx`
**Current Status:** Depends on inputData
**Changes needed:** None - will work once inputData exists
**Verification:** Test with various node types

---

### 7. `packages/web/components/generation-graph/panels/OutputTab.tsx`
**Current Status:** Depends on outputData
**Changes needed:** None - will work once outputData exists
**Verification:** Test with various node types

---

### 8. `packages/web/components/generation-graph/panels/ProcessTab.tsx`
**Current Status:** Should work with current metrics
**Changes needed:** None - already receives duration/tokens/status
**Verification:** Verify metrics are populated

---

## Supporting Files (Check/Update)

### Type Definitions
- **`packages/shared-types/src/generation-graph.ts`**
  - Verify TraceAttempt interface matches implementation expectations
  - Check if ProcessMetrics interface is complete
  - Check GraphNode.attempts field is typed as TraceAttempt[]

- **`packages/web/components/generation-graph/types.ts`**
  - Verify AppNode type includes attempts, inputData, outputData, errorData

### Utilities
- **`packages/web/lib/generation-graph/constants.ts`**
  - Check GRAPH_STAGE_CONFIG is complete

- **`packages/web/lib/generation-graph/utils.ts`**
  - May need helpers to convert traces or extract nodeId

### Contexts/Providers
- **`packages/web/components/generation-monitoring/realtime-provider.tsx`**
  - Verify GenerationTrace structure includes all needed fields
  - Check if traces include refinement_message field

---

## Integration Points

### Data sources that must provide correct fields:
1. **GenerationTrace from realtime websocket:**
   - `id` - trace ID
   - `stage` - stage identifier ("stage_1", "stage_2", etc.)
   - `step_name` - current step
   - `phase` - processing phase
   - `created_at` - timestamp
   - `input_data` - input to this stage
   - `output_data` - output from this stage
   - `error_data` - error if failed (optional)
   - `tokens_used` - token count
   - `duration_ms` - processing duration
   - `cost_usd` - cost
   - `model` - LLM model used
   - `was_cached` - whether cached (optional)
   - `refinement_message` - refinement message (optional)
   - `document_id` / `input_data.document_id` - for stage 2 docs
   - `lesson_id` - for stage 6 lessons

2. **Node.data structure that must be created:**
   - `label` - node display name
   - `status` - node status
   - `stageNumber` - 1-6 or null
   - `inputData` - from trace
   - `outputData` - from trace
   - `errorData` - if error
   - `attempts` - TraceAttempt[] array
   - `retryCount` - number of retries
   - `duration`, `tokens`, `cost` - metrics
   - `currentStep` - current processing step
   - `filename` - for documents
   - `moduleId`, `title` - for modules/lessons

---

## Testing Strategy

### Unit Tests
1. Test `traceToAttempt()` conversion function
2. Test trace grouping logic
3. Test nodeId extraction from different node types
4. Test ActivityTab filter for each node type

### Integration Tests
1. Test end-to-end data flow: trace → node.data.attempts
2. Test NodeDetailsDrawer with multi-attempt node
3. Test all tabs display correct data
4. Test refinement message flow

### Manual Tests
1. Create course with documents
2. Verify each stage shows correct data in drawer
3. Test refinement flow
4. Test activity tab for all node types

---

## Code Review Checklist

- [ ] All traces are converted to attempts
- [ ] Attempts array is sorted by attemptNumber
- [ ] Latest attempt is selected by default
- [ ] InputTab shows input_data from selected attempt
- [ ] OutputTab shows output_data from selected attempt
- [ ] ActivityTab filters correctly for all node types
- [ ] Refinement messages appear in chat history
- [ ] ProcessTab metrics are populated
- [ ] No TypeScript errors in any modified files
- [ ] No infinite loops in useEffect dependencies
- [ ] Memory leaks prevented (cleanup functions)
- [ ] Performance acceptable (no unnecessary re-renders)

