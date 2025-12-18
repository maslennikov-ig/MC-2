# T001: Node Details Panel - Critical Bugs Audit Report

**Date:** November 29, 2025
**Feature:** Node Details Panel (Double-click to open)
**Status:** CRITICAL ISSUES IDENTIFIED

---

## Executive Summary

The Node Details Panel has **4 critical bugs** preventing data from displaying correctly:

1. **No attempts data mapping** - Traces are never converted to TraceAttempt objects
2. **Empty activity filtering** - ActivityTab filters return nothing for most nodes
3. **No input/output data flow** - Node data lacks inputData/outputData properties
4. **Missing RefinementChat integration** - Refinement messages aren't saved to attempts

---

## Bug #1: No Attempts Data Mapping (CRITICAL)

### Root Cause
The `useGraphData.ts` hook builds node data but **never creates `attempts` arrays** from traces. The `TraceAttempt` interface (shared-types) expects structured data, but traces are stored as flat GenerationTrace objects.

### Current Flow (BROKEN)
```
GenerationTrace[] (from realtime) 
  → processTraces() in useGraphData.ts
  → node.data created (node.data.label, node.data.status, etc.)
  ✗ node.data.attempts = UNDEFINED
```

### Expected Flow (SHOULD BE)
```
GenerationTrace[] (from realtime)
  → Map traces to TraceAttempt[] (attempt #1, #2, #3...)
  → Group by nodeId + stage
  → node.data.attempts = [TraceAttempt, TraceAttempt, ...]
```

### Code Reference
**File:** `/home/me/code/megacampus2/packages/web/components/generation-graph/hooks/useGraphData.ts`

Lines 328-495: `processTraces()` callback handles traces but:
- Only updates `stageStatuses` (lines 462-493)
- Only updates `parallelItems` (lines 347-459)
- **MISSING:** Conversion of traces to attempts structure
- **MISSING:** Mapping of traces to node.data.attempts property

**File:** `/home/me/code/megacampus2/packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx`

Lines 47-55: Data initialization depends on `data?.attempts`:
```typescript
useEffect(() => {
    if (data?.attempts && data.attempts.length > 0) {
        const latest = data.attempts[data.attempts.length - 1];
        setSelectedAttemptNum(latest.attemptNumber);
    } else {
        setSelectedAttemptNum(null);  // ← Sets to null when attempts is undefined
    }
}, [selectedNodeId, data?.attempts]);
```

Lines 75-93: Display data lookup fails when attempts is undefined:
```typescript
const displayData = useMemo(() => {
    if (selectedAttemptNum && data?.attempts) {
        const attempt = data.attempts.find((a: TraceAttempt) => a.attemptNumber === selectedAttemptNum);
        // ↑ This find() always returns undefined because attempts array doesn't exist
        if (attempt) {
            return {
                label: data.label,
                inputData: attempt.inputData,  // ← undefined
                outputData: attempt.outputData, // ← undefined
                // ...
            };
        }
    }
    return data; // ← Falls back to data with no inputData/outputData
}, [data, selectedAttemptNum]);
```

### Impact
- **InputTab and OutputTab always show "No data available"**
- **AttemptSelector has no attempts to display**
- **RefinementChat has no attempt history to show**

### Data Structure Mismatch

**TraceAttempt interface** (expected in node.data):
```typescript
interface TraceAttempt {
  attemptNumber: number;
  timestamp: Date;
  inputData: Record<string, unknown>;
  outputData: Record<string, unknown>;
  processMetrics: ProcessMetrics;
  status: 'success' | 'failed';
  errorMessage?: string;
  refinementMessage?: string;
}
```

**What we're getting** (trace object):
```typescript
interface GenerationTrace {
  id: string;
  stage: string;
  step_name: string;
  phase: string;
  input_data: Record<string, unknown>;    // Stored directly, not in attempts
  output_data: Record<string, unknown>;   // Stored directly, not in attempts
  error_data?: Record<string, unknown>;
  created_at: string;
  // ... more fields
}
```

### Suggested Fix

Create a `TraceAttempt` aggregation function in `useGraphData.ts`:

```typescript
/**
 * Convert a trace into a TraceAttempt structure.
 * Maps raw trace fields to the TraceAttempt interface expected by NodeDetailsDrawer.
 */
function traceToAttempt(trace: GenerationTrace, attemptNumber: number): TraceAttempt {
  return {
    attemptNumber,
    timestamp: new Date(trace.created_at),
    inputData: trace.input_data || {},
    outputData: trace.output_data || {},
    processMetrics: {
      model: trace.model || 'unknown',
      tokens: trace.tokens_used || 0,
      duration: trace.duration_ms || 0,
      cost: trace.cost_usd || 0,
      wasCached: trace.was_cached
    },
    status: trace.error_data ? 'failed' : 'success',
    errorMessage: trace.error_data?.message,
    refinementMessage: trace.refinement_message
  };
}

// In processTraces():
// Group traces by nodeId + stage
const attemptsByNode = new Map<string, GenerationTrace[]>();
newTraces.forEach(trace => {
  const nodeId = trace.stage; // or doc_xyz, lesson_xyz for parallel nodes
  if (!attemptsByNode.has(nodeId)) {
    attemptsByNode.set(nodeId, []);
  }
  attemptsByNode.get(nodeId)!.push(trace);
});

// In graph rebuild (useEffect), add attempts to node data:
newNodes.forEach(node => {
  const traces = attemptsByNode.get(node.id) || [];
  const attempts = traces
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((trace, idx) => traceToAttempt(trace, idx + 1));
  
  if (attempts.length > 0) {
    node.data.attempts = attempts;
    node.data.retryCount = Math.max(0, attempts.length - 1);
  }
});
```

---

## Bug #2: Empty ActivityTab Filter (CRITICAL)

### Root Cause
The `ActivityTab.tsx` filters traces by nodeId but uses **incomplete matching logic** that returns empty for most nodes.

### Current Implementation (BROKEN)
**File:** `/home/me/code/megacampus2/packages/web/components/generation-graph/panels/ActivityTab.tsx`

Lines 17-35:
```typescript
const activities = useMemo(() => {
    if (!nodeId) return [];
    
    let stageNum = 0;
    if (nodeId.startsWith('stage_')) {
        stageNum = parseInt(nodeId.split('_')[1]);
    }

    return traces.filter(t => {
        // Match stage
        if (stageNum > 0 && t.stage === `stage_${stageNum}`) return true;
        // Match specific ID (if trace has metadata with node ID - TBD)
        return false;  // ← Always returns false for non-stage nodes!
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}, [traces, nodeId]);
```

### Problem Scenario
When user clicks on:
- **`stage_3` node** → Returns traces where `trace.stage === 'stage_3'` ✓ Works
- **`doc_12345abc` node** → nodeId doesn't start with 'stage_' → stageNum = 0 → always returns false ✗ Fails
- **`lesson_abc123` node** → Same as doc → returns false ✗ Fails

### Impact
- **For document nodes (stage 2):** "No activity recorded" message
- **For lesson nodes (stage 6):** "No activity recorded" message
- **For merge nodes:** "No activity recorded" message
- Only stage nodes show any activity

### Missing Mapping
The traces don't include nodeId information. They only have:
- `stage` (e.g., "stage_2")
- `step_name`
- `phase`
- `input_data.document_id` (for stage 2)
- `lesson_id` (for stage 6, if present)

But there's no trace property that maps to `nodeId` like `doc_xyz` or `lesson_xyz`.

### Suggested Fix

Option A: Add nodeId matching logic:
```typescript
const activities = useMemo(() => {
    if (!nodeId) return [];
    
    // Extract the stage number from nodeId
    let stageNum = 0;
    let documentId = null;
    let lessonId = null;
    
    if (nodeId.startsWith('stage_')) {
        stageNum = parseInt(nodeId.split('_')[1]);
    } else if (nodeId.startsWith('doc_')) {
        // nodeId format: "doc_<uuid>" → extract uuid
        documentId = nodeId.replace(/^doc_/, '');
        stageNum = 2;
    } else if (nodeId.startsWith('lesson_')) {
        lessonId = nodeId.replace(/^lesson_/, '');
        stageNum = 6;
    } else if (nodeId.startsWith('step_')) {
        // DocumentStep node
        // Extract doc ID from step id: "step_<uuid>_<stepname>"
        const parts = nodeId.replace(/^step_/, '').split('_');
        if (parts.length >= 1) {
            documentId = parts[0];
        }
        stageNum = 2;
    }

    return traces.filter(t => {
        // Match by stage
        if (stageNum > 0 && t.stage !== `stage_${stageNum}`) return false;
        
        // Additional filtering for parallel nodes
        if (documentId && t.input_data?.document_id === documentId) return true;
        if (lessonId && t.lesson_id === lessonId) return true;
        if (stageNum > 0 && !documentId && !lessonId) return true; // Stage node with matching stage
        
        return false;
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}, [traces, nodeId]);
```

