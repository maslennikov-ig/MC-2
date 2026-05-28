# Orchestrator Handoff

Updated: 2026-05-28
Stage: `mc2-db696.37`
Branch: `develop`
Base: `origin/develop` at `62559c6f333117b1a147bb6bcc75ee3d4be1dcf8`

## Current State

- `mc2-db696.28` and `mc2-db696.37` are closed and merged locally into `develop`.
- Career Playbook role suggestions now use a local ESCO-backed subset, a small allowlisted Wikidata RU layer, and MC2 overlay records.
- Runtime remains local: no live ESCO, Wikidata, HH, Faker, SPARQL crawl, or broad dump dependency in the constructor.
- Source merge order is ESCO, Wikidata, then MC2 overlay, with first-source-wins duplicate handling.
- ESCO and Wikidata import tooling is tracked under `scripts/career-playbook/`.
- `develop` is ahead of `origin/develop`; post-merge verification passed and push remains.

## Verification

- ESCO and Wikidata focused stage checks passed before merge.
- Post-merge import script compile passed for ESCO and Wikidata importers.
- Post-merge focused Career Playbook wizard/store suite passed: 72 tests.
- Post-merge `pnpm --filter @megacampus/web lint` passed.
- Post-merge `pnpm type-check` passed.
- Post-merge `pnpm build` passed with existing Browserslist and `url.parse()` warnings.

## Next recommended

Next stage id: `mc2-db696.37`
Recommended action: commit the post-merge handoff update, push `develop`, then push Beads if needed. Do not deploy to staging or production without explicit approval.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Continue post-merge delivery for `mc2-db696.37` on `develop`. Read `AGENTS.md`, `.codex/orchestrator.toml`, this handoff, `.codex/stages/mc2-db696.28/summary.md`, `.codex/stages/mc2-db696.37/summary.md`, Beads state, and `git status`. Current state: ESCO and Wikidata role suggestion source branches are merged locally into `develop`; post-merge verification passed; push remains.

## Explicit defers

- No live ESCO, Wikidata, HH, Faker, or SPARQL autocomplete in the constructor.
- No full ESCO or Wikidata dump committed or bundled.
- No backend persistence of normalized role IDs/source metadata.
- No staging or production deploy without explicit approval.
