# Orchestrator Handoff

Updated: 2026-05-20
Current working branch: `codex/pr31-landing-develop`
Current PR: #31 `feature/career-playbook-landing` -> `develop`

## Current state

- This repository is a single-repo pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- `.codex/orchestrator.toml` is the machine-readable contract; `.codex/handoff.md` is current-state only; `.codex/project-index.md` is the navigation map.
- Delivery truth remains unchanged: `/push-dev` drives Dev through `develop`, `/push` is release/version flow, and `/deploy` targets staging through `master`.
- Career Playbook PR #24, PR #25, PR #26, PR #27, PR #28, PR #29, PR #30, and PR #32 have landed in `develop`.
- Career Playbook marketing landing is being retargeted to `develop` as PR #31.
- No billing or payment scope is part of the Career Playbook MVP work in this branch.

## Latest relevant stage

- Latest relevant Career Playbook landing stage: `mc2-db696.7` - Marketing landing plus methodology and interactive demo.
- Landing stage summary: [`.codex/stages/mc2-db696.7/summary.md`](./stages/mc2-db696.7/summary.md)
- Landing artifact: [`.codex/stages/mc2-db696.7/artifacts/landing.md`](./stages/mc2-db696.7/artifacts/landing.md)
- Transport stage already landed: `mc2-db696.12` - Phase B real follow-up/generation-start transport.
- Viewer/editor stage already landed: `mc2-db696.6` via PR #30.

## Next recommended

Next stage id: `mc2-db696.11.7.7`
Recommended action: complete PR #31 readiness against `develop`, with public copy that reflects the delivered MVP and does not promise unavailable full PDF/share/course reuse flows.

- PR #31 adds public marketing landing, methodology cards, 26-block map, annotated demo, localized SEO metadata, JSON-LD, RU/EN copy, unit tests, Playwright smoke, and production build evidence.
- PR #31 should preserve PR #30 viewer/editor and PR #32 transport behavior while retargeting to `develop`.
- PR #31 does not close PDF export, persisted public share links, JD bridge, or full course reuse automation.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook PR-stack readiness. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth. PR #24-#30 and #32 have landed in develop; continue PR #31 readiness and do not merge until public landing copy is honest about delivered MVP scope and CI is green.
```

## Explicit defers

- Queue worker completion and live SSE/subscription status streaming remain separate Career Playbook integration work tracked after `mc2-db696.12`.
- PDF export remains tracked as `mc2-db696.8`.
- JD/course bridge remains tracked as `mc2-db696.9`.
- Real persisted library/share/RLS/public viewer transport beyond PR #30 frontend fallback remains tracked by later Beads tasks.
