# Orchestrator Handoff

Updated: 2026-05-19
Current working branch: `feature/career-playbook-frontend-phase-b`
Current PR: #29 `feature/career-playbook-frontend-phase-b` -> `develop`

## Current state

- This repository is a single-repo pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- `.codex/orchestrator.toml` is the machine-readable contract; `.codex/handoff.md` is current-state only; `.codex/project-index.md` is the navigation map.
- Delivery truth remains unchanged: `/push-dev` drives Dev through `develop`, `/push` is release/version flow, and `/deploy` targets staging through `master`.
- Career Playbook PR #24, PR #25, PR #26, PR #27, and PR #28 have landed in `develop`.
- Career Playbook Phase 5 is implemented on this branch and is being advanced as PR #29 after retargeting to `develop`.
- No billing or payment scope is part of the Career Playbook MVP work in this branch.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.5` - Frontend Phase B follow-ups plus completion screen.
- Stage summary: [`.codex/stages/mc2-db696.5/summary.md`](./stages/mc2-db696.5/summary.md)
- Artifacts: store-state, wizard-ui, and route-integration under [`.codex/stages/mc2-db696.5/artifacts`](./stages/mc2-db696.5/artifacts).
- Key verification for stack advancement: merge `origin/develop`, preserve PR #28 frontend correctness fixes, run frontend/local checks, push for GitHub CI, then mark ready and merge only after checks pass.

## Next recommended

Next stage id: `mc2-db696.11.7.7`
Recommended action: complete PR #29 readiness, then advance sibling/downstream PRs only after PR #29 lands in `develop`.

- Resolve merge and review findings in PR #29 before marking it ready.
- After `mc2-db696.5` lands, evaluate sibling PRs #30 and #31 explicitly before continuing #32.
- Follow-up backend streaming/transport remains tracked separately and must not be assumed complete from this frontend-only PR.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook PR-stack readiness. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth. PR #24-#28 have landed in develop; continue sequentially from PR #29 and do not advance downstream PRs until their base PR has landed.
```

## Explicit defers

- Real backend tRPC/SSE follow-up generation and Role Guide generation transport is deferred from Phase 5 and tracked separately.
- Dirty stage-created worker worktrees for `feature/career-playbook-phase-b-store` and `feature/career-playbook-phase-b-ui` are retained; accepted content is manually integrated in this branch and verified before PR readiness.
- Marketing, library/share/RLS/public viewer, PDF, JD bridge, and end-to-end smoke work remain later Beads tasks under epic `mc2-db696`.
