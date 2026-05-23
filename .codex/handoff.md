# Orchestrator Handoff

Updated: 2026-05-23
Current working branch: `codex/career-playbook-authoritative-roles-flow`
Base branch: `origin/develop`
Base head: `a1a82bd317268fa8f507416bf17b62c03691147e`

## Current state

- Primary worktree `/home/me/code/mc2` is on `codex/career-playbook-authoritative-roles-flow`.
- Active Beads task: `mc2-db696.22` (`Career Playbook: replace curated role suggestions with authoritative occupation source`).
- This stage is open as PR #47 (`codex/career-playbook-authoritative-roles-flow` -> `develop`); it has not been merged to `develop` and has not been deployed.
- Previous PR #46 remains the latest delivered baseline: role suggestions were delivered to Dev and staging/production route before this new correction stage.
- Career Playbook Russian naming remains `Должностная инструкция`; header action remains `Создать описание роли`; do not regress to unclear wording such as `руководство роли`.
- The current stage removes the global `Свободный ответ` action from fixed/follow-up flows.
- Choice questions now expose contextual `Другое` / `Other` with inline custom entry; `content_language` intentionally does not.
- Empty custom choices are kept as local UI draft until the user types, but are not stored, autosaved, or submitted as answers.
- Follow-up bug `mc2-db696.23` fixes fixed-question progress percent so it follows the current step, while `Отвечено` remains a separate count.
- Follow-up bug `mc2-db696.24` removes visible unstable `из N` totals from fixed and adaptive follow-up headers.
- Role suggestions now use source-aware `mc2_overlay` records with source references instead of claiming a generic `curated` source.
- Generic `Менеджер по продажам` now suggests broad Sales Manager plus B2C, retail, channel/account, and B2B variants.
- Selecting or typing a recognizable role infers the likely department when the department answer is still empty.
- No backend schema change, billing/payment scope, live taxonomy API, large dataset import, or paid runtime dependency was added.

## Latest relevant stage

- Current stage: `mc2-db696.22` - authoritative role-source direction, contextual `Другое`, no global free-form button. Summary and artifacts are under [`.codex/stages/mc2-db696.22`](./stages/mc2-db696.22/summary.md).
- Research plan: [`docs/plans/career-playbook/2026-05-23-authoritative-role-source-and-other-flow.md`](../docs/plans/career-playbook/2026-05-23-authoritative-role-source-and-other-flow.md).

## Next recommended

Next stage id: `mc2-db696.22`
Recommended action: review/merge PR #47 to `develop`, then use the normal `/push-dev` delivery path if Dev deployment is needed. Do not push directly to `develop` or `master`.

## Starter prompt for next orchestrator

```text
Use $orchestrator-stage to continue Career Playbook / "Должностная инструкция" work in /home/me/code/mc2. Read AGENTS.md, .codex/orchestrator.toml, .codex/handoff.md, .codex/stages/mc2-db696.22/summary.md, docs/plans/quiet-waddling-starfish.md, and docs/plans/career-playbook/* first. Use Beads as source of truth. Current branch is codex/career-playbook-authoritative-roles-flow based on origin/develop at a1a82bd317268fa8f507416bf17b62c03691147e. Keep manual role entry, contextual Другое/Other, existing fixed-answer state, RU/EN behavior, no billing/payment, no live taxonomy dependency, and no direct push to develop/master.
```

## Explicit defers

- Full OKZ/O\*NET/ESCO import pipeline and normalized `role_id`/source/confidence persistence.
- Lightcast integration until commercial access is approved.
- Authenticated browser screenshots/flow for `/career-playbook/new` require `TOKEN` or storage state; unauthenticated guard is verified.
