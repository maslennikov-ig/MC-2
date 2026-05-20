# Orchestrator Handoff

Updated: 2026-05-20
Current working branch: `codex/career-playbook-jd-bridge`
Base branch: `develop`
Current PR: #36 - https://github.com/maslennikov-ig/MC-2/pull/36

## Current State

- This repository is a single-repo pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- `.codex/orchestrator.toml` is the machine-readable contract; `.codex/handoff.md` is current-state only; `.codex/project-index.md` is the navigation map.
- Delivery truth remains unchanged: `/push-dev` drives Dev through `develop`, `/push` is release/version flow, and `/deploy` targets staging through `master`.
- Career Playbook PR #24 through #35 and the PR #38 handoff/CI follow-up have landed in `develop`.
- PR #36 contains the `mc2-db696.9` JD to Course bridge and is being retargeted from the old stacked base to `develop`.
- No billing or payment scope is part of the Career Playbook MVP work in this branch.

## Latest Relevant Stage

- Latest relevant Career Playbook stage: `mc2-db696.9` - JD to Course bridge.
- Stage summary: [`.codex/stages/mc2-db696.9/summary.md`](./stages/mc2-db696.9/summary.md)
- Review artifacts: [`.codex/stages/mc2-db696.9/artifacts`](./stages/mc2-db696.9/artifacts)
- PR #35 generation worker completion and polling transport already landed in `develop`.
- PDF/export stage landed via PR #34, Library/share via PR #33, Viewer/editor via PR #30, and Marketing landing via PR #31.

## Next Recommended

Next stage id: `mc2-db696.11.8`
Recommended action: finish PR #36 readiness by reviewing the merged diff against `develop`, running focused backend/frontend verification plus repo gates, retargeting PR #36 to `develop`, and only then marking it ready or merging.

After PR #36 lands, continue PR #37 / Phase 11 smoke and verification work, including open live-staging and cost/load evidence tasks.

## Starter Prompt For Next Orchestrator

```text
Use $orchestrator-stage to continue Career Playbook delivery. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth. PR #24-#35 and PR #38 have landed in develop; next Beads task is mc2-db696.11.8 for PR #36 JD to Course bridge readiness. Inspect PR #36, verify the branch after merging origin/develop, retarget from the old stacked base to develop only after review and local verification, and do not add billing/payment scope.
```

## Explicit Defers

- Real Supabase RLS/staging smoke and authenticated browser e2e share/PDF/worker flow remain tracked under `mc2-db696.11` unless credentials are available.
- SSE/subscription status streaming remains deferred; PR #35 intentionally uses polling over the existing tRPC/httpBatchLink transport.
- Pre-course user upload in the JD bridge modal remains deferred; current upload flow requires an existing course ID.
- Reusing the full Stage 1 upload service for trusted generated markdown remains deferred; the direct `file_catalog` pending-source path is documented and covered by tests for MVP.
