# Tasks: n8n-Style Graph Pipeline View

**Input**: Design documents from `/specs/013-n8n-graph-view/`
**Prerequisites**: technical-requirements.md, research.md, data-model.md, quickstart.md

**Tests**: Tests are NOT explicitly requested in this specification. Test tasks are omitted.

**Organization**: Tasks are grouped by user story (US1-US10) from Section 2 of technical-requirements.md.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo**: `packages/web/` for frontend, `packages/shared-types/` for types
- **Components**: `packages/web/components/generation-graph/`
- **Hooks**: `packages/web/components/generation-graph/hooks/`
- **Utils/Lib**: `packages/web/lib/generation-graph/`

---

## Phase 0: Planning

**Purpose**: Agent assignment and research resolution

- [x] P001 Analyze tasks to identify required agent types and capabilities
- [x] P002 Create required agents via meta-agent-v3 in single message → restart
- [x] P003 Assign executors (MAIN for trivial, existing if 100% match, specific agents)
- [x] P004 Resolve research questions (simple: solve now, complex: create prompts)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependencies, and type definitions

- [x] T001 Install @xyflow/react and elkjs dependencies in packages/web/package.json
- [x] T002 [P] Create generation-graph types in packages/shared-types/src/generation-graph.ts (GraphNode, GraphEdge, StageConfig per data-model.md)
- [x] T003 [P] Export generation-graph types from packages/shared-types/src/index.ts
- [x] T004 Create directory structure for generation-graph feature in packages/web/components/generation-graph/
- [x] T005 [P] Create translations file in packages/web/lib/generation-graph/translations.ts (GRAPH_TRANSLATIONS per TRD 3.13)
- [x] T006 [P] Create useTranslation hook in packages/web/lib/generation-graph/useTranslation.ts
- [x] T007 [P] Create graph constants file in packages/web/lib/generation-graph/constants.ts (colors, sizes, layout options per TRD 5.1, 5.2) - extend existing STAGE_CONFIG from generation-celestial/utils.ts
- [x] T008 [P] Create graph utilities in packages/web/lib/generation-graph/utils.ts (status mapping, node creation helpers) - reuse buildStagesFromStatus, getStageFromStatus, isAwaitingApproval from generation-celestial/utils.ts
- [x] T008a [QG] Run `pnpm type-check` in packages/shared-types and packages/web - fix any errors before proceeding

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T009 Create StaticGraphContext in packages/web/components/generation-graph/contexts/StaticGraphContext.tsx (NFR-O01)
- [x] T010 [P] Create RealtimeStatusContext in packages/web/components/generation-graph/contexts/RealtimeStatusContext.tsx (NFR-O01)
- [x] T011 Create useGraphLayout hook in packages/web/components/generation-graph/hooks/useGraphLayout.ts (elkjs layout calculation per R2)
- [x] T012 [P] Create layout worker in packages/web/components/generation-graph/workers/layout.worker.ts (NFR-P06 Web Worker)
- [x] T013 Create useNodeStatus hook in packages/web/components/generation-graph/hooks/useNodeStatus.ts (selective subscription per NFR-O02)
- [x] T014 [P] Create useBatchedTraces hook in packages/web/components/generation-graph/hooks/useBatchedTraces.ts (FR-RT03 100ms debounce)
- [x] T015 Create useGraphData hook in packages/web/components/generation-graph/hooks/useGraphData.ts (transform traces to nodes/edges)
- [x] T016 [P] Create base StageNode component in packages/web/components/generation-graph/nodes/StageNode.tsx (FR-N01 to FR-N08, memo wrapped)
- [x] T017 [P] Create MergeNode component in packages/web/components/generation-graph/nodes/MergeNode.tsx (compact merge point)
- [x] T018 [P] Create EndNode component in packages/web/components/generation-graph/nodes/EndNode.tsx (pipeline completion)
- [x] T019 Create AnimatedEdge component in packages/web/components/generation-graph/edges/AnimatedEdge.tsx (FR-E01 to FR-E05)
- [x] T020 [P] Create DataFlowEdge component in packages/web/components/generation-graph/edges/DataFlowEdge.tsx (particle animation)
- [x] T021 Create GraphView main container in packages/web/components/generation-graph/GraphView.tsx (ReactFlow wrapper, FR-C01 to FR-C07)
- [x] T021a [P] Create GraphSkeleton loading component in packages/web/components/generation-graph/GraphSkeleton.tsx - adapt existing ProgressSkeleton from generating/[slug]/
- [x] T022 Create index.ts exports in packages/web/components/generation-graph/index.ts
- [x] T022a [QG] Run `pnpm type-check && pnpm build` - fix any errors before proceeding to user stories

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Pipeline Visualization (Priority: P1) 🎯 MVP

