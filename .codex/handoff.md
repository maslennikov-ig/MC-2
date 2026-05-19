# Orchestrator Handoff

Updated: 2026-05-19
Current working branch: `feature/career-playbook-frontend-wizard`
Current PR: #28 `feature/career-playbook-frontend-wizard` -> `develop`

## Current state

- This repository is a single-repo pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- `.codex/orchestrator.toml` is the machine-readable contract; `.codex/handoff.md` is current-state only; `.codex/project-index.md` is the navigation map.
- Delivery truth remains unchanged: `/push-dev` drives Dev through `develop`, `/push` is release/version flow, and `/deploy` targets staging through `master`.
- Career Playbook PR #24, PR #25, PR #26, and PR #27 have landed in `develop`.
- Career Playbook Phase 4 is implemented on this branch and is being advanced as PR #28.
- No billing or payment scope is part of the Career Playbook MVP work in this branch.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.4` - Frontend wizard Phase A plus draft persistence.
- Stage summary: [`.codex/stages/mc2-db696.4/summary.md`](./stages/mc2-db696.4/summary.md)
- Artifacts: store, wizard-ui, and route-i18n-e2e under [`.codex/stages/mc2-db696.4/artifacts`](./stages/mc2-db696.4/artifacts).
- Key verification for stack advancement: retarget PR #28 to `develop`, merge `origin/develop`, preserve PR #27 backend/orchestration fixes, run frontend/backend local checks, push for GitHub CI, then mark ready and merge only after checks pass.

## Next recommended

Next stage id: `mc2-db696.11.7.7`
Recommended action: complete PR #28 readiness, then advance PR #29 only after PR #28 lands in `develop`.

- Resolve merge and review findings in PR #28 before marking it ready.
- After `mc2-db696.4` lands, continue the PR stack sequentially from PR #29.
- Follow-up adaptive questions, free-form continuation, and generation handoff remain tracked as `mc2-db696.5`.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook PR-stack readiness. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth. PR #24, PR #25, PR #26, and PR #27 have landed in develop; continue sequentially from PR #28 and do not advance downstream PRs until their base PR has landed.
```

## Explicit defers

- Follow-up adaptive questions, free-form continuation, and generation handoff remain tracked as `mc2-db696.5`.
- Marketing, library/share/RLS/public viewer, PDF, JD bridge, and end-to-end smoke work remain later Beads tasks under epic `mc2-db696`.
