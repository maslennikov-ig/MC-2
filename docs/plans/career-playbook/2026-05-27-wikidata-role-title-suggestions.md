# Career Playbook Wikidata RU Role Title Suggestions

Date: 2026-05-27
Beads: `mc2-db696.37`
Branch: `codex/career-playbook-wikidata-role-suggestions`

## Goal

Add a small local Wikidata-backed Russian role suggestion layer for operational
roles that are weakly covered by the ESCO subset and MC2 product overlay.

## Source

- Source: Wikidata structured data
- License: `CC0 1.0`
- License page: https://www.wikidata.org/wiki/Wikidata:Licensing
- API used by the import script: `wbgetentities`
- API help: https://www.wikidata.org/w/api.php?action=help&modules=wbgetentities

Wikidata is not used as a live autocomplete dependency. The import script fetches
only reviewed QIDs from the tracked allowlist and writes a small TypeScript
subset. No broad SPARQL crawl, Wikidata dump, HH data, or Faker/Wikipedia list is
used in the constructor runtime.

## Implementation

- Runtime remains local.
- `role-title-suggestions.ts` merges sources in this order: ESCO, Wikidata, MC2
  overlay. Earlier sources win on duplicate stable `id`.
- `role-title-suggestions-wikidata.ts` owns the generated Wikidata subset and
  Wikidata source metadata.
- `scripts/career-playbook/import_wikidata_role_suggestions.py` fetches
  allowlisted QIDs via `wbgetentities`, validates that each entity exists, merges
  reviewed labels/aliases with Wikidata labels, and regenerates the tracked
  subset.
- `scripts/career-playbook/wikidata_role_suggestions_allowlist.json` owns the
  reviewed QID list, departments, groups, seniority, ranking, and MC2-reviewed
  copy.

## Initial Allowlist

- `system-administrator` - `Q327353`
- `database-administrator` - `Q1078262`
- `office-manager` - `Q1966741`
- `secretary` - `Q319544`
- `technical-support-specialist` - `Q33492554`

## Verification

Focused acceptance is covered by:

```bash
python3 -m py_compile scripts/career-playbook/import_wikidata_role_suggestions.py
pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/role-title-suggestions.test.ts tests/unit/components/career-playbook/wizard.test.tsx tests/unit/career-playbook-store.test.ts
```

Full closeout should additionally run:

```bash
pnpm --filter @megacampus/web lint
pnpm type-check
pnpm build
python3 scripts/orchestration/run_stage_closeout.py --stage mc2-db696.37
```
