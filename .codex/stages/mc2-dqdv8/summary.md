---
stage_id: mc2-dqdv8
task_id: mc2-dqdv8
branch: codex/single-source-course-generation-flow
status: local_verified
---

# Course Structure Quality Guardrails

Updated: 2026-06-14

## Scope

- Added bounded auto-size structure profiles for general auto courses and Career
  Playbook bridge courses.
- Updated Stage 4 scope planning and post-processing to prefer the smallest
  complete course, enforce hard lesson caps, normalize sections, and recompute
  totals/durations.
- Updated Stage 5 generation to use each Stage 4 section's `estimated_lessons`
  budget instead of a uniform average.
- Added deterministic Stage 5 structural quality results under
  `generation_metadata.quality_scores.structure`.
- Blocked automatic approval, manual Stage 5 approval, and direct Stage 6 starts
  when critical structural issues exist.
- Updated Stage 5 UI to show critical blockers, warnings, and pass state, and to
  disable approval when the structure is critically blocked.
- Added durable docs/spec for the policy and updated Career Playbook/Stage 4/5
  docs.

## Routing

- Classification: medium/complex, cross-boundary backend + shared contracts + UI
  - docs.
- Skills: `orchestrator-stage`, `orchestration-closeout`; TDD flow used with
  targeted RED/GREEN tests.
- Documentation: no version-sensitive dependency lookup needed; behavior uses
  existing repo APIs and user-provided learning-design references.
- Knowledge graph: `graphify-out/GRAPH_REPORT.md` read before implementation;
  `graphify update .` run during closeout.
- Delegation: local sequential. Stage 4/5 contracts, shared types, auto-approval,
  and UI approval state are tightly coupled; no independent visible subagent
  stream had a safe non-overlapping write zone.

## Parallel Decomposition Matrix

| Stream | Goal                                   | Agent              | Write zone                              | Dependencies      | Verification                              | Decision   | Reason                                                   |
| ------ | -------------------------------------- | ------------------ | --------------------------------------- | ----------------- | ----------------------------------------- | ---------- | -------------------------------------------------------- |
| S0     | Beads + durable spec/docs              | local orchestrator | Beads, docs                             | none              | docs review                               | sequential | Locks shared policy first                                |
| S1     | Backend Stage 4/5 policy and validator | local orchestrator | course-gen-platform stages/shared-types | S0                | unit tests, type-check                    | sequential | Shared Stage 4/5 contract and metadata shape are coupled |
| S2     | UI quality state and approval disable  | local orchestrator | generation graph UI/messages            | S1 metadata shape | UI ESLint, type-check/build               | sequential | Needs final backend quality contract                     |
| S3     | Review/closeout                        | local orchestrator | read-only plus handoff/stage summary    | S1/S2             | build, graph update, process verification | sequential | Final verification needs integrated workspace            |

## Verification Evidence

- RED before implementation: targeted tests failed on missing
  `course-structure-policy` / structural validator.
- GREEN targeted tests:
  `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/course-structure-policy.test.ts tests/unit/stage5-structural-quality.test.ts tests/unit/stages/stage5-generation/section-batch-constraints.test.ts`
  -> 7 tests passed.
- UI lint:
  `pnpm --filter @megacampus/web exec eslint components/generation-graph/controls/ApprovalControls.tsx components/generation-graph/panels/stage5/Stage5OutputTab.tsx components/generation-graph/panels/stage5/types.ts`
  -> passed.
- Type check: `pnpm type-check` -> passed.
- Build: `pnpm build` -> passed with existing Browserslist and Node
  `url.parse()` deprecation warnings.

## E2E / Live Smoke

- Dev E2E that generates a real Career Playbook course was not run in this
  closeout because it can trigger live LLM/Tavily cost and requires disposable
  data. This is explicitly deferred to `mc2-pmrmf` rather than treated as
  verified.

## Delivery

- docs-reviewed: updated - added
  `docs/course-generation/structure-quality-spec.md`; updated Career Playbook
  architecture and Stage 4/5 README docs.
- graph-reviewed: updated - `graphify update .` rebuilt 57,981 nodes / 80,377
  edges; `graph.html` viz skipped by Graphify because the graph exceeds the
  5,000-node HTML limit; no tracked `graphify-out` diff remained.
- project-index: reviewed-no-change - no new route, package, service owner, or
  verification entrypoint was introduced.

## Explicit Defers

- `mc2-pmrmf`: live dev E2E for Career Playbook -> course with real model calls
  remains deferred until disposable data and cost budget are explicitly
  available.
