# Orchestrator Handoff

Updated: 2026-05-23
Branch: `codex/career-playbook-authoritative-roles-flow`
Base: `origin/develop`

## Current state

- PR #47 is active for `develop`; not merged and not deployed.
- Working tree implements `mc2-db696.27` LazyWeb redesign and `mc2-db696.26` readiness fix.
- Follow-up `mc2-db696.28` tracks ESCO role-title import subset.
- Product naming remains `Должностная инструкция`; header action remains `Создать описание роли`.
- No billing/payment scope, live taxonomy API, large dataset import, or protected-branch push was added.

## Changes

- Plan added: `docs/plans/career-playbook/2026-05-23-lazyweb-generation-flow-redesign.md`.
- `/career-playbook/new` is now a wide workbench: compact header, left rail, center work area, right context/readiness/generation panel.
- Global `Свободный ответ` is gone; custom answers use contextual `Другое` / `Other`.
- Company/product stage is a stable optional base question.
- Progress percent follows current step; `Отвечено` remains separate.
- Generation fix: unanswered follow-ups are skipped before review; fixed-only fallback works when no follow-up questions were stored; backend does not require stored `content_language`.
- Skipped follow-ups appear handled in the rail.

## Verification

- Web focused Vitest 75 passed; backend router Vitest 38 passed.
- `pnpm type-check`, `pnpm --filter @megacampus/web lint`, `pnpm build`, and `git diff --check` passed.
- `PLAYWRIGHT_PORT=3187 pnpm --filter @megacampus/web test:e2e:career-playbook` passed 3 and skipped 2 authenticated tests because `TOKEN` is unset.
- Visible reviewer `Leibniz` found no remaining blockers after recheck.

## Next recommended

Next stage id: `mc2-db696.27`
Recommended action: commit and push this branch to update PR #47; after review/merge, use the normal dev delivery path if Dev deployment is needed.

## Starter prompt for next orchestrator

Use $orchestrator-stage to continue Career Playbook / "Должностная инструкция" work in /home/me/code/mc2. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, .codex/stages/mc2-db696.27/summary.md, docs/plans/career-playbook/2026-05-23-lazyweb-generation-flow-redesign.md, and Beads state for mc2-db696.26/.27/.28. Current branch is codex/career-playbook-authoritative-roles-flow; do not push directly to develop/master.

## Explicit defers

- `mc2-db696.28`: ESCO import subset / normalized role-source pipeline.
- Authenticated screenshots/flow require `TOKEN` or storage state.
