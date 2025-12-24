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

- [ ] T001 Create database migration for Stage 7 enrichments in `packages/course-gen-platform/supabase/migrations/20251224_stage7_enrichments.sql` (includes enums, table, indexes, RLS, triggers, REPLICA IDENTITY FULL)
- [ ] T002 Create Supabase Storage bucket `course-enrichments` with RLS policies via Supabase Dashboard or migration
- [ ] T003 Regenerate Supabase TypeScript types via MCP and update `packages/shared-types/src/database.types.ts`
- [ ] T004 [P] Create enrichment Zod schemas in `packages/shared-types/src/lesson-enrichment.ts`
- [ ] T005 [P] Create enrichment content type interfaces in `packages/shared-types/src/enrichment-content.ts`
- [ ] T006 Update BullMQ job types with EnrichmentJobDataSchema in `packages/shared-types/src/bullmq-jobs.ts`
- [ ] T007 Export new types from `packages/shared-types/src/index.ts`

---

## Phase 2: Foundational (Backend Pipeline)

**Purpose**: Core BullMQ infrastructure and tRPC router that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [ ] T008 Create Stage 7 config in `packages/course-gen-platform/src/stages/stage7-enrichments/config/index.ts`
- [ ] T009 Create Stage 7 job types in `packages/course-gen-platform/src/stages/stage7-enrichments/types/index.ts`
- [ ] T010 [P] Create database service in `packages/course-gen-platform/src/stages/stage7-enrichments/services/database-service.ts`
- [ ] T011 [P] Create storage service for asset upload + signed URLs in `packages/course-gen-platform/src/stages/stage7-enrichments/services/storage-service.ts`
- [ ] T012 Create retry strategy with model fallback in `packages/course-gen-platform/src/stages/stage7-enrichments/retry-strategy.ts`
- [ ] T013 Create enrichment router (type-to-handler dispatch) in `packages/course-gen-platform/src/stages/stage7-enrichments/services/enrichment-router.ts`
- [ ] T014 Create job processor (main job handler with progress tracking) in `packages/course-gen-platform/src/stages/stage7-enrichments/services/job-processor.ts`
- [ ] T015 Create Stage 7 worker factory in `packages/course-gen-platform/src/stages/stage7-enrichments/factory.ts`
- [ ] T016 Create QueueEvents for global monitoring in `packages/course-gen-platform/src/queues/enrichment-events.ts`
- [ ] T017 Create tRPC enrichment schemas in `packages/course-gen-platform/src/server/routers/enrichment/schemas.ts`
- [ ] T018 [P] Create tRPC create procedure in `packages/course-gen-platform/src/server/routers/enrichment/procedures/create.ts`
- [ ] T019 [P] Create tRPC getByLesson procedure in `packages/course-gen-platform/src/server/routers/enrichment/procedures/get-by-lesson.ts`
- [ ] T020 [P] Create tRPC getSummaryByCourse procedure in `packages/course-gen-platform/src/server/routers/enrichment/procedures/get-summary.ts`
- [ ] T021 [P] Create tRPC regenerate procedure in `packages/course-gen-platform/src/server/routers/enrichment/procedures/regenerate.ts`
- [ ] T022 [P] Create tRPC delete procedure in `packages/course-gen-platform/src/server/routers/enrichment/procedures/delete.ts`
- [ ] T023 [P] Create tRPC reorder procedure in `packages/course-gen-platform/src/server/routers/enrichment/procedures/reorder.ts`
- [ ] T024 [P] Create tRPC cancel procedure in `packages/course-gen-platform/src/server/routers/enrichment/procedures/cancel.ts`
- [ ] T025 [P] Create tRPC getPlaybackUrl procedure in `packages/course-gen-platform/src/server/routers/enrichment/procedures/get-playback-url.ts`
- [ ] T026 Create tRPC createBatch procedure in `packages/course-gen-platform/src/server/routers/enrichment/procedures/create-batch.ts`
- [ ] T027 Create enrichment router index in `packages/course-gen-platform/src/server/routers/enrichment/router.ts`
- [ ] T028 Register enrichment router in main app router `packages/course-gen-platform/src/server/routers/index.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 7 - View Enrichment Status in Graph (Priority: P1)

**Goal**: Instructors see at a glance which lessons have enrichments and their current status in the course graph

**Independent Test**: Generate enrichments and observe status changes in the graph. Lesson shows icons indicating which enrichment types exist, animations for generating, warnings for failed.

**Why first**: This is the visual foundation - Asset Dock and status indicators must exist before other stories can show their results in the UI.

### Implementation for User Story 7

- [ ] T029 [US7] Update LessonNodeData type to include enrichmentsSummary, hasEnrichmentErrors, enrichmentsGenerating in `packages/web/components/generation-graph/types.ts`
- [ ] T030 [US7] Create AssetDock component with semantic zoom logic (dot→count→icons) in `packages/web/components/generation-graph/nodes/AssetDock.tsx`
- [ ] T031 [US7] Update LessonNode to include AssetDock (height 50px→64px) in `packages/web/components/generation-graph/nodes/LessonNode.tsx`
- [ ] T032 [US7] Create enrichment status badge component in `packages/web/components/generation-graph/panels/stage7/EnrichmentStatusBadge.tsx`
- [ ] T033 [US7] Create enrichment type icons map in `packages/web/lib/generation-graph/translations.ts`
- [ ] T034 [US7] Create useEnrichmentData hook (tRPC + Supabase realtime subscription) in `packages/web/components/generation-graph/hooks/useEnrichmentData.ts`
- [ ] T035 [US7] Update ELK layout config for 64px node height in `packages/web/lib/generation-graph/constants.ts`
- [ ] T036 [P] [US7] Create enrichment translations in `packages/web/messages/ru/enrichments.json`
- [ ] T037 [P] [US7] Create enrichment translations in `packages/web/messages/en/enrichments.json`

**Checkpoint**: Asset Dock visible on lesson nodes with status indicators

---

## Phase 4: User Story 1 - Add Video to Lesson (Priority: P1)

**Goal**: Course creators enhance lessons with AI-generated video presentations

**Independent Test**: Add a video enrichment to a single lesson, verify the video script is generated and displayed in the inspector panel.

### Implementation for User Story 1

- [ ] T038 [US1] Create video prompt template in `packages/course-gen-platform/src/stages/stage7-enrichments/prompts/video-prompt.ts`
- [ ] T039 [US1] Create video handler (stub returning script) in `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/video-handler.ts`
- [ ] T040 [US1] Create VideoPreview component in `packages/web/components/generation-graph/panels/stage7/previews/VideoPreview.tsx`

**Checkpoint**: Video enrichments can be added and preview shows script content

---

## Phase 5: User Story 2 - Add Quiz to Lesson (Priority: P1)

**Goal**: Instructors add comprehension quizzes to lessons so students can verify understanding

**Independent Test**: Add a quiz to a lesson, verify questions are generated based on lesson content, preview shows questions/answers/explanations.

### Implementation for User Story 2

- [ ] T041 [US2] Create quiz prompt template with Bloom's taxonomy in `packages/course-gen-platform/src/stages/stage7-enrichments/prompts/quiz-prompt.ts`
- [ ] T042 [US2] Create quiz handler (full implementation) in `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/quiz-handler.ts`
- [ ] T043 [US2] Create QuizPreview component in `packages/web/components/generation-graph/panels/stage7/previews/QuizPreview.tsx`

**Checkpoint**: Quiz enrichments can be added with generated questions, preview is fully functional

---

## Phase 6: User Story 3 - Add Audio Narration (Priority: P2)

**Goal**: Instructors provide audio versions of lessons for accessibility and mobile learning

**Independent Test**: Generate audio for a lesson, verify audio plays back in the preview.

### Implementation for User Story 3

- [ ] T044 [US3] Create audio prompt template (TTS optimization) in `packages/course-gen-platform/src/stages/stage7-enrichments/prompts/audio-prompt.ts`
- [ ] T045 [US3] Create audio handler (OpenAI TTS integration) in `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/audio-handler.ts`
- [ ] T046 [US3] Create AudioPreview component (HTML5 audio player) in `packages/web/components/generation-graph/panels/stage7/previews/AudioPreview.tsx`

**Checkpoint**: Audio enrichments can be added and played back in preview

---

## Phase 7: User Story 4 - Add Presentation Slides (Priority: P2)

**Goal**: Instructors generate slide presentations from lesson content for webinars or study materials

**Independent Test**: Generate a presentation for a lesson, view the slides in carousel preview.

### Implementation for User Story 4

- [ ] T047 [US4] Create presentation prompt template (6x6 rule) in `packages/course-gen-platform/src/stages/stage7-enrichments/prompts/presentation-prompt.ts`
- [ ] T048 [US4] Create presentation handler in `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/presentation-handler.ts`
- [ ] T049 [US4] Create PresentationPreview component (slide carousel) in `packages/web/components/generation-graph/panels/stage7/previews/PresentationPreview.tsx`

**Checkpoint**: Presentation enrichments can be added and slides viewed in carousel

---

## Phase 8: User Story 5 - Manage Multiple Enrichments (Priority: P2)

**Goal**: Instructors view, reorder, and manage all enrichments attached to a lesson in one place

**Independent Test**: Add multiple enrichments to a lesson, reorder them, delete one, verify changes persist.

### Implementation for User Story 5

- [ ] T050 [US5] Create EnrichmentInspectorPanel in `packages/web/components/generation-graph/panels/stage7/EnrichmentInspectorPanel.tsx`
- [ ] T051 [US5] Create EnrichmentList (sortable with @dnd-kit) in `packages/web/components/generation-graph/panels/stage7/EnrichmentList.tsx`
- [ ] T052 [US5] Create EnrichmentListItem with progress display in `packages/web/components/generation-graph/panels/stage7/EnrichmentListItem.tsx`
- [ ] T053 [US5] Create EnrichmentAddMenu in `packages/web/components/generation-graph/panels/stage7/EnrichmentAddMenu.tsx`
- [ ] T054 [US5] Create useEnrichmentSelection hook (React Flow useOnSelectionChange) in `packages/web/components/generation-graph/hooks/useEnrichmentSelection.ts`
- [ ] T055 [US5] Create EnrichmentNodeToolbar (React Flow NodeToolbar) in `packages/web/components/generation-graph/components/EnrichmentNodeToolbar.tsx`
- [ ] T056 [US5] Integrate inspector panel with node selection in graph view

**Checkpoint**: Full inspector panel functional with list management and reordering

---

## Phase 9: User Story 6 - Batch Generate Enrichments (Priority: P3)

**Goal**: Instructors generate the same enrichment type for multiple lessons at once

**Independent Test**: Select multiple lessons, generate audio for all, verify all affected lessons show progress indicators.

### Implementation for User Story 6

- [ ] T057 [US6] Add batch selection UI to module context menu in `packages/web/components/generation-graph/components/ModuleContextMenu.tsx`
- [ ] T058 [US6] Create batch generation progress component in `packages/web/components/generation-graph/panels/stage7/BatchGenerationProgress.tsx`
- [ ] T059 [US6] Add batch generation status tracking in useEnrichmentData hook

**Checkpoint**: Batch generation works for multiple lessons with individual progress tracking

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T060 [P] Add i18n for backend Stage 7 messages in `packages/course-gen-platform/src/shared/i18n/messages.ts`
- [ ] T061 [P] Create enrichment theme tokens (light/dark) in `packages/web/components/generation-graph/styles/enrichment-tokens.ts`
- [ ] T062 [P] Create document handler placeholder in `packages/course-gen-platform/src/stages/stage7-enrichments/handlers/document-handler.ts`
- [ ] T063 Implement mobile adaptation (inspector as bottom sheet) in EnrichmentInspectorPanel
- [ ] T064 Add accessibility: ARIA labels (ariaLabelConfig), keyboard navigation (nodesFocusable), focus trap, aria-live in inspector
- [ ] T065 Implement optimistic UI updates for create/delete mutations with rollback on error
- [ ] T066 Add Document enrichment type as disabled with "Coming Soon" tooltip in EnrichmentAddMenu and NodeToolbar
- [ ] T067 Implement error grouping in Asset Dock (single indicator for multiple failures)
- [ ] T068 Run quickstart.md validation and verify all flows work end-to-end

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
| Setup | T001-T007 | 7 | T004, T005 |
| Foundational | T008-T028 | 21 | T010-T011, T018-T025 |
| US7 View Status | T029-T037 | 9 | T036, T037 |
| US1 Video | T038-T040 | 3 | - |
| US2 Quiz | T041-T043 | 3 | - |
| US3 Audio | T044-T046 | 3 | - |
| US4 Presentation | T047-T049 | 3 | - |
| US5 Manage | T050-T056 | 7 | - |
| US6 Batch | T057-T059 | 3 | - |
| Polish | T060-T068 | 9 | T060-T062 |

**Total Tasks**: 68
**MVP Tasks** (US7 + US2): T001-T028, T029-T037, T041-T043 = 43 tasks
**Suggested MVP**: Complete through Phase 5 (Quiz) for first functional demo

## ТЗ Coverage Checklist

| ТЗ Section | Status | Tasks |
|------------|--------|-------|
| 3.1 Database Schema | ✅ | T001 (enums, table, indexes, RLS, triggers, REPLICA IDENTITY) |
| 3.2 Content JSONB | ✅ | T005 |
| 3.3 TypeScript Types | ✅ | T004, T006, T007 |
| 3.4 React Flow State | ✅ | T029 |
| 4.1-4.5 Three-Layer UI | ✅ | T030 (Asset Dock), T055 (NodeToolbar), T050 (Inspector) |
| 4.6 Batch Operations | ✅ | T057-T059 |
| 5.1-5.3 Pipeline | ✅ | T008-T015 |
| 5.4 QueueEvents | ✅ | T016 |
| 5.5 Progress Tracking | ✅ | T014 (in job-processor) |
| 5.6 Retry Strategy | ✅ | T012 |
| 6.1-6.4 Agent Prompts | ✅ | T038, T041, T044, T047 |
| 6.5 Adding New Type | ✅ | T062 (document-handler placeholder) |
| 7.1 tRPC Router | ✅ | T017-T028 |
| 7.2 Supabase Realtime | ✅ | T034 |
| 7.3 React Flow Integration | ✅ | T034 |
| 7.4 Selection Sync | ✅ | T054 |
| 8.1-8.4 Accessibility | ✅ | T064 |
| 9.1 Optimistic UI | ✅ | T065 |
| 9.2-9.3 Error Display | ✅ | T032, T067 |
| 9.4 Progress Display | ✅ | T052 |
| 10.1-10.4 Storage | ✅ | T002, T011, T025 |
| 11.1-11.2 i18n | ✅ | T036, T037, T060 |
| 12.1-12.3 Theme Support | ✅ | T061 |
| 14 Acceptance Criteria | ✅ | T068 (validation) |
