# Orchestrator Handoff

Updated: 2026-05-23
Current working branch: `codex/career-playbook-role-suggestions`
Base branch: `origin/develop`
Base head: `17e826ee49ca862857cc832c562daf525a28211e`

## Current state

- Primary worktree `/home/me/code/mc2` is on feature branch `codex/career-playbook-role-suggestions` for `mc2-db696.20`.
- `develop` was clean and aligned with `origin/develop` before this branch was created.
- PR #45 was merged into `develop` and deployed to Dev through GitHub Actions run 26323832695; Dev health check returned 200 `ok`.
- Delivery truth remains unchanged: `/push-dev` drives Dev through `develop`, `/push` is release/version flow, `/deploy` targets staging through `master`; do not push directly to `develop` or `master`.
- Career Playbook Russian naming should remain `Должностная инструкция`; header action remains `Создать описание роли`; do not regress to unclear wording such as `руководство роли`.
- `mc2-db696.20` implements a small role-title suggestion/autocomplete for the first constructor question, backed by a static RU/EN seed list and the existing fixed-answer state path.
- No billing/payment, backend schema, live API, or large taxonomy dataset was added.
- 21st.dev was checked for inspiration only; no external component dependency was imported.
- Knowledge-base recommendation: keep curated static seed list for MVP; evaluate an ESCO build-time subset later if broader normalized roles are needed.
- Code review report: `docs/reports/code-reviews/2026-05/CR-2026-05-23-career-playbook-role-suggestions.md`.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.20` - role-title suggestions research and implementation; summary and artifacts are under [`.codex/stages/mc2-db696.20`](./stages/mc2-db696.20/summary.md).
- Earlier live-smoke foundation remains under `mc2-db696.11`; live mutation smoke is still gated and unrelated to this UI MVP change.

## Next recommended

Next stage id: `mc2-db696.20`
Recommended action: create a PR from `codex/career-playbook-role-suggestions` to `develop` after reviewing the local diff. Authenticated browser verification still needs `TOKEN` or storage state if a full screenshot/user-flow pass is required.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook / "Должностная инструкция" work in /home/me/code/mc2. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, .codex/stages/mc2-db696.20/summary.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth. Current branch is codex/career-playbook-role-suggestions for mc2-db696.20. Keep the role-title suggestions MVP small: editable suggestions for the first role question, manual entry allowed, existing fixed-answer state path, RU/EN messages, no billing/payment, no live taxonomy dependency.
```

## Explicit defers

- Authenticated Playwright flow and screenshots for `/career-playbook/new` require `TOKEN` or storage state; local unauthenticated gate is verified.
- Broader ESCO/O\*NET/ISCO/Lightcast taxonomy ingestion is deferred; MVP uses a small curated RU/EN seed list.
- Existing live mutation smoke gates under `mc2-db696.11.5` remain unchanged.
