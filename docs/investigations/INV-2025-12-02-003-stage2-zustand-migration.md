# INV-2025-12-02-003: Generation Graph - Full Zustand Migration

## Статус: РЕАЛИЗОВАНО ✅

## Дата реализации: 2025-12-02

---

## Итоговый отчет

### Решенные проблемы

| Проблема | Причина | Решение |
|----------|---------|---------|
| Счетчик показывал некорректные значения | React batching обновлений | Zustand обходит batching |
| Modal показывал 1 этап вместо 7 | Данные читались из props | Чтение из Zustand store |
| "Инициализация" застревала в Active | Marker phases не имеют output_data | Добавлен `isMarkerPhase` check |
| "Завершено" застревала в Active | Marker phases не имеют output_data | Добавлен `isMarkerPhase` check |
| Документ не становился зеленым | `calculateDocumentStatus` требовал `lastStage.status === 'completed'` | Изменено на проверку существования `lastStage` |

### Ключевой фикс: Marker Phases

```typescript
// БЫЛО (неправильно):
const stepStatus: NodeStatus = trace.error_data
  ? 'error'
  : trace.output_data  // ← init/complete не имеют output_data!
    ? 'completed'
    : 'active';

// СТАЛО (правильно):
const isMarkerPhase = phase === 'init' || phase === 'start' || phase === 'complete' || phase === 'finish';
const stepStatus: NodeStatus = trace.error_data
  ? 'error'
  : (isMarkerPhase || trace.output_data)  // ← теперь учитываем marker phases
    ? 'completed'
    : 'active';
```

**Применено в двух местах:**
- `addTrace()` (line 383) - для realtime обновлений
- `loadFromTraces()` (line 558) - для загрузки истории при refresh

### Immer + Map/Set

```typescript
import { enableMapSet } from 'immer';

// ВАЖНО: Вызывать на уровне модуля ДО создания store
enableMapSet();

export const useGenerationStore = create<GenerationState>()(
  immer((set, get) => ({
    documents: new Map(),  // Теперь работает с Immer
    // ...
  }))
);
```

Без `enableMapSet()` будет ошибка:
```
Error: The plugin for 'MapSet' has not been loaded into Immer
```

### Измененные файлы

| Файл | Изменение |
|------|-----------|
| `packages/web/stores/useGenerationStore.ts` | СОЗДАН - унифицированный store |
| `packages/web/stores/useDocumentProcessingStore.ts` | УДАЛЕН |
| `packages/web/components/generation-monitoring/realtime-provider.tsx` | Импорт store |
| `packages/web/components/generation-graph/nodes/DocumentNode.tsx` | Чтение из Zustand |
| `packages/web/components/generation-graph/panels/NodeDetailsModal/index.tsx` | Чтение stages из Zustand |

---

## Executive Summary (Исходный план)

Migrate **entire generation workflow state** from fragmented local state (useGraphData) to **unified Zustand store** with Immer middleware. This ensures consistency across all 6 stages and eliminates React batching issues.

## Current Architecture Problems

### Problem 1: Dual State Systems
```
┌─────────────────────────────────────────────────────────────────┐
│                    CURRENT (Broken)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  useGraphData.ts                  useDocumentProcessingStore.ts │
│  ┌──────────────────┐             ┌──────────────────────────┐  │
│  │ documentSteps    │             │ documents Map            │  │
│  │ (useState + Map) │             │ (Zustand store)          │  │
│  │                  │             │                          │  │
│  │ → Modal stages   │             │ → Progress counter only  │  │
│  │ → Node building  │             │                          │  │
│  │ → Status calc    │             │                          │  │
│  └──────────────────┘             └──────────────────────────┘  │
│           │                                  │                   │
│           ▼                                  ▼                   │
│    React batching               Synchronous updates             │
│    (race conditions)            (correct, but incomplete)       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Problem 2: Data Not Synced
- Modal shows 1 stage (from useGraphData documentSteps)
- DocumentNode shows correct progress (from Zustand)
- After refresh: Zustand loads from traces, but documentSteps is empty until traces reprocessed

### Problem 3: Status Not Updated
- `calculateDocumentStatus()` uses `documentSteps` from local state
- `completed` status never reached because local state lags behind

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    TARGET (Single Source of Truth)               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                useDocumentProcessingStore.ts                     │
│                (Zustand + Immer middleware)                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                                                          │   │
│  │  documents: Map<docId, {                                 │   │
│  │    id, name, priority,                                   │   │
│  │    status: 'pending' | 'active' | 'completed' | 'error', │   │
│  │    completedSteps: number,  // 0-6 index                 │   │
│  │    currentPhase: string,                                 │   │
│  │    stages: DocumentStageData[],  // For modal            │   │
│  │  }>                                                      │   │
│  │                                                          │   │
│  │  Actions:                                                │   │
│  │  - addTrace(trace)      → updates single doc             │   │
│  │  - loadFromTraces([])   → bulk load on refresh           │   │
│  │  - getProgress(docId)   → { completed, total }           │   │
│  │  - getDocument(docId)   → full doc with stages           │   │
│  │  - getDocuments()       → all docs array                 │   │
│  │  - isAllComplete()      → boolean                        │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│              ┌───────────────┼───────────────┐                  │
│              ▼               ▼               ▼                  │
│        DocumentNode      Modal          useGraphData            │
│        (progress)       (stages)       (node building)          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Extend Zustand Store with Immer

**File:** `packages/web/stores/useDocumentProcessingStore.ts`

```typescript
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { logger } from '@/lib/logger';
import { GenerationTrace } from '@/components/generation-monitoring/realtime-provider';
import { TraceAttempt, NodeStatus } from '@megacampus/shared-types';

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

