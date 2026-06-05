# Orchestrator Handoff

Updated: 2026-06-05
Stage: `mc2-zwou5`
Branch: `codex/fix-career-playbook-dev-visibility`

## Current State

- Career Playbook visibility and owner-only access shipped to dev and staging/master.
- `career_playbooks.visibility` is canonical: `private | organization | public`; `is_public` remains a synchronized public-link compatibility mirror.
- Library/viewer responses include `visibility`, `ownerId`, and `viewerPermissions`; organization readers get read-only cards and reader UI without edit/management layers.
- Legacy `careerPlaybook.share.shareToggle` remains a compatibility wrapper over canonical visibility.
- Dev Career Playbook library DB blocker is repaired: applied `20260603110000_add_career_playbook_sources`, `20260603123000_cascade_career_playbook_source_file_catalog`, `20260605150000_career_playbook_visibility`, and `20260605183000_fix_career_playbook_visibility_advisors`; `public.career_playbooks.visibility` now exists and existing rows were backfilled to `private`.
- Local branch `codex/fix-career-playbook-dev-visibility` adds the owner-only visibility dropdown to the production Career Playbook reader right inspector, matching the existing library-card/course visibility pattern. Non-owners still receive the clean read-only reader without edit/manage controls.
- Feature branch `codex/career-playbook-visibility-owner` remains pushed with implementation commit `c22caf99` and CI test hotfix `8813cfb6`.
- Follow-up `mc2-k2qih` remains open for panel animation, active TOC section, and TOC auto-scroll polish.
- Follow-up `mc2-mrjag` tracks remaining Career Playbook migration drift for model/config migrations not required for the library visibility outage.

## Verification

- Local branch verification for `mc2-zwou5`:
  - `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx`
  - `pnpm --filter @megacampus/web exec eslint app/[locale]/career-playbook/[id]/page-client.tsx components/career-playbook/viewer/PlaybookViewer.tsx tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx`
  - `pnpm --filter @megacampus/web exec prettier --check app/[locale]/career-playbook/[id]/page-client.tsx components/career-playbook/viewer/PlaybookViewer.tsx tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx`
  - `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/viewer.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx tests/unit/components/career-playbook/library-page-client.test.tsx`
  - `pnpm type-check`
  - `pnpm build`
- Supabase schema checks now confirm `career_playbooks.visibility course_visibility NOT NULL DEFAULT 'private'::course_visibility`, visibility sync trigger, owner-only source read policy, and source user FK index.
- Dev health check after DB repair returned HTTP 200 with `{"status":"ok"}`; unauthenticated library route returned HTTP 307 redirect as expected.
- Local deploy script passed `pnpm type-check` and `pnpm build` before merging `develop` into `master`.
- Dev delivery: `develop` `367e4c77`, GitHub Actions run `27028026312` completed success; `https://dev.ai.megacampus.ru/api/health` returned `200` with `{"status":"ok"}`.
- Staging delivery: `master` `9893ea29`, GitHub Actions run `27029012143` completed success; `https://ai.megacampus.ru/api/health` returned `200` with `{"status":"ok"}`.
- First dev run `27027456907` failed full backend unit tests because an older router transport test missed the new `.or()` query builder and visibility payload expectations; fixed in `8813cfb6` and rerun passed.
- Master `Integration Tests` job failed non-blocking while the overall workflow and `Deploy to Production` succeeded; this matches tracked follow-up `mc2-yyxzc`.

## Next recommended

Next stage id: `mc2-k2qih`.
Recommended action: polish Career Playbook reader panel animation and TOC sync.
Recommended action after user browser refresh: if the authenticated Dev library still reports unavailable, inspect server logs for a second runtime error now that the missing `visibility` column is fixed.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, Beads task `mc2-zwou5`, stage summary `.codex/stages/mc2-zwou5/summary.md`, and Graphify report. Do not touch the separate worktree `/home/me/code/mc2-worktrees/career-playbook-business-context` unless the user explicitly asks.

## Delivery

- docs-reviewed: updated - handoff and stage summary record the Dev library root cause, local reader visibility-control fix, applied DB repair, verification, and remaining migration-drift follow-up.
- graph-reviewed: updated - ran `graphify update .` and `graphify cluster-only . --no-viz` after the reader visibility-control change.

## Explicit defers

- Browser smoke for owner/non-owner authenticated Career Playbook records remains deferred until suitable test data/session is available.
- Remaining model/config migration-list drift is tracked in Beads task `mc2-mrjag`.
- Non-blocking master Integration Tests failure remains tracked in Beads task `mc2-yyxzc`.
