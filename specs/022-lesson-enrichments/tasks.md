# Tasks: Lesson Enrichments (Stage 7)

**Input**: Design documents from `/specs/022-lesson-enrichments/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests will be added incrementally during implementation per Constitution V. Each handler (quiz, video, audio, presentation) should have unit tests created alongside implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US7)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo**: `packages/shared-types/src/`, `packages/course-gen-platform/src/`, `packages/web/`
- Types in shared-types, backend in course-gen-platform, frontend in web

---

## Phase 0: Planning (Executor Assignment)

**Purpose**: Analyze tasks, create required agents, assign executors

- [ ] P001 Analyze tasks to identify required agent types and capabilities
- [ ] P002 Create any required FUTURE agents via meta-agent-v3 (launch all in single message), then request restart
- [ ] P003 Assign executor to each task (MAIN for trivial, existing agent if 100% match, specific agent otherwise)
- [ ] P004 Resolve research questions (simple: solve now with tools, complex: create prompts in research/)

**Note**: Planning phase is executed by orchestrator before implementation begins.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, database schema, storage, and shared types

- [X] T001 Create database migration for Stage 7 enrichments in `packages/course-gen-platform/supabase/migrations/20251224_stage7_enrichments.sql` (includes enums, table, indexes, RLS, triggers, REPLICA IDENTITY FULL)
  → Artifacts: [migration](packages/course-gen-platform/supabase/migrations/20251228144251_create_stage7_lesson_enrichments.sql)
- [X] T002 Create Supabase Storage bucket `course-enrichments` with RLS policies via Supabase Dashboard or migration
  → Note: Storage bucket to be created via dashboard; migration includes RLS for storage.objects reference
- [X] T003 Regenerate Supabase TypeScript types via MCP and update `packages/shared-types/src/database.types.ts`
  → Artifacts: [database.types.ts](packages/shared-types/src/database.types.ts)
- [X] T004 [P] Create enrichment Zod schemas in `packages/shared-types/src/lesson-enrichment.ts` (includes isDraftPhase, isAwaitingAction helpers)
  → Artifacts: [lesson-enrichment.ts](packages/shared-types/src/lesson-enrichment.ts)
- [X] T005 [P] Create enrichment content type interfaces in `packages/shared-types/src/enrichment-content.ts`
  → Artifacts: [enrichment-content.ts](packages/shared-types/src/enrichment-content.ts)
- [X] T006 [P] Create Type Registry for extensibility in `packages/shared-types/src/enrichment-type-registry.ts` (EnrichmentTypeDefinition, EnrichmentTypeRegistry class)
  → Note: Registry pattern deferred; extensibility achieved via Zod discriminated unions
- [X] T007 Update BullMQ job types with EnrichmentJobDataSchema in `packages/shared-types/src/bullmq-jobs.ts` (depends on T004 for EnrichmentType)
  → Artifacts: [bullmq-jobs.ts](packages/shared-types/src/bullmq-jobs.ts), [base-handler.ts](packages/course-gen-platform/src/orchestrator/handlers/base-handler.ts)
- [X] T008 Export new types from `packages/shared-types/src/index.ts`
  → Artifacts: [index.ts](packages/shared-types/src/index.ts)

---

## Phase 2: Foundational (Backend Pipeline)

**Purpose**: Core BullMQ infrastructure and tRPC router that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T009 Create Stage 7 config in `packages/course-gen-platform/src/stages/stage7-enrichments/config/index.ts`
  → Artifacts: [config/index.ts](packages/course-gen-platform/src/stages/stage7-enrichments/config/index.ts)
- [X] T010 Create Stage 7 job types in `packages/course-gen-platform/src/stages/stage7-enrichments/types/index.ts`
  → Artifacts: [types/index.ts](packages/course-gen-platform/src/stages/stage7-enrichments/types/index.ts)
- [X] T011 [P] Create database service in `packages/course-gen-platform/src/stages/stage7-enrichments/services/database-service.ts`
  → Artifacts: [database-service.ts](packages/course-gen-platform/src/stages/stage7-enrichments/services/database-service.ts)
- [X] T012 [P] Create storage service for asset upload + signed URLs in `packages/course-gen-platform/src/stages/stage7-enrichments/services/storage-service.ts`
  → Artifacts: [storage-service.ts](packages/course-gen-platform/src/stages/stage7-enrichments/services/storage-service.ts)
- [X] T013 Create retry strategy with model fallback in `packages/course-gen-platform/src/stages/stage7-enrichments/retry-strategy.ts`
  → Artifacts: [retry-strategy.ts](packages/course-gen-platform/src/stages/stage7-enrichments/retry-strategy.ts)
- [X] T014 Create enrichment router (type-to-handler dispatch, supports two-stage flow) in `packages/course-gen-platform/src/stages/stage7-enrichments/services/enrichment-router.ts`
  → Artifacts: [enrichment-router.ts](packages/course-gen-platform/src/stages/stage7-enrichments/services/enrichment-router.ts)
- [X] T015 Create job processor (main job handler with progress tracking, draft/final phases) in `packages/course-gen-platform/src/stages/stage7-enrichments/services/job-processor.ts`
  → Artifacts: [job-processor.ts](packages/course-gen-platform/src/stages/stage7-enrichments/services/job-processor.ts)
- [X] T016 Create Stage 7 worker factory in `packages/course-gen-platform/src/stages/stage7-enrichments/factory.ts`
  → Artifacts: [factory.ts](packages/course-gen-platform/src/stages/stage7-enrichments/factory.ts)
- [X] T017 Create QueueEvents for global monitoring in `packages/course-gen-platform/src/queues/enrichment-events.ts`
  → Artifacts: [enrichment-events.ts](packages/course-gen-platform/src/queues/enrichment-events.ts)
- [X] T018 Create tRPC enrichment schemas in `packages/course-gen-platform/src/server/routers/enrichment/schemas.ts`
  → Artifacts: [schemas.ts](packages/course-gen-platform/src/server/routers/enrichment/schemas.ts)
- [X] T019 [P] Create tRPC create procedure in `packages/course-gen-platform/src/server/routers/enrichment/procedures/create.ts`
  → Artifacts: [create.ts](packages/course-gen-platform/src/server/routers/enrichment/procedures/create.ts)
- [X] T020 [P] Create tRPC getByLesson procedure in `packages/course-gen-platform/src/server/routers/enrichment/procedures/get-by-lesson.ts`
  → Artifacts: [get-by-lesson.ts](packages/course-gen-platform/src/server/routers/enrichment/procedures/get-by-lesson.ts)
- [X] T021 [P] Create tRPC getSummaryByCourse procedure in `packages/course-gen-platform/src/server/routers/enrichment/procedures/get-summary.ts`
  → Artifacts: [get-summary.ts](packages/course-gen-platform/src/server/routers/enrichment/procedures/get-summary.ts)
- [X] T022 [P] Create tRPC regenerate procedure in `packages/course-gen-platform/src/server/routers/enrichment/procedures/regenerate.ts`
  → Artifacts: [regenerate.ts](packages/course-gen-platform/src/server/routers/enrichment/procedures/regenerate.ts)
- [X] T023 [P] Create tRPC delete procedure in `packages/course-gen-platform/src/server/routers/enrichment/procedures/delete.ts`
  → Artifacts: [delete.ts](packages/course-gen-platform/src/server/routers/enrichment/procedures/delete.ts)
- [X] T024 [P] Create tRPC reorder procedure in `packages/course-gen-platform/src/server/routers/enrichment/procedures/reorder.ts`
  → Artifacts: [reorder.ts](packages/course-gen-platform/src/server/routers/enrichment/procedures/reorder.ts)
- [X] T025 [P] Create tRPC cancel procedure in `packages/course-gen-platform/src/server/routers/enrichment/procedures/cancel.ts`
  → Artifacts: [cancel.ts](packages/course-gen-platform/src/server/routers/enrichment/procedures/cancel.ts)
- [X] T026 [P] Create tRPC getPlaybackUrl procedure in `packages/course-gen-platform/src/server/routers/enrichment/procedures/get-playback-url.ts`
  → Artifacts: [get-playback-url.ts](packages/course-gen-platform/src/server/routers/enrichment/procedures/get-playback-url.ts)
- [X] T027 [P] Create tRPC regenerateDraft procedure (two-stage) in `packages/course-gen-platform/src/server/routers/enrichment/procedures/regenerate-draft.ts`
  → Artifacts: [regenerate-draft.ts](packages/course-gen-platform/src/server/routers/enrichment/procedures/regenerate-draft.ts)
- [X] T028 [P] Create tRPC updateDraft procedure (two-stage) in `packages/course-gen-platform/src/server/routers/enrichment/procedures/update-draft.ts`
  → Artifacts: [update-draft.ts](packages/course-gen-platform/src/server/routers/enrichment/procedures/update-draft.ts)
- [X] T029 [P] Create tRPC approveDraft procedure (two-stage) in `packages/course-gen-platform/src/server/routers/enrichment/procedures/approve-draft.ts`
  → Artifacts: [approve-draft.ts](packages/course-gen-platform/src/server/routers/enrichment/procedures/approve-draft.ts)
- [X] T030 Create tRPC createBatch procedure in `packages/course-gen-platform/src/server/routers/enrichment/procedures/create-batch.ts`
  → Artifacts: [create-batch.ts](packages/course-gen-platform/src/server/routers/enrichment/procedures/create-batch.ts)
- [X] T031 Create enrichment router index in `packages/course-gen-platform/src/server/routers/enrichment/router.ts`
  → Artifacts: [router.ts](packages/course-gen-platform/src/server/routers/enrichment/router.ts), [index.ts](packages/course-gen-platform/src/server/routers/enrichment/index.ts), [helpers.ts](packages/course-gen-platform/src/server/routers/enrichment/helpers.ts)
- [X] T032 Register enrichment router in main app router `packages/course-gen-platform/src/server/app-router.ts`
  → Artifacts: [app-router.ts](packages/course-gen-platform/src/server/app-router.ts)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 7 - View Enrichment Status in Graph (Priority: P1)

**Goal**: Instructors see at a glance which lessons have enrichments and their current status in the course graph

**Independent Test**: Generate enrichments and observe status changes in the graph. Lesson shows icons indicating which enrichment types exist, animations for generating, warnings for failed.

**Why first**: This is the visual foundation - Asset Dock and status indicators must exist before other stories can show their results in the UI.

### Implementation for User Story 7

- [X] T033 [US7] Update LessonNodeData type to include enrichmentsSummary, hasEnrichmentErrors, enrichmentsGenerating in `packages/shared-types/src/generation-graph.ts`
  → Artifacts: [generation-graph.ts](packages/shared-types/src/generation-graph.ts)
- [X] T034 [US7] Create AssetDock component with semantic zoom logic (dot→count→icons) in `packages/web/components/generation-graph/nodes/AssetDock.tsx`
  → Artifacts: [AssetDock.tsx](packages/web/components/generation-graph/nodes/AssetDock.tsx)
- [X] T035 [US7] Update LessonNode to include AssetDock (height 50px→64px) in `packages/web/components/generation-graph/nodes/LessonNode.tsx`
  → Artifacts: [LessonNode.tsx](packages/web/components/generation-graph/nodes/LessonNode.tsx)
- [X] T036 [US7] Create enrichment status badge component in `packages/web/components/generation-graph/panels/stage7/EnrichmentStatusBadge.tsx`
  → Artifacts: [EnrichmentStatusBadge.tsx](packages/web/components/generation-graph/panels/stage7/EnrichmentStatusBadge.tsx)
- [X] T037 [US7] Create enrichment type icons map in `packages/web/lib/generation-graph/enrichment-config.ts`
  → Artifacts: [enrichment-config.ts](packages/web/lib/generation-graph/enrichment-config.ts), [translations.ts](packages/web/lib/generation-graph/translations.ts)
- [X] T038 [US7] Create useEnrichmentData hook (Supabase query + realtime subscription) in `packages/web/components/generation-graph/hooks/useEnrichmentData.ts`
  → Artifacts: [useEnrichmentData.ts](packages/web/components/generation-graph/hooks/useEnrichmentData.ts)
- [X] T039 [US7] Update ELK layout config for 64px node height in layout hooks
  → Artifacts: [useGraphLayout.ts](packages/web/components/generation-graph/hooks/useGraphLayout.ts), [graph-builders.ts](packages/web/components/generation-graph/hooks/use-graph-data/utils/graph-builders.ts)
- [X] T040 [P] [US7] Create enrichment translations in `packages/web/messages/ru/enrichments.json`
  → Artifacts: [enrichments.json](packages/web/messages/ru/enrichments.json)
- [X] T041 [P] [US7] Create enrichment translations in `packages/web/messages/en/enrichments.json`
  → Artifacts: [enrichments.json](packages/web/messages/en/enrichments.json)

**Checkpoint**: Asset Dock visible on lesson nodes with status indicators

---

## Phase 4: User Story 1 - Add Video to Lesson (Priority: P1)

**Goal**: Course creators enhance lessons with AI-generated video presentations

**Independent Test**: Add a video enrichment to a single lesson, verify the video script is generated and displayed in the inspector panel.

**Flow**: Two-stage (draft script → user review → final video generation)

### Implementation for User Story 1

- [X] T042 [US1] Create video prompt template in `packages/course-gen-platform/src/stages/stage7-enrichments/prompts/video-prompt.ts`
  → Artifacts: [video-prompt.ts](packages/course-gen-platform/src/stages/stage7-enrichments/prompts/video-prompt.ts)
- [ ] T043 [US1] Create video handler (two-stage: generateDraft → generateFinal) in `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/video-handler.ts`
- [ ] T044 [US1] Create VideoPreview component in `packages/web/components/generation-graph/panels/stage7/previews/VideoPreview.tsx`
- [ ] T045 [US1] Create VideoDraftEditor component for script review/edit in `packages/web/components/generation-graph/panels/stage7/editors/VideoDraftEditor.tsx`

**Checkpoint**: Video enrichments can be added, draft reviewed/edited, and preview shows script content

---

## Phase 5: User Story 2 - Add Quiz to Lesson (Priority: P1)

**Goal**: Instructors add comprehension quizzes to lessons so students can verify understanding

**Independent Test**: Add a quiz to a lesson, verify questions are generated based on lesson content, preview shows questions/answers/explanations.

**Flow**: Single-stage (direct generation)

### Implementation for User Story 2

- [ ] T046 [US2] Create quiz prompt template with Bloom's taxonomy in `packages/course-gen-platform/src/stages/stage7-enrichments/prompts/quiz-prompt.ts`
- [ ] T047 [US2] Create quiz handler (full implementation) in `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/quiz-handler.ts`
- [ ] T048 [US2] Create QuizPreview component in `packages/web/components/generation-graph/panels/stage7/previews/QuizPreview.tsx`

**Checkpoint**: Quiz enrichments can be added with generated questions, preview is fully functional

---

## Phase 6: User Story 3 - Add Audio Narration (Priority: P2)

**Goal**: Instructors provide audio versions of lessons for accessibility and mobile learning

**Independent Test**: Generate audio for a lesson, verify audio plays back in the preview.

**Flow**: Single-stage (direct TTS generation)

### Implementation for User Story 3

- [ ] T049 [US3] Create audio prompt template (TTS optimization) in `packages/course-gen-platform/src/stages/stage7-enrichments/prompts/audio-prompt.ts`
- [ ] T050 [US3] Create audio handler (OpenAI TTS integration) in `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/audio-handler.ts`
- [ ] T051 [US3] Create AudioPreview component (HTML5 audio player) in `packages/web/components/generation-graph/panels/stage7/previews/AudioPreview.tsx`

**Checkpoint**: Audio enrichments can be added and played back in preview

---

## Phase 7: User Story 4 - Add Presentation Slides (Priority: P2)

**Goal**: Instructors generate slide presentations from lesson content for webinars or study materials

**Independent Test**: Generate a presentation for a lesson, view the slides in carousel preview.

**Flow**: Two-stage (draft slide structure → user review → final HTML render)

### Implementation for User Story 4

- [ ] T052 [US4] Create presentation prompt template (6x6 rule) in `packages/course-gen-platform/src/stages/stage7-enrichments/prompts/presentation-prompt.ts`
- [ ] T053 [US4] Create presentation handler (two-stage: generateDraft → generateFinal) in `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/presentation-handler.ts`
- [ ] T054 [US4] Create PresentationPreview component (slide carousel) in `packages/web/components/generation-graph/panels/stage7/previews/PresentationPreview.tsx`
- [ ] T055 [US4] Create PresentationDraftEditor component for slide structure review in `packages/web/components/generation-graph/panels/stage7/editors/PresentationDraftEditor.tsx`

**Checkpoint**: Presentation enrichments can be added, draft reviewed, and slides viewed in carousel

---

## Phase 8: User Story 5 - Manage Multiple Enrichments (Priority: P2)

**Goal**: Instructors view, reorder, and manage all enrichments attached to a lesson in one place

**Independent Test**: Add multiple enrichments to a lesson, reorder them, delete one, verify changes persist.

**Architecture**: Implements **Contextual Deep-Link Pattern** with Inspector Panel as Stack Navigator (ROOT → CREATE → DETAIL views)

### Implementation for User Story 5

#### Zustand Store & Hooks
- [ ] T056 [US5] Create enrichment inspector Zustand store in `packages/web/components/generation-graph/stores/enrichment-inspector-store.ts` (InspectorView type, openRoot/openCreate/openDetail/goBack actions)
- [ ] T057 [US5] Create useEnrichmentSelection hook (count-based routing logic) in `packages/web/components/generation-graph/hooks/useEnrichmentSelection.ts`
- [ ] T058 [US5] Create useGenerationStatus hook (optimistic handoff behavior) in `packages/web/components/generation-graph/hooks/useGenerationStatus.ts`
- [ ] T059 [US5] Create useDraftReview hook (two-stage flow: edit/approve draft) in `packages/web/components/generation-graph/hooks/useDraftReview.ts`

#### Inspector Panel Views (Stack Navigator)
- [ ] T060 [US5] Create EnrichmentInspectorPanel (view router) in `packages/web/components/generation-graph/panels/stage7/EnrichmentInspectorPanel.tsx`
- [ ] T061 [US5] Create RootView (list + fallback add button) in `packages/web/components/generation-graph/panels/stage7/views/RootView.tsx`
- [ ] T062 [US5] Create CreateView (configuration form router) in `packages/web/components/generation-graph/panels/stage7/views/CreateView.tsx`
- [ ] T063 [US5] Create DetailView (preview/edit with progress mode, supports two-stage) in `packages/web/components/generation-graph/panels/stage7/views/DetailView.tsx`
- [ ] T064 [US5] Create EmptyStateCards (discovery cards for first enrichment) in `packages/web/components/generation-graph/panels/stage7/views/EmptyStateCards.tsx`

#### Inspector Components
- [ ] T065 [US5] Create EnrichmentList (sortable with @dnd-kit) in `packages/web/components/generation-graph/panels/stage7/components/EnrichmentList.tsx`
- [ ] T066 [US5] Create EnrichmentListItem (click → DETAIL view) in `packages/web/components/generation-graph/panels/stage7/components/EnrichmentListItem.tsx`
- [ ] T067 [US5] Create EnrichmentAddPopover (fallback add, popover/bottom sheet) in `packages/web/components/generation-graph/panels/stage7/components/EnrichmentAddPopover.tsx`
- [ ] T068 [US5] Create GenerationProgress (terminal-style progress display) in `packages/web/components/generation-graph/panels/stage7/components/GenerationProgress.tsx`
- [ ] T069 [US5] Create DiscardChangesDialog (dirty form state confirm) in `packages/web/components/generation-graph/panels/stage7/components/DiscardChangesDialog.tsx`
- [ ] T070 [US5] Create DraftReviewActions (Approve/Regenerate/Edit buttons) in `packages/web/components/generation-graph/panels/stage7/components/DraftReviewActions.tsx`

#### Configuration Forms (Smart Defaults)
- [ ] T071 [P] [US5] Create QuizCreateForm in `packages/web/components/generation-graph/panels/stage7/forms/QuizCreateForm.tsx`
- [ ] T072 [P] [US5] Create AudioCreateForm in `packages/web/components/generation-graph/panels/stage7/forms/AudioCreateForm.tsx`
- [ ] T073 [P] [US5] Create VideoCreateForm in `packages/web/components/generation-graph/panels/stage7/forms/VideoCreateForm.tsx`
- [ ] T074 [P] [US5] Create PresentationCreateForm in `packages/web/components/generation-graph/panels/stage7/forms/PresentationCreateForm.tsx`

#### Deep-Link Integration
- [ ] T075 [US5] Create EnrichmentNodeToolbar (deep-link triggers) in `packages/web/components/generation-graph/components/EnrichmentNodeToolbar.tsx`
- [ ] T076 [US5] Update AssetDock click handler with count-based routing in `packages/web/components/generation-graph/nodes/AssetDock.tsx`
- [ ] T077 [US5] Integrate inspector panel with node selection in graph view (node body → ROOT, toolbar → CREATE)

**Checkpoint**: Full inspector panel functional with Stack Navigator pattern, list management, reordering, two-stage draft review, and deep-link triggers

---

## Phase 9: User Story 6 - Batch Generate Enrichments (Priority: P3)

**Goal**: Instructors generate the same enrichment type for multiple lessons at once

**Independent Test**: Select ModuleGroup, generate audio for all lessons, verify all affected lessons show progress indicators.

**Architecture**: Batch operations via **Module Inspector** (separate from Lesson Inspector)

### Implementation for User Story 6

- [ ] T078 [US6] Create ModuleInspectorPanel with batch enrichments section in `packages/web/components/generation-graph/panels/module/ModuleInspectorPanel.tsx`
- [ ] T079 [US6] Create BatchEnrichmentButtons component in `packages/web/components/generation-graph/panels/module/BatchEnrichmentButtons.tsx`
- [ ] T080 [US6] Create BatchConfirmDialog (cost preview) in `packages/web/components/generation-graph/panels/module/BatchConfirmDialog.tsx`
- [ ] T081 [US6] Add batch generation status tracking in useEnrichmentData hook
- [ ] T082 [US6] Update ModuleGroup selection to open Module Inspector (not Lesson Inspector)

**Checkpoint**: Batch generation works via Module Inspector with cost preview and individual progress tracking

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T083 [P] Add i18n for backend Stage 7 messages in `packages/course-gen-platform/src/shared/i18n/messages.ts`
- [ ] T084 [P] Create enrichment theme tokens (light/dark) in `packages/web/components/generation-graph/styles/enrichment-tokens.ts`
- [ ] T085 [P] Create document handler placeholder in `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/document-handler.ts`
- [ ] T086 [P] Register all enrichment types in Type Registry in `packages/web/lib/enrichments/type-registrations.ts`
- [ ] T087 Implement mobile adaptation (inspector as bottom sheet) in EnrichmentInspectorPanel
- [ ] T088 Add accessibility: ARIA labels (ariaLabelConfig), keyboard navigation (nodesFocusable), focus trap, aria-live in inspector
- [ ] T089 Implement optimistic UI updates for create/delete mutations with rollback on error
- [ ] T090 Add Document enrichment type as disabled with "Coming Soon" tooltip in EnrichmentAddPopover and NodeToolbar
- [ ] T091 Implement error grouping in Asset Dock (single indicator for multiple failures)
- [ ] T092 Run quickstart.md validation and verify all flows work end-to-end
- [ ] T093 Test edge cases: short content warning, navigation during generation, multiple same-type enrichments, batch partial failures, delete lesson with in-progress enrichments
- [ ] T094 Performance validation: verify graph with 50+ lessons and enrichments renders at 60fps (pan/zoom), ELK layout stability
- [ ] T095 Implement content-change detection: show "stale" indicator on enrichments when lesson content updated after generation (FR-016)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 7 (Phase 3)**: Must complete first - provides Asset Dock visual foundation
- **User Stories 1,2 (Phase 4,5)**: Can run in parallel after Phase 3
- **User Stories 3,4,5 (Phase 6,7,8)**: Can run in parallel after Phase 3
- **User Story 6 (Phase 9)**: Depends on Phase 8 (needs inspector panel)
- **Polish (Phase 10)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 7 (View Status)**: Foundation for all other stories - provides UI framework
- **User Story 1 (Video)**: Independent after US7, needs video handler + preview
- **User Story 2 (Quiz)**: Independent after US7, needs quiz handler + preview
- **User Story 3 (Audio)**: Independent after US7, needs audio handler + preview
- **User Story 4 (Presentation)**: Independent after US7, needs presentation handler + preview
- **User Story 5 (Manage)**: Independent after US7, needs inspector panel components
- **User Story 6 (Batch)**: Depends on US5 (uses inspector for batch progress)

### Within Each User Story

- Backend handler/prompt before frontend preview
- Types before implementation
- Core implementation before integration

### Parallel Opportunities

```bash
# Phase 1: Types creation in parallel
Task: T004 [P] enrichment Zod schemas
Task: T005 [P] enrichment content types

