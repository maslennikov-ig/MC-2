# Implementation Plan: n8n-Style Graph Pipeline View

**Branch**: `013-n8n-graph-view` | **Date**: 2025-11-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-n8n-graph-view/spec.md`
**TRD Reference**: [technical-requirements.md](./technical-requirements.md)

## Summary

Replace the current "Celestial Journey" vertical timeline visualization with a professional **Node-Graph Interface** (similar to n8n, ComfyUI). Users will see course generation as a visual data pipeline with:
- Interactive 2D canvas (pan, zoom, minimap)
- Nodes representing stages with Input/Process/Output visibility
- Parallel branching for documents (Stage 2) and lessons (Stage 6)
- Collapsible module grouping for Stage 6
- Real-time status updates via Supabase Realtime
- Node details drawer with refinement chat capability
- Approval workflow integration

**Technical Approach**: Use React Flow (@xyflow/react) + elkjs for graph rendering with layout calculations in Web Worker. Split React contexts for performance optimization.

## Technical Context

**Language/Version**: TypeScript 5.9+ (Strict Mode)
**Primary Dependencies**:
- @xyflow/react v12+ (React Flow - graph visualization)
- elkjs (automatic graph layout in Web Worker)
- framer-motion (existing, for animations)
- lucide-react (existing, icons)
- Tailwind CSS (existing, styling)

**Storage**:
- Supabase PostgreSQL (existing `generation_trace`, `courses` tables)
- Session Storage (viewport state preservation)
- localStorage (user preferences: collapsed modules, list view toggle)

**Testing**:
- Vitest (unit tests)
- Playwright (E2E tests with data-testid attributes)

**Target Platform**: Web (Next.js 15+)

**Project Type**: Web application (monorepo: packages/web)

**Performance Goals**:
- Initial render <500ms for 20 nodes
- 60fps for pan/zoom interactions
- Support 100+ nodes with virtualization
- Memory <100MB for typical graphs

**Constraints**:
- Desktop: ≥1024px (full graph)
- Tablet: 768-1024px (simplified graph with touch)
- Mobile: <768px (list view fallback)
- WCAG AA accessibility compliance
- Real-time updates <1 second latency

**Scale/Scope**:
- Typical course: 6 stages, 1-10 documents, 5-20 modules, 20-100 lessons
- Maximum: 200+ nodes (large course with many lessons)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Notes |
|-----------|------------|-------|
| **I. Context-First Architecture** | ✅ PASS | TRD created with full codebase exploration; existing patterns documented |
| **II. Single Source of Truth** | ✅ PASS | Types in shared-types, reuse STAGE_CONFIG, shared translations |
| **III. Strict Type Safety** | ✅ PASS | TypeScript strict mode, explicit interfaces for GraphNode/GraphEdge |
| **IV. Atomic Evolution** | ✅ PASS | Tasks will be broken into small commits with `/push patch` |
| **V. Quality Gates & Security** | ✅ PASS | RLS policies exist, Zod validation planned, data-testid for E2E |
| **VI. Library-First Development** | ✅ PASS | Using React Flow + elkjs instead of custom graph implementation |
| **VII. Task Tracking & Artifacts** | ✅ PASS | tasks.md will track progress with artifact links |

**Gate Status**: ✅ ALL PASS - Proceed to Phase 0

## Project Structure

### Documentation (this feature)

```text
specs/013-n8n-graph-view/
├── plan.md                    # This file
├── spec.md                    # Feature specification (complete)
├── technical-requirements.md  # Detailed TRD (complete)
├── research.md                # Phase 0 output
├── data-model.md              # Phase 1 output
├── quickstart.md              # Phase 1 output
├── contracts/                 # Phase 1 output
│   └── graph-api.ts           # API contract for refinement endpoint
└── tasks.md                   # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
packages/web/
├── components/
│   ├── generation-graph/              # NEW - Main feature folder
│   │   ├── index.ts                   # Public exports
│   │   ├── GraphView.tsx              # Main container with ReactFlow
│   │   ├── MobileProgressList.tsx     # Mobile fallback view
│   │   ├── ViewToggle.tsx             # Graph/List toggle for accessibility
│   │   ├── nodes/
│   │   │   ├── StageNode.tsx          # Generic stage node (6 stages)
│   │   │   ├── DocumentNode.tsx       # Document parallel node (Stage 2)
│   │   │   ├── LessonNode.tsx         # Lesson parallel node (Stage 6)
│   │   │   ├── ModuleGroup.tsx        # Collapsible module container
│   │   │   ├── MergeNode.tsx          # Convergence point
│   │   │   ├── MinimalNode.tsx        # Semantic zoom: low detail
│   │   │   └── MediumNode.tsx         # Semantic zoom: medium detail
│   │   ├── edges/
│   │   │   ├── AnimatedEdge.tsx       # Custom animated edge
│   │   │   └── DataFlowEdge.tsx       # Particle animation edge
│   │   ├── panels/
│   │   │   ├── NodeDetailsDrawer.tsx  # Right drawer with tabs
│   │   │   ├── InputTab.tsx           # Input data view
│   │   │   ├── ProcessTab.tsx         # Process metrics view
│   │   │   ├── OutputTab.tsx          # Output data view
│   │   │   └── RefinementChat.tsx     # Collapsible chat section
│   │   ├── controls/
│   │   │   ├── GraphControls.tsx      # Zoom/fit/minimap buttons
│   │   │   ├── GraphMinimap.tsx       # Minimap wrapper
│   │   │   ├── GraphHeader.tsx        # Title + stats bar (FR-018)
│   │   │   └── ApprovalControls.tsx   # Approve/reject on node
│   │   ├── contexts/
│   │   │   ├── StaticGraphContext.tsx # Structure, config (changes rarely)
│   │   │   └── RealtimeStatusContext.tsx # Status, progress (changes often)
│   │   ├── hooks/
│   │   │   ├── useGraphData.ts        # Transform traces to graph
│   │   │   ├── useGraphLayout.ts      # elkjs layout via Web Worker
│   │   │   ├── useNodeSelection.ts    # Selection state
│   │   │   ├── useNodeStatus.ts       # Selective status subscription
│   │   │   ├── useViewportPersistence.ts # Session storage
│   │   │   └── useSemanticZoom.ts     # Zoom-based rendering
│   │   ├── workers/
│   │   │   └── layout.worker.ts       # ElkJS Web Worker
│   │   └── utils/
│   │       ├── layout.ts              # Layout algorithms
│   │       ├── transform.ts           # Trace → Node transformations
│   │       ├── constants.ts           # Colors, sizes, node types
│   │       └── graph-construction.ts  # Build graph from traces
│   ├── generation-celestial/          # EXISTING - Keep for reference/rollback
│   │   └── ... (unchanged)
│   └── generation-monitoring/         # EXISTING - Admin components
│       └── ... (unchanged)
├── lib/
│   └── generation-graph/
│       └── translations.ts            # RU/EN strings (FR-013)
├── app/
│   └── courses/
│       └── generating/
│           └── [slug]/
│               └── page.tsx           # UPDATE: Switch to GraphView
└── tests/
    ├── unit/
    │   └── generation-graph/
    │       ├── transform.test.ts
    │       └── graph-construction.test.ts
    └── e2e/
        └── generation-graph.spec.ts   # Playwright E2E tests

