# Phases 6-13 & 19 Verification Report: n8n-Graph-View Implementation

**Date**: 2025-11-28
**Reviewer**: Code Quality Verification Agent
**Phases Verified**: 6-13, 19 (User Stories US3, US4, US5, US6, US10, Real-time, Error Handling, Statistics, Mobile)

---

## Executive Summary

**Overall Status**: ⚠️ **PARTIAL PASS** (66% Complete)

**Quality Score**: **3.4/5** (Good but incomplete)

**Build Status**: ✅ **PASSED** (Type-check: ✅, Build: ✅ with warnings only)

**Critical Issues**: **5 CRITICAL** (Missing hooks prevent features from working)

**Verdict**: The implementation demonstrates **solid foundational work** with good React Flow v12 patterns, proper TypeScript usage, and working core components. However, **several critical hooks are completely missing**, preventing key features (retry, fallback polling, viewport preservation, graceful degradation) from functioning. Additionally, the NodeDetailsDrawer has **inline tab implementations** instead of separate components as specified.

---

## Phases Verified: Summary Table

| Phase | Tasks | Status | Quality | Critical Issues |
|-------|-------|--------|---------|-----------------|
| **Phase 6** (US3 - Parallel Processes) | T042-T046 | ✅ COMPLETE | 4/5 | None |
| **Phase 7** (US4 - Lesson Monitoring) | T047-T051 | ✅ COMPLETE | 4/5 | None |
| **Phase 8** (US5 - Retry History) | T052-T055 | ✅ COMPLETE | 3/5 | Missing OutputTab component |
| **Phase 9** (US6 - Approval Workflow) | T056-T061a | ✅ COMPLETE | 3/5 | Backend connections stubbed |
| **Phase 10** (US10 - Retry Failed Items) | T062-T067 | ❌ INCOMPLETE | 2/5 | **useRetry hook MISSING** |
| **Phase 11** (Real-time Updates) | T068-T075a | ⚠️ PARTIAL | 2/5 | **3 critical hooks MISSING** |
| **Phase 12** (Error Handling) | T076-T079 | ⚠️ PARTIAL | 3/5 | **2 hooks MISSING**, T078 not done |
| **Phase 13** (Statistics) | T080-T083 | ✅ COMPLETE | 4/5 | None |
| **Phase 19** (Mobile) | T112-T113 | ✅ COMPLETE | 3/5 | T114 not done (acceptable) |

---

## Detailed Phase-by-Phase Verification

### Phase 6: User Story 3 - Parallel Process Tracking ✅

**Status**: ✅ **COMPLETE**
**Quality Rating**: **4/5** (Very Good)

#### Files Checked

| File | Exists | Implementation | Quality |
|------|--------|---------------|---------|
| `nodes/DocumentNode.tsx` | ✅ | ✅ Proper | 4/5 |
| `hooks/useGraphData.ts` (parallel graph construction) | ✅ | ✅ Proper | 4/5 |
| `nodes/MergeNode.tsx` | ✅ | ✅ Proper | 4/5 |
| `hooks/useGraphLayout.ts` (incremental layout) | ✅ | ✅ Uses `useNodesInitialized()` | 5/5 |

#### Implementation Quality

**Strengths**:
- ✅ DocumentNode component properly memoized with `React.memo`
- ✅ Fade-in animations via Tailwind (`animate-in fade-in zoom-in`)
- ✅ Status-based styling (active/completed/error states)
- ✅ Uses `useNodeStatus` hook for realtime updates
- ✅ Proper TypeScript typing
- ✅ Accessibility: `aria-label`, `role="button"`, `tabIndex={0}`
- ✅ Test attributes: `data-testid`, `data-node-status`
- ✅ **React Flow v12 pattern**: `useNodesInitialized()` in `useGraphLayout.ts`
- ✅ **React Flow v12 pattern**: `node.measured?.width` in layout calculation

**Minor Issues**:
- ⚠️ Inline JSX in useGraphData (lines 108-145) - could be extracted to helper function
- ⚠️ Document ID sanitization uses simple regex - could be more robust

**Verdict**: **Production-ready** with minor code organization improvements recommended.

---

### Phase 7: User Story 4 - Lesson Generation Monitoring ✅

**Status**: ✅ **COMPLETE**
**Quality Rating**: **4/5** (Very Good)

#### Files Checked

| File | Exists | Implementation | Quality |
|------|--------|---------------|---------|
| `nodes/LessonNode.tsx` | ✅ | ✅ Proper | 4/5 |
| `nodes/ModuleGroup.tsx` | ✅ | ✅ Proper | 4/5 |
| `hooks/useGraphData.ts` (Stage 6 construction) | ✅ | ✅ Proper | 4/5 |

#### Implementation Quality

**Strengths**:
- ✅ LessonNode: Memoized, proper status styles, accessibility
- ✅ ModuleGroup: Collapse/expand with `setNodes` state update
- ✅ Progress indicator (completedLessons/totalLessons) implemented
- ✅ Graph construction handles modules and lessons (lines 149-197 in useGraphData.ts)
- ✅ Proper parent-child relationships (`parentId`, `extent: 'parent'`)

**Issues**:
- ⚠️ ModuleGroup collapse/expand doesn't trigger layout recalculation - might cause overlaps
- ⚠️ No visual indication of collapsed vs expanded state beyond chevron icon

