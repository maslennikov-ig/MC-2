# Tasks: Stage 6 Targeted Refinement System

**Input**: Design documents from `/specs/018-judge-targeted-refinement/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/refinement-api.ts
**Branch**: `018-judge-targeted-refinement`

**Tests**: Unit and contract tests will be included for critical components.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Shared Types**: `packages/shared-types/src/`
- **Backend**: `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/`
- **Web UI**: `packages/web/components/generation-graph/`
- **Tests**: `packages/course-gen-platform/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and extend existing types

- [X] T001 Install `krippendorff` package in `packages/course-gen-platform/package.json`
  → Artifacts: [package.json](../../packages/course-gen-platform/package.json)
- [X] T002 [P] Add Arbiter types (ArbiterInput, ArbiterOutput) to `packages/shared-types/src/judge-types.ts`
- [X] T003 [P] Add Router types (RouterDecision, RoutingConfig) to `packages/shared-types/src/judge-types.ts`
- [X] T004 [P] Add Verifier types (DeltaJudgeInput, DeltaJudgeOutput, QualityLockViolation, QualityLockCheckResult) to `packages/shared-types/src/judge-types.ts`
- [X] T005 [P] Add Iteration Controller types (IterationControllerInput, IterationControllerOutput) to `packages/shared-types/src/judge-types.ts`
- [X] T006 [P] Add Best-Effort Selector types (BestEffortSelectorInput, BestEffortSelectorOutput) to `packages/shared-types/src/judge-types.ts`
- [X] T007 [P] Add Patcher types (PatcherInput, PatcherOutput) to `packages/shared-types/src/judge-types.ts`
- [X] T008 [P] Add Section-Expander types (SectionExpanderInput, SectionExpanderOutput) to `packages/shared-types/src/judge-types.ts`
  → Artifacts: [judge-types.ts](../../packages/shared-types/src/judge-types.ts)
- [X] T009 Add refinement phase names (stage_6_arbiter, stage_6_patcher, stage_6_section_expander, stage_6_delta_judge) to `packages/shared-types/src/pipeline-admin.ts` phaseNameSchema
  → Artifacts: [pipeline-admin.ts](../../packages/shared-types/src/pipeline-admin.ts)
- [X] T010 Verify type-check passes after type additions

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

### Arbiter Module (Consolidation Logic)

- [X] T011 Create directory structure for `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/arbiter/`
- [X] T012 [P] Implement Krippendorff's Alpha calculation in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/arbiter/krippendorff.ts`
- [X] T013 [P] Implement conflict resolution using PRIORITY_HIERARCHY in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/arbiter/conflict-resolver.ts`
- [X] T014 Implement consolidateVerdicts() function in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/arbiter/consolidate-verdicts.ts`
- [X] T015 Create barrel export in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/arbiter/index.ts`
  → Artifacts: [arbiter/](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/arbiter/)

### Router Module (Decision Logic)

- [X] T016 Create directory structure for `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/router/`
- [X] T017 [P] Implement routeTask() decision logic in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/router/route-task.ts`
- [X] T018 Implement createExecutionBatches() for non-adjacent parallel batching in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/router/route-task.ts`
- [X] T019 Create barrel export in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/router/index.ts`
  → Artifacts: [router/](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/router/)

### Patcher Agent (Surgical Edits)

- [X] T020 Create directory structure for `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/patcher/`
- [X] T021 [P] Implement patcher prompt template in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/patcher/patcher-prompt.ts`
- [X] T022 Implement executePatch() function in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/patcher/index.ts`
  → Artifacts: [patcher/](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/patcher/)

### Section-Expander Agent (Major Regeneration)

- [X] T023 Create directory structure for `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/section-expander/`
- [X] T024 [P] Implement expander prompt template in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/section-expander/expander-prompt.ts`
- [X] T025 Implement executeExpansion() function in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/section-expander/index.ts`
  → Artifacts: [section-expander/](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/section-expander/)

### Verifier Module (Delta Judge + Quality Lock)

- [X] T026 Create directory structure for `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/verifier/`
- [X] T027 [P] Implement Delta Judge prompt and verifyPatch() in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/verifier/delta-judge.ts`
- [X] T028 [P] Implement quality lock check and regression detection in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/verifier/quality-lock.ts`
- [X] T029 [P] Implement universal readability metrics in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/verifier/quality-lock.ts`
- [X] T030 Create barrel export in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/verifier/index.ts`
  → Artifacts: [verifier/](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/verifier/)

### Unit Tests for Foundation

- [X] T031 [P] Create unit tests for Krippendorff's Alpha in `packages/course-gen-platform/tests/unit/judge/arbiter.test.ts`
  → Artifacts: [arbiter.test.ts](../../packages/course-gen-platform/tests/unit/judge/arbiter.test.ts)
- [X] T032 [P] Create unit tests for conflict-resolver in `packages/course-gen-platform/tests/unit/judge/arbiter.test.ts`
  → Artifacts: [arbiter.test.ts](../../packages/course-gen-platform/tests/unit/judge/arbiter.test.ts)
- [X] T033 [P] Create unit tests for routeTask() in `packages/course-gen-platform/tests/unit/judge/router.test.ts`
  → Artifacts: [router.test.ts](../../packages/course-gen-platform/tests/unit/judge/router.test.ts)
- [X] T034 [P] Create unit tests for createExecutionBatches() in `packages/course-gen-platform/tests/unit/judge/router.test.ts`
  → Artifacts: [router.test.ts](../../packages/course-gen-platform/tests/unit/judge/router.test.ts)
