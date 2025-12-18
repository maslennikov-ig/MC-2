# React Flow + ElkJS Integration Corrections

**Priority**: CRITICAL - Blocks production deployment
**Estimated Time**: 1.5-2 hours
**Type**: Architecture correction based on research findings

---

## Context

You are correcting the existing React Flow + ElkJS integration in the `generation-graph` feature. The code was implemented but **missing critical Next.js 15 App Router patterns** discovered during research.

### Current State
- Code exists and passes type-check/build
- BUT has potential runtime issues in production:
  - SSR hydration errors (React Flow uses browser APIs)
  - Missing webpack configuration for ElkJS
  - Missing React Flow v12 best practices

### Why This Matters
- **Production deployment** - not MVP
- React Flow CANNOT render server-side (uses `window`, `document`)
- ElkJS has optional `web-worker` dependency that breaks webpack
- React Flow v12 changed how node dimensions work (`node.measured`)

---

## Research Summary

Source: `/specs/013-n8n-graph-view/research/React Flow + ElkJS integration in Next.js 15 App Router.md`

### Key Findings

1. **Next.js 15 SSR Rules**: `ssr: false` with `next/dynamic` is ONLY allowed inside Client Components
2. **ElkJS webpack**: Requires `webpack.IgnorePlugin` to suppress `web-worker` module error
3. **React Flow v12**: Node dimensions now in `node.measured.width/height`, not `node.width/height`
4. **Hooks require Provider**: `useReactFlow()`, `useNodesInitialized()` must be inside `<ReactFlowProvider>`
5. **fitView timing**: Must use `requestAnimationFrame` to avoid visual glitches
6. **Turbopack limitation**: Doesn't support webpack plugins - need fallback script

---

## Current Architecture

```
packages/web/
├── components/generation-graph/
│   ├── GraphView.tsx           # Main component ('use client')
│   ├── GraphSkeleton.tsx       # Loading skeleton
│   ├── index.ts                # Exports
│   ├── contexts/
│   │   ├── StaticGraphContext.tsx
│   │   └── RealtimeStatusContext.tsx
│   ├── controls/
│   │   ├── GraphControls.tsx
│   │   └── GraphMinimap.tsx
│   ├── edges/
│   │   ├── AnimatedEdge.tsx
│   │   └── DataFlowEdge.tsx
│   ├── hooks/
│   │   ├── useGraphData.ts
│   │   ├── useGraphLayout.ts   # Web Worker integration
│   │   ├── useKeyboardShortcuts.ts
│   │   ├── useNodeSelection.ts
│   │   └── useNodeStatus.ts
│   ├── nodes/
│   │   ├── StageNode.tsx
│   │   ├── MergeNode.tsx
│   │   └── EndNode.tsx
│   ├── panels/
│   │   └── NodeDetailsDrawer.tsx
│   ├── workers/
│   │   └── layout.worker.ts    # Uses elk.bundled.js (CORRECT)
│   └── types.ts
├── lib/generation-graph/
│   ├── constants.ts
│   ├── translations.ts
│   ├── utils.ts
│   └── useTranslation.ts
└── app/courses/generating/[slug]/
    └── GenerationProgressContainerEnhanced.tsx  # Consumer
```

---

## Tasks

### Task 1: Add webpack.IgnorePlugin for ElkJS

**File**: `/packages/web/next.config.ts`

**Problem**: ElkJS optionally requires `web-worker` package for Node.js. In browser, this causes:
```
Module not found: Can't resolve 'web-worker'
```

**Solution**: Add webpack.IgnorePlugin to suppress this optional dependency.

**Implementation**:

```typescript
// At the TOP of next.config.ts, add import:
import webpack from 'webpack';

// Inside webpack function (around line 213), add BEFORE existing rules:

// === ElkJS Web Worker suppression ===
// ElkJS optionally requires 'web-worker' for Node.js environments.
// In browser (Next.js client), this is unnecessary and causes build errors.
// We use elk.bundled.js which doesn't need the worker.
config.plugins = config.plugins || [];
config.plugins.push(
  new webpack.IgnorePlugin({
    resourceRegExp: /^web-worker$/,
    contextRegExp: /elkjs\/lib$/,
  })
);

// Also add fs fallback for client-side (inside the existing !isServer block):
if (!isServer) {
  config.resolve = config.resolve || {};
  config.resolve.fallback = {
    ...config.resolve.fallback,
    fs: false,
  };

  // ... keep existing ignoreWarnings for Supabase
}
```

