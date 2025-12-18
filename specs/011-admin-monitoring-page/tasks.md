---
description: "Task list for Admin Monitoring Page"
---

# Tasks: Admin Monitoring Page

**Input**: Spec from `specs/011-admin-monitoring-page/spec.md`
**Prerequisites**: plan.md, spec.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel
- **[Story]**: US1=Core/Monitor, US2=TraceViewer, US3=ManualCtrl, US4=Refinement, US5=History

## Phase 1: Core Infrastructure (Backend)

- [x] T001 [US1] Create `generation_trace` table and `courses` column additions migration in `packages/course-gen-platform/supabase/migrations/`
  - Artifacts: `packages/course-gen-platform/supabase/migrations/20251125000000_admin_monitoring_tables.sql`
- [x] T002 [US1] Update database types in `packages/shared-types/src/database.types.ts` (run type gen)
  - Note: Manual casting used temporarily due to DB access limits.
  - Artifacts: `src/server/routers/admin.ts`, `src/shared/trace-logger.ts`
- [x] T003 [US1] Implement `logTrace` utility in `packages/course-gen-platform/src/shared/trace-logger.ts`
  - Artifacts: `packages/course-gen-platform/src/shared/trace-logger.ts`
- [x] T004 [US1] Add trace logging to Stage 2 (Document Processing) handler
  - Artifacts: `packages/course-gen-platform/src/stages/stage2-document-processing/orchestrator.ts`
- [x] T005 [US1] Add trace logging to Stage 3 (Summarization) handler
  - Artifacts: `packages/course-gen-platform/src/stages/stage3-summarization/orchestrator.ts`
- [x] T006 [US1] Add trace logging to Stage 4 (Analysis) handler
  - Artifacts: `packages/course-gen-platform/src/stages/stage4-analysis/orchestrator.ts`
- [x] T007 [US1] Add trace logging to Stage 5 (Structure Generation) handler
  - Artifacts: `packages/course-gen-platform/src/stages/stage5-generation/orchestrator.ts`
- [x] T008 [US1] Create `admin` tRPC router in `packages/course-gen-platform/src/server/routers/admin.ts`
  - Artifacts: `packages/course-gen-platform/src/server/routers/admin.ts`
- [x] T009 [US1] Implement `admin.getGenerationTrace` and `admin.getCourseGenerationDetails` endpoints
  - Artifacts: `packages/course-gen-platform/src/server/routers/admin.ts`

## Phase 2: Frontend Foundation & Dashboard

- [x] T010 [US1] Create admin layout and auth middleware in `packages/web/src/app/admin/layout.tsx`
- [x] T011 [US1] Create `useGenerationRealtime` hook in `packages/web/src/components/generation-monitoring/realtime-provider.tsx`
- [x] T012 [US1] Implement `GenerationTimeline` component in `packages/web/src/components/generation-monitoring/generation-timeline.tsx`
- [x] T013 [US1] Implement `GenerationOverviewPanel` component
- [x] T014 [US1] Assemble `AdminGenerationPage` in `packages/web/src/app/admin/generation/[courseId]/page.tsx`

## Phase 3: Trace Viewer

- [x] T015 [US2] Implement `TraceViewer` component with accordion in `packages/web/src/components/generation-monitoring/trace-viewer.tsx`
- [x] T016 [US2] Add syntax highlighting and copy functionality to trace steps
- [x] T017 [US2] Integrate `TraceViewer` into the dashboard page

## Phase 4: Manual Stage 6 Control

- [x] T018 [US3] Update Stage 5 handler to respect `pause_at_stage_5` flag
- [x] T019 [US3] Implement `admin.triggerStage6ForLesson` tRPC mutation
- [x] T020 [US3] Create `ManualStage6Panel` component in `packages/web/src/components/generation-monitoring/manual-stage6-panel.tsx`
- [x] T021 [US3] Implement lesson card list with status and generate actions
- [x] T022 [US3] Add logic for "Complete Course Generation" button (auto-finalize handling)

## Phase 5: User Refinement

- [x] T023 [US4] Add refinement columns to `lesson_contents` (migration)
- [x] T024 [US4] Implement `admin.regenerateLessonWithRefinement` tRPC mutation
- [x] T025 [US4] Create `RefinementModal` component in `packages/web/src/components/generation-monitoring/refinement-modal.tsx`
- [x] T026 [US4] Update Stage 6 orchestrator to handle refinement prompts

## Phase 6: Historical Browser

- [x] T027 [US5] Implement `admin.getGenerationHistory` tRPC query with pagination
- [x] T028 [US5] Create history table page at `packages/web/src/app/admin/generation/history/page.tsx`
- [x] T029 [US5] Add search and filter functionality to history page

## Phase 7: Polish & Verification

- [x] T030 [Polish] Add animations (Framer Motion) to timeline and status cards
  - Artifacts: [generation-timeline.tsx](../../packages/web/components/generation-monitoring/generation-timeline.tsx), [generation-overview-panel.tsx](../../packages/web/components/generation-monitoring/generation-overview-panel.tsx)
- [x] T031 [Polish] Ensure responsive design for mobile/tablet
  - Artifacts: [trace-viewer.tsx](../../packages/web/components/generation-monitoring/trace-viewer.tsx), [generation-overview-panel.tsx](../../packages/web/components/generation-monitoring/generation-overview-panel.tsx)
- [x] T032 [Test] Write integration tests for `admin` router
- [ ] T033 [Test] Verify full flow: Generate -> Trace -> Pause -> Manual Stage 6 -> Refine -> Finalize