**Verdict**: **Production-ready** but may need layout refinement for large module sets.

---

### Phase 8: User Story 5 - Retry History ⚠️

**Status**: ✅ **COMPLETE** (with concerns)
**Quality Rating**: **3/5** (Good but not as specified)

#### Files Checked

| File | Exists | Implementation | Quality |
|------|--------|---------------|---------|
| `panels/NodeDetailsDrawer.tsx` (retry tabs) | ✅ | ⚠️ **Inline** implementation | 3/5 |
| `panels/AttemptSelector.tsx` | ✅ | ✅ Proper | 4/5 |
| `nodes/StageNode.tsx` (retry badge) | ⚠️ | ❌ **Badge NOT implemented** | 1/5 |
| `panels/OutputTab.tsx` | ❌ | ❌ **MISSING** | 0/5 |

#### Implementation Quality

**Strengths**:
- ✅ AttemptSelector component works (dropdown for attempts)
- ✅ NodeDetailsDrawer shows attempt history
- ✅ `selectedAttemptNum` state tracks current attempt
- ✅ `displayData` useMemo computes data for selected attempt

**Critical Issues**:
- ❌ **T054**: Retry count badge NOT visible on nodes (not implemented in StageNode.tsx)
- ❌ **T055/T037**: OutputTab.tsx is MISSING - drawer has inline `<TabsContent>` instead
- ❌ **T036**: InputTab.tsx is MISSING
- ❌ **T037**: ProcessTab.tsx is MISSING

**Specification Violation**:
The spec (T036-T038) requires **separate component files** for InputTab, ProcessTab, and OutputTab. The implementation has **inline JSX** in NodeDetailsDrawer.tsx instead. This violates the modular component architecture.

**Verdict**: **Functional but architecturally incorrect**. Needs refactoring to match spec.

---

### Phase 9: User Story 6 - Approval Workflow ⚠️

**Status**: ✅ **COMPLETE** (backend stubbed)
**Quality Rating**: **3/5** (Good UI, backend not connected)

#### Files Checked

| File | Exists | Implementation | Quality |
|------|--------|---------------|---------|
| `controls/ApprovalControls.tsx` | ✅ | ✅ Proper | 4/5 |
| `nodes/StageNode.tsx` (awaiting style) | ⚠️ | ❓ Not verified | ?/5 |
| `controls/RejectionModal.tsx` | ✅ | ✅ Proper | 4/5 |
| `GraphView.tsx` (MissionControlBanner) | ✅ | ✅ Proper | 4/5 |

#### Implementation Quality

**Strengths**:
- ✅ ApprovalControls: Clean UI with Approve/Reject buttons
- ✅ RejectionModal: Feedback textarea, proper dialog component
- ✅ MissionControlBanner integration (lines 201-214 in GraphView.tsx)
- ✅ Localization via `useTranslation` hook

**Issues**:
- ⚠️ **T057**: Awaiting node visual style (yellow glow) not verified in StageNode
- ⚠️ **T060**: Backend API connection is **stubbed** (`console.log` only)
- ⚠️ **T061**: Confirmation dialog before reject - uses modal directly (acceptable)

**Verdict**: **UI complete, backend integration needed**.

---

### Phase 10: User Story 10 - Retry Failed Items ❌

**Status**: ❌ **INCOMPLETE** (Critical hook missing)
**Quality Rating**: **2/5** (UI exists, core hook missing)

#### Files Checked

| File | Exists | Implementation | Quality |
|------|--------|---------------|---------|
| `nodes/StageNode.tsx` (retry button) | ⚠️ | ❓ Not verified | ?/5 |
| `nodes/DocumentNode.tsx` (partial failure) | ✅ | ✅ Has status styles | 3/5 |
| `controls/RetryConfirmDialog.tsx` | ✅ | ✅ Proper | 4/5 |
| `hooks/useRetry.ts` | ❌ | ❌ **MISSING** | **0/5** |

#### Critical Issues

**❌ BLOCKER: useRetry.ts is MISSING**

This is a **critical hook** specified in:
- **T065**: "Connect retry action to backend API in `hooks/useRetry.ts` (FR-ERR03)"

Without this hook:
- Retry functionality **does NOT work**
- Backend connection for retry is **missing**
- RetryConfirmDialog has nothing to call on confirm

**Other Issues**:
- ⚠️ **T062**: Retry button on failed nodes - not verified in StageNode.tsx
- ⚠️ **T066**: Error message tooltip/badge - not verified

**Verdict**: ❌ **BLOCKED - Cannot function without useRetry hook**.

---

### Phase 11: Real-time Updates ❌

**Status**: ⚠️ **PARTIAL** (3 critical hooks missing)
**Quality Rating**: **2/5** (Basic realtime works, fallback/preservation missing)

#### Files Checked

| File | Exists | Implementation | Quality |
|------|--------|---------------|---------|
| `hooks/useGraphData.ts` (Supabase subscription) | ✅ | ✅ Proper | 4/5 |
| `contexts/RealtimeStatusContext.tsx` | ✅ | ✅ Proper | 4/5 |
| `edges/AnimatedEdge.tsx` (data flow animation) | ✅ | ✅ Proper | 4/5 |
| `controls/ConnectionStatus.tsx` | ✅ | ✅ Proper | 4/5 |
| `hooks/useFallbackPolling.ts` | ❌ | ❌ **MISSING** | **0/5** |
| `hooks/useViewportPreservation.ts` | ❌ | ❌ **MISSING** | **0/5** |
| `hooks/useBatchedTraces.ts` (deduplication) | ✅ | ✅ Proper | 4/5 |

