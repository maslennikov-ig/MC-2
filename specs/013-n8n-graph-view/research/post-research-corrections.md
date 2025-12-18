# Post-Research Corrections for React Flow + ElkJS Integration

**Date**: 2025-11-28
**Source**: Research results from `React Flow + ElkJS integration in Next.js 15 App Router.md`
**Status**: Ready for implementation

---

## Agent Prompt

```
You are correcting the existing React Flow + ElkJS integration in the generation-graph feature based on research findings. The code is already partially implemented but missing critical Next.js 15 integration patterns.

## Context

Research revealed several critical patterns that are NOT currently implemented:
1. Next.js 15 requires specific component layering for client-only libraries
2. ElkJS needs webpack IgnorePlugin configuration
3. React Flow v12 has breaking changes with node.measured API
4. Turbopack doesn't support webpack plugins (needs dev:webpack script)

## Current State Analysis

### Files that exist and work:
- packages/web/components/generation-graph/GraphView.tsx - Main component with 'use client'
- packages/web/components/generation-graph/hooks/useGraphLayout.ts - Web Worker integration
- packages/web/components/generation-graph/workers/layout.worker.ts - Uses elk.bundled.js (correct)
- packages/web/next.config.ts - Has webpack config but NO ElkJS IgnorePlugin

### What's missing:
1. NO webpack.IgnorePlugin for ElkJS web-worker dependency
2. NO dynamic import wrapper with ssr: false for GraphView
3. NO useNodesInitialized() before layout calculations
4. NO requestAnimationFrame before fitView
5. NO dev:webpack script in package.json

## Tasks to Complete

### Task 1: Add ElkJS webpack configuration to next.config.ts

In `packages/web/next.config.ts`, inside the `webpack` function, add the IgnorePlugin:

```typescript
// At the top of the file, add:
import webpack from 'webpack';

// Inside webpack function, add this BEFORE the existing rules:
// Suppress elkjs web-worker optional dependency error (not needed in browser)
config.plugins = config.plugins || [];
config.plugins.push(
  new webpack.IgnorePlugin({
    resourceRegExp: /^web-worker$/,
    contextRegExp: /elkjs\/lib$/,
  })
);

// Also add fs fallback for client-side:
if (!isServer) {
  config.resolve = config.resolve || {};
  config.resolve.fallback = {
    ...config.resolve.fallback,
    fs: false,
  };
}
```

### Task 2: Create GraphViewWrapper with dynamic import

Create new file `packages/web/components/generation-graph/GraphViewWrapper.tsx`:

```typescript
'use client';

import dynamic from 'next/dynamic';
import { GraphSkeleton } from './GraphSkeleton';

// Dynamic import with ssr: false MUST be inside a Client Component
const GraphView = dynamic(
  () => import('./GraphView').then(mod => ({ default: mod.GraphView })),
  {
    ssr: false,
    loading: () => <GraphSkeleton />,
  }
);

interface GraphViewWrapperProps {
  courseId: string;
  courseTitle?: string;
}

export function GraphViewWrapper({ courseId, courseTitle }: GraphViewWrapperProps) {
  return <GraphView courseId={courseId} courseTitle={courseTitle} />;
}

export default GraphViewWrapper;
```

### Task 3: Update index.ts exports

In `packages/web/components/generation-graph/index.ts`, add:

```typescript
export { GraphViewWrapper } from './GraphViewWrapper';
```

### Task 4: Update useGraphLayout to use useNodesInitialized

Modify `packages/web/components/generation-graph/hooks/useGraphLayout.ts`:

```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNodesInitialized, useReactFlow } from '@xyflow/react';
import { ElkGraph } from '@megacampus/shared-types';

