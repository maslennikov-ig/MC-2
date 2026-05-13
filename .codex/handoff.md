# Orchestrator Handoff

Updated: 2026-05-13
Current working branch: `feature/career-playbook-backend-3`
Base branch: `feature/career-playbook-backend-2` stacked on PR #26

## Current state

- This repository is a single-repo pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- Delivery truth remains unchanged: `develop` is the dev delivery branch, `master` is staging, and direct pushes to protected branches are forbidden.
- Career Playbook Phase 1 is closed in Beads as `mc2-db696.1`; Phase 2 is `mc2-db696.2` on `feature/career-playbook-backend-2`.
- Phase 3 work is tracked in Beads as `mc2-db696.3` and implemented on `feature/career-playbook-backend-3`.
- No billing or payment scope is part of the Career Playbook MVP work in this branch.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.3` — groups 3-6, cross-block judge, block regenerator, final assembler, follow-up helper, and graph/handler integration.
- Stage summary: [`.codex/stages/mc2-db696.3/summary.md`](./stages/mc2-db696.3/summary.md)
- Delegated artifacts: [groups](./stages/mc2-db696.3/artifacts/mc2-db696.3-groups.md), [judge](./stages/mc2-db696.3/artifacts/mc2-db696.3-judge.md), [support nodes](./stages/mc2-db696.3/artifacts/mc2-db696.3-support-nodes.md).

## Next recommended

Next stage id: `mc2-db696.4`
Recommended action: continue Frontend wizard Phase A after Phase 3 PR is opened; keep the stack aligned until PR #24/#25/#26 land.

- Keep `feature/career-playbook-backend-3` stacked until PR #26 lands, then rebase or retarget according to the final backend merge path.
- Frontend, marketing, library/share, PDF, bridge, and smoke tasks remain separate Beads work.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth, verify PR #24/#25/#26 status, and avoid dependent work on develop unless the stacked PRs have merged.
```

## Explicit defers

- Frontend wizard Phase A is tracked as `mc2-db696.4`.
- Marketing, library/share/RLS/public viewer, PDF, JD bridge, and end-to-end smoke work remain tracked in later Beads tasks under epic `mc2-db696`.
