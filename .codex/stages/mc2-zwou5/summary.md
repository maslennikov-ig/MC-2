---
stage_id: mc2-zwou5
task_id: mc2-zwou5
status: in_progress
branch: codex/fix-career-playbook-dev-visibility
delivery_method: local-feature-branch
---

# Stage Summary

Investigated the Dev Career Playbook library fallback and added the missing
owner-only visibility control to the production reader.

## Root Cause

- Dev Supabase schema has `public.career_playbooks.is_public` but does not have
  `public.career_playbooks.visibility`.
- The existing migration
  `packages/course-gen-platform/supabase/migrations/20260605150000_career_playbook_visibility.sql`
  was not present in the remote migration list.
- The deployed frontend/backend expects `visibility`, so library loading falls
  back to "temporarily unavailable" until the remote migration is applied.

## Local Code Changes

- Added a visibility dropdown to the Career Playbook reader right inspector for
  owners only.
- Reused the same values and Russian labels as course/library visibility:
  `private`, `organization`, `public`.
- Kept non-owner readers clean: no right management inspector, edit controls,
  visibility controls, course creation, delete, or public-link management.
- Added unit coverage for the viewer component and page client visibility
  mutation flow.

## Verification

- `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx`
- `pnpm --filter @megacampus/web exec eslint app/[locale]/career-playbook/[id]/page-client.tsx components/career-playbook/viewer/PlaybookViewer.tsx tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx`
- `pnpm --filter @megacampus/web exec prettier --check app/[locale]/career-playbook/[id]/page-client.tsx components/career-playbook/viewer/PlaybookViewer.tsx tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx`
- `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx tests/unit/components/career-playbook/library-page-client.test.tsx`
- `pnpm type-check`
- `pnpm build`

All local gates passed. Build emitted existing Browserslist and Node
`url.parse()` deprecation warnings only.

## Blocker

Remote Dev repair requires applying
`20260605150000_career_playbook_visibility.sql` to the Supabase project. This is
an external DDL/database mutation and is intentionally not applied without
explicit confirmation.

## Closeout

- docs-reviewed: updated - handoff and this stage summary record the root cause,
  local fix, verification, and required migration.
- graph-reviewed: updated - ran `graphify update .` and
  `graphify cluster-only . --no-viz` after the reader visibility-control change.
