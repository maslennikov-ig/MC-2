# Feature Specification: Lesson Enrichments

**Feature Branch**: `022-lesson-enrichments`
**Created**: 2025-12-24
**Status**: Ready for Implementation
**Input**: User description: "Stage 7: Lesson Enrichments - AI-generated supplementary content for lessons including video, audio, presentations, quizzes"

---

## Implementation Status

### Prerequisite: Self-Review + Self-Fix (Stage 6 Enhancement)

| Component | Status | Tests |
|-----------|--------|-------|
| `checkLanguageConsistency()` | DONE | 30 tests |
| `checkContentTruncation()` | DONE | 30 tests |
| `selfReviewerNode` | DONE | 29 tests |
| Orchestrator routing | DONE | 22 tests |
| `SelfReviewPanel.tsx` | DONE | — |
| Code review fixes | DONE | — |

**Total**: 111 tests passing. Ready for production.

### Stage 7: Lesson Enrichments

| Phase | Tasks | Status |
|-------|-------|--------|
| Phase 1: Setup | T001-T008 | NOT STARTED |
| Phase 2: Foundational | T009-T032 | NOT STARTED |
| Phase 3: US7 View Status | T033-T041 | NOT STARTED |
| Phase 4: US1 Video | T042-T045 | NOT STARTED |
| Phase 5: US2 Quiz | T046-T048 | NOT STARTED |
| Phase 6: US3 Audio | T049-T051 | NOT STARTED |
| Phase 7: US4 Presentation | T052-T055 | NOT STARTED |
| Phase 8: US5 Manage | T056-T077 | NOT STARTED |
| Phase 9: US6 Batch | T078-T082 | NOT STARTED |
| Phase 10: Polish | T083-T095 | NOT STARTED |

**Next**: Start with Phase 1 (T001-T008) - Database migration and shared types.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add Video to Lesson (Priority: P1)

Course creators want to enhance individual lessons with AI-generated video presentations to make learning more engaging and accessible for students who prefer visual content.

**Why this priority**: Video is the most requested enrichment type for online courses. It directly increases learner engagement and course completion rates.

**Independent Test**: Can be fully tested by adding a video enrichment to a single lesson and verifying the video script is generated, reviewed, and final video produced.

**Flow**: Two-stage (script generation → user review → video generation)

**Acceptance Scenarios**:

1. **Given** a lesson with completed text content, **When** the instructor clicks the "Add Video" button, **Then** the system generates a video script and shows it for review (draft_ready)
2. **Given** a video script is ready, **When** the instructor reviews and clicks "Approve & Generate", **Then** the system queues final video generation
3. **Given** a video script is ready, **When** the instructor edits the script, **Then** changes are saved and can be approved
4. **Given** video generation is complete, **When** the instructor clicks "Preview", **Then** the video plays within the application
5. **Given** a script the instructor doesn't like, **When** they click "Regenerate Script", **Then** a new script is generated without incurring video API costs

---

### User Story 2 - Add Quiz to Lesson (Priority: P1)

Instructors want to add comprehension quizzes to lessons so students can verify their understanding of the material.

**Why this priority**: Quizzes are essential for learning verification and are relatively quick to generate, providing immediate value.

**Independent Test**: Can be fully tested by adding a quiz to a lesson and verifying questions are generated based on lesson content.

**Acceptance Scenarios**:

1. **Given** a lesson with completed content, **When** the instructor adds a quiz enrichment, **Then** the system generates relevant comprehension questions based on the lesson text
2. **Given** a generated quiz, **When** the instructor previews it, **Then** they see questions, answer options, and explanations
3. **Given** a quiz with errors, **When** the instructor clicks "Regenerate", **Then** a new quiz is generated with different questions

---

### User Story 3 - Add Audio Narration (Priority: P2)

Instructors want to provide audio versions of lessons for students who prefer listening or have accessibility needs.

**Why this priority**: Audio supports accessibility requirements and mobile learning but is less complex than video.

**Independent Test**: Can be fully tested by generating audio for a lesson and playing it back.

**Acceptance Scenarios**:

1. **Given** a lesson with text content, **When** the instructor adds audio enrichment, **Then** the system converts the lesson text to natural-sounding speech
2. **Given** audio generation is complete, **When** the user plays the audio, **Then** it accurately reads the lesson content
3. **Given** audio is generating, **When** the user views the lesson in the graph, **Then** they see a visual indicator of the generation status

---

### User Story 4 - Add Presentation Slides (Priority: P2)

Instructors want slide presentations generated from lesson content for use in webinars or supplementary study materials.

**Why this priority**: Presentations support multiple teaching modalities but depend on having good lesson content first.

**Independent Test**: Can be fully tested by generating a presentation for a lesson and viewing the slides.

**Flow**: Two-stage (slide structure → user review → final render)

**Acceptance Scenarios**:

