# Orchestrator Handoff

Updated: 2026-05-14
Current working branch: `feature/career-playbook-library-share`
Base branch: `feature/career-playbook-phase-b-transport` stacked on PR #32

## Current state

- Repo shape: single pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- Delivery truth: `develop` is dev delivery, `master` is staging, and direct pushes to protected branches remain forbidden.
- Career Playbook PR stack is still open: #24 base orchestration, #25 Phase 1, #26 backend stage 2, #27 backend stage 3, #28 Phase A frontend, #29 Phase B frontend, #32 Phase B transport.
- `mc2-db696.10` is ready for stacked PR delivery on this branch: personal library, backend share controls, and public read-only share viewer are implemented.
- No billing or payment scope is part of Career Playbook MVP work.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.10` - Library + share + RLS + public viewer.
- Stage summary: [`.codex/stages/mc2-db696.10/summary.md`](./stages/mc2-db696.10/summary.md)
- Artifacts: context and integration closeout under [`.codex/stages/mc2-db696.10/artifacts`](./stages/mc2-db696.10/artifacts).

## Next recommended

Next stage id: `mc2-db696.11`
Recommended action: after closing and pushing `mc2-db696.10`, run Career Playbook tests/smoke staging verification from the stacked PR branch and verify live RLS/share behavior against the deployed Supabase environment.

- If PR #24/#25/#26/#27/#28/#29/#32 land first, rebase/retarget before more dependent work.
- Independent marketing work may proceed separately if its base branch decision is explicit.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth, verify PR #24/#25/#26/#27/#28/#29/#32 status, and avoid dependent work on develop unless the stacked PRs have merged.
```

## Explicit defers

- Real Supabase RLS/staging smoke and browser e2e share flow remain in `mc2-db696.11`.
- Queue worker completion and live SSE/subscription status streaming remain separate Career Playbook integration work tracked as `mc2-db696.13`.
- Marketing, PDF, JD bridge, and broader end-to-end smoke work remain later Beads tasks under epic `mc2-db696`.