**Goal**: See generation process as a node graph with stages, active state, and data flow

**Independent Test**: Navigate to /courses/generating/[slug], see 6-stage pipeline as connected nodes

### Implementation for User Story 1

- [x] T023 [P] [US1] Implement node status visual states (pending, active, completed, error, awaiting) in packages/web/components/generation-graph/nodes/StageNode.tsx (FR-N06)
- [x] T024 [P] [US1] Add pulsing glow animation for active nodes in packages/web/components/generation-graph/nodes/StageNode.tsx (TRD 5.2)
- [x] T025 [US1] Implement edge status states (idle, active, completed, error) in packages/web/components/generation-graph/edges/AnimatedEdge.tsx (FR-E02 to FR-E05)
- [x] T026 [US1] Create graph construction logic for 6-stage pipeline in packages/web/components/generation-graph/hooks/useGraphData.ts (TRD 6.4)
- [x] T027 [P] [US1] Add dot grid background to GraphView in packages/web/components/generation-graph/GraphView.tsx (FR-C02)
- [x] T028 [US1] Integrate with existing useGenerationRealtime hook in packages/web/components/generation-graph/GraphView.tsx (TRD 7.3)
- [x] T029 [US1] Update GenerationProgressContainerEnhanced to use GraphView in packages/web/app/courses/generating/[slug]/GenerationProgressContainerEnhanced.tsx

**Checkpoint**: Basic pipeline visualization works - nodes display, edges connect, statuses update

---

## Phase 4: User Story 7 - Canvas Navigation (Priority: P2)

**Goal**: Pan, zoom, and use minimap for navigation on complex pipelines

**Independent Test**: Use mouse/scroll to pan/zoom, verify minimap shows position

### Implementation for User Story 7

- [x] T030 [P] [US7] Add GraphControls component with zoom buttons in packages/web/components/generation-graph/controls/GraphControls.tsx (FR-C04)
- [x] T031 [P] [US7] Add GraphMinimap component in packages/web/components/generation-graph/controls/GraphMinimap.tsx (FR-C03)
- [x] T032 [US7] Implement keyboard shortcuts (Space+drag, Ctrl+scroll, Ctrl+0) in packages/web/components/generation-graph/hooks/useKeyboardShortcuts.ts (FR-C05)
- [x] T033 [US7] Add auto-fit on initial load in packages/web/components/generation-graph/GraphView.tsx (FR-C06)
- [x] T034 [US7] Ensure 60fps animations in packages/web/components/generation-graph/GraphView.tsx (FR-C07, NFR-P02)
- [x] T034a [QG] Run `pnpm type-check && pnpm build` - MVP quality gate before continuing

**Checkpoint**: Canvas navigation complete - pan, zoom, minimap, shortcuts all work
**🎯 MVP COMPLETE**: Graph renders, nodes connect, pan/zoom works - can demo/deploy

---

## Phase 5: User Story 2 - Stage Inspection (Priority: P2)

**Goal**: Click on any node to see Input/Process/Output data

**Independent Test**: Click node → see compact preview; double-click → open full drawer with tabs

### Implementation for User Story 2

