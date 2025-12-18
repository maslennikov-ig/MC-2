# Node Details Panel Research - Bug Documentation

## Contents

This directory contains comprehensive research and documentation for bugs found in the Node Details Panel component that opens when double-clicking nodes in the course generation graph.

### Documents

1. **T001-audit-report.md** (713 lines)
   - **Comprehensive technical audit** of all bugs
   - Includes code references with line numbers
   - Root cause analysis for each bug
   - Suggested fixes with code examples
   - Data flow diagrams (current vs. expected)
   - Testing recommendations

2. **BUGS-SUMMARY.md** (296 lines)
   - **Executive summary** of all 5 bugs
   - Quick reference guide
   - Bug severity and impact
   - Current vs. expected behavior comparison
   - Priority order for fixes
   - Effort estimation table

3. **FILES-REQUIRING-MODIFICATION.md** (235 lines)
   - **Detailed modification guide** for developers
   - Lists all files that need changes
   - Priority levels (CRITICAL, MEDIUM, LOW)
   - Specific lines and functions to modify
   - Integration points and dependencies
   - Code review checklist
   - Testing strategy

---

## Quick Reference: The 5 Bugs

| # | Bug | Severity | Impact | Fix Location |
|---|-----|----------|--------|--------------|
| 1 | No Attempts Data Mapping | CRITICAL | No input/output in tabs | useGraphData.ts |
| 2 | ActivityTab Filtering Empty | CRITICAL | No activities shown | ActivityTab.tsx |
| 3 | Missing Input/Output Data | CRITICAL | Tabs show "No data" | useGraphData.ts |
| 4 | Refinement Messages Not Saved | MEDIUM | Chat history empty | useGraphData.ts |
| 5 | RefinementChat Missing Optimistic UI | MEDIUM | Poor UX feedback | RefinementChat.tsx |

---

## How to Use These Documents

### For Project Managers / Stakeholders
- Start with **BUGS-SUMMARY.md**
- Understand severity and impact
- See effort estimation table

### For Developers (Implementation)
- Read **FILES-REQUIRING-MODIFICATION.md** first
- Get specific line numbers and functions to change
- Use **T001-audit-report.md** for detailed explanations
- Refer to code examples in audit report for implementation guidance

### For Code Reviewers
- Check **FILES-REQUIRING-MODIFICATION.md** code review checklist
- Use **T001-audit-report.md** data flow diagrams for verification
- Reference specific line numbers in files

### For QA / Testing
- See **T001-audit-report.md** "Testing Recommendations" section
- Use "Testing Strategy" in FILES-REQUIRING-MODIFICATION.md
- Create test cases based on bug scenarios

---

## Key Findings

### Root Cause Analysis
The root cause is a **missing mapping layer** between raw GenerationTrace objects (from websocket) and the TraceAttempt structure expected by NodeDetailsDrawer.

**Current architecture:**
```
GenerationTrace (raw from backend)
  ↓
useGraphData.processTraces()
  ↓
Node created directly from trace
  ↓
NodeDetailsDrawer tries to access node.data.attempts (undefined)
```

**Should be:**
```
GenerationTrace (raw from backend)
  ↓
useGraphData.processTraces() converts to TraceAttempt[]
  ↓
Node.data.attempts = [TraceAttempt, TraceAttempt, ...]
Node.data.inputData = {...}
Node.data.outputData = {...}
  ↓
NodeDetailsDrawer accesses node.data.attempts (works!)
```

### Impact on UI

When user double-clicks a node to see details:
- **InputTab:** Shows "No input data available"
- **OutputTab:** Shows "No output data available"
- **ActivityTab:** Shows "No activity recorded for this stage"
- **ProcessTab:** Shows metrics (only working tab)
- **RefinementChat:** Shows empty history

### Blockers for Features
- ✗ T084: Input/Output display (blocked by Bug #1, #3)
- ✗ T085: Refinement chat (blocked by Bug #4)
- ✗ Activity tracking (blocked by Bug #2)
- ✗ Attempt selection (blocked by Bug #1)

---

## Files to Modify

### High Priority (CRITICAL)
1. `/packages/web/components/generation-graph/hooks/useGraphData.ts`
2. `/packages/web/components/generation-graph/panels/ActivityTab.tsx`

### Medium Priority (MEDIUM)
3. `/packages/web/components/generation-graph/panels/RefinementChat.tsx`

### Dependencies (Will work once above fixed)
4. `/packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx`
5. `/packages/web/components/generation-graph/panels/InputTab.tsx`
6. `/packages/web/components/generation-graph/panels/OutputTab.tsx`
7. `/packages/web/components/generation-graph/panels/AttemptSelector.tsx`

See **FILES-REQUIRING-MODIFICATION.md** for complete details.

---

## Implementation Priority

1. **Phase 1 (CRITICAL):** Fix useGraphData.ts
   - Add traceToAttempt() function
   - Implement trace grouping
   - Add attempts, inputData, outputData to node.data
   - Fixes: Bug #1, Bug #3, Bug #4

2. **Phase 2 (CRITICAL):** Fix ActivityTab
   - Implement proper nodeId matching
   - Fixes: Bug #2

3. **Phase 3 (MEDIUM):** Optional UX improvement
   - Add optimistic UI to RefinementChat
   - Fixes: Bug #5

Estimated total effort: **4-5 hours** for Phases 1-2

---

## Data Structures

### GenerationTrace (Input)
```typescript
{
  id: string;
  stage: string; // "stage_1", "stage_2", etc.
  step_name: string;
  phase: string;
  created_at: string;
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown>;
  error_data?: Record<string, unknown>;
  tokens_used?: number;
  duration_ms?: number;
  cost_usd?: number;
  model?: string;
  was_cached?: boolean;
  refinement_message?: string;
}
```

### TraceAttempt (Output)
```typescript
{
  attemptNumber: number;
  timestamp: Date;
  inputData: Record<string, unknown>;
  outputData: Record<string, unknown>;
  processMetrics: {
    model: string;
    tokens: number;
    duration: number;
    cost: number;
    wasCached?: boolean;
  };
  status: 'success' | 'failed';
  errorMessage?: string;
  refinementMessage?: string;
}
```

---

## Questions for Clarification

Before implementation, verify:
1. Exact field names in GenerationTrace (snake_case vs. camelCase)
2. Whether document_id is in input_data or at root level
3. Whether lesson_id is included for stage 6 traces
4. Expected behavior for merge nodes in ActivityTab
5. Attempt numbering (start at 1 or can start at 0)

---

## References

- **Spec:** `/specs/014-node-details-panel/spec.md`
- **Tasks:** `/specs/014-node-details-panel/tasks.md`
- **Shared Types:** `packages/shared-types/src/generation-graph.ts`
- **Component:** `packages/web/components/generation-graph/`

---

## Document Changelog

- **Created:** 2025-11-29
- **Author:** Research Task - Code Analysis
- **Status:** READY FOR IMPLEMENTATION

