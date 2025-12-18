# Tasks: Generation Progress Page Redesign

**Branch**: `012-celestial-redesign` | **Status**: Completed
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Phase 1: Setup
*Goal: Initialize project structure and shared utilities.*

- [x] T001 Create directory structure for celestial components in `packages/web/components/generation-celestial/`
- [x] T002 Implement `SpaceBackground.tsx` with dark gradient theme in `packages/web/components/generation-celestial/SpaceBackground.tsx`
- [x] T003 Implement `utils.ts` with `getStageFromStatus` and `buildStagesFromStatus` logic and types in `packages/web/components/generation-celestial/utils.ts`
- [x] T004 Create barrel file `packages/web/components/generation-celestial/index.ts` exporting created components

## Phase 2: Foundational Components
*Goal: Build the core visual elements of the celestial timeline.*
*Prerequisites: Phase 1*

- [x] T005 [P] Implement `TrajectoryLine.tsx` with animated SVG dashed line in `packages/web/components/generation-celestial/TrajectoryLine.tsx`
- [x] T006 [P] Implement `PlanetNode.tsx` handling all 5 states (pending, active, completed, error, awaiting) with Lucide icons in `packages/web/components/generation-celestial/PlanetNode.tsx`
- [x] T007 Implement `CelestialJourney.tsx` layout container combining Planets and Trajectory in `packages/web/components/generation-celestial/CelestialJourney.tsx`

## Phase 3: User Story 1 - Visualize Progress
*Goal: Replace the old progress bar with the Celestial Journey visualization.*
*Priority: P1*

- [x] T008 [US1] [P] Implement `CelestialHeader.tsx` with rocket icon and overall progress in `packages/web/components/generation-celestial/CelestialHeader.tsx`
- [x] T009 [US1] [P] Implement `PhaseProgress.tsx` for showing granular progress within an active stage in `packages/web/components/generation-celestial/PhaseProgress.tsx`
- [x] T010 [US1] Implement `ActiveStageCard.tsx` displaying metrics (cost, tokens) and phase details in `packages/web/components/generation-celestial/ActiveStageCard.tsx`
- [x] T011 [US1] Integrate `CelestialHeader` into `GenerationProgressContainerEnhanced.tsx` (replacing `ProgressHeader`) in `packages/web/app/courses/generating/[slug]/GenerationProgressContainerEnhanced.tsx`
- [x] T012 [US1] Integrate `CelestialJourney` into `GenerationProgressContainerEnhanced.tsx` (replacing `TabsContainer`) in `packages/web/app/courses/generating/[slug]/GenerationProgressContainerEnhanced.tsx`
- [x] T013 [US1] Restyle `StatsGrid.tsx` to match celestial theme (transparent backgrounds, updated typography) and integrate into the layout in `packages/web/components/generation/StatsGrid.tsx`
- [x] T014 [US1] Update `ProgressSkeleton.tsx` to match the new celestial layout in `packages/web/app/courses/generating/[slug]/ProgressSkeleton.tsx`

## Phase 4: User Story 2 - Stage Approval Flow
*Goal: Enable users to review and approve stages via Mission Control.*
*Priority: P1*

- [x] T015 [US2] Implement `MissionControlBanner.tsx` with "Approve" and "Cancel" actions in `packages/web/components/generation-celestial/MissionControlBanner.tsx`
- [x] T016 [US2] Integrate `MissionControlBanner` into `GenerationProgressContainerEnhanced.tsx` handling `approveStage` and `cancelGeneration` server actions in `packages/web/app/courses/generating/[slug]/GenerationProgressContainerEnhanced.tsx`

## Phase 5: User Story 3 - Detailed Stage Inspection
*Goal: Allow deep dive into stage results.*
*Priority: P2*

- [x] T017 [US3] Implement `StageResultsDrawer.tsx` wrapping existing `StageResultsPreview` logic and integrating `ActivityLog.tsx` (moved from main view) in `packages/web/components/generation-celestial/StageResultsDrawer.tsx`
- [x] T018 [US3] Connect `StageResultsDrawer` to `CelestialJourney` (click handler) and `MissionControlBanner` (View Results button) in `packages/web/app/courses/generating/[slug]/GenerationProgressContainerEnhanced.tsx`

## Phase 6: User Story 4 - Real-time Updates & Polish
*Goal: Ensure real-time data consistency and refine UI experience.*
*Priority: P2*

