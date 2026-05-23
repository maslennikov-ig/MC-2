---
stage_id: mc2-db696.29
task_id: mc2-db696.29
branch: codex/career-playbook-ui-polish
base_branch: develop
status: pr_open
---

# Career Playbook Constructor UI Polish

## Scope

- Fix the deployed constructor state where all base answers are complete but the UI still shows question 1 and forces repeated clicking.
- Improve readability and alignment in the fixed-question workbench.
- Remove the heavy local constructor header treatment and make the title the main signal.
- Start header standardization by reusing the shared `Header` on `/create` and `/courses`, and by moving the role-description header action to the purple primary visual family.

## Notes

- LazyWeb references remain the same direction as `mc2-db696.27`: compact workspace, useful side rail, and clear review state.
- No external role taxonomy change is included here; ESCO remains tracked by `mc2-db696.28`.
- No Context7 lookup was needed because no library/API behavior changed.

## Verification

- `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/wizard.test.tsx tests/unit/components/career-playbook/page-client.test.tsx tests/unit/components/layouts/header.test.tsx` passed: 37 tests.
- `pnpm --filter @megacampus/web lint` passed with 7 existing warnings outside this scope.
- `pnpm type-check` passed.
- `git diff --check` passed.
- `PLAYWRIGHT_PORT=3192 pnpm --filter @megacampus/web test:e2e:career-playbook` passed 3 and skipped 2 authenticated tests because `TOKEN` is unset.
- `pnpm build` passed with existing Browserslist and `url.parse()` warnings.
- Code review report `docs/reports/code-reviews/2026-05/CR-2026-05-23-career-playbook-ui-polish.md` recorded PASS with no blocking findings.

## Delivery

- PR #48 opened to `develop`: https://github.com/maslennikov-ig/MC-2/pull/48.