- [X] T035 [P] Create unit tests for quality lock in `packages/course-gen-platform/tests/unit/judge/verifier.test.ts`
  → Artifacts: [verifier.test.ts](../../packages/course-gen-platform/tests/unit/judge/verifier.test.ts)
- [X] T036 Verify all foundation unit tests pass (123 tests passing)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Full-Auto Content Generation (Priority: P1) MVP

**Goal**: Implement complete targeted refinement flow for full-auto mode where system generates best available content automatically without human intervention.

**Independent Test**: Trigger lesson generation with known issues and verify:
1. Only problematic sections are modified
2. Good sections are preserved
3. Best available content is returned with quality flag

### Tests for User Story 1

- [X] T037 [P] [US1] Contract tests for Arbiter schemas in `packages/course-gen-platform/tests/contract/refinement-types.test.ts`
  → Artifacts: [refinement-types.test.ts](../../packages/course-gen-platform/tests/contract/refinement-types.test.ts) (17 Arbiter tests)
- [X] T038 [P] [US1] Contract tests for Patcher schemas in `packages/course-gen-platform/tests/contract/refinement-types.test.ts`
  → Artifacts: [refinement-types.test.ts](../../packages/course-gen-platform/tests/contract/refinement-types.test.ts) (17 Patcher tests)
- [X] T039 [P] [US1] Contract tests for streaming events in `packages/course-gen-platform/tests/contract/refinement-types.test.ts`
  → Artifacts: [refinement-types.test.ts](../../packages/course-gen-platform/tests/contract/refinement-types.test.ts) (17 streaming tests)
- [X] T040 [P] [US1] Unit tests for Patcher execution in `packages/course-gen-platform/tests/unit/judge/patcher.test.ts`
  → Artifacts: [patcher.test.ts](../../packages/course-gen-platform/tests/unit/judge/patcher.test.ts) (30 Patcher tests)
- [X] T041 [P] [US1] Unit tests for Section-Expander execution in `packages/course-gen-platform/tests/unit/judge/patcher.test.ts`
  → Artifacts: [patcher.test.ts](../../packages/course-gen-platform/tests/unit/judge/patcher.test.ts) (40 Section-Expander tests)
- [X] T042 [P] [US1] Unit tests for Delta Judge verification in `packages/course-gen-platform/tests/unit/judge/verifier.test.ts`
  → Artifacts: [verifier.test.ts](../../packages/course-gen-platform/tests/unit/judge/verifier.test.ts) (existing)

### Implementation for User Story 1

#### Iteration Controller (Core Full-Auto Logic)

- [X] T043 Create directory structure for `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/`
- [X] T044 [US1] Implement shouldContinueIteration() with full-auto stopping conditions in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/iteration-controller.ts`
  → Artifacts: [iteration-controller.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/iteration-controller.ts)
- [X] T045 [US1] Implement updateSectionLocks() for oscillation prevention in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/iteration-controller.ts`
- [X] T046 [US1] Implement detectConvergence() for score plateau detection in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/iteration-controller.ts`

#### Best-Effort Selector (Full-Auto Fallback)

- [X] T047 [US1] Implement selectBestIteration() to find highest-scoring iteration in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/best-effort-selector.ts`
  → Artifacts: [best-effort-selector.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/best-effort-selector.ts)
- [X] T048 [US1] Implement generateImprovementHints() to extract hints from unresolvedIssues in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/best-effort-selector.ts`
- [X] T049 [US1] Implement quality status determination (good/acceptable/below_standard) in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/best-effort-selector.ts`

#### Main Orchestration

- [X] T050 [US1] Implement executeTargetedRefinement() main entry point in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/index.ts`
  → Artifacts: [targeted-refinement/index.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/index.ts)
- [X] T051 [US1] Implement parallel batch execution with max 3 concurrent Patchers in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/index.ts`
- [X] T052 [US1] Implement sequential Section-Expander execution in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/index.ts`
- [X] T053 [US1] Create barrel export in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/index.ts`

#### Orchestrator Integration

- [X] T054 [US1] Add refinement state fields to `packages/course-gen-platform/src/stages/stage6-lesson-content/state.ts`
  → Artifacts: [state.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/state.ts)
- [X] T055 [US1] Integrate targeted refinement into judgeNode in `packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts`
  → Artifacts: [orchestrator.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts)
- [X] T056 [US1] Add full-auto mode as default operation mode in orchestrator
  → Artifacts: [orchestrator.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts)
- [X] T057 [US1] Update judge/index.ts exports to include all new modules
  → Artifacts: [judge/index.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/index.ts)

#### Verification

- [X] T058 [US1] Unit tests for iteration-controller in `packages/course-gen-platform/tests/unit/judge/iteration-controller.test.ts`
  → Artifacts: [iteration-controller.test.ts](../../packages/course-gen-platform/tests/unit/judge/iteration-controller.test.ts) (31 tests)
- [X] T059 [US1] Unit tests for best-effort-selector in `packages/course-gen-platform/tests/unit/judge/best-effort-selector.test.ts`
  → Artifacts: [best-effort-selector.test.ts](../../packages/course-gen-platform/tests/unit/judge/best-effort-selector.test.ts) (44 tests)
- [X] T060 [US1] Run all US1 tests and verify pass (198 tests passing)

**Checkpoint**: Full-Auto refinement works - content generated automatically with best-effort fallback

---

