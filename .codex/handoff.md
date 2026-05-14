# Orchestrator Handoff

Updated: 2026-05-14
Current working branch: `feature/career-playbook-phase-b-transport`
Base branch: `feature/career-playbook-frontend-phase-b` stacked on PR #29

## Current state

- Repo shape: single pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- Delivery truth: `develop` is dev delivery, `master` is staging, and direct pushes to protected branches remain forbidden.
- Career Playbook PR stack is still open: #24 base orchestration, #25 Phase 1, #26 backend stage 2, #27 backend stage 3, #28 Phase A frontend, #29 Phase B frontend.
- `mc2-db696.12` is ready for stacked PR delivery on this branch: Phase B follow-up transport now uses concrete backend tRPC mutations/queries, and the generation CTA starts a truthful backend `generating` handoff.
- No billing or payment scope is part of Career Playbook MVP work.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.12` - Phase B real follow-up/generation-start transport.
- Stage summary: [`.codex/stages/mc2-db696.12/summary.md`](./stages/mc2-db696.12/summary.md)
- Artifacts: backend-contract-explorer, frontend-transport-explorer, local-implementation, and code-review under [`.codex/stages/mc2-db696.12/artifacts`](./stages/mc2-db696.12/artifacts).

## Next recommended

Next stage id: `mc2-db696.10`
Recommended action: after closing and pushing `mc2-db696.12`, open a draft PR targeting `feature/career-playbook-frontend-phase-b`; then continue Library + share + RLS + public viewer only if the stacked PR base remains intentional and clean.

- If PR #24/#25/#26/#27/#28/#29 land first, rebase/retarget before more dependent work.
- Independent marketing work may proceed separately if its base branch decision is explicit.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth, verify PR #24/#25/#26/#27/#28/#29 status, and avoid dependent work on develop unless the stacked PRs have merged.
```

## Explicit defers

- Queue worker completion and live SSE/subscription status streaming remain separate Career Playbook integration work tracked as `mc2-db696.13`.
- Marketing, library/share/RLS/public viewer, PDF, JD bridge, and end-to-end smoke work remain later Beads tasks under epic `mc2-db696`.
