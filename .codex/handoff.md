# Orchestrator Handoff

Updated: 2026-05-20
Current working branch: `codex/pr30-viewer-editor-develop`
Current PR: #30 `feature/career-playbook-viewer-editor` -> `develop`

## Current state

- This repository is a single-repo pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- `.codex/orchestrator.toml` is the machine-readable contract; `.codex/handoff.md` is current-state only; `.codex/project-index.md` is the navigation map.
- Delivery truth remains unchanged: `/push-dev` drives Dev through `develop`, `/push` is release/version flow, and `/deploy` targets staging through `master`.
- Career Playbook PR #24, PR #25, PR #26, PR #27, PR #28, PR #29, and PR #32 have landed in `develop`.
- Career Playbook viewer/editor frontend is being retargeted to `develop` as PR #30.
- No billing or payment scope is part of the Career Playbook MVP work in this branch.

## Latest relevant stage

- Latest relevant Career Playbook viewer stage: `mc2-db696.6` - Frontend viewer plus block editor/regenerate/actions bar.
- Viewer stage summary: [`.codex/stages/mc2-db696.6/summary.md`](./stages/mc2-db696.6/summary.md)
- Viewer artifact: [`.codex/stages/mc2-db696.6/artifacts/viewer-editor.md`](./stages/mc2-db696.6/artifacts/viewer-editor.md)
- Transport stage already landed: `mc2-db696.12` - Phase B real follow-up/generation-start transport.

## Next recommended

Next stage id: `mc2-db696.11.7.7`
Recommended action: complete PR #30 readiness against `develop`, preserving both PR #32 transport methods and PR #30 viewer/library methods; then advance PR #31 landing with copy review.

- PR #30 adds authenticated viewer/editor frontend and local fallback behavior for backend-pending library actions.
- Preserve `requestFollowups` and `approveAndGenerate` from PR #32 when resolving store conflicts.
- PR #30 does not close full queue worker completion, live SSE/subscription status streaming, PDF, share, or JD bridge.
- PR #31 public landing still needs copy review before release so it does not promise unavailable generation/edit/share/course reuse flows.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook PR-stack readiness. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth. PR #24-#29 and #32 have landed in develop; continue sequentially from PR #30 and do not advance downstream PRs until their base PR has landed.
```

## Explicit defers

- Queue worker completion and live SSE/subscription status streaming remain separate Career Playbook integration work tracked after `mc2-db696.12`.
- Real persisted library/share/RLS/public viewer transport beyond PR #30 frontend fallback remains tracked by later Beads tasks.
- Marketing, PDF, JD bridge, and end-to-end smoke work remain later Beads tasks under epic `mc2-db696`.
