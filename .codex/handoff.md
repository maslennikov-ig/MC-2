# Orchestrator Handoff

Updated: 2026-05-14
Current working branch: `feature/career-playbook-landing`
Base branch: `feature/career-playbook-frontend-phase-b` stacked on PR #29

## Current state

- Repo shape: single pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- Delivery truth: `develop` is dev delivery, `master` is staging, and direct pushes to protected branches remain forbidden.
- Career Playbook PR stack is still open: #24 base orchestration, #25 Phase 1, #26 backend stage, #27 backend stage 3, #28 Phase A frontend, #29 Phase B frontend, #30 viewer/editor frontend.
- Phase 7 `mc2-db696.7` is implemented and verified on this branch: public marketing landing, methodology cards, 26-block map, annotated interactive B2B sales demo, localized SEO metadata, absolute-URL JSON-LD, RU/EN copy, unit tests, Playwright smoke, and production build.
- No billing or payment scope is part of Career Playbook MVP work.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.7` - Marketing landing plus methodology and interactive demo.
- Stage summary: [`.codex/stages/mc2-db696.7/summary.md`](./stages/mc2-db696.7/summary.md)
- Artifact: [`.codex/stages/mc2-db696.7/artifacts/landing.md`](./stages/mc2-db696.7/artifacts/landing.md)

## Next recommended

Next stage id: `mc2-db696.8`
Recommended action: after closing and pushing Phase 7, continue with the next Beads-ready phase only after an explicit base-branch decision for the still-open PR stack.

- If PR #24/#25/#26/#27/#28/#29 land first, rebase/retarget before more dependent frontend work.
- Backend/PDF/library/share tasks may proceed separately only with an explicit stacked base branch decision.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth, verify PR #24/#25/#26/#27/#28/#29/#30 status, and avoid dependent work on develop unless the stacked PRs have merged.
```

## Explicit defers

- Real backend tRPC/SSE follow-up generation and Role Guide generation transport remains tracked as `mc2-db696.12`.
- Real viewer/editor/generation-status backend transport is tracked separately as `mc2-ekaup` on the viewer/editor stack.
- PDF export remains tracked as `mc2-db696.8`.
- JD/course bridge remains tracked as `mc2-db696.9`.
- Library/share/RLS/public viewer remains tracked as `mc2-db696.10`.