- [x] T035 [P] [US2] Create NodeDetailsDrawer component in packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx (FR-D01 to FR-D08)
- [x] T036 [P] [US2] Create InputTab component in packages/web/components/generation-graph/panels/InputTab.tsx (FR-D03)
- [x] T037 [P] [US2] Create ProcessTab component in packages/web/components/generation-graph/panels/ProcessTab.tsx (FR-D04) - reuse PhaseProgress from generation-celestial/
- [x] T038 [P] [US2] Create OutputTab component in packages/web/components/generation-graph/panels/OutputTab.tsx (FR-D05) - reuse StageResultsPreview from generation/
- [x] T039 [US2] Implement single-click compact preview in StageNode in packages/web/components/generation-graph/nodes/StageNode.tsx (FR-N07)
- [x] T040 [US2] Implement double-click drawer open in packages/web/components/generation-graph/hooks/useNodeSelection.ts (FR-N08)
- [x] T041 [US2] Add Esc key and close button to dismiss drawer in packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx (FR-D07)

**Checkpoint**: Stage inspection works - click preview and drawer with Input/Process/Output tabs

---

## Phase 6: User Story 3 - Parallel Process Tracking (Priority: P2)

**Goal**: See each document as a separate node branch in Stage 2

**Independent Test**: Generate course with 3+ documents, see 3 parallel document nodes after Stage 1

### Implementation for User Story 3

- [x] T042 [P] [US3] Create DocumentNode component in packages/web/components/generation-graph/nodes/DocumentNode.tsx (TRD 5.4 Document Node)
- [x] T043 [US3] Update graph construction for parallel documents in packages/web/components/generation-graph/hooks/useGraphData.ts (FR-P01). Note: Must handle node measurement delay (React Flow v12).
- [x] T044 [US3] Add merge node after document branches in packages/web/components/generation-graph/hooks/useGraphData.ts (FR-P06)
- [x] T045 [US3] Handle incremental node addition without relayout in packages/web/components/generation-graph/hooks/useGraphLayout.ts (FR-R07). Note: Use useNodesInitialized() to wait for dimensions before applying layout.
- [x] T046 [US3] Add fade-in animation for new parallel nodes in packages/web/components/generation-graph/nodes/DocumentNode.tsx (FR-R08)

**Checkpoint**: Parallel document processing visualized - branches and merge work

---

## Phase 7: User Story 4 - Lesson Generation Monitoring (Priority: P2)

**Goal**: See lesson generation grouped by modules with expandable nodes

**Independent Test**: Generate course, Stage 6 shows modules collapsed; expand to see lessons

### Implementation for User Story 4

- [x] T047 [P] [US4] Create LessonNode component in packages/web/components/generation-graph/nodes/LessonNode.tsx (TRD 5.4 Lesson Node)
- [x] T048 [P] [US4] Create ModuleGroup component in packages/web/components/generation-graph/nodes/ModuleGroup.tsx (FR-P03, FR-P04, FR-P05)
- [x] T049 [US4] Update graph construction for Stage 6 modules/lessons in packages/web/components/generation-graph/hooks/useGraphData.ts (FR-P02). Note: Dynamic node addition requires waiting for measurement (React Flow v12), similar to T043.
- [x] T050 [US4] Implement collapse/expand toggle for modules in packages/web/components/generation-graph/nodes/ModuleGroup.tsx (FR-P04, FR-P05). Note: Collapse/expand changes node dimensions - may need layout recalculation with useNodesInitialized().
- [x] T051 [US4] Add progress indicator (3/5 lessons) to collapsed module in packages/web/components/generation-graph/nodes/ModuleGroup.tsx (FR-P04)

**Checkpoint**: Module grouping works - collapse/expand with progress indicator

---

## Phase 8: User Story 5 - Retry/Regeneration History (Priority: P2)

**Goal**: See all attempts when a stage was retried, compare outputs

**Independent Test**: On node with retries, see tabs/dropdown in drawer for each attempt

### Implementation for User Story 5

