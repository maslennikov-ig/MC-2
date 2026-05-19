# Orchestrator Handoff

Updated: 2026-05-19
Current working branch: `feature/career-playbook-backend-3`
Current PR: #27 `feature/career-playbook-backend-3` -> `develop`

## Current state

- This repository is a single-repo pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- `.codex/orchestrator.toml` is the machine-readable contract; `.codex/handoff.md` is current-state only; `.codex/project-index.md` is the navigation map.
- Delivery truth remains unchanged: `/push-dev` drives Dev through `develop`, `/push` is release/version flow, and `/deploy` targets staging through `master`.
- Career Playbook PR #24, PR #25, and PR #26 have landed in `develop`.
- Career Playbook Phase 3 is implemented on this branch and is being advanced as PR #27.
- No billing or payment scope is part of the Career Playbook MVP work in this branch.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.3` — groups 3-6, cross-block judge, block regenerator, final assembler, follow-up helper, and graph/handler integration.
- Stage summary: [`.codex/stages/mc2-db696.3/summary.md`](./stages/mc2-db696.3/summary.md)
- Key verification for stack advancement: retarget PR #27 to `develop`, merge `origin/develop`, preserve PR #26 shared BullMQ contract and localized heading fixes, run local process/code checks, push for GitHub CI, then mark ready and merge only after checks pass.

## Next recommended

Next stage id: `mc2-db696.11.7.7`
Recommended action: complete PR #27 readiness, then advance PR #28 only after PR #27 lands in `develop`.

- Resolve merge and review findings in PR #27 before marking it ready.
- After `mc2-db696.3` lands, continue the PR stack sequentially from PR #28.
- Frontend and marketing tasks remain separate: `mc2-db696.4`, `mc2-db696.7`, and `mc2-db696.10`.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook PR-stack readiness. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth. PR #24, PR #25, and PR #26 have landed in develop; continue sequentially from PR #27 and do not advance downstream PRs until their base PR has landed.
```

## Explicit defers

- Frontend wizard Phase A is tracked as `mc2-db696.4`.
- Marketing, library/share/RLS/public viewer, PDF, JD bridge, and end-to-end smoke work remain tracked in later Beads tasks under epic `mc2-db696`.
