# Orchestrator Handoff

Updated: 2026-05-23
Current working branch: `codex/career-playbook-role-suggestions`
Base branch: `origin/develop`
Base head: `17e826ee49ca862857cc832c562daf525a28211e`

## Current state

- Primary worktree `/home/me/code/mc2` is on feature branch `codex/career-playbook-role-suggestions` for Career Playbook role-title suggestions.
- `develop` was clean and aligned with `origin/develop` before this branch was created; PR #45 was merged and Dev health returned 200 `ok`.
- Delivery truth remains unchanged: `/push-dev` drives Dev through `develop`, `/push` is release/version flow, `/deploy` targets staging through `master`; do not push directly to `develop` or `master`.
- Career Playbook Russian naming should remain `Должностная инструкция`; header action remains `Создать описание роли`; do not regress to unclear wording such as `руководство роли`.
- `mc2-db696.20` delivered the initial small role-title suggestion MVP.
- `mc2-db696.21` upgrades it to a fuller local role intelligence input: popular roles, grouped typed matches, match reasons, alias/acronym/keyword search, no-results manual fallback, and RU/EN copy.
- The curated seed list now has 75 local RU/EN role records with departments, groups, seniority, aliases, acronyms, keywords, popularity rank, locale priority, and `source: curated`.
- Selected and typed role titles still flow through the existing fixed-answer wizard state; no backend schema, billing/payment, live taxonomy API, or large dataset import was added.
- 21st.dev was checked for combobox inspiration only; no external component dependency was imported.
- LazyWeb MCP is not available in the current orchestrator runtime; accepted visible research and official/product references were used.
- Code review report: `docs/reports/code-reviews/2026-05/CR-2026-05-23-career-playbook-role-suggestions-production.md`.
- Beads `mc2-db696.21` is closed after local verification and stage closeout.

## Latest relevant stage

- Latest relevant Career Playbook stage: `mc2-db696.21` - production-grade role-title suggestions; summary and artifacts are under [`.codex/stages/mc2-db696.21`](./stages/mc2-db696.21/summary.md).
- Previous MVP stage remains under `mc2-db696.20`; earlier live-smoke foundation remains under `mc2-db696.11` and is unrelated to this frontend change.

## Next recommended

Next stage id: `mc2-db696.21`
Recommended action: create a PR from `codex/career-playbook-role-suggestions` to `develop`. Authenticated browser screenshots/flow still require `TOKEN` or storage state.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook / "Должностная инструкция" work in /home/me/code/mc2. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, .codex/stages/mc2-db696.21/summary.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth. Current branch is codex/career-playbook-role-suggestions for mc2-db696.21. Keep manual role entry, existing fixed-answer state, RU/EN behavior, no billing/payment, no live taxonomy dependency, and no direct push to develop/master.
```

## Explicit defers

- Authenticated Playwright screenshots/flow for `/career-playbook/new` require `TOKEN` or storage state; unauthenticated guard is verified.
- Persisted normalized role metadata (`role_id`, source, confidence) is deferred until backend schema work is explicitly scoped.
- Broader ESCO/O\*NET/ISCO/Lightcast taxonomy ingestion is deferred; current implementation uses a curated static seed list.