**Verification**:
- `pnpm build --filter @megacampus/web` passes without `web-worker` errors

---

### Task 2: Create GraphViewWrapper with Dynamic Import

**File**: `/packages/web/components/generation-graph/GraphViewWrapper.tsx` (CREATE NEW)

**Problem**: React Flow uses browser APIs (`window`, `document`, `ResizeObserver`). Server-side rendering will fail. In Next.js 15, `ssr: false` is ONLY allowed inside Client Components.

**Architecture Pattern** (from research):
```
Server Component (page.tsx)
    └── Client Component with 'use client' (GraphViewWrapper.tsx)
            └── dynamic import with ssr: false
                    └── Actual React Flow component (GraphView.tsx)
```

**Implementation**:

```typescript
'use client';

import dynamic from 'next/dynamic';
import { ComponentProps } from 'react';
import { GraphSkeleton } from './GraphSkeleton';

// Dynamic import MUST be inside a Client Component for ssr: false to work
// This prevents React Flow from being included in server bundle
const GraphViewDynamic = dynamic(
  () => import('./GraphView').then((mod) => ({ default: mod.GraphView })),
  {
    ssr: false,
    loading: () => <GraphSkeleton />,
  }
);

// Re-export props type from GraphView for type safety
export interface GraphViewWrapperProps {
  courseId: string;
  courseTitle?: string;
}

/**
 * Wrapper component that handles SSR-safe loading of React Flow.
 *
 * USE THIS instead of GraphView directly when importing from Server Components
 * or any component that might be rendered on the server.
 *
 * @example
 * // In a page or server component:
 * import { GraphViewWrapper } from '@/components/generation-graph';
 *
 * export default function Page() {
 *   return <GraphViewWrapper courseId="123" courseTitle="My Course" />;
 * }
 */
export function GraphViewWrapper({ courseId, courseTitle }: GraphViewWrapperProps) {
  return <GraphViewDynamic courseId={courseId} courseTitle={courseTitle} />;
}

// Default export for dynamic import compatibility
export default GraphViewWrapper;
```

---

### Task 3: Refactor GraphView with ReactFlowProvider and useNodesInitialized

**File**: `/packages/web/components/generation-graph/GraphView.tsx`

**Problems**:
1. Missing `ReactFlowProvider` - hooks like `useReactFlow()` won't work
2. Missing `useNodesInitialized()` - edges may not render on initial load
3. Missing `requestAnimationFrame` before `fitView` - causes visual glitches

**Implementation** (complete rewrite of GraphView.tsx):

