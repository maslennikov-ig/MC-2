# Orchestrator Handoff

Updated: 2026-05-29
Stage: `mc2-db696.45`
Branch: `develop`

## Current State

- `mc2-db696.45` is merged into `develop` and deployed to Dev.
- Delivery merge commit: `b91aeb7e` (`dev: merge codex/career-playbook-card-actions-ux into develop`).
- Dev CI/CD run: `26633038399`, conclusion `success`; `Deploy to Dev` completed successfully and `https://dev.ai.megacampus.ru` returned `HTTP/2 200`.
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

Next stage id: TBD
Recommended action: pick the next ready Beads task or validate the deployed Career Playbook library UX in an authenticated Dev session.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, `.codex/stages/mc2-db696.45/summary.md`, Beads `mc2-db696.45`, and `git status`. Continue from `develop` unless a new feature branch is needed; do not touch the unrelated `product-ia-course-landing` worktree.

## Delivery

- `codex/career-playbook-card-actions-ux` was pushed and merged into `develop`.
- `develop` was pushed to origin at `b91aeb7e`.
- Dev auto-deploy completed successfully through GitHub Actions run `26633038399`.

## Explicit defers

- Browser visual smoke for authenticated library cards is deferred until a reusable authenticated local session or fixture is available.
