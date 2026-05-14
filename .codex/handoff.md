# Orchestrator Handoff

Updated: 2026-05-14
Current working branch: `feature/career-playbook-viewer-editor`
Base branch: `feature/career-playbook-frontend-phase-b` stacked on PR #29

## Current state

- Repo shape: single pnpm monorepo with `packages/web`, `packages/course-gen-platform`, and `packages/shared-types`.
- Delivery truth: `develop` is dev delivery, `master` is staging, and direct pushes to protected branches remain forbidden.
- Career Playbook PR stack is still open: #24 base orchestration, #25 Phase 1, #26 backend stage, #27 backend stage 3, #28 Phase A frontend, #29 Phase B frontend.
- Phase 6 `mc2-db696.6` is implemented on this branch: authenticated viewer route, 27-block viewer, block edit/regenerate sheet, actions bar, streaming view, localized viewer copy, local backend-skeleton fallback, and tests.
- No billing or payment scope is part of Career Playbook MVP work.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.6` - Frontend viewer plus block editor/regenerate/actions bar.
- Stage summary: [`.codex/stages/mc2-db696.6/summary.md`](./stages/mc2-db696.6/summary.md)
- Artifact: [`.codex/stages/mc2-db696.6/artifacts/viewer-editor.md`](./stages/mc2-db696.6/artifacts/viewer-editor.md)

## Next recommended

Next stage id: `mc2-db696.7`
Recommended action: after closing and pushing Phase 6, open a stacked draft PR targeting `feature/career-playbook-frontend-phase-b`; then re-run `bd ready` and start the next ready task only after confirming the intended base branch.

After closeout, push `feature/career-playbook-viewer-editor` and open a draft PR targeting `feature/career-playbook-frontend-phase-b`.

- If PR #24/#25/#26/#27/#28/#29 land first, rebase or retarget before more dependent frontend work.
- Next ready tasks remain backend/library/marketing/PDF/course bridge work from Beads; check `bd ready`.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth, verify PR #24/#25/#26/#27/#28/#29 status, and avoid dependent work on develop unless the stacked PRs have merged.
```

## Explicit defers

- Real viewer/editor/generation-status backend transport is tracked as `mc2-ekaup`.
- Real backend tRPC/SSE follow-up generation and Role Guide generation transport remains tracked as `mc2-db696.12`.
- PDF export remains tracked as `mc2-db696.8`.
- JD/course bridge remains tracked as `mc2-db696.9`.
- Library/share/RLS/public viewer remains tracked as `mc2-db696.10`.