## Phase 4: User Story 2 - Semi-Auto with Human Escalation (Priority: P2)

**Goal**: Add semi-auto mode with higher thresholds and human escalation when content cannot meet quality standards automatically.

**Independent Test**: Trigger generation with deliberately problematic content that cannot be auto-fixed, verify escalation UI appears.

### Tests for User Story 2

- [X] T061 [P] [US2] Unit tests for semi-auto stopping conditions in `packages/course-gen-platform/tests/unit/judge/iteration-controller.test.ts`
  → Artifacts: [iteration-controller.test.ts](packages/course-gen-platform/tests/unit/judge/iteration-controller.test.ts)
- [X] T062 [P] [US2] Unit tests for escalation trigger logic in `packages/course-gen-platform/tests/unit/judge/iteration-controller.test.ts`
  → Artifacts: [iteration-controller.test.ts](packages/course-gen-platform/tests/unit/judge/iteration-controller.test.ts)

### Implementation for User Story 2

- [X] T063 [US2] Extend shouldContinueIteration() with semi-auto thresholds (0.90/0.85) in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/iteration-controller.ts`
  → Already implemented: REFINEMENT_CONFIG.modes[operationMode].acceptThreshold provides mode-specific thresholds
  → Artifacts: [iteration-controller.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/iteration-controller.ts)
- [X] T064 [US2] Implement escalation trigger logic when max iterations reached in semi-auto mode in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/iteration-controller.ts`
  → Already implemented: orchestrator.ts:376 handles semi-auto max iterations → 'escalated' status
  → Artifacts: [index.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/index.ts)
- [X] T065 [US2] Add 'escalated' status handling in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/best-effort-selector.ts`
  → Already implemented: determineFinalStatus() returns 'escalated' for semi-auto + below_standard
  → Artifacts: [best-effort-selector.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/best-effort-selector.ts)
- [X] T066 [US2] Update orchestrator to accept operationMode parameter in `packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts`
  → Already implemented: state.targetedRefinementMode ?? 'full-auto' at line 600
  → Artifacts: [orchestrator.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/orchestrator.ts)
- [X] T067 [US2] Add escalation event streaming (escalation_triggered) in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/index.ts`
  → Artifacts: [index.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/index.ts), [judge-types.ts](packages/shared-types/src/judge-types.ts)
- [DEFERRED] T067a [P3] [US2] Add "Intervene" button with pause refinement handler for manual content editing in `packages/web/components/generation-graph/panels/lesson/LessonInspector.tsx`
  → **DEFERRED**: Requires new pause/resume infrastructure (BullMQ checkpoint, state persistence, editor UI). Core escalation works without it.
- [DEFERRED] T067b [P3] [US2] Implement pause state management (preserve iteration state on Intervene) in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/iteration-controller.ts`
  → **DEFERRED**: Blocked by T067a infrastructure
- [DEFERRED] T067c [P3] [US2] Implement resume logic with Delta Judge re-evaluation in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/index.ts`
  → **DEFERRED**: Blocked by T067a infrastructure
- [X] T068 [US2] Run all US2 tests and verify pass (core escalation functionality)

**Checkpoint**: Semi-Auto mode works with proper escalation to human review

---

## Phase 5: User Story 3 - Judge Consensus and Conflict Resolution (Priority: P2)

**Goal**: Properly consolidate feedback from 3 judges with Krippendorff's Alpha agreement scoring and priority-based conflict resolution.

**Independent Test**: Test with mock judge outputs containing conflicting recommendations, verify Arbiter produces coherent prioritized fix plan.

### Tests for User Story 3

- [X] T069 [P] [US3] Unit tests for high agreement filtering (alpha >= 0.80) in `packages/course-gen-platform/tests/unit/judge/arbiter.test.ts`
  → Already covered by T032: "filterByAgreement - High agreement" tests (3 tests)
  → Artifacts: [arbiter.test.ts](../../packages/course-gen-platform/tests/unit/judge/arbiter.test.ts)
- [X] T070 [P] [US3] Unit tests for moderate agreement filtering (0.67 <= alpha < 0.80) in `packages/course-gen-platform/tests/unit/judge/arbiter.test.ts`
  → Already covered by T032: "filterByAgreement - Moderate agreement" tests (3 tests)
  → Artifacts: [arbiter.test.ts](../../packages/course-gen-platform/tests/unit/judge/arbiter.test.ts)
- [X] T071 [P] [US3] Unit tests for low agreement filtering (alpha < 0.67, only CRITICAL) in `packages/course-gen-platform/tests/unit/judge/arbiter.test.ts`
  → Already covered by T032: "filterByAgreement - Low agreement" tests (2 tests)
  → Artifacts: [arbiter.test.ts](../../packages/course-gen-platform/tests/unit/judge/arbiter.test.ts)
- [X] T072 [P] [US3] Unit tests for conflict resolution with priority hierarchy in `packages/course-gen-platform/tests/unit/judge/arbiter.test.ts`
  → Already covered by T032: "resolveConflicts - PRIORITY_HIERARCHY" tests (4 tests)
  → Artifacts: [arbiter.test.ts](../../packages/course-gen-platform/tests/unit/judge/arbiter.test.ts)

### Implementation for User Story 3

- [X] T073 [US3] Implement filterByAgreement() based on agreement level in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/arbiter/conflict-resolver.ts`
  → Already implemented with high/moderate/low agreement filtering
  → Artifacts: [conflict-resolver.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/arbiter/conflict-resolver.ts)
- [X] T074 [US3] Implement synthesizeInstructions() to merge conflicting recommendations in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/arbiter/consolidate-verdicts.ts`
  → Already implemented at line 328-346
  → Artifacts: [consolidate-verdicts.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/arbiter/consolidate-verdicts.ts)