1. **Given** a lesson with structured content, **When** the instructor adds presentation enrichment, **Then** the system generates a slide structure for review (draft_ready)
2. **Given** a slide structure is ready, **When** the instructor reviews and clicks "Approve & Render", **Then** the system creates the final HTML presentation
3. **Given** a slide structure is ready, **When** the instructor edits slide content or order, **Then** changes are saved and can be approved
4. **Given** a completed presentation, **When** the instructor previews it, **Then** they see formatted slides with titles, bullet points, and speaker notes
5. **Given** a presentation, **When** the instructor downloads it, **Then** they receive a file suitable for use in presentation software

---

### User Story 5 - Manage Multiple Enrichments (Priority: P2)

Instructors need to view, reorder, and manage all enrichments attached to a lesson in one place.

**Why this priority**: As instructors add multiple enrichments, they need efficient management tools.

**Independent Test**: Can be fully tested by adding multiple enrichments to a lesson and reordering/deleting them.

**Architecture**: Implements **Contextual Deep-Link Pattern** with Inspector Panel as Stack Navigator (ROOT → CREATE → DETAIL views)

**Acceptance Scenarios**:

1. **Given** a lesson with multiple enrichments, **When** the instructor clicks the lesson node body, **Then** Inspector Panel opens in ROOT view showing enrichment list with statuses
2. **Given** an enrichment list, **When** the instructor drags an enrichment to a new position, **Then** the order is saved and reflected everywhere
3. **Given** an unwanted enrichment, **When** the instructor deletes it, **Then** it is removed from the lesson permanently
4. **Given** a lesson is selected, **When** the instructor clicks [+ Quiz] in NodeToolbar, **Then** Inspector Panel opens directly in CREATE view with Quiz configuration form (deep-link)
5. **Given** CREATE view is open, **When** the instructor clicks "Generate", **Then** view transitions to DETAIL showing progress, then preview when complete (optimistic handoff)
6. **Given** a lesson with 2 quizzes, **When** the instructor clicks Quiz icon in Asset Dock, **Then** Inspector opens ROOT view and auto-scrolls to Quiz section (count-based routing)
7. **Given** a lesson with 1 quiz, **When** the instructor clicks Quiz icon in Asset Dock, **Then** Inspector opens directly to DETAIL view for that quiz
8. **Given** a lesson with 0 enrichments, **When** Inspector ROOT view opens, **Then** Discovery Cards are shown explaining each enrichment type with [Add] buttons
9. **Given** CREATE view with unsaved changes, **When** user clicks Back, **Then** "Discard changes?" dialog appears (Safe Harbor)

---

### User Story 6 - Batch Generate Enrichments (Priority: P3)

Instructors with many lessons want to generate the same type of enrichment for multiple lessons at once to save time.

**Why this priority**: Efficiency feature that becomes important only after basic enrichment workflow is established.

**Independent Test**: Can be fully tested by clicking ModuleGroup and generating audio for all lessons via Module Inspector.

**Architecture**: Batch operations via **Module Inspector** (separate from Lesson Inspector)

**Acceptance Scenarios**:

1. **Given** a module with 10 lessons, **When** the instructor clicks ModuleGroup header, **Then** Module Inspector opens showing "Batch Enrichments" section with type buttons
2. **Given** Module Inspector is open, **When** the instructor clicks "Generate Audio for All 10 Lessons", **Then** cost confirmation dialog appears, then audio generation begins for all lessons in parallel
3. **Given** batch generation in progress, **When** the instructor views the graph, **Then** all affected lesson Asset Docks show pulsing blue audio icons (individual progress)
4. **Given** some batch items fail, **When** viewing Module Inspector, **Then** lesson status table shows which succeeded (✓) and which failed (✗) with retry options
5. **Given** batch generation is active, **When** instructor clicks individual lesson, **Then** Lesson Inspector opens showing that lesson's enrichment status (does not interfere with batch)

---

### User Story 7 - View Enrichment Status in Graph (Priority: P1)

Instructors need to see at a glance which lessons have enrichments and their current status without leaving the course graph view.

**Why this priority**: Essential for workflow efficiency - instructors shouldn't need to click each lesson to know its enrichment status.

**Independent Test**: Can be fully tested by generating enrichments and observing status changes in the graph.

**Acceptance Scenarios**:

1. **Given** a lesson with enrichments, **When** viewing the course graph, **Then** the lesson shows icons indicating which enrichment types exist
2. **Given** an enrichment is generating, **When** viewing the graph, **Then** the relevant icon pulses or animates to show active generation
3. **Given** an enrichment has failed, **When** viewing the graph, **Then** a visual warning indicator appears on the lesson

---

### Edge Cases

