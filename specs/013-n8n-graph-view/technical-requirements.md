# Technical Requirements Document: n8n-Style Graph Pipeline View

**Document ID**: TRD-013
**Feature Branch**: `013-n8n-graph-view`
**Status**: Draft
**Created**: 2025-01-27
**Author**: Claude + Igor

---

## 1. Executive Summary

### 1.1 Vision
Replace the current "Celestial Journey" vertical timeline with a professional **Node-Graph Interface** (similar to n8n, ComfyUI, CI/CD pipelines). This provides a high-density engineering view where users can visualize data flow between stages, parallel processes, and detailed execution states on an interactive 2D canvas.

### 1.2 Concept
**"Engineering Console"** — A node-based visualization that treats course generation as a visual data pipeline. Users see exactly what data enters each stage, how it's processed, and what comes out.

### 1.3 Key Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Library | React Flow (@xyflow/react) + elkjs | Industry standard, 771K+ weekly downloads, production-ready |
| Single View | Yes, no toggle | Avoid over-engineering, one view to maintain |
| Node Details | Hybrid (click preview + drawer) | Best of both worlds |
| Grouping | Collapsible by modules | Mindmap-style, user-requested |
| Mobile | Desktop-only for graph | Complex interactions need mouse/keyboard |

---

## 2. User Stories

### US-1: Pipeline Visualization
**As a** course creator,
**I want to** see my generation process as a node graph,
**So that I can** understand which stage is active, what's parallel, and where data flows.

### US-2: Stage Inspection
**As a** user,
**I want to** click on any node to see Input/Process/Output data,
**So that I can** understand what happened at each stage and debug issues.

### US-3: Parallel Process Tracking
**As a** user generating a course with multiple documents,
**I want to** see each document as a separate node branch,
**So that I can** track individual document processing status.

### US-4: Lesson Generation Monitoring
**As a** user,
**I want to** see lesson generation grouped by modules with expandable nodes,
**So that I can** navigate large courses without visual overload.

### US-5: Retry/Regeneration History
**As a** user,
**I want to** see all attempts when a stage was retried,
**So that I can** compare outputs and understand what changed.

### US-6: Approval Workflow
**As a** user at an approval checkpoint,
**I want to** approve or reject directly from the graph,
**So that I can** control generation flow without leaving the visualization.

### US-7: Canvas Navigation
**As a** user with a complex pipeline,
**I want to** pan, zoom, and use minimap for navigation,
**So that I can** explore large graphs efficiently.

### US-8: Generation History (Phase 2)
**As an** admin/superadmin,
**I want to** view generation history across accounts,
**So that I can** monitor platform usage and debug user issues.

### US-9: Refinement Chat
**As a** user reviewing AI-generated content,
**I want to** send refinement instructions via chat without full regeneration,
**So that I can** iteratively improve results with specific feedback.

### US-10: Retry Failed Items
**As a** user with partially failed generation,
**I want to** retry only the failed items (not the entire stage),
**So that I can** recover from errors efficiently without losing successful work.

---

## 3. Functional Requirements

### 3.1 Canvas System

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-C01 | Infinite 2D canvas with pan (drag) and zoom (scroll) | Must |
| FR-C02 | Dot grid or mesh grid background (technical aesthetic) | Must |
| FR-C03 | Minimap in corner (like n8n) | Must |
| FR-C04 | "Fit View" button to auto-center graph | Must |
| FR-C05 | Keyboard shortcuts: Space+Drag (pan), Ctrl+Scroll (zoom), Ctrl+0 (fit) | Should |
| FR-C06 | Auto-fit on initial load | Must |
| FR-C07 | Smooth 60fps animations | Must |

### 3.2 Node System

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-N01 | Nodes are rounded rectangles with colored header strip | Must |
| FR-N02 | Header color indicates stage type (see color scheme) | Must |
| FR-N03 | Node body shows: Icon + Stage Name + Status indicator | Must |
| FR-N04 | Node footer shows: Duration, Token count, Cost (when available) | Should |
| FR-N05 | Input handle (left) and Output handle (right) | Must |
| FR-N06 | Node states: pending, active (pulsing), completed (checkmark), error (red), awaiting (yellow) | Must |
| FR-N07 | Single click: Show compact metrics preview in node | Must |
| FR-N08 | Double click: Open full details drawer | Must |

### 3.3 Edge System (Connections)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-E01 | Smooth Bezier curves between nodes | Must |
| FR-E02 | Idle state: Thin grey line | Must |
| FR-E03 | Active state: Animated particles/flowing dash (data transfer) | Must |
| FR-E04 | Error state: Red line | Must |
| FR-E05 | Completed state: Solid colored line | Should |

### 3.4 Parallel Processing

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-P01 | Stage 2: Branch into N parallel nodes (one per document) | Must |
| FR-P02 | Stage 6: Branch into M parallel nodes (one per lesson) | Must |
| FR-P03 | Lesson nodes grouped by Module (collapsible containers) | Must |
| FR-P04 | Collapsed module shows: Module name + progress (3/5 lessons) | Must |
| FR-P05 | Expand module to see individual lesson nodes | Must |
| FR-P06 | Visual convergence point after parallel branches | Must |

### 3.5 Node Details Panel (Drawer)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-D01 | Slide-in drawer from right side | Must |
| FR-D02 | Three tabs: Input / Process / Output | Must |
| FR-D03 | Input tab: Raw input data (JSON viewer or formatted) | Must |
| FR-D04 | Process tab: Model used, tokens, duration, cost, quality score | Must |
| FR-D05 | Output tab: Generated result (largest section) | Must |
| FR-D06 | Retry history: Tabs or dropdown for multiple attempts | Must |
| FR-D07 | Close button and Esc key to dismiss | Must |
| FR-D08 | Drawer does not obstruct graph completely | Should |

### 3.6 Approval Workflow

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-A01 | Awaiting nodes have distinct visual style (yellow glow, badge) | Must |
| FR-A02 | "Approve" and "Reject" buttons on awaiting node | Must |
| FR-A03 | Bottom banner (MissionControlBanner) as secondary approval UI | Should |
| FR-A04 | Confirmation dialog before reject action | Must |

### 3.7 Real-time Updates

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-R01 | Subscribe to Supabase Realtime for generation_trace inserts | Must |
| FR-R02 | Update node states in real-time as traces arrive | Must |
| FR-R03 | Animate edges when data flows between stages | Must |
| FR-R04 | Connection status indicator (online/offline) | Must |
| FR-R05 | Fallback polling if realtime fails | Must |
| FR-R06 | Preserve viewport (zoom/pan) when graph updates | Must |
| FR-R07 | Incremental node addition without full relayout | Should |
| FR-R08 | Smooth animation when nodes move to new positions | Should |

#### Graph Update Strategy (FR-R06, FR-R07, FR-R08)