// Full stage data for modal display
interface DocumentStageData {
  stageId: string;
  stageName: string;
  stageNumber: number;
  status: NodeStatus;
  attempts: TraceAttempt[];
  inputData?: Record<string, unknown>;
  outputData?: Record<string, unknown>;
}

// Complete document progress including stages for modal
interface DocumentProgress {
  id: string;
  name: string;
  status: NodeStatus;  // Overall status: pending → active → completed/error
  completedSteps: number;  // 0-6 index
  totalSteps: number;  // Always 7
  currentPhase: string;
  priority?: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
  stages: DocumentStageData[];  // Full stage data for modal
}

interface DocumentProcessingState {
  documents: Map<string, DocumentProgress>;
  courseId: string | null;

  // Actions
  setCourseId: (id: string) => void;
  addTrace: (trace: GenerationTrace) => void;
  loadFromTraces: (traces: GenerationTrace[]) => void;
  reset: () => void;

  // Selectors (stable references)
  getProgress: (docId: string) => { completed: number; total: number };
  getDocument: (docId: string) => DocumentProgress | undefined;
  getDocuments: () => DocumentProgress[];
  getDocumentStatus: (docId: string) => NodeStatus;
  isAllComplete: () => boolean;
}

export const useDocumentProcessingStore = create<DocumentProcessingState>()(
  immer((set, get) => ({
    documents: new Map(),
    courseId: null,

    setCourseId: (id) => {
      set((state) => {
        if (state.courseId !== id) {
          state.courseId = id;
          state.documents = new Map();
        }
      });
    },

    addTrace: (trace) => {
      if (trace.stage !== 'stage_2') return;

      const docId = extractDocumentId(trace);
      if (!docId) return;

      const phase = (trace.phase || trace.step_name || 'unknown').toLowerCase();
      const stepIndex = PHASE_TO_STEP_INDEX[phase] ?? -1;
      if (stepIndex === -1) return;

      set((state) => {
        const existing = state.documents.get(docId);
        const docName = extractDocumentName(trace);

        // Build attempt from trace
        const attempt = traceToAttempt(trace, (existing?.stages.length || 0) + 1);

        // Determine step status
        const stepStatus: NodeStatus = trace.error_data
          ? 'error'
          : trace.output_data
            ? 'completed'
            : 'active';

        // Create stage data
        const stageId = `${docId}_${phase}`;
        const newStage: DocumentStageData = {
          stageId,
          stageName: translateStepName(phase),
          stageNumber: stepIndex + 1,
          status: stepStatus,
          attempts: [attempt],
          inputData: trace.input_data,
          outputData: trace.output_data
        };

        if (existing) {
          // Update existing document
          const stageIdx = existing.stages.findIndex(s => s.stageId === stageId);

          if (stageIdx >= 0) {
            // Update existing stage - add attempt
            existing.stages[stageIdx].attempts.push(attempt);
            existing.stages[stageIdx].status = stepStatus;
            existing.stages[stageIdx].inputData = trace.input_data;
            existing.stages[stageIdx].outputData = trace.output_data;
          } else {
            // Add new stage
            existing.stages.push(newStage);
            existing.stages.sort((a, b) => a.stageNumber - b.stageNumber);
          }

          // Update progress
          existing.completedSteps = Math.max(existing.completedSteps, stepIndex);
          existing.currentPhase = phase;

          // Calculate overall status
          existing.status = calculateOverallStatus(existing.stages, existing.completedSteps);

          // Update name if better one available
          if (docName && existing.name.startsWith('Документ ')) {
            existing.name = docName;
          }
        } else {
          // Create new document
          const newDoc: DocumentProgress = {
            id: docId,
            name: docName || `Документ ${docId.substring(0, 8)}...`,
            status: stepStatus === 'error' ? 'error' : 'active',
            completedSteps: stepIndex,
            totalSteps: TOTAL_STEPS,
            currentPhase: phase,
            priority: trace.input_data?.priority,
            stages: [newStage]
          };
          state.documents.set(docId, newDoc);
        }

        logger.devLog('[DocumentStore] Updated', {
          docId: docId.substring(0, 8),
          phase,
          stepIndex,
          stagesCount: state.documents.get(docId)?.stages.length
        });
      });
    },

    loadFromTraces: (traces) => {
      const stage2Traces = traces
        .filter(t => t.stage === 'stage_2')
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      if (stage2Traces.length === 0) return;

      logger.devLog('[DocumentStore] Loading', stage2Traces.length, 'traces');

      set((state) => {
        state.documents = new Map();

        // Process each trace to build complete state
        for (const trace of stage2Traces) {
          const docId = extractDocumentId(trace);
          if (!docId) continue;

          const phase = (trace.phase || trace.step_name || 'unknown').toLowerCase();
          const stepIndex = PHASE_TO_STEP_INDEX[phase] ?? -1;
          if (stepIndex === -1) continue;

          const docName = extractDocumentName(trace);
          const attempt = traceToAttempt(trace, 1);

          const stepStatus: NodeStatus = trace.error_data
            ? 'error'
            : trace.output_data
              ? 'completed'
              : 'active';

          const stageId = `${docId}_${phase}`;
          const newStage: DocumentStageData = {
            stageId,
            stageName: translateStepName(phase),
            stageNumber: stepIndex + 1,
            status: stepStatus,
            attempts: [attempt],
            inputData: trace.input_data,
            outputData: trace.output_data
          };

          const existing = state.documents.get(docId);

          if (existing) {
            const stageIdx = existing.stages.findIndex(s => s.stageId === stageId);

            if (stageIdx >= 0) {
              existing.stages[stageIdx].attempts.push(attempt);
              existing.stages[stageIdx].status = stepStatus;
              existing.stages[stageIdx].inputData = trace.input_data;
              existing.stages[stageIdx].outputData = trace.output_data;
            } else {
              existing.stages.push(newStage);
              existing.stages.sort((a, b) => a.stageNumber - b.stageNumber);
            }

            existing.completedSteps = Math.max(existing.completedSteps, stepIndex);
            existing.currentPhase = phase;
            existing.status = calculateOverallStatus(existing.stages, existing.completedSteps);

            if (docName && existing.name.startsWith('Документ ')) {
              existing.name = docName;
            }
          } else {
            state.documents.set(docId, {
              id: docId,
              name: docName || `Документ ${docId.substring(0, 8)}...`,
              status: stepStatus === 'error' ? 'error' : 'active',
              completedSteps: stepIndex,
              totalSteps: TOTAL_STEPS,
              currentPhase: phase,
              priority: trace.input_data?.priority,
              stages: [newStage]
            });
          }
        }

        logger.devLog('[DocumentStore] Loaded', state.documents.size, 'documents');
      });
    },

    reset: () => {
      set((state) => {
        state.documents = new Map();
        state.courseId = null;
      });
    },

    // Selectors - return stable references for useShallow
    getProgress: (docId) => {
      const doc = get().documents.get(docId);
      return {
        completed: doc ? doc.completedSteps + 1 : 0,
        total: TOTAL_STEPS
      };
    },

    getDocument: (docId) => get().documents.get(docId),

    getDocuments: () => Array.from(get().documents.values()),

    getDocumentStatus: (docId) => {
      const doc = get().documents.get(docId);
      return doc?.status || 'pending';
    },

    isAllComplete: () => {
      const { documents } = get();
      if (documents.size === 0) return false;
      return Array.from(documents.values()).every(doc => doc.status === 'completed');
    }
  }))
);