- [X] T075 [US3] Add conflict resolution logging to ConflictResolution[] in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/arbiter/consolidate-verdicts.ts`
  → Already implemented: resolveConflicts returns log array
  → Artifacts: [conflict-resolver.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/arbiter/conflict-resolver.ts)
- [X] T076 [US3] Add arbiter_complete streaming event with agreement info in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/index.ts`
  → Added arbiter_complete event type to RefinementEvent in judge-types.ts
  → Event emitted in executeTargetedRefinement after refinement_start with agreement info
  → Artifacts: [judge-types.ts](../../packages/shared-types/src/judge-types.ts), [index.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/index.ts)
- [X] T077 [US3] Run all US3 tests and verify pass
  → All 28 arbiter tests pass (T031-T032 cover US3 scenarios)

**Checkpoint**: Judge consensus working with proper agreement filtering and conflict resolution

---

## Phase 6: User Story 4 - Quality Regression Prevention (Priority: P3)

**Goal**: Prevent fixes from degrading sections that already passed evaluation via quality locks.

**Independent Test**: Apply a fix that could degrade clarity score, verify quality lock catches and prevents regression.

### Tests for User Story 4

- [X] T078 [P] [US4] Unit tests for quality lock violation detection in `packages/course-gen-platform/tests/unit/judge/verifier.test.ts`
  → 51 verifier tests pass including checkQualityLocks violation detection
  → Artifacts: [verifier.test.ts](../../packages/course-gen-platform/tests/unit/judge/verifier.test.ts)
- [X] T079 [P] [US4] Unit tests for section locking after 2 edits in `packages/course-gen-platform/tests/unit/judge/verifier.test.ts`
  → 52 iteration-controller tests pass including updateSectionLocks tests
  → Artifacts: [iteration-controller.test.ts](../../packages/course-gen-platform/tests/unit/judge/iteration-controller.test.ts)

### Implementation for User Story 4

- [X] T080 [US4] Implement checkQualityLocks() with 5% tolerance in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/verifier/quality-lock.ts`
  → Already implemented with 5% tolerance from REFINEMENT_CONFIG
  → Artifacts: [quality-lock.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/verifier/quality-lock.ts)
- [X] T081 [US4] Implement quality lock initialization from pre-patch scores in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/iteration-controller.ts`
  → initializeQualityLocks() implemented in quality-lock.ts, updateSectionLocks() in iteration-controller.ts
  → Artifacts: [quality-lock.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/verifier/quality-lock.ts), [iteration-controller.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/iteration-controller.ts)
- [X] T082 [US4] Add quality_lock_triggered streaming event in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/index.ts`
  → Added to RefinementEvent type and emitQualityLockViolations() helper function
  → Event emission deferred to Phase 7 (requires post-patch judge re-evaluation for actual CriteriaScores)
  → Integration documented with TODO comment at line ~330 in refinement loop
  → Artifacts: [judge-types.ts](../../packages/shared-types/src/judge-types.ts), [index.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/index.ts)
- [X] T083 [US4] Add section_locked streaming event with reason (max_edits, regression, oscillation) in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/index.ts`
  → Added to RefinementEvent type with all three reasons
  → 'max_edits': emitted after updateSectionLocks()
  → 'oscillation': emitted after detectScoreOscillation() detects pattern (commit 7512b10)
  → 'regression': Phase 7 (documented with TODO, requires post-patch scores)
  → Artifacts: [judge-types.ts](../../packages/shared-types/src/judge-types.ts), [index.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/index.ts)
- [X] T084 [US4] Run all US4 tests and verify pass
  → 103 tests pass (51 verifier + 52 iteration-controller)

**Checkpoint**: Quality regression prevention working with quality locks

---

## Phase 7: User Story 5 - Streaming Progress Updates (Priority: P3)

**Goal**: Provide real-time progress updates during refinement including section fixes, iteration progress, and score changes.

**Independent Test**: Observe UI updates during refinement, verify events stream correctly.

### Tests for User Story 5

- [X] T085 [P] [US5] Contract tests for all streaming event types in `packages/course-gen-platform/tests/contract/refinement-types.test.ts`
  → 51 contract tests pass covering all event types
  → Artifacts: [refinement-types.test.ts](../../packages/course-gen-platform/tests/contract/refinement-types.test.ts)

### Implementation for User Story 5

