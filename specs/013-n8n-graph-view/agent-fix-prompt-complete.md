# Complete Fix Prompt for n8n-Graph-View Implementation

You are tasked with completing the missing implementation for the n8n-Graph-View feature. The following critical hooks and components are MISSING or incomplete. Implement them according to the specifications below.

## Context

- **Project**: MegaCampus monorepo
- **Package**: `packages/web`
- **Base Directory**: `packages/web/components/generation-graph/`
- **Build Status**: Type-check and build currently PASS, but features are incomplete

---

## CRITICAL Priority (Must Complete First)

### 1. Create `hooks/useRetry.ts`

**Purpose**: Connect retry actions to backend API
**Spec**: T065 - FR-ERR03

**Requirements**:
- Export `useRetry()` hook
- Takes `courseId: string` as parameter
- Returns `{ retry, isRetrying, error }`
- `retry(nodeId: string, itemId?: string)` function calls backend API
- Handle loading state and errors

**Implementation**:
```typescript
// packages/web/components/generation-graph/hooks/useRetry.ts
'use client';

import { useState, useCallback } from 'react';

interface UseRetryReturn {
  retry: (nodeId: string, itemId?: string) => Promise<void>;
  isRetrying: boolean;
  error: Error | null;
}

export function useRetry(courseId: string): UseRetryReturn {
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
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Retry failed');
      }

      return await response.json();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      throw error;
    } finally {
      setIsRetrying(false);
    }
  }, [courseId]);

  return { retry, isRetrying, error };
}
```

---

### 2. Create `hooks/useFallbackPolling.ts`

**Purpose**: Poll for updates when Supabase Realtime fails
**Spec**: T072 - FR-R05

**Requirements**:
- Start polling when `isRealtimeConnected === false`
- Poll every 5 seconds
- Fetch latest traces from API
- Stop polling when realtime reconnects

**Implementation**:
```typescript
// packages/web/components/generation-graph/hooks/useFallbackPolling.ts
'use client';

import { useState, useEffect, useRef } from 'react';
import { GenerationTrace } from '@/components/generation-celestial/utils';

const POLLING_INTERVAL = 5000; // 5 seconds

export function useFallbackPolling(
  courseId: string,
  isRealtimeConnected: boolean
): GenerationTrace[] {
  const [polledTraces, setPolledTraces] = useState<GenerationTrace[]>([]);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear any existing interval
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    // If realtime is connected, don't poll
    if (isRealtimeConnected) {
      return;
    }

    // Fallback polling function
    const pollTraces = async () => {
      try {
        const response = await fetch(`/api/courses/${courseId}/traces`);
        if (response.ok) {
          const data = await response.json();
          setPolledTraces(data.traces || []);
        }
      } catch (err) {
        console.error('Fallback polling failed:', err);
      }
    };

    // Poll immediately, then at interval
    pollTraces();
    pollingRef.current = setInterval(pollTraces, POLLING_INTERVAL);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [courseId, isRealtimeConnected]);

  return polledTraces;
}
```

---

### 3. Create `hooks/useViewportPreservation.ts`

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
'use client';

import { useCallback, useRef } from 'react';
import { useReactFlow, Viewport } from '@xyflow/react';

interface UseViewportPreservationReturn {
  preserveViewport: () => void;
  restoreViewport: () => void;
}

export function useViewportPreservation(): UseViewportPreservationReturn {
  const { getViewport, setViewport } = useReactFlow();
  const savedViewport = useRef<Viewport | null>(null);

  const preserveViewport = useCallback(() => {
    savedViewport.current = getViewport();
  }, [getViewport]);

  const restoreViewport = useCallback(() => {
    if (savedViewport.current) {
      requestAnimationFrame(() => {
        if (savedViewport.current) {
          setViewport(savedViewport.current, { duration: 0 });
        }
      });
    }
  }, [setViewport]);

  return { preserveViewport, restoreViewport };
}
```

---

### 4. Create `hooks/useGracefulDegradation.ts`

**Purpose**: Handle realtime/polling failures gracefully
**Spec**: T079 - FR-ER04

**Requirements**:
- Track degradation mode: 'full' | 'polling' | 'static'
- Provide handlers for failures
- Return degradation state and UI message

**Implementation**:
```typescript
// packages/web/components/generation-graph/hooks/useGracefulDegradation.ts
'use client';

import { useState, useCallback } from 'react';

