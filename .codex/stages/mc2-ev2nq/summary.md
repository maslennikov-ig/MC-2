# Stage mc2-ev2nq — Career Playbook viewer library detail mapping

## Current State

- Root cause: the authenticated Career Playbook viewer called `careerPlaybook.library.get`, but the web store cast the library detail response directly to `CareerPlaybookViewerSnapshot`.
- Backend/API data for `656e70ac-0082-4f5a-94a6-f862244d2fbd` is present and complete on dev: `status=completed`, 27 generated blocks, `final_markdown` length 52174.
- Fix: the production web client now maps library details (`id`, `positionTitle`, `language`, `generatedBlocks`, `finalMarkdown`, share state) into a proper viewer snapshot (`playbookId`, `title`, `contentLanguage`, `blocks`).
- Added regression coverage for loading production library details into the viewer store.

## Verification

- `pnpm --filter @megacampus/shared-types build` passed as local test prep because shared-types dist is untracked and stale before tests.
- RED observed: `career-playbook-store.test.ts -t "maps production library details"` failed with `Career Playbook viewer request was superseded` before the mapper.
- `../../node_modules/.bin/vitest run tests/unit/career-playbook-store.test.ts tests/unit/components/career-playbook/viewer-page-client.test.tsx` passed: 44 tests.
- `git diff --check` passed.
- `pnpm --filter @megacampus/web lint` passed.
- `pnpm type-check` passed.
- `pnpm build` passed; existing Browserslist and `url.parse()` warnings remain.

## Review Notes

- Delegation: none; single coupled web-store/test write zone, no parallelism benefit.
- Documentation: docs-reviewed: no-change-needed - no public API, route, migration, deploy procedure, or durable operator workflow changed.
- Graphify: graph-reviewed: updated - read `graphify-out/GRAPH_REPORT.md`, ran focused query for Career Playbook viewer routing, then ran `graphify update .` successfully (57,062 nodes / 79,102 edges).
- project-index: reviewed-no-change - no new entrypoint, route, package boundary, or verification command.

## Delivery State

- Branch: `codex/career-playbook-viewer-library-snapshot`.
- Beads: `mc2-ev2nq` closed after dev smoke.
- Dev delivery: completed via GitHub Actions run `26899302080` on `develop` merge commit `66032b29bddc5064737b2920f6574a750490a7b9`.
- Dev smoke: `megacampus-web-dev` and `megacampus-api-dev` both report image revision `66032b29bddc5064737b2920f6574a750490a7b9`; target URL returns HTTP 200 and the page bundle is present.

## Explicit Defers

- None.
