# Node Details Panel - Bug Summary

## Overview
The Node Details Panel (opened by double-clicking nodes) has **5 major bugs** that prevent proper data display and refinement functionality.

---

## Bug List

### BUG #1: No Attempts Data Mapping
**Severity:** CRITICAL
**Impact:** InputTab, OutputTab, AttemptSelector all show no data
**Root Cause:** `useGraphData.ts` doesn't convert traces to TraceAttempt objects
**File:** `packages/web/components/generation-graph/hooks/useGraphData.ts`
**Lines:** 328-495

**Problem:**
```javascript
// What happens now (WRONG):
const nodes = build nodes with: {
  label: 'Stage 3',
  status: 'active',
  duration: 1000,
  tokens: 150
  // ✗ attempts: undefined
  // ✗ inputData: undefined
  // ✗ outputData: undefined
}

// What should happen (CORRECT):
const nodes = build nodes with: {
  label: 'Stage 3',
  status: 'active',
  duration: 1000,
  tokens: 150,
  // ✓ attempts: [TraceAttempt, TraceAttempt, ...]
  // ✓ inputData: {...}
  // ✓ outputData: {...}
}
```

**Expected Fix:**
- Create `traceToAttempt()` function
- Group traces by nodeId
- Map each trace to TraceAttempt
- Add to node.data.attempts
- Add inputData/outputData from latest attempt

---

### BUG #2: ActivityTab Filtering Returns Empty
**Severity:** CRITICAL
**Impact:** ActivityTab shows "No activity recorded" for document and lesson nodes
**Root Cause:** Filter logic only matches stage nodes, not parallel nodes
**File:** `packages/web/components/generation-graph/panels/ActivityTab.tsx`
**Lines:** 17-35

**Problem:**
```javascript
// Current filter logic:
const activities = traces.filter(t => {
    let stageNum = 0;
    if (nodeId.startsWith('stage_')) {
        stageNum = parseInt(nodeId.split('_')[1]);
    }
    return traces.filter(t => {
        if (stageNum > 0 && t.stage === `stage_${stageNum}`) return true;
        return false; // ← Returns false for doc_xyz, lesson_abc
    });
});

// Works for:
// - stage_1 ✓
// - stage_2 ✓
// - stage_3 ✓
// ... stage_6 ✓

// Fails for:
// - doc_12345abc ✗
// - lesson_xyz ✗
// - module_abc ✗
// - merge_stage_2 ✗
// - step_12345_docling ✗
```

**Expected Fix:**
- Parse different nodeId formats (doc_, lesson_, step_, module_, merge_)
- Extract documentId/lessonId from nodeId
- Match traces by input_data.document_id or lesson_id fields
- Fall back to stage matching when no specific ID available

---

### BUG #3: Missing Input/Output Data in Node
**Severity:** CRITICAL
**Impact:** InputTab and OutputTab always show "No data"
**Root Cause:** Node data creation doesn't include inputData/outputData
**File:** `packages/web/components/generation-graph/hooks/useGraphData.ts`
**Lines:** 522-536, 650-673, 725-739

**Problem:**
```javascript
// Node creation missing these fields:
{
  id: 'stage_3',
  type: 'stage',
  data: {
    label: 'Analysis',
    status: 'active',
    stageNumber: 3,
    // ✗ inputData: undefined
    // ✗ outputData: undefined
  }
}

// NodeDetailsDrawer tries to display:
<InputTab inputData={data?.inputData} /> // Gets undefined
<OutputTab outputData={data?.outputData} /> // Gets undefined
```

**Expected Fix:**
- Extract inputData from latest trace: `trace.input_data`
- Extract outputData from latest trace: `trace.output_data`
- Include both in node.data when creating node
- Update on trace changes

---

### BUG #4: Refinement Messages Not in Attempts
**Severity:** MEDIUM
**Impact:** RefinementChat shows no history of refinement messages
**Root Cause:** Refinement message field not mapped from trace to TraceAttempt
**File:** `packages/web/components/generation-graph/hooks/useGraphData.ts` (in traceToAttempt function)

**Problem:**
```javascript
// Backend sends refinement message:
const trace = {
  id: 'trace-123',
  refinement_message: "Make it shorter and simpler"
  // ...
}

// Frontend should convert to:
const attempt = {
  attemptNumber: 2,
  refinementMessage: "Make it shorter and simpler" // ← Missing
  timestamp: new Date(),
  inputData: {...},
  outputData: {...}
}

// NodeDetailsDrawer looks for it:
const chatHistory = attempts
  .filter(att => att.refinementMessage)  // ← Returns empty because field not set
  .map(att => ({
    role: 'user',
    content: att.refinementMessage
  }))
```

