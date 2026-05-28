# Orchestrator Handoff

Updated: 2026-05-28
Stage: `mc2-db696.38`
Branch: `codex/career-playbook-smart-department`
Base: `origin/develop` at `9de0ed1654c9b9301a495d39f0bb9972d77c9f47`

## Current State

- `mc2-db696.38` implements smart Career Playbook functional-area resolution.
- Known role titles infer and save `department` locally, skip the standalone department step, and show a compact "Functional area" chip with an edit action.
- Ambiguous role titles call `careerPlaybook.session.resolveDepartmentOptions` from the Next action and show only 2-5 LLM candidates.
- LLM failure or invalid/no candidates reveals the existing full department list as fallback.
- Follow-up generation is guarded and will not start without a saved department context.
- Backend adds `department-classifier.ts`, prompt `career_playbook_department_classifier`, phase `stage_career_playbook_department_classifier`, config seed, and migration `20260528193000_add_career_playbook_department_classifier.sql`.
- Career Playbook runtime LLM calls now use `llm_model_config` for retries, fallback model, temperature, and token budget.
- Docs updated in `docs/career-playbook/README.md`, `docs/career-playbook/architecture.md`, `.codex/project-index.md`, and `.codex/stages/mc2-db696.38/summary.md`.

## Verification

- Web focused suite passed: 89 tests.
- Backend focused suite passed: 46 tests.
- `pnpm --filter @megacampus/web lint` passed.
- `pnpm type-check` passed.
- `pnpm build` passed with existing Browserslist and `url.parse()` warnings.
- `git diff --check` passed.

## Next recommended

Next stage id: `mc2-db696.38`
Recommended action: run stage closeout, close Beads, commit and push `codex/career-playbook-smart-department`; then deliver to `develop` only after explicit merge/push-dev instruction.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, this handoff, `.codex/stages/mc2-db696.38/summary.md`, Beads state, and `git status`. Current state: smart Career Playbook department resolution is implemented and locally verified on `codex/career-playbook-smart-department`; complete closeout/delivery if not already done.

## Explicit defers

- No LLM call while typing; classifier runs only from Next.
- No live HH, ESCO, Wikidata, Faker, or broad autocomplete API in the constructor.
- No dev deploy in this implementation stage.
