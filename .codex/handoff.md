# Orchestrator Handoff

Updated: 2026-05-29
Stage: `mc2-db696.46`
Branch: `codex/compact-catalog-statistics`

## Current State

- `mc2-db696.46` is implemented on `codex/compact-catalog-statistics`; it has not been merged or deployed yet.
- Shared catalog statistics cards now use bounded auto-fit columns (`12rem` to `16rem`) instead of the previous `lg:grid-cols-3` wide banners.
- This affects both Career Playbook library statistics and course library statistics through `CatalogStatistics`.
- A stable `data-testid="catalog-statistics-grid"` was added for tests instead of asserting old grid breakpoint classes.
- Career Playbook library cards now follow the course catalog action pattern: direct card actions for share, public link, constructor resume, delete, create course, and open.
- The old Career Playbook checkbox selection and bulk-delete card path was removed.
- `/career-playbook/new?resume=<playbookId>` now resumes the selected guide in the constructor; `/career-playbook/new?fresh=1` still starts a blank guide.
- Shared catalog UI primitives now include `packages/web/components/catalog/catalog-action-button.tsx`; the course card uses this shared action button instead of its old course-local copy.
- Separate worktree `/home/me/code/mc2-worktrees/product-ia-course-landing` on `codex/product-ia-handoff-dev` is unrelated and must not be touched.

## Verification

- Focused RED/GREEN test passed for compact catalog statistics layout.
- Focused Vitest passed for catalog primitives, Career Playbook library client, and courses library page: 15 tests.
- `pnpm --filter @megacampus/web lint` passed.
- `pnpm type-check` passed.
- `pnpm build` passed; Next.js emitted existing Browserslist and `url.parse()` warnings.
- `git diff --check` passed.

## Next recommended

Next stage id: `mc2-db696.46`
Recommended action: merge `codex/compact-catalog-statistics` into `develop` and deploy Dev if the compact statistics layout is approved.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, `.codex/stages/mc2-db696.46/summary.md`, Beads `mc2-db696.46`, and `git status`. Continue from `codex/compact-catalog-statistics`; do not touch the unrelated `product-ia-course-landing` worktree.

## Delivery

- No merge or deploy has happened yet for `mc2-db696.46`.

## Explicit defers

- Browser visual smoke for authenticated library cards is deferred until a reusable authenticated local session or fixture is available.