export function useGraphLayout() {
  const workerRef = useRef<Worker | null>(null);
  const [isLayouting, setIsLayouting] = useState(false);
  const nodesInitialized = useNodesInitialized();
  const { fitView } = useReactFlow();
  const layoutApplied = useRef(false);

  useEffect(() => {
    // Initialize the Web Worker
    workerRef.current = new Worker(
      new URL('../workers/layout.worker.ts', import.meta.url)
    );

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

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

  // Apply fitView after layout with requestAnimationFrame for smooth rendering
  const applyFitView = useCallback(() => {
    requestAnimationFrame(() => {
      fitView({ padding: 0.1, duration: 200 });
    });
  }, [fitView]);

  return {
    calculateLayout,
    isLayouting,
    nodesInitialized,
    applyFitView,
    layoutApplied
  };
}
```

### Task 5: Update GraphView to wait for node measurement

In `packages/web/components/generation-graph/GraphView.tsx`:

1. Import useNodesInitialized:
```typescript
import { ReactFlow, Background, NodeTypes, EdgeTypes, useNodesInitialized, ReactFlowProvider } from '@xyflow/react';
```

2. Add measurement-aware layout logic:
```typescript
// Inside GraphView component, add:
const nodesInitialized = useNodesInitialized();
const layoutAppliedRef = useRef(false);

// Wait for nodes to be measured before applying layout
useEffect(() => {
  if (nodesInitialized && !layoutAppliedRef.current && nodes.length > 0) {
    layoutAppliedRef.current = true;
    // Apply layout with measured dimensions
    requestAnimationFrame(() => {
      // fitView will be called after layout
    });
  }
}, [nodesInitialized, nodes.length]);
```

3. Wrap the component in ReactFlowProvider if using hooks that need it:
```typescript
// Export a wrapped version:
export function GraphView(props: GraphViewProps) {
  return (
    <ReactFlowProvider>
      <GraphViewInner {...props} />
    </ReactFlowProvider>
  );
}
```

### Task 6: Add dev:webpack script to package.json

In `packages/web/package.json`, add to scripts:

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "dev:webpack": "next dev",
    ...
  }
}
```

Add a comment in the file or README noting:
- Use `dev:webpack` when working on ElkJS/Web Worker features
- Turbopack doesn't support webpack.IgnorePlugin

### Task 7: Update node components to use node.measured (React Flow v12)

When accessing node dimensions in layout calculations, use:

```typescript
// React Flow v12 pattern:
const width = node.measured?.width ?? node.width ?? DEFAULT_WIDTH;
const height = node.measured?.height ?? node.height ?? DEFAULT_HEIGHT;

// NOT the old pattern:
// const width = node.width ?? DEFAULT_WIDTH;  // WRONG for v12
```

### Task 8: Update consumers to use GraphViewWrapper

Any file importing GraphView directly should be updated to import GraphViewWrapper instead if it's a Server Component context.

For example, in `packages/web/app/courses/generating/[slug]/page.tsx` or `GenerationProgressContainerEnhanced.tsx`:

```typescript
// Before:
import { GraphView } from '@/components/generation-graph';

// After:
import { GraphViewWrapper } from '@/components/generation-graph';

// Usage:
<GraphViewWrapper courseId={courseId} courseTitle={title} />
```

## Validation Checklist

After implementing these changes:

- [ ] `pnpm dev:webpack` starts without "Module not found: web-worker" errors
- [ ] `pnpm dev` (turbopack) shows warning but doesn't crash (or falls back gracefully)
- [ ] GraphView renders without SSR hydration errors
- [ ] Nodes are measured before layout is calculated
- [ ] fitView doesn't cause visual glitches
- [ ] `pnpm type-check` passes
- [ ] `pnpm build` succeeds

## Known Issues & Workarounds

### Issue: "Module not found: Can't resolve 'web-worker'"
**Solution**: webpack.IgnorePlugin in next.config.ts (Task 1)

### Issue: "ssr: false is not allowed in Server Components"
**Solution**: GraphViewWrapper with 'use client' directive (Task 2)

### Issue: Edges don't render on initial load
**Solution**: useNodesInitialized() + wait for measurement (Tasks 4-5)

### Issue: fitView causes visual jump
**Solution**: requestAnimationFrame before fitView (Task 4)

### Issue: Turbopack errors with Web Worker
**Solution**: Use dev:webpack script during development (Task 6)

## Files to Modify

1. `packages/web/next.config.ts` - Add IgnorePlugin
2. `packages/web/components/generation-graph/GraphViewWrapper.tsx` - CREATE NEW
3. `packages/web/components/generation-graph/index.ts` - Add export
4. `packages/web/components/generation-graph/hooks/useGraphLayout.ts` - Add nodesInitialized
5. `packages/web/components/generation-graph/GraphView.tsx` - Add ReactFlowProvider, measurement logic
6. `packages/web/package.json` - Add dev:webpack script
7. Consumer files using GraphView - Update imports

## Priority Order

1. Task 1 (webpack config) - CRITICAL, blocks everything
2. Task 2 (GraphViewWrapper) - CRITICAL, prevents SSR errors
3. Task 6 (dev:webpack script) - HIGH, needed for development
4. Task 3 (exports) - MEDIUM, cleanup
5. Tasks 4-5 (measurement) - MEDIUM, fixes edge rendering
6. Task 7 (node.measured) - MEDIUM, React Flow v12 compliance
7. Task 8 (update consumers) - LOW, depends on integration point
```

---

## Summary of Changes

| File | Change Type | Priority |
|------|-------------|----------|
| next.config.ts | MODIFY - Add webpack.IgnorePlugin | CRITICAL |
| GraphViewWrapper.tsx | CREATE - Dynamic import wrapper | CRITICAL |
| index.ts | MODIFY - Add export | MEDIUM |
| useGraphLayout.ts | MODIFY - Add nodesInitialized | MEDIUM |
| GraphView.tsx | MODIFY - Add ReactFlowProvider | MEDIUM |
| package.json | MODIFY - Add dev:webpack | HIGH |

## References

- Research: `/specs/013-n8n-graph-view/research/React Flow + ElkJS integration in Next.js 15 App Router.md`
- React Flow v12 Migration: https://reactflow.dev/learn/troubleshooting/migrate-to-v12
- ElkJS: https://github.com/kieler/elkjs