**Problem**: When new nodes appear (documents discovered, lessons generated), the graph must update without:
- Losing current zoom level
- Resetting pan position
- Jarring visual jumps

**Solution**:

1. **Viewport Preservation**:
   - Store viewport state before updates
   - Restore after React Flow re-renders
   - Use `fitView` ONLY on initial load

2. **Incremental Layout**:
   - When adding parallel nodes to existing group (e.g., new document in Stage 2):
     - Do NOT re-run elkjs for entire graph
     - Calculate position relative to parent group
     - Append with offset from last sibling
   - Full elkjs relayout ONLY when:
     - Stage transition (Stage 2 → Stage 3)
     - Module structure changes (new module discovered)

3. **Animation Strategy**:
   - Use Framer Motion for node position transitions
   - Duration: 300ms ease-out
   - New nodes: fade-in + slide from parent
   - Removed nodes: fade-out (rare case)

### 3.8 Statistics Display

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-S01 | Header with course title and overall progress % | Must |
| FR-S02 | Stats bar: Documents, Modules, Lessons, Time elapsed, Total cost | Should |
| FR-S03 | Real-time elapsed time counter | Should |
| FR-S04 | Estimated completion time display | Should |

### 3.9 Error Handling & Recovery

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-ER01 | ErrorBoundary wrapping graph component | Must |
| FR-ER02 | Session storage for state recovery on page refresh | Must |
| FR-ER03 | Toast notifications for errors and status changes | Must |
| FR-ER04 | Graceful degradation when realtime fails | Must |

### 3.10 Long-Running Generation Support

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-LR01 | Long-running indicator after threshold (e.g., 5 min) | Should |
| FR-LR02 | Email notification request option for long generations | Could |
| FR-LR03 | Background tab support (generation continues) | Must |

### 3.11 Admin Monitoring Section

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-AM01 | Expandable admin panel (visible only to admin/superadmin) | Must |
| FR-AM02 | TraceViewer: Interactive trace inspection with filters | Must |
| FR-AM03 | GenerationTimeline: Chronological event log | Should |
| FR-AM04 | Filter traces by stage, phase, status | Should |

### 3.12 Step/Substep Support

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-SS01 | Support for "skipped" status (optional steps) | Should |
| FR-SS02 | Substeps display within stage nodes | Could |
| FR-SS03 | Retry counter visible on nodes | Should |

### 3.13 Localization (i18n)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-L01 | All stage names must use translation keys | Must |
| FR-L02 | All node status labels translatable | Must |
| FR-L03 | All drawer/panel UI text translatable | Must |
| FR-L04 | All button labels and tooltips translatable | Must |
| FR-L05 | Error messages translatable | Must |

#### Localization Strategy

**Current state**: Project has NO i18n library. Strings are hardcoded in Russian (e.g., `STAGE_CONFIG`).

**Approach for this feature**:
1. Create translation constants file: `/lib/generation-graph/translations.ts`
2. Define all strings as objects with `ru` and `en` keys
3. Use locale from user settings or browser
4. Prepare for future migration to next-intl if needed

```typescript
// Example structure
export const GRAPH_TRANSLATIONS = {
  stages: {
    stage_1: { ru: 'Инициализация', en: 'Initialization' },
    stage_2: { ru: 'Обработка документов', en: 'Document Processing' },
    // ...
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
  },
  // ... more sections
};
```

### 3.14 Error Scenarios & Retry

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-ERR01 | Partial parallel failure: Show completed nodes green, failed red | Must |
| FR-ERR02 | Retry button on failed nodes | Must |
| FR-ERR03 | Retry single failed item (not entire stage) | Must |
| FR-ERR04 | Show error message in node tooltip/badge | Must |
| FR-ERR05 | Error details in drawer when node selected | Must |

#### Error Scenarios Table

| Scenario | Expected Behavior | UI |
|----------|-------------------|-----|
| **Partial parallel failure** (3/5 docs success, 2 failed) | Completed nodes: green ✓, Failed nodes: red ✗ | Each failed node has "Retry" button |
| **Stage completely failed** | Stage node shows error state | "Retry Stage" button on node |
| **Network disconnect during active stage** | Preserve state, show reconnection toast | Yellow connection indicator |
| **Realtime subscribe failure** | Auto-fallback to polling (FR-R05) | Show "Limited connectivity" badge |
| **User closes tab during generation** | Session storage preserves position | On return: restore view & reconnect |
| **Retry succeeds** | Update node to completed, animate edge | Toast: "Retry successful" |
| **Retry fails again** | Keep error state, increment retry counter | Show retry count badge |

#### Retry Flow

```
[Failed Node]
     │
     ▼
[User clicks "Retry"]
     │
     ▼
[Confirmation dialog: "Retry this item?"]
     │
     ├─ Cancel → [No action]
     │
     └─ Confirm → [Node shows "Retrying..." spinner]
                        │
                        ├─ Success → [Node turns green, edge animates]
                        │
                        └─ Fail → [Node stays red, retry count +1]
```

### 3.15 Approval Workflow (Extended)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-APR01 | Awaiting nodes have distinct visual style (yellow glow) | Must |
| FR-APR02 | "Approve" and "Reject" buttons on awaiting node | Must |
| FR-APR03 | Rejection opens modal with optional feedback input | Must |
| FR-APR04 | After rejection: Option to regenerate with user prompt | Must |
| FR-APR05 | Rejection reason stored in `generation_trace` | Should |
| FR-APR06 | Integrate with `courses.pause_at_stage_5` flag | Must |

#### Approval Flow Diagram

```
[Stage N completes] → [Status: stage_N_awaiting_approval]
                              │
                              ▼
                    [Node shows AWAITING state]
                    [Yellow glow, clock badge]
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
    [Approve]           [View Results]        [Reject]
         │                    │                    │
         │                    │                    ▼
         │                    │          [Rejection Modal]
         │                    │          ┌─────────────────────┐
         │                    │          │ Reason (optional):  │
         │                    │          │ [________________]  │
         │                    │          │                     │
         │                    │          │ [Cancel] [Confirm]  │
         │                    │          └─────────────────────┘
         │                    │                    │
         │                    │                    ▼
         ▼                    │          [Regenerate with feedback?]
    [Continue to              │          ┌─────────────────────┐
     next stage]              │          │ ○ Just reject       │
         │                    │          │ ● Regenerate        │
         │                    │          │   Prompt: [_______] │
         │                    │          └─────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
    [Stage N+1 starts]  [Drawer opens]    [Stage N reruns with prompt]
```

