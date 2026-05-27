# Orchestrator Handoff

Updated: 2026-05-27
Stage: `mc2-db696.28`
Branch: `codex/career-playbook-esco-role-suggestions`
Base: `origin/develop` at `62559c6f333117b1a147bb6bcc75ee3d4be1dcf8`

## Current State

- `mc2-db696.28` is in progress and locally verified.
- Career Playbook role suggestions now use a local ESCO-backed subset plus MC2 overlay.
- The constructor does not call the ESCO live API and does not bundle the full ESCO dataset.
- Russian role labels are explicit MC2 fallback copy because ESCO does not include Russian.
- The former large role suggestion file is split into search/ranking API, types, ESCO data, and MC2 overlay modules.
- Import tooling is tracked under `scripts/career-playbook/`.

## Verification

- Focused role suggestion tests passed after red/green TDD.
- Focused Career Playbook wizard/store suite passed: 70 tests.
- `python3 -m py_compile scripts/career-playbook/import_esco_role_suggestions.py` passed.
- `pnpm --filter @megacampus/web lint` passed.
- `pnpm type-check` passed.
- `pnpm build` passed with existing Browserslist and `url.parse()` warnings.
- `git diff --check` passed.
- Read-only correctness and docs reviews were accepted.

## Next recommended

Next stage id: `mc2-db696.28`
Recommended action: commit and push `codex/career-playbook-esco-role-suggestions`, then close or update Beads according to delivery status. Do not deploy to Dev unless explicitly requested.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Continue `mc2-db696.28` on branch `codex/career-playbook-esco-role-suggestions`. Read `AGENTS.md`, `.codex/orchestrator.toml`, this handoff, `.codex/stages/mc2-db696.28/summary.md`, artifacts under `.codex/stages/mc2-db696.28/artifacts/`, Beads state, and `git status`. Current state: ESCO role suggestion subset, MC2 overlay split, import script, docs, and tests are implemented locally; closeout/delivery remains.

## Explicit defers

- No live ESCO API in the constructor.
- No full ESCO dataset or raw CSV committed/bundled.
- No backend persistence of normalized role IDs/source metadata.
- No OKZ/O\*NET/Lightcast import in this stage.
- No Dev deploy without explicit approval.
