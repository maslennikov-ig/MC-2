# Orchestrator Handoff

Updated: 2026-05-25
Branch: `codex/cp-landing-26-demo`
Base: `origin/develop` at `cec55643536d7af51662428b52b21e8e4ecabffa`

## Current State

- Stage `mc2-db696.33` (`Career Playbook: document-first milk design zone refresh`) was merged via PR #51 and deployed to Dev.
- Dev run: GitHub Actions `26385179954`, deploy job passed, health returned `{"status":"ok"}` on 2026-05-25.
- Follow-up bug `mc2-db696.34` fixed the Career Playbook landing interactive demo overlap/order via PR #53; Dev run `26388816456` deployed successfully and health returned `{"status":"ok"}` on 2026-05-25.
- Follow-up task `mc2-db696.35` is active on PR #55 (`codex/cp-landing-26-demo`): landing page now shows 26-block structure clearly, adds personalization marketing, smooth motion, mobile auth-button fix, and a wider document-preview hero.
- PR #55 CI run `26399971693` passed before the latest hero-width commit; rerun PR checks after pushing any new commit.
- Main checkout `/home/me/code/mc2` is a separate worktree on `codex/career-playbook-ui-mock-variants` with unrelated local orchestration changes; do not overwrite or clean it from this branch.

## Changes In This Branch

- Added milk/document light tokens while keeping primary CTA purple; dark mode remains contrast-first.
- Added shared Career Playbook document workspace/shell/preview components.
- Rebuilt constructor, follow-ups, and completion review as a document-first workflow with left navigation, central draft document, and right action/question panel.
- Applied the same document styling to library, private viewer, streaming/editor states, public share, loading/error/auth-required states, and soft landing alignment through shared tokens.
- Refined `/career-playbook` landing: first-six-block interactive demo, all-26-block modal, six methodology sources, personalized AI-assisted value section, smoother motion, mobile login decoration fix, and wider hero/section containers.
- Removed visible Career Playbook AI-cliche icons/labels and localized RU/EN viewer block/group/status/aria labels.
- Added `docs/plans/career-playbook/2026-05-25-document-first-zone-redesign.md`; updated `docs/career-playbook/README.md`.
- Tracked visible subagent reports under `.codex/stages/mc2-db696.33/artifacts/`.

## Verification

- CP unit set passed: 6 files, 53 tests.
- `pnpm --filter @megacampus/web lint` passed.
- `pnpm --filter @megacampus/web type-check` passed.
- `pnpm --filter @megacampus/web build` passed with test Supabase env and existing Browserslist/`url.parse()` warnings.
- Production-mode Playwright smoke passed for CP and non-CP routes at 390, 1440, and 1920 px: 24 checks, no 500s, no horizontal overflow.
- `pnpm type-check` passed.
- `pnpm build` passed with test Supabase env and existing Browserslist/`url.parse()` warnings.
- Dev light/dark smoke passed for `/ru/career-playbook`, `/ru/career-playbook/new`, `/ru/career-playbook/library`, and `/en/career-playbook` at 390/1440/1920 px: 200 status and no horizontal overflow.
- Dev landing demo smoke passed for `/ru/career-playbook` at 390/1440/1920 px in light and dark: demo order is block 1 -> block 5 -> block 6, no horizontal overflow, and no selector/document overlap.
- PR #55 landing verification passed locally:
  - `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/landing-page.test.tsx`
  - `pnpm --filter @megacampus/web exec vitest run tests/unit/components/common/auth-button.test.tsx tests/unit/components/layouts/header.test.tsx tests/unit/components/career-playbook/landing-page.test.tsx`
  - `pnpm --filter @megacampus/web lint`
  - `pnpm --filter @megacampus/web type-check`
  - `SUPABASE_SERVICE_ROLE_KEY=test-service-role NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon pnpm --filter @megacampus/web build`
  - Playwright smoke for `/career-playbook` at 2048x1060 and 390x827: no horizontal overflow; wide hero preview visible only on large viewport.

## Next recommended

Next stage id: `mc2-db696.35`
Recommended action: keep iterating PR #55 until landing feedback is accepted, then merge through PR delivery and let Dev deploy run from `develop`.

## Starter prompt for next orchestrator

Use $orchestrator-stage for the next Career Playbook stage in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, relevant `.codex/stages/*`, Beads ready state, and current `git status`. PR #55 is active on `codex/cp-landing-26-demo` for landing-page refinements; do not overwrite the separate local worktree on `codex/career-playbook-ui-mock-variants`.

## Explicit defers

- `mc2-db696.28`: ESCO import subset / normalized role-source pipeline remains outside this redesign.
