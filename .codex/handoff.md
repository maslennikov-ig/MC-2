# Orchestrator Handoff

Updated: 2026-05-25
Branch: `develop`
Base: `origin/develop` at `9121b2a5672e09770405ea2f6ddc9f8105280eea`

## Current State

- Stage `mc2-db696.33` (`Career Playbook: document-first milk design zone refresh`) was merged via PR #51 and deployed to Dev.
- Dev run: GitHub Actions `26385179954`, deploy job passed, health returned `{"status":"ok"}` on 2026-05-25.
- Main checkout `/home/me/code/mc2` is a separate worktree on `codex/career-playbook-ui-mock-variants` with unrelated local orchestration changes; do not overwrite or clean it from this branch.

## Changes In This Branch

- Added milk/document light tokens while keeping primary CTA purple; dark mode remains contrast-first.
- Added shared Career Playbook document workspace/shell/preview components.
- Rebuilt constructor, follow-ups, and completion review as a document-first workflow with left navigation, central draft document, and right action/question panel.
- Applied the same document styling to library, private viewer, streaming/editor states, public share, loading/error/auth-required states, and soft landing alignment through shared tokens.
- Removed visible Career Playbook AI-cliche icons/labels and localized RU/EN viewer block/group/status/aria labels.
- Added `docs/plans/career-playbook/2026-05-25-document-first-zone-redesign.md`; updated `docs/career-playbook/README.md`.
- Tracked visible subagent reports under `.codex/stages/mc2-db696.33/artifacts/`.

## Verification

- CP unit set passed: 6 files, 53 tests.
- `pnpm --filter @megacampus/web lint` passed.
- `pnpm --filter @megacampus/web type-check` passed.
- `pnpm --filter @megacampus/web build` passed with test Supabase env and existing Browserslist/`url.parse()` warnings.
- Production-mode Playwright smoke passed for CP and non-CP routes at 390, 1440, and 1920 px: 24 checks, no 500s, no horizontal overflow.
- `pnpm type-check` passed.
- `pnpm build` passed with test Supabase env and existing Browserslist/`url.parse()` warnings.
- Dev light/dark smoke passed for `/ru/career-playbook`, `/ru/career-playbook/new`, `/ru/career-playbook/library`, and `/en/career-playbook` at 390/1440/1920 px: 200 status and no horizontal overflow.

## Next recommended

Next stage id: `mc2-db696.33`
Recommended action: continue with next Beads-ready Career Playbook item, likely `mc2-db696.28` for ESCO-backed role suggestions.

## Starter prompt for next orchestrator

Use $orchestrator-stage for the next Career Playbook stage in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, relevant `.codex/stages/*`, Beads ready state, and current `git status`. PR #51 delivered `mc2-db696.33` to Dev; do not overwrite the separate local worktree on `codex/career-playbook-ui-mock-variants`.

## Explicit defers

- `mc2-db696.28`: ESCO import subset / normalized role-source pipeline remains outside this redesign.