// Helper functions (move from useGraphData.ts)
function extractDocumentId(trace: GenerationTrace): string | null {
  const inputData = trace.input_data;
  if (!inputData) return null;
  return inputData.document_id || inputData.documentId || inputData.fileId || inputData.file_id || null;
}

function extractDocumentName(trace: GenerationTrace): string | null {
  const inputData = trace.input_data;
  if (!inputData) return null;
  return inputData.originalFilename || inputData.original_filename ||
         inputData.originalName || inputData.original_name ||
         inputData.file_name || inputData.filename || inputData.fileName || null;
}

function translateStepName(phase: string): string {
  const translations: Record<string, string> = {
    'init': 'Инициализация',
    'start': 'Начало',
    'processing': 'Обработка',
    'chunking': 'Разбиение',
    'embedding': 'Эмбеддинги',
    'indexing': 'Индексация',
    'summarization': 'Саммаризация',
    'complete': 'Завершено',
    'finish': 'Готово'
  };
  return translations[phase] || phase;
}

function traceToAttempt(trace: GenerationTrace, attemptNumber: number): TraceAttempt {
  return {
    attemptNumber,
    timestamp: new Date(trace.created_at),
    inputData: trace.input_data || {},
    outputData: trace.output_data || {},
    processMetrics: {
      model: trace.model_used || 'unknown',
      tokens: trace.tokens_used || 0,
      duration: trace.duration_ms || 0,
      cost: trace.cost_usd || 0
    },
    status: trace.error_data ? 'failed' : 'success',
    errorMessage: trace.error_data?.message
  };
}