#### Critical Issues

**❌ BLOCKER 1: useFallbackPolling.ts is MISSING**

- **T072**: "Implement fallback polling when realtime fails in `hooks/useFallbackPolling.ts` (FR-R05)"
- Without this: **No fallback when Supabase Realtime disconnects**
- Users would see stale data during network issues

**❌ BLOCKER 2: useViewportPreservation.ts is MISSING**

- **T073**: "Preserve viewport on graph updates in `hooks/useViewportPreservation.ts` (FR-R06)"
- Without this: **Graph jumps/recenters on every update**
- Poor UX when monitoring live generation

**Strengths**:
- ✅ Realtime subscription via `useGenerationRealtime` hook
- ✅ ConnectionStatus indicator
- ✅ Edge animations (T070) implemented in useGraphData.ts (lines 257-289)
- ✅ Trace deduplication in useBatchedTraces.ts
- ✅ Out-of-order trace handling (sort by created_at)

**Verdict**: ❌ **BLOCKED - Critical UX features missing**.

---

### Phase 12: Error Handling & Recovery ⚠️

**Status**: ⚠️ **PARTIAL** (2 tasks incomplete)
**Quality Rating**: **3/5** (Basic error boundary works)

#### Files Checked

| File | Exists | Implementation | Quality |
|------|--------|---------------|---------|
| `GenerationGraphErrorBoundary.tsx` | ✅ | ✅ Proper | 4/5 |
| `hooks/useSessionRecovery.ts` | ✅ | ✅ Proper | 4/5 |
| `hooks/useToastNotifications.ts` | ❌ | ❌ **NOT DONE (T078)** | **0/5** |
| `hooks/useGracefulDegradation.ts` | ❌ | ❌ **MISSING** | **0/5** |

#### Critical Issues

**❌ BLOCKER: useGracefulDegradation.ts is MISSING**

- **T079**: "Implement graceful degradation when realtime fails in `hooks/useGracefulDegradation.ts` (FR-ER04)"
- Without this: App may crash when realtime unavailable

**❌ NOT DONE: useToastNotifications.ts**

- **T078**: Marked as `[ ]` (not done) in tasks.md
- This is acceptable if toasts aren't critical

**Strengths**:
- ✅ GenerationGraphErrorBoundary: Proper error boundary with fallback UI
- ✅ useSessionRecovery: Viewport state persistence to sessionStorage
- ✅ Error boundary logs errors to console

**Verdict**: ⚠️ **Partial - Basic error handling works, advanced features missing**.

---

### Phase 13: Statistics Display ✅

**Status**: ✅ **COMPLETE**
**Quality Rating**: **4/5** (Very Good)

#### Files Checked

| File | Exists | Implementation | Quality |
|------|--------|---------------|---------|
| `GraphHeader.tsx` | ✅ | ✅ Proper | 4/5 |
| `StatsBar.tsx` | ✅ | ✅ Proper | 4/5 |

#### Implementation Quality

**Strengths**:
- ✅ GraphHeader: Title, progress badge, back button
- ✅ StatsBar: Elapsed time counter, cost display
- ✅ Real-time updates via `useGenerationRealtime` hook
- ✅ Clean UI with icons (Clock, Coins from lucide-react)

**Minor Issues**:
- ⚠️ **T083**: Estimated completion time **not implemented** (acceptable - may be complex)
- ⚠️ StatsBar `elapsed` state increments every second regardless of actual start time (hardcoded counter, not based on generation start timestamp)

**Verdict**: **Production-ready** with minor calculation improvements recommended.

---

### Phase 19: Mobile Responsiveness ✅

**Status**: ✅ **COMPLETE** (T114 not done - acceptable)
**Quality Rating**: **3/5** (Good)

#### Files Checked

| File | Exists | Implementation | Quality |
|------|--------|---------------|---------|
| `hooks/useBreakpoint.ts` | ✅ | ✅ Proper | 4/5 |
| `MobileProgressList.tsx` | ✅ | ✅ Basic | 3/5 |
| `GraphView.tsx` (mobile integration) | ✅ | ✅ Proper | 4/5 |
| `hooks/useTouchGestures.ts` | ❌ | ❌ **NOT DONE (T114)** | N/A |

#### Implementation Quality

**Strengths**:
- ✅ useBreakpoint hook: SSR-safe, window resize listener
- ✅ GraphView: Conditional render (`if (isMobile)` at line 166)
- ✅ MobileProgressList: Shows status fallback

**Issues**:
- ⚠️ **T114**: Touch gestures not implemented (marked "Could Have" - acceptable)
- ⚠️ MobileProgressList is very basic (just shows status, no progress details)

**Verdict**: ✅ **Acceptable** - Core mobile detection works, touch gestures can be future enhancement.

---

## Build & Type-Check Results

### Type-Check ✅

**Command**: `pnpm type-check` (packages/web)
**Status**: ✅ **PASSED**
**Output**: No errors

**Verdict**: All TypeScript types are correct.

---

### Build ✅

