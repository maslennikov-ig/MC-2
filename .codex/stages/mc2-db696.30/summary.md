---
stage_id: mc2-db696.30
task_id: mc2-db696.30
branch: codex/career-playbook-ui-polish
base_branch: develop
status: local_verified
---

# Shared Header Standardization Audit

## Scope

- Audit app/page headers after the Career Playbook UI polish branch.
- Standardize primary user surfaces on the shared `Header` without replacing specialized document/admin subnavigation.
- Keep the “Создать описание роли” action visible and purple-system aligned where appropriate.
- Verify mobile header behavior before push and deploy.

## Changes

- Added reusable `sticky` and `glass` options to shared `Header`.
- Replaced profile and courses local top headers with shared `Header` variants.
- Added shared `Header` to Career Playbook constructor, library, viewer, and auth-required states.
- Kept local Career Playbook document/workbench headers as page context, below the shared app header.
- Added the role-description quick action to admin header and localized admin quick-action labels through `common.nav`.
- Reduced mobile overflow risk by using the icon logo on mobile and narrower signed-out auth controls.

## Verification

- `pnpm --filter @megacampus/web exec vitest run tests/unit/components/layouts/header.test.tsx tests/unit/components/career-playbook/page-client.test.tsx tests/unit/components/career-playbook/library-page-client.test.tsx tests/unit/components/career-playbook/viewer-page-client.test.tsx` passed: 25 tests.
- `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook tests/unit/components/layouts/header.test.tsx` passed: 82 tests.
- `pnpm --filter @megacampus/web lint` passed with 7 existing warnings outside this scope.
- `pnpm type-check` passed.
- `PLAYWRIGHT_PORT=3194 pnpm --filter @megacampus/web test:e2e:career-playbook` passed 3 and skipped 2 authenticated tests because `TOKEN` is unset.
- `pnpm build` passed with existing Browserslist and `url.parse()` warnings.
- Playwright screenshots/overflow checks passed on `/career-playbook/new`, `/career-playbook/library`, `/courses`, and `/profile` at 390px and 1440px.
- Code review report `docs/reports/code-reviews/2026-05/CR-2026-05-23-header-standardization-audit.md` recorded PASS with no blocking findings.

## Delivery

- Pending: commit, push branch, update PR #48, merge via normal flow, then deploy to Dev as requested.