```typescript
'use client';

import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  NodeTypes,
  EdgeTypes,
  useNodesInitialized,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useGraphData } from './hooks/useGraphData';
import StageNode from './nodes/StageNode';
import MergeNode from './nodes/MergeNode';
import EndNode from './nodes/EndNode';
import AnimatedEdge from './edges/AnimatedEdge';
import DataFlowEdge from './edges/DataFlowEdge';
import { StaticGraphProvider } from './contexts/StaticGraphContext';
import { RealtimeStatusProvider } from './contexts/RealtimeStatusContext';
import { GRAPH_STAGE_CONFIG, NODE_STYLES } from '@/lib/generation-graph/constants';
import { GRAPH_TRANSLATIONS } from '@/lib/generation-graph/translations';
import { useGenerationRealtime } from '@/components/generation-monitoring/realtime-provider';
import { RealtimeStatusData, NodeStatusEntry } from '@megacampus/shared-types';
import { mapStatusToNodeStatus, getStageFromStatus, isAwaitingApproval } from '@/lib/generation-graph/utils';
import { GraphControls } from './controls/GraphControls';
import { GraphMinimap } from './controls/GraphMinimap';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { NodeDetailsDrawer } from './panels/NodeDetailsDrawer';
import { useNodeSelection } from './hooks/useNodeSelection';

// Define node and edge types OUTSIDE component to prevent re-creation on each render
// This is critical for React Flow performance
const nodeTypes: NodeTypes = {
  stage: StageNode,
  merge: MergeNode,
  end: EndNode,
};

const edgeTypes: EdgeTypes = {
  animated: AnimatedEdge,
  dataflow: DataFlowEdge,
};

// Props interface
export interface GraphViewProps {
  courseId: string;
  courseTitle?: string;
}

/**
 * Helper component that uses hooks requiring ReactFlow context.
 * Must be rendered inside ReactFlowProvider.
 */
function GraphInteractions() {
  useKeyboardShortcuts();
  return null;
}

/**
 * Inner component that contains the actual React Flow implementation.
 * Separated to use hooks that require ReactFlowProvider context.
 */
function GraphViewInner({ courseId, courseTitle }: GraphViewProps) {
  // === React Flow v12: Wait for node measurement ===
  // Nodes must be measured before layout calculations are accurate
  const nodesInitialized = useNodesInitialized();
  const { fitView } = useReactFlow();
  const initialFitDone = useRef(false);

  // === Realtime Data (from existing monitoring context) ===
  const { traces, status: pipelineStatus, isConnected } = useGenerationRealtime();

  // === Graph State ===
  const { nodes, edges, onNodesChange, onEdgesChange, processTraces } = useGraphData();

  // === Selection State ===
  const { selectNode } = useNodeSelection();

  // === Process incoming traces ===
  useEffect(() => {
    processTraces(traces);
  }, [traces, processTraces]);

  // === Apply fitView after nodes are initialized ===
  // This ensures edges render correctly and prevents visual glitches
  useEffect(() => {
    if (nodesInitialized && !initialFitDone.current && nodes.length > 0) {
      initialFitDone.current = true;
      // Use requestAnimationFrame to ensure DOM is ready
      // This prevents fitView from running before React Flow has measured nodes
      requestAnimationFrame(() => {
        fitView({ padding: 0.1, duration: 200 });
      });
    }
  }, [nodesInitialized, nodes.length, fitView]);

  // === Prepare Realtime Context Data ===
  const realtimeData: RealtimeStatusData = useMemo(() => {
    const nodeStatuses = new Map<string, NodeStatusEntry>();

    const currentStage = getStageFromStatus(pipelineStatus || '');
    const awaitingStage = isAwaitingApproval(pipelineStatus || '');
    const hasError = pipelineStatus === 'failed';

    // Update all stage nodes based on pipeline status
    Object.values(GRAPH_STAGE_CONFIG).forEach((stage) => {
      const status = mapStatusToNodeStatus(
        stage.number,
        currentStage,
        pipelineStatus || 'draft',
        hasError,
        awaitingStage
      );

      nodeStatuses.set(stage.id, {
        status,
        lastUpdated: new Date(),
      });
    });

    // Map pipeline status to strictly typed status
    let mappedStatus: 'idle' | 'running' | 'completed' | 'failed' | 'paused' = 'idle';
    if (pipelineStatus === 'generating' || pipelineStatus === 'processing') {
      mappedStatus = 'running';
    } else if (pipelineStatus === 'completed') {
      mappedStatus = 'completed';
    } else if (pipelineStatus === 'failed') {
      mappedStatus = 'failed';
    }

    return {
      nodeStatuses,
      activeNodeId: null,
      pipelineStatus: mappedStatus,
      overallProgress: 0,
      elapsedTime: 0,
      totalCost: 0,
      isConnected,
      lastUpdated: new Date(),
    };
  }, [pipelineStatus, isConnected]);

  // === Static Data ===
  const staticData = useMemo(
    () => ({
      stageConfig: GRAPH_STAGE_CONFIG,
      translations: GRAPH_TRANSLATIONS,
      nodeStyles: NODE_STYLES,
      courseInfo: {
        id: courseId,
        title: courseTitle || 'Course Generation',
        documentCount: 0,
        moduleCount: 0,
        lessonCount: 0,
      },
    }),
    [courseId, courseTitle]
  );

  return (
    <RealtimeStatusProvider value={realtimeData}>
      <StaticGraphProvider {...staticData}>
        <div className="h-full w-full bg-slate-50 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            minZoom={0.1}
            maxZoom={2}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            onNodeDoubleClick={(_, node) => selectNode(node.id)}
            aria-label="Course generation pipeline graph"
            role="region"
          >
            <Background color="#94a3b8" gap={20} size={1} />
            <GraphControls />
            <GraphMinimap />
            <GraphInteractions />
          </ReactFlow>

          {/* Detail Drawer */}
          <NodeDetailsDrawer />
        </div>
      </StaticGraphProvider>
    </RealtimeStatusProvider>
  );
}

/**
 * Main GraphView component with ReactFlowProvider wrapper.
 *
 * IMPORTANT: Do NOT import this directly in Server Components.
 * Use GraphViewWrapper instead, which handles SSR-safe dynamic import.
 *
 * @example
 * // Direct usage (only in Client Components):
 * import { GraphView } from '@/components/generation-graph/GraphView';
 *
 * // SSR-safe usage (recommended):
 * import { GraphViewWrapper } from '@/components/generation-graph';
 */
export function GraphView(props: GraphViewProps) {
  return (
    <ReactFlowProvider>
      <GraphViewInner {...props} />
    </ReactFlowProvider>
  );
}
```

