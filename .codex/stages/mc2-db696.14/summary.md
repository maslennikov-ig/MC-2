# Stage mc2-db696.14 Summary

Status: closed / ready for delivery
Updated: 2026-05-19
Branch: feature/career-playbook-pdf
Base: feature/career-playbook-library-share @ 7ef1a88881e939238af846fcc8d586fec6c22488

## Scope

Review-and-fix pass for PR #34 / Career Playbook Phase 8 PDF export.

## Routing

- Documentation: Context7 `/microsoft/playwright`, `/vercel/next.js`, `/websites/trpc_io`.
- Skills: `orchestrator-stage`, `task-router`, `code-review`, `webapp-testing`, `playwright`, `pdf`, `test-driven-development`, `requesting-code-review`, `verification-before-completion`.
- Dedicated improvement-review asset: none installed; used a visible Codex subagent with an explicit improvement reviewer prompt.
- Catalog candidates: `code-review-and-quality`, `architect-reviewer`, `code-simplification`, `browser-testing-with-devtools`; lookup-only, not promoted.

## Parallel Decomposition

| Stream             | Goal                                                           | Agent                       | Write zone                              | Dependencies   | Verification                                        | Decision | Reason                                       |
| ------------------ | -------------------------------------------------------------- | --------------------------- | --------------------------------------- | -------------- | --------------------------------------------------- | -------- | -------------------------------------------- |
| Correctness review | Bugs, regressions, security, tests, production gaps            | Ramanujan, visible subagent | read-only                               | PR #34 diff    | report plus orchestrator acceptance                 | parallel | independent read-only review                 |
| Improvement review | Simpler/cleaner/idiomatic alternatives, UX/API/maintainability | Huygens, visible subagent   | read-only                               | PR #34 diff    | report plus orchestrator acceptance                 | parallel | independent read-only improvement review     |
| PDF/E2E specialist | Browser/PDF smoke and E2E feasibility                          | Volta, visible subagent     | `/tmp` artifacts only                   | PR #34 diff    | PDF smoke commands                                  | parallel | independent specialist verification          |
| Accepted fixes     | Fix accepted simple findings                                   | local orchestrator          | PDF template, router, Dockerfile, tests | review reports | targeted tests, PDF smoke, Docker smoke, E2E, gates | local    | fixes were small and coupled to verification |

## Accepted Findings

- `mc2-db696.14.1`: fixed duplicate TOC numbering by normalizing TOC labels only.
- `mc2-db696.14.2`: fixed production Docker runtime by moving the API image to Debian slim and installing Playwright Chromium with system dependencies.
- `mc2-db696.14.3`: fixed unbounded export path with existing `createRateLimiter`.
- Small accepted improvement: localized static PDF chrome for Russian playbooks.
- Final review: accepted delivery hygiene finding that `.codex/stages/mc2-db696.14/` must be included because handoff links to it.

## Rejected / Deferred

- Base64 tRPC response was not changed; acceptable for MVP, but should be reconsidered if real PDFs grow to multi-MB payloads.
- Private UI PDF download E2E remains deferred because the private PDF action surface is not present in this branch.
- Full authenticated browser E2E remains limited by missing `TOKEN`; unauthenticated guard E2E passed.

## Verification

- RED service tests failed before fixes for duplicate TOC numbering and RU chrome.
- `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/services/career-playbook-pdf.test.ts tests/unit/server/routers/career-playbook.router.test.ts`: passed, 33 tests.
- PDF smoke via Playwright: generated 29-page A4 PDF, Mermaid SVG present, expected text found, duplicate `1. 1.` / `10. 10.` not found.
- `docker build --target runner -f packages/course-gen-platform/Dockerfile -t mc2-course-gen-platform-pdf-smoke:local .`: passed.
- `docker run --rm --entrypoint node mc2-course-gen-platform-pdf-smoke:local ... chromium.launch(...)`: passed, Chromium `143.0.7499.4`.
- Career Playbook Playwright E2E: unauthenticated guard passed, authenticated flow skipped because `TOKEN` is absent.
- `pnpm --filter @megacampus/course-gen-platform type-check`: passed.
- `pnpm --filter @megacampus/course-gen-platform lint`: passed with existing warnings only, 0 errors.
- `pnpm type-check`: passed.
- `pnpm build`: passed with existing Next/Supabase/Browserslist warnings.
- Final read-only review: no blocking code issues; delivery artifacts must be included in the PR.

## Explicit Defers

- Private UI PDF action and full browser download flow remain deferred until the private Career Playbook action/viewer surface is implemented.
- No Supabase production/staging mutation was performed.
