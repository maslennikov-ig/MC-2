# Orchestrator Handoff

Updated: 2026-05-20
Current working branch: `develop`
Current PR: none for the current handoff update

## Current State

- This repository is a single-repo pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- `.codex/orchestrator.toml` is the machine-readable contract; `.codex/handoff.md` is current-state only; `.codex/project-index.md` is the navigation map.
- Delivery truth remains unchanged: `/push-dev` drives Dev through `develop`, `/push` is release/version flow, and `/deploy` targets staging through `master`.
- Career Playbook PR #24 through #35 have landed in `develop`.
- PR #35 merged on 2026-05-20 as `f79b25ff`; it added Career Playbook worker completion persistence plus polling generation-status transport on top of viewer, landing, library/share, and PDF export work.
- PR #36 is open as a draft (`codex/career-playbook-jd-bridge`) and still targets the old stacked base `codex/career-playbook-generation-status`; it should be retargeted to `develop` only after review and verification.
- No billing or payment scope is part of the Career Playbook MVP work in this branch.

## Latest Relevant Stage

- Latest relevant Career Playbook stage: `mc2-db696.13` - generation worker completion and polling status transport.
- Stage summary: [`.codex/stages/mc2-db696.13/summary.md`](./stages/mc2-db696.13/summary.md)
- Artifacts: [`.codex/stages/mc2-db696.13/artifacts`](./stages/mc2-db696.13/artifacts)
- PDF/export stage already landed: `mc2-db696.8` via PR #34.
- Library/share stage already landed: `mc2-db696.10` via PR #33.
- Viewer/editor stage already landed: `mc2-db696.6` via PR #30.
- Marketing landing stage already landed: `mc2-db696.7` via PR #31.

## Next recommended

Next stage id: `mc2-db696.11.8`
Recommended action: continue PR #36 readiness for the JD→Course bridge. Fetch latest `origin/develop`, inspect PR #36, resolve any base drift from the old stacked branch, retarget to `develop` only when the branch is reviewed and locally verified, and keep billing/payment out of MVP scope.

After PR #36 lands, continue PR #37 / Phase 11 smoke and verification work, including open live-staging and cost/load evidence tasks.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook delivery. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth. PR #24-#35 have landed in develop; next Beads task is mc2-db696.11.8 for PR #36 JD→Course bridge readiness. Inspect PR #36, retarget from the old stacked base to develop only after review and local verification, and do not add billing/payment scope.
```

## Explicit defers

- Real Supabase RLS/staging smoke and authenticated browser e2e share/PDF/worker flow remain tracked under `mc2-db696.11` unless credentials are available.
- SSE/subscription status streaming remains deferred; PR #35 intentionally uses polling over the existing tRPC/httpBatchLink transport.
- PR #36 JD/course bridge delivery readiness is tracked as `mc2-db696.11.8`; implementation task `mc2-db696.9` is closed but its draft PR is not yet landed.