- [x] T052 [P] [US5] Add retry history tabs to NodeDetailsDrawer in packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx (FR-D06)
- [x] T053 [US5] Create AttemptSelector component in packages/web/components/generation-graph/panels/AttemptSelector.tsx (dropdown for attempts)
- [x] T054 [US5] Display retry count badge on nodes in packages/web/components/generation-graph/nodes/StageNode.tsx (FR-SS03)
- [x] T055 [US5] Store and display attempt comparison in packages/web/components/generation-graph/panels/OutputTab.tsx

**Checkpoint**: Retry history visible - switch between attempts, compare outputs

---

## Phase 9: User Story 6 - Approval Workflow (Priority: P2)

**Goal**: Approve or reject directly from the graph at approval checkpoints

**Independent Test**: At Stage 5 awaiting, see yellow glow node with Approve/Reject buttons

### Implementation for User Story 6

- [x] T056 [P] [US6] Create ApprovalControls component in packages/web/components/generation-graph/controls/ApprovalControls.tsx (FR-A02)
- [x] T057 [US6] Add awaiting node visual style (yellow glow, badge) in packages/web/components/generation-graph/nodes/StageNode.tsx (FR-A01, FR-APR01)
- [x] T058 [US6] Create rejection modal with feedback input in packages/web/components/generation-graph/controls/RejectionModal.tsx (FR-APR03)
- [x] T059 [US6] Implement regenerate with feedback option in packages/web/components/generation-graph/controls/RejectionModal.tsx (FR-APR04)
- [x] T060 [US6] Connect approval actions to backend API in packages/web/components/generation-graph/controls/ApprovalControls.tsx (FR-APR06)
- [x] T061 [US6] Add confirmation dialog before reject in packages/web/components/generation-graph/controls/ApprovalControls.tsx (FR-A04)
- [x] T061a [P] [US6] Integrate MissionControlBanner as secondary approval UI in packages/web/components/generation-graph/GraphView.tsx (FR-A03) - reuse existing component

**Checkpoint**: Approval workflow complete - approve/reject from graph with feedback

---

## Phase 10: User Story 10 - Retry Failed Items (Priority: P2)

**Goal**: Retry only failed items (not entire stage) for partial failures

**Independent Test**: With 3/5 docs failed, click retry on one failed node, only that retries

### Implementation for User Story 10

- [x] T062 [P] [US10] Add retry button to failed nodes in packages/web/components/generation-graph/nodes/StageNode.tsx (FR-ERR02)
- [x] T063 [US10] Implement partial failure display (green vs red nodes) in packages/web/components/generation-graph/nodes/DocumentNode.tsx (FR-ERR01)
- [x] T064 [US10] Create retry confirmation dialog in packages/web/components/generation-graph/controls/RetryConfirmDialog.tsx (TRD Retry Flow)
- [x] T065 [US10] Connect retry action to backend API in packages/web/components/generation-graph/hooks/useRetry.ts (FR-ERR03)
- [x] T066 [US10] Show error message in node tooltip/badge in packages/web/components/generation-graph/nodes/StageNode.tsx (FR-ERR04)
- [x] T067 [US10] Display error details in drawer in packages/web/components/generation-graph/panels/NodeDetailsDrawer.tsx (FR-ERR05)

**Checkpoint**: Retry individual items works - failed items marked, retry per-item

---

## Phase 11: Real-time Updates (Priority: P2)

**Goal**: Real-time updates via Supabase with fallback and error handling

**Independent Test**: Start generation, see nodes update live; disconnect network, see fallback

### Implementation for Real-time