Option B: Store nodeId in traces during backend processing (better long-term solution):
- Modify trace generation in backend to include computed nodeId
- Traces would have: `trace.nodeId = 'doc_xyz'` or `'lesson_abc'`
- ActivityTab filtering becomes simple: `t.nodeId === nodeId`

---

## Bug #3: Missing Input/Output Data in Node Data (CRITICAL)

### Root Cause
When nodes are created in `useGraphData.ts`, the **inputData and outputData fields are not populated** from the traces.

### Current Implementation (INCOMPLETE)
**File:** `/home/me/code/megacampus2/packages/web/components/generation-graph/hooks/useGraphData.ts`

Lines 522-536: Document node creation:
```typescript
newNodes.push({
    id: docHeaderId,
    type: 'document',
    position: getExistingPos(docHeaderId),
    data: {
        ...config,
        label: doc.name,
        filename: doc.name,
        status: doc.steps.length > 0 ? 'active' : 'pending',
        stageNumber: 2 as const,
        color: config.color
        // ✗ Missing: inputData, outputData
    }
} as AppNode);
```

Lines 650-673: Generic parallel item node creation:
```typescript
newNodes.push({
    id: item.id,
    type: item.type === 'document-step' ? 'document' : item.type,
    position: getExistingPos(item.id),
    data: {
        ...config,
        label: item.label,
        status: currentStatus,
        stageNumber: ...,
        ...(item.type === 'document' || item.type === 'document-step' ? { filename: item.label } : {}),
        // ✗ Missing: inputData, outputData
        currentStep: trace?.step_name,
        duration: trace?.duration_ms,
        tokens: trace?.tokens_used,
        cost: trace?.cost_usd
    }
} as AppNode);
```

Lines 725-739: Stage node creation:
```typescript
newNodes.push({
    id: stageKey,
    type: 'stage',
    position: getExistingPos(stageKey),
    data: {
        ...config,
        status: currentStatus,
        stageNumber: i as 1 | 2 | 3 | 4 | 5 | 6,
        label: config.name,
        // ✗ Missing: inputData, outputData
        duration: trace?.duration_ms,
        tokens: trace?.tokens_used,
        cost: trace?.cost_usd,
        currentStep: trace?.step_name
    }
});
```

### Impact
- **InputTab.tsx** (line 12): Gets `inputData` prop = undefined
- **OutputTab.tsx** (line 12): Gets `outputData` prop = undefined
- Both render: "No input/output data available"

### Suggested Fix

In the node data creation section, add:
```typescript
data: {
    ...config,
    label: item.label,
    status: currentStatus,
    // ✓ NEW: Add input/output data from latest trace
    inputData: trace?.input_data,
    outputData: trace?.output_data,
    errorData: trace?.error_data,
    // ... rest of properties
}
```

For the attempts-based approach, this should come from the latest attempt:
```typescript
const latestAttempt = attempts?.[attempts.length - 1];
data: {
    ...config,
    inputData: latestAttempt?.inputData,
    outputData: latestAttempt?.outputData,
    errorData: latestAttempt?.errorMessage ? { message: latestAttempt.errorMessage } : undefined,
    attempts: attempts,  // Also add the attempts array
    retryCount: attempts ? Math.max(0, attempts.length - 1) : 0,
    // ...
}
```

---

## Bug #4: RefinementChat Messages Not Saved to Attempts (MEDIUM)

### Root Cause
The `useRefinement.ts` hook submits refinement requests to the backend but **doesn't update the local attempts array** with the refinement message. The message only persists in the backend, not visible in the UI.

### Current Implementation (INCOMPLETE)
**File:** `/home/me/code/megacampus2/packages/web/components/generation-graph/hooks/useRefinement.ts`

Lines 9-42:
```typescript
const refine = useCallback(async (
    stageId: string, 
    nodeId: string | undefined, 
    attemptNumber: number, 
    userMessage: string,
    previousOutput: string
) => {
    setIsRefining(true);
    try {
      const request: RefinementRequest = {
          courseId,
          stageId: stageId as RefinementRequest['stageId'],
          nodeId,
          attemptNumber,
          userMessage,
          previousOutput
      };

      const response = await refineStageResult(request);
      
      toast.success("Refinement Started", {
          description: "AI is working on your changes. A new attempt will appear shortly.",
      });

      return response;
      // ✗ Missing: Update node.data.attempts with new attempt containing refinementMessage
```