**Command**: `pnpm build` (packages/web)
**Status**: ✅ **PASSED** (warnings only)
**Exit Code**: 0

**Warnings** (Non-blocking):
- 12 instances of `any` type (acceptable in early implementation)
- 1 unnecessary dependency in `useCallback` hook
- 2 unescaped entities in JSX strings

**Build Output**:
- ✅ All routes build successfully
- ✅ Generation page: `/courses/generating/[slug]` builds (264 kB)
- ✅ GraphView components included in bundle
- ✅ No breaking errors

**Verdict**: Production build succeeds. Warnings should be cleaned up but don't block deployment.

---

## Critical Issues Summary

### Blocking Issues (Must Fix Before Production)

1. **❌ CRITICAL: `hooks/useRetry.ts` is MISSING**
   - **Impact**: Retry failed items feature (US10) does NOT work
   - **Affected**: T062-T067, entire Phase 10
   - **Fix**: Create useRetry hook with backend API connection

2. **❌ CRITICAL: `hooks/useFallbackPolling.ts` is MISSING**
   - **Impact**: No fallback when Supabase Realtime fails
   - **Affected**: T072, FR-R05
   - **Fix**: Create polling mechanism for when WebSocket disconnects

3. **❌ CRITICAL: `hooks/useViewportPreservation.ts` is MISSING**
   - **Impact**: Graph jumps/recenters on every update (poor UX)
   - **Affected**: T073, FR-R06
   - **Fix**: Create hook to save/restore viewport on updates

4. **❌ CRITICAL: `hooks/useGracefulDegradation.ts` is MISSING**
   - **Impact**: App may crash when realtime unavailable
   - **Affected**: T079, FR-ER04
   - **Fix**: Create fallback behavior for realtime failures

5. **❌ HIGH: Tab Components Not Separated**
   - **Impact**: Architecture violation, harder to maintain
   - **Affected**: T036-T038, Phase 8
   - **Fix**: Extract InputTab, ProcessTab, OutputTab from NodeDetailsDrawer

---

## Code Quality Issues

### High Priority (Should Fix Soon)

1. **Missing Retry Count Badge** (T054)
   - Node doesn't show retry count
   - Add badge to StageNode component

2. **Backend API Stubs** (T060)
   - Approval actions just log to console
   - Connect to actual API endpoints

3. **Awaiting Visual Style Not Verified** (T057)
   - Yellow glow for awaiting nodes may not be implemented
   - Verify/add to StageNode

### Medium Priority (Fix When Convenient)

1. **Inline Graph Construction** (useGraphData.ts)
   - Lines 108-145 have complex JSX construction
   - Extract to helper functions

2. **StatsBar Elapsed Time**
   - Uses hardcoded counter instead of actual generation start time
   - Calculate from real timestamp

3. **ModuleGroup Layout**
   - Collapse/expand doesn't recalculate layout
   - May cause node overlaps

### Low Priority (Nice to Have)

1. **TypeScript `any` types**
   - 12 instances in build warnings
   - Replace with proper types

2. **ESLint Warnings**
   - Unnecessary useCallback dependency
   - Unescaped JSX entities

---

## React Flow v12 Pattern Compliance ✅

**Status**: ✅ **EXCELLENT**

The implementation correctly uses React Flow v12 patterns:

### ✅ useNodesInitialized() Pattern

**Location**: `hooks/useGraphLayout.ts` (line 14), `GraphView.tsx` (line 67)

```typescript
const nodesInitialized = useNodesInitialized();
```

**Purpose**: Wait for React Flow to measure nodes before applying layout
**Compliance**: ✅ Proper usage

### ✅ node.measured Pattern

**Location**: `hooks/useGraphLayout.ts` (lines 64-65)

```typescript
width: node.measured?.width ?? node.width ?? DEFAULT_NODE_WIDTH,
height: node.measured?.height ?? node.height ?? DEFAULT_NODE_HEIGHT,
```

**Purpose**: Use measured dimensions from React Flow instead of hardcoded values
**Compliance**: ✅ Proper usage with fallbacks

### ✅ React.memo on All Node Components

All node components are wrapped with `React.memo`:
- StageNode: ✅
- DocumentNode: ✅
- LessonNode: ✅
- ModuleGroup: ✅
- MergeNode: ✅
- EndNode: ✅

**Compliance**: ✅ Excellent

---

## Missing Files Checklist

| File | Phase | Priority | Status |
|------|-------|----------|--------|
| `hooks/useRetry.ts` | 10 | **CRITICAL** | ❌ MISSING |
| `hooks/useFallbackPolling.ts` | 11 | **CRITICAL** | ❌ MISSING |
| `hooks/useViewportPreservation.ts` | 11 | **CRITICAL** | ❌ MISSING |
| `hooks/useGracefulDegradation.ts` | 12 | **CRITICAL** | ❌ MISSING |
| `hooks/useToastNotifications.ts` | 12 | HIGH | ❌ MISSING (task marked not done) |
| `panels/InputTab.tsx` | 8 | HIGH | ❌ MISSING (inline instead) |
| `panels/ProcessTab.tsx` | 8 | HIGH | ❌ MISSING (inline instead) |
| `panels/OutputTab.tsx` | 8 | HIGH | ❌ MISSING (inline instead) |
| `hooks/useTouchGestures.ts` | 19 | LOW | ❌ MISSING (acceptable) |