packages/shared-types/
└── src/
    └── generation-graph.ts            # NEW: GraphNode, GraphEdge, etc.
```

**Structure Decision**: Web application in existing monorepo. New components in `packages/web/components/generation-graph/`. Shared types in `packages/shared-types/src/generation-graph.ts`.

## Complexity Tracking

> No Constitution violations - table not required.

## Phase 0: Research Tasks

### R1: React Flow Best Practices (Simple)
**Question**: How to implement custom nodes, edges, and semantic zoom in React Flow v12?
**Method**: Context7 + WebSearch
**Output**: Code patterns for CustomNode, CustomEdge, useStore for zoom level

### R2: ElkJS Web Worker Integration (Simple)
**Question**: How to run elkjs in a Web Worker with Next.js 15?
**Method**: Context7 + WebSearch
**Output**: Worker setup, message passing, layout options

### R3: Existing Pattern Analysis (Simple)
**Question**: What patterns from celestial components can be reused?
**Method**: Code analysis (already done)
**Output**:
- Reuse: `useGenerationRealtime`, `STAGE_CONFIG`, `StageResultsDrawer` structure
- Adapt: `MissionControlBanner` for approval actions

### R4: Performance Optimization (Simple)
**Question**: Best practices for React.memo with React Flow nodes?
**Method**: Context7 + WebSearch
**Output**: Memoization patterns, primitive props, context splitting

### R5: Accessibility in Graph UIs (Simple)
**Question**: How to make canvas-based graph accessible for screen readers?
**Method**: WebSearch (WCAG guidelines for canvas)
**Output**: List view alternative, ARIA labels, keyboard navigation patterns

## Phase 1: Design Outputs

### 1.1 Data Model
See `data-model.md` for:
- GraphNode interface (stage, document, lesson, module, merge, end types)
- GraphEdge interface
- TraceAttempt interface
- ProcessMetrics interface
- Translation strings structure

### 1.2 API Contracts
See `contracts/graph-api.ts` for:
- Refinement API endpoint (`POST /api/generation/refine`)
- Request/Response types
- Error handling

### 1.3 Quickstart
See `quickstart.md` for:
- Development environment setup
- Running with mock data
- Testing instructions

## Implementation Phases (High-Level)

### MVP Phase (P1 + P2 User Stories)
1. **Foundation**: React Flow setup, basic nodes, layout engine
2. **Canvas**: Pan, zoom, minimap, fit view
3. **Nodes**: Stage nodes with status indicators
4. **Edges**: Basic connections with animation
5. **Drawer**: Node details with Input/Process/Output tabs
6. **Real-time**: Connect to existing realtime provider
7. **Parallel**: Document branching (Stage 2)
8. **Modules**: Collapsible groups for Stage 6 lessons
9. **Actions**: Approve/reject/retry on nodes
10. **Stats**: Header with progress and metrics

### Enhancement Phase (P3 User Stories)
11. **Refinement Chat**: Chat interface in drawer
12. **Semantic Zoom**: Simplified nodes at low zoom
13. **List View**: Mobile fallback + accessibility toggle
14. **Keyboard**: Shortcuts for navigation
15. **Long-Running**: Background tab support, indicators

### Admin Phase (P4 / Phase 2)
16. **Admin Panel**: Trace inspection for admins
17. **History**: Cross-account generation history

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| React Flow learning curve | Use Context7 docs, start with basic example |
| ElkJS layout performance | Web Worker from start, benchmark early |
| Real-time update batching | Implement 100ms debounce, test with mock high-frequency |
| Large graph performance | Semantic zoom + virtualization early |
| Mobile fallback complexity | Reuse existing list patterns |

## Next Steps

1. Run `/speckit.tasks` to generate detailed task list
2. Implement in order: Foundation → Canvas → Nodes → Real-time → Parallel
3. Use `/push patch` after each task completion
