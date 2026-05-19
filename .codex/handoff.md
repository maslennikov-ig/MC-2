# Orchestrator Handoff

Updated: 2026-05-19
Current working branch: `codex/pr32-phase-b-transport-develop`
Current PR: #32 `feature/career-playbook-phase-b-transport` -> `develop`

## Current state

- This repository is a single-repo pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- `.codex/orchestrator.toml` is the machine-readable contract; `.codex/handoff.md` is current-state only; `.codex/project-index.md` is the navigation map.
- Delivery truth remains unchanged: `/push-dev` drives Dev through `develop`, `/push` is release/version flow, and `/deploy` targets staging through `master`.
- Career Playbook PR #24, PR #25, PR #26, PR #27, PR #28, and PR #29 have landed in `develop`.
- Career Playbook Phase B transport is being retargeted to `develop` as PR #32.
- No billing or payment scope is part of the Career Playbook MVP work in this branch.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.12` - Phase B real follow-up/generation-start transport.
- Stage summary: [`.codex/stages/mc2-db696.12/summary.md`](./stages/mc2-db696.12/summary.md)
- Artifacts: backend-contract-explorer, frontend-transport-explorer, local-implementation, and code-review under [`.codex/stages/mc2-db696.12/artifacts`](./stages/mc2-db696.12/artifacts).
- Key verification for stack advancement: merge `origin/develop`, preserve PR #29 frontend/store correctness fixes, run backend/frontend focused checks, push for GitHub CI, then mark ready and merge only after checks pass.

## Next recommended

Next stage id: `mc2-db696.11.7.7`
Recommended action: complete PR #32 readiness against `develop`, then advance PR #30 viewer/editor before PR #31 landing unless PR #31 copy is softened to current MVP scope.

- PR #32 closes real browser/backend follow-up transport and generation-start handoff.
- PR #32 does not close full queue worker completion, live SSE/subscription status streaming, PDF, share, or JD bridge.
- When retargeting PR #30 after PR #32, preserve both transport methods from #32 and viewer/library methods from #30.
- PR #31 public landing needs copy review before release so it does not promise unavailable generation/edit/share/course reuse flows.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook PR-stack readiness. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth. PR #24-#29 have landed in develop; continue sequentially from PR #32 and do not advance downstream PRs until their base PR has landed.
```

## Explicit defers

- Queue worker completion and live SSE/subscription status streaming remain separate Career Playbook integration work tracked after `mc2-db696.12`.
- Marketing, library/share/RLS/public viewer, PDF, JD bridge, and end-to-end smoke work remain later Beads tasks under epic `mc2-db696`.
