# Orchestrator Handoff

Updated: 2026-05-26
Branch: `codex/product-ia-review-fixes`
Base: `origin/develop` at `c14542db`

## Current State

- `mc2-db696.36` (`Product IA: two-product navigation and course landing`) is closed and delivered.
- PR #56 (`codex/product-ia-course-landing`) merged to `develop` at `eadb5509`.
- PR #57 docs-only handoff update merged to `develop` at `c14542db`.
- `mc2-db696.36.7` (`Review and fix product IA course landing delivery`) is closed locally on `codex/product-ia-review-fixes`.
- Dev GitHub Actions run `26446033161` completed successfully, including `Deploy to Dev`.
- Dev health check passed: `https://dev.ai.megacampus.ru/api/health` returned `{"status":"ok"}`.
- Public Dev route checks returned 200 for `/`, `/courses`, `/courses/library`, and `/career-playbook`.
- Review routing used Context7 for Next.js and `next-intl` navigation behavior.

## Delivered Changes

- Header now exposes two product entries: `Должностные инструкции` and `Курсы`.
- Product label click opens the product landing; adjacent menus expose description, create, and catalog actions.
- Home `/` is a two-product gateway and recommends starting course work from a clear role.
- `/courses` is now a course landing; the existing course catalog moved to `/courses/library`.
- Links, `revalidatePath`, metadata, tests, RU/EN messages, `.codex/project-index.md`, and `docs/plans/2026-05-26-two-product-navigation-course-landing.md` were updated.
- Review fixes on `codex/product-ia-review-fixes`:
  - course library filters and keyboard page navigation now use locale-aware `@/src/i18n/navigation` router helpers;
  - home metadata now comes from localized `common.metadata` server metadata instead of a RU-only client `document.title`/meta mutation;
  - header unit tests cover product menu create/catalog actions;
  - product dropdown content has mobile collision padding and viewport-bound width.

## Verification

- PR #56 local verification passed: focused course/header Vitest, web lint, web type-check, web build, root type-check, root build, and browser smoke for `/`, `/ru/courses`, `/ru/courses/library`, `/ru/career-playbook`, `/ru/career-playbook/library` at 390/1440 px in light and dark themes.
- Review-fix local verification on `codex/product-ia-review-fixes` passed:
  - `pnpm --filter @megacampus/web exec vitest run tests/unit/components/courses/courses-filters.test.tsx tests/unit/components/layouts/header.test.tsx tests/unit/components/courses/landing-page.test.tsx tests/unit/components/courses/library-page.test.tsx`
  - `pnpm --filter @megacampus/web lint`
  - `pnpm --filter @megacampus/web type-check`
  - `pnpm --filter @megacampus/web build`
  - `pnpm type-check`
  - `pnpm build`
  - production browser smoke on port 3211 for `/`, `/courses`, `/courses/library`, `/en/courses/library` at 390/1440 px; mobile product menu opens with viewport padding.
- PR #56 checks passed before merge.
- Develop run `26446033161` passed after merge and deployed to Dev.
- Existing build warnings remain: stale Browserslist data, Node `url.parse()` deprecation warnings, and GitHub Actions Node 20 deprecation annotations.

## Next recommended

Next stage id: `mc2-db696.28` if continuing role-suggestion data work.
Recommended action: select the next task via `bd ready`; use `mc2-db696.28` only for ESCO/role-suggestion data work.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, `.codex/project-index.md`, Beads state for `mc2-db696`, and `git status`. Current delivered state: PR #56 is merged to `develop`, Dev run `26446033161` succeeded, and Dev health is ok. Review-fix branch `codex/product-ia-review-fixes` contains locale, metadata, and header-menu test fixes for closed task `mc2-db696.36.7`; do not push directly to `develop`/`master`.

## Explicit defers

- No backend schema, course generation, Career Playbook generation, ESCO, or role-suggestion data changes were included.
- Broader replacement of old visible `AI` wording outside the changed navigation/course/product pages remains out of scope.
- Optional route constant consolidation was reviewed but not accepted for this pass; current route strings are covered by focused tests and the change would broaden the patch without fixing a regression.
- Old local branch cleanup remains separate; inspect unique commits before deleting unmerged branches.
