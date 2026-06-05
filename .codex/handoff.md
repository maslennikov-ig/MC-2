# Orchestrator Handoff

Updated: 2026-06-05
Stage: `mc2-uv7n7.3`
Branch: `codex/production-reader-shell`

## Current State

- `mc2-uv7n7.3` moves the approved `Документ руководителя` reader concept from mock into production Career Playbook viewer.
- Production `/[locale]/career-playbook/[id]` now uses an executive document shell with document paper, left contents rail, right inspector, independent panel icon controls, URL sync, and clean reading mode.
- Reader URL state now includes `toc=open|closed`, `panel=open|closed`, and `mode=standard|reading`; hash anchors are preserved during panel/mode changes.
- Reading mode hides side panels and per-block edit/regenerate/collapse controls while keeping a semantic document `h1`.
- Course lesson viewer now uses the same document surface: left course sidebar remains, the center lesson is a document paper, and a right lesson inspector is available on `xl+`.
- Shared `PanelIconButton` provides Lucide panel icon buttons with labels, titles, and optional `aria-expanded`.

## Verification

- Targeted Vitest passed: `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx components/course/viewer/__tests__/Toolbar.test.tsx` (9 tests).
- Targeted Prettier check passed for changed web files.
- Targeted ESLint passed for changed web files.
- `pnpm type-check` passed.
- `pnpm build` passed; only existing Browserslist and `url.parse()` warnings appeared.
- Browser smoke passed on `http://127.0.0.1:3117/mocks/career-playbook-reader-variants` for 320/375/414/768/1440: no horizontal overflow, right panel toggle works, reading mode works.
- Visible read-only reviewer agents `Ledger` and `Craft` reviewed correctness and UX; P2 findings were addressed before final verification.

## Next recommended

Next stage id: pick the next ready Beads task.
Recommended action: merge/push this feature branch through the normal dev delivery flow if accepted; no deploy has been performed in this stage.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, Beads, Graphify report, and `git status`. If continuing this work, inspect branch `codex/production-reader-shell`, Beads task `mc2-uv7n7.3`, and the production viewer/course viewer files listed in `.codex/project-index.md`.

## Delivery

- Local branch: `codex/production-reader-shell`; commit and push this feature branch only.
- docs-reviewed: updated - handoff, project index, and stage summary now describe the production reader shell and course viewer adaptation.
- graph-reviewed: updated - Graphify local graph refreshed with `graphify update .` and `graphify cluster-only . --no-viz`; focused queries locate `PlaybookViewer`, `DocumentPaper`, `CourseViewerEnhanced`, `CourseReaderInspector`, and `Toolbar`.

## Explicit defers

- No live dev merge, staging deploy, or production deploy was performed in this stage.
- Production browser smoke for `/career-playbook/[id]` was not run because it depends on a real authenticated playbook record; production components are covered by unit tests, type-check, and build.
