# Stage mc2-db696.89 - Career Playbook private share flow

Beads: `mc2-db696.89`
Status: implementation verified locally; Beads closed; not committed or pushed because this worktree already contains unrelated prior-stage changes.

## Scope

- Changed the private/organization Career Playbook `Поделиться` flow to open a confirmation instead of ending with an unavailable message.
- On confirmation, reused `updateCareerPlaybookVisibility(..., 'public', locale)`, hydrated the viewer snapshot to `public`, built the public URL, copied it automatically, and showed the link inline.
- Added a compact inline public-link block in `ActionsBar` with a read-only URL field, `Скопировать` button, and short status message.
- Kept the manual visibility dropdown unchanged and added permission messaging for users who cannot publish.
- Added RU/EN i18n keys and unit coverage for cancel, publish success, repeated copy, and missing `shareSlug`.

## Verification

- RED reproduced:
  - `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/viewer-page-client.test.tsx`
- GREEN:
  - `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx`
  - `pnpm type-check`
  - `pnpm build`
  - `git diff --check`

## Closeout Markers

project-index: reviewed-no-change - the stage changed existing Career Playbook viewer behavior and tests without adding routes, packages, migrations, integrations, or ownership boundaries.
docs-reviewed: no-change-needed - user-facing behavior is covered by i18n strings and tests; no README, operator doc, API contract, schema, or deployment instruction changed.
graph-reviewed: blocked - Graphify was used for focused routing before implementation, but refresh was not safe because the primary worktree already contains unrelated prior-stage backend/store changes; refreshing would mix scopes.
