# Stage Summary: mc2-db696.51

## Scope

- Implemented canonical public URLs for Career Playbook documents:
  `/[locale]/career-playbooks/[orgSlug]/[playbookSlug]`.
- Kept authenticated owner/editor URLs unchanged:
  `/[locale]/career-playbook/[id]`.
- Kept legacy `/[locale]/share/career-playbook/[slug]` route without redirect, per user direction.
- Updated backend responses to expose `organizationSlug` for library/detail/public share consumers.
- Updated public slug generation to readable `position_title` slug plus 6-character hex suffix; legacy `cp-...` slugs regenerate when visibility is changed to public through the service.
- Updated library card and reader inspector share controls to open/copy the canonical URL.

## Verification

- Passed: `pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/career-playbook-library-service.test.ts`.
- Passed: `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/viewer-page-client.test.tsx tests/unit/components/career-playbook/library-page-client.test.tsx tests/unit/components/career-playbook/share-page.test.tsx`.
- Passed: targeted `pnpm exec prettier --check ...` for changed files.
- Passed: targeted backend/web ESLint for changed files. Warning observed: existing `max-lines` warning in `packages/course-gen-platform/src/server/routers/career-playbook/library-service.ts`.
- Passed: `pnpm type-check`.
- Passed: `pnpm build`.

## Documentation

- docs-reviewed: updated - `.codex/handoff.md`, `.codex/project-index.md`, and this stage summary record the new canonical public route and URL behavior.
- Stable product docs: no-change-needed - this is an implementation-level route/share-control correction; durable navigation is captured in `.codex/project-index.md`.

## Knowledge Graph

- graph-reviewed: updated - ran `graphify update .` and `graphify cluster-only . --no-viz`; report shows 57328 nodes and 79493 edges.

## Delivery Notes

- Beads task: `mc2-db696.51`.
- Branch: `codex/career-playbook-canonical-public-url`.
- Other active worktree left untouched: `/home/me/code/mc2-worktrees/career-playbook-business-context`.

## Explicit Defers

- No redirect from legacy `/share/career-playbook/[slug]` to canonical URL, per user direction.
- Existing already-public test rows with legacy `cp-...` slugs are not migrated; republish through visibility update to generate readable slugs.
- Browser smoke against live dev is deferred until after deploy.
