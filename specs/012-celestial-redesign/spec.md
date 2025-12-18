# Feature Specification: Generation Progress Page Redesign (Celestial Mission)

**Feature Branch**: `012-celestial-redesign`
**Created**: 2025-11-27
**Status**: Draft
**Input**: User description: "Generation Progress Page Redesign - Celestial Mission Concept"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visualize Generation Progress (Priority: P1)

As a course creator, I want to see my course generation progress visualized as a journey through celestial bodies so that I can intuitively understand the current stage, overall status, and remaining steps.

**Why this priority**: This is the core of the redesign, replacing the standard progress bar with an engaging, thematic visualization that provides better context.

**Independent Test**: Can be tested by viewing courses in various states (pending, active, completed) and verifying the visual representation matches the state.

**Acceptance Scenarios**:

1. **Given** a course is in progress, **When** I view the page, **Then** I see a vertical timeline of 5 distinct "planet" nodes representing the stages (Processing, Summarization, Analysis, Structure, Content).
2. **Given** a stage is completed, **When** I view the timeline, **Then** the corresponding planet glows green and shows a checkmark.
3. **Given** a stage is currently active, **When** I view the timeline, **Then** the corresponding planet pulses with a purple glow and shows a progress indicator.
4. **Given** a stage is pending (not yet started), **When** I view the timeline, **Then** the planet appears dimmed/gray.
5. **Given** a stage has failed, **When** I view the timeline, **Then** the planet indicates an error state (red).

---

### User Story 2 - Stage Approval Flow (Priority: P1)

As a course creator, I want to review and approve the results of key stages before proceeding to the next one, so that I can maintain quality control over the course content.

**Why this priority**: Essential for the interactive generation process where user intervention is required between stages.

**Independent Test**: Can be tested by triggering a "stage_awaiting_approval" state and verifying the UI prompts and actions.

**Acceptance Scenarios**:

1. **Given** a stage is "awaiting approval" (e.g., Analysis complete), **When** I view the page, **Then** I see a prominent "Mission Control" banner alerting me to the required action.
2. **Given** the Mission Control banner is visible, **When** I click "View Results", **Then** a detail view (drawer) opens displaying the outputs of the completed stage.
3. **Given** I am satisfied with the results, **When** I click "Approve & Continue", **Then** the system triggers the next stage and the UI updates to show the next stage as active.
4. **Given** I want to stop, **When** I click "Cancel", **Then** the generation process is terminated.

---

### User Story 3 - Detailed Stage Inspection (Priority: P2)

As a course creator, I want to inspect the details of any completed stage, so that I can understand what data was generated or processed.

**Why this priority**: Transparency is key for users to trust the AI generation process.

**Independent Test**: Can be tested by clicking on various completed stage nodes.

**Acceptance Scenarios**:

1. **Given** a stage is completed or active, **When** I click the planet node, **Then** it expands or opens a view showing detailed metrics (e.g., phase progress, LLM usage).
2. **Given** I am viewing details, **When** I close the view, **Then** I return to the main timeline overview.

---

### User Story 4 - Real-time Status Updates (Priority: P2)

As a user, I want the interface to update automatically as the generation progresses, so that I don't need to manually refresh the page to see the latest status.

**Why this priority**: The generation process can take time; real-time feedback keeps the user engaged and informed.

**Independent Test**: Can be tested by keeping the page open while the backend updates the course status.

**Acceptance Scenarios**:

1. **Given** I am viewing the page, **When** the backend completes a step or stage, **Then** the UI updates (e.g., progress bar moves, stage status changes) within 2 seconds without a page reload.

---

### Edge Cases

- **Network Disconnection**: If the real-time connection is lost, the system should indicate the disconnection or fallback to polling/manual refresh.
- **Unknown Status**: If the system receives a status string that doesn't map to a known stage, it should fallback to a safe display (e.g., generic processing) rather than crashing.
- **Mobile View**: On small screens, the vertical timeline and detailed cards must remain readable and interactive.
- **Theme Switching**: When user toggles between light/dark themes, all celestial components must update smoothly without layout shift.
- **Reduced Motion**: Users with `prefers-reduced-motion` should see static alternatives to pulsing/animated elements.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST visualize the 5 generation stages (Document Processing, Summarization, Analysis, Structure, Content) as a vertical "Celestial Journey" timeline.
- **FR-002**: The system MUST visually distinguish stage states: Pending, Active, Completed, Error, and Awaiting Approval.
- **FR-003**: The system MUST display a "Mission Control" banner when a stage requires user approval.
- **FR-004**: The system MUST allow users to view detailed results (summaries, counts, metrics) and an Activity Log for stages via a slide-out drawer or expanded card.
- **FR-005**: The system MUST provide "Approve & Continue" and "Cancel" actions for stages awaiting approval.
- **FR-006**: The system MUST update the visualization in real-time as backend data changes.
- **FR-007**: The system MUST maintain access to the existing Admin Monitoring tools (TraceViewer, Timeline) for authorized users.
- **FR-008**: The UI MUST implement the "Celestial Mission" theme (dark background, specific color palette, space motifs) as defined in the design concept.
- **FR-009**: The UI MUST support both light and dark themes, adapting the celestial visual concept appropriately for each.
- **FR-010**: The UI MUST respect user's `prefers-reduced-motion` preference by providing static alternatives to animations.

### Key Entities

- **GenerationProgress**: The core data structure tracking the overall percentage, current step, and status message of the course generation.
- **StageInfo**: A mapped representation of a specific stage (e.g., "Stage 2: Document Processing") containing its status, progress, and timing data.
- **GenerationTrace**: Detailed records of individual LLM operations, including inputs, outputs, costs, and duration, used for the detail view.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: **Clarity**: 100% of generation stages (Pending, Active, Completed, Awaiting) are visually distinct and identifiable by users.
- **SC-002**: **Interaction**: The "Approve & Continue" action successfully triggers the next stage transition in the UI within 2 seconds.
- **SC-003**: **Responsiveness**: Real-time status updates from the backend are reflected in the UI within 2 seconds.
- **SC-004**: **Mobile Usability**: The timeline and approval controls are fully functional and readable on devices as small as 375px width.
- **SC-005**: **Theme Support**: All celestial components render correctly in both light and dark themes without visual artifacts.
- **SC-006**: **Accessibility**: Users with `prefers-reduced-motion` see static states instead of animated glows/pulses.