# Phase 2: Services and tRPC procedures in parallel
Task: T010 [P] database service
Task: T011 [P] storage service

Task: T018 [P] create procedure
Task: T019 [P] getByLesson procedure
Task: T020 [P] getSummaryByCourse procedure
Task: T021 [P] regenerate procedure
Task: T022 [P] delete procedure
Task: T023 [P] reorder procedure
Task: T024 [P] cancel procedure
Task: T025 [P] getPlaybackUrl procedure

# Phase 3: Translations in parallel
Task: T036 [P] ru translations
Task: T037 [P] en translations

# User Stories 1,2 can run in parallel after Phase 3
# User Stories 3,4,5 can run in parallel after Phase 3

# Phase 10: Polish tasks in parallel
Task: T060 [P] backend i18n
Task: T061 [P] theme tokens
Task: T062 [P] document handler placeholder
```

---

## Implementation Strategy

### MVP First (User Stories 7 + 2: View Status + Quiz)

1. Complete Phase 1: Setup (database + types)
2. Complete Phase 2: Foundational (BullMQ + tRPC)
3. Complete Phase 3: User Story 7 (Asset Dock + status indicators)
4. Complete Phase 5: User Story 2 (Quiz - simplest full implementation)
5. **STOP and VALIDATE**: Test quiz generation and status display independently
6. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational + US7 → Visual foundation ready
2. Add US2 (Quiz) → Test independently → Deploy (MVP!)
3. Add US1 (Video stub) → Test independently → Deploy
4. Add US5 (Manage) → Test independently → Deploy
5. Add US3 (Audio) + US4 (Presentation) → Test independently → Deploy
6. Add US6 (Batch) → Test independently → Deploy

---

## Summary

| Phase | Tasks | Count | Parallel |
|-------|-------|-------|----------|
| Setup | T001-T008 | 8 | T004-T006 |
| Foundational | T009-T032 | 24 | T011-T012, T019-T029 |
| US7 View Status | T033-T041 | 9 | T040, T041 |
| US1 Video | T042-T045 | 4 | - |
| US2 Quiz | T046-T048 | 3 | - |
| US3 Audio | T049-T051 | 3 | - |
| US4 Presentation | T052-T055 | 4 | - |
| US5 Manage (Inspector) | T056-T077 | 22 | T071-T074 |
| US6 Batch | T078-T082 | 5 | - |
| Polish | T083-T095 | 13 | T083-T086 |

**Total Tasks**: 95
**MVP Tasks** (US7 + US2): T001-T032, T033-T041, T046-T048 = 49 tasks
**Full Inspector MVP** (US7 + US2 + US5): + T056-T077 = 71 tasks
**Suggested MVP**: Complete through Phase 5 (Quiz) for first functional demo, then add Phase 8 (Inspector) for full UX

**New in this version**:
- Type Registry pattern (T006, T086)
- Two-stage flow support (T027-T029, T059, T070)
- Draft editors for Video/Presentation (T045, T055)

## ТЗ Coverage Checklist

| ТЗ Section | Status | Tasks |
|------------|--------|-------|
| 3.1 Database Schema | ✅ | T001 (enums with two-stage statuses, table, indexes, RLS, triggers) |
| 3.2 Content JSONB | ✅ | T005 |
| 3.3 TypeScript Types | ✅ | T004, T007, T008 |
| 3.4 React Flow State | ✅ | T033 |
| 3.5 Inspector State (Zustand) | ✅ | T056 (enrichment-inspector-store.ts) |
| 3.6 Two-Stage Generation Flow | ✅ | T014-T015, T027-T029, T043, T053, T059, T070 |
| 3.7 Type Registry Pattern | ✅ | T006, T086 |
| 4.1 Contextual Deep-Link Pattern | ✅ | T056, T075 (store + NodeToolbar deep-links) |
| 4.2-4.3 LessonNode + Asset Dock | ✅ | T034, T035, T076 (Asset Dock with count-based routing) |
| 4.4 NodeToolbar | ✅ | T075 (EnrichmentNodeToolbar) |
| 4.5 Inspector Panel Views | ✅ | T060-T064 (ROOT, CREATE, DETAIL, EmptyStateCards) |
| 4.6 Post-Generation Flow | ✅ | T058, T068 (useGenerationStatus, GenerationProgress) |
| 4.7 Count-Based Routing | ✅ | T057, T076 (useEnrichmentSelection, AssetDock) |
| 4.8 Empty State Cards | ✅ | T064 (EmptyStateCards) |
| 4.9 Safe Harbor Navigation | ✅ | T056, T069 (goBack action, DiscardChangesDialog) |
| 4.10 Batch Operations | ✅ | T078-T082 (Module Inspector) |
| 5.1-5.3 Pipeline | ✅ | T009-T016 |
| 5.4 QueueEvents | ✅ | T017 |
| 5.5 Progress Tracking | ✅ | T015, T068 (job-processor, GenerationProgress) |
| 5.6 Retry Strategy | ✅ | T013 |
| 6.1-6.4 Agent Prompts | ✅ | T042, T046, T049, T052 |
| 6.5 Adding New Type | ✅ | T085 (document-handler placeholder), T006 (Type Registry) |
| 7.1 tRPC Router | ✅ | T018-T032 (includes two-stage: regenerateDraft, updateDraft, approveDraft) |
| 7.2 Supabase Realtime | ✅ | T038 |
| 7.3 React Flow Integration | ✅ | T038 |
| 7.4 Selection Sync | ✅ | T057 (useEnrichmentSelection) |
| 8.1-8.4 Accessibility | ✅ | T088 |
| 9.1 Optimistic UI | ✅ | T089 |
| 9.2-9.3 Error Display | ✅ | T036, T091 |
| 9.4 Progress Display | ✅ | T058, T068 |
| Create Forms (Smart Defaults) | ✅ | T071-T074 |
| Fallback Add Button | ✅ | T067 (EnrichmentAddPopover) |
| Draft Editors (Two-Stage) | ✅ | T045, T055, T070 |
| 10.1-10.4 Storage | ✅ | T002, T012, T026 |
| 11.1-11.2 i18n | ✅ | T040, T041, T083 |
| 12.1-12.3 Theme Support | ✅ | T084 |
| 14 Acceptance Criteria | ✅ | T092 (validation) |
| Edge Cases (spec.md:144-148) | ✅ | T093 |
| Performance SC-006 | ✅ | T094 |
| Content-change detection FR-016 | ✅ | T095 |
