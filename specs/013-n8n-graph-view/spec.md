# Feature Specification: n8n-Style Graph Pipeline View

**Feature Branch**: `013-n8n-graph-view`
**Created**: 2025-11-28
**Status**: Draft
**Input**: Technical Requirements Document (TRD-013)

## Clarifications

### Session 2025-11-28
- Q: How should content refinement attempts be represented in the graph structure? → A: Internal Versioning (Refinements add to an "Attempts" list inside the node drawer; graph structure remains unchanged).
- Q: Should users be allowed to manually skip failed pipeline stages? → A: No Skipping (User cannot skip stages; all nodes must complete successfully to proceed to maintain data integrity).
- Q: Where should the compute-heavy graph layout calculations (ElkJS) be executed? → A: Web Worker (ElkJS runs in a background thread to prevent UI blocking and ensure smooth performance).
- Q: How should localization strings be handled without a full i18n library? → A: Separate Files (Create `lib/translations.ts` with objects for RU/EN; components import strings from there).
- Q: Where should the primary "Approve/Reject" actions be located in the UI? → A: Dual Location (Primary actions in global MissionControlBanner; secondary context actions inside the node details drawer).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pipeline Visualization & Monitoring (Priority: P1)

As a course creator, I want to visualize the entire course generation process as an interactive node graph so that I can instantly understand the current state, active stages, and data flow.

**Why this priority**: This is the core view that replaces the existing vertical timeline. Without this, users cannot effectively monitor the complex, multi-stage generation process.

**Independent Test**: Verify that a user can load the graph, identify which stage is currently active (pulsing/highlighted), and see the progression from start to finish.

**Acceptance Scenarios**:

1. **Given** a course generation is in progress, **When** the user opens the graph view, **Then** they see a directed graph where completed nodes are green, the active node is pulsing, and future nodes are gray.
2. **Given** a complex graph, **When** the user drags the canvas or scrolls the mouse wheel, **Then** the view pans and zooms smoothly (60fps).
3. **Given** the graph is loaded, **When** the user clicks "Fit View", **Then** the entire graph is centered and scaled to fit the screen.

---

### User Story 2 - Detailed Node Inspection (Priority: P1)

As a user, I want to inspect any node in the graph to view its specific input, processing metrics, and output results.

**Why this priority**: Users need to trust the AI generation. Transparency into what went in and what came out is essential for debugging and verification.

**Independent Test**: Click on any completed node and verify a drawer opens with correct data.

**Acceptance Scenarios**:

1. **Given** a completed stage node, **When** the user double-clicks it, **Then** a drawer slides out from the right showing "Input", "Process", and "Output" tabs.
2. **Given** the "Process" tab is selected, **When** viewing details, **Then** metrics like token usage, duration, and cost are displayed.
3. **Given** the "Output" tab is selected, **When** viewing details, **Then** the actual generated content (text, JSON, etc.) is visible.

---

### User Story 3 - Parallel Process Tracking (Priority: P2)

As a user, I want to see parallel processes (like multiple documents or lessons) as individual branched nodes to track the status of each item independently.

**Why this priority**: Hiding parallel processes obscures failures. If one document fails, the user needs to know *which* one, not just that the "stage failed".

**Independent Test**: Generate a course with 3 documents and verify 3 separate nodes appear in the Document Processing stage.

**Acceptance Scenarios**:

1. **Given** a course with multiple source documents, **When** the Document Processing stage begins, **Then** the graph branches into multiple parallel nodes, one for each file.
2. **Given** multiple parallel lessons, **When** displayed in the graph, **Then** they are visually grouped by their parent Module to prevent clutter.
3. **Given** a module group, **When** clicked/toggled, **Then** it expands to show the individual lesson nodes within it.

---

### User Story 4 - Approval & Error Handling (Priority: P2)

As a user, I want to approve/reject stages and retry failed items directly from the graph to control the generation flow.

**Why this priority**: Users need control. They must be able to stop bad generations early or fix specific failures without restarting the whole process.

**Independent Test**: Trigger a stage failure and verify the "Retry" button appears and works for that specific node.

**Acceptance Scenarios**:

1. **Given** a stage waiting for approval, **When** the user clicks "Approve" on the node, **Then** the node turns green and the next stage begins immediately.
2. **Given** a single failed document node among successful ones, **When** the user clicks "Retry" on that specific node, **Then** only that document is re-processed, while others remain completed.
3. **Given** a partial failure (some nodes red, some green), **When** the graph renders, **Then** the overall stage is not marked as "Success" until all items are resolved.
4. **Given** a failed node, **When** the user interacts with it, **Then** no option to "Skip" the stage is presented (all stages are mandatory).
5. **Given** a stage awaiting approval, **When** the user views the screen, **Then** primary approval actions appear in the bottom `MissionControlBanner`, and secondary actions are available in the node details drawer.

---

### User Story 5 - Content Refinement Chat (Priority: P3)

As a user, I want to chat with the AI context of a specific node to refine its output without regenerating the entire stage from scratch.

**Why this priority**: "All or nothing" regeneration is frustrating. Iterative refinement improves user satisfaction and output quality.

**Independent Test**: Open a completed lesson node, use the chat to say "Make it shorter", and verify a new output version is created.

**Acceptance Scenarios**:

1. **Given** a completed AI node (e.g., Summary), **When** the user opens the drawer, **Then** a "Refinement Chat" section is available.
2. **Given** the user sends a refinement request (e.g., "Add examples"), **When** the system processes it, **Then** a new output version is generated and stored as a history attempt.
3. **Given** a refinement is generated, **When** viewing the node in the graph, **Then** the graph structure remains unchanged (no new external nodes), but the drawer shows multiple version attempts.

---

### User Story 6 - Admin Generation History (Priority: P4 / Phase 2)

As an admin or superadmin, I want to view generation history across all accounts so that I can monitor platform usage and debug user issues.

**Why this priority**: This is an administrative feature that enhances support capabilities but is not required for core user functionality.

**Independent Test**: Log in as superadmin and verify the ability to view generation traces from other users' courses.

**Acceptance Scenarios**:

1. **Given** a superadmin is logged in, **When** they access the admin panel, **Then** they see a list of all generation traces across all accounts.
2. **Given** an org admin is logged in, **When** they access the admin panel, **Then** they see generation traces only for courses within their organization.
3. **Given** the admin panel is open, **When** filtering by stage or status, **Then** the trace list updates to show only matching entries.

**Note**: This feature is planned for Phase 2 and is out of scope for the initial MVP release.

### Edge Cases

- **Network Disconnect**: If the real-time connection drops, the graph should show a "Reconnecting" indicator and fall back to polling or preserve the last known state.
- **Massive Graphs**: If a course has 100+ lessons, the graph should use virtualization or semantic zooming (hiding details at low zoom) to maintain performance.
- **Mobile Devices**: On screens narrower than 768px, the complex graph should be replaced by a simplified linear list view.
- **High-Frequency Updates**: Stage 6 with 50+ lessons can generate hundreds of traces rapidly. The system must batch updates (100ms window) and limit visual updates to 10/second per node.
- **Out-of-Order Traces**: Real-time traces may arrive out of order. The system must sort by `created_at` timestamp and deduplicate by trace ID.
- **Tab Closure During Generation**: If the user closes the tab during active generation, session storage must preserve the last known state for recovery on return.
- **Partial Parallel Failure**: If 3 of 5 documents succeed but 2 fail, the system must show individual status per node (not a single "stage failed" message).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST render a 2D infinite canvas with pan and zoom capabilities.
- **FR-002**: The system MUST represent the course generation pipeline as a directed graph of nodes (Stages) and edges (Transitions).
- **FR-003**: The system MUST support real-time state updates, visually changing node colors/icons as backend status changes (Pending -> Active -> Completed/Failed).
- **FR-004**: The system MUST support branching visualization for parallel tasks (e.g., processing multiple documents, generating multiple lessons).
- **FR-005**: The system MUST implement collapsible grouping for Module nodes to manage visual complexity.
- **FR-006**: The system MUST provide a details drawer for each node containing Input data, Processing metrics (tokens, time, cost), and Output content.
- **FR-007**: The system MUST allow users to perform actions on nodes: Approve, Reject, and Retry.
- **FR-008**: The system MUST support "item-level retry," allowing a user to retry a single failed parallel node without resetting the entire stage. The retry count MUST be visible as a badge on nodes that have been retried.
- **FR-009**: The system MUST maintain graph view state (zoom level, pan position) in session storage and restore it on page refresh or tab recovery.
- **FR-010**: The system MUST provide a fallback "List View" for mobile devices or accessibility needs.
- **FR-011**: The system MUST support iterative refinement via a chat interface within the node details drawer. Refinements MUST create internal version history entries within the node context, NOT new nodes on the graph.
- **FR-012**: The system MUST NOT allow skipping of failed stages; all nodes in the pipeline MUST be completed successfully to proceed.
- **FR-013**: The system MUST isolate localization strings in a dedicated file (e.g., `lib/translations.ts`) rather than hardcoding them, to support future i18n migration.
- **FR-014**: The system MUST present primary approval actions in the `MissionControlBanner` and secondary actions within the node details drawer.
- **FR-015**: The system MUST provide a manual toggle to switch between "Graph View" and "List View" on desktop interfaces to support screen readers and accessibility preferences.
- **FR-016**: The system MUST implement "Semantic Zoom" behavior: at zoom levels below 0.5, nodes MUST render in a simplified "minimal" mode (color + status only) to improve readability and performance.
- **FR-017**: The system SHOULD support keyboard shortcuts: Space+Drag for pan, Ctrl+Scroll (or Cmd+Scroll on Mac) for zoom, Ctrl+0 for fit view.
- **FR-018**: The system MUST display a header with course title, overall progress percentage, and a stats bar showing: document count, module count, lesson count, elapsed time, and total cost.
- **FR-019**: The system MUST support background tab generation (generation continues when tab is not focused) and SHOULD show a long-running indicator after 5 minutes of active processing.
- **FR-020**: The system MUST provide an expandable admin panel with trace inspection and generation timeline (visible only to admin/superadmin roles). This is related to User Story 6 (Phase 2).