### 3.16 Refinement Chat (AI Node Feedback)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-RC01 | Chat button on AI-generated nodes (Stage 3, 4, 5, 6) | Must |
| FR-RC02 | Chat opens inline panel or modal with message input | Must |
| FR-RC03 | User message sent as refinement instruction to LLM | Must |
| FR-RC04 | Previous output included in context for refinement | Must |
| FR-RC05 | Refinement creates new attempt (preserves history) | Must |
| FR-RC06 | Chat history visible in drawer (all refinement messages) | Should |
| FR-RC07 | Quick action buttons: "Make shorter", "Add examples", "Simplify" | Could |

#### Concept: Refinement Chat

When user is not satisfied with AI-generated content, they can **refine** it via chat instead of full regeneration.

**Available on nodes**:
- Stage 3 (Summarization) — refine summaries
- Stage 4 (Analysis) — adjust analysis focus
- Stage 5 (Structure) — modify course structure
- Stage 6 (Lessons) — refine individual lesson content

**NOT available on**:
- Stage 1 (Init) — no AI generation
- Stage 2 (Documents) — file processing, no LLM

#### UI: Chat in Expanded Node (Drawer)

Refinement Chat appears at the **bottom of the expanded node drawer** when double-clicking a node.
It's **collapsible** — user can hide/show it to save space.

**Drawer with Chat Section (expanded)**:
```
┌──────────────────────────────────────────────────────────┐
│  📄 Stage 3: Summarization                          [✕] │
├──────────────────────────────────────────────────────────┤
│  ┌─────────┬─────────┬─────────────┐                    │
│  │  Input  │ Process │   Output    │                    │
│  └─────────┴─────────┴─────────────┘                    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  OUTPUT                                                  │
│  ──────────────────────────────────────────────────────  │
│  "This document covers machine learning basics..."       │
│  [Show full]                                             │
│                                                          │
│  PROCESS METRICS                                         │
│  ┌──────────┬──────────┬──────────┬──────────┐          │
│  │ Model    │ Tokens   │ Duration │ Cost     │          │
│  │ gpt-4    │ 2,341    │ 8.2s     │ $0.03    │          │
│  └──────────┴──────────┴──────────┴──────────┘          │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  💬 Refinement Chat                          [▼ Hide]   │  ← Collapsible
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─ History ───────────────────────────────────────────┐ │
│  │ 🧑 "Добавь больше примеров кода"                   │ │
│  │    ↳ Attempt 2 created                              │ │
│  │ 🧑 "Сделай короче"                                 │ │
│  │    ↳ Attempt 3 (current)                            │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ Quick Actions ─────────────────────────────────────┐ │
│  │ [Shorter] [More examples] [Simplify] [More detail]  │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Describe what to change...                          │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│                                    [Send & Regenerate 🔄]│
└──────────────────────────────────────────────────────────┘
```

**Drawer with Chat Section (collapsed)**:
```
├──────────────────────────────────────────────────────────┤
│  💬 Refinement Chat                          [▶ Show]   │  ← Click to expand
└──────────────────────────────────────────────────────────┘
```

**Behavior**:
- Default state: Collapsed (less visual noise)
- Remembers state per session (localStorage)
- Only visible on AI-generated nodes (Stage 3, 4, 5, 6)
- Hidden on pending/active nodes (only after generation complete)

#### Data Flow: Refinement Request

```
User Input: "Добавь больше практических примеров"
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ Refinement Context (sent to LLM):                       │
│                                                         │
│ 1. Previous output (what model generated)               │
│ 2. User refinement instruction                          │
│                                                         │
│ Note: Original prompt NOT sent (already embedded        │
│ in the previous output context)                         │
│                                                         │
│ System prompt addition:                                 │
│ "The user wants to refine the previous output.          │
│  Previous output: {previousOutput}                      │
│  User instruction: {userMessage}                        │
│  Generate improved version based on the instruction."   │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
           [New Attempt Created]
           [Node updates to show new result]
           [History preserved in drawer]
```

#### Backend Integration

```typescript
interface RefinementRequest {
  courseId: string;
  stageId: string;
  nodeId?: string;             // For parallel nodes (lesson_id, document_id)
  previousOutput: string;      // What was generated before
  userMessage: string;         // Refinement instruction
  attemptNumber: number;       // Incremented from previous
}

// API endpoint
POST /api/generation/refine
Body: RefinementRequest
Response: { traceId: string, status: 'queued' }

// Stored in generation_trace
{
  stage: 'stage_3',
  phase: 'refinement',
  input_data: {
    previousOutput: '...',
    userMessage: '...',
    attemptNumber: 2
  },
  output_data: { refinedContent: '...' }
}
```

#### Localization Keys (added to GRAPH_TRANSLATIONS)

```typescript
refinementChat: {
  buttonTooltip: { ru: 'Уточнить результат', en: 'Refine result' },
  panelTitle: { ru: 'Уточнение', en: 'Refinement' },
  currentOutput: { ru: 'Текущий результат', en: 'Current output' },
  chatHistory: { ru: 'История уточнений', en: 'Refinement history' },
  placeholder: { ru: 'Опишите, что изменить...', en: 'Describe what to change...' },
  send: { ru: 'Отправить и перегенерировать', en: 'Send & Regenerate' },
  attemptCreated: { ru: 'Создана попытка', en: 'Attempt created' },
  quickActions: {
    shorter: { ru: 'Короче', en: 'Shorter' },
    moreExamples: { ru: 'Больше примеров', en: 'More examples' },
    simplify: { ru: 'Упростить', en: 'Simplify' },
    moreDetail: { ru: 'Подробнее', en: 'More detail' },
  },
},
```

### 3.17 Real-time Edge Cases

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-RT01 | Handle out-of-order traces (sort by created_at) | Must |
| FR-RT02 | Deduplicate traces by ID in reducer | Must |
| FR-RT03 | Batch high-frequency updates (100ms debounce) | Should |
| FR-RT04 | Maximum visual update rate: 10/second per node | Should |
| FR-RT05 | Queue updates during viewport animation | Should |

#### High-Frequency Update Strategy

**Problem**: Stage 6 with 50 lessons can generate 500+ traces rapidly.

**Solution**:
```typescript
// Batching strategy
const BATCH_INTERVAL = 100; // ms
const MAX_UPDATES_PER_SECOND = 10;

// 1. Collect traces in batch window
// 2. Sort by created_at
// 3. Dedupe by trace.id
// 4. Apply to state in single update
// 5. Throttle visual updates per node
```

**Implementation notes**:
- Use `requestAnimationFrame` for smooth visual updates
- Pause batching during user interaction (pan/zoom)
- Priority: Error traces processed immediately (skip batch)

---

## 4. Non-Functional Requirements

### 4.1 Performance

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-P01 | Initial render time | < 500ms |
| NFR-P02 | Smooth pan/zoom | 60 fps |
| NFR-P03 | Handle 50+ nodes without lag | Yes |
| NFR-P04 | Handle 100+ nodes with virtualization | Yes |
| NFR-P05 | Memory usage | < 100MB for typical graph |
| NFR-P06 | ElkJS layout calculation in Web Worker | Should |
| NFR-P07 | Semantic Zoom: simplified nodes at zoom < 0.5 | Should |