- [x] T068 [RT] Subscribe to Supabase Realtime for generation_trace in packages/web/components/generation-graph/hooks/useGraphData.ts (FR-R01)
- [x] T069 [RT] Update node states in real-time as traces arrive in packages/web/components/generation-graph/contexts/RealtimeStatusContext.tsx (FR-R02)
- [x] T070 [RT] Animate edges when data flows in packages/web/components/generation-graph/edges/AnimatedEdge.tsx (FR-R03)
- [x] T071 [P] [RT] Add connection status indicator in packages/web/components/generation-graph/controls/ConnectionStatus.tsx (FR-R04)
- [x] T072 [RT] Implement fallback polling when realtime fails in packages/web/components/generation-graph/hooks/useFallbackPolling.ts (FR-R05)
- [x] T073 [RT] Preserve viewport on graph updates in packages/web/components/generation-graph/hooks/useViewportPreservation.ts (FR-R06)
- [x] T074 [P] [RT] Handle out-of-order traces (sort by created_at) in packages/web/components/generation-graph/hooks/useBatchedTraces.ts (FR-RT01)
- [x] T075 [P] [RT] Deduplicate traces by ID in packages/web/components/generation-graph/hooks/useBatchedTraces.ts (FR-RT02)
- [x] T075a [QG] Run `pnpm type-check && pnpm build` - quality gate before error handling

**Checkpoint**: Real-time updates work - traces flow in, fallback handles disconnect

---

## Phase 12: Error Handling & Recovery (Priority: P2)

**Goal**: Graceful error handling with recovery options

**Independent Test**: Trigger error, see ErrorBoundary; refresh page, state recovers

### Implementation for Error Handling

- [x] T076 [P] [ERR] Create GenerationGraphErrorBoundary in packages/web/components/generation-graph/GenerationGraphErrorBoundary.tsx (FR-ER01) - adapt existing GenerationErrorBoundary from generating/[slug]/
- [x] T077 [ERR] Implement session storage for state recovery in packages/web/components/generation-graph/hooks/useSessionRecovery.ts (FR-ER02)
- [x] T078 [P] [ERR] Add toast notifications for status changes in packages/web/components/generation-graph/hooks/useToastNotifications.ts (FR-ER03)
- [x] T079 [ERR] Implement graceful degradation when realtime fails in packages/web/components/generation-graph/hooks/useGracefulDegradation.ts (FR-ER04)

**Checkpoint**: Error handling complete - errors caught, state recovers, toasts work

---

## Phase 13: Statistics Display (Priority: P2)

**Goal**: Header with course title, progress, stats bar

**Independent Test**: See header with progress %, elapsed time, cost on generation page

### Implementation for Statistics

- [x] T080 [P] [STATS] Create GraphHeader component in packages/web/components/generation-graph/GraphHeader.tsx (FR-S01) - reuse CelestialHeader pattern from generation-celestial/
- [x] T081 [P] [STATS] Create StatsBar component in packages/web/components/generation-graph/StatsBar.tsx (FR-S02) - reuse existing StatsGrid from generation/
- [x] T082 [STATS] Add real-time elapsed time counter in packages/web/components/generation-graph/StatsBar.tsx (FR-S03)
- [x] T083 [STATS] Add estimated completion time in packages/web/components/generation-graph/StatsBar.tsx (FR-S04)

**Checkpoint**: Statistics display complete - header, stats bar, elapsed time

---

## Phase 14: User Story 9 - Refinement Chat (Priority: P3 - Should Have)

**Goal**: Send refinement instructions via chat without full regeneration

**Independent Test**: On Stage 3 node, open chat, send message, see new attempt

### Implementation for User Story 9

- [x] T084 [P] [US9] Create RefinementChat component in packages/web/components/generation-graph/panels/RefinementChat.tsx (FR-RC02)
- [x] T085 [US9] Add chat button to AI-generated nodes (Stage 3,4,5,6) in packages/web/components/generation-graph/nodes/StageNode.tsx (FR-RC01)
- [x] T086 [US9] Implement refinement API call in packages/web/components/generation-graph/hooks/useRefinement.ts (FR-RC03, TRD API)
- [x] T086a [US9] Create tRPC refinement endpoint in packages/course-gen-platform/src/server/routers/generation.ts (backend for FR-RC03)
- [x] T087 [US9] Include previous output in context in packages/web/components/generation-graph/hooks/useRefinement.ts (FR-RC04)
- [x] T088 [US9] Create new attempt on refinement in packages/web/components/generation-graph/hooks/useRefinement.ts (FR-RC05)
- [x] T089 [P] [US9] Add chat history display in drawer in packages/web/components/generation-graph/panels/RefinementChat.tsx (FR-RC06)
- [x] T090 [P] [US9] Add quick action buttons (Shorter, More examples, etc.) in packages/web/components/generation-graph/panels/QuickActions.tsx (FR-RC07)
- [x] T091 [US9] Make chat section collapsible in drawer in packages/web/components/generation-graph/panels/RefinementChat.tsx (TRD Collapsible)