### Non-Functional Requirements

- **NFR-001 (Performance)**: Complex graph layout calculations (ElkJS) MUST run in a Web Worker to prevent main-thread blocking.
- **NFR-002 (Optimization)**: The architecture MUST utilize split React contexts (separating static graph structure from high-frequency real-time status updates) to minimize re-renders.
- **NFR-003 (Testability)**: All interactive graph elements (nodes, handles, buttons, drawers) MUST have stable `data-testid` attributes to enable reliable E2E testing (e.g., `data-testid="node-stage-1"`).
- **NFR-004 (Accessibility)**: The application MUST comply with WCAG AA standards, including sufficient color contrast for node states and keyboard navigation support within the graph.
- **NFR-005 (Browser Support)**: The system MUST support Chrome, Firefox, Safari, and Edge (latest 2 versions of each).
- **NFR-006 (Responsiveness)**: Desktop (≥1024px): full graph experience; Tablet (768-1024px): simplified graph with touch gestures; Mobile (<768px): list view fallback.
- **NFR-007 (Performance Targets)**: Initial render <500ms for 20 nodes; 60fps for pan/zoom; support 100+ nodes with virtualization; memory usage <100MB for typical graphs.

### Security & Privacy

- **SEC-001**: The system MUST enforce Row Level Security (RLS) policies for all trace data; users must only see traces for courses they own or have org-level access to.
- **SEC-002**: Sensitive data (e.g., raw prompt text, internal completion logic) MUST be visible only to users with Admin or Superadmin roles.
- **SEC-003**: Large text inputs/outputs in the drawer MUST be sanitized and optionally truncated to prevent DOM performance issues or XSS vulnerabilities.

### Scalability & Future Proofing

- **SCL-001**: The stage configuration system MUST be extensible to support future stages (e.g., Homework, Video, Quiz - Stages 7-10) without refactoring the core graph rendering logic.
- **SCL-002**: The graph visualization MUST support "Category Grouping" (e.g., Core, Content, Media) to visually organize pipelines with 10+ stages.

### Key Entities

- **GraphNode**: Represents a visual unit (Stage, Document, Lesson) with ID, status, type, and position.
- **GenerationTrace**: The source of truth record containing input/output data, metrics, and status for each step.
- **Course**: The parent entity whose state drives the overall graph progression.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Initial graph render time is under 500ms for a standard course (approx. 20 nodes).
- **SC-002**: Canvas interactions (pan/zoom) maintain a consistent frame rate of 60fps.
- **SC-003**: Real-time updates reflect on the graph within 1 second of the backend state change.
- **SC-004**: Users can identify a specific failed item in a parallel process (e.g., "Lesson 3 failed") within 5 seconds of viewing the graph.
- **SC-005**: The system successfully handles rendering of graphs with up to 100 nodes without browser freezing, utilizing Web Workers for layout calculations.
