# Incident Report: Generation Graph Visualization Issues

**Date:** November 29, 2025
**Feature:** n8n-Style Graph Pipeline View
**Component:** `GraphView`, `useGraphData`, `useGraphLayout`

## Task 5: Enable Node Dragging - COMPLETED ✓

**Changed File:** `packages/web/components/generation-graph/GraphView.tsx`

**Changes Made:**
- Set `nodesDraggable={true}` (was `false`)
- Added `onNodeDragStart` handler for debugging
- Added `onNodeDragStop` handler for debugging

**Verification:**
- Nodes can now be manually repositioned by dragging
- Positions persist during session via existing `nodePositionsRef` in `useGraphData.ts`
- Graph functions normally after dragging nodes

**Note:** Pre-existing TypeScript error in `NodeDetailsDrawer.tsx` (line 195) exists but is unrelated to this change.

---

## 1. Problem Description

The user reported two critical issues preventing the correct rendering of the course generation graph:

1.  **Node Stacking**: All nodes appeared at coordinates `(0,0)`, overlapping each other.
2.  **Console Errors**:
    *   `TypeError: _Worker is not a constructor`: Failure to initialize the Web Worker for `elkjs`.
    *   `Maximum update depth exceeded`: Infinite render loop in React Flow components.
    *   `404 Not Found`: API route for fetching traces failing.

## 2. Root Cause Analysis

### 2.1. Web Worker Failure (`_Worker is not a constructor`)
*   **Context**: Next.js App Router with Webpack/Turbo.
*   **Cause**: The standard `new Worker(new URL(..., import.meta.url))` syntax was not being correctly transpiled or resolved by the bundler in this specific environment. Additionally, `elkjs` internals attempt to spawn a worker, which clashed with the environment's global `Worker` definition (potentially mocked or modified during HMR).
*   **Impact**: The layout engine (`elkjs`) failed to start, resulting in no coordinates being calculated. Nodes defaulted to `(0,0)`.

### 2.2. Infinite Render Loop
*   **Context**: React `useEffect` dependencies in `useGraphData`.
*   **Cause**: The `useGraphData` hook rebuilt the graph on every trace update. It called `setNodes` with *new object references* for every node, even if the data hadn't changed. React Flow's `<StoreUpdater>` detected these reference changes and triggered an internal update, which likely caused a re-render of the parent, triggering `useGraphData` again.
*   **Exacerbating Factor**: The `layoutNodes` function (when it was partially working or failing) might have been triggering updates that fed back into the dependency chain.

### 2.3. API 404
*   **Cause**: The API route `/api/courses/[slug]/traces` was strictly querying by the `slug` column in the database. However, the frontend was passing a UUID (Course ID) in the URL.
*   **Impact**: Queries failed to find the course, returning 404.

## 3. Applied Solutions

### 3.1. Fixing Layout Engine (Worker Issue)
*   **Action**: Switched to **Dynamic Import** for `elkjs`.
*   **Implementation**:
    ```typescript
    // useGraphLayout.ts
    const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
    const elk = new ELK();
    ```
*   **Reasoning**: Loading the library dynamically inside `calculateLayout` ensures it only executes in the client browser environment (skipping SSR issues) and bypasses static analysis/transpilation issues related to top-level Worker instantiation in the module scope. Using the bundled version often includes necessary fallbacks.

### 3.2. Breaking the Infinite Loop
*   **Action**: Implemented Deep Comparison in State Updates.
*   **Implementation**:
    ```typescript
    // useGraphData.ts
    setNodes((currentNodes) => {
        // ... build newNodes ...
        if (JSON.stringify(currentNodes) === JSON.stringify(newNodes)) {
            return currentNodes; // Return SAME reference -> No re-render
        }
        return newNodes;
    });
    ```
*   **Reasoning**: By comparing the serialized structure of the new nodes against the current state, we prevent React state updates when the logical content hasn't changed. This stops the cycle.

### 3.3. Fixing API Route
*   **Action**: Added UUID detection logic.
*   **Implementation**:
    ```typescript
    // api/courses/[slug]/traces/route.ts
    const isUuid = /^[0-9a-f]{...}$/i.test(slug);
    if (isUuid) query.eq('id', slug);
    else query.eq('slug', slug);
    ```
*   **Reasoning**: The route now handles both SEO-friendly slugs and internal UUIDs, preventing 404s during polling.

### 3.4. Visual Improvements (Context)
*   **Action**: Added `currentStep` tracking.
*   **Implementation**: Detailed progress (e.g., "Vectorizing...") is now passed from trace data to the `DocumentNode` footer, providing granular visibility without adding extra graph nodes.

## 4. Verification Request for Reviewer

Please verify:
1.  **Stability**: Does the infinite loop persist under heavy load (rapid trace updates)?
2.  **Layout**: Do nodes position themselves correctly (not at 0,0) on first load and after updates?
3.  **Performance**: Is the dynamic import of `elkjs` causing any noticeable UI lag (jank) during layout calculation?
4.  **Code Quality**: Are the `useEffect` dependencies in `useGraphData` and `useGraphLayout` exhaustive and safe?