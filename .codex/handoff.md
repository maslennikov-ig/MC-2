# Orchestrator Handoff

Updated: 2026-05-26
Branch: `develop`
Base: `origin/develop` at `eadb5509`

## Current State

- `mc2-db696.36` (`Product IA: two-product navigation and course landing`) is closed and delivered.
- PR #56 (`codex/product-ia-course-landing`) merged to `develop` at `eadb5509`.
- Dev GitHub Actions run `26446033161` completed successfully, including `Deploy to Dev`.
- Dev health check passed: `https://dev.ai.megacampus.ru/api/health` returned `{"status":"ok"}`.
- Public Dev route checks returned 200 for `/`, `/courses`, `/courses/library`, and `/career-playbook`.
- Context7 lookup was not needed for the delivered change: implementation used existing Next.js App Router and project UI patterns.

## Delivered Changes

- Header now exposes two product entries: `Должностные инструкции` and `Курсы`.
- Product label click opens the product landing; adjacent menus expose description, create, and catalog actions.
- Home `/` is a two-product gateway and recommends starting course work from a clear role.
- `/courses` is now a course landing; the existing course catalog moved to `/courses/library`.
- Links, `revalidatePath`, metadata, tests, RU/EN messages, `.codex/project-index.md`, and `docs/plans/2026-05-26-two-product-navigation-course-landing.md` were updated.

## Verification

- Local verification passed: focused course/header Vitest, web lint, web type-check, web build, root type-check, root build, and browser smoke for `/`, `/ru/courses`, `/ru/courses/library`, `/ru/career-playbook`, `/ru/career-playbook/library` at 390/1440 px in light and dark themes.
- PR #56 checks passed before merge.
- Develop run `26446033161` passed after merge and deployed to Dev.
- Existing build warnings remain: stale Browserslist data, Node `url.parse()` deprecation warnings, and GitHub Actions Node 20 deprecation annotations.

## Next recommended

Next stage id: `mc2-db696.28` if continuing role-suggestion data work.
Recommended action: select the next task via `bd ready`; use `mc2-db696.28` only for ESCO/role-suggestion data work.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2` on `develop`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, `.codex/project-index.md`, Beads state for `mc2-db696`, and `git status`. Current delivered state: PR #56 is merged to `develop`, Dev run `26446033161` succeeded, and Dev health is ok.

## Explicit defers

- No backend schema, course generation, Career Playbook generation, ESCO, or role-suggestion data changes were included.
- Broader replacement of old visible `AI` wording outside the changed navigation/course/product pages remains out of scope.
- Old local branch cleanup remains separate; inspect unique commits before deleting unmerged branches.
