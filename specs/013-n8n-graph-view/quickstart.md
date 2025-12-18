# Quickstart: n8n-Style Graph Pipeline View

**Date**: 2025-11-28

## Prerequisites

- Node.js 20+ (LTS)
- pnpm 8+
- Running Supabase instance (local or remote)
- Access to `packages/web` in the monorepo

## 1. Install New Dependencies

```bash
# From repository root
cd packages/web

# Install React Flow and ElkJS
pnpm add @xyflow/react elkjs

# Verify installation
pnpm list @xyflow/react elkjs
```

## 2. Copy Type Definitions

The types from `data-model.md` should be added to:

```bash
# Create shared types file
packages/shared-types/src/generation-graph.ts
```

Then export from `packages/shared-types/src/index.ts`:

```typescript
export * from './generation-graph';
```

## 3. Create Feature Directory Structure

```bash
# Create directories
mkdir -p packages/web/components/generation-graph/{nodes,edges,panels,controls,contexts,hooks,workers,utils}
mkdir -p packages/web/lib/generation-graph
mkdir -p packages/web/tests/unit/generation-graph
```

## 4. Basic GraphView Component (Starter)

Create `packages/web/components/generation-graph/GraphView.tsx`:

```tsx
'use client';

import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// Import custom nodes (to be created)
// import { StageNode } from './nodes/StageNode';

// Define node types outside component to prevent re-renders
const nodeTypes = {
  // stage: StageNode,
};

interface GraphViewProps {
  courseId: string;
  initialNodes?: Node[];
  initialEdges?: Edge[];
}

export function GraphView({ courseId, initialNodes = [], initialEdges = [] }: GraphViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  return (
    <div className="h-full w-full" data-testid="graph-container">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={4}
        nodesFocusable={true}
        edgesFocusable={true}
      >
        <Controls data-testid="graph-controls" />
        <MiniMap data-testid="graph-minimap" />
        <Background gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}
```

## 5. Basic ElkJS Layout Hook (Starter)

Create `packages/web/components/generation-graph/hooks/useGraphLayout.ts`:

```typescript
'use client';

import { useEffect, useState, useCallback } from 'react';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { Node, Edge } from '@xyflow/react';

const elk = new ELK();

const DEFAULT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.spacing.nodeNode': '50',
  'elk.layered.spacing.nodeNodeBetweenLayers': '100',
};

interface ElkNode {
  id: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
}

interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
}

interface ElkGraph {
  id: string;
  layoutOptions: Record<string, string>;
  children: ElkNode[];
  edges: ElkEdge[];
}

export function useGraphLayout(
  nodes: Node[],
  edges: Edge[],
  options: Record<string, string> = {}
) {
  const [layoutedNodes, setLayoutedNodes] = useState<Node[]>(nodes);
  const [isLayouting, setIsLayouting] = useState(false);

  const getLayoutedElements = useCallback(async () => {
    if (nodes.length === 0) return;

    setIsLayouting(true);

    // Convert to ELK format
    const elkGraph: ElkGraph = {
      id: 'root',
      layoutOptions: { ...DEFAULT_OPTIONS, ...options },
      children: nodes.map((node) => ({
        id: node.id,
        width: node.measured?.width ?? 200,
        height: node.measured?.height ?? 100,
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
    };

    try {
      const layoutedGraph = await elk.layout(elkGraph);

      // Apply positions back to nodes
      const positioned = nodes.map((node) => {
        const elkNode = layoutedGraph.children?.find((n) => n.id === node.id);
        return {
          ...node,
          position: {
            x: elkNode?.x ?? 0,
            y: elkNode?.y ?? 0,
          },
        };
      });

      setLayoutedNodes(positioned);
    } catch (error) {
      console.error('Layout calculation failed:', error);
    } finally {
      setIsLayouting(false);
    }
  }, [nodes, edges, options]);

  useEffect(() => {
    getLayoutedElements();
  }, [getLayoutedElements]);

  return { layoutedNodes, isLayouting, recalculate: getLayoutedElements };
}
```

## 6. Translations File (Starter)

Create `packages/web/lib/generation-graph/translations.ts`:

