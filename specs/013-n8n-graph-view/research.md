# Research: n8n-Style Graph Pipeline View

**Date**: 2025-11-28
**Status**: Complete

## R1: React Flow Best Practices

### Decision: Use @xyflow/react v12+ with memoized custom nodes

### Key Findings

#### Custom Node Implementation
```typescript
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

interface StageNodeData {
  label: string;
  status: 'pending' | 'active' | 'completed' | 'error' | 'awaiting';
  progress?: number;
  color: string;
}

// MUST wrap in memo to prevent unnecessary re-renders
const StageNode = memo(({ data, id }: NodeProps<StageNodeData>) => {
  return (
    <div data-testid={`node-${id}`} data-node-status={data.status}>
      <Handle type="target" position={Position.Left} />
      <div className="node-content">
        <span>{data.label}</span>
        <span>{data.status}</span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

export default StageNode;
```

#### Node Types Memoization (Critical for Performance)
```typescript
// WRONG: Creates new object on every render
<ReactFlow nodeTypes={{ stage: StageNode }} />

// CORRECT: Define outside component or use useMemo
const nodeTypes = { stage: StageNode, document: DocumentNode };

function GraphView() {
  return <ReactFlow nodeTypes={nodeTypes} />;
}
```

#### Custom Edge Implementation
```typescript
import { BaseEdge, getStraightPath, type EdgeProps } from '@xyflow/react';

export function AnimatedEdge({
  id, sourceX, sourceY, targetX, targetY, data
}: EdgeProps) {
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      className={data?.animated ? 'animated-edge' : ''}
    />
  );
}
```

#### Semantic Zoom via useStore
```typescript
import { useStore } from '@xyflow/react';

function StageNode({ data }) {
  const zoom = useStore((s) => s.transform[2]);

  // Simplified rendering at low zoom
  if (zoom < 0.5) return <MinimalNode status={data.status} />;
  if (zoom < 0.7) return <MediumNode {...data} />;
  return <FullNode {...data} />;
}
```

### Alternatives Considered
- **reaflow**: Good but less popular (66 snippets vs 516 for React Flow)
- **vis.js**: Lower-level, more work to implement
- **D3.js**: Too low-level for our use case

### Rationale
React Flow is the industry standard with 771K+ weekly downloads, excellent TypeScript support, and comprehensive documentation. The xyflow team actively maintains it.

---

## R2: ElkJS Web Worker Integration

### Decision: Use elkjs with workerUrl for async layout

### Key Findings

#### Basic Web Worker Setup
```typescript
// In component
import ELK from 'elkjs/lib/elk-api';

const elk = new ELK({
  workerUrl: '/elk-worker.min.js' // served from public folder
});

// Layout options for pipeline-style graphs
const layoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.spacing.nodeNode': '50',
  'elk.layered.spacing.nodeNodeBetweenLayers': '100',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN', // for module groups
};
```

#### Next.js 15 Integration
For Next.js, we can use a custom Web Worker or the bundled version:

```typescript
// Option 1: Use bundled version (simpler, runs on main thread)
import ELK from 'elkjs/lib/elk.bundled.js';
const elk = new ELK();

// Option 2: Custom Web Worker (recommended for performance)
// workers/layout.worker.ts
import ELK from 'elkjs/lib/elk.bundled.js';

self.onmessage = async (e: MessageEvent) => {
  const elk = new ELK();
  try {
    const layout = await elk.layout(e.data);
    self.postMessage({ success: true, layout });
  } catch (error) {
    self.postMessage({ success: false, error: error.message });
  }
};
```

#### Hook for Layout Calculation
```typescript
// hooks/useGraphLayout.ts
import { useEffect, useState, useRef } from 'react';

export function useGraphLayout(graphData: ElkGraph) {
  const [layout, setLayout] = useState<ElkGraph | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Initialize worker once
    workerRef.current = new Worker(
      new URL('../workers/layout.worker.ts', import.meta.url)
    );

    workerRef.current.onmessage = (e) => {
      if (e.data.success) {
        setLayout(e.data.layout);
      }
      setIsLoading(false);
    };

    return () => workerRef.current?.terminate();
  }, []);

  useEffect(() => {
    if (graphData && workerRef.current) {
      setIsLoading(true);
      workerRef.current.postMessage(graphData);
    }
  }, [graphData]);

  return { layout, isLoading };
}
```

