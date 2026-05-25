# Orchestrator Handoff

Updated: 2026-05-25
Branch: `codex/career-playbook-document-milk`
Base: `origin/develop` at `cd19d6650afa68e31328c30439377499d821d80b`

## Current State

- Active stage: `mc2-db696.33` (`Career Playbook: document-first milk design zone refresh`).
- Worktree: `/home/me/code/mc2-worktrees/career-playbook-document-milk`.
- Main checkout `/home/me/code/mc2` is a separate worktree on `codex/career-playbook-ui-mock-variants` with unrelated local orchestration changes; do not overwrite or clean it from this branch.
- Implementation is locally verified and ready for commit/PR to `develop`; no direct push to `develop`/`master`.

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

## Next recommended

Next stage id: `mc2-db696.33`
Recommended action: commit, push, open PR to `develop`, merge through PR flow, wait for Dev GitHub Actions deploy, then verify Dev health and public Career Playbook URLs.

## Starter prompt for next orchestrator

Use $orchestrator-stage to continue `mc2-db696.33` in `/home/me/code/mc2-worktrees/career-playbook-document-milk`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, `.codex/stages/mc2-db696.33/summary.md`, the two artifacts in `.codex/stages/mc2-db696.33/artifacts/`, Beads state for `mc2-db696.33.*`, and current `git status`. The branch is locally verified and should be delivered via PR to `develop`, then Dev deploy/health/public URL checks; do not push directly to `develop` or `master`.

## Explicit defers

- `mc2-db696.28`: ESCO import subset remains outside this redesign; local authenticated screenshots require `TOKEN`, so unit tests cover authenticated behavior until Dev verification.