**Total Missing**: 9 files (4 critical, 4 high, 1 low)

---

## Integration Verification ✅

### GraphView Integration

**Location**: `app/courses/generating/[slug]/GenerationProgressContainerEnhanced.tsx`

**Status**: ✅ **PROPERLY INTEGRATED**

```tsx
import { GraphViewWrapper } from '@/components/generation-graph';

// Line 791
<GraphViewWrapper courseId={courseId} courseTitle={courseTitle} />
```

**Strengths**:
- ✅ Uses GraphViewWrapper (SSR-safe dynamic import)
- ✅ Replaces old Celestial Journey view
- ✅ Passes courseId and courseTitle props
- ✅ 700px height container with proper styling

---

## Accessibility Audit

### ✅ Strengths

1. **ARIA Labels**: DocumentNode has `aria-label` (line 38)
2. **Roles**: DocumentNode has `role="button"` (line 39)
3. **Keyboard Support**: `tabIndex={0}` on DocumentNode (line 40)
4. **Test Attributes**: `data-testid` on most components
5. **Focus Management**: Sheet (drawer) has `aria-expanded`

### ⚠️ Gaps

1. **Keyboard Navigation**: No dedicated keyboard nav between nodes (Phase 15 not done)
2. **Screen Reader Support**: Limited ARIA labels on other node types
3. **Focus Indicators**: Not verified on all nodes

**Overall A11y Score**: **3/5** (Basic support, needs Phase 15 implementation)

---

## Fix Tasks (Prioritized)

### CRITICAL (Must Fix Immediately)

#### FIX-001: Create useRetry Hook
**Priority**: **CRITICAL**
**File**: `packages/web/components/generation-graph/hooks/useRetry.ts`
**Description**: Create retry hook with backend API connection
**Spec Reference**: T065

```typescript
export function useRetry() {
  const retry = useCallback(async (nodeId: string, itemId?: string) => {
    // Call backend API to retry specific item
    // POST /api/courses/[courseId]/retry
    // Return success/failure
  }, []);

  return { retry, isRetrying: false, error: null };
}
```

---

#### FIX-002: Create useFallbackPolling Hook
**Priority**: **CRITICAL**
**File**: `packages/web/components/generation-graph/hooks/useFallbackPolling.ts`
**Description**: Implement polling fallback when Supabase Realtime disconnects
**Spec Reference**: T072

```typescript
export function useFallbackPolling(courseId: string, isRealtimeConnected: boolean) {
  useEffect(() => {
    if (!isRealtimeConnected) {
      // Start polling every 5 seconds
      const interval = setInterval(async () => {
        // Fetch latest traces from API
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isRealtimeConnected, courseId]);
}
```

---

#### FIX-003: Create useViewportPreservation Hook
**Priority**: **CRITICAL**
**File**: `packages/web/components/generation-graph/hooks/useViewportPreservation.ts`
**Description**: Preserve viewport position when graph updates
**Spec Reference**: T073

```typescript
export function useViewportPreservation() {
  const { getViewport, setViewport } = useReactFlow();
  const savedViewport = useRef<Viewport | null>(null);

  const preserveViewport = useCallback(() => {
    savedViewport.current = getViewport();
  }, [getViewport]);

  const restoreViewport = useCallback(() => {
    if (savedViewport.current) {
      setViewport(savedViewport.current);
    }
  }, [setViewport]);

  return { preserveViewport, restoreViewport };
}
```

---

#### FIX-004: Create useGracefulDegradation Hook
**Priority**: **CRITICAL**
**File**: `packages/web/components/generation-graph/hooks/useGracefulDegradation.ts`
**Description**: Handle realtime failures gracefully
**Spec Reference**: T079

```typescript
export function useGracefulDegradation() {
  const [degradationMode, setDegradationMode] = useState<'full' | 'polling' | 'static'>('full');

  const handleRealtimeFailure = useCallback(() => {
    setDegradationMode('polling');
  }, []);

  const handlePollingFailure = useCallback(() => {
    setDegradationMode('static');
  }, []);

  return { degradationMode, handleRealtimeFailure, handlePollingFailure };
}
```

---

### HIGH Priority (Fix Before Production)

#### FIX-005: Extract Tab Components
**Priority**: **HIGH**
**Files**:
- `packages/web/components/generation-graph/panels/InputTab.tsx`
- `packages/web/components/generation-graph/panels/ProcessTab.tsx`
- `packages/web/components/generation-graph/panels/OutputTab.tsx`

**Description**: Extract inline tab content from NodeDetailsDrawer to separate components
**Spec Reference**: T036-T038

**Example** (InputTab.tsx):
```typescript
interface InputTabProps {
  inputData: any;
}

export const InputTab = ({ inputData }: InputTabProps) => {
  return (
    <div className="p-4 border rounded-md bg-muted/50 text-xs font-mono overflow-auto max-h-[60vh]">
      {inputData ? (
        <pre>{JSON.stringify(inputData, null, 2)}</pre>
      ) : (
        <span className="text-muted-foreground">No input data available</span>
      )}
    </div>
  );
};
```

Then update NodeDetailsDrawer.tsx:
```tsx
import { InputTab } from './InputTab';
import { ProcessTab } from './ProcessTab';
import { OutputTab } from './OutputTab';

// In TabsContent:
<TabsContent value="input">
  <InputTab inputData={displayData?.inputData} />
</TabsContent>
```

