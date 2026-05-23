# Orchestrator Handoff

Updated: 2026-05-23
Current working branch: `develop`
Base branch: `origin/develop`
Base head: see current `git status`; code delivery merge was `751cb718f129d28b49f555194eb7747b7679b261`

## Current state

- Primary worktree `/home/me/code/mc2` is on `develop`.
- PR #46 (`codex/career-playbook-role-suggestions` -> `develop`) is merged.
- `/push-dev --yes` promoted Career Playbook role-title suggestions to `develop` with merge commit `751cb718f129d28b49f555194eb7747b7679b261`.
- GitHub Actions run `26326959021` for `develop` completed successfully; `Deploy to Dev` succeeded.
- `/deploy --yes` promoted `develop` to `master` with merge commit `15b6a72e920dae24c7cdd1b61e9cf8b7dd922d69`.
- GitHub Actions run `26327011300` for `master` completed successfully; `Deploy to Production` succeeded. The non-blocking `Integration Tests` job failed, but the workflow conclusion and deploy job were successful.
- Health checks after delivery returned 200 `ok` for `https://dev.ai.megacampus.ru/api/health` and `https://ai.megacampus.ru/api/health`.
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

- Latest relevant Career Playbook stage: `mc2-db696.21` - production-grade role-title suggestions, delivered to Dev and staging/production route; summary and artifacts are under [`.codex/stages/mc2-db696.21`](./stages/mc2-db696.21/summary.md).
- Previous MVP stage remains under `mc2-db696.20`; earlier live-smoke foundation remains under `mc2-db696.11` and is unrelated to this frontend change.

## Next recommended

Next stage id: `mc2-db696.21`
Recommended action: no follow-up required for delivery. Authenticated browser screenshots/flow still require `TOKEN` or storage state if a future stage needs that evidence.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook / "Должностная инструкция" work in /home/me/code/mc2. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, .codex/stages/mc2-db696.21/summary.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth. Current branch is develop; mc2-db696.21 is merged via PR #46, delivered to Dev, and deployed through master. Keep manual role entry, existing fixed-answer state, RU/EN behavior, no billing/payment, no live taxonomy dependency, and no direct push to develop/master.
```

## Explicit defers

- Authenticated Playwright screenshots/flow for `/career-playbook/new` require `TOKEN` or storage state; unauthenticated guard is verified.
- Persisted normalized role metadata (`role_id`, source, confidence) is deferred until backend schema work is explicitly scoped.
- Broader ESCO/O\*NET/ISCO/Lightcast taxonomy ingestion is deferred; current implementation uses a curated static seed list.