**Expected Fix:**
- Map `trace.refinement_message` → `attempt.refinementMessage` in conversion function
- Ensure backend includes refinement_message in trace

---

### BUG #5: RefinementChat Missing Optimistic UI
**Severity:** MEDIUM
**Impact:** User submits message and sees loading for 2-5 seconds with no feedback
**Root Cause:** Message only appears after backend processing
**File:** `packages/web/components/generation-graph/panels/RefinementChat.tsx`
**Lines:** 43-49

**Problem:**
```javascript
const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (message.trim() && !isProcessing) {
      onRefine(message);
      setMessage(''); // ← Input clears
      // But message doesn't appear in chat until backend responds (2-5 sec)
    }
};
```

**User experience:**
1. User types "Make this simpler"
2. User clicks Send
3. Input clears (but why? message isn't visible in chat)
4. Loading spinner appears
5. (2-5 second wait)
6. New message appears in chat from backend
7. User thinks "Did my message actually send?"

**Expected Fix:**
- Add optimistic message to local chat history immediately
- Show message in chat with "Sending..." state
- Replace with confirmed message when backend responds
- Remove from local history if error occurs

---

## Data Flow Summary

### Current (Broken)
```
Traces arrive
  ↓
processTraces() processes them
  ├→ Updates stageStatuses
  ├→ Updates parallelItems
  ✗ Doesn't create attempts
  ✗ Doesn't add inputData/outputData
  ↓
Node created with incomplete data
  ↓
NodeDetailsDrawer opens:
  ├→ selectedAttemptNum = null (no attempts)
  ├→ displayData = fallback (no input/output)
  ├→ InputTab: "No input data"
  ├→ OutputTab: "No output data"
  ├→ ActivityTab: "No activity"
  └→ RefinementChat: empty history
```

### Expected (Fixed)
```
Traces arrive
  ↓
processTraces() processes them
  ├→ Groups traces by nodeId
  ├→ Converts each to TraceAttempt
  ├→ Creates attempts array
  ├→ Adds inputData/outputData
  ↓
Node created with complete data
  ↓
NodeDetailsDrawer opens:
  ├→ selectedAttemptNum = 1 (latest attempt)
  ├→ displayData = selectedAttempt
  ├→ InputTab: shows input_data
  ├→ OutputTab: shows output_data
  ├→ ActivityTab: shows all traces for this node
  └→ RefinementChat: shows history with refinements
```

---

## Dependencies

### On useGraphData.ts fix:
- NodeDetailsDrawer (depends on attempts array)
- AttemptSelector (depends on attempts array)
- InputTab (depends on inputData)
- OutputTab (depends on outputData)
- RefinementChat (depends on refinement messages in attempts)

### On ActivityTab fix:
- Nothing else (just this component)

### On RefinementChat fix:
- UX improvement only (functional without it)

---

## Priority Order for Fixes

1. **BUG #1** - No attempts mapping (enables 3 other fixes)
2. **BUG #3** - Missing input/output data (needed for tabs)
3. **BUG #4** - Refinement messages (needed for chat history)
4. **BUG #2** - ActivityTab filtering (independent fix)
5. **BUG #5** - Optimistic UI (nice to have)

---

## Estimated Effort

| Bug | Complexity | Time | Priority |
|-----|-----------|------|----------|
| #1: Attempts mapping | High | 2-3h | CRITICAL |
| #3: Input/output data | Low | 30min | CRITICAL |
| #4: Refinement messages | Low | 15min | MEDIUM |
| #2: ActivityTab filter | Medium | 1-2h | CRITICAL |
| #5: Optimistic UI | Medium | 1h | LOW |

---

## Questions for Implementation

1. **Trace field names:** Are the trace fields exactly `input_data`, `output_data`, `refinement_message`?
2. **Document ID matching:** Does every stage 2 trace include `input_data.document_id` or `document_id`?
3. **Lesson ID matching:** Does every stage 6 trace include `lesson_id` field?
4. **Attempt numbering:** Should attempt #1 be the first trace, or should retries start at attempt #2?
5. **Merge nodes:** What activities should merge nodes show? (child activities, none, or warning?)