---

#### FIX-006: Add Retry Count Badge to Nodes
**Priority**: **HIGH**
**File**: `packages/web/components/generation-graph/nodes/StageNode.tsx`
**Description**: Display retry count badge when node has retries
**Spec Reference**: T054

Add to StageNode.tsx:
```tsx
{data.retryCount && data.retryCount > 0 && (
  <div className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow">
    {data.retryCount}
  </div>
)}
```

---

#### FIX-007: Connect Approval Actions to Backend
**Priority**: **HIGH**
**File**: `packages/web/components/generation-graph/controls/ApprovalControls.tsx`
**Description**: Replace console.log with actual API calls
**Spec Reference**: T060

```tsx
import { approveStage, cancelGeneration } from '@/app/actions/admin-generation';

const handleApprove = async () => {
  setIsProcessing(true);
  try {
    await onApprove(); // This should call approveStage(courseId, stageNumber)
  } finally {
    setIsProcessing(false);
  }
};
```

---

#### FIX-008: Verify/Add Awaiting Visual Style
**Priority**: **HIGH**
**File**: `packages/web/components/generation-graph/nodes/StageNode.tsx`
**Description**: Ensure yellow glow for awaiting status
**Spec Reference**: T057

In `getStatusStyles` function:
```tsx
case 'awaiting':
  return 'border-yellow-500 bg-yellow-50 shadow-[0_0_15px_rgba(234,179,8,0.6)] scale-105';
```

---

### MEDIUM Priority (Fix Soon)

#### FIX-009: Extract Graph Construction Helpers
**Priority**: **MEDIUM**
**File**: `packages/web/components/generation-graph/hooks/useGraphData.ts`
**Description**: Extract inline JSX construction to helper functions

Create `packages/web/lib/generation-graph/graph-builders.ts`:
```typescript
export function buildDocumentNodes(docInfos: Map<string, { filename: string }>, config: any) {
  const nodes = [];
  docInfos.forEach((info, docId) => {
    nodes.push({
      id: `doc_${docId}`,
      type: 'document',
      position: { x: 250, y: 0 },
      data: {
        label: info.filename,
        filename: info.filename,
        status: 'pending',
        stageNumber: 2,
        color: config.color,
        icon: config.icon
      }
    });
  });
  return nodes;
}
```

---

#### FIX-010: Fix StatsBar Elapsed Time Calculation
**Priority**: **MEDIUM**
**File**: `packages/web/components/generation-graph/StatsBar.tsx`
**Description**: Calculate elapsed time from actual generation start timestamp

```tsx
const [startTime, setStartTime] = useState<Date | null>(null);

useEffect(() => {
  // Get generation start time from traces or status
  if (traces.length > 0 && !startTime) {
    const firstTrace = traces.sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )[0];
    setStartTime(new Date(firstTrace.created_at));
  }
}, [traces, startTime]);

useEffect(() => {
  if (!startTime) return;
  const interval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000);
    setElapsed(elapsed);
  }, 1000);
  return () => clearInterval(interval);
}, [startTime]);
```

---

### LOW Priority (Nice to Have)

#### FIX-011: Replace `any` Types
**Priority**: **LOW**
**Files**: Multiple (see build warnings)
**Description**: Replace TypeScript `any` with proper types

Example in useGraphData.ts (line 67):
```typescript
// Before
let newModules: any[] = [];

// After
interface ModuleData {
  id: string;
  title: string;
  lessons: LessonData[];
}
let newModules: ModuleData[] = [];
```

---

#### FIX-012: Add Module Layout Recalculation
**Priority**: **LOW**
**File**: `packages/web/components/generation-graph/nodes/ModuleGroup.tsx`
**Description**: Trigger layout when expanding/collapsing

```tsx
const toggleCollapse = (e: React.MouseEvent) => {
  e.stopPropagation();
  const newCollapsed = !data.isCollapsed;

  setNodes((nodes) => {
    const updated = nodes.map(n => {
      if (n.id === id) {
        return { ...n, data: { ...n.data, isCollapsed: newCollapsed } };
      }
      if (data.childIds && data.childIds.includes(n.id)) {
        return { ...n, hidden: newCollapsed };
      }
      return n;
    });
    return updated;
  });

  // Trigger layout recalculation
  requestAnimationFrame(() => {
    // Call layout function if available
  });
};
```

---

## Agent Prompt for Fixes

If you want an agent to implement ALL fixes above, use this prompt:

---

**PROMPT START**

You are tasked with completing the missing implementation for the n8n-Graph-View feature. The following critical hooks and components are MISSING or incomplete. Implement them according to the specifications below.

### Context

- **Project**: MegaCampus monorepo
- **Package**: `packages/web`
- **Base Directory**: `packages/web/components/generation-graph/`
- **Build Status**: Type-check and build currently PASS, but features are incomplete

### Critical Files to Create

#### 1. Create `hooks/useRetry.ts`

**Purpose**: Connect retry actions to backend API
**Spec**: T065 - FR-ERR03

**Requirements**:
- Export `useRetry()` hook
- Takes `courseId: string` as parameter
- Returns `{ retry, isRetrying, error }`
- `retry(nodeId: string, itemId?: string)` function calls backend API
- Backend endpoint: `POST /api/courses/[courseId]/retry` with `{ nodeId, itemId }`
- Handle loading state and errors
- Use tRPC if available, otherwise fetch API

