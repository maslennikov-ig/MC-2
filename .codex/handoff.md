# Orchestrator Handoff

Updated: 2026-05-13
Current working branch: `feature/career-playbook-backend-2`
Base branch: `feature/career-playbook-backend` stacked on PR #25

## Current state

- This repository is a single-repo pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- Delivery truth remains unchanged: `develop` is the dev delivery branch, `master` is staging, and direct pushes to protected branches are forbidden.
- Career Playbook Phase 1 is closed in Beads as `mc2-db696.1`; PR #24 and PR #25 were still open when Phase 2 work started, so Phase 2 is intentionally stacked on `feature/career-playbook-backend`.
- Phase 2 work is tracked in Beads as `mc2-db696.2` and implemented on `feature/career-playbook-backend-2`.
- No billing or payment scope is part of the Career Playbook MVP work in this branch.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.2` — Backend LangGraph stage, specBuilder, group generators for groups 1-2, prompt registry entries, and Career Playbook job handler.
- Stage summary: [`.codex/stages/mc2-db696.2/summary.md`](./stages/mc2-db696.2/summary.md)
- Delegated artifact: none; this phase was executed locally due to current runtime policy requiring explicit user authorization before spawning subagents.

## Next recommended

Next stage id: `mc2-db696.3`
Recommended action: keep `feature/career-playbook-backend-2` stacked until PR #25 lands; after Phase 2 lands, continue backend generation in `mc2-db696.3`.

- Keep `feature/career-playbook-backend-2` stacked until PR #25 lands, then rebase or retarget according to the final Phase 1 merge path.
- After `mc2-db696.2` lands, the next backend task is `mc2-db696.3` for groups 3-6, cross-block judge, block regenerator, and final assembler.
- Frontend and marketing tasks remain separate: `mc2-db696.4`, `mc2-db696.7`, and `mc2-db696.10`.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth, verify PR #24/#25 status, and avoid dependent backend work on develop unless the stacked PRs have merged.
```

## Explicit defers

- Remaining Career Playbook backend generation is tracked in Beads as `mc2-db696.3`; do not fold groups 3-6, judge, block regeneration, or final assembly into `mc2-db696.2`.
- Frontend, marketing, library/share/RLS/public viewer, and end-to-end smoke work remain tracked in later Beads tasks under epic `mc2-db696`.
