# Orchestrator Handoff

Updated: 2026-05-20
Current working branch: `codex/career-playbook-generation-status`
Current PR: #35 `codex/career-playbook-generation-status` -> `develop`

## Current State

- This repository is a single-repo pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- `.codex/orchestrator.toml` is the machine-readable contract; `.codex/handoff.md` is current-state only; `.codex/project-index.md` is the navigation map.
- Delivery truth remains unchanged: `/push-dev` drives Dev through `develop`, `/push` is release/version flow, and `/deploy` targets staging through `master`.
- Career Playbook PR #24, #25, #26, #27, #28, #29, #30, #31, #32, #33, and #34 have landed in `develop`.
- PR #35 adds Career Playbook worker completion persistence plus polling generation-status transport on top of the already landed viewer, landing, library/share, and PDF export work.
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

Next stage id: `mc2-db696.11.7.7.9`
Recommended action: finish PR #35 readiness against `develop`, preserving landed PDF/viewer/landing/library-share behavior while adding protected generation status transport. Do not add billing/payment scope; merge only after review fixes, local verification, and acceptable GitHub CI/no-check status.

After PR #35 lands, continue the dependent stack: PR #36 JD/course bridge, then PR #37 E2E smoke.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook PR-stack readiness. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth. PR #24-#34 have landed in develop; continue PR #35 generation status transport readiness against develop, verify worker completion/polling status behavior, and do not merge until CI is green or explicitly absent with local verification.
```

## Explicit defers

- Real Supabase RLS/staging smoke and authenticated browser e2e share/PDF/worker flow remain tracked under `mc2-db696.11` unless credentials are available.
- SSE/subscription status streaming remains deferred; PR #35 intentionally uses polling over the existing tRPC/httpBatchLink transport.
- JD/course bridge remains tracked as `mc2-db696.9` and PR #36.