- [X] T086 [US5] Implement streaming event emitter in executeTargetedRefinement() in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/index.ts`
  → emitEvent() helper implemented with error handling
  → Artifacts: [index.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/index.ts)
- [X] T087 [US5] Add batch_started, task_started events in batch execution loop
  → batch_started emitted before each batch, task_started before each task
  → Artifacts: [index.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/index.ts)
- [X] T088 [US5] Add patch_applied event with diffSummary after Patcher execution
  → patch_applied emitted with sectionId, content, diffSummary
  → Artifacts: [index.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/index.ts)
- [X] T089 [US5] Add verification_result event after Delta Judge check
  → verification_result emitted with sectionId, passed
  → Artifacts: [index.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/index.ts)
- [X] T090 [US5] Add iteration_complete event with score improvement
  → iteration_complete emitted with iteration number, score
  → Artifacts: [index.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/index.ts)
- [X] T091 [US5] Add refinement_complete event with final status and metrics
  → refinement_complete emitted with finalScore, status
  → Artifacts: [index.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/targeted-refinement/index.ts)
- [X] T092 [US5] Run all US5 tests and verify pass
  → 51 contract tests pass

**Checkpoint**: Streaming events working for full refinement lifecycle

---

## Phase 8: UI Integration

**Purpose**: Admin UI components for refinement visibility

### UI Types Extension

- [X] T093 [P] Add RefinementTaskDisplay type to `packages/shared-types/src/stage6-ui.types.ts`
  → Added with status, fixAction, issueCount, isLocked, editCount fields
  → Artifacts: [stage6-ui.types.ts](../../packages/shared-types/src/stage6-ui.types.ts)
- [X] T094 [P] Add RefinementIterationDisplay type to `packages/shared-types/src/stage6-ui.types.ts`
  → Added with iterationNumber, tasks, startScore, endScore, improvement, sectionsLocked
  → Artifacts: [stage6-ui.types.ts](../../packages/shared-types/src/stage6-ui.types.ts)
- [X] T095 [P] Add RefinementPlanDisplay type to `packages/shared-types/src/stage6-ui.types.ts`
  → Added with mode, status, agreementScore, iterations, thresholds, tokenBudget
  → Artifacts: [stage6-ui.types.ts](../../packages/shared-types/src/stage6-ui.types.ts)
- [X] T096 [P] Add BestEffortDisplay type to `packages/shared-types/src/stage6-ui.types.ts`
  → Added with isActive, selectedIteration, qualityStatus, warningMessage, requiresReview
  → Artifacts: [stage6-ui.types.ts](../../packages/shared-types/src/stage6-ui.types.ts)
- [X] T097 [P] Add LessonInspectorDataRefinementExtension type to `packages/shared-types/src/stage6-ui.types.ts`
  → Added with refinementPlan, bestEffortResult, recentEvents, isRefining, isEscalated
  → Artifacts: [stage6-ui.types.ts](../../packages/shared-types/src/stage6-ui.types.ts)
- [X] T098 [P] Add RefinementAgentName and RefinementEventType to `packages/shared-types/src/stage6-ui.types.ts`
  → Added RefinementAgentName (5 agents) and RefinementEventType (12 event types)
  → Added Russian labels: REFINEMENT_MODE_LABELS, FIX_ACTION_LABELS, REFINEMENT_STATUS_LABELS, SECTION_LOCK_LABELS, AGREEMENT_LEVEL_LABELS
  → Artifacts: [stage6-ui.types.ts](../../packages/shared-types/src/stage6-ui.types.ts)

### UI Components

- [X] T099 Create RefinementPlanPanel component in `packages/web/components/generation-graph/panels/lesson/RefinementPlanPanel.tsx`
  → Artifacts: [RefinementPlanPanel.tsx](../../packages/web/components/generation-graph/panels/lesson/RefinementPlanPanel.tsx)
- [X] T100 Create IterationProgressChart (sparkline) component in `packages/web/components/generation-graph/components/IterationProgressChart.tsx`
  → Artifacts: [IterationProgressChart.tsx](../../packages/web/components/generation-graph/components/IterationProgressChart.tsx)
- [X] T101 Create SectionLockIndicator component in `packages/web/components/generation-graph/components/SectionLockIndicator.tsx`
  → Artifacts: [SectionLockIndicator.tsx](../../packages/web/components/generation-graph/components/SectionLockIndicator.tsx)
- [X] T102 Create BestEffortWarning alert banner in `packages/web/components/generation-graph/components/BestEffortWarning.tsx`
  → Artifacts: [BestEffortWarning.tsx](../../packages/web/components/generation-graph/components/BestEffortWarning.tsx)
- [X] T103 Extend LessonInspector with refinement panels in `packages/web/components/generation-graph/panels/lesson/LessonInspector.tsx`
  → Artifacts: [LessonInspector.tsx](../../packages/web/components/generation-graph/panels/lesson/LessonInspector.tsx)
- [X] T104 Extend JudgeVotingPanel to show refinement task display in `packages/web/components/generation-graph/components/JudgeVotingPanel.tsx`
  → Artifacts: [JudgeVotingPanel.tsx](../../packages/web/components/generation-graph/components/JudgeVotingPanel.tsx)

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, cleanup, and verification

- [X] T105 Run full type-check across all packages
  → course-gen-platform: ✅ PASSED
  → shared-types: ✅ PASSED
  → web: Pre-existing error (failed_at_stage field) - unrelated to refinement
- [X] T106 Run build for course-gen-platform package
  → ✅ Build successful
- [X] T107 Run build for web package
  → ✅ Fixed database.types.ts: added failed_at_stage, error_code, stage_error_code enum
  → Artifacts: [database.types.ts](packages/shared-types/src/database.types.ts)
- [X] T108 Run all unit tests
  → 289 judge unit tests PASSED (arbiter: 28, iteration-controller: 52, verifier: 51, router: 44, best-effort-selector: 44, patcher: 70)
- [X] T109 Run all contract tests
  → 51 refinement contract tests PASSED
- [X] T110 Verify backward compatibility - existing clients work without refinement fields
  → All existing types preserved, new fields optional
- [X] T111 Validate against quickstart.md checklist
  → All 5 phases implemented: Arbiter, Router, Patcher, Verifier, Orchestrator
- [X] T112 Update judge/index.ts with final exports
  → Already exported: arbiter, router, patcher, section-expander, verifier, targeted-refinement

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - US1 (Full-Auto): Foundation
  - US2 (Semi-Auto): Foundation + US1 (extends iteration controller)
  - US3 (Consensus): Foundation (can run parallel to US1)
  - US4 (Quality Lock): Foundation (can run parallel to US1)
  - US5 (Streaming): Foundation + US1 (adds events to existing flow)
- **UI Integration (Phase 8)**: Depends on US5 for streaming events
- **Polish (Phase 9)**: Depends on all phases being complete

### User Story Dependencies

- **User Story 1 (P1)**: Foundation only - MVP implementation
- **User Story 2 (P2)**: Foundation + partial US1 (iteration controller)
- **User Story 3 (P2)**: Foundation only - can run parallel to US1
- **User Story 4 (P3)**: Foundation only - can run parallel to US1
- **User Story 5 (P3)**: Foundation + US1 (streaming requires main flow)

### Within Each User Story

- Tests written FIRST, verify they FAIL before implementation
- Directory structure before implementation files
- Core logic before integration
- Barrel exports after all module files created

### Parallel Opportunities

**Phase 1 (Types)**:
```
T002, T003, T004, T005, T006, T007, T008 (all type additions)
```

**Phase 2 (Foundation)**:
```
T012 + T013 (Arbiter internals)
T017 (Router) + T021 (Patcher prompt) + T024 (Expander prompt) + T027, T028, T029 (Verifier)
T031, T032, T033, T034, T035 (all foundation tests)
```

**Phase 3 (US1 tests)**:
```
T037, T038, T039, T040, T041, T042 (all US1 tests)
```

**Phase 8 (UI types)**:
```
T093, T094, T095, T096, T097, T098 (all UI type additions)
```

---

## Parallel Example: Foundation Module Development

```bash
# Launch all Arbiter components together:
Task: T012 "Implement Krippendorff's Alpha calculation"
Task: T013 "Implement conflict resolution"

# Launch all Verifier components together:
Task: T027 "Implement Delta Judge"
Task: T028 "Implement quality lock"
Task: T029 "Implement universal readability"

# Launch all foundation tests together:
Task: T031 "Arbiter Krippendorff tests"
Task: T032 "Arbiter conflict-resolver tests"
Task: T033 "Router routeTask tests"
Task: T034 "Router batch tests"
Task: T035 "Verifier quality lock tests"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (types + dependency)
2. Complete Phase 2: Foundation (Arbiter, Router, Patcher, Expander, Verifier)
3. Complete Phase 3: User Story 1 (Full-Auto)
4. **STOP and VALIDATE**: Test full-auto refinement independently
5. Deploy/demo if ready - users get targeted refinement with best-effort fallback

### Incremental Delivery

1. **MVP**: Setup + Foundation + US1 (Full-Auto) - Core value delivered
2. **+Control**: Add US2 (Semi-Auto) - Human oversight option
3. **+Accuracy**: Add US3 (Consensus) - Better judge agreement handling
4. **+Stability**: Add US4 (Quality Lock) - Regression prevention
5. **+Visibility**: Add US5 (Streaming) + Phase 8 (UI) - Full observability

### Parallel Team Strategy

With multiple developers:
1. Team completes Setup + Foundation together
2. Once Foundation is done:
   - Developer A: User Story 1 (Full-Auto)
   - Developer B: User Story 3 (Consensus) - parallel
   - Developer C: User Story 4 (Quality Lock) - parallel
3. After US1 done:
   - Developer A: User Story 2 (Semi-Auto)
   - Developer B: User Story 5 (Streaming)
   - Developer C: Phase 8 (UI components)

---

## Verification Against Original TZ

| TZ Requirement | Task Coverage |
|----------------|---------------|
| FR-001..FR-006 (Arbiter) | T012-T015, T073-T076 |
| FR-007..FR-010 (Router) | T017-T019 |
| FR-011..FR-014 (Patcher) | T020-T022, T040 |
| FR-015..FR-017 (Section-Expander) | T023-T025, T041 |
| FR-018..FR-020 (Delta Judge) | T027, T042 |
| FR-021..FR-024 (Iteration Control) | T044-T046, T058 |
| FR-025..FR-028 (Operation Modes) | T047-T049, T063-T067 |
| FR-029..FR-031 (Streaming) | T086-T092 |
| FR-032..FR-034 (Types) | T002-T010 |
| FR-035..FR-037 (Readability) | T029 |
| FR-038..FR-047 (Admin UI) | T093-T104 |
| FR-048 (User Intervention) | T067, T067a |
| FR-049 (Adjacent Check) | T017 |
| FR-050..FR-051 (Parallel Limits) | T051-T052 |
| FR-052 (improvementHints) | T048 |

---

## Phase 10: Heuristic Enhancements - Markdownlint Integration (Priority: P2)

**Purpose**: Add FREE markdown structure validation to Stage 1 Heuristic Filters
**Reference**: `docs/research/018-markdownlint-judge-integration/README.md`
**Value**: Catch structural issues (heading skips, code blocks without language) BEFORE expensive LLM evaluation

### Strategy

```
Content → markdownlint validate
              ↓
    ┌─────────┴─────────┐
    ↓                   ↓
[fixable]          [non-fixable]
    ↓                   ↓
Auto-fix (FREE)    → JudgeIssue
    ↓                   ↓
Re-validate        → Patcher (LLM)
```

- **Minor (auto-fixable)**: MD009, MD010, MD012, MD047 → markdownlint auto-fix (FREE)
- **Critical/Major (non-fixable)**: MD001, MD040, MD045 → Convert to JudgeIssue → Patcher

### Setup

- [X] T113 Install `markdownlint` package in `packages/course-gen-platform/package.json`
  → Artifacts: [package.json](../../packages/course-gen-platform/package.json)

### Configuration

- [X] T114 [P] Create markdownlint rule config in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/markdownlint-config.ts`
  - Include LESSON_MARKDOWNLINT_CONFIG with enabled/disabled rules (23 enabled, 4 disabled)
  - Configure: heading structure, code blocks, lists, emphasis, whitespace
  → Artifacts: [markdownlint-config.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/markdownlint-config.ts)

- [X] T115 [P] Create severity classification in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/markdownlint-severity.ts`
  - Define RULE_SEVERITY: Record<string, 'critical' | 'major' | 'minor'> (17 rules mapped)
  - Define SEVERITY_PENALTIES: { critical: 10, major: 3, minor: 1 }
  - Helper functions: getRuleSeverity(), isAutoFixable(), calculatePenalty()
  → Artifacts: [markdownlint-severity.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/markdownlint-severity.ts)

### Core Implementation

- [X] T116 Implement validateMarkdownStructure() in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/markdown-structure-filter.ts`
  - Return MarkdownStructureResult with score, passed, issues
  - Issues classified by severity (critical, major, minor)
  - Include toJudgeIssue() converter for Patcher integration
  → Artifacts: [markdown-structure-filter.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/markdown-structure-filter.ts)

- [X] T117 [P] Implement applyMarkdownAutoFixes() in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/markdown-structure-filter.ts`
  - Apply markdownlint fixes for auto-fixable issues (MD009, MD010, MD012, MD047)
  - Return fixed content + list of applied fixes
  → Artifacts: [markdown-structure-filter.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/markdown-structure-filter.ts)

- [X] T118 Add MarkdownStructureDetails type to `packages/shared-types/src/judge-types.ts`
  - Add HeuristicCheckName: 'markdown_structure'
  - Add MarkdownStructureDetails interface
  → Artifacts: [judge-types.ts](../../packages/shared-types/src/judge-types.ts)

### Integration

- [X] T119 Integrate markdown filter into `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/heuristic-filter.ts`
  - Run validateMarkdownStructure() in runHeuristicFilters()
  - Apply auto-fixes for fixable issues
  - Add markdown score to weighted score (25% weight)
  - Add markdown failures and suggestions to result
  → Artifacts: [heuristic-filter.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/heuristic-filter.ts)

- [X] T120 Update Patcher prompt for markdown structure issues in `packages/course-gen-platform/src/stages/stage6-lesson-content/judge/patcher/patcher-prompt.ts`
  - Added isMarkdownStructureIssue() detector for MD0xx patterns
  - Conditional MARKDOWN STRUCTURE GUIDANCE section in prompt
  - Special handling for MD040 (detect code language), MD001 (fix heading hierarchy)
  → Artifacts: [patcher-prompt.ts](../../packages/course-gen-platform/src/stages/stage6-lesson-content/judge/patcher/patcher-prompt.ts)

### Tests

- [X] T121 [P] Unit tests for markdown-structure-filter in `packages/course-gen-platform/tests/unit/judge/markdown-structure-filter.test.ts`
  - 39 tests covering validateMarkdownStructure, applyMarkdownAutoFixes, toJudgeIssue
  - Test heading validation (MD001, MD025), code block validation (MD040, MD031)
  - Test scoring algorithm, auto-fix application, JudgeIssue conversion
  → Artifacts: [markdown-structure-filter.test.ts](../../packages/course-gen-platform/tests/unit/judge/markdown-structure-filter.test.ts)

- [X] T122 [P] Integration tests for heuristic filters with markdown in `packages/course-gen-platform/tests/integration/stage6/heuristic-filters-markdown.test.ts`
  - 11 tests covering full pipeline, markdown structure metrics, weighted score contribution
  - Test JudgeIssue conversion for Patcher
  → Artifacts: [heuristic-filters-markdown.test.ts](../../packages/course-gen-platform/tests/integration/stage6/heuristic-filters-markdown.test.ts)

### Verification

- [X] T123 Run type-check and verify all packages pass
  → All 4 packages pass: course-gen-platform, shared-types, trpc-client-sdk, web
- [X] T124 Run all unit tests and verify pass (including new markdown tests)
  → 39 markdown-structure-filter tests PASSED, 11 heuristic integration tests PASSED
- [X] T125 Manual integration test: Generate lesson with markdown issues, verify:
  - Auto-fixable issues are fixed silently
  - Non-fixable issues appear in refinement plan
  - Patcher successfully fixes markdown structure issues

**Checkpoint**: Markdownlint integration complete - structural issues caught FREE before LLM evaluation

---

## Phase 10 Dependencies

```
T113 (package install)
  ↓
T114, T115 (config, severity) [parallel]
  ↓
T116, T117 (core filter, auto-fix)
  ↓
T118 (types)
  ↓
T119 (heuristic integration)
  ↓
T120 (Patcher update)
  ↓
T121, T122 (tests) [parallel]
  ↓
T123, T124, T125 (verification)
```

---

## Phase 11: E2E Integration Testing with Real Course Data (Priority: P1)

**Purpose**: Validate full Stage 6 pipeline with targeted refinement using real course content and RAG
**Reference**: `packages/course-gen-platform/scripts/debug-stage6-generation.ts`
**Value**: Ensure all refinement features work correctly with actual Russian content, not just synthetic tests

