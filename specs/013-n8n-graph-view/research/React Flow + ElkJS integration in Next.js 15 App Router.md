# React Flow + ElkJS integration in Next.js 15 App Router

**The key challenge**: React Flow requires browser APIs and cannot render server-side, while ElkJS's Web Worker bundling conflicts with Next.js's webpack configuration—especially with Turbopack now default in development. The solution requires careful layering of `'use client'` directives, dynamic imports with `ssr: false` inside Client Components, and specific webpack plugins to handle ElkJS's optional `web-worker` dependency.

React Flow v12 introduced a critical breaking change: measured node dimensions now live in `node.measured.width/height` instead of directly on nodes, requiring layout engine integrations to wait for measurement before computing positions. Combined with Next.js 15's stricter SSR rules and Turbopack's limited Web Worker support, this integration demands a specific architectural approach documented below.

## Next.js 15 webpack configuration for ElkJS

The most common error developers encounter is `Module not found: Can't resolve 'web-worker'`. ElkJS optionally requires this package for Node.js Web Worker support, but it's unnecessary in browser environments. The fix uses webpack's `IgnorePlugin`:

```javascript
// next.config.js
const webpack = require('webpack');

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Suppress elkjs web-worker optional dependency error
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /web-worker/,
        contextRegExp: /elkjs\/lib$/,
      })
    );
    
    // Client-side only: prevent fs resolution attempts
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    
    return config;
  },
};

module.exports = nextConfig;
```

**Turbopack limitation**: This webpack configuration won't work with Turbopack since it doesn't support webpack plugins. For development, you have two options:

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "dev:webpack": "next dev"
  }
}
```

Use `dev:webpack` when actively working on ElkJS integration, or use the simpler `elk.bundled.js` approach that avoids Web Worker issues entirely.

## Client component boundaries and dynamic imports

Next.js 15 introduced a breaking change: `ssr: false` with `next/dynamic` is **only allowed in Client Components**. Attempting to use it in a Server Component throws: `ssr: false is not allowed with next/dynamic in Server Components`.

The correct architecture requires a three-layer structure:

```typescript
// app/flow/page.tsx (Server Component - route entry)
import FlowWrapper from '@/components/FlowWrapper';

export default function FlowPage() {
  return (
    <main style={{ height: '100vh', width: '100vw' }}>
      <FlowWrapper />
    </main>
  );
}
```

```typescript
// components/FlowWrapper.tsx (Client Component - dynamic import layer)
'use client';

import dynamic from 'next/dynamic';

const FlowCanvas = dynamic(() => import('./FlowCanvas'), {
  ssr: false,
  loading: () => (
    <div style={{ 
      height: '100%', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center' 
    }}>
      Loading flow editor...
    </div>
  ),
});

export default function FlowWrapper() {
  return <FlowCanvas />;
}
```

```typescript
// components/FlowCanvas.tsx (Client Component - actual React Flow)
'use client';

import { useCallback, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  ReactFlowProvider,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// Import must be inside the client component
import { useElkLayout } from '@/hooks/useElkLayout';

const initialNodes: Node[] = [
  { id: '1', position: { x: 0, y: 0 }, data: { label: 'Start' }, type: 'input' },
  { id: '2', position: { x: 0, y: 100 }, data: { label: 'Process' } },
  { id: '3', position: { x: 0, y: 200 }, data: { label: 'End' }, type: 'output' },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e2-3', source: '2', target: '3' },
];

function Flow() {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect: OnConnect = useCallback(
    (connection) => setEdges((eds) => addEdge(connection, eds)),
    []
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      fitView
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}

export default function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}
```

## ElkJS Web Worker initialization strategies

Three approaches exist, each with tradeoffs for Next.js 15:

### Approach 1: Bundled version (simplest, recommended for most cases)

```typescript
// lib/elk.ts
'use client';

import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

export interface ElkNode {
  id: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
}

export interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
}

export interface ElkGraph {
  id: string;
  layoutOptions: Record<string, string>;
  children: ElkNode[];
  edges: ElkEdge[];
}

export async function layoutGraph(graph: ElkGraph) {
  return elk.layout(graph);
}
```

This approach runs layouts **synchronously on the main thread**, which blocks UI for large graphs (500+ nodes) but avoids all bundling complexity.

### Approach 2: Web Worker via public directory

Copy `node_modules/elkjs/lib/elk-worker.min.js` to your `public/` folder, then:

```typescript
// lib/elk-worker.ts
'use client';

import ELK from 'elkjs/lib/elk-api';