- What happens when lesson content is too short for meaningful video/quiz generation? System should warn users and suggest minimum content length
- How does the system handle enrichment generation when the user navigates away? Generation continues in background; status updates when user returns
- What happens when multiple enrichments of the same type are added? System queues them and generates in order
- How are partial failures handled in batch operations? Each item is tracked independently; succeeded items remain, failed items can be retried
- What happens if the user deletes a lesson that has enrichments in progress? Generation should be cancelled and pending work discarded
- What happens when lesson content changes (via self-fix/section regeneration) after enrichments were created? System shows "content changed" indicator on affected enrichments, suggesting regeneration

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to add enrichments (video, audio, presentation, quiz) to any lesson that has completed content generation
- **FR-002**: System MUST generate enrichment content using AI based on the lesson's text content
- **FR-003**: System MUST show real-time generation status (pending, generating, completed, failed) for each enrichment
- **FR-004**: System MUST allow users to preview generated enrichments within the application
- **FR-005**: System MUST allow users to regenerate failed or unsatisfactory enrichments
- **FR-006**: System MUST allow users to delete enrichments from lessons
- **FR-007**: System MUST allow users to reorder enrichments within a lesson
- **FR-008**: System MUST support batch generation of enrichments for multiple lessons
- **FR-009**: System MUST display enrichment status indicators on lesson nodes in the course graph
- **FR-010**: System MUST allow generation of multiple enrichments simultaneously (parallel processing)
- **FR-011**: System MUST automatically retry failed generations up to 3 times before marking as failed
- **FR-012**: System MUST show progress percentage during enrichment generation
- **FR-013**: System MUST persist all enrichment data and files for later access
- **FR-014**: System MUST support cancellation of in-progress enrichment generation
- **FR-015**: System MUST show "Document" enrichment type as disabled with "Coming Soon" indicator (placeholder for future file upload)
- **FR-016**: System SHOULD detect when lesson content changes after enrichment generation and display a visual indicator suggesting regeneration

### Key Entities

- **Enrichment**: A supplementary content item attached to a lesson (has type, status, content, ordering)
- **Lesson**: The parent container for enrichments (one-to-many relationship)
- **Course**: Top-level container; enrichments are accessible within course context
- **Asset**: Generated media files (video, audio, presentation files) linked to enrichments

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can add any enrichment type to a lesson in under 10 seconds (action time, not generation time)
- **SC-002**: Enrichment status updates appear in the UI within 2 seconds of status changes
- **SC-003**: Users can identify lessons with enrichments and their status at a glance without clicking individual lessons
- **SC-004**: Quiz generation produces relevant questions that match lesson content (>90% topic alignment)
- **SC-005**: Batch operations for 20+ lessons complete without user intervention or timeout
- **SC-006**: Course graphs with 50+ lessons and their enrichments remain responsive (no visible lag when panning/zooming)
- **SC-007**: All enrichment features work identically on desktop and mobile devices
- **SC-008**: All user-facing text is available in both supported languages (Russian and English)
- **SC-009**: Users with keyboard-only navigation can access all enrichment features
- **SC-010**: 95% of enrichment generations complete successfully on first or retry attempts

## Assumptions

- Lessons must have completed Stage 6 content generation before enrichments can be added
- Users understand that AI-generated content may need review and editing
- Video and audio generation may take 1-5 minutes depending on lesson length
- Quiz generation targets 5 questions by default with varying difficulty levels
- The existing course graph interface will be extended rather than replaced
- Users have stable internet connections for real-time status updates
- File upload for documents is out of scope for initial release (placeholder only)

## Technical Architecture Notes

### Two-Stage Generation Flow

Some enrichment types use a **two-stage generation flow** to give users control before expensive operations:

| Type | Flow | Description |
|------|------|-------------|
| **Video** | Two-stage | Phase 1: Generate script (cheap LLM) → User review/edit → Phase 2: Video API call |
| **Presentation** | Two-stage | Phase 1: Generate slide structure → User review/edit → Phase 2: Render HTML |
| **Audio** | Single-stage | Direct TTS generation (low cost, fast regeneration) |
| **Quiz** | Single-stage | Direct LLM generation (low cost) |

**Status Progression (Two-Stage):**
`pending` → `draft_generating` → `draft_ready` → `generating` → `completed`

**User Actions in draft_ready state:**
- Edit draft content inline
- Approve and generate final content
- Regenerate draft with different parameters

### Type Registry (Extensibility)

The enrichment system uses a **pluggable Type Registry** pattern for easy extensibility:

- New enrichment types (flashcards, summaries, mindmaps) can be added without modifying core components
- Each type defines: icon, labels, generation flow, content schema, UI components, feature flags
- Inspector Panel, Asset Dock, and BullMQ router read from registry dynamically

**Adding new type requires:**
1. Database: `ALTER TYPE enrichment_type ADD VALUE 'new_type'`
2. Schemas: Define content/settings in shared-types
3. Register: `enrichmentRegistry.register({...})`
4. UI Components: Form, DetailView, (DraftEditor if two-stage)
5. Handler: Worker implementation
