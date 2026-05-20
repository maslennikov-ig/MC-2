# Stage mc2-db696.15 Summary

Status: verified locally
Updated: 2026-05-19
Branch: feature/career-playbook-pdf
Base: feature/career-playbook-library-share @ 7ef1a88881e939238af846fcc8d586fec6c22488

## Scope

Fix and verify TOKEN-backed Playwright authentication for the Career Playbook E2E spec.

## Root Cause

`packages/web/tests/global-setup.ts` passed both `url` and `path` to `browserContext.addCookies`. Context7 Playwright documentation confirms that a cookie must use either `url` or both `domain` and `path`. The TOKEN path had not been exercised before because the authenticated test skipped when `TOKEN` was absent.

The first attempt to create a disposable Supabase user failed with `AuthApiError: unexpected_failure`; Supabase Auth logs showed the actual root cause was a generated password longer than bcrypt's 72-byte limit. Retrying with a shorter strong password succeeded.

## TDD Evidence

- RED: TOKEN-backed Career Playbook E2E failed in global setup with `Cookie should have either url or path`.
- GREEN: removed `path` from the `url`-based cookie shape.
- REFACTOR: added `packages/web/tests/.auth/` to `.gitignore` so generated Playwright storage state is not left as an untracked file.

## Verification

- Disposable Supabase superadmin test user was created via service-role Admin API, signed in to obtain a TOKEN, and deleted after E2E.
- `pnpm --filter @megacampus/web exec playwright test tests/e2e/career-playbook/wizard-phase-a.spec.ts --project=chromium --reporter=list`: passed, 2 tests.
- `pnpm --filter @megacampus/web type-check`: passed.

## Explicit Defers

- Full PDF-download browser E2E is still deferred until a user-visible private PDF download action exists.