**Checkpoint**: Refinement chat works - send message, get new attempt, see history

---

## Phase 15: Accessibility (Priority: P2)

**Goal**: Keyboard navigation, screen reader support, List View toggle

**Independent Test**: Tab through nodes, use Enter to open, toggle to List View

### Implementation for Accessibility

- [x] T092 [P] [A11Y] Add keyboard navigation between nodes in packages/web/components/generation-graph/hooks/useKeyboardNavigation.ts (NFR-A01)
- [x] T093 [P] [A11Y] Add screen reader labels to nodes in packages/web/components/generation-graph/nodes/StageNode.tsx (NFR-A02)
- [x] T094 [A11Y] Verify color contrast meets WCAG AA in packages/web/lib/generation-graph/constants.ts (NFR-A03)
- [x] T095 [P] [A11Y] Add visible focus indicators in packages/web/components/generation-graph/nodes/StageNode.tsx (NFR-A04)
- [x] T096 [A11Y] Create List View toggle for accessibility in packages/web/components/generation-graph/controls/ViewToggle.tsx (NFR-A05)
- [x] T097 [A11Y] Create MobileProgressList component in packages/web/components/generation-graph/MobileProgressList.tsx (NFR-R03)

**Checkpoint**: Accessibility complete - keyboard nav, screen reader, list view toggle

---

## Phase 16: Performance Optimization (Priority: P2 - Should Have)

**Goal**: Handle 50+ nodes smoothly, 100+ with virtualization

**Independent Test**: Generate course with 20+ lessons, verify 60fps maintained

### Implementation for Performance

- [x] T098 [P] [PERF] Implement semantic zoom (simplified nodes at low zoom) in packages/web/components/generation-graph/nodes/StageNode.tsx (NFR-P07)
- [x] T099 [PERF] Create MinimalNode component for low zoom in packages/web/components/generation-graph/nodes/MinimalNode.tsx (NFR-P07)
- [x] T100 [P] [PERF] Create MediumNode component for medium zoom in packages/web/components/generation-graph/nodes/MediumNode.tsx (NFR-P07)
- [x] T101 [PERF] Ensure all node components are React.memo wrapped (NFR-O02)
- [x] T102 [PERF] Ensure nodes receive primitives not objects (NFR-O03)
- [x] T103 [PERF] Implement maximum update rate throttling in packages/web/components/generation-graph/hooks/useBatchedTraces.ts (FR-RT04)
- [x] T104 [PERF] Queue updates during viewport animation in packages/web/components/generation-graph/hooks/useViewportPreservation.ts (FR-RT05). Note: Use requestAnimationFrame pattern for smooth viewport transitions.

**Checkpoint**: Performance optimized - 60fps at 50+ nodes, semantic zoom works

---

## Phase 17: Admin Monitoring (Priority: P3 - Should Have)

**Goal**: Admin panel with trace inspection and timeline for admin/superadmin

**Independent Test**: As admin, see expandable admin panel with TraceViewer

### Implementation for Admin Monitoring

- [x] T105 [P] [ADMIN] Create AdminPanel wrapper (role-gated) in packages/web/components/generation-graph/panels/AdminPanel.tsx (FR-AM01)
- [x] T106 [ADMIN] Integrate existing TraceViewer component in packages/web/components/generation-graph/panels/AdminPanel.tsx (FR-AM02)
- [x] T107 [P] [ADMIN] Integrate existing GenerationTimeline component in packages/web/components/generation-graph/panels/AdminPanel.tsx (FR-AM03)
- [x] T108 [ADMIN] Add filter by stage, phase, status in packages/web/components/generation-graph/panels/AdminPanel.tsx (FR-AM04)