export type DegradationMode = 'full' | 'polling' | 'static';

interface UseGracefulDegradationReturn {
  degradationMode: DegradationMode;
  handleRealtimeFailure: () => void;
  handlePollingFailure: () => void;
  reset: () => void;
  statusMessage: string | null;
}

export function useGracefulDegradation(): UseGracefulDegradationReturn {
  const [mode, setMode] = useState<DegradationMode>('full');

  const handleRealtimeFailure = useCallback(() => {
    console.warn('[GracefulDegradation] Realtime failed, switching to polling');
    setMode('polling');
  }, []);

  const handlePollingFailure = useCallback(() => {
    console.warn('[GracefulDegradation] Polling failed, switching to static mode');
    setMode('static');
  }, []);

  const reset = useCallback(() => {
    setMode('full');
  }, []);

  const statusMessage = mode === 'full'
    ? null
    : mode === 'polling'
      ? 'Live updates temporarily unavailable. Refreshing periodically.'
      : 'Unable to fetch updates. Showing last known state.';

  return {
    degradationMode: mode,
    handleRealtimeFailure,
    handlePollingFailure,
    reset,
    statusMessage
  };
}
```

---

## HIGH Priority (Complete After Critical)

### 5. Extract Tab Components

**Purpose**: Separate tab content into individual components per specification
**Spec**: T036-T038

#### 5a. Create `panels/InputTab.tsx`:
```typescript
// packages/web/components/generation-graph/panels/InputTab.tsx
'use client';

import React from 'react';