### Alternatives Considered
- **dagre**: Simpler but less powerful, no hierarchical support
- **d3-dag**: Good but elkjs has better documentation
- **Manual positioning**: Not scalable for dynamic graphs

### Rationale
ElkJS is the most powerful layout engine for hierarchical graphs. Web Worker prevents UI blocking during complex calculations.

---

## R3: Existing Pattern Analysis

### Decision: Reuse existing hooks and adapt components

### Reusable Patterns

#### 1. `useGenerationRealtime` Hook
Location: `packages/web/components/generation-monitoring/realtime-provider.tsx`

```typescript
// Already provides:
- traces: GenerationTrace[]
- status: GenerationStatus | null
- isConnected: boolean
- refetch: () => Promise<void>

// Can be reused directly - no changes needed
```

#### 2. `STAGE_CONFIG`
Location: `packages/web/components/generation-celestial/utils.ts`

```typescript
// Current config:
export const STAGE_CONFIG = {
  stage_1: { number: 1, name: 'Инициализация', icon: 'Upload' },
  stage_2: { number: 2, name: 'Обработка документов', icon: 'FileText' },
  stage_3: { number: 3, name: 'Суммаризация', icon: 'Moon' },
  stage_4: { number: 4, name: 'Анализ', icon: 'Orbit' },
  stage_5: { number: 5, name: 'Генерация структуры', icon: 'Layers' },
  stage_6: { number: 6, name: 'Генерация контента', icon: 'Globe' },
};

// Will extend with:
- color field
- new icons (Play, Sparkles, Brain, GitBranch, PenTool)
- type field (trigger, document, ai, structure, content)
```

#### 3. `StageResultsDrawer` Structure
Location: `packages/web/components/generation-celestial/StageResultsDrawer.tsx`

Will adapt the drawer pattern for NodeDetailsDrawer with:
- Same tab structure (Input/Process/Output)
- Add RefinementChat section
- Add retry history view

#### 4. `MissionControlBanner`
Location: `packages/web/components/generation-celestial/MissionControlBanner.tsx`

Will reuse for approval actions:
- Primary Approve/Reject buttons
- Progress display

### Components to Create New
- `GraphView.tsx` - Main React Flow container
- All node types (StageNode, DocumentNode, etc.)
- All edge types (AnimatedEdge, DataFlowEdge)
- Split contexts (StaticGraphContext, RealtimeStatusContext)
- Layout hooks (useGraphLayout, useSemanticZoom)

---

## R4: Performance Optimization

### Decision: Split contexts + React.memo + primitive props

### Key Patterns

#### 1. Split Context Pattern
```typescript
// StaticGraphContext - changes rarely
interface StaticGraphData {
  stageConfig: StageConfig[];
  translations: GraphTranslations;
  nodeStyles: Record<string, NodeStyle>;
}

// RealtimeStatusContext - changes frequently
interface RealtimeStatusData {
  nodeStatuses: Map<string, NodeStatus>;
  activeNodeId: string | null;
  lastUpdated: Date;
}
```

#### 2. Selective Subscription Hook
```typescript
// Instead of subscribing to entire status context
const useNodeStatus = (nodeId: string) => {
  const statuses = useContext(RealtimeStatusContext);
  // Only triggers re-render when THIS node's status changes
  return useMemo(
    () => statuses.nodeStatuses.get(nodeId),
    [statuses.nodeStatuses, nodeId]
  );
};
```

#### 3. React.memo with Primitive Props
```typescript
// WRONG: Object prop causes re-renders
<CustomNode data={{ node: complexObject }} />

// CORRECT: Primitive props
interface NodeProps {
  nodeId: string;
  label: string;
  status: NodeStatus;
  color: string;
  progress: number;
}

const CustomNode = memo<NodeProps>(({ nodeId, label, status, color, progress }) => {
  // Only re-renders when primitives change
  return <div>...</div>;
});
```

