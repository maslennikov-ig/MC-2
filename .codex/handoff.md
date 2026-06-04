# Orchestrator Handoff

Updated: 2026-06-04
Stage: `mc2-uv7n7.2`
Branch: `codex/career-playbook-reader-variants`

## Current State

- `mc2-uv7n7.2` converted `/mocks/career-playbook-reader-variants` from the five-card gallery into `Единый ридер: Документ руководителя`.
- Scope is mock-only; production Career Playbook viewer and course viewer were not edited.
- Standard mode has left contents, central executive document, and right inspector. Icon-only Lucide buttons control `toc=open|closed` and `panel=open|closed` independently.
- `mode=reading` is the separate print-minimal reading mode; it hides side panels and mock explanatory chrome while keeping the document visible.
- URL state is `theme=light|dark`, `toc=open|closed`, `panel=open|closed`, and `mode=standard|reading`.
- Visible content stays Russian; tests guard against `Header`, `Role Guide`, `Contents`, `Mission and key results`, `Edit`, and `Regenerate`.
- Visible read-only `frontend_specialist` subagent `Pixel` reviewed the old mock; implementation stayed local because the write zone was one tightly coupled mock route and test.

## Verification

- RED observed after updating tests for left/right panel controls: targeted Vitest failed on missing `Скрыть левую панель` and missing `toc` URL state.
- Targeted Vitest passed: `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/reader-variants-page.test.tsx` (5 tests).
- Targeted ESLint and Prettier checks passed for the mock page and test.
- `pnpm type-check` passed.
- `pnpm build` passed; only existing Browserslist and `url.parse()` warnings appeared.
- Browser smoke via Playwright CDP/Windows Chrome passed at 320/375/414/768/1440: no guarded English text, no horizontal overflow, left/right panel controls and reading mode work.
- Dev server on `http://127.0.0.1:3107/mocks/career-playbook-reader-variants` must be restarted after `pnpm build` because build invalidates Turbopack dev manifests.

## Next recommended

Next stage id: pick the next ready Beads task.
Recommended action: review the selected mock; if approved, create a separate production ReaderShell Beads task for Career Playbook viewer reuse.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, Beads, Graphify report, and `git status`. If continuing this UX work, inspect `/mocks/career-playbook-reader-variants` on `codex/career-playbook-reader-variants`.

## Delivery

- Local branch: `codex/career-playbook-reader-variants`; commit and push this feature branch only.
- docs-reviewed: updated - `.codex/project-index.md` and this handoff describe the selected executive reader mock instead of the old gallery.
- graph-reviewed: updated - Graphify was used for route/course-viewer orientation and refreshed during closeout; rerun after final commit to align report freshness.

## Explicit defers

- No production Career Playbook viewer or course viewer refactor was attempted; this branch is mock-only. Track production reuse as a new Beads task if approved.