interface InputTabProps {
  inputData?: unknown;
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

#### 5b. Create `panels/ProcessTab.tsx`:
```typescript
// packages/web/components/generation-graph/panels/ProcessTab.tsx
'use client';

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
          <div className="font-medium">{cost ? `$${cost.toFixed(4)}` : '-'}</div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Status</span>
          <div className="font-medium capitalize">{status || '-'}</div>
        </div>
      </div>
    </div>
  );
};
```

#### 5c. Create `panels/OutputTab.tsx`:
```typescript
// packages/web/components/generation-graph/panels/OutputTab.tsx
'use client';

import React from 'react';

interface OutputTabProps {
  outputData?: unknown;
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

#### 5d. Update `panels/NodeDetailsDrawer.tsx`:

Add imports at top:
```typescript
import { InputTab } from './InputTab';
import { ProcessTab } from './ProcessTab';
import { OutputTab } from './OutputTab';
```

Replace inline TabsContent with:
```tsx
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

### 6. Add Retry Count Badge to StageNode

**File**: `packages/web/components/generation-graph/nodes/StageNode.tsx`
**Spec**: T054

Add after the main node content, inside the outer div (before closing `</div>`):

```tsx
{/* Retry Count Badge */}
{data.retryCount && data.retryCount > 0 && (
  <div
    className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-md z-10"
    data-testid={`retry-badge-${id}`}
    aria-label={`${data.retryCount} retries`}
  >
    {data.retryCount}
  </div>
)}
```

Also add `retryCount` to the data type interface if not present:
```typescript
interface StageNodeData {
  // ... existing fields
  retryCount?: number;
}
```

---

### 7. Add Awaiting Visual Style to StageNode

**File**: `packages/web/components/generation-graph/nodes/StageNode.tsx`
**Spec**: T057

In the `getStatusStyles` function (or equivalent), ensure the `awaiting` case has yellow glow:

```typescript
const getStatusStyles = (status: string) => {
  switch (status) {
    case 'pending':
      return 'border-slate-300 bg-slate-50';
    case 'active':
      return 'border-blue-500 bg-blue-50 shadow-[0_0_15px_rgba(59,130,246,0.5)] scale-105 animate-pulse';
    case 'completed':
      return 'border-emerald-500 bg-emerald-50';
    case 'error':
      return 'border-red-500 bg-red-50 shadow-[0_0_10px_rgba(239,68,68,0.4)]';
    case 'awaiting':
      return 'border-yellow-500 bg-yellow-50 shadow-[0_0_15px_rgba(234,179,8,0.6)] scale-105 animate-pulse';
    case 'skipped':
      return 'border-slate-400 bg-slate-100 opacity-60';
    default:
      return 'border-slate-300 bg-slate-50';
  }
};
```

---

### 8. Connect Approval Actions to Backend

**File**: `packages/web/components/generation-graph/controls/ApprovalControls.tsx`
**Spec**: T060

Replace console.log stubs with actual API calls:

```typescript
// packages/web/components/generation-graph/controls/ApprovalControls.tsx
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, X, Loader2 } from 'lucide-react';
import { approveStage, cancelGeneration } from '@/app/actions/admin-generation';

interface ApprovalControlsProps {
  courseId: string;
  stageNumber: number;
  onApproved?: () => void;
  onRejected?: () => void;
}

export const ApprovalControls = ({
  courseId,
  stageNumber,
  onApproved,
  onRejected
}: ApprovalControlsProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);

  const handleApprove = async () => {
    setIsProcessing(true);
    setAction('approve');
    try {
      await approveStage(courseId, stageNumber);
      onApproved?.();
    } catch (error) {
      console.error('Approval failed:', error);
      // TODO: Show toast notification
    } finally {
      setIsProcessing(false);
      setAction(null);
    }
  };

  const handleReject = async (feedback?: string) => {
    setIsProcessing(true);
    setAction('reject');
    try {
      await cancelGeneration(courseId, feedback);
      onRejected?.();
    } catch (error) {
      console.error('Rejection failed:', error);
      // TODO: Show toast notification
    } finally {
      setIsProcessing(false);
      setAction(null);
    }
  };

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleApprove}
        disabled={isProcessing}
        className="text-emerald-600 border-emerald-300 hover:bg-emerald-50"
        data-testid="approval-approve-btn"
      >
        {isProcessing && action === 'approve' ? (
          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
        ) : (
          <Check className="w-4 h-4 mr-1" />
        )}
        Approve
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleReject()}
        disabled={isProcessing}
        className="text-red-600 border-red-300 hover:bg-red-50"
        data-testid="approval-reject-btn"
      >
        {isProcessing && action === 'reject' ? (
          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
        ) : (
          <X className="w-4 h-4 mr-1" />
        )}
        Reject
      </Button>
    </div>
  );
};
```

---

## Integration: Update GraphView.tsx

**File**: `packages/web/components/generation-graph/GraphView.tsx`

Add imports:
```typescript
import { useFallbackPolling } from './hooks/useFallbackPolling';
import { useViewportPreservation } from './hooks/useViewportPreservation';
import { useGracefulDegradation } from './hooks/useGracefulDegradation';
```

Inside `GraphViewInner` component, add the hooks:
```typescript
function GraphViewInner({ courseId, courseTitle }: GraphViewProps) {
  // ... existing hooks

  // Graceful degradation
  const {
    degradationMode,
    handleRealtimeFailure,
    statusMessage
  } = useGracefulDegradation();

  // Fallback polling when realtime disconnects
  const polledTraces = useFallbackPolling(courseId, isConnected);

  // Use realtime traces when connected, polled traces when not
  const effectiveTraces = isConnected ? traces : polledTraces;

  // Viewport preservation
  const { preserveViewport, restoreViewport } = useViewportPreservation();

  // Handle realtime disconnection
  useEffect(() => {
    if (!isConnected && degradationMode === 'full') {
      handleRealtimeFailure();
    }
  }, [isConnected, degradationMode, handleRealtimeFailure]);

  // Process traces with viewport preservation
  useEffect(() => {
    if (effectiveTraces.length > 0) {
      preserveViewport();
      processTraces(effectiveTraces);
      restoreViewport();
    }
  }, [effectiveTraces, processTraces, preserveViewport, restoreViewport]);

  // ... rest of component

  return (
    <div className="h-full w-full bg-slate-50 relative">
      {/* Degradation Mode Indicator */}
      {statusMessage && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-yellow-100 text-yellow-800 px-3 py-1.5 rounded-full text-sm font-medium shadow-md"
          role="alert"
          data-testid="degradation-indicator"
        >
          {statusMessage}
        </div>
      )}

      <ReactFlow
        // ... existing props
      >
        {/* ... existing children */}
      </ReactFlow>
    </div>
  );
}
```

---

## Integration: Update RetryConfirmDialog.tsx

**File**: `packages/web/components/generation-graph/controls/RetryConfirmDialog.tsx`

Update to use the useRetry hook:

```typescript
// Add import
import { useRetry } from '../hooks/useRetry';

// Inside component
interface RetryConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  courseId: string;
  nodeId: string;
  itemId?: string;
  nodeName: string;
}

export const RetryConfirmDialog = ({
  open,
  onClose,
  courseId,
  nodeId,
  itemId,
  nodeName
}: RetryConfirmDialogProps) => {
  const { retry, isRetrying, error } = useRetry(courseId);

  const handleConfirm = async () => {
    try {
      await retry(nodeId, itemId);
      onClose();
    } catch (err) {
      // Error is already set in hook state
      console.error('Retry failed:', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Retry {nodeName}?</DialogTitle>
          <DialogDescription>
            This will attempt to regenerate this item. Previous output will be preserved in history.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="text-red-600 text-sm bg-red-50 p-2 rounded">
            {error.message}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isRetrying}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isRetrying}>
            {isRetrying ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Retrying...
              </>
            ) : (
              'Confirm Retry'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

---

## Update Exports: index.ts

**File**: `packages/web/components/generation-graph/index.ts`

Add the new exports:

```typescript
// Hooks
export { useRetry } from './hooks/useRetry';
export { useFallbackPolling } from './hooks/useFallbackPolling';
export { useViewportPreservation } from './hooks/useViewportPreservation';
export { useGracefulDegradation } from './hooks/useGracefulDegradation';
export type { DegradationMode } from './hooks/useGracefulDegradation';

// Tab Components
export { InputTab } from './panels/InputTab';
export { ProcessTab } from './panels/ProcessTab';
export { OutputTab } from './panels/OutputTab';
```

---

## Quality Requirements

1. **TypeScript**: All hooks must have proper types (no `any` where avoidable)
2. **'use client'**: All hooks and components must have `'use client'` directive
3. **Error Handling**: All API calls must have try-catch with proper error state
4. **Cleanup**: All useEffect hooks with intervals/subscriptions must return cleanup functions
5. **Memoization**: Use `useCallback` for functions passed to children or used in deps
6. **Testing**: Add `data-testid` attributes to interactive elements
7. **Accessibility**: Add `aria-label` and `role` attributes where appropriate

---

## Validation Checklist

After implementing ALL fixes, run:

```bash
cd /home/me/code/megacampus2

# Type check
pnpm type-check --filter @megacampus/web

# Build
pnpm build --filter @megacampus/web
```

**Both must pass with no errors.**

Then verify in browser:

1. **Retry Feature**:
   - Failed node shows retry button
   - Clicking retry opens confirmation dialog
   - Confirming calls API (check Network tab)

2. **Fallback Polling**:
   - Disconnect network
   - See "Polling Mode" indicator appear
   - Graph still updates (every 5 seconds)

3. **Viewport Preservation**:
   - Pan/zoom the graph to a specific position
   - Wait for real-time update
   - Viewport should NOT jump back to center

4. **Graceful Degradation**:
   - Disconnect network
   - Yellow indicator shows degradation message
   - App doesn't crash

5. **Tab Components**:
   - Open node details drawer
   - Switch between Input/Process/Output tabs
   - Data displays correctly

6. **Approval Actions**:
   - On awaiting node, see yellow glow
   - Click Approve/Reject
   - API is called (check Network tab)

7. **Retry Badge**:
   - Node with retries shows orange badge with count

---

## Files to Create/Modify Summary

### CREATE (7 new files):
1. `hooks/useRetry.ts`
2. `hooks/useFallbackPolling.ts`
3. `hooks/useViewportPreservation.ts`
4. `hooks/useGracefulDegradation.ts`
5. `panels/InputTab.tsx`
6. `panels/ProcessTab.tsx`
7. `panels/OutputTab.tsx`

### MODIFY (5 existing files):
1. `panels/NodeDetailsDrawer.tsx` - Use extracted tab components
2. `nodes/StageNode.tsx` - Add retry badge + awaiting style
3. `controls/ApprovalControls.tsx` - Connect to backend API
4. `controls/RetryConfirmDialog.tsx` - Use useRetry hook
5. `GraphView.tsx` - Integrate new hooks
6. `index.ts` - Add new exports

---

## Priority Order

Execute in this order:

1. **Create 4 critical hooks** (useRetry, useFallbackPolling, useViewportPreservation, useGracefulDegradation)
2. **Integrate hooks into GraphView.tsx**
3. **Update RetryConfirmDialog to use useRetry**
4. **Create tab components and update NodeDetailsDrawer**
5. **Add retry badge and awaiting style to StageNode**
6. **Update ApprovalControls with backend connection**
7. **Update index.ts exports**
8. **Run type-check and build**
9. **Test in browser**
