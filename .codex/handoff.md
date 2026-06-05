# Orchestrator Handoff

Updated: 2026-06-05
Stage: `mc2-zwou5`
Branch: `codex/fix-career-playbook-dev-visibility`

## Current State

- Career Playbook visibility and owner-only access shipped to dev and staging/master.
- `career_playbooks.visibility` is canonical: `private | organization | public`; `is_public` remains a synchronized public-link compatibility mirror.
- Library/viewer responses include `visibility`, `ownerId`, and `viewerPermissions`; organization readers get read-only cards and reader UI without edit/management layers.
- Legacy `careerPlaybook.share.shareToggle` remains a compatibility wrapper over canonical visibility.
- Dev currently reports the Career Playbook library as temporarily unavailable because the remote Supabase project still lacks `public.career_playbooks.visibility`; local inspection found `is_public` present and `visibility` absent, and the migration `packages/course-gen-platform/supabase/migrations/20260605150000_career_playbook_visibility.sql` is not present in the remote migration list.
- Local branch `codex/fix-career-playbook-dev-visibility` adds the owner-only visibility dropdown to the production Career Playbook reader right inspector, matching the existing library-card/course visibility pattern. Non-owners still receive the clean read-only reader without edit/manage controls.
- Feature branch `codex/career-playbook-visibility-owner` remains pushed with implementation commit `c22caf99` and CI test hotfix `8813cfb6`.
- Follow-up `mc2-k2qih` remains open for panel animation, active TOC section, and TOC auto-scroll polish.

## Verification

- Local branch verification for `mc2-zwou5`:
  - `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx`
  - `pnpm --filter @megacampus/web exec eslint app/[locale]/career-playbook/[id]/page-client.tsx components/career-playbook/viewer/PlaybookViewer.tsx tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx`
  - `pnpm --filter @megacampus/web exec prettier --check app/[locale]/career-playbook/[id]/page-client.tsx components/career-playbook/viewer/PlaybookViewer.tsx tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx`
  - `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx tests/unit/components/career-playbook/library-page-client.test.tsx`
  - `pnpm type-check`
  - `pnpm build`
- Supabase schema check confirmed `career_playbooks.visibility` is missing on the remote project and `career_playbooks.is_public` is present.
- Local deploy script passed `pnpm type-check` and `pnpm build` before merging `develop` into `master`.
- Dev delivery: `develop` `367e4c77`, GitHub Actions run `27028026312` completed success; `https://dev.ai.megacampus.ru/api/health` returned `200` with `{"status":"ok"}`.
- Staging delivery: `master` `9893ea29`, GitHub Actions run `27029012143` completed success; `https://ai.megacampus.ru/api/health` returned `200` with `{"status":"ok"}`.
- First dev run `27027456907` failed full backend unit tests because an older router transport test missed the new `.or()` query builder and visibility payload expectations; fixed in `8813cfb6` and rerun passed.
- Master `Integration Tests` job failed non-blocking while the overall workflow and `Deploy to Production` succeeded; this matches tracked follow-up `mc2-yyxzc`.

## Next recommended

Next stage id: `mc2-k2qih`.
Recommended action: polish Career Playbook reader panel animation and TOC sync.
Operational unblock: apply the existing Supabase migration `20260605150000_career_playbook_visibility.sql` to the Dev project after explicit confirmation, then rerun the read-only schema check and Dev library smoke.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, Beads task `mc2-zwou5`, stage summary `.codex/stages/mc2-zwou5/summary.md`, and Graphify report. Do not touch the separate worktree `/home/me/code/mc2-worktrees/career-playbook-business-context` unless the user explicitly asks.

## Delivery

- docs-reviewed: updated - handoff and stage summary record the Dev library root cause, local reader visibility-control fix, verification, and the external migration blocker.
- graph-reviewed: updated - ran `graphify update .` and `graphify cluster-only . --no-viz` after the reader visibility-control change.

## Explicit defers

- Applying the Supabase migration to the remote Dev project is deferred until explicit confirmation because it is an external DDL/database mutation.
- Browser smoke for owner/non-owner authenticated Career Playbook records remains deferred until suitable test data/session is available.
- Non-blocking master Integration Tests failure remains tracked in Beads task `mc2-yyxzc`.