#### ElkJS Web Worker (NFR-P06)

**Problem**: ElkJS layout calculations can block main thread on large graphs (100+ nodes).

**Solution**: Run elkjs in a dedicated Web Worker.

```typescript
// worker/layout.worker.ts
import ELK from 'elkjs/lib/elk.bundled.js';

self.onmessage = async (e) => {
  const elk = new ELK();
  const layout = await elk.layout(e.data);
  self.postMessage(layout);
};

// Usage in component
const worker = new Worker(new URL('./layout.worker.ts', import.meta.url));
worker.postMessage(graphData);
worker.onmessage = (e) => applyLayout(e.data);
```

**Priority**: Should Have for MVP, Must Have when stages > 8.

#### Semantic Zoom (NFR-P07)

**Problem**: At low zoom levels, detailed node content becomes unreadable and hurts performance.

**Solution**: Simplify node rendering based on zoom level.

| Zoom Level | Node Rendering |
|------------|----------------|
| > 0.7 | Full: icon, name, metrics, buttons, status badge |
| 0.5 - 0.7 | Medium: icon, name, status badge only |
| < 0.5 | Minimal: colored rectangle + status indicator only |

```typescript
// In CustomNode component
const zoom = useStore((s) => s.transform[2]);

if (zoom < 0.5) return <MinimalNode status={data.status} color={data.color} />;
if (zoom < 0.7) return <MediumNode {...data} />;
return <FullNode {...data} />;
```

### 4.2 Accessibility

| ID | Requirement |
|----|-------------|
| NFR-A01 | Keyboard navigation between nodes (Tab, Arrow keys) |
| NFR-A02 | Screen reader labels for nodes and states |
| NFR-A03 | Sufficient color contrast (WCAG AA) |
| NFR-A04 | Focus indicators visible |
| NFR-A05 | **List View toggle on desktop for screen reader users** |

#### List View Toggle for Accessibility (NFR-A05)

**Problem**: Canvas/Graph views are inaccessible to screen readers. They see it as one block or meaningless divs.

**Solution**: Provide a toggle to switch between Graph View and List View on desktop.

```
┌─────────────────────────────────────────────────────────┐
│  Course Generation Progress    [📊 Graph] [📋 List]    │  ← Toggle buttons
├─────────────────────────────────────────────────────────┤
```

**Behavior**:
- Default: Graph View (for visual users)
- Toggle remembers preference (localStorage)
- List View uses same `MobileProgressList.tsx` component
- Announced to screen readers: "Switched to List View for accessibility"

**Why not just use Mobile view?**
- Mobile view is auto-applied on small screens
- This toggle is for desktop users who PREFER list view (or use screen readers)

### 4.3 Testing Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-T01 | `data-testid` on all nodes | Must |
| NFR-T02 | `data-testid` on all handles (input/output ports) | Must |
| NFR-T03 | `data-testid` on control buttons (zoom, fit, minimap) | Must |
| NFR-T04 | `data-testid` on drawer and its tabs | Must |

#### E2E Testing Strategy

**Problem**: Canvas elements are difficult for E2E tests (Cypress/Playwright see them as one block).

**Solution**: Add `data-testid` attributes to all interactive elements.

```tsx
// Node component
<div data-testid={`node-${nodeId}`} data-node-status={status}>
  <Handle data-testid={`handle-input-${nodeId}`} type="target" />
  <Handle data-testid={`handle-output-${nodeId}`} type="source" />
  <button data-testid={`btn-retry-${nodeId}`}>Retry</button>
  <button data-testid={`btn-chat-${nodeId}`}>Chat</button>
</div>

// Controls
<button data-testid="graph-zoom-in">+</button>
<button data-testid="graph-zoom-out">-</button>
<button data-testid="graph-fit-view">Fit</button>
<button data-testid="graph-toggle-list">List View</button>
```

### 4.4 Browser Support

| Browser | Version |
|---------|---------|
| Chrome | Latest 2 versions |
| Firefox | Latest 2 versions |
| Safari | Latest 2 versions |
| Edge | Latest 2 versions |

### 4.5 Context Optimization

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-O01 | Split Context providers (StaticGraphContext + RealtimeStatusContext) | Should |
| NFR-O02 | React.memo for all CustomNode components | Should |
| NFR-O03 | Node components receive primitives, not complex objects | Should |

#### Split Contexts Strategy (NFR-O01)

**Problem**: Single context with all graph data causes all nodes to re-render on any change.

**Solution**: Split into two contexts:

```typescript
// 1. StaticGraphContext — changes rarely (structure, stage names, colors)
interface StaticGraphData {
  nodes: GraphNodeStatic[];        // Structure without status
  edges: GraphEdge[];              // Connections
  stageConfig: StageConfig[];      // Stage definitions
  translations: GraphTranslations; // i18n strings
}

// 2. RealtimeStatusContext — changes frequently (progress, status)
interface RealtimeStatusData {
  nodeStatuses: Map<string, NodeStatus>;  // nodeId → status
  activeNodeId: string | null;
  lastUpdated: Date;
}

interface NodeStatus {
  status: 'pending' | 'active' | 'completed' | 'error' | 'awaiting';
  progress?: number;
  duration?: number;
  errorMessage?: string;
}
```

**Usage in components**:
```typescript
// Node subscribes ONLY to what it needs
const CustomNode = memo(({ id, data }: NodeProps) => {
  // Static data — rarely changes
  const { stageConfig } = useStaticGraph();

  // Realtime status — only THIS node's status
  const status = useNodeStatus(id); // Selective subscription

  return <NodeComponent {...data} status={status} />;
});
```

#### React.memo Optimization (NFR-O02, NFR-O03)

**Problem**: React Flow re-renders all nodes when graph state changes.

**Solution**:
1. Wrap all custom node components in `React.memo`
2. Pass primitives, not objects (enables shallow comparison)

```typescript
// ❌ BAD: Passing objects
<CustomNode data={{ node: complexNodeObject }} />

// ✅ GOOD: Passing primitives
interface CustomNodeProps {
  nodeId: string;
  label: string;
  color: string;
  icon: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  progress: number;
}

const CustomNode = memo<CustomNodeProps>(({
  nodeId, label, color, icon, status, progress
}) => {
  // Component renders only when primitives change
  return (
    <div data-testid={`node-${nodeId}`}>
      {/* ... */}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison if needed
  return prevProps.status === nextProps.status
      && prevProps.progress === nextProps.progress;
});
```

**Expected Result**:
- Status update for Node A does NOT re-render Node B, C, D
- Typical re-renders reduced from 50+ to 1-2 per update

### 4.6 Responsiveness