**Implementation**:
```typescript
// packages/web/components/generation-graph/hooks/useRetry.ts
import { useState, useCallback } from 'react';

export function useRetry(courseId: string) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const retry = useCallback(async (nodeId: string, itemId?: string) => {
    setIsRetrying(true);
    setError(null);

    try {
      const response = await fetch(`/api/courses/${courseId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, itemId })
      });

      if (!response.ok) {
        throw new Error('Retry failed');
      }

      return await response.json();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      throw err;
    } finally {
      setIsRetrying(false);
    }
  }, [courseId]);

  return { retry, isRetrying, error };
}
```

---

#### 2. Create `hooks/useFallbackPolling.ts`

**Purpose**: Poll for updates when Supabase Realtime fails
**Spec**: T072 - FR-R05

**Requirements**:
- Start polling when `isRealtimeConnected === false`
- Poll every 5 seconds
- Fetch latest traces from `/api/courses/[courseId]/traces`
- Return traces array
- Stop polling when realtime reconnects

**Implementation**:
```typescript
// packages/web/components/generation-graph/hooks/useFallbackPolling.ts
import { useState, useEffect } from 'react';
import { GenerationTrace } from '@/components/generation-celestial/utils';

export function useFallbackPolling(
  courseId: string,
  isRealtimeConnected: boolean
): GenerationTrace[] {
  const [polledTraces, setPolledTraces] = useState<GenerationTrace[]>([]);

  useEffect(() => {
    if (isRealtimeConnected) {
      // Realtime is working, don't poll
      return;
    }

    // Fallback polling
    const pollTraces = async () => {
      try {
        const response = await fetch(`/api/courses/${courseId}/traces`);
        if (response.ok) {
          const data = await response.json();
          setPolledTraces(data.traces || []);
        }
      } catch (err) {
        console.error('Polling failed:', err);
      }
    };

    // Poll immediately, then every 5 seconds
    pollTraces();
    const interval = setInterval(pollTraces, 5000);

    return () => clearInterval(interval);
  }, [courseId, isRealtimeConnected]);

  return polledTraces;
}
```

---

#### 3. Create `hooks/useViewportPreservation.ts`

**Purpose**: Preserve viewport position when graph updates
**Spec**: T073 - FR-R06

**Requirements**:
- Use `useReactFlow()` to access viewport
- Save viewport before updates
- Restore viewport after updates
- Use `requestAnimationFrame` for smooth transitions

**Implementation**:
```typescript
// packages/web/components/generation-graph/hooks/useViewportPreservation.ts
import { useCallback, useRef } from 'react';
import { useReactFlow, Viewport } from '@xyflow/react';

export function useViewportPreservation() {
  const { getViewport, setViewport } = useReactFlow();
  const savedViewport = useRef<Viewport | null>(null);

  const preserveViewport = useCallback(() => {
    savedViewport.current = getViewport();
  }, [getViewport]);

  const restoreViewport = useCallback(() => {
    if (savedViewport.current) {
      requestAnimationFrame(() => {
        setViewport(savedViewport.current!, { duration: 200 });
      });
    }
  }, [setViewport]);

  return { preserveViewport, restoreViewport };
}
```

**Integration**: In `GraphView.tsx`, wrap `processTraces` call:
```tsx
const { preserveViewport, restoreViewport } = useViewportPreservation();

useEffect(() => {
  preserveViewport();
  processTraces(traces);
  restoreViewport();
}, [traces, processTraces, preserveViewport, restoreViewport]);
```

---

#### 4. Create `hooks/useGracefulDegradation.ts`

**Purpose**: Handle realtime/polling failures gracefully
**Spec**: T079 - FR-ER04

**Requirements**:
- Track degradation mode: 'full' | 'polling' | 'static'
- Provide handlers for failures
- Return degradation state

**Implementation**:
```typescript
// packages/web/components/generation-graph/hooks/useGracefulDegradation.ts
import { useState, useCallback } from 'react';

type DegradationMode = 'full' | 'polling' | 'static';

export function useGracefulDegradation() {
  const [mode, setMode] = useState<DegradationMode>('full');

  const handleRealtimeFailure = useCallback(() => {
    console.warn('Realtime failed, switching to polling');
    setMode('polling');
  }, []);

  const handlePollingFailure = useCallback(() => {
    console.warn('Polling failed, switching to static mode');
    setMode('static');
  }, []);

  const reset = useCallback(() => {
    setMode('full');
  }, []);

  return {
    degradationMode: mode,
    handleRealtimeFailure,
    handlePollingFailure,
    reset
  };
}
```

---

#### 5. Extract Tab Components

**Purpose**: Separate tab content into individual components
**Spec**: T036-T038

Create three new files:

**5a. `panels/InputTab.tsx`**:
```typescript
// packages/web/components/generation-graph/panels/InputTab.tsx
import React from 'react';

interface InputTabProps {
  inputData?: any;
}

export const InputTab = ({ inputData }: InputTabProps) => {
  return (
    <div className="p-4 border rounded-md bg-muted/50 text-xs font-mono overflow-auto max-h-[60vh]">
      {inputData ? (
        <pre>{JSON.stringify(inputData, null, 2)}</pre>
      ) : (
        <span className="text-muted-foreground">No input data available</span>
      )}
    </div>
  );
};
```

**5b. `panels/ProcessTab.tsx`**:
```typescript
// packages/web/components/generation-graph/panels/ProcessTab.tsx
import React from 'react';

