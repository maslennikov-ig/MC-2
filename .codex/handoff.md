# Orchestrator Handoff

Updated: 2026-05-26
Branch: `codex/product-ia-course-landing`
Base: `origin/develop` at `0560dc52` after final rebase.

## Current State

- Active Beads root: `mc2-db696.36` (`Product IA: two-product navigation and course landing`) is closed.
- Worktree: `/home/me/code/mc2-worktrees/product-ia-course-landing`.
- Main checkout `/home/me/code/mc2` is a separate worktree on `develop`; do not clean or overwrite it from this branch.
- This branch is rebased over the latest orchestration contract refresh from `develop` (`balanced-v2.14`).
- Context7 lookup was not needed: implementation uses existing Next.js App Router and project UI patterns, with no new framework/API behavior.
- LazyWeb references used as design direction: user-approved product-path and course-landing patterns.

## Changes In This Branch

- Header now has two product entries: `Должностные инструкции` and `Курсы`.
- Product label click opens the product landing; the adjacent menu exposes description, create, and catalog actions.
- Home `/` is a two-product gateway and recommends starting course work from a clear role.
- `/courses` is now a course landing with hero, product preview, process, feature blocks, examples, and final CTA.
- Existing course catalog moved to `/courses/library`; links, `revalidatePath`, metadata, unit tests, and relevant browser/performance/accessibility test routes were updated.
- RU/EN messages added for the product gateway, course landing, and product navigation.
- Added `docs/plans/2026-05-26-two-product-navigation-course-landing.md`; updated `.codex/project-index.md`.

## Verification

- Passed after final rebase:
  - `pnpm --filter @megacampus/web exec vitest run tests/unit/components/layouts/header.test.tsx tests/unit/components/courses/landing-page.test.tsx tests/unit/components/courses/library-page.test.tsx`
  - `pnpm --filter @megacampus/web lint`
  - `pnpm --filter @megacampus/web type-check`
  - `SUPABASE_SERVICE_ROLE_KEY=test-service-role NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon pnpm --filter @megacampus/web build`
  - `pnpm type-check`
  - `SUPABASE_SERVICE_ROLE_KEY=test-service-role NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon pnpm build`
  - Browser smoke on local production server for `/`, `/ru/courses`, `/ru/courses/library`, `/ru/career-playbook`, `/ru/career-playbook/library` at 390/1440 px in light and dark themes: 20 checks passed, main content visible, no horizontal overflow.
- Existing build warnings remain: stale Browserslist data and Node `url.parse()` deprecation warnings.

## Next Recommended

1. Push `codex/product-ia-course-landing` and open PR to `develop`.
2. After PR merge, let Dev deploy run from `develop` and verify `/api/health`.

## Explicit Defers

- No backend schema, course generation, Career Playbook generation, ESCO, or role-suggestion data changes are included in this branch.
- Broader replacement of old visible `AI` wording outside the changed navigation/course/product pages remains out of scope.
- Old local branch cleanup from `develop` remains separate; inspect unique commits before deleting unmerged branches.