| ID | Requirement |
|----|-------------|
| NFR-R01 | Desktop: Full graph experience (min 1024px) |
| NFR-R02 | Tablet: Simplified graph with touch gestures (768-1024px) |
| NFR-R03 | Mobile: Fallback to simplified list view (< 768px) |

#### Mobile Fallback Specification (NFR-R03)

**Important**: Mobile fallback is NOT the old "Celestial View". It's a new simplified component.

**Mobile List View** (`MobileProgressList.tsx`):
```
┌─────────────────────────────────┐
│ 📚 Course Generation            │
│ Progress: ████████░░ 75%        │
├─────────────────────────────────┤
│                                 │
│ ✓ Stage 1: Initialization       │
│   Completed • 2.3s              │
│                                 │
│ ✓ Stage 2: Documents (4 files)  │
│   Completed • 45s               │
│   └─ doc1.pdf ✓                 │
│   └─ doc2.docx ✓                │
│   └─ doc3.pdf ✓                 │
│   └─ doc4.txt ✓                 │
│                                 │
│ ⟳ Stage 3: Summarization        │
│   In Progress • 12s...          │
│   [━━━━━━━░░░] 70%              │
│                                 │
│ ○ Stage 4: Analysis             │
│   Pending                       │
│                                 │
│ ○ Stage 5: Structure            │
│   Pending                       │
│                                 │
│ ○ Stage 6: Content              │
│   Pending                       │
│                                 │
├─────────────────────────────────┤
│ [View on Desktop for Graph] ℹ️  │
└─────────────────────────────────┘
```

**Features**:
- Vertical card list (native scroll)
- Expandable stage cards (tap to see details)
- Same data as graph, different presentation
- "View on Desktop" prompt for full experience
- Touch-friendly tap targets (min 44px)

---

## 5. UI/UX Specifications

### 5.1 Color Scheme (Node Headers)

| Stage | Color | Hex | Description |
|-------|-------|-----|-------------|
| Stage 1 (Init) | Gray | #6B7280 | Trigger/Start node |
| Stage 2 (Docs) | Blue | #3B82F6 | Document processing |
| Stage 3 (Summary) | Purple | #8B5CF6 | AI summarization |
| Stage 4 (Analysis) | Purple | #8B5CF6 | AI analysis |
| Stage 5 (Structure) | Orange | #F59E0B | Structure generation |
| Stage 6 (Content) | Green | #10B981 | Content output |

### 5.2 Node States Visual

| State | Visual Treatment |
|-------|-----------------|
| Pending | Muted colors, dashed border |
| Active | Bright colors, pulsing glow animation |
| Completed | Solid colors, checkmark icon |
| Error | Red border, error icon |
| Awaiting | Yellow border, attention icon, glow |

### 5.3 Node Iconography

#### Stage Nodes (Main Pipeline)

| Stage | New Icon | Old Icon (utils.ts) | Color | Rationale |
|-------|----------|---------------------|-------|-----------|
| Stage 1 (Init) | `Play` | `Upload` | Gray | Trigger/Start action |
| Stage 2 (Docs) | `FileText` | `FileText` | Blue | Document processing |
| Stage 3 (Summary) | `Sparkles` | `Moon` | Purple | AI magic/generation |
| Stage 4 (Analysis) | `Brain` | `Orbit` | Purple | AI thinking/analysis |
| Stage 5 (Structure) | `GitBranch` | `Layers` | Orange | Branching structure |
| Stage 6 (Content) | `PenTool` | `Globe` | Green | Content creation |

**Migration note**: Update `STAGE_CONFIG` in `utils.ts` to use new icons. Old icons are kept for reference during transition.

#### Parallel Process Nodes

| Node Type | Icon | Usage |
|-----------|------|-------|
| Document node | `FileText` | Individual file in Stage 2 parallel branch |
| Lesson node | `BookOpen` | Individual lesson in Stage 6 |
| Module group (collapsed) | `Folder` | Collapsed module container |
| Module group (expanded) | `FolderOpen` | Expanded module container |

#### Utility Nodes

| Node Type | Icon | Usage |
|-----------|------|-------|
| Merge point | `GitMerge` | Convergence after parallel branches |
| End node | `CheckCircle2` | Pipeline completion |
| Error node | `AlertCircle` | Failed stage (overlays main icon) |
| Awaiting node | `Clock` | Waiting for approval (badge) |

#### Status Badges (overlay on node corner)

| Status | Badge Icon | Position |
|--------|------------|----------|
| Completed | `Check` (white on green circle) | Top-right |
| In Progress | `Loader2` (animated spinner) | Top-right |
| Error | `X` (white on red circle) | Top-right |
| Awaiting | `Clock` (white on yellow circle) | Top-right |
| Retry count | `RefreshCw` + number | Bottom-right |

### 5.4 Node Anatomy

```
┌─────────────────────────────────┐
│ ██████ Stage Name    [TypeIcon]│  ← Colored header + Type icon
├──────────────────────────[Badge]┤  ← Status badge (corner)
│                                 │
│  [Stage Icon]                   │
│                                 │
│  Status: Processing...          │  ← Node body
│  Progress: ████████░░ 80%       │
│                                 │
├─────────────────────────────────┤
│ ⏱ 12.3s  │  🔤 4.5K  │  $0.02  │  ← Footer metrics
└─────────────────────────────────┘
 ○                              ○
 ↑ Input handle        Output handle ↑
```

#### Document Node (Stage 2 parallel)
```
┌─────────────────────────────────┐
│ ██ doc1.pdf              [📄]  │  ← Filename + FileText icon
├──────────────────────────── [✓]┤
│                                 │
│  Size: 2.3 MB                   │
│  Priority: HIGH                 │
│                                 │
├─────────────────────────────────┤
│ ⏱ 3.2s  │  🔤 1.2K  │  $0.01  │
└─────────────────────────────────┘
```

#### Lesson Node (Stage 6 parallel)
```
┌─────────────────────────────────┐
│ ██ Lesson 1.3            [📖]  │  ← Lesson name + BookOpen icon
├──────────────────────────── [⟳]┤  ← Spinner for in-progress
│                                 │
│  "Introduction to ML"           │
│  Objectives: 3                  │
│                                 │
├─────────────────────────────────┤
│ ⏱ 45s   │  🔤 8.5K  │  $0.12  │
└─────────────────────────────────┘
```

#### Module Group Node (collapsed)
```
┌─────────────────────────────────┐
│ 📁 Module 1: Basics       [▶]  │  ← Folder + expand button
├─────────────────────────────────┤
│  Progress: ██████░░░░ 3/5       │
│  ⏱ 2m 15s total                │
└─────────────────────────────────┘
```

#### Merge Node
```
      ┌───┐
──────│ ⤵ │──────
      └───┘
   GitMerge icon
   (compact, no body)
```

