# Orchestrator Handoff

Updated: 2026-05-29
Stage: `mc2-db696.45`
Branch: `codex/career-playbook-card-actions-ux`

## Current State

- `mc2-db696.45` is implemented on `codex/career-playbook-card-actions-ux`; merge/deploy has not been requested for this stage yet.
- Career Playbook library cards now follow the course catalog action pattern: direct card actions for share, public link, constructor resume, delete, create course, and open.
- The old Career Playbook checkbox selection and bulk-delete card path was removed.
- `/career-playbook/new?resume=<playbookId>` now resumes the selected guide in the constructor; `/career-playbook/new?fresh=1` still starts a blank guide.
- Shared catalog UI primitives now include `packages/web/components/catalog/catalog-action-button.tsx`; the course card uses this shared action button instead of its old course-local copy.
- Separate worktree `/home/me/code/mc2-worktrees/product-ia-course-landing` on `codex/product-ia-handoff-dev` is unrelated and must not be touched.

## Verification

- Focused RED/GREEN tests passed for Career Playbook library cards, constructor resume query handling, wizard resume behavior, and shared catalog primitives.
- `pnpm --filter @megacampus/web lint` passed.
- `pnpm type-check` passed.
- `pnpm build` passed; Next.js emitted existing Browserslist and `url.parse()` warnings.
- `git diff --check` passed.

## Next recommended

Next stage id: `mc2-db696.45`
Recommended action: run stage closeout, commit and push the feature branch, then ask whether to merge into `develop` and deploy Dev.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, `.codex/stages/mc2-db696.45/summary.md`, Beads `mc2-db696.45`, and `git status`. Continue from branch `codex/career-playbook-card-actions-ux`; do not touch the unrelated `product-ia-course-landing` worktree.

## Delivery

- No merge or deploy has happened yet for `mc2-db696.45`.

## Explicit defers

- Browser visual smoke for authenticated library cards is deferred until a reusable authenticated local session or fixture is available.
