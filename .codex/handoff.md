# Orchestrator Handoff

Updated: 2026-05-13
Current working branch: `feature/career-playbook-frontend-phase-b`
Base branch: `feature/career-playbook-frontend-wizard` stacked on PR #28

## Current state

- Repo shape: single pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- Delivery truth: `develop` is dev delivery, `master` is staging, and direct pushes to protected branches remain forbidden.
- Career Playbook PR stack is still open: #24 base orchestration, #25 Phase 1, #26 backend stage, #27 backend stage 3, #28 Phase A frontend.
- Phase 5 `mc2-db696.5` is implemented locally on this branch: adaptive follow-up UI, free-form input, completion review, visible generation handoff fallback, i18n, unit tests, and Playwright smoke.
- No billing or payment scope is part of Career Playbook MVP work.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.5` - Frontend Phase B follow-ups plus completion screen.
- Stage summary: [`.codex/stages/mc2-db696.5/summary.md`](./stages/mc2-db696.5/summary.md)
- Artifacts: store-state, wizard-ui, and route-integration under [`.codex/stages/mc2-db696.5/artifacts`](./stages/mc2-db696.5/artifacts).

## Next recommended

Next stage id: `mc2-db696.6`
Recommended action: after closing and pushing Phase 5, open a draft PR targeting `feature/career-playbook-frontend-wizard`; then continue with viewer/editor only if the stacked PR base remains intentional and clean.

- If PR #24/#25/#26/#27/#28 land first, rebase/retarget before more dependent frontend work.
- Independent marketing/library/share tasks may proceed separately if their base branch decision is explicit.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth, verify PR #24/#25/#26/#27/#28 status, and avoid dependent work on develop unless the stacked PRs have merged.
```

## Explicit defers

- Real backend tRPC/SSE follow-up generation and Role Guide generation transport is deferred from Phase 5 and tracked as `mc2-db696.12`.
- Dirty stage-created worker worktrees for `feature/career-playbook-phase-b-store` and `feature/career-playbook-phase-b-ui` are retained; accepted content is manually integrated in the primary branch and verified.
- Marketing, library/share/RLS/public viewer, PDF, JD bridge, and end-to-end smoke work remain later Beads tasks under epic `mc2-db696`.