### 5.5 Expanded Node (On Click)

```
┌─────────────────────────────────────────┐
│ ██████ Document Processing        [📄] │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────┬─────────┬─────────┐       │
│  │  Input  │ Process │ Output  │       │
│  └─────────┴─────────┴─────────┘       │
│                                         │
│  📥 Input:                              │
│  • doc1.pdf (2.3 MB)                   │
│  • doc2.docx (1.1 MB)                  │
│                                         │
│  ⚙️ Process:                            │
│  • Model: gpt-4-turbo                  │
│  • Tokens: 4,521                       │
│  • Duration: 12.3s                     │
│                                         │
│  📤 Output:                             │
│  • 2 documents classified              │
│  • Priority: HIGH                      │
│  ─────────────────────────             │
│  [View Full Details →]                 │
│                                         │
└─────────────────────────────────────────┘
```

### 5.6 Drawer Layout

```
┌──────────────────────────────────────────────────────────┐
│  📄 Stage 2: Document Processing                    [✕] │
├──────────────────────────────────────────────────────────┤
│  ┌─────────┬─────────┬─────────────┐                    │
│  │  Input  │ Process │   Output    │  ← Active tab     │
│  └─────────┴─────────┴─────────────┘    highlighted     │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─ Attempt History ──────────────────────────────────┐ │
│  │ [Attempt 1 ▼]  [Attempt 2]  [Attempt 3 (current)] │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ══════════════════════════════════════════════════════ │
│                                                          │
│  OUTPUT (60% of drawer space)                           │
│  ────────────────────────────────────────────────────── │
│                                                          │
│  {                                                       │
│    "documents": [                                        │
│      { "name": "doc1.pdf", "priority": "HIGH" },        │
│      { "name": "doc2.docx", "priority": "MEDIUM" }      │
│    ],                                                    │
│    "totalTokens": 4521,                                 │
│    "classification": "technical"                        │
│  }                                                       │
│                                                          │
│  ══════════════════════════════════════════════════════ │
│                                                          │
│  PROCESS METRICS                                        │
│  ┌──────────┬──────────┬──────────┬──────────┐         │
│  │ Model    │ Tokens   │ Duration │ Cost     │         │
│  │ gpt-4    │ 4,521    │ 12.3s    │ $0.045   │         │
│  └──────────┴──────────┴──────────┴──────────┘         │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 5.7 Module Grouping (Stage 6)

```
Collapsed:
┌─────────────────────────────────────┐
│ 📁 Module 1: Introduction    [▶]   │
│    Progress: ██████░░░░ 3/5        │
└─────────────────────────────────────┘

Expanded:
┌─────────────────────────────────────┐
│ 📂 Module 1: Introduction    [▼]   │
├─────────────────────────────────────┤
│  ┌──────────────┐                  │
│  │ Lesson 1.1 ✓ │──┐               │
│  └──────────────┘  │               │
│  ┌──────────────┐  │               │
│  │ Lesson 1.2 ✓ │──┼──→ [Merge] ──→│
│  └──────────────┘  │               │
│  ┌──────────────┐  │               │
│  │ Lesson 1.3 ⟳ │──┘               │
│  └──────────────┘                  │
└─────────────────────────────────────┘
```

---

## 6. Data Architecture

### 6.1 Data Sources

| Source | Usage |
|--------|-------|
| `generation_trace` table | Real-time trace data (input/process/output) |
| `courses` table | Course status, progress |
| `STAGE_CONFIG` | Stage definitions (reuse existing) |

### 6.2 Node Data Model

```typescript
interface GraphNode {
  id: string;                    // "stage_1", "stage_2_doc_abc123", "stage_6_lesson_xyz"
  type: 'stage' | 'document' | 'lesson' | 'module' | 'merge' | 'end';
  stageNumber: 1 | 2 | 3 | 4 | 5 | 6 | null; // null for utility nodes (merge, end)

  // Display
  label: string;
  icon: LucideIcon;
  color: string;

  // State
  status: 'pending' | 'active' | 'completed' | 'error' | 'awaiting';
  progress?: number;             // 0-100 for active nodes

  // Metrics
  duration?: number;             // ms
  tokens?: number;
  cost?: number;                 // USD

  // Data (from traces)
  inputData?: Record<string, unknown>;
  outputData?: Record<string, unknown>;

  // Grouping
  parentId?: string;             // For lessons in modules
  isCollapsed?: boolean;         // For module nodes

  // Retry history
  attempts?: TraceAttempt[];
}

interface TraceAttempt {
  attemptNumber: number;
  timestamp: Date;
  inputData: Record<string, unknown>;
  outputData: Record<string, unknown>;
  processMetrics: ProcessMetrics;
  status: 'success' | 'failed';
}

interface ProcessMetrics {
  model: string;
  tokens: number;
  duration: number;
  cost: number;
  qualityScore?: number;
}
```

### 6.3 Edge Data Model

```typescript
interface GraphEdge {
  id: string;
  source: string;               // Node ID
  target: string;               // Node ID
  sourceHandle?: string;
  targetHandle?: string;

  // Visual state
  status: 'idle' | 'active' | 'completed' | 'error';
  animated: boolean;
}
```

### 6.4 Graph Construction Logic

```
1. Start with Stage 1 node (always single)
2. Stage 1 → Stage 2:
   - If 1 document: single Stage 2 node
   - If N documents: N parallel Stage 2 nodes + merge node
3. Merge → Stage 3 (single)
4. Stage 3 → Stage 4 (single)
5. Stage 4 → Stage 5 (single)
6. Stage 5 → Stage 6:
   - Create Module group nodes (collapsed by default)
   - Each module contains Lesson nodes
   - Lessons within module can run parallel
   - All lessons merge → End node
```

---

## 7. Technical Implementation

### 7.1 Technology Stack

| Layer | Technology |
|-------|------------|
| Graph Library | @xyflow/react (React Flow v12+) |
| Layout Engine | elkjs |
| Styling | Tailwind CSS |
| Icons | Lucide React |
| Animations | Framer Motion |
| State | React Context + useReducer (existing pattern) |
| Real-time | Supabase Realtime (existing) |

### 7.2 Component Architecture

```
/components/generation-graph/
├── index.ts                    # Exports
├── GraphView.tsx               # Main container with ReactFlow
├── nodes/
│   ├── StageNode.tsx          # Generic stage node
│   ├── DocumentNode.tsx       # Document processing node
│   ├── LessonNode.tsx         # Lesson generation node
│   ├── ModuleGroup.tsx        # Collapsible module container
│   └── MergeNode.tsx          # Convergence point
├── edges/
│   ├── AnimatedEdge.tsx       # Custom animated edge
│   └── DataFlowEdge.tsx       # Particle animation edge
├── panels/
│   ├── NodeDetailsDrawer.tsx  # Right drawer (reuses StageResultsDrawer)
│   ├── InputTab.tsx           # Input data view
│   ├── ProcessTab.tsx         # Process metrics view
│   └── OutputTab.tsx          # Output data view
├── controls/
│   ├── GraphControls.tsx      # Zoom/fit buttons
│   ├── GraphMinimap.tsx       # Minimap wrapper
│   └── ApprovalControls.tsx   # Approve/reject buttons
├── hooks/
│   ├── useGraphData.ts        # Transform traces to graph
│   ├── useGraphLayout.ts      # elkjs layout calculation
│   └── useNodeSelection.ts    # Selection state
└── utils/
    ├── layout.ts              # Layout algorithms
    ├── transform.ts           # Trace → Node transformations
    └── constants.ts           # Colors, sizes, etc.