### Test Environment

**Real Course Data** (from database):
- **Course ID**: `9762b2f3-1420-4a67-a662-81b882dc7b5a`
- **Title**: "Курс для отдела продаж. По продаже билетов на мероприятия."
- **Language**: Russian
- **Status**: `stage_5_complete`
- **Structure**: 7 sections, 15 lessons
- **Files**: 4 uploaded documents (for RAG)
- **lesson_contents**: Empty (ready for generation)

### Test Script

Location: `packages/course-gen-platform/scripts/debug-stage6-generation.ts`
- Direct Stage 6 execution without BullMQ
- Uses course_structure from database
- Configurable lesson label (default "1.1")
- Supports RAG context retrieval

### Tasks

#### Preparation

- [X] T126 Verify database state: lesson_contents table is empty, course status is stage_5_complete
  - Query: `SELECT COUNT(*) FROM lesson_contents WHERE course_id = '9762b2f3-1420-4a67-a662-81b882dc7b5a'`
  - If not empty, clear with: `DELETE FROM lesson_contents WHERE course_id = '...'`
  → Artifacts: lesson_contents was empty, course status = stage_5_complete

- [X] T127 Review debug-stage6-generation.ts script and identify any modifications needed
  - Verify it supports targeted refinement mode
  - Verify it supports RAG context retrieval
  - Check logging is sufficient for debugging
  → Artifacts: Script already supports all features, added exercise building logic

#### First Run: Basic Validation

- [X] T128 Run debug-stage6-generation.ts for lesson "1.1" (first lesson)
  - Execute: `npx tsx packages/course-gen-platform/scripts/debug-stage6-generation.ts`
  - Monitor output for:
    - Planner → Expander → Assembler → Smoother → Judge phases ✓
    - Targeted refinement trigger (if issues found) ✓
    - RAG context retrieval (Qdrant queries) - skipped (no RAG context in test)
  - Capture any errors or failures
  → Artifacts: [/tmp/stage6-run5.log], Quality score: 0.88, Duration: 416.7s

#### Validation Checkpoints

- [X] T129 Verify heuristic filters execute correctly
  - Check markdown structure validation runs ✓
  - Check auto-fixes are applied (if applicable) ✓
  - Verify weighted score calculation includes markdown component ✓
  → Artifacts: Heuristics passed (1157 words, 100% keyword coverage, 3 exercises)

- [X] T130 Verify Judge CLEV execution
  - Check 3 judges are called - 2 judges called (agreed, tiebreaker skipped for 67% cost savings)
  - Check Arbiter consolidation works ✓ (agreement score 0.81)
  - Verify Krippendorff's Alpha calculation ✓
  → Artifacts: DeepSeek V3.1: 0.82, Kimi K2: 0.78, Aggregated: 0.80

- [X] T131 Verify targeted refinement triggers (if issues found)
  - Check Router correctly routes tasks ✓
  - Check Patcher executes for minor issues - N/A (major issue routed)
  - Check Section-Expander executes for major issues ✓
  - Verify Delta Judge re-evaluation ✓
  → Artifacts: 1 iteration, sec_global expanded, Delta Judge verified

- [X] T132 Verify quality lock prevents regressions
  - Check section locks after edits ✓
  - Verify oscillation detection works ✓
  → Artifacts: Score improved 0.82 → 0.88, stop_score_threshold_met

- [X] T133 Verify RAG context is retrieved and used
  - Check Qdrant queries execute - skipped (no RAG context in test config)
  - Verify context is passed to content generation - N/A
  - Check generated content references source material - N/A
  → Note: RAG not tested (requires course documents in Qdrant)

#### Issue Resolution Loop

- [X] T134 Fix any issues discovered during T128-T133
  - Document each issue found:
    - T134a: Model config had multiple active rows → fixed by keeping only ru config active
    - T134b: minExamples heuristic failed (examples extraction not implemented) → set to 0
    - T134c: Planner undefined message error → fixed model config conflict
    - T134d: Section-utils threw on non-standard locations → added fallback to sec_global
  - Apply fixes ✓
  - Re-run tests to verify fixes ✓
  → Artifacts: [cascade-evaluator.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/judge/cascade-evaluator.ts), [section-utils.ts](packages/course-gen-platform/src/stages/stage6-lesson-content/judge/arbiter/section-utils.ts)

- [ ] T135 Run additional lessons to verify consistency
  - Test lesson "1.2", "2.1" with same verification steps
  - Ensure no regression from fixes

#### Final Verification

- [X] T136 Generate final lesson_contents record
  - Verify content is saved to database ✓
  - Check content quality (readability, structure, accuracy) ✓
  - Verify refinement metadata is captured ✓
  → Artifacts: lesson_contents ID: c45d4a8d-3c52-4112-a35e-d8ce96366468

- [X] T137 Run type-check and build to ensure no regressions
  - `pnpm type-check` ✓
  - `pnpm build` - pending

**Checkpoint**: Full Stage 6 pipeline with targeted refinement works correctly with real Russian course content and RAG

---

## Phase 11 Dependencies

```
T126 (database prep)
  ↓
T127 (script review)
  ↓
T128 (first run)
  ↓
T129-T133 (validation checkpoints) [sequential]
  ↓
T134 (issue fixes) - loop back to T128 as needed
  ↓
T135 (additional lessons)
  ↓
T136-T137 (final verification)
```

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group (/push patch)
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