function calculateOverallStatus(stages: DocumentStageData[], completedSteps: number): NodeStatus {
  // Error takes priority
  if (stages.some(s => s.status === 'error')) return 'error';

  // All 7 steps completed = completed
  if (completedSteps >= TOTAL_STEPS - 1) {
    const lastStage = stages.find(s => s.stageNumber === TOTAL_STEPS);
    if (lastStage?.status === 'completed') return 'completed';
  }

  // Has active stages = active
  if (stages.some(s => s.status === 'active')) return 'active';

  // Has completed stages but not all = active (still processing)
  if (stages.some(s => s.status === 'completed')) return 'active';

  return 'pending';
}
```

### Phase 2: Update useGraphData.ts

Remove `documentSteps` local state and read from Zustand store:

```typescript
// REMOVE these:
// const [documentSteps, setDocumentSteps] = useState<Map<string, DocumentWithSteps>>(new Map());

// ADD import:
import { useDocumentProcessingStore } from '@/stores/useDocumentProcessingStore';

// In graph building section, replace documentSteps with:
const documents = useDocumentProcessingStore.getState().getDocuments();

// Change condition from `documentSteps.size > 0` to `documents.length > 0`

// Use documents directly instead of documentSteps.forEach
documents.forEach((doc) => {
  const docNodeId = `doc_${doc.id.replace(/[^a-zA-Z0-9-_]/g, '_')}`;

  newNodes.push({
    id: docNodeId,
    type: 'document',
    position: getExistingPos(docNodeId),
    data: {
      ...config,
      label: doc.name,
      filename: doc.name,
      documentId: doc.id,
      status: doc.status,  // Now from Zustand
      stageNumber: 2,
      priority: doc.priority,
      stages: doc.stages,  // Now from Zustand
      completedStages: doc.completedSteps + 1,
      totalStages: doc.totalSteps,
      // ... rest
    }
  });
});
```

### Phase 3: Update DocumentNode.tsx

Already using Zustand for progress. Add status from store:

```typescript
const { completed, total } = useDocumentProcessingStore(
  useShallow(state => state.getProgress(data.documentId))
);

// Add status subscription for green highlighting
const docStatus = useDocumentProcessingStore(
  state => state.getDocumentStatus(data.documentId)
);

// Use docStatus || data.status as fallback
const currentStatus = docStatus || statusEntry?.status || data.status;
```

### Phase 4: Update NodeDetailsModal

Modal should read stages from store:

```typescript
// In modal, when selectedNode.type === 'document':
const docData = useDocumentProcessingStore(
  state => state.getDocument(selectedNode.data.documentId)
);

// Use docData.stages instead of docNode.data.stages
const stages = docData?.stages || [];
```

### Phase 5: Remove Dead Code

From `useGraphData.ts`, remove:
- `documentSteps` useState
- `setDocumentSteps` calls in processTraces
- `DocumentWithSteps` interface (move to store if needed)
- `DocumentStepData` interface (move to store)
- `calculateDocumentStatus` function (moved to store)
- `translateStepName` function (moved to store)

## Files to Modify

| File | Changes |
|------|---------|
| `packages/web/stores/useDocumentProcessingStore.ts` | Rewrite with Immer, add stages |
| `packages/web/components/generation-graph/hooks/useGraphData.ts` | Remove documentSteps, use store |
| `packages/web/components/generation-graph/nodes/DocumentNode.tsx` | Add status from store |
| `packages/web/components/generation-graph/panels/NodeDetailsModal/index.tsx` | Read stages from store |
| `packages/web/package.json` | Ensure zustand/middleware/immer installed |

## Acceptance Criteria

- [ ] Documents show "0 из 7" initially (before any traces)
- [ ] Progress updates in realtime: 1/7 → 2/7 → ... → 7/7
- [ ] Document node turns GREEN when all 7 stages complete
- [ ] Modal shows ALL stages (not just 1)
- [ ] Page refresh preserves correct state
- [ ] "Start Next Stage" appears only when ALL documents complete
- [ ] No React batching race conditions
- [ ] TypeScript compiles without errors
- [ ] No console.log (only logger.devLog)

## Testing Plan

1. **Fresh course generation**
   - Create new course with 2-3 documents
   - Watch progress counters increment
   - Verify green status at completion

2. **Page refresh mid-processing**
   - Refresh page during Stage 2
   - Verify correct progress shown
   - Verify modal shows all stages

3. **Error handling**
   - Simulate document processing error
   - Verify red status and error display

4. **Multiple documents**
   - Process 4+ documents
   - Verify all track independently
   - Verify "Start Next Stage" timing

## Estimated Effort

- Phase 1 (Store rewrite): 1-2 hours
- Phase 2 (useGraphData): 1 hour
- Phase 3 (DocumentNode): 30 min
- Phase 4 (Modal): 30 min
- Phase 5 (Cleanup): 30 min
- Testing: 1 hour

**Total: ~5 hours**

## Risks

1. **Breaking existing functionality** - Mitigate with incremental migration
2. **Performance regression** - Zustand is faster than Context, should improve
3. **Type mismatches** - Extensive TypeScript, catch at compile time

## Dependencies

- `zustand` (already installed)
- `zustand/middleware/immer` (may need to verify import)
- `immer` (already installed per CLAUDE.md)

---

# EXTENDED: Full Workflow Unified Store

## Workflow Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        GENERATION WORKFLOW                                  │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Stage 1          Stage 2           Stage 3        Stage 4    Stage 5      │
│  ┌──────┐    ┌────────────────┐   ┌──────┐       ┌──────┐   ┌──────┐      │
│  │Upload│───▶│Document Process│──▶│Classi│──────▶│Analyz│──▶│Struct│      │
│  │      │    │   (parallel)   │   │fier  │       │e     │   │ure   │      │
│  └──────┘    │ ┌────┐ ┌────┐  │   └──────┘       └──────┘   └──────┘      │
│              │ │Doc1│ │Doc2│  │                                            │
│              │ └────┘ └────┘  │                      Stage 6               │
│              └────────────────┘               ┌────────────────────┐       │
│                                               │  Lesson Generation │       │
│                                               │    (parallel)      │       │
│                                               │ ┌────┐┌────┐┌────┐│       │
│                                               │ │Les1││Les2││Les3││       │
│                                               │ └────┘└────┘└────┘│       │
│                                               └────────────────────┘       │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

## Unified Store Structure

**File:** `packages/web/stores/useGenerationStore.ts`

```typescript
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// ============================================================================
// TYPES
// ============================================================================

