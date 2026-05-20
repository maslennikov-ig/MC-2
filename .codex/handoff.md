# Orchestrator Handoff

Updated: 2026-05-20
Current working branch: `develop`
Base branch: `develop`
Current PR: none

## Current state

- This repository is a single-repo pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- `.codex/orchestrator.toml` is the machine-readable contract; `.codex/handoff.md` is current-state only; `.codex/project-index.md` is the navigation map.
- Delivery truth remains unchanged: `/push-dev` drives Dev through `develop`, `/push` is release/version flow, and `/deploy` targets staging through `master`.
- Career Playbook PR #24 through #36 and the PR #38 handoff/CI follow-up have landed in `develop`.
- PR #36 delivered the `mc2-db696.9` JD to Course bridge from completed playbooks to course generation, including the organization-scope hardening follow-up.
- No billing or payment scope is part of the Career Playbook MVP work in this branch.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.9` - JD to Course bridge.
- Stage summary: [`.codex/stages/mc2-db696.9/summary.md`](./stages/mc2-db696.9/summary.md)
- Review artifacts: [`.codex/stages/mc2-db696.9/artifacts`](./stages/mc2-db696.9/artifacts)
- PR #36 JD bridge landed in `develop` after retargeting from the old stacked base.
- PR #35 generation worker completion and polling transport already landed in `develop`.
- PDF/export stage landed via PR #34, Library/share via PR #33, Viewer/editor via PR #30, and Marketing landing via PR #31.

## Next recommended

Next stage id: `mc2-db696.11`
Recommended action: continue PR #37 / Phase 11 smoke and verification work, including open live-staging and cost/load evidence tasks. Keep `mc2-db696.16` as the tracked P2 defer for future upload quota/dedupe reuse in the JD bridge.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook delivery. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth. PR #24-#36 and PR #38 have landed in develop; continue Phase 11 smoke and verification work under mc2-db696.11, including PR #37/live-staging evidence and the remaining cost/load tasks. Keep billing/payment out of MVP scope.
```

## Explicit defers

- Real Supabase RLS/staging smoke and authenticated browser e2e share/PDF/worker flow remain tracked under `mc2-db696.11` unless credentials are available.
- SSE/subscription status streaming remains deferred; PR #35 intentionally uses polling over the existing tRPC/httpBatchLink transport.
- Pre-course user upload in the JD bridge modal remains deferred; current upload flow requires an existing course ID.
- Reusing the full Stage 1 upload service for trusted generated markdown remains deferred; the direct `file_catalog` pending-source path is documented and covered by tests for MVP.
