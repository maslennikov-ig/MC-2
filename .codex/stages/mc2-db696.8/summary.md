# Stage mc2-db696.8 Summary

Status: ready for delivery
Updated: 2026-05-19
Branch: feature/career-playbook-pdf
Base: feature/career-playbook-library-share @ 7ef1a88881e939238af846fcc8d586fec6c22488

## Scope

Career Playbook Phase 8: backend PDF export service and protected tRPC export contract.

## Outcome

- Added Playwright HTML to PDF rendering for completed Career Playbooks.
- Added print A4 HTML template with cover, metadata, table of contents, block page breaks, table styling, code blocks, and Mermaid diagram placeholders.
- Added in-browser Mermaid rendering to inline SVG with safe preformatted fallback when Mermaid render fails.
- Added protected `careerPlaybook.exportPdf(playbookId)` procedure returning `{ pdfBase64, fileName, contentType, sizeBytes }`.
- Kept export authorization owner/superadmin scoped through the existing private library access path.
- Deferred frontend PDF action wiring because the private viewer/actions surface does not exist yet in the current branch.

## Parallel Decomposition

| Stream           | Goal                                                         | Agent                      | Write zone                       | Dependencies        | Verification                                   | Decision   | Reason                                                |
| ---------------- | ------------------------------------------------------------ | -------------------------- | -------------------------------- | ------------------- | ---------------------------------------------- | ---------- | ----------------------------------------------------- |
| Backend mapping  | Locate service/router patterns and export contract placement | Planck, explorer           | read-only                        | none                | diff review by orchestrator                    | parallel   | Read-only and independent from frontend mapping       |
| Frontend mapping | Check whether PDF action surface exists                      | Fermat, explorer           | read-only                        | none                | repo search by orchestrator                    | parallel   | Read-only and independent from backend implementation |
| Implementation   | Service, router, tests                                       | local orchestrator         | backend PDF service/router tests | mapping findings    | targeted Vitest, type-check, lint, build       | local      | Coherent backend change with coupled tests            |
| Code review      | Independent findings on implementation                       | Aristotle, worker reviewer | read-only                        | implementation diff | reviewer report plus orchestrator verification | sequential | Review depends on implementation diff                 |

## Documentation

- Context7 `/microsoft/playwright`: `page.setContent`, `page.pdf`, `emulateMedia`, print options.
- Context7 `/mermaid-js/mermaid`: `initialize`, `render`, `startOnLoad: false`.
- Repo docs: `docs/plans/quiet-waddling-starfish.md` and `docs/plans/career-playbook/*`.

## TDD Evidence

- RED: service test failed before implementation because `career-playbook-pdf` module/export did not exist.
- RED: router test failed before implementation because `careerPlaybook.exportPdf` procedure did not exist.
- RED after review: TOC/Header and Mermaid markup regression tests failed against the first implementation.
- GREEN: targeted service and router tests passed with 32 tests after fixing TOC, Mermaid rendering, and auth coverage.
- REFACTOR: shared Playwright page preparation now backs both PDF generation and rendered-HTML smoke verification.

## Review Follow-up

- Review finding: Mermaid fenced blocks were split into broken HTML before browser rendering. Fixed by handling Mermaid inside the code-fence parser and adding inline SVG verification.
- Review finding: `## Header` shifted TOC and block IDs. Fixed by excluding header from TOC and non-block page-break numbering.
- Review finding: unauthenticated export coverage was missing. Fixed with an explicit router test.
- Repeat review: no blocking findings.

## Verification

- `set -a; . /home/me/code/mc2/packages/course-gen-platform/.env; set +a; pnpm --filter @megacampus/course-gen-platform test -- tests/unit/services/career-playbook-pdf.test.ts tests/unit/server/routers/career-playbook.router.test.ts`: passed, 32 tests.
- `pnpm --filter @megacampus/course-gen-platform type-check`: passed.
- `pnpm --filter @megacampus/course-gen-platform lint`: passed with existing warnings only, 0 errors.
- `pnpm --filter @megacampus/course-gen-platform build`: passed.
- `pnpm type-check`: passed after sourcing local env files with CRLF normalization.
- `pnpm build`: passed after sourcing local env files with CRLF normalization and forcing `NODE_ENV=production`.
- `git diff --check`: passed.

## Explicit Defers

- `mc2-db696.8.3`: frontend PDF action wiring is deferred because the current branch has no private Career Playbook viewer route, no `ActionsBar`, and no `exportPDF` store surface. Backend export is ready for the later private viewer/actions stage.
- Live Supabase/staging smoke remains in `mc2-db696.11`; this stage did not mutate live Supabase.
- Browser e2e for the complete flow remains in `mc2-db696.11`.
