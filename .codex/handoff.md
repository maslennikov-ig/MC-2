# Orchestrator Handoff

Updated: 2026-05-28
Stage: `mc2-p2cfr`
Branch: `codex/update-github-actions-node24`
Base: `origin/develop` at `5db4ee8b080b049999cddde7985c01976449ef3d`

## Current State

- `mc2-db696.28` and `mc2-db696.37` are closed and merged into `develop`.
- Career Playbook role suggestions now use a local ESCO-backed subset, a small allowlisted Wikidata RU layer, and MC2 overlay records.
- Runtime remains local: no live ESCO, Wikidata, HH, Faker, SPARQL crawl, or broad dump dependency in the constructor.
- Source merge order is ESCO, Wikidata, then MC2 overlay, with first-source-wins duplicate handling.
- ESCO and Wikidata import tooling is tracked under `scripts/career-playbook/`.
- `develop` was pushed to `origin/develop` after post-merge verification.
- Follow-up stage `mc2-p2cfr` updates the active CI/CD workflow to Node 24-compatible GitHub Actions while keeping app Node, pnpm, CI commands, and deploy scripts unchanged.

## Verification

- ESCO and Wikidata focused stage checks passed before merge.
- Post-merge import script compile passed for ESCO and Wikidata importers.
- Post-merge focused Career Playbook wizard/store suite passed: 72 tests.
- Post-merge `pnpm --filter @megacampus/web lint` passed.
- Post-merge `pnpm type-check` passed.
- Post-merge `pnpm build` passed with existing Browserslist and `url.parse()` warnings.
- `mc2-p2cfr` local verification passed: YAML parse, old-action grep check, `git diff --check`, `pnpm type-check`, `pnpm build`, and `pnpm lint` with existing warnings only.

## Next recommended

Next stage id: `mc2-p2cfr`
Recommended action: deliver the GitHub Actions Node 24 update to `develop` and monitor the resulting dev CI/CD run. Do not deploy to staging or production without explicit approval.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, this handoff, `.codex/stages/mc2-p2cfr/summary.md`, Beads state, and `git status`. Current state: ESCO and Wikidata role suggestion source branches are merged into `develop`; `mc2-p2cfr` updates the active GitHub Actions workflow to Node 24-compatible action versions and has passed local verification.

## Explicit defers

- No live ESCO, Wikidata, HH, Faker, or SPARQL autocomplete in the constructor.
- No full ESCO or Wikidata dump committed or bundled.
- No backend persistence of normalized role IDs/source metadata.
- No staging or production deploy without explicit approval.
- Disabled workflow snapshots (`.yml.dis`, `.bak`) are not updated in `mc2-p2cfr`.