```typescript
export const GRAPH_TRANSLATIONS = {
  stages: {
    stage_1: { ru: 'Инициализация', en: 'Initialization' },
    stage_2: { ru: 'Обработка документов', en: 'Document Processing' },
    stage_3: { ru: 'Суммаризация', en: 'Summarization' },
    stage_4: { ru: 'Анализ', en: 'Analysis' },
    stage_5: { ru: 'Генерация структуры', en: 'Structure Generation' },
    stage_6: { ru: 'Генерация контента', en: 'Content Generation' },
  },
  status: {
    pending: { ru: 'Ожидание', en: 'Pending' },
    active: { ru: 'Выполняется', en: 'In Progress' },
    completed: { ru: 'Завершено', en: 'Completed' },
    error: { ru: 'Ошибка', en: 'Error' },
    awaiting: { ru: 'Ожидает подтверждения', en: 'Awaiting Approval' },
  },
  actions: {
    approve: { ru: 'Подтвердить', en: 'Approve' },
    reject: { ru: 'Отклонить', en: 'Reject' },
    retry: { ru: 'Повторить', en: 'Retry' },
    viewDetails: { ru: 'Подробнее', en: 'View Details' },
    fitView: { ru: 'По размеру', en: 'Fit View' },
    zoomIn: { ru: 'Увеличить', en: 'Zoom In' },
    zoomOut: { ru: 'Уменьшить', en: 'Zoom Out' },
  },
  drawer: {
    input: { ru: 'Входные данные', en: 'Input' },
    process: { ru: 'Обработка', en: 'Process' },
    output: { ru: 'Результат', en: 'Output' },
    attempts: { ru: 'Попытки', en: 'Attempts' },
  },
  refinementChat: {
    buttonTooltip: { ru: 'Уточнить результат', en: 'Refine result' },
    panelTitle: { ru: 'Уточнение', en: 'Refinement' },
    placeholder: { ru: 'Опишите, что изменить...', en: 'Describe what to change...' },
    send: { ru: 'Отправить', en: 'Send' },
    quickActions: {
      shorter: { ru: 'Короче', en: 'Shorter' },
      moreExamples: { ru: 'Больше примеров', en: 'More examples' },
      simplify: { ru: 'Упростить', en: 'Simplify' },
      moreDetail: { ru: 'Подробнее', en: 'More detail' },
    },
  },
  errors: {
    connectionLost: { ru: 'Соединение потеряно', en: 'Connection lost' },
    reconnecting: { ru: 'Переподключение...', en: 'Reconnecting...' },
    retryFailed: { ru: 'Повтор не удался', en: 'Retry failed' },
  },
} as const;

type Locale = 'ru' | 'en';

export function useTranslation(locale: Locale = 'ru') {
  return {
    t: (key: string): string => {
      const keys = key.split('.');
      let result: any = GRAPH_TRANSLATIONS;

      for (const k of keys) {
        result = result?.[k];
      }

      if (result && typeof result === 'object' && locale in result) {
        return result[locale];
      }

      return key; // Fallback to key if not found
    },
  };
}
```

## 7. Running Development Server

```bash
# From packages/web
pnpm dev

# Navigate to a course generation page
# http://localhost:3000/courses/generating/[slug]
```

## 8. Running Tests

```bash
# Unit tests
pnpm test -- --dir components/generation-graph

# E2E tests (when created)
pnpm test:e2e -- --grep "generation-graph"
```

## 9. Type Checking

```bash
# Verify types
pnpm type-check

# Should pass with no errors
```

## 10. Mock Data for Development

Create test fixtures in `packages/web/tests/fixtures/graph-mock-data.ts`:

```typescript
import type { Node, Edge } from '@xyflow/react';

export const MOCK_NODES: Node[] = [
  {
    id: 'stage_1',
    type: 'stage',
    position: { x: 0, y: 0 },
    data: {
      label: 'Initialization',
      status: 'completed',
      stageNumber: 1,
      color: '#6B7280',
    },
  },
  {
    id: 'stage_2',
    type: 'stage',
    position: { x: 250, y: 0 },
    data: {
      label: 'Document Processing',
      status: 'active',
      stageNumber: 2,
      progress: 65,
      color: '#3B82F6',
    },
  },
  // ... more nodes
];

export const MOCK_EDGES: Edge[] = [
  { id: 'e1-2', source: 'stage_1', target: 'stage_2', animated: false },
  // ... more edges
];
```

## Next Steps

1. **Implement StageNode component** - Basic node with status indicators
2. **Connect to realtime provider** - Use existing `useGenerationRealtime`
3. **Add drawer component** - Adapt from `StageResultsDrawer`
4. **Implement parallel branching** - Stage 2 documents, Stage 6 lessons
5. **Add approval controls** - Integrate with `MissionControlBanner`

See `plan.md` for full implementation phases and task breakdown.