- [x] T019 [US4] Write unit tests for `utils.ts` to verify status mapping scenarios in `packages/web/components/generation-celestial/utils.test.ts`
- [x] T020 [US4] Verify real-time trace updates in `ActiveStageCard` via `GenerationRealtimeProvider` context in `packages/web/components/generation-celestial/ActiveStageCard.tsx`
- [x] T021 Add Framer Motion entrance animations to `PlanetNode` in `packages/web/components/generation-celestial/PlanetNode.tsx`
- [x] T022 Add pulsing glow animation to active stage in `packages/web/components/generation-celestial/PlanetNode.tsx`
- [x] T023 [US4] Implement "Disconnected" state visual indicator in `CelestialHeader.tsx` in `packages/web/components/generation-celestial/CelestialHeader.tsx`
- [x] T024 [Polish] Verify ARIA labels and contrast ratios for accessibility compliance in all new components
- [x] T025 [Polish] Write component tests for `PlanetNode` state visualizations and `MissionControlBanner` actions in `packages/web/components/generation-celestial/components.test.tsx`
- [x] T026 [Polish] Verify mobile responsiveness for timeline and drawer in all new components

## Phase 7: Theme Support & Cleanup
*Goal: Ensure full light/dark theme support and remove deprecated code.*
*Priority: P2*

- [x] T027 [Theme] Define celestial CSS variables for both light and dark themes in `packages/web/app/globals.css`
- [x] T028 [Theme] Implement `SpaceBackground.tsx` with dual theme support (dark space / light ethereal gradient) in `packages/web/components/generation-celestial/SpaceBackground.tsx`
- [x] T029 [Theme] Verify all celestial components use semantic color tokens (`bg-card`, `text-foreground`) with `dark:` variants
- [x] T030 [A11y] Add `prefers-reduced-motion` support to all Framer Motion animations in celestial components
- [x] T031 [Admin] Style admin section (TraceViewer, GenerationTimeline) for celestial theme consistency in `packages/web/app/courses/generating/[slug]/GenerationProgressContainerEnhanced.tsx`
- [x] T032 [Cleanup] Remove deprecated components after successful integration: `ProgressHeader.tsx`, `TabsContainer.tsx`, `MainProgressCard.tsx`, `StepTimeline.tsx`
- [x] T033 [QA] Manual testing: verify all 8 generation states render correctly in both light and dark themes

## Phase 8: Final QA & Documentation
*Goal: Comprehensive testing and documentation update.*
*Priority: P3*

- [x] T034 [QA] Run full E2E test suite for generation progress page
- [x] T035 [Docs] Update component documentation with celestial theme usage examples
- [x] T036 [QA] Performance audit: ensure animations maintain 60fps on mobile devices

## Dependencies

1. **Setup** (T001-T004) -> **Foundation** (T005-T007)
2. **Foundation** -> **US1** (T008-T014)
3. **US1** -> **US2** (T015-T016)
4. **US1** -> **US3** (T017-T018)
5. **US1** -> **US4** (T019-T026)
6. **US1-US4** -> **Theme & Cleanup** (T027-T033)
7. **Theme & Cleanup** -> **Final QA** (T034-T036)

## Parallel Execution

- **Foundation**: `TrajectoryLine` (T005) and `PlanetNode` (T006) can be built in parallel.
- **US1**: `CelestialHeader` (T008) and `PhaseProgress` (T009) are independent.
- **US3** and **US4** can be executed in parallel after US1 is stable.
- **Theme Support**: T027 (CSS vars) should be done first; T028-T029 can run in parallel after.
- **Final QA**: T034, T035, T036 are independent and can run in parallel.

## Implementation Strategy

1. **Scaffold**: Set up the directory and basic background.
2. **Core UI**: Build the static version of the "Celestial Journey" (Planets + Line).
3. **Integration**: Swap out the old UI in the main container incrementally (Header first, then Journey) to maintain stability.
4. **Interactivity**: Add the Approval Banner and Results Drawer.
5. **Polish**: Add animations, accessibility checks, tests, and refine responsive behavior.
6. **Theme Support**: Define celestial CSS variables, verify dual-theme rendering for all components.
7. **Cleanup**: Remove deprecated components only after full integration and testing.
8. **Final QA**: E2E tests, performance audit, documentation update.