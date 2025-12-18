# Implementation Plan: Stage 6 Targeted Refinement System

**Branch**: `018-judge-targeted-refinement` | **Date**: 2025-12-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/018-judge-targeted-refinement/spec.md`

## Summary

Implement a **Targeted Refinement** system for Stage 6 lesson content generation that:
- Applies **surgical fixes** (Patcher) or **section regeneration** (Section-Expander) instead of full lesson regeneration
- Uses an **Arbiter** to consolidate feedback from 3 judges (CLEV voting) with Krippendorff's Alpha agreement scoring
- Supports **two operation modes**: Semi-Auto (with human escalation) and Full-Auto (best-effort results)
- Targets **60-70% token cost reduction** per refinement iteration

## Technical Context

**Language/Version**: TypeScript 5.3+ (Strict Mode)
**Primary Dependencies**:
- `@langchain/langgraph` (StateGraph orchestration)
- `bullmq` (parallel task execution)
- `zod` (schema validation)
- `openai` (LLM calls via OpenRouter)
- `krippendorff-alpha` (inter-rater agreement - NEW, needs research)

**Storage**: PostgreSQL via Supabase (existing), Redis for BullMQ
**Testing**: Vitest (unit + contract tests)
**Target Platform**: Node.js 20+ server (BullMQ workers)
**Project Type**: Monorepo (pnpm workspaces)

**Performance Goals**:
- Token usage per refinement: ~2600 (vs ~6000 current)
- Refinement success rate: >90% (full-auto), >85% (semi-auto)
- Parallel batch execution for non-adjacent sections

**Constraints**:
- Max 3 refinement iterations
- Max 15000 tokens per refinement cycle
- Max 5 minute timeout
- Max 3 concurrent Patcher executions

**Scale/Scope**: Single lesson generation, existing CLEV voting infrastructure

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Context-First** | ✅ PASS | Existing codebase analyzed (judge-types.ts, clev-voter.ts, orchestrator.ts) |
| **II. Single Source of Truth** | ✅ PASS | Types go to `shared-types`, configs via existing REFINEMENT_CONFIG |
| **III. Strict Type Safety** | ✅ PASS | All new types use Zod schemas, TypeScript strict mode |
| **IV. Atomic Evolution** | ✅ PASS | Feature split into 8 phases in spec, tasks will be atomic |
| **V. Quality Gates** | ✅ PASS | Build/lint/type-check required before commit |
| **VI. Library-First** | ⚠️ RESEARCH | Need to evaluate `krippendorff-alpha` npm package |
| **VII. Task Tracking** | ✅ PASS | Will use tasks.md with artifacts |

**Gate Status**: PASS with 1 research item (Krippendorff's Alpha library)

## Project Structure

### Documentation (this feature)

```text
specs/018-judge-targeted-refinement/
├── plan.md              # This file
├── research.md          # Phase 0 output - library decisions
├── data-model.md        # Phase 1 output - entity definitions
├── quickstart.md        # Phase 1 output - implementation guide
├── contracts/           # Phase 1 output - API schemas
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared-types/src/
├── judge-types.ts           # EXISTING - extend with refinement UI types
├── stage6-ui.types.ts       # EXISTING - extend with refinement display types
└── pipeline-admin.ts        # EXISTING - add new phase names

packages/course-gen-platform/src/stages/stage6-lesson-content/
├── judge/
│   ├── index.ts             # EXISTING - update exports
│   ├── clev-voter.ts        # EXISTING - no changes needed
│   ├── cascade-evaluator.ts # EXISTING - minor extension for TargetedIssue
│   ├── arbiter/             # NEW - consolidation logic
│   │   ├── index.ts
│   │   ├── consolidate-verdicts.ts
│   │   ├── krippendorff.ts
│   │   └── conflict-resolver.ts
│   ├── router/              # NEW - fix action routing
│   │   ├── index.ts
│   │   └── route-task.ts
│   ├── patcher/             # NEW - surgical edits
│   │   ├── index.ts
│   │   └── patcher-prompt.ts
│   ├── section-expander/    # NEW - section regeneration
│   │   ├── index.ts
│   │   └── expander-prompt.ts
│   ├── verifier/            # NEW - delta judge + heuristics
│   │   ├── index.ts
│   │   ├── delta-judge.ts
│   │   └── quality-lock.ts
│   └── targeted-refinement/ # NEW - main orchestration
│       ├── index.ts
│       ├── iteration-controller.ts
│       └── best-effort-selector.ts
├── orchestrator.ts          # EXISTING - integrate targeted refinement
└── state.ts                 # EXISTING - add refinement state fields

packages/web/components/generation-graph/
├── panels/lesson/
│   ├── LessonInspector.tsx        # EXISTING - extend with refinement panels
│   └── RefinementPlanPanel.tsx    # NEW
├── components/
│   ├── JudgeVotingPanel.tsx       # EXISTING - add refinement task display
│   ├── IterationProgressChart.tsx # NEW - sparkline component
│   ├── SectionLockIndicator.tsx   # NEW
│   └── BestEffortWarning.tsx      # NEW

tests/
├── unit/
│   └── judge/
│       ├── arbiter.test.ts        # NEW
│       ├── router.test.ts         # NEW
│       ├── patcher.test.ts        # NEW
│       └── verifier.test.ts       # NEW
└── contract/
    └── refinement-types.test.ts   # NEW
```

**Structure Decision**: Extends existing Stage 6 Judge infrastructure with new sub-modules under `judge/`. UI components extend existing Glass Factory dashboard.

## Complexity Tracking

> No Constitution violations requiring justification. Feature follows existing patterns.

| Decision | Rationale |
|----------|-----------|
| Sub-modules under `judge/` | Follows existing pattern (cascade-evaluator, clev-voter, decision-engine) |
| Reuse existing types | Many types already defined in judge-types.ts (TargetedIssue, RefinementPlan, etc.) |
| Extend existing UI | Glass Factory dashboard already has JudgeVerdictDisplay infrastructure |

## Existing Code Analysis

### Already Implemented (in judge-types.ts)

The following types are **already defined** and can be reused:

- `FixAction` (SURGICAL_EDIT, REGENERATE_SECTION, FULL_REGENERATE)
- `ContextScope` (paragraph, section, global)
- `ContextWindow` (startQuote, endQuote, scope)
- `TargetedIssue` (extends JudgeIssue with targeting info)
- `TaskPriority` (critical, major, minor)
- `SectionRefinementTask` (per-section task)
- `ConflictResolution` (conflict log)
- `RefinementPlanStatus` (PENDING, EXECUTING, COMPLETED, FAILED)
- `RefinementPlan` (extends FixRecommendation)
- `IterationResult` (for best-effort selection)
- `RefinementIterationState` (interface, not schema)
- `OperationMode` (semi-auto, full-auto)
- `SemiAutoConfig`, `FullAutoConfig`, `RefinementConfig`
- `QualityStatus` (good, acceptable, below_standard)
- `BestEffortResult`
- `RefinementStatus` (accepted, accepted_warning, best_effort, escalated)
- `RefinementEvent` (streaming events)
- `UniversalReadabilityMetrics`
- `REFINEMENT_CONFIG` (complete config object)
- `PRIORITY_HIERARCHY` (conflict resolution order)

### Needs Implementation

1. **Arbiter logic** - consolidateVerdicts(), Krippendorff's Alpha calculation
2. **Router logic** - routeTask() decision tree
3. **Patcher agent** - prompt template + LLM call
4. **Section-Expander agent** - prompt template + LLM call
5. **Delta Judge** - verification prompt + LLM call
6. **Quality Lock** - regression detection
7. **Iteration Controller** - convergence detection, section locking
8. **Best-Effort Selector** - select highest score from history
9. **UI Types** - RefinementTaskDisplay, RefinementIterationDisplay, etc.
10. **Phase names** - stage_6_arbiter, stage_6_patcher, etc.

## Phase 0 Research Items

| Question | Type | Priority | Status |
|----------|------|----------|--------|
| Krippendorff's Alpha npm package | Library evaluation | HIGH | ✅ Done - use `krippendorff@0.1.0` |
| Parallel execution pattern in BullMQ | Best practices | MEDIUM | ✅ Done - custom batching |
| Existing readability metric utilities | Codebase search | LOW | ✅ Done - extend heuristic-filter.ts |

## Success Metrics

*From original TZ Section 15*

| Metric | Current | Target |
|--------|---------|--------|
| Tokens per refinement iteration | ~6000 | ~2600 (-57%) |
| Quality preservation (no regression) | N/A | >95% |
| Refinement success rate (semi-auto) | N/A | >85% |
| Refinement success rate (full-auto) | N/A | >90% (incl. best-effort) |
| Average iterations to accept | N/A | <2.5 |
| Human escalation rate (semi-auto) | N/A | <10% |

## Risks & Mitigations

*From original TZ Section 16*

| Risk | Impact | Mitigation |
|------|--------|------------|
| Patcher breaks coherence | Medium | Context anchors (prev/next sentences) |
| Oscillation loops | High | Section locking after 2 edits |
| Judge disagreement | Medium | Krippendorff's Alpha filtering |
| Regression in passing criteria | High | Quality Lock with 5% tolerance |
| Token budget overrun | Medium | Hard limits + early stopping |
| Full-auto returns bad content | Medium | Best-effort with quality flag |

## Next Steps

1. Run `/speckit.tasks` to generate tasks.md
