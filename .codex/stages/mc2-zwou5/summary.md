---
stage_id: mc2-zwou5
task_id: mc2-zwou5
status: closed
branch: codex/fix-career-playbook-dev-visibility
delivery_method: feature-branch-plus-dev-db-migration
---

# Stage Summary

Investigated and repaired the Dev Career Playbook library fallback, then added
the missing owner-only visibility control to the production reader.

## Root Cause

- Dev Supabase schema initially had `public.career_playbooks.is_public` but did
  not have `public.career_playbooks.visibility`.
- The existing migration
  `packages/course-gen-platform/supabase/migrations/20260605150000_career_playbook_visibility.sql`
  was not present in the remote migration list.
- The deployed frontend/backend expected `visibility`, so library loading fell
  back to "temporarily unavailable" before the remote migration was applied.

## Local Code Changes

- Added a visibility dropdown to the Career Playbook reader right inspector for
  owners only.
- Reused the same values and Russian labels as course/library visibility:
  `private`, `organization`, `public`.
- Kept non-owner readers clean: no right management inspector, edit controls,
  visibility controls, course creation, delete, or public-link management.
- Added unit coverage for the viewer component and page client visibility
  mutation flow.
- Added follow-up migration
  `20260605183000_fix_career_playbook_visibility_advisors.sql` to set the
  visibility sync function `search_path` and add an index for
  `career_playbook_sources.user_id`.

## Dev Database Repair

- Applied prerequisite migration
  `20260603110000_add_career_playbook_sources`.
- Applied prerequisite migration
  `20260603123000_cascade_career_playbook_source_file_catalog`.
- Applied visibility migration `20260605150000_career_playbook_visibility`.
- Applied advisor follow-up migration
  `20260605183000_fix_career_playbook_visibility_advisors`.
- Verified `career_playbooks.visibility` exists as `course_visibility NOT NULL`
  with default `'private'::course_visibility`.
- Verified existing rows backfilled to `visibility='private'` and
  `is_public=false`.
- Verified visibility sync trigger, owner-only source read policy, function
  `search_path`, and `idx_career_playbook_sources_user`.
- Dev health endpoint returned HTTP 200 with `{"status":"ok"}`.

## Verification

- `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx`
- `pnpm --filter @megacampus/web exec eslint app/[locale]/career-playbook/[id]/page-client.tsx components/career-playbook/viewer/PlaybookViewer.tsx tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx`
- `pnpm --filter @megacampus/web exec prettier --check app/[locale]/career-playbook/[id]/page-client.tsx components/career-playbook/viewer/PlaybookViewer.tsx tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx`
- `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx tests/unit/components/career-playbook/library-page-client.test.tsx`
- `pnpm type-check`
- `pnpm build`

All local gates passed. Build emitted existing Browserslist and Node
`url.parse()` deprecation warnings only.

## Remaining Notes

- Authenticated browser smoke of the library page remains unverified in this
  process because no authenticated browser session was available to the CLI.
- Supabase advisors still report pre-existing project-wide warnings unrelated to
  this DDL. The new in-scope advisor findings from this migration were fixed.
- Follow-up `mc2-mrjag` tracks remaining Career Playbook migration-list drift for
  model/config migrations that were not needed to restore the library.

## Closeout

- docs-reviewed: updated - handoff and this stage summary record the root cause,
  local fix, applied Dev migrations, verification, and remaining follow-up.
- graph-reviewed: updated - ran `graphify update .` and
  `graphify cluster-only . --no-viz` after the reader visibility-control change.