```

### 7.3 Integration Points

| Integration | Approach |
|-------------|----------|
| Real-time data | Reuse `useGenerationRealtime()` hook |
| Stage config | Reuse `STAGE_CONFIG` from celestial/utils.ts |
| Drawer | Adapt `StageResultsDrawer` component |
| Approval | Reuse approval actions, add node-level UI |
| Stats | Reuse `StatsGrid` component in header |

### 7.4 Migration Strategy

1. Create new `/components/generation-graph/` folder
2. Implement GraphView as replacement for CelestialJourney
3. Update `GenerationProgressContainerEnhanced.tsx` to use GraphView
4. Keep celestial components in codebase (no deletion)
5. Tag current state: `git tag celestial-view-backup`

---

## 8. Security Considerations

### 8.1 Access Control

| Requirement | Implementation |
|-------------|----------------|
| Trace access control | RLS policies (superadmin sees all, org admin sees org, user sees own) |
| Course ownership verification | Verify `course.owner_id` or `course.account_id` before rendering |
| Admin panel authorization | Check role via session before rendering admin components |
| Approval authorization | Only course owner or org admin can approve/reject |

### 8.2 Data Privacy

| Concern | Mitigation |
|---------|------------|
| PII in traces | `input_data`/`output_data` may contain document content. Sanitize before display, truncate large text. |
| Sensitive prompts | `prompt_text` and `completion_text` visible only to admin/superadmin |
| Cost data | `cost_usd` visible only to course owner and admins |

### 8.3 Client-Side Security

| Requirement | Implementation |
|-------------|----------------|
| Role verification | Server-side role check before API calls |
| Token validation | Supabase session validation on realtime connect |
| Input sanitization | Escape user-provided text (rejection reason, prompts) |

### 8.4 RLS Policy Reference

```sql
-- From existing migration: generation_trace RLS
-- Superadmin: SELECT * (all traces)
-- Org Admin: SELECT * WHERE course.account_id = user.account_id
-- User: SELECT * WHERE course.owner_id = auth.uid()
```

---

## 9. Scalability: Future Stages

### 9.1 Overview

Current pipeline has 6 stages. Future releases will add more stages for:
- **Homework Generation** (Stage 7+)
- **Video Generation** (Stage 8+)
- **Quiz/Assessment Generation** (Stage 9+)
- **Interactive Elements** (Stage 10+)

The architecture MUST support:
- Adding new stages without refactoring
- Inserting stages between existing ones
- Different stage types with unique behaviors
- User-friendly visualization for all audiences (admins AND end users)

### 9.2 Extensible Stage Configuration

```typescript
// Current STAGE_CONFIG pattern - MUST remain extensible
interface StageConfig {
  number: number;
  name: string;
  icon: LucideIconName;
  color: string;
  type: StageType;

  // Future-proofing
  category?: 'core' | 'content' | 'assessment' | 'media';
  parallelizable?: boolean;
  optional?: boolean;
  dependencies?: string[]; // stage IDs this depends on
}

type StageType =
  | 'trigger'      // Start nodes
  | 'document'     // File processing
  | 'ai'           // LLM operations
  | 'structure'    // Structure generation
  | 'content'      // Content output
  | 'assessment'   // Quiz/homework (FUTURE)
  | 'media'        // Video/audio (FUTURE)
  | 'interactive'; // Interactive elements (FUTURE)
```

### 9.3 Future Stage Definitions (Planned)

| Stage | Name | Icon | Color | Type | Category |
|-------|------|------|-------|------|----------|
| 7 | Homework Generation | `ClipboardList` | Amber | assessment | assessment |
| 8 | Quiz Generation | `HelpCircle` | Cyan | assessment | assessment |
| 9 | Video Script | `Video` | Red | media | media |
| 10 | Interactive Elements | `MousePointer` | Pink | interactive | interactive |

### 9.4 Visual Grouping by Category

For pipelines with many stages (10+), group visually by category:

```
┌─ CORE ────────────────────────────────────────────────────┐
│ [Init] → [Docs] → [Summary] → [Analysis] → [Structure]    │
└───────────────────────────────────────────────────────────┘
                              ↓
┌─ CONTENT ─────────────────────────────────────────────────┐
│ [Lessons] → [Homework] → [Quiz]                           │
└───────────────────────────────────────────────────────────┘
                              ↓
┌─ MEDIA ───────────────────────────────────────────────────┐
│ [Video Script] → [Interactive]                            │
└───────────────────────────────────────────────────────────┘
```

### 9.5 Adding New Stages (Developer Guide)

To add a new stage:

1. **Update STAGE_CONFIG** in `utils/constants.ts`:
   ```typescript
   stage_7: {
     number: 7,
     name: 'Homework Generation',
     icon: 'ClipboardList',
     color: '#F59E0B',
     type: 'assessment',
     category: 'assessment',
     parallelizable: true,
   }
   ```

2. **Create Node Component** (if unique UI needed):
   ```
   /components/generation-graph/nodes/HomeworkNode.tsx
   ```

3. **Register in nodeTypes**:
   ```typescript
   const nodeTypes = {
     ...existingTypes,
     homework: HomeworkNode,
   };
   ```

4. **Update Graph Construction Logic** in `useGraphData.ts`

5. **Add Edge Color/Animation** if needed

### 9.6 User Experience Considerations

**For End Users (non-technical)**:
- Clear, friendly stage names (not "Stage 7")
- Progress indication per category
- Estimated time remaining
- Collapse/expand category groups
- Skip optional stages option

**For Admins/Power Users**:
- Full technical details available
- Trace inspection
- Manual retry per stage
- Skip/force progression

### 9.7 Database Considerations

Future stages may require:
- New trace types in `generation_trace` table
- New columns for stage-specific metrics
- Consider: `stage` column should use TEXT not ENUM for extensibility

---

## 9. Phase 2: Generation History (Future)

### 9.1 Requirements

| ID | Requirement |
|----|-------------|
| PH2-01 | Superadmin: View all generation history across all accounts |
| PH2-02 | Admin: View generation history for their organization |
| PH2-03 | User: View own generation history only |
| PH2-04 | History list with filters (date, status, course name) |
| PH2-05 | Click to replay generation graph (read-only) |
| PH2-06 | RLS policies for access control |

### 9.2 Data Model Extension

```sql
-- Already exists: generation_trace linked to course_id
-- Need: Index for historical queries
CREATE INDEX idx_generation_trace_course_created
ON generation_trace(course_id, created_at DESC);

