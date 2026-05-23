# Orchestrator Handoff

Updated: 2026-05-23
Branch: `codex/career-playbook-ui-polish`
Base: `origin/develop`

## Current State

- PR #47 was merged into `develop` and deployed to Dev via run `26335235464`; Dev health returned `{"status":"ok"}`.
- Current branch fixes `mc2-db696.29`; PR #48 is open to `develop`: https://github.com/maslennikov-ig/MC-2/pull/48.
- Related task `mc2-db696.30` tracks shared header standardization; this branch includes the first narrow header fix.
- No direct push to `develop`/`master`; no billing/payment scope; no live taxonomy or large dataset import.

## Changes In This Branch

- Fixed completed fixed-question state: when all visible base questions are answered, the primary action can finish from any selected question.
- Left rail questions are clickable buttons for review/edit instead of static completed rows.
- Constructor header is slimmer, removes the extra product/phase badges, and keeps the title as the top signal.
- Wizard columns, question text, side summaries, choice rows, and role input use larger, more readable sizing.
- Role search icon is vertically centered with the input text.
- Shared `Header` role-description action now uses the same purple primary visual family as `Создать курс`.
- `/create` and `/courses` now render the shared `Header` wrappers instead of maintaining separate local header implementations.

## Verification

- `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/wizard.test.tsx tests/unit/components/career-playbook/page-client.test.tsx tests/unit/components/layouts/header.test.tsx` passed: 37 tests.
- `pnpm --filter @megacampus/web lint` passed with 7 existing warnings outside this scope.
- `pnpm type-check`, `git diff --check`, and `pnpm build` passed.
- `PLAYWRIGHT_PORT=3192 pnpm --filter @megacampus/web test:e2e:career-playbook` passed 3, skipped 2 authenticated tests because `TOKEN` is unset.
- Code review report passed with no blocking findings; browser screenshots were checked locally for public Career Playbook landing and Courses shared header.

## Next recommended

Next stage id: `mc2-db696.29`
Recommended action: review/merge PR #48, then use the normal PR/dev delivery flow.

## Starter prompt for next orchestrator

Use $orchestrator-stage to continue Career Playbook / "Должностная инструкция" UI polish in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, `.codex/stages/mc2-db696.29/summary.md`, and Beads state for `mc2-db696.29`, `mc2-db696.30`, and `mc2-db696.28`. Current branch is `codex/career-playbook-ui-polish`; do not push directly to `develop`/`master`.

## Explicit defers

- `mc2-db696.28`: ESCO import subset / normalized role-source pipeline.
- `mc2-db696.30`: broader audit of remaining non-shared page/admin headers beyond the narrow fixes in this branch.
- Authenticated constructor screenshots require `TOKEN` or storage state.
