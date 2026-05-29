# Orchestrator Handoff

Updated: 2026-05-29
Stage: `mc2-db696.47`
Branch: `develop`

## Current State

- `mc2-db696.46` and `mc2-db696.47` were merged into `develop` as `d0e7a523` and deployed to Dev.
- Shared catalog statistics cards now use bounded auto-fit columns (`12rem` to `16rem`) through `CatalogStatistics`; tests use `data-testid="catalog-statistics-grid"`.
- Career Playbook role-title suggestions now show 30 curated popular roles by default instead of 8.
- The popular role set is intentionally cross-functional: product, sales, engineering, support, data, operations, marketing, HR, finance, design, and legal are represented before the user types.
- The role-suggestion dropdown height was increased with viewport bounds so the larger default list remains usable.
- Career Playbook library cards now follow the course catalog action pattern: direct card actions for share, public link, constructor resume, delete, create course, and open.
- The old Career Playbook checkbox selection and bulk-delete card path was removed.
- `/career-playbook/new?resume=<playbookId>` now resumes the selected guide in the constructor; `/career-playbook/new?fresh=1` still starts a blank guide.
- Shared catalog UI primitives now include `packages/web/components/catalog/catalog-action-button.tsx`; the course card uses this shared action button instead of its old course-local copy.
- Separate worktree `/home/me/code/mc2-worktrees/product-ia-course-landing` on `codex/product-ia-handoff-dev` is unrelated and must not be touched.

## Verification

- Focused RED/GREEN tests passed for compact catalog statistics and expanded popular role suggestions.
- Focused catalog/Career Playbook tests passed: 15 tests for catalog pages and 57 tests for role suggestions, wizard, and page client.
- `pnpm --filter @megacampus/web lint` passed.
- `pnpm type-check` passed.
- `pnpm build` passed; Next.js emitted existing Browserslist and `url.parse()` warnings.
- `git diff --check` passed.

## Next recommended

Next stage id: pick the next ready Beads task.
Recommended action: continue from clean `develop`; no pending delivery remains for `mc2-db696.46` or `mc2-db696.47`.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, relevant `.codex/stages/*/summary.md`, Beads, and `git status`. Continue from clean `develop`; do not touch the unrelated `product-ia-course-landing` worktree.

## Delivery

- Dev delivery completed via GitHub Actions run `26654070813`; `Deploy to Dev` and deployment verification passed.

## Explicit defers

- Browser visual smoke for authenticated library cards is deferred until a reusable authenticated local session or fixture is available.