**Checkpoint**: Admin monitoring complete - trace viewer and timeline available

---

## Phase 18: Long-Running Generation Support (Priority: P3)

**Goal**: Handle long-running generations with indicators and background support

**Independent Test**: Start 10+ min generation, see long-running indicator, switch tabs

### Implementation for Long-Running Support

- [x] T109 [P] [LR] Add long-running indicator after threshold in packages/web/components/generation-graph/controls/LongRunningIndicator.tsx (FR-LR01)
- [x] T110 [LR] Ensure background tab support (generation continues) in packages/web/components/generation-graph/hooks/useBackgroundTab.ts (FR-LR03)
- [x] T111 [P] [LR] Add email notification request option in packages/web/components/generation-graph/controls/EmailNotificationRequest.tsx (FR-LR02) - Could Have

**Checkpoint**: Long-running support complete - indicators work, background tabs work

---

## Phase 19: Mobile Responsiveness (Priority: P2)

**Goal**: Desktop full graph, tablet simplified, mobile list fallback

**Independent Test**: Resize browser, see graph → simplified → list at breakpoints

### Implementation for Mobile Responsiveness

- [x] T112 [P] [MOBILE] Implement responsive breakpoint detection in packages/web/components/generation-graph/hooks/useBreakpoint.ts (NFR-R01 to NFR-R03)
- [x] T113 [MOBILE] Integrate MobileProgressList at <768px in packages/web/components/generation-graph/GraphView.tsx (NFR-R03)
- [x] T114 [P] [MOBILE] Add touch gestures for tablet in packages/web/components/generation-graph/hooks/useTouchGestures.ts (NFR-R02) - Could Have

**Checkpoint**: Mobile responsiveness complete - appropriate view at each breakpoint

---

## Phase 20: Testing Infrastructure (Priority: P2)

**Goal**: Add data-testid attributes for E2E testing

**Independent Test**: Run Playwright, find elements by data-testid

### Implementation for Testing

- [x] T115 [P] [TEST] Add data-testid to all nodes (NFR-T01) - verify across all node components
- [x] T116 [P] [TEST] Add data-testid to all handles (NFR-T02) - verify across all node components
- [x] T117 [P] [TEST] Add data-testid to control buttons (NFR-T03) - verify in GraphControls
- [x] T118 [P] [TEST] Add data-testid to drawer and tabs (NFR-T04) - verify in NodeDetailsDrawer
- [x] T119 [TEST] Create mock data fixtures in packages/web/tests/fixtures/graph-mock-data.ts

**Checkpoint**: Testing infrastructure complete - all elements have testids

---

### Phase 21: Polish & Cross-Cutting Concerns

**Purpose**: Final refinements affecting multiple user stories

- [x] T120 [P] Persist graph positions to localStorage per TRD Open Question #1
- [x] T121 [P] Implement aggregated view for 20+ items per TRD Open Question #2
- [x] T122 Auto-focus (pan to center) on error nodes per TRD Open Question #3
- [x] T123 Add skipped status support for optional steps (FR-SS01)
- [x] T124 [P] Add substeps display within stage nodes (FR-SS02) - Could Have
- [x] T124a [P] Add Activity tab with ActivityLog component to NodeDetailsDrawer (Appendix B) - Could Have, reuse ActivityLog from generating/[slug]/
- [x] T125 Run type-check and fix any TypeScript errors
- [x] T126 Run build and fix any build errors
- [x] T127 Run quickstart.md validation to ensure all steps work
- [x] T127a Validate Open Questions solutions: Q1 (localStorage positions), Q2 (aggregated view 20+), Q3 (error auto-focus)
- [x] T128 Create git tag `celestial-view-backup` before final integration (TRD 7.4)
