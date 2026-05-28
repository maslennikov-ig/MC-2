# Career Playbook ESCO Role Title Suggestions

Date: 2026-05-27
Beads: `mc2-db696.28`
Branch: `codex/career-playbook-esco-role-suggestions`

## Goal

Replace the temporary all-local role suggestion source with a local ESCO-backed subset while keeping manual entry and Russian copy usable in the constructor.

## Source

- ESCO dataset: `v1.2.1`
- Last update: `2025-12-10`
- Download: https://esco.ec.europa.eu/en/use-esco/download
- CSV structure: https://esco.ec.europa.eu/en/about-esco/escopedia/escopedia/comma-separated-values-csv
- License/terms and attribution: ESCO can be downloaded and used free of charge; the ESCO FAQ requires attribution, so MC2 records the statement `This service uses the ESCO classification of the European Commission.`

ESCO is downloadable free of charge and supports 28 languages. Russian is not one of those languages, so Russian role labels, aliases, and keywords in MC2 are explicit product-maintained fallback copy mapped to ESCO occupation URIs.

## Implementation

- Runtime remains local. The constructor does not call the ESCO live API and does not bundle the full ESCO dataset.
- `role-title-suggestions.ts` is now the public search/ranking API.
- `role-title-suggestions.types.ts` owns shared types.
- `role-title-suggestions-esco.ts` owns the normalized ESCO subset and source metadata.
- `role-title-suggestions-mc2-overlay*.ts` owns MC2 overlay records split by functional area.
- `scripts/career-playbook/import_esco_role_suggestions.py` validates a downloaded `occupations_en.csv` against `scripts/career-playbook/esco_role_suggestions_allowlist.json` and can regenerate the tracked ESCO subset.

## Product Rules

- ESCO records win over MC2 overlay records with the same stable `id`.
- MC2 overlay stays for SaaS/product-specific and market-specific titles such as B2B/B2C sales, retail/channel sales, RevOps, frontend/backend/full-stack variants, and Russian search aliases.
- Manual entry stays first-class: no-result input still lets the user keep the typed title.
- Generic Russian sales queries must show the broad sales manager role first and still include B2B, B2C, retail, channel, and related sales variants.

## Verification

Focused acceptance is covered by:

```bash
pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/role-title-suggestions.test.ts tests/unit/components/career-playbook/wizard.test.tsx tests/unit/career-playbook-store.test.ts
```

Full closeout should additionally run:

```bash
pnpm --filter @megacampus/web lint
pnpm type-check
pnpm build
python3 scripts/orchestration/run_stage_closeout.py --stage mc2-db696.28
```