---

### Task 4: Update useGraphLayout with node.measured (React Flow v12)

**File**: `/packages/web/components/generation-graph/hooks/useGraphLayout.ts`

**Problem**: React Flow v12 moved measured dimensions to `node.measured.width/height`. Layout calculations must use these values.

**Implementation**:

```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
import { useReactFlow, useNodesInitialized } from '@xyflow/react';
import { ElkGraph } from '@megacampus/shared-types';

// Default dimensions for nodes before measurement
const DEFAULT_NODE_WIDTH = 280;
const DEFAULT_NODE_HEIGHT = 120;

export function useGraphLayout() {
  const workerRef = useRef<Worker | null>(null);
  const [isLayouting, setIsLayouting] = useState(false);
  const { fitView, getNodes } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const layoutApplied = useRef(false);

  // Initialize Web Worker
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/layout.worker.ts', import.meta.url)
    );

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  // Calculate layout using ElkJS Web Worker
  const calculateLayout = useCallback(async (graph: ElkGraph): Promise<ElkGraph> => {
    setIsLayouting(true);
    return new Promise<ElkGraph>((resolve, reject) => {
      if (!workerRef.current) {
        setIsLayouting(false);
        return reject(new Error('Layout worker not initialized'));
      }

      const handleMessage = (e: MessageEvent) => {
        setIsLayouting(false);
        workerRef.current?.removeEventListener('message', handleMessage);

        if (e.data.error) {
          reject(new Error(e.data.error));
        } else {
          resolve(e.data as ElkGraph);
        }
      };

      workerRef.current.addEventListener('message', handleMessage);
      workerRef.current.postMessage(graph);
    });
  }, []);

  /**
   * Get node dimensions using React Flow v12 pattern.
   * Prefers measured dimensions, falls back to explicit width/height, then defaults.
   */
  const getNodeDimensions = useCallback((node: {
    measured?: { width?: number; height?: number };
    width?: number;
    height?: number;
  }) => {
    return {
      width: node.measured?.width ?? node.width ?? DEFAULT_NODE_WIDTH,
      height: node.measured?.height ?? node.height ?? DEFAULT_NODE_HEIGHT,
    };
  }, []);

  /**
   * Apply fitView with requestAnimationFrame to prevent visual glitches.
   * Must be called after layout changes are applied to the DOM.
   */
  const applyFitView = useCallback((options?: { padding?: number; duration?: number }) => {
    requestAnimationFrame(() => {
      fitView({
        padding: options?.padding ?? 0.1,
        duration: options?.duration ?? 200,
      });
    });
  }, [fitView]);

  return {
    calculateLayout,
    isLayouting,
    nodesInitialized,
    getNodeDimensions,
    applyFitView,
    layoutApplied,
  };
}
```

---

### Task 5: Update index.ts Exports

**File**: `/packages/web/components/generation-graph/index.ts`

**Implementation**:

```typescript
// Main components
export { GraphView } from './GraphView';
export { GraphViewWrapper } from './GraphViewWrapper';
export { GraphSkeleton } from './GraphSkeleton';

// Contexts (for advanced usage)
export { StaticGraphProvider, useStaticGraph } from './contexts/StaticGraphContext';
export { RealtimeStatusProvider, useRealtimeStatus } from './contexts/RealtimeStatusContext';

// Re-export types
export type { GraphViewProps } from './GraphView';
export type { GraphViewWrapperProps } from './GraphViewWrapper';
```

---

### Task 6: Update Consumer to Use GraphViewWrapper

**File**: `/packages/web/app/courses/generating/[slug]/GenerationProgressContainerEnhanced.tsx`

**Change**:

```typescript
// BEFORE (line ~23):
import { GraphView } from '@/components/generation-graph';

// AFTER:
import { GraphViewWrapper } from '@/components/generation-graph';

// BEFORE (line ~791):
<GraphView courseId={courseId} courseTitle={courseTitle} />

// AFTER:
<GraphViewWrapper courseId={courseId} courseTitle={courseTitle} />
```

---

### Task 7: Add dev:webpack Script

**File**: `/packages/web/package.json`

