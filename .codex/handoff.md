# Orchestrator Handoff

Updated: 2026-05-20
Current working branch: `codex/pr33-library-share-develop`
Current PR: #33 `feature/career-playbook-library-share` -> `develop`

## Current state

- This repository is a single-repo pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- `.codex/orchestrator.toml` is the machine-readable contract; `.codex/handoff.md` is current-state only; `.codex/project-index.md` is the navigation map.
- Delivery truth remains unchanged: `/push-dev` drives Dev through `develop`, `/push` is release/version flow, and `/deploy` targets staging through `master`.
- Career Playbook PR #24, #25, #26, #27, #28, #29, #30, #31, and #32 have landed in `develop`.
- Career Playbook library/share work from PR #33 is being retargeted to `develop`.
- No billing or payment scope is part of the Career Playbook MVP work in this branch.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.10` - Library + share + RLS + public viewer.
- Stage summary: [`.codex/stages/mc2-db696.10/summary.md`](./stages/mc2-db696.10/summary.md)
- Transport stage already landed: `mc2-db696.12` - Phase B real follow-up/generation-start transport.
- Viewer/editor stage already landed: `mc2-db696.6` via PR #30.
- Marketing landing stage already landed: `mc2-db696.7` via PR #31.

## Next recommended

Next stage id: `mc2-db696.11.7.7.7`
Recommended action: complete PR #33 readiness against `develop`, verify library/share/public viewer behavior and RLS assumptions, then continue the stacked PDF PR after PR #33 lands.

- PR #33 should preserve landed Phase B transport, viewer/editor, and marketing landing behavior while adding personal library, share controls, and public read-only share viewer.
- PR #33 must not promise unavailable PDF export, course reuse automation, billing, or payment features.
- Retarget PR #33 to `develop`, mark ready only after local verification and review fixes pass, and merge only after GitHub CI is green.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook PR-stack readiness. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth. PR #24-#32 have landed in develop; continue PR #33 library/share readiness against develop, verify public share/RLS behavior, and do not merge until CI is green.
```

## Explicit defers

- Real Supabase RLS/staging smoke and authenticated browser e2e share flow remain tracked under `mc2-db696.11` unless credentials are available in the current environment.
- PDF export remains tracked as `mc2-db696.8` and PR #34.
- JD/course bridge remains tracked as `mc2-db696.9` and PR #36.
- Queue worker completion and live SSE/subscription status streaming remain separate Career Playbook integration work tracked after `mc2-db696.12`.
