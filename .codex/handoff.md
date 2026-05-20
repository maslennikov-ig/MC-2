# Orchestrator Handoff

Updated: 2026-05-20
Current working branch: `codex/pr34-pdf-develop`
Current PR: #34 `feature/career-playbook-pdf` -> `develop`

## Current state

- This repository is a single-repo pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- `.codex/orchestrator.toml` is the machine-readable contract; `.codex/handoff.md` is current-state only; `.codex/project-index.md` is the navigation map.
- Delivery truth remains unchanged: `/push-dev` drives Dev through `develop`, `/push` is release/version flow, and `/deploy` targets staging through `master`.
- Career Playbook PR #24, #25, #26, #27, #28, #29, #30, #31, #32, and #33 have landed in `develop`.
- Career Playbook PDF export work from PR #34 is being retargeted to `develop`.
- `mc2-db696.8` adds backend PDF service, Mermaid inline SVG rendering, protected `careerPlaybook.exportPdf`, Docker Chromium runtime, PDF smoke verification, and TOKEN-backed Career Playbook wizard E2E.
- No billing or payment scope is part of the Career Playbook MVP work in this branch.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.8` - PDF export.
- Stage summary: [`.codex/stages/mc2-db696.8/summary.md`](./stages/mc2-db696.8/summary.md)
- Review summary: [`.codex/stages/mc2-db696.14/summary.md`](./stages/mc2-db696.14/summary.md)
- Auth E2E summary: [`.codex/stages/mc2-db696.15/summary.md`](./stages/mc2-db696.15/summary.md)
- Transport stage already landed: `mc2-db696.12` - Phase B real follow-up/generation-start transport.
- Viewer/editor stage already landed: `mc2-db696.6` via PR #30.
- Marketing landing stage already landed: `mc2-db696.7` via PR #31.
- Library/share stage already landed: `mc2-db696.10` via PR #33.

## Next recommended

Next stage id: `mc2-db696.11.7.7.8`
Recommended action: finish PR #34 readiness against `develop`, preserving landed Phase B/viewer/landing/library-share behavior while adding protected PDF export. Do not add billing/payment or broaden public share exposure; merge only after review fixes, local verification, and acceptable GitHub CI/no-check status.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook PR-stack readiness. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth. PR #24-#33 have landed in develop; continue PR #34 PDF export readiness against develop, verify Playwright PDF/runtime behavior, and do not merge until CI is green or explicitly absent with local verification.
```

## Explicit defers

- Real Supabase RLS/staging smoke and authenticated browser e2e share/PDF flow remain tracked under `mc2-db696.11` unless credentials are available.
- JD/course bridge remains tracked as `mc2-db696.9` and PR #36.
- Queue worker completion and live SSE/subscription status streaming remain separate Career Playbook integration work tracked after `mc2-db696.12`.
