# n8n-Style Graph Pipeline View Documentation

## Overview

The `generation-graph` module provides a professional, interactive node-graph visualization for the course generation process. It replaces the previous vertical list ("Celestial Journey") with a data-flow oriented view similar to n8n or ComfyUI.

Key features:
- **Interactive Canvas**: Pan, zoom, fit view, and minimap.
- **Node-Based Stages**: Each generation stage is a node with input/output handles.
- **Real-time Updates**: Graph state updates live as generation progresses via Supabase Realtime.
- **Inspection**: Double-click nodes to inspect input, process metrics, and output data.
- **Parallel Processing**: Visualizes parallel document processing and lesson generation (in progress).

---

## Architecture

### Core Components

1.  **`GraphViewWrapper.tsx`** (Client Component)
    *   **Purpose**: Handles SSR-safe loading of React Flow.
    *   **Mechanism**: Uses `next/dynamic` with `ssr: false`. This is **CRITICAL** because React Flow relies on browser APIs (`window`, `ResizeObserver`) that crash on the server.
    *   **Usage**: Always import `GraphViewWrapper` when using in pages or server components.

2.  **`GraphView.tsx`** (Client Component)
    *   **Purpose**: The main graph container.
    *   **Structure**:
        *   `ReactFlowProvider`: Wraps the inner component to enable hooks.
        *   `GraphViewInner`: Contains the `ReactFlow` component and logic.
    *   **Logic**: Handles real-time data subscription, node selection, and initial layout fitting.

3.  **`useGraphLayout.ts` & `layout.worker.ts`**
    *   **Purpose**: Automatic graph layout calculation.
    *   **Mechanism**: Uses `elkjs` running in a **Web Worker** to prevent UI freezing during complex layout calculations.
    *   **ElkJS Integration**: Configured with `webpack.IgnorePlugin` in `next.config.ts` to avoid build errors with optional `web-worker` dependency.

### State Management

The graph uses a split context pattern for performance:

*   **`StaticGraphContext`**: Holds rarely changing data (stage config, translations, styles).
*   **`RealtimeStatusContext`**: Holds frequently changing data (node statuses, progress, metrics). Nodes subscribe selectively to avoid re-rendering the entire graph.

**Immer for Nested State Updates**:

The `useGraphData` hook uses [Immer](https://immerjs.github.io/immer/) `produce()` for complex state updates (e.g., `documentSteps` Map). This prevents React state mutation bugs where shallow copies share nested object references.

```typescript
// Pattern: Immer with Map state
setDocumentSteps(prev => produce(prev, draft => {
  const doc = draft.get(docId);
  if (doc) {
    doc.steps.push(newStep);  // Direct mutation - Immer handles immutability
  }
}));
```

### Data Flow

1.  **Supabase Realtime**: Pushes `generation_trace` records.
2.  **`useGenerationRealtime`**: Hook (from `generation-monitoring`) receives traces.
3.  **`useGraphData`**: Transforms traces into `ReactFlow` nodes and edges.
4.  **`useGraphLayout`**: Calculates node positions (x, y) using ElkJS.
5.  **`GraphView`**: Renders the final graph.

---

## Usage

### Importing the Graph

**ALWAYS** use the `GraphViewWrapper` or the named export `GraphViewWrapper` from `index.ts`.

```tsx
import { GraphViewWrapper } from '@/components/generation-graph';

export default function Page({ params }: { params: { slug: string } }) {
  return (
    <div className="h-[800px] w-full">
      <GraphViewWrapper 
        courseId={courseId} 
        courseTitle={courseTitle} 
      />
    </div>
  );
}
```

### Key Props

| Prop | Type | Description |
|------|------|-------------|
| `courseId` | `string` | UUID of the course being generated. |
| `courseTitle` | `string` | Optional title for display. |

---

## Key Components

### Nodes (`/nodes`)

*   **`StageNode.tsx`**: Represents a main pipeline stage (1-6). Shows icon, label, status color, and metrics.
*   **`MergeNode.tsx`**: A visual convergence point for parallel branches.
*   **`EndNode.tsx`**: Marks the completion of the pipeline.

### Edges (`/edges`)

*   **`AnimatedEdge.tsx`**: Dashed animated line for active connections.
*   **`DataFlowEdge.tsx`**: Edge with particle animation (for data transfer visualization).

### Controls (`/controls`)

*   **`GraphControls.tsx`**: Zoom In/Out and Fit View buttons.
*   **`GraphMinimap.tsx`**: Small overview map in the bottom right.

### Panels (`/panels`)

*   **`NodeDetailsDrawer.tsx`**: Slide-out panel showing Input/Process/Output tabs for the selected node.

---

## Development

### Commands

*   **`pnpm dev`**: Starts Next.js with **Turbopack**. Fast, but may not support some Web Worker/ElkJS features during hot reload.
*   **`pnpm dev:webpack`**: Starts Next.js with standard **Webpack**. Use this if you encounter issues with the layout worker or ElkJS during development.

### Adding New Stages

1.  Update `GRAPH_STAGE_CONFIG` in `@/lib/generation-graph/constants.ts`.
2.  Ensure `generation-celestial/utils.ts` (legacy config) is also updated if used elsewhere.
3.  The graph will automatically render the new stage based on the config.

---

## Troubleshooting

### "Module not found: Can't resolve 'web-worker'"
*   **Cause**: ElkJS tries to load a node-only dependency in the browser.
*   **Fix**: Ensure `next.config.ts` has the `webpack.IgnorePlugin` configuration for `web-worker`.

### Graph not rendering (Blank canvas)
*   **Cause**: Container height is 0.
*   **Fix**: Ensure the parent `div` of `GraphViewWrapper` has a defined height (e.g., `h-[800px]` or `h-screen`).

### "Hydration failed" or "Text content does not match"
*   **Cause**: React Flow rendering on the server.
*   **Fix**: Ensure you are importing `GraphViewWrapper` (which is dynamic/no-ssr), NOT `GraphView` directly.

### Edges look weird or nodes overlap
*   **Cause**: React Flow v12 requires nodes to be measured before layout.
*   **Fix**: The `useGraphLayout` hook handles this using `useNodesInitialized`. Ensure `requestAnimationFrame` is used before applying `fitView`.
