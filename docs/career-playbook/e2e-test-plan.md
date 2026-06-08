# Career Playbook E2E Test Plan

Updated: 2026-06-08
Scope: local E2E audit for Career Playbook wizard resume, center-input Business Context UX, pasted business notes, source-intake boundaries, and sticky header dropdowns.

## Goals

- Verify public and unauthenticated Career Playbook routes still render correctly.
- Verify the authenticated constructor flow reaches the current Business Context step after fixed questions.
- Verify pasted business notes behave like first-class business context: maxlength, counter, continue eligibility, autosave resume, and clear.
- Verify Business Context uses one center workspace at a time: `Материалы и заметки` for pasted notes/files, then category steps such as `Продукт`.
- Verify sticky header dropdowns stay visible, open below their triggers after scroll, and do not shift header/content horizontally on open or close.
- Separate browser-observable evidence from backend-only Docling/source-processing evidence.

## Environment

- Local web target: Playwright-managed Next dev server via `packages/web/playwright.config.ts`.
- Chromium fallback: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome`.
- Local video fallback: `PLAYWRIGHT_DISABLE_VIDEO=1`.
- Authenticated tests use Playwright global setup to sign in `test-instructor1@megacampus.com` and generate `packages/web/tests/.auth/user.json`.
- `TOKEN` remains a legacy fallback only for environments that cannot use the server fixture.

## Scenario Matrix

| Scenario                             | Priority | Route                                        | Prerequisites                                                 | Assertions                                                                                                                            | Local status                                                                |
| ------------------------------------ | -------: | -------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Public Career Playbook landing       |       P0 | `/en/career-playbook`                        | none                                                          | current H1, constructor link, sample-guide link, methodology copy, interactive block examples                                         | Passed                                                                      |
| Constructor unauth guard             |       P0 | `/career-playbook/new`                       | none                                                          | auth-required heading visible; wizard hidden                                                                                          | Passed                                                                      |
| Viewer unauth guard                  |       P0 | `/en/career-playbook/:id`                    | none                                                          | auth-required heading visible; viewer hidden                                                                                          | Passed                                                                      |
| Header product dropdown after scroll |       P0 | `/en/courses`                                | none                                                          | sticky header remains at viewport top; role-guide, course, and language menus open below trigger, inside viewport, with <=1px X shift | Passed desktop Chromium                                                     |
| Fixed wizard resume/current step     |       P0 | `/ru/career-playbook/new?fresh=1`            | Playwright fixture auth                                       | reload returns to current fixed question; previous answers remain                                                                     | Passed Chromium                                                             |
| Business Context entry               |       P0 | same                                         | Playwright fixture auth                                       | after fixed questions, center workspace shows `Материалы и заметки`; right panel is `Сводка`                                          | Passed Chromium                                                             |
| Business Context category mini-step  |       P0 | same                                         | Playwright fixture auth                                       | `Продукт` rail item switches the center workspace; category text survives reload                                                      | Passed Chromium                                                             |
| Pasted notes limit/counter           |       P0 | same                                         | Playwright fixture auth                                       | textarea has `maxlength=20000`; 20,005-char input truncates to 20,000; counter shows `20 000 / 20 000`                                | Passed Chromium                                                             |
| Pasted notes autosave and clear      |       P0 | same                                         | Playwright fixture auth, backend session                      | notes survive reload; empty clear survives reload                                                                                     | Passed Chromium                                                             |
| Freeform-only continue eligibility   |       P0 | Business Context component                   | none                                                          | pasted notes alone enable `Продолжить к уточнениям`                                                                                   | Passed unit regression                                                      |
| Freeform-only backend follow-ups     |       P0 | `careerPlaybook.generation.requestFollowups` | none                                                          | non-empty freeform notes allow follow-up generation even when `business_context.status=not_started`                                   | Passed backend regression                                                   |
| Header profile dropdown after scroll |       P1 | `/en/courses`                                | Playwright fixture auth                                       | profile menu opens below sticky header, inside viewport, with <=1px X shift                                                           | Passed Chromium                                                             |
| Source upload lifecycle              |       P1 | Business Context                             | `TOKEN`, local backend/storage/worker if full                 | source appears, blocks while processing, can remove                                                                                   | Browser mutation smoke env-blocked; backend source router regression passed |
| Docling/source-processing reuse      |       P1 | backend processing                           | local Supabase, Redis, worker, Docling MCP, disposable source | source reaches ready; processed markdown uses playbook namespace; no fake course ownership                                            | Backend source router regression passed; full mutation smoke env-blocked    |

## Commands And Evidence

Baseline targeted run before fixes:

```bash
PLAYWRIGHT_PORT=3019 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome \
PLAYWRIGHT_DISABLE_VIDEO=1 pnpm --filter @megacampus/web exec playwright test \
  tests/e2e/career-playbook tests/e2e/header-dropdown-position.spec.ts \
  --project=chromium --workers=1