-- View for history with proper RLS
CREATE VIEW generation_history AS
SELECT
  c.id as course_id,
  c.title,
  c.account_id,
  c.status,
  c.created_at,
  c.updated_at,
  COUNT(gt.id) as trace_count,
  SUM(gt.tokens_used) as total_tokens,
  SUM(gt.cost_usd) as total_cost
FROM courses c
LEFT JOIN generation_trace gt ON gt.course_id = c.id
GROUP BY c.id;
```

---

## 10. Acceptance Criteria

### 10.1 Must Have (MVP)

- [ ] Canvas renders with dot grid background
- [ ] Pan/zoom works smoothly (60fps)
- [ ] All 6 stages displayed as connected nodes
- [ ] Node states update in real-time
- [ ] Edge animations when data flows
- [ ] Single click shows compact metrics
- [ ] Double click opens details drawer
- [ ] Drawer has Input/Process/Output tabs
- [ ] Parallel documents show as branched nodes
- [ ] Approval buttons work on awaiting nodes
- [ ] Minimap visible and functional
- [ ] Fit-to-view button works
- [ ] ErrorBoundary with graceful error display
- [ ] Session storage for state recovery on refresh
- [ ] Toast notifications for status changes
- [ ] Fallback polling when realtime disconnects
- [ ] Background tab support (generation continues)
- [ ] **Retry button on failed nodes (individual item retry)**
- [ ] **Partial failure handling (some green, some red)**

### 10.2 Should Have

- [ ] Module grouping for Stage 6 lessons (collapsible)
- [ ] Retry history tabs in drawer
- [ ] Keyboard shortcuts
- [ ] Stats header bar with estimated completion
- [ ] Connection status indicator
- [ ] Long-running generation indicator
- [ ] Admin monitoring panel (TraceViewer + Timeline)
- [ ] Skipped status support for optional steps
- [ ] Retry counter on nodes
- [ ] **Refinement Chat in drawer (collapsible section)**
- [ ] **Chat history visible per node**
- [ ] **Quick action buttons (Shorter, More examples, etc.)**

### 10.3 Could Have

- [ ] Touch gestures for tablet
- [ ] Custom edge particle animations
- [ ] Dark/light theme sync
- [ ] Export graph as image
- [ ] Email notification for long-running generations
- [ ] Substeps display within nodes
- [ ] **AI-suggested refinements based on output**

---

## 11. Open Questions

| # | Question | Status | Decision |
|---|----------|--------|----------|
| 1 | Should we persist graph positions (localStorage)? | **Resolved** | Yes, persist to localStorage. Key: `graph-positions-{courseId}` |
| 2 | Maximum documents/lessons before switching to aggregated view? | **Resolved** | 20 items. Beyond 20: show aggregated node with expand option |
| 3 | Should error nodes auto-focus (pan to center)? | **Resolved** | Yes, with smooth 500ms pan animation. User can disable in settings |

---

## 12. References

- [React Flow Documentation](https://reactflow.dev)
- [n8n UI Reference](https://n8n.io)
- [elkjs Layout Options](https://eclipse.dev/elk/reference.html)
- Current implementation: `/packages/web/components/generation-celestial/`

---

## Appendix A: Keyboard Shortcuts (n8n Reference)

| Shortcut | Action |
|----------|--------|
| Space + Drag | Pan canvas |
| Scroll | Zoom in/out |
| Ctrl + 0 | Fit to view |
| Ctrl + + | Zoom in |
| Ctrl + - | Zoom out |
| Tab | Navigate to next node |
| Shift + Tab | Navigate to previous node |
| Enter | Open node details |
| Escape | Close drawer / Deselect |

---

## Appendix B: Existing Components to Reuse

| Component | Location | Reuse Strategy |
|-----------|----------|----------------|
| StageResultsDrawer | generation-celestial/ | Adapt for graph context |
| StageResultsPreview | generation/ | Use in Output tab |
| PhaseProgress | generation-celestial/ | Use in Process tab |
| StatsGrid | generation/ | Use in header |
| ActivityLog | generating/[slug]/ | Use in drawer Activity tab |
| MissionControlBanner | generation-celestial/ | Reuse for approval UI |
| CelestialHeader | generation-celestial/ | Adapt as GraphHeader |
| STAGE_CONFIG | generation-celestial/utils.ts | Direct reuse |
| buildStagesFromStatus | generation-celestial/utils.ts | Direct reuse |
| getStageFromStatus | generation-celestial/utils.ts | Direct reuse |
| isAwaitingApproval | generation-celestial/utils.ts | Direct reuse |
| useGenerationRealtime | generation-monitoring/ | Direct reuse |
| TraceViewer | generation-monitoring/ | Direct reuse for admin section |
| GenerationTimeline | generation-monitoring/ | Direct reuse for admin section |
| GenerationErrorBoundary | generating/[slug]/ | Direct reuse |
| ProgressSkeleton | generating/[slug]/ | Adapt for graph loading state |

## Appendix C: State Management (from current implementation)

```typescript
// Reuse existing EnhancedProgressState structure
interface EnhancedProgressState {
  progress: GenerationProgress;
  status: CourseStatus;
  error: Error | null;
  isConnected: boolean;
  activeTab: 'overview' | 'steps' | 'activity';
  activityLog: ActivityEntry[];
  retryAttempts: number;
  estimatedTime: number;

  // Long-running support
  isLongRunning: boolean;
  emailNotificationRequested: boolean;
  longRunningStartTime?: Date;
  stepRetryCount: Map<number, number>;

  // Toast notifications
  toast: {
    show: boolean;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string
  } | null;
}

// Session storage key pattern
const SESSION_KEY = `course-generation-{courseId}-state`;
const SESSION_EXPIRY = 30 * 60 * 1000; // 30 minutes
```

## Appendix D: Node Status Mapping

| CourseStatus | Graph Node State | Visual |
|--------------|------------------|--------|
| initializing | stage_1: active | Pulsing |
| processing_documents | stage_2: active | Pulsing |
| analyzing_task | stage_4: active | Pulsing |
| generating_structure | stage_5: active | Pulsing |
| generating_content | stage_6: active | Pulsing |
| stage_X_awaiting_approval | stage_X: awaiting | Yellow glow |
| completed | all: completed | Checkmarks |
| failed | current: error | Red border |
| cancelled | current: error | Red border |