let elk: InstanceType<typeof ELK> | null = null;

export function getElk() {
  if (typeof window === 'undefined') return null;
  
  if (!elk) {
    elk = new ELK({
      workerUrl: '/elk-worker.min.js'
    });
  }
  return elk;
}

export function terminateElk() {
  if (elk) {
    elk.terminateWorker();
    elk = null;
  }
}

export async function layoutGraph(graph: any) {
  const elkInstance = getElk();
  if (!elkInstance) throw new Error('ELK not available in SSR');
  return elkInstance.layout(graph);
}
```

### Approach 3: Custom worker with webpack 5 syntax

```typescript
// workers/elk-layout.worker.ts
import ELK from 'elkjs';

const elk = new ELK();

self.onmessage = async (event: MessageEvent) => {
  const { graph, options } = event.data;
  try {
    const result = await elk.layout(graph, options);
    self.postMessage({ success: true, result });
  } catch (error) {
    self.postMessage({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Layout failed' 
    });
  }
};
```

```typescript
// hooks/useElkWorker.ts
'use client';

import { useRef, useCallback, useEffect } from 'react';

export function useElkWorker() {
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Webpack 5 native worker syntax - URL must be inline
    workerRef.current = new Worker(
      new URL('../workers/elk-layout.worker.ts', import.meta.url)
    );
    
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const layout = useCallback((graph: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }
      
      workerRef.current.onmessage = (e) => {
        if (e.data.success) resolve(e.data.result);
        else reject(new Error(e.data.error));
      };
      
      workerRef.current.postMessage({ graph });
    });
  }, []);

  return { layout };
}
```

**Critical webpack 5 limitation**: The URL must be inline within `new Worker()`. This will not work:

```typescript
// ❌ Fails - webpack can't statically analyze
const url = new URL('./worker.ts', import.meta.url);
const worker = new Worker(url);
```

## React Flow v12 breaking changes affecting layout engines

The most significant change for ElkJS integration: **measured dimensions moved to `node.measured`**. Layout engines must now wait for React Flow to measure nodes before computing positions:

```typescript
// hooks/useElkLayout.ts
'use client';

import { useCallback } from 'react';
import { useReactFlow, type Node, type Edge } from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

const DEFAULT_WIDTH = 172;
const DEFAULT_HEIGHT = 36;

interface LayoutOptions {
  direction?: 'DOWN' | 'UP' | 'RIGHT' | 'LEFT';
  spacing?: number;
  layerSpacing?: number;
}

