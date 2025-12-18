# INV-2025-12-02-002: Stage 2 Realtime Display - Refactoring

## Problem Summary

Stage 2 (Document Processing) has critical bugs in realtime display that confuse users.

## Current Problems

### Problem 1: Step Counter Shows Wrong Values
**Symptom**: Document nodes show "1 из 1" instead of "0 из 7" → "7 из 7"

**Root Cause**: React state batching causes race conditions - traces arrive one-by-one via realtime, but `setDocumentSteps` calls get batched, resulting in stale data during graph rebuild.

**User Impact**: User sees "1 из 1" immediately, thinks processing is complete.

### Problem 2: "Start Next Stage" Button Appears Too Early
**Symptom**: Approval button appears when first document completes, not when ALL documents are done.

**Root Cause**: Stage 2 status checks if ANY document has `phase: 'complete'`, should check ALL.

## Solution: Zustand Store

Use existing Zustand pattern (like `useNodeSelection`, `useAuthModal`) to bypass React batching.

### Store Structure

```typescript
// packages/web/stores/useDocumentProcessingStore.ts
import { create } from 'zustand';
import { logger } from '@/lib/logger';

const TOTAL_STEPS = 7;

const PHASE_TO_STEP_INDEX: Record<string, number> = {
  'init': 0, 'start': 0,
  'processing': 1,
  'chunking': 2,
  'embedding': 3,
  'indexing': 4,
  'summarization': 5,
  'complete': 6, 'finish': 6
};

interface DocumentProgress {
  id: string;
  name: string;
  completedSteps: number;
  totalSteps: number;
  currentPhase: string;
  isComplete: boolean;
  priority?: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
}

interface DocumentProcessingState {
  documents: Map<string, DocumentProgress>;
  courseId: string | null;

  // Actions
  setCourseId: (id: string) => void;
  addTrace: (trace: GenerationTrace) => void;
  reset: () => void;

  // Derived
  getProgress: (docId: string) => { completed: number; total: number };
  isAllComplete: () => boolean;
  getDocuments: () => DocumentProgress[];
}

export const useDocumentProcessingStore = create<DocumentProcessingState>((set, get) => ({
  documents: new Map(),
  courseId: null,

  setCourseId: (id) => {
    const current = get().courseId;
    if (current !== id) {
      set({ courseId: id, documents: new Map() });
    }
  },

  addTrace: (trace) => {
    if (trace.stage !== 'stage_2') return;

    const docId = extractDocumentId(trace);
    if (!docId) return;

    const phase = trace.step_name || trace.phase || 'init';
    const stepIndex = PHASE_TO_STEP_INDEX[phase] ?? 0;

    set((state) => {
      const docs = new Map(state.documents);
      const existing = docs.get(docId);

      const completedSteps = Math.max(existing?.completedSteps ?? 0, stepIndex + 1);
      const isComplete = phase === 'complete' || phase === 'finish';

      docs.set(docId, {
        id: docId,
        name: extractDocumentName(trace) || existing?.name || `Документ ${docId.substring(0, 8)}...`,
        completedSteps,
        totalSteps: TOTAL_STEPS,
        currentPhase: phase,
        isComplete,
        priority: trace.input_data?.priority as DocumentProgress['priority']
      });

      logger.devLog('[DocumentStore] Updated', { docId: docId.substring(0, 8), completedSteps, isComplete });

      return { documents: docs };
    });
  },

  reset: () => set({ documents: new Map(), courseId: null }),

  getProgress: (docId) => {
    const doc = get().documents.get(docId);
    return {
      completed: doc?.completedSteps ?? 0,
      total: TOTAL_STEPS
    };
  },

  isAllComplete: () => {
    const docs = get().documents;
    if (docs.size === 0) return false;
    return Array.from(docs.values()).every(d => d.isComplete);
  },

  getDocuments: () => Array.from(get().documents.values())
}));
```

### Integration Points

**1. In RealtimeProvider** - feed traces to store:
```typescript
// After receiving trace
useDocumentProcessingStore.getState().addTrace(newTrace);
```

**2. In useGraphData** - read from store instead of local state:
```typescript
// Replace documentSteps useState with:
const documents = useDocumentProcessingStore(state => state.getDocuments());
const isAllComplete = useDocumentProcessingStore(state => state.isAllComplete());
```

**3. In DocumentNode** - display progress:
```typescript
const { completed, total } = useDocumentProcessingStore(state => state.getProgress(docId));
// Renders: "3 из 7 этапов обработано"
```

**4. Stage 2 completion logic**:
```typescript
// Stage 2 is "completed" only when:
const stage2Complete = useDocumentProcessingStore(state => state.isAllComplete());
```

## Implementation Plan

### Phase 1: Create Store (~30 min)
- Create `packages/web/stores/useDocumentProcessingStore.ts`
- Use existing patterns from `useNodeSelection`

### Phase 2: Integrate with Realtime (~1 hour)
- Update `realtime-provider.tsx` to call `addTrace`
- Update `useGraphData.ts`:
  - Remove `documentSteps` useState
  - Remove `documentStepsAccumulatorRef`
  - Remove `documentStepsVersion`
  - Subscribe to store

### Phase 3: Fix Display (~30 min)
- Update DocumentNode to show `completed/total` from store
- Initial display: "0 из 7"
- Fix Stage 2 completion check with `isAllComplete()`

### Phase 4: Cleanup (~30 min)
- Remove dead code
- Use `logger` instead of console.log
- Verify with new course generation

## Files to Modify

| File | Changes |
|------|---------|
| `packages/web/stores/useDocumentProcessingStore.ts` | New file |
| `packages/web/providers/realtime-provider.tsx` | Add `addTrace` call |
| `packages/web/components/generation-graph/hooks/useGraphData.ts` | Remove local state, use store |
| `packages/web/components/generation-graph/nodes/DocumentNode.tsx` | Use store for progress |

## Acceptance Criteria

- [ ] Documents show "0 из 7" initially
- [ ] Progress updates in realtime: 1/7 → 2/7 → ... → 7/7
- [ ] "Start Next Stage" appears only when ALL documents complete
- [ ] Page refresh shows correct state
