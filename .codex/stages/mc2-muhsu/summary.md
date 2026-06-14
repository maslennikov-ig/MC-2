# Stage Summary: mc2-muhsu

Updated: 2026-06-14
Beads: `mc2-muhsu`
Branch: `codex/career-playbook-auto-course-size`

## Outcome

Defaulted Career Playbook course bridge size selection to `auto`, so the downstream analysis model chooses the optimal course size by topic instead of starting from the fixed `standard` preset. Configured Tavily locally through ignored env for Career Playbook web research.

## Classification And Routing

- Classification: medium/behavior-sensitive - course generation defaults and external web-research configuration affect generated course structure.
- Routing: local execution with `orchestrator-stage`, TDD, and closeout; no version-sensitive dependency docs needed because behavior uses existing shared `courseSizeSchema` and local Tavily integration.
- Delegation: none. The implementation is one cohesive bridge-default change plus tests and env configuration; subagents would add overhead without useful isolation.

## Parallel Decomposition Matrix

| Stream            | Goal                                | Owner | Write zone                        | Dependencies         | Verification                         | Reasoning | Decision   | Reason                        |
| ----------------- | ----------------------------------- | ----- | --------------------------------- | -------------------- | ------------------------------------ | --------- | ---------- | ----------------------------- |
| Bridge default    | Default course size to AI auto mode | local | `course-bridge-helpers.ts`, tests | existing course-size | RED/GREEN backend and frontend tests | medium    | sequential | single behavior chain         |
| Tavily config     | Configure web research without leak | local | ignored `.env`, `.env.example`    | backend dotenv load  | env load check and git secret grep   | medium    | sequential | secret handling must be local |
| Closeout/delivery | Record and promote completed change | local | `.codex`, `.beads`                | verification results | stage closeout and `/push-dev`       | medium    | sequential | depends on final verification |

## Changes

- `buildCourseBridgeBrief()` now returns `courseSize: 'auto'`.
- Backend bridge tests assert preview and default create payload use `auto`.
- Frontend Career Playbook preview mocks now use `auto`.
- `packages/course-gen-platform/.env.example` documents `TAVILY_API_KEY` as a placeholder.
- Ignored local `packages/course-gen-platform/.env` contains the actual Tavily key.

## Verification

- Passed RED: `pnpm --filter @megacampus/course-gen-platform test -- career-playbook-course-bridge.service.test.ts` failed while code still returned `standard`.
- Passed GREEN: `pnpm --filter @megacampus/course-gen-platform test -- career-playbook-course-bridge.service.test.ts`.
- Passed: `pnpm --filter @megacampus/web test -- tests/unit/components/career-playbook/create-course-from-playbook-dialog.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx`.
- Passed: `git grep -n "tvly-dev" -- . ':!*.env' ':!*.env.local' || true` produced no tracked matches.
- Passed: backend dotenv check reports `TAVILY_API_KEY=set`.
- Passed: `pnpm type-check`.
- Passed: `pnpm build`.
- Passed: `python3 scripts/orchestration/run_stage_closeout.py --stage mc2-muhsu`.
- Passed: Beads `mc2-muhsu` closed and `bd dolt push` completed.
- Pending: commit and dev delivery.

## Docs And Graph

- docs-reviewed: updated - backend env example, handoff, and stage summary were updated; no public API docs needed.
- project-index: reviewed-no-change - existing Career Playbook bridge and verification entries already point to the touched areas; no new route, module boundary, or command was added.
- graph-reviewed: no-change-needed - behavior/default change only; no architecture graph refresh required.

## Explicit Defers

- None.
