# Orchestrator Handoff

Updated: 2026-05-23
Branch: `codex/career-playbook-ui-polish`
Base: `origin/develop`

## Current State

- PR #47 was merged into `develop` and deployed to Dev via run `26335235464`; Dev health returned `{"status":"ok"}`.
- PR #48 is open to `develop`: https://github.com/maslennikov-ig/MC-2/pull/48.
- `mc2-db696.29` is closed; `mc2-db696.30` is the active header standardization follow-up.
- No direct push to `develop`/`master`; no billing/payment scope; no live taxonomy or large dataset import.

## Changes In This Branch

- Constructor state/UI polish from `mc2-db696.29`: completed base answers can finish from any selected question, left rail is clickable, and the workbench is wider/readable.
- Shared `Header` role-description action is purple-system aligned; `/create`, `/courses`, and `/profile` now use shared-header wrappers.
- Shared `Header` now supports `sticky` and `glass` variants for app pages.
- Career Playbook constructor, library, viewer, and auth-required states now show the shared app header above local page/document headers.
- Admin keeps its custom admin nav, but quick actions are localized and include “Создать описание роли”.
- Mobile header overflow risk was reduced with an icon logo and narrower signed-out auth controls.

## Verification

- Header audit unit set passed: 25 tests; extended Career Playbook/header unit set passed: 82 tests.
- `pnpm --filter @megacampus/web lint` passed with 7 existing warnings outside this scope.
- `pnpm type-check`, `git diff --check`, and `pnpm build` passed.
- Career Playbook E2E passed 3, skipped 2 authenticated tests because `TOKEN` is unset.
- Playwright screenshots/overflow checks passed for `/career-playbook/new`, `/career-playbook/library`, `/courses`, `/profile` at 390px and 1440px.
- Code review reports for `mc2-db696.29` and `mc2-db696.30` recorded PASS with no blocking findings.

## Next recommended

Next stage id: `mc2-db696.30`
Recommended action: commit/push audit changes, update PR #48, merge through normal flow, then deploy to Dev as requested.

## Starter prompt for next orchestrator

Use $orchestrator-stage to continue Career Playbook / “Должностная инструкция” UI polish in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, `.codex/stages/mc2-db696.30/summary.md`, PR #48, and Beads state for `mc2-db696.30` and `mc2-db696.28`. Current branch is `codex/career-playbook-ui-polish`; do not push directly to `develop`/`master`.

## Explicit defers

- `mc2-db696.28`: ESCO import subset / normalized role-source pipeline.
- Authenticated constructor/profile screenshots require `TOKEN` or storage state.