type StageId = 'stage_1' | 'stage_2' | 'stage_3' | 'stage_4' | 'stage_5' | 'stage_6';
type NodeStatus = 'pending' | 'active' | 'completed' | 'error' | 'skipped' | 'awaiting';

interface AttemptData {
  attemptNumber: number;
  timestamp: Date;
  inputData: Record<string, unknown>;
  outputData: Record<string, unknown>;
  processMetrics?: {
    model: string;
    tokens: number;
    duration: number;
    cost: number;
  };
  status: 'success' | 'failed';
  errorMessage?: string;
}

// Stage-level state (simple stages: 1, 3, 4, 5)
interface StageState {
  id: StageId;
  status: NodeStatus;
  currentStep?: string;
  attempts: AttemptData[];
  startedAt?: Date;
  completedAt?: Date;
}

// Document state (Stage 2 parallel items)
interface DocumentState {
  id: string;
  name: string;
  status: NodeStatus;
  priority?: 'CORE' | 'IMPORTANT' | 'SUPPLEMENTARY';
  completedSteps: number;  // 0-6 index
  totalSteps: number;      // Always 7
  currentPhase: string;
  stages: DocumentStageData[];
}

interface DocumentStageData {
  stageId: string;
  stageName: string;
  stageNumber: number;
  status: NodeStatus;
  attempts: AttemptData[];
  inputData?: Record<string, unknown>;
  outputData?: Record<string, unknown>;
}

// Module/Lesson state (Stage 6 parallel items)
interface ModuleState {
  id: string;
  title: string;
  status: NodeStatus;
  totalLessons: number;
  completedLessons: number;
  isCollapsed: boolean;
}

interface LessonState {
  id: string;
  moduleId: string;
  title: string;
  status: NodeStatus;
  currentStep?: string;
  attempts: AttemptData[];
}

// ============================================================================
// STORE
// ============================================================================

interface GenerationState {
  // Identifiers
  courseId: string | null;

  // Stage-level state
  stages: Map<StageId, StageState>;

  // Stage 2: Documents (parallel)
  documents: Map<string, DocumentState>;

  // Stage 6: Modules & Lessons (parallel)
  modules: Map<string, ModuleState>;
  lessons: Map<string, LessonState>;

  // Workflow metadata
  hasDocuments: boolean;
  workflowStartedAt?: Date;
  workflowCompletedAt?: Date;

  // ========== ACTIONS ==========

  // Initialization
  setCourseId: (id: string, hasDocuments: boolean) => void;
  reset: () => void;

  // Trace processing
  addTrace: (trace: GenerationTrace) => void;
  loadFromTraces: (traces: GenerationTrace[]) => void;

  // Stage 6 structure (from Stage 5 output)
  setModuleStructure: (modules: ModuleStructure[]) => void;

  // ========== SELECTORS ==========