#### 4. Batching High-Frequency Updates
```typescript
const BATCH_INTERVAL = 100; // ms

function useBatchedTraces(rawTraces: GenerationTrace[]) {
  const [batchedTraces, setBatchedTraces] = useState<GenerationTrace[]>([]);
  const pendingRef = useRef<GenerationTrace[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (pendingRef.current.length > 0) {
        setBatchedTraces(prev => {
          const merged = [...pendingRef.current, ...prev];
          // Dedupe by ID, sort by created_at
          return dedupeAndSort(merged);
        });
        pendingRef.current = [];
      }
    }, BATCH_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    pendingRef.current.push(...rawTraces);
  }, [rawTraces]);

  return batchedTraces;
}
```

### Expected Results
- Status update for Node A does NOT re-render Node B, C, D
- Re-renders reduced from 50+ to 1-2 per update
- 60fps maintained even with 100+ nodes

---

## R5: Accessibility in Graph UIs

### Decision: List View toggle + ARIA labels + keyboard navigation

### Key Findings

#### 1. List View as Accessible Alternative
Canvas-based graphs are inherently inaccessible to screen readers. Solution: provide an equivalent list view.

```typescript
// Desktop toggle
<div className="flex gap-2">
  <Button
    variant={view === 'graph' ? 'default' : 'outline'}
    onClick={() => setView('graph')}
    aria-pressed={view === 'graph'}
  >
    Graph View
  </Button>
  <Button
    variant={view === 'list' ? 'default' : 'outline'}
    onClick={() => setView('list')}
    aria-pressed={view === 'list'}
  >
    List View
  </Button>
</div>

// Screen reader announcement
<div role="status" aria-live="polite" className="sr-only">
  {view === 'list' ? 'Switched to List View for accessibility' : ''}
</div>
```

#### 2. ARIA Labels for Nodes
```typescript
<div
  role="button"
  aria-label={`Stage ${data.stageNumber}: ${data.label}. Status: ${data.status}`}
  aria-describedby={`node-details-${id}`}
  tabIndex={0}
  onKeyDown={(e) => e.key === 'Enter' && onSelect(id)}
>
  {/* Node content */}
</div>
```

#### 3. Keyboard Navigation
```typescript
// React Flow built-in keyboard support
<ReactFlow
  nodesFocusable={true}
  edgesFocusable={true}
  // Tab to navigate between nodes
  // Enter/Space to select
  // Arrow keys to pan (when node focused)
/>
```

#### 4. Color Contrast (WCAG AA)
```typescript
const NODE_COLORS = {
  pending: { bg: '#F3F4F6', border: '#9CA3AF', text: '#1F2937' }, // 7:1
  active: { bg: '#DBEAFE', border: '#3B82F6', text: '#1E40AF' },  // 4.5:1
  completed: { bg: '#D1FAE5', border: '#10B981', text: '#065F46' }, // 4.5:1
  error: { bg: '#FEE2E2', border: '#EF4444', text: '#991B1B' },    // 4.5:1
  awaiting: { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E' }, // 4.5:1
};
```

---

## Library Decisions Summary

| Library | Version | Weekly Downloads | Decision |
|---------|---------|------------------|----------|
| @xyflow/react | 12.x | 771K+ | **USE** - Industry standard |
| elkjs | 0.9.x | 150K+ | **USE** - Best hierarchical layout |
| framer-motion | 12.x | (existing) | **USE** - Already in project |
| lucide-react | 0.554 | (existing) | **USE** - Already in project |
| dagre | - | 200K+ | **REJECTED** - Less powerful than elkjs |

---

## Open Questions Resolved

| Question | Resolution |
|----------|------------|
| How to handle 100+ nodes? | Semantic zoom + virtualization + Web Worker |
| How to prevent re-renders? | Split contexts + React.memo + primitive props |
| How to make accessible? | List View toggle + ARIA labels |
| How to batch updates? | 100ms debounce + deduplication |
| How to persist viewport? | Session storage |