```

Result: 3 passed, 3 skipped, 1 failed. Failure: stale landing H1 assertion.

Regression unit:

```bash
pnpm --filter @megacampus/web exec vitest run \
  tests/unit/components/career-playbook/wizard.test.tsx \
  tests/unit/career-playbook-store.test.ts \
  tests/unit/career-playbook-store-progress.test.ts
```

Result: 79 tests passed.

Backend guard regression:

```bash
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/server/routers/career-playbook-business-context-guards.test.ts \
  tests/unit/server/routers/career-playbook-progress.router.test.ts
```

Result: 7 tests passed.

Backend source-processing regression:

```bash
pnpm --filter @megacampus/course-gen-platform exec vitest run \
  --config vitest.config.unit.ts \
  tests/unit/server/routers/career-playbook-sources.router.test.ts
```

Result: 10 tests passed.

Targeted Chromium E2E after center-input UX and header no-shift fixes:

```bash
set -a; source <(tr -d '\r' < packages/web/.env.local); set +a
PLAYWRIGHT_PORT=3106 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome \
PLAYWRIGHT_DISABLE_VIDEO=1 pnpm --filter @megacampus/web exec playwright test \
  tests/e2e/career-playbook/wizard-phase-a.spec.ts --project=chromium --workers=1
```

Result: 2 passed.

Header no-shift Chromium E2E:

```bash
set -a; source <(tr -d '\r' < packages/web/.env.local); set +a
PLAYWRIGHT_PORT=3105 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome \
PLAYWRIGHT_DISABLE_VIDEO=1 pnpm --filter @megacampus/web exec playwright test \
  tests/e2e/header-dropdown-position.spec.ts --project=chromium
```

Result: 2 passed.

Mobile header E2E:

```bash
PLAYWRIGHT_PORT=3025 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome \
PLAYWRIGHT_DISABLE_VIDEO=1 pnpm --filter @megacampus/web exec playwright test \
  tests/e2e/header-dropdown-position.spec.ts --project=mobile-chrome --workers=1
```

Result: 1 passed, 1 skipped. The skipped test is the authenticated profile menu.

## Findings

- Existing landing E2E was stale after copy/interactive-demo changes. It now asserts current public copy and clicks the Decision matrix block before checking its example text.
- Existing authenticated wizard E2E was stale relative to the Business Context phase. It now tests the center-input Business Context/freeform path with Playwright fixture auth.
- Header dropdown E2E now asserts no more than 1px horizontal layout shift for the sticky header and main content while product, course, language, and profile menus open and close.
- Product bug found during E2E planning: pasted freeform text did not enable `Продолжить к уточнениям` by itself, and the backend guard still rejected freeform-only follow-up generation. `BusinessContextStep` and the backend generation guard now both treat non-empty freeform text as valid context.
- `mobile-chrome` Playwright project did not honor the system Chrome fallback. It now uses `withOptionalChromiumExecutable`, matching the desktop Chromium project.

## Blockers

- The long browser transition from Business Context into generated follow-up questions can still be flaky when server draft sync is pending; keep deterministic component/backend coverage for follow-up generation guards and add a split E2E when local backend/session sync is stable.
- Browser E2E alone cannot prove Docling markdown conversion or `file_catalog.course_id = null`; existing backend source-processing regression passed, while full mutation smoke still requires backend/worker/Supabase/Redis/Docling test fixtures.
- The general `packages/web/tests/e2e/README.md` is stale and draft-session-specific; update it separately in Beads `mc2-db696.57` if broad E2E onboarding docs are needed.
- Authenticated fixture setup and deterministic autosave waits are tracked separately in Beads `mc2-db696.58`.