### Expected Flow
```
User enters refinement message
  → handleRefine() sends request to backend
  → Backend processes and creates new trace
  → Frontend should:
    1. Get the new trace via realtime websocket
    2. Convert to TraceAttempt with refinementMessage field
    3. Add to node.data.attempts array
    4. Show in chat history
```

### Where Message Gets Lost
**File:** `/home/me/code/megacampus2/packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx`

Lines 96-119: Chat history construction depends on attempts:
```typescript
const chatHistory = useMemo(() => {
    if (!data?.attempts) return [];  // ← Returns empty if no attempts
    const history: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }> = [];
    
    const sorted = [...data.attempts].sort((a: TraceAttempt, b: TraceAttempt) => a.attemptNumber - b.attemptNumber);
    
    sorted.forEach((att: TraceAttempt) => {
        if (att.refinementMessage) {  // ← This is never set
            history.push({
                role: 'user',
                content: att.refinementMessage,
                timestamp: new Date(att.timestamp).toISOString()
            });
        }
        
        history.push({
            role: 'assistant',
            content: `Generated Attempt #${att.attemptNumber}`,
            timestamp: new Date(att.timestamp).toISOString()
        });
    });
    return history;
}, [data?.attempts]);
```

### Problem
1. Backend receives refinement request with `userMessage`
2. Backend creates new trace with `refinement_message` field
3. Frontend receives trace via websocket
4. Trace is converted to `TraceAttempt` (when that code exists)
5. **BUG:** `traceToAttempt()` function needs to map `trace.refinement_message` → `attempt.refinementMessage`

### Suggested Fix

Update the `traceToAttempt()` function (from Bug #1 fix):
```typescript
function traceToAttempt(trace: GenerationTrace, attemptNumber: number): TraceAttempt {
  return {
    attemptNumber,
    timestamp: new Date(trace.created_at),
    inputData: trace.input_data || {},
    outputData: trace.output_data || {},
    processMetrics: {
      model: trace.model || 'unknown',
      tokens: trace.tokens_used || 0,
      duration: trace.duration_ms || 0,
      cost: trace.cost_usd || 0,
      wasCached: trace.was_cached
    },
    status: trace.error_data ? 'failed' : 'success',
    errorMessage: trace.error_data?.message,
    refinementMessage: trace.refinement_message  // ← Add this line
  };
}
```

Ensure GenerationTrace interface includes refinement_message field.

---

## Bug #5: RefinementChat Missing Message in State (MINOR)

### Root Cause
When user types and submits a refinement message, the message is sent to the backend but **doesn't immediately appear in the chat UI**. User sees loading state but no confirmation of their message being sent.

### Current Implementation
**File:** `/home/me/code/megacampus2/packages/web/components/generation-graph/panels/RefinementChat.tsx`

Lines 43-49:
```typescript
const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (message.trim() && !isProcessing) {
      onRefine(message);  // Call parent handler
      setMessage(''); // Clear input immediately
      // ✗ Missing: Add message to local chat history immediately
    }
};
```

Lines 26-30: Chat history comes from props:
```typescript
export const RefinementChat: React.FC<RefinementChatProps> = ({
  onRefine,
  history = [],  // ← From parent (NodeDetailsDrawer)
  isProcessing = false
})
```

Lines 95-97: Only displays history, can't add to it:
```typescript
<div ref={scrollRef} />
```

### Issue
When user submits, the message doesn't appear in the chat until:
1. Backend processes refinement
2. New trace arrives via websocket
3. Converts to attempt with refinementMessage
4. Parent updates and re-renders

This can take seconds, creating UX confusion.

### Suggested Fix

Add optimistic update in NodeDetailsDrawer:
```typescript
const handleRefine = async (message: string) => {
    if (!data || !selectedAttemptNum) return;
    
    // ✓ NEW: Optimistic update - add message immediately
    const optimisticMessage = {
        role: 'user' as const,
        content: message,
        timestamp: new Date().toISOString()
    };
    
    // (Would need to lift state up or use a callback)
    
    // Get current output to refine
    const currentOutput = JSON.stringify(displayData?.outputData || {});
    
    await refine(
        `stage_${data.stageNumber}`,
        selectedNodeId || undefined,
        selectedAttemptNum,
        message,
        currentOutput
    );
};
```

Or add to RefinementChat component directly with callback:
```typescript
const [localHistory, setLocalHistory] = useState<ChatMessage[]>([]);

