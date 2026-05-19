# Orchestrator Handoff

Updated: 2026-05-19
Current working branch: `feature/career-playbook-backend-2`
Current PR: #26 `feature/career-playbook-backend-2` -> `develop`

## Current state

- This repository is a single-repo pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- `.codex/orchestrator.toml` is the machine-readable contract; `.codex/handoff.md` is current-state only; `.codex/project-index.md` is the navigation map.
- Delivery truth remains unchanged: `/push-dev` drives Dev through `develop`, `/push` is release/version flow, and `/deploy` targets staging through `master`.
- Career Playbook PR #24 and PR #25 have landed in `develop`.
- Career Playbook Phase 2 is implemented on this branch and is being advanced as PR #26.
- No billing or payment scope is part of the Career Playbook MVP work in this branch.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.2` — Backend LangGraph stage, specBuilder, group generators for groups 1-2, prompt registry entries, and Career Playbook job handler.
- Stage summary: [`.codex/stages/mc2-db696.2/summary.md`](./stages/mc2-db696.2/summary.md)
- Key verification for stack advancement: retarget PR #26 to `develop`, merge `origin/develop`, run local process/code checks, push for GitHub CI, then mark ready and merge only after checks pass.

## Next recommended

Next stage id: `mc2-db696.11.7.7`
Recommended action: complete PR #26 readiness, then advance PR #27 only after PR #26 lands in `develop`.

- Resolve any merge or review findings in PR #26 before marking it ready.
- After `mc2-db696.2` lands, the next backend task is `mc2-db696.3` for groups 3-6, cross-block judge, block regenerator, and final assembler.
- Frontend and marketing tasks remain separate: `mc2-db696.4`, `mc2-db696.7`, and `mc2-db696.10`.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook PR-stack readiness. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth. PR #24 and PR #25 have landed in develop; continue sequentially from PR #26 and do not advance downstream PRs until their base PR has landed.
```

## Explicit defers

- Remaining Career Playbook backend generation is tracked in Beads as `mc2-db696.3`; do not fold groups 3-6, judge, block regeneration, or final assembly into `mc2-db696.2`.
- Frontend, marketing, library/share/RLS/public viewer, and end-to-end smoke work remain tracked in later Beads tasks under epic `mc2-db696`.
