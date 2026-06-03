# Orchestrator Handoff

Updated: 2026-06-03
Stage: `mc2-ev2nq`
Branch: `codex/career-playbook-viewer-library-snapshot`

## Current State

- `mc2-ev2nq` fixes the authenticated Career Playbook viewer loading path.
- Root cause: the web store called `careerPlaybook.library.get` but cast the library detail response directly to `CareerPlaybookViewerSnapshot`; the response has `id`/`positionTitle`/`generatedBlocks`, while the viewer expects `playbookId`/`title`/`blocks`.
- The store now maps library details into a proper viewer snapshot and falls back to `finalMarkdown` in the header block if no normalized generated blocks are present.
- Regression coverage was added in `packages/web/tests/unit/career-playbook-store.test.ts` for production `library.get` detail mapping.
- Dev data for `656e70ac-0082-4f5a-94a6-f862244d2fbd` is intact: `status=completed`, 27 generated blocks, `final_markdown` length 52174.
- Stage summary: `.codex/stages/mc2-ev2nq/summary.md`.

## Verification

- RED observed before fix: new store test failed with `Career Playbook viewer request was superseded`.
- Focused tests passed: `../../node_modules/.bin/vitest run tests/unit/career-playbook-store.test.ts tests/unit/components/career-playbook/viewer-page-client.test.tsx` (44 tests).
- `git diff --check` passed.
- `pnpm --filter @megacampus/web lint` passed.
- `pnpm type-check` passed.
- `pnpm build` passed; Next.js emitted existing Browserslist and `url.parse()` warnings.
- `graphify update .` passed (57,062 nodes / 79,102 edges); `graphify-out` is local/untracked.

## Next recommended

Next stage id: `mc2-ev2nq` until delivered.
Recommended action: commit and push `codex/career-playbook-viewer-library-snapshot`; merge/deploy to Dev only with explicit confirmation or via the repo delivery command.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, `.codex/stages/mc2-ev2nq/summary.md`, Beads, Graphify report, and `git status`. Continue `mc2-ev2nq` from `codex/career-playbook-viewer-library-snapshot`.

## Delivery

- Dev delivery not performed yet for `mc2-ev2nq`.

## Explicit defers

- Authenticated browser smoke on dev is pending deploy of this branch; unit/API evidence confirms the root cause and data state.