**Problem**: Turbopack (default in Next.js 15 dev) doesn't support webpack plugins. When working on ElkJS/Web Worker features, need webpack fallback.

**Implementation** (update scripts section):

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "dev:webpack": "next dev",
    "build": "next build",
    ...
  }
}
```

**Note**: Add comment in README or package.json explaining:
- Use `pnpm dev` for normal development (Turbopack - faster)
- Use `pnpm dev:webpack` when working on Web Worker or ElkJS features

---

## Validation Checklist

After implementing all tasks, verify:

### Build Validation
```bash
cd /home/me/code/megacampus2

# Type check
pnpm type-check --filter @megacampus/web

# Production build (must pass without web-worker errors)
pnpm build --filter @megacampus/web
```

### Runtime Validation
```bash
# Start with webpack (for full Web Worker support)
cd packages/web
pnpm dev:webpack

# Open browser to generation page
# Verify:
# 1. No hydration errors in console
# 2. Graph renders without blank edges
# 3. fitView doesn't cause visual jump
# 4. Double-click opens drawer
# 5. Zoom controls work
```

### Expected Results
- [ ] `pnpm type-check` passes with 0 errors
- [ ] `pnpm build` passes without `Module not found: web-worker` error
- [ ] No React hydration mismatch warnings in browser console
- [ ] Graph edges render on initial load (not blank)
- [ ] fitView applies smoothly without visual glitch
- [ ] All existing functionality preserved

---

## Files Modified Summary

| File | Action | Priority |
|------|--------|----------|
| `next.config.ts` | MODIFY - Add webpack.IgnorePlugin | CRITICAL |
| `GraphViewWrapper.tsx` | CREATE | CRITICAL |
| `GraphView.tsx` | REWRITE - Add Provider + hooks | CRITICAL |
| `useGraphLayout.ts` | MODIFY - Add v12 patterns | HIGH |
| `index.ts` | MODIFY - Update exports | MEDIUM |
| `GenerationProgressContainerEnhanced.tsx` | MODIFY - Use Wrapper | CRITICAL |
| `package.json` | MODIFY - Add dev:webpack | HIGH |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js 15 App Router                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Server Component: GenerationProgressContainerEnhanced   │   │
│  │ - Can fetch data                                        │   │
│  │ - Cannot use browser APIs                               │   │
│  └────────────────────────┬────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Client Component: GraphViewWrapper ('use client')       │   │
│  │ - Boundary for client-side code                         │   │
│  │ - Uses next/dynamic with ssr: false                     │   │
│  │ - Shows GraphSkeleton while loading                     │   │
│  └────────────────────────┬────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Client Component: GraphView ('use client')              │   │
│  │ ┌─────────────────────────────────────────────────────┐ │   │
│  │ │ ReactFlowProvider                                   │ │   │
│  │ │ ┌─────────────────────────────────────────────────┐ │ │   │
│  │ │ │ GraphViewInner                                  │ │ │   │
│  │ │ │ - useNodesInitialized() ← v12 requirement       │ │ │   │
│  │ │ │ - useReactFlow() for fitView                    │ │ │   │
│  │ │ │ - requestAnimationFrame before fitView          │ │ │   │
│  │ │ │                                                 │ │ │   │
│  │ │ │ ┌─────────────────────────────────────────────┐ │ │ │   │
│  │ │ │ │ ReactFlow                                   │ │ │ │   │
│  │ │ │ │ - nodes/edges state                         │ │ │ │   │
│  │ │ │ │ - nodeTypes (memoized outside)              │ │ │ │   │
│  │ │ │ │ - edgeTypes (memoized outside)              │ │ │ │   │
│  │ │ │ └─────────────────────────────────────────────┘ │ │ │   │
│  │ │ └─────────────────────────────────────────────────┘ │ │   │
│  │ └─────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Web Worker (layout.worker.ts)
┌─────────────────────────────────────────────────────────────────┐
│ - Uses elkjs/lib/elk.bundled.js (no web-worker dependency)     │
│ - Runs layout calculations off main thread                      │
│ - Communicates via postMessage                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Reference Documentation

- Research: `/specs/013-n8n-graph-view/research/React Flow + ElkJS integration in Next.js 15 App Router.md`
- Post-research corrections: `/specs/013-n8n-graph-view/research/post-research-corrections.md`
- React Flow v12 Migration Guide: https://reactflow.dev/learn/troubleshooting/migrate-to-v12
- Next.js Dynamic Imports: https://nextjs.org/docs/app/building-your-application/optimizing/lazy-loading
