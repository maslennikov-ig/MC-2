# Orchestrator Handoff

Updated: 2026-05-27
Stage: `mc2-db696.37`
Branch: `codex/career-playbook-wikidata-role-suggestions`
Base: stacked on `codex/career-playbook-esco-role-suggestions` at `5d88716e4cf3821eaf3c724910ca8af21d402a3d`

## Current State

- `mc2-db696.37` is closed and adds a local Wikidata-backed RU layer to Career Playbook role-title suggestions.
- The branch is stacked on the ESCO source branch because ESCO changes are not yet in `develop`.
- Runtime remains local: no live Wikidata, HH, Faker, SPARQL crawl, or broad dump dependency in the constructor.
- ESCO remains the first source, Wikidata is second, and MC2 overlay remains third with first-source-wins duplicate handling.
- Wikidata source metadata records CC0, `wbgetentities`, and allowlist-only import policy.
- The Wikidata allowlist/import script is tracked under `scripts/career-playbook/`.

## Verification

- TDD red check failed before implementation for missing Wikidata source, metadata, and RU operational role search.
- Focused role suggestion tests passed: 11 tests.
- Focused Career Playbook wizard/store suite passed: 72 tests.
- `python3 -m py_compile scripts/career-playbook/import_wikidata_role_suggestions.py` passed.
- `pnpm --filter @megacampus/web lint` passed.
- `pnpm type-check` passed.
- `pnpm build` passed with existing Browserslist and `url.parse()` warnings.
- `git diff --check` passed.
- `python3 scripts/orchestration/run_stage_closeout.py --stage mc2-db696.37` passed.

## Next recommended

Next stage id: `mc2-db696.37`
Recommended action: review/merge this stacked branch after the ESCO source branch lands; do not deploy to Dev unless explicitly requested.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Continue `mc2-db696.37` on branch `codex/career-playbook-wikidata-role-suggestions`. Read `AGENTS.md`, `.codex/orchestrator.toml`, this handoff, `.codex/stages/mc2-db696.37/summary.md`, Beads state, and `git status`. Current state: Wikidata RU source layer, allowlist import script, docs, tests, Beads close, and stage closeout are complete; branch is stacked on the ESCO source branch.

## Explicit defers

- No live Wikidata, HH, Faker, or SPARQL autocomplete in the constructor.
- No full Wikidata dump or broad GitHub/Faker role list committed or bundled.
- No backend persistence of normalized role IDs/source metadata.
- No Dev deploy without explicit approval.