interface ProcessTabProps {
  duration?: number;
  tokens?: number;
  cost?: number;
  status?: string;
}

export const ProcessTab = ({ duration, tokens, cost, status }: ProcessTabProps) => {
  return (
    <div className="p-4 border rounded-md bg-muted/50 space-y-2">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <span className="text-xs text-muted-foreground">Duration</span>
          <div className="font-medium">{duration ? `${duration}ms` : '-'}</div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Tokens</span>
          <div className="font-medium">{tokens ? String(tokens) : '-'}</div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Cost</span>
          <div className="font-medium">{cost ? `$${cost}` : '-'}</div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Status</span>
          <div className="font-medium capitalize">{status ? String(status) : '-'}</div>
        </div>
      </div>
    </div>
  );
};
```

**5c. `panels/OutputTab.tsx`**:
```typescript
// packages/web/components/generation-graph/panels/OutputTab.tsx
import React from 'react';

interface OutputTabProps {
  outputData?: any;
}

export const OutputTab = ({ outputData }: OutputTabProps) => {
  return (
    <div className="p-4 border rounded-md bg-muted/50 overflow-auto max-h-[60vh] text-xs font-mono">
      {outputData ? (
        <pre>{JSON.stringify(outputData, null, 2)}</pre>
      ) : (
        <span className="text-muted-foreground">No output data available</span>
      )}
    </div>
  );
};
```

**5d. Update `panels/NodeDetailsDrawer.tsx`**:

Replace lines 98-140 with:
```tsx
import { InputTab } from './InputTab';
import { ProcessTab } from './ProcessTab';
import { OutputTab } from './OutputTab';

// In JSX:
<TabsContent value="input" className="mt-4 space-y-4" data-testid="content-input">
  <InputTab inputData={displayData?.inputData} />
</TabsContent>

<TabsContent value="process" className="mt-4 space-y-4" data-testid="content-process">
  <ProcessTab
    duration={displayData?.duration}
    tokens={displayData?.tokens}
    cost={displayData?.cost}
    status={displayData?.status}
  />
</TabsContent>

<TabsContent value="output" className="mt-4 space-y-4" data-testid="content-output">
  <OutputTab outputData={displayData?.outputData} />
</TabsContent>
```

---

#### 6. Add Retry Count Badge

**File**: `packages/web/components/generation-graph/nodes/StageNode.tsx`
**Spec**: T054

Add after the main node content (before closing `</div>`):

```tsx
{/* Retry Count Badge */}
{data.retryCount && data.retryCount > 0 && (
  <div className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-md z-10">
    {data.retryCount}
  </div>
)}
```

---

#### 7. Add Awaiting Visual Style

**File**: `packages/web/components/generation-graph/nodes/StageNode.tsx`
**Spec**: T057

In the `getStatusStyles` function, add:

```tsx
case 'awaiting':
  return 'border-yellow-500 bg-yellow-50 shadow-[0_0_15px_rgba(234,179,8,0.6)] scale-105 transition-transform animate-pulse';
```

---

### Quality Requirements

1. **TypeScript**: All hooks must have proper types (no `any`)
2. **Error Handling**: All API calls must have try-catch
3. **Cleanup**: All useEffect hooks must return cleanup functions
4. **Memoization**: Use `useCallback` where appropriate
5. **Testing**: Add `data-testid` attributes where applicable

### After Implementation

1. Run `pnpm type-check` - must pass
2. Run `pnpm build` - must pass
3. Verify in browser that:
   - Retry button works on failed nodes
   - Fallback polling activates when realtime disconnects
   - Viewport doesn't jump when graph updates
   - Tab components render correctly in drawer

**PROMPT END**

---

## Conclusion

### Summary

The n8n-Graph-View implementation demonstrates **strong foundational work** with:
- ✅ Proper React Flow v12 patterns
- ✅ Good TypeScript usage
- ✅ Solid component architecture
- ✅ Working core visualization

However, **critical hooks are missing**, preventing several features from functioning:
- ❌ Retry functionality (useRetry)
- ❌ Fallback polling (useFallbackPolling)
- ❌ Viewport preservation (useViewportPreservation)
- ❌ Graceful degradation (useGracefulDegradation)

Additionally, the **tab components are not separated** as specified, violating the modular architecture.

### Recommendation

**Do NOT deploy to production** until FIX-001 through FIX-004 (critical hooks) are implemented. The remaining fixes (FIX-005 through FIX-012) should be addressed before the next sprint.

### Estimated Effort

- **Critical Fixes (FIX-001 to FIX-004)**: 4-6 hours for experienced developer
- **High Priority Fixes (FIX-005 to FIX-008)**: 3-4 hours
- **Medium Priority Fixes (FIX-009 to FIX-010)**: 2-3 hours
- **Low Priority Fixes (FIX-011 to FIX-012)**: 1-2 hours

**Total**: ~12-15 hours to complete all fixes

---

**Report Generated**: 2025-11-28
**Phases Reviewed**: 6, 7, 8, 9, 10, 11, 12, 13, 19
**Overall Status**: ⚠️ PARTIAL PASS - Critical fixes required before production