  // Stage selectors
  getStageStatus: (stageId: StageId) => NodeStatus;
  getStageAttempts: (stageId: StageId) => AttemptData[];
  isStageComplete: (stageId: StageId) => boolean;

  // Document selectors (Stage 2)
  getDocument: (docId: string) => DocumentState | undefined;
  getDocuments: () => DocumentState[];
  getDocumentProgress: (docId: string) => { completed: number; total: number };
  getDocumentStatus: (docId: string) => NodeStatus;
  areAllDocumentsComplete: () => boolean;

  // Module/Lesson selectors (Stage 6)
  getModule: (moduleId: string) => ModuleState | undefined;
  getModules: () => ModuleState[];
  getLesson: (lessonId: string) => LessonState | undefined;
  getLessonsByModule: (moduleId: string) => LessonState[];
  getLessonStatus: (lessonId: string) => NodeStatus;
  areAllLessonsComplete: () => boolean;

  // Workflow selectors
  getCurrentStage: () => StageId | null;
  getWorkflowProgress: () => { current: number; total: number };
  isWorkflowComplete: () => boolean;
}

export const useGenerationStore = create<GenerationState>()(
  immer((set, get) => ({
    courseId: null,
    stages: new Map(),
    documents: new Map(),
    modules: new Map(),
    lessons: new Map(),
    hasDocuments: true,

    // ========== INITIALIZATION ==========

    setCourseId: (id, hasDocuments) => {
      set((state) => {
        state.courseId = id;
        state.hasDocuments = hasDocuments;
        state.stages = initializeStages(hasDocuments);
        state.documents = new Map();
        state.modules = new Map();
        state.lessons = new Map();
        state.workflowStartedAt = new Date();
      });
    },

    reset: () => {
      set((state) => {
        state.courseId = null;
        state.stages = new Map();
        state.documents = new Map();
        state.modules = new Map();
        state.lessons = new Map();
        state.hasDocuments = true;
        state.workflowStartedAt = undefined;
        state.workflowCompletedAt = undefined;
      });
    },

    // ========== TRACE PROCESSING ==========

    addTrace: (trace) => {
      set((state) => {
        const attempt = traceToAttempt(trace);

        switch (trace.stage) {
          case 'stage_1':
          case 'stage_3':
          case 'stage_4':
          case 'stage_5':
            // Simple stage update
            updateSimpleStage(state, trace.stage, trace, attempt);
            break;

          case 'stage_2':
            // Document processing
            updateDocumentFromTrace(state, trace, attempt);
            break;

          case 'stage_6':
            // Lesson generation
            if (trace.lesson_id) {
              updateLessonFromTrace(state, trace, attempt);
            }
            break;
        }
      });
    },

    loadFromTraces: (traces) => {
      const sorted = [...traces].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      set((state) => {
        // Reset parallel items
        state.documents = new Map();
        state.lessons = new Map();

        for (const trace of sorted) {
          const attempt = traceToAttempt(trace);

          switch (trace.stage) {
            case 'stage_1':
            case 'stage_3':
            case 'stage_4':
            case 'stage_5':
              updateSimpleStage(state, trace.stage, trace, attempt);
              break;

            case 'stage_2':
              updateDocumentFromTrace(state, trace, attempt);
              break;

            case 'stage_6':
              if (trace.lesson_id) {
                updateLessonFromTrace(state, trace, attempt);
              }
              break;
          }
        }
      });
    },

    setModuleStructure: (modulesData) => {
      set((state) => {
        state.modules = new Map();
        state.lessons = new Map();

        modulesData.forEach((mod, idx) => {
          const moduleId = mod.id || `module_${idx}`;

          state.modules.set(moduleId, {
            id: moduleId,
            title: mod.title,
            status: 'pending',
            totalLessons: mod.lessons?.length || 0,
            completedLessons: 0,
            isCollapsed: modulesData.length > 5
          });

          mod.lessons?.forEach((les) => {
            state.lessons.set(les.id, {
              id: les.id,
              moduleId,
              title: les.title,
              status: 'pending',
              attempts: []
            });
          });
        });
      });
    },

    // ========== SELECTORS ==========

    getStageStatus: (stageId) => {
      return get().stages.get(stageId)?.status || 'pending';
    },

    getStageAttempts: (stageId) => {
      return get().stages.get(stageId)?.attempts || [];
    },

    isStageComplete: (stageId) => {
      const stage = get().stages.get(stageId);
      return stage?.status === 'completed' || stage?.status === 'skipped';
    },

    getDocument: (docId) => get().documents.get(docId),

    getDocuments: () => Array.from(get().documents.values()),

    getDocumentProgress: (docId) => {
      const doc = get().documents.get(docId);
      return {
        completed: doc ? doc.completedSteps + 1 : 0,
        total: 7
      };
    },

    getDocumentStatus: (docId) => {
      return get().documents.get(docId)?.status || 'pending';
    },

    areAllDocumentsComplete: () => {
      const { documents, hasDocuments } = get();
      if (!hasDocuments) return true;
      if (documents.size === 0) return false;
      return Array.from(documents.values()).every(d => d.status === 'completed');
    },

    getModule: (moduleId) => get().modules.get(moduleId),

    getModules: () => Array.from(get().modules.values()),

    getLesson: (lessonId) => get().lessons.get(lessonId),

    getLessonsByModule: (moduleId) => {
      return Array.from(get().lessons.values()).filter(l => l.moduleId === moduleId);
    },

    getLessonStatus: (lessonId) => {
      return get().lessons.get(lessonId)?.status || 'pending';
    },

    areAllLessonsComplete: () => {
      const { lessons } = get();
      if (lessons.size === 0) return false;
      return Array.from(lessons.values()).every(l => l.status === 'completed');
    },

    getCurrentStage: () => {
      const { stages } = get();
      for (const [stageId, stage] of stages) {
        if (stage.status === 'active' || stage.status === 'awaiting') {
          return stageId;
        }
      }
      return null;
    },

    getWorkflowProgress: () => {
      const { stages, hasDocuments } = get();
      const total = hasDocuments ? 6 : 4; // Skip stages 2, 3 if no docs
      let completed = 0;

      for (const stage of stages.values()) {
        if (stage.status === 'completed' || stage.status === 'skipped') {
          completed++;
        }
      }

      return { current: completed, total };
    },

    isWorkflowComplete: () => {
      const { stages } = get();
      return Array.from(stages.values()).every(
        s => s.status === 'completed' || s.status === 'skipped'
      );
    }
  }))
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function initializeStages(hasDocuments: boolean): Map<StageId, StageState> {
  const stages = new Map<StageId, StageState>();

  const stageIds: StageId[] = ['stage_1', 'stage_2', 'stage_3', 'stage_4', 'stage_5', 'stage_6'];

  stageIds.forEach((id) => {
    const isSkipped = !hasDocuments && (id === 'stage_2' || id === 'stage_3');

    stages.set(id, {
      id,
      status: isSkipped ? 'skipped' : 'pending',
      attempts: []
    });
  });

  return stages;
}

function updateSimpleStage(
  state: GenerationState,
  stageId: StageId,
  trace: GenerationTrace,
  attempt: AttemptData
) {
  const stage = state.stages.get(stageId);
  if (!stage) return;

  stage.attempts.push(attempt);
  stage.currentStep = trace.step_name;

  if (trace.error_data) {
    stage.status = 'error';
  } else if (isStageCompletePhase(trace.phase)) {
    stage.status = 'completed';
    stage.completedAt = new Date();
  } else {
    stage.status = 'active';
    if (!stage.startedAt) stage.startedAt = new Date();
  }
}

function updateDocumentFromTrace(
  state: GenerationState,
  trace: GenerationTrace,
  attempt: AttemptData
) {
  const docId = extractDocumentId(trace);
  if (!docId) return;

  const phase = (trace.phase || trace.step_name || 'unknown').toLowerCase();
  const stepIndex = PHASE_TO_STEP_INDEX[phase] ?? -1;
  if (stepIndex === -1) return;

  const existing = state.documents.get(docId);
  const docName = extractDocumentName(trace);

  const stepStatus: NodeStatus = trace.error_data
    ? 'error'
    : trace.output_data
      ? 'completed'
      : 'active';

  const stageId = `${docId}_${phase}`;
  const newStage: DocumentStageData = {
    stageId,
    stageName: translateStepName(phase),
    stageNumber: stepIndex + 1,
    status: stepStatus,
    attempts: [attempt],
    inputData: trace.input_data,
    outputData: trace.output_data
  };

  if (existing) {
    const stageIdx = existing.stages.findIndex(s => s.stageId === stageId);

    if (stageIdx >= 0) {
      existing.stages[stageIdx].attempts.push(attempt);
      existing.stages[stageIdx].status = stepStatus;
      existing.stages[stageIdx].inputData = trace.input_data;
      existing.stages[stageIdx].outputData = trace.output_data;
    } else {
      existing.stages.push(newStage);
      existing.stages.sort((a, b) => a.stageNumber - b.stageNumber);
    }

    existing.completedSteps = Math.max(existing.completedSteps, stepIndex);
    existing.currentPhase = phase;
    existing.status = calculateDocumentStatus(existing.stages, existing.completedSteps);

    if (docName && existing.name.startsWith('Документ ')) {
      existing.name = docName;
    }
  } else {
    state.documents.set(docId, {
      id: docId,
      name: docName || `Документ ${docId.substring(0, 8)}...`,
      status: stepStatus === 'error' ? 'error' : 'active',
      completedSteps: stepIndex,
      totalSteps: 7,
      currentPhase: phase,
      priority: trace.input_data?.priority,
      stages: [newStage]
    });
  }

  // Update Stage 2 overall status
  const stage2 = state.stages.get('stage_2');
  if (stage2) {
    const allDocs = Array.from(state.documents.values());
    if (allDocs.some(d => d.status === 'error')) {
      stage2.status = 'error';
    } else if (allDocs.every(d => d.status === 'completed')) {
      stage2.status = 'completed';
    } else {
      stage2.status = 'active';
    }
  }
}

function updateLessonFromTrace(
  state: GenerationState,
  trace: GenerationTrace,
  attempt: AttemptData
) {
  const lessonId = trace.lesson_id!;
  const existing = state.lessons.get(lessonId);

  if (existing) {
    existing.attempts.push(attempt);
    existing.currentStep = trace.step_name;

    if (trace.error_data) {
      existing.status = 'error';
    } else if (isLessonCompletePhase(trace.phase)) {
      existing.status = 'completed';

      // Update module progress
      const module = state.modules.get(existing.moduleId);
      if (module) {
        const moduleLessons = Array.from(state.lessons.values())
          .filter(l => l.moduleId === existing.moduleId);
        module.completedLessons = moduleLessons.filter(l => l.status === 'completed').length;

        if (module.completedLessons === module.totalLessons) {
          module.status = 'completed';
        }
      }
    } else {
      existing.status = 'active';
    }
  }

  // Update Stage 6 overall status
  const stage6 = state.stages.get('stage_6');
  if (stage6) {
    const allLessons = Array.from(state.lessons.values());
    if (allLessons.some(l => l.status === 'error')) {
      stage6.status = 'error';
    } else if (allLessons.length > 0 && allLessons.every(l => l.status === 'completed')) {
      stage6.status = 'completed';
    } else if (allLessons.some(l => l.status === 'active')) {
      stage6.status = 'active';
    }
  }
}

// ... rest of helper functions (extractDocumentId, etc.)
```

## Migration Strategy

### Approach: Incremental Migration

Instead of big-bang replacement, migrate incrementally:

1. **Week 1**: Create unified store, migrate Stage 2 only
2. **Week 2**: Migrate Stage 6 (modules/lessons)
3. **Week 3**: Migrate simple stages (1, 3, 4, 5)
4. **Week 4**: Remove old useGraphData state, final cleanup

### Feature Flags

Use feature flag to switch between old and new systems:

```typescript
const USE_UNIFIED_STORE = process.env.NEXT_PUBLIC_USE_UNIFIED_STORE === 'true';
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/web/stores/useGenerationStore.ts` | CREATE | Unified Zustand store |
| `packages/web/stores/useDocumentProcessingStore.ts` | DELETE | Remove partial store |
| `packages/web/stores/useNodeSelection.ts` | KEEP | Already good |
| `packages/web/components/generation-graph/hooks/useGraphData.ts` | MODIFY | Use store instead of local state |
| `packages/web/components/generation-graph/nodes/DocumentNode.tsx` | MODIFY | Use unified store |
| `packages/web/components/generation-graph/nodes/LessonNode.tsx` | MODIFY | Use unified store |
| `packages/web/components/generation-graph/nodes/StageNode.tsx` | MODIFY | Use unified store |
| `packages/web/components/generation-graph/panels/NodeDetailsModal/` | MODIFY | Use unified store |
| `packages/web/components/generation-monitoring/realtime-provider.tsx` | MODIFY | Feed traces to unified store |

## Extended Acceptance Criteria

### Stage 1 (Upload)
- [ ] Status updates to active when processing
- [ ] Status updates to completed when done

### Stage 2 (Documents)
- [ ] Each document shows correct progress (1/7 → 7/7)
- [ ] Document turns green when complete
- [ ] Modal shows all stages
- [ ] Stage 2 completes when ALL documents done

### Stage 3 (Classification)
- [ ] Status updates correctly
- [ ] Awaiting approval state works

### Stage 4 (Analysis)
- [ ] Status updates correctly

### Stage 5 (Structure)
- [ ] Status updates correctly
- [ ] Module structure populates Stage 6

### Stage 6 (Generation)
- [ ] Modules/lessons created from Stage 5 output
- [ ] Each lesson shows progress
- [ ] Module progress tracks lesson completion
- [ ] Stage 6 completes when ALL lessons done

### Cross-cutting
- [ ] Page refresh preserves all state
- [ ] No React batching issues
- [ ] TypeScript compiles
- [ ] No console.log (only logger)

## Extended Effort Estimate

- Phase 1 (Unified store): 3-4 hours
- Phase 2 (Stage 2 migration): 2 hours
- Phase 3 (Stage 6 migration): 2 hours
- Phase 4 (Simple stages): 1 hour
- Phase 5 (Modal updates): 1 hour
- Phase 6 (Cleanup): 1 hour
- Testing: 2 hours

**Total: ~12-14 hours** (2-3 days)