const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (message.trim() && !isProcessing) {
      // ✓ NEW: Add to local history immediately
      setLocalHistory(prev => [...prev, {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      }]);
      
      onRefine(message);
      setMessage('');
    }
};

// Display combined history
const displayHistory = [...(history || []), ...localHistory];
```

---

## Summary: Files Requiring Modification

### Critical (Must fix for functionality)
1. **`packages/web/components/generation-graph/hooks/useGraphData.ts`**
   - Add `traceToAttempt()` conversion function
   - Add attempts grouping/aggregation logic
   - Add inputData/outputData to node.data
   - Add retryCount calculation

2. **`packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx`**
   - Update displayData logic to handle attempts array correctly
   - Verify chat history construction

3. **`packages/web/components/generation-graph/panels/ActivityTab.tsx`**
   - Enhance filter logic for doc/lesson/step nodes
   - Add document_id and lesson_id matching

### Medium (Improves UX)
4. **`packages/web/components/generation-graph/panels/RefinementChat.tsx`**
   - Add optimistic UI update for submitted message
   - Show immediate feedback to user

### Information
5. **`packages/web/components/generation-graph/panels/AttemptSelector.tsx`**
   - Should work once attempts data exists

6. **`packages/web/components/generation-graph/panels/InputTab.tsx`**
   - Should work once inputData exists

7. **`packages/web/components/generation-graph/panels/OutputTab.tsx`**
   - Should work once outputData exists

8. **`packages/web/components/generation-graph/panels/ProcessTab.tsx`**
   - Currently works with metrics from node.data

---

## Data Flow Diagram (Current vs. Expected)

### CURRENT (BROKEN)
```
GenerationTrace[] (websocket)
  ↓
processTraces() 
  ├→ Creates node with label, status, color
  ├→ Updates stageStatuses
  ├→ Updates parallelItems
  ✗ NO node.data.attempts
  ✗ NO node.data.inputData
  ✗ NO node.data.outputData
  ↓
useGraphData rebuilds nodes
  ↓
NodeDetailsDrawer receives node with INCOMPLETE data
  ├→ selectedAttemptNum = null (no attempts)
  ├→ displayData = node (fallback, no input/output)
  ├→ InputTab shows "No data"
  ├→ OutputTab shows "No data"
  ├→ ActivityTab shows "No activity"
  └→ RefinementChat shows empty history
```

### EXPECTED (AFTER FIX)
```
GenerationTrace[] (websocket)
  ↓
processTraces()
  ├→ Group traces by nodeId
  ├→ Convert each trace to TraceAttempt
  ├→ Aggregate into node.data.attempts array
  ├→ Add latest trace data: inputData, outputData, errorData
  ├→ Create node with attempts, inputData, outputData
  ↓
useGraphData rebuilds nodes
  ↓
NodeDetailsDrawer receives node with COMPLETE data
  ├→ selectedAttemptNum = 1 (latest attempt)
  ├→ displayData = selectedAttempt (has inputData, outputData)
  ├→ InputTab shows trace.input_data
  ├→ OutputTab shows trace.output_data
  ├→ ActivityTab shows all traces for this node
  └→ RefinementChat shows history with user refinement messages
```

---

## Testing Recommendations

### Test 1: Basic Data Flow
1. Upload a document to Stage 2
2. Observe traces arriving via websocket
3. Double-click on document node
4. **Verify:** InputTab shows document filename/data
5. **Verify:** OutputTab shows processing results
6. **Verify:** ProcessTab shows duration/tokens/cost

### Test 2: Multiple Attempts
1. Create a node that processes with 3 attempts
2. Double-click to open drawer
3. **Verify:** AttemptSelector shows 3 attempts
4. **Verify:** Can select each attempt
5. **Verify:** InputTab/OutputTab update when switching attempts

### Test 3: Activity Tracking
1. Double-click on different node types (stage, doc, lesson)
2. **Verify:** ActivityTab shows relevant traces
3. **Verify:** Not showing activities from other nodes

### Test 4: Refinement Flow
1. Enter refinement message in RefinementChat
2. Submit message
3. **Verify:** Message appears in chat history immediately (optimistic)
4. **Verify:** New attempt appears when backend completes
5. **Verify:** Attempt includes refinementMessage

---

## References

- **TraceAttempt interface:** `packages/shared-types/src/generation-graph.ts:247-271`
- **GenerationTrace interface:** Used in `packages/web/components/generation-celestial/utils` (check GenerationRealtime type)
- **GraphNode interface:** `packages/shared-types/src/generation-graph.ts:36-105`

