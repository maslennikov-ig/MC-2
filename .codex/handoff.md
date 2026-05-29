# Orchestrator Handoff

Updated: 2026-05-29
Stage: `mc2-db696.44`
Branch: `codex/career-playbook-library-catalog-unification`

## Current State

- `mc2-db696.44` is implemented and stage-closeout verified locally on `codex/career-playbook-library-catalog-unification`; it is not merged or deployed.
- The branch is stacked on `codex/career-playbook-option-caret-fix` at `2c519338`, which contains the earlier Career Playbook option-card caret fix.
- A shared catalog UI layer now lives in `packages/web/components/catalog/`; the course catalog wraps it, and the Career Playbook library uses it for statistics, filters, grid, empty state, and load-more behavior.
- Career Playbook library filters are now URL/server driven: `search`, `status`, `department`, `level`, and `sort` are passed to backend list filtering, statistics, and facets.
- Similar non-text clickable card/label caret hazards were patched with `select-none` and `caret-transparent` in create-course, quiz, admin history, and batch enrichment selection UI.
- Separate worktree `/home/me/code/mc2-worktrees/product-ia-course-landing` on `codex/product-ia-handoff-dev` is unrelated and must not be touched by this stage.

## Verification

- RED/GREEN focused web tests passed after implementation: catalog primitives, course filters/library, Career Playbook library page/client.
- Backend Career Playbook router unit suite passed: 41 tests.
- `pnpm --filter @megacampus/web lint` passed.
- `pnpm type-check` passed.
- `pnpm build` passed; Next.js build emitted existing Browserslist and `url.parse()` warnings.
- `git diff --check` passed.
- `python3 scripts/orchestration/run_stage_closeout.py --stage mc2-db696.44` passed.

## Next recommended

Next stage id: `mc2-db696.44`
Recommended action: commit and push the feature branch, then decide whether to merge into `develop` and deploy Dev in a separate explicit delivery step.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, `.codex/stages/mc2-db696.44/summary.md`, Beads `mc2-db696.44`, and `git status`. Continue from branch `codex/career-playbook-library-catalog-unification`; do not touch the unrelated `product-ia-course-landing` worktree.

## Delivery

- No merge, push, or deploy has happened yet for `mc2-db696.44`.

## Explicit defers

- Browser visual smoke for `/career-playbook/library` and `/courses/library` is not run in this closeout unless a local authenticated session is provided; covered here by unit tests, lint, type-check, and build.