export function useElkLayout() {
  const { setNodes, setEdges, fitView, getNodes, getEdges } = useReactFlow();

  const applyLayout = useCallback(async (options: LayoutOptions = {}) => {
    const { 
      direction = 'DOWN', 
      spacing = 50, 
      layerSpacing = 100 
    } = options;
    
    const nodes = getNodes();
    const edges = getEdges();
    
    if (nodes.length === 0) return;

    const isHorizontal = direction === 'RIGHT' || direction === 'LEFT';

    // Build ELK graph using measured dimensions (v12 requirement)
    const graph = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': direction,
        'elk.spacing.nodeNode': String(spacing),
        'elk.layered.spacing.nodeNodeBetweenLayers': String(layerSpacing),
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      },
      children: nodes.map((node) => ({
        id: node.id,
        // v12: Use node.measured for actual dimensions
        width: node.measured?.width ?? node.width ?? DEFAULT_WIDTH,
        height: node.measured?.height ?? node.height ?? DEFAULT_HEIGHT,
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
    };

    try {
      const layoutedGraph = await elk.layout(graph);
      
      const layoutedNodes = nodes.map((node) => {
        const elkNode = layoutedGraph.children?.find((n) => n.id === node.id);
        if (!elkNode) return node;
        
        return {
          ...node,
          position: { x: elkNode.x ?? 0, y: elkNode.y ?? 0 },
          targetPosition: isHorizontal ? 'left' : 'top',
          sourcePosition: isHorizontal ? 'right' : 'bottom',
        } as Node;
      });

      setNodes(layoutedNodes);
      
      // Allow DOM to update before fitting view
      requestAnimationFrame(() => {
        fitView({ padding: 0.1, duration: 200 });
      });
      
    } catch (error) {
      console.error('ELK layout failed:', error);
    }
  }, [getNodes, getEdges, setNodes, fitView]);

  return { applyLayout };
}
```

### Waiting for node measurement before layout

A common issue: edges don't render correctly because layout runs before nodes are measured. Use this pattern:

```typescript
// hooks/useLayoutOnMeasured.ts
'use client';

import { useEffect, useRef } from 'react';
import { useReactFlow, useNodesInitialized } from '@xyflow/react';
import { useElkLayout } from './useElkLayout';

export function useLayoutOnMeasured() {
  const nodesInitialized = useNodesInitialized();
  const { applyLayout } = useElkLayout();
  const layoutApplied = useRef(false);

  useEffect(() => {
    // Only apply layout once nodes are measured and layout hasn't been applied
    if (nodesInitialized && !layoutApplied.current) {
      layoutApplied.current = true;
      applyLayout({ direction: 'DOWN' });
    }
  }, [nodesInitialized, applyLayout]);
}
```

## Performance optimizations for React Flow + Next.js

### Memoization requirements

React Flow re-renders aggressively. These patterns are mandatory for acceptable performance:

```typescript
// components/CustomNode.tsx
'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

// Always wrap custom nodes in memo
const CustomNode = memo(({ data, selected }: NodeProps) => {
  return (
    <div className={`custom-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div>{data.label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});

CustomNode.displayName = 'CustomNode';

export default CustomNode;
```

```typescript
// Define nodeTypes outside component or useMemo
// ❌ BAD - creates new object every render, causes infinite loop
function Flow() {
  const nodeTypes = { custom: CustomNode }; // Re-created each render!
  return <ReactFlow nodeTypes={nodeTypes} />;
}

// ✅ GOOD - stable reference
const nodeTypes = { custom: CustomNode };

function Flow() {
  return <ReactFlow nodeTypes={nodeTypes} />;
}

// ✅ ALSO GOOD - memoized
function Flow() {
  const nodeTypes = useMemo(() => ({ custom: CustomNode }), []);
  return <ReactFlow nodeTypes={nodeTypes} />;
}
```

### Lazy loading ElkJS to reduce initial bundle

ElkJS is approximately **1.45MB**. Lazy load it for faster initial page loads:

```typescript
// lib/elk-lazy.ts
'use client';

let elkModule: typeof import('elkjs/lib/elk.bundled.js') | null = null;

export async function getElkInstance() {
  if (!elkModule) {
    elkModule = await import('elkjs/lib/elk.bundled.js');
  }
  return new elkModule.default();
}

export async function layoutGraph(graph: any) {
  const elk = await getElkInstance();
  return elk.layout(graph);
}
```

### Memory cleanup on unmount

Failing to terminate workers causes memory leaks in SPAs:

```typescript
// hooks/useElkLayoutWithCleanup.ts
'use client';

import { useEffect, useRef } from 'react';
import ELK from 'elkjs/lib/elk-api';

export function useElkLayoutWithCleanup() {
  const elkRef = useRef<InstanceType<typeof ELK> | null>(null);

  useEffect(() => {
    // Initialize with Web Worker
    elkRef.current = new ELK({
      workerUrl: '/elk-worker.min.js'
    });

    return () => {
      // Critical: terminate worker on unmount
      elkRef.current?.terminateWorker();
      elkRef.current = null;
    };
  }, []);

  // ... rest of hook
}
```

## Known issues and workarounds from production implementations

### Issue: Edges don't render on initial load with ELK

**Root cause**: Layout applies before React Flow measures nodes, causing `null` handle positions.

**Solution**: Delay edge setting or use `useNodesInitialized`:

```typescript
useEffect(() => {
  let mounted = true;
  
  const runLayout = async () => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = 
      await getLayoutedGraph(nodes, edges);
    
    if (mounted) {
      setNodes(layoutedNodes);
      // Delay edge setting to next tick
      setTimeout(() => {
        if (mounted) setEdges(layoutedEdges);
      }, 0);
    }
  };
  
  runLayout();
  return () => { mounted = false; };
}, []);
```

### Issue: `ReferenceError: _xblockexpression is not defined`

**Root cause**: ElkJS uses GWT-transpiled code that conflicts with strict mode in some bundlers.

**Solution**: Use `elkjs/lib/elk.bundled.js` instead of separate API/worker files.

### Issue: fitView glitches after auto-layout in v12

**Root cause**: `computed.width/height` undefined during layout transition.

**Solution**: Use `requestAnimationFrame` before `fitView`:

```typescript
setNodes(layoutedNodes);
requestAnimationFrame(() => {
  fitView({ duration: 200 });
});
```

### Issue: Turbopack Web Worker static analysis errors

**Error**: `TP1001 new Worker("/workers/timer.js") is not statically analyse-able`

**Solution**: Either use the bundled ElkJS version or run development with webpack:

```bash
next dev --webpack
```

## Complete working example

```typescript
// components/ElkFlowEditor.tsx
'use client';

import { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Panel,
  useReactFlow,
  useNodesInitialized,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// Lazy import ELK to reduce bundle
let elkPromise: Promise<any> | null = null;
async function getElk() {
  if (!elkPromise) {
    elkPromise = import('elkjs/lib/elk.bundled.js').then(m => new m.default());
  }
  return elkPromise;
}

const initialNodes: Node[] = [
  { id: '1', data: { label: 'Input' }, position: { x: 0, y: 0 }, type: 'input' },
  { id: '2', data: { label: 'Process A' }, position: { x: 0, y: 0 } },
  { id: '3', data: { label: 'Process B' }, position: { x: 0, y: 0 } },
  { id: '4', data: { label: 'Output' }, position: { x: 0, y: 0 }, type: 'output' },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e1-3', source: '1', target: '3' },
  { id: 'e2-4', source: '2', target: '4' },
  { id: 'e3-4', source: '3', target: '4' },
];

function ElkFlow() {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [direction, setDirection] = useState<'DOWN' | 'RIGHT'>('DOWN');
  const { fitView, getNodes } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const layoutApplied = useRef(false);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect: OnConnect = useCallback(
    (connection) => setEdges((eds) => addEdge(connection, eds)),
    []
  );

  const applyElkLayout = useCallback(async (dir: 'DOWN' | 'RIGHT') => {
    const currentNodes = getNodes();
    if (currentNodes.length === 0) return;

    const elk = await getElk();
    const isHorizontal = dir === 'RIGHT';

    const graph = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': dir,
        'elk.spacing.nodeNode': '50',
        'elk.layered.spacing.nodeNodeBetweenLayers': '100',
      },
      children: currentNodes.map((node) => ({
        id: node.id,
        width: node.measured?.width ?? 150,
        height: node.measured?.height ?? 40,
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
    };

    const layouted = await elk.layout(graph);

    setNodes(currentNodes.map((node) => {
      const elkNode = layouted.children?.find((n: any) => n.id === node.id);
      return {
        ...node,
        position: { x: elkNode?.x ?? 0, y: elkNode?.y ?? 0 },
        targetPosition: isHorizontal ? 'left' : 'top',
        sourcePosition: isHorizontal ? 'right' : 'bottom',
      } as Node;
    }));

    requestAnimationFrame(() => fitView({ padding: 0.2 }));
  }, [edges, fitView, getNodes]);

  // Auto-layout when nodes are first measured
  useEffect(() => {
    if (nodesInitialized && !layoutApplied.current) {
      layoutApplied.current = true;
      applyElkLayout(direction);
    }
  }, [nodesInitialized, applyElkLayout, direction]);

  const defaultEdgeOptions = useMemo(() => ({
    type: 'smoothstep',
    animated: true,
  }), []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      defaultEdgeOptions={defaultEdgeOptions}
      fitView
    >
      <Background />
      <Controls />
      <Panel position="top-right">
        <button 
          onClick={() => {
            const newDir = direction === 'DOWN' ? 'RIGHT' : 'DOWN';
            setDirection(newDir);
            applyElkLayout(newDir);
          }}
          style={{ padding: '8px 16px', cursor: 'pointer' }}
        >
          Toggle Direction ({direction})
        </button>
      </Panel>
    </ReactFlow>
  );
}

export default function ElkFlowEditor() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlowProvider>
        <ElkFlow />
      </ReactFlowProvider>
    </div>
  );
}
```

## Conclusion

Successfully integrating React Flow with ElkJS in Next.js 15 requires addressing three core challenges: preventing server-side rendering of browser-dependent components, handling ElkJS's optional `web-worker` dependency, and adapting to React Flow v12's new dimension measurement API. 

The recommended approach uses `elkjs/lib/elk.bundled.js` for simplicity unless you have 500+ nodes requiring Web Worker offloading. Always wrap React Flow in a Client Component using `next/dynamic` with `ssr: false`, and ensure the dynamic import itself lives inside a `'use client'` component—not a Server Component. For Turbopack compatibility during development, either use the bundled ElkJS version or fall back to webpack with `next dev --webpack`.

Key patterns for production: wait for `useNodesInitialized()` before applying layouts, terminate ELK workers on unmount, memoize all custom node components and callbacks, and use `requestAnimationFrame` before `fitView` to avoid measurement timing bugs.