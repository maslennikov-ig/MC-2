# Orchestrator Handoff

Updated: 2026-05-13
Current working branch: `feature/career-playbook-frontend-wizard`
Base branch: `feature/career-playbook-backend-3` stacked on PR #27

## Current state

- Repo shape: single pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- Delivery truth: `develop` is dev delivery, `master` is staging, and direct pushes to protected branches remain forbidden.
- Career Playbook PR stack is still open: #24 base orchestration, #25 Phase 1, #26 backend stage, #27 backend stage 3.
- Phase 4 `mc2-db696.4` is implemented locally on this branch: Phase A wizard route, store, components, i18n, unit tests, and Playwright e2e.
- No billing or payment scope is part of Career Playbook MVP work.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.4` - Frontend wizard Phase A plus draft persistence.
- Stage summary: [`.codex/stages/mc2-db696.4/summary.md`](./stages/mc2-db696.4/summary.md)
- Artifacts: store, wizard-ui, and route-i18n-e2e under [`.codex/stages/mc2-db696.4/artifacts`](./stages/mc2-db696.4/artifacts).

## Next recommended

Next stage id: `mc2-db696.5`
Recommended action: after closing and pushing Phase 4, open a draft PR targeting `feature/career-playbook-backend-3`; then continue the stack with Frontend Phase B only if the PR stack remains intentional and clean.

- If PR #24/#25/#26/#27 land first, rebase/retarget before more dependent frontend work.
- Independent marketing/library/share tasks may proceed separately if their base branch decision is explicit.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth, verify PR #24/#25/#26/#27 status, and avoid dependent work on develop unless the stacked PRs have merged.
```

## Explicit defers

- Follow-up adaptive questions, free-form continuation, and generation handoff remain tracked as `mc2-db696.5`.
- Marketing, library/share/RLS/public viewer, PDF, JD bridge, and end-to-end smoke work remain later Beads tasks under epic `mc2-db696`.
