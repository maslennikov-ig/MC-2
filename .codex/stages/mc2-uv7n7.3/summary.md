# Stage Summary: mc2-uv7n7.3

Updated: 2026-06-05
Branch: `codex/production-reader-shell`
Beads: `mc2-uv7n7.3`

## Scope

- Implemented the approved `Документ руководителя` reader shell in production Career Playbook viewer.
- Added independent left/right panel icon controls, URL state sync, hash preservation, and clean reading mode.
- Adapted the course lesson viewer to use the same document-reader surface with a right lesson inspector.
- Kept production API/shared contracts unchanged.

## Changed Areas

- Career Playbook production route and viewer:
  - `packages/web/app/[locale]/career-playbook/[id]/page-client.tsx`
  - `packages/web/components/career-playbook/viewer/PlaybookViewer.tsx`
- Course viewer:
  - `packages/web/components/course/course-viewer-enhanced.tsx`
  - `packages/web/components/course/viewer/components/Toolbar.tsx`
  - `packages/web/components/common/lesson-content.tsx`
- Shared UI:
  - `packages/web/components/common/panel-icon-button.tsx`
- Locale copy:
  - `packages/web/messages/{ru,en}/career-playbook.json`
  - `packages/web/messages/{ru,en}/course.json`
- Tests:
  - `packages/web/tests/unit/components/career-playbook/viewer.test.tsx`
  - `packages/web/tests/unit/components/career-playbook/viewer-page-client.test.tsx`
  - `packages/web/components/course/viewer/__tests__/Toolbar.test.tsx`

## Verification

- Targeted Vitest passed: 3 files, 9 tests.
- Targeted Prettier check passed.
- Targeted ESLint passed.
- `pnpm type-check` passed.
- `pnpm build` passed.
- Browser smoke passed on the approved reader mock at widths 320, 375, 414, 768, 1440.
- Graphify refreshed: `graphify update .` and `graphify cluster-only . --no-viz`.

## Review

- Visible read-only `correctness_reviewer` agent `Ledger` reported four P2 findings; fixed before final verification.
- Visible read-only `improvement_reviewer` agent `Craft` reported UX improvements; addressed the high-value issues in scope.

## Closeout Markers

- docs-reviewed: updated
- graph-reviewed: updated
- Explicit defers: no live dev merge or deploy performed; production browser smoke for authenticated `/career-playbook/[id]` deferred because it requires a real playbook session.
