# Stage mc2-db696.28 Summary

Status: local verified on `codex/career-playbook-esco-role-suggestions`
Updated: 2026-05-27
Branch: `codex/career-playbook-esco-role-suggestions`
Base: `origin/develop` at `62559c6f333117b1a147bb6bcc75ee3d4be1dcf8`

## Scope

- Replaced the all-local Career Playbook role suggestion source with a local ESCO-backed subset plus MC2 overlay.
- Kept constructor runtime local: no live ESCO API calls and no full ESCO dataset bundled.
- Documented ESCO `v1.2.1`, last update `2025-12-10`, source download/CSV URLs, license/terms attribution, and Russian fallback policy.
- Split the former large role suggestion file into a public search/ranking module, shared types, ESCO subset data, and MC2 overlay data split by functional area.
- Added reproducible import tooling:
  - `scripts/career-playbook/import_esco_role_suggestions.py`
  - `scripts/career-playbook/esco_role_suggestions_allowlist.json`
- Preserved manual entry and existing public functions:
  - `getPopularRoleTitleSuggestions`
  - `searchRoleTitleSuggestions`
  - `getRoleTitleSuggestionGroups`
  - `inferRoleDepartmentFromTitle`
- Preserved generic sales behavior: broad sales manager ranks first and B2B, B2C, retail, channel, and related sales variants stay discoverable.

## Routing

- Classification: medium/complex.
- Skills used: `orchestrator-stage`, `task-router`, `superpowers:brainstorming`, `superpowers:writing-plans`, `superpowers:test-driven-development`, `superpowers:executing-plans`, `superpowers:verification-before-completion`, `orchestration-closeout`.
- Documentation: official ESCO download, languages, CSV structure, and FAQ attribution/license pages were checked before implementation.
- Knowledge graph: not configured; no `graphify-out/GRAPH_REPORT.md` and no `[knowledge_graph]` in `.codex/orchestrator.toml`.
- Catalog candidates: none promoted; installed skills and agents were sufficient.

## Parallel Decomposition Matrix

| Stream             | Goal                                                           | Owner                           | Write zone                             | Dependencies           | Verification                           | Reasoning | Decision                      | Reason                                        |
| ------------------ | -------------------------------------------------------------- | ------------------------------- | -------------------------------------- | ---------------------- | -------------------------------------- | --------- | ----------------------------- | --------------------------------------------- |
| Source/docs        | Confirm ESCO version/license/languages/download shape          | local                           | read-only                              | none                   | source notes in plan/docs              | medium    | local                         | Official docs were small and directly checked |
| Code/data          | Import tooling, ESCO subset, overlay split, ranking/tests/docs | local                           | role suggestions, scripts, docs, tests | source decision        | focused tests, lint, type-check, build | high      | sequential                    | Shared data/search/test write zone            |
| Correctness review | Find behavior/ranking/import regressions                       | Ledger (`correctness_reviewer`) | read-only                              | implementation diff    | review artifact                        | high      | parallel after implementation | Independent read-only review                  |
| Docs review        | Check docs and closeout records                                | Compass (`docs_reviewer`)       | read-only                              | implementation diff    | review artifact                        | medium    | parallel after implementation | Independent read-only review                  |
| Closeout           | Beads, summary, handoff, final verification                    | local                           | `.codex/*`, Beads                      | verification + reviews | stage closeout                         | high      | sequential                    | Must happen after accepted reviews            |

## Verification Evidence

- TDD red check: new focused tests failed before implementation because ESCO source records, source metadata, and ESCO-backed sales manager were missing.
- `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/role-title-suggestions.test.ts` - passed, 9 tests.
- `pnpm --filter @megacampus/web exec vitest run tests/unit/components/career-playbook/role-title-suggestions.test.ts tests/unit/components/career-playbook/wizard.test.tsx tests/unit/career-playbook-store.test.ts` - passed, 70 tests.
- `python3 -m py_compile scripts/career-playbook/import_esco_role_suggestions.py` - passed.
- `pnpm --filter @megacampus/web lint` - passed.
- `pnpm type-check` - passed.
- `pnpm build` - passed with existing Browserslist and `url.parse()` warnings.
- `git diff --check` - passed.
- Changed-line debt marker scan for `TODO|FIXME|HACK|XXX` in touched role suggestion/docs/script paths - no matches.
- `scripts/orchestration/run_process_verification.sh --stage mc2-db696.28` - passed.
- `python3 scripts/orchestration/run_stage_closeout.py --stage mc2-db696.28` - passed.

## Review Evidence

- `correctness-review.md`: accepted; no blocking findings. Low finding about generated Python bytecode was fixed by removing `__pycache__` and adding `__pycache__/` plus `*.pyc` to `.gitignore`.
- `docs-review.md`: accepted; project index was updated for the new ESCO import entrypoint, license/terms wording was made explicit, and closeout records were prepared.

## Documentation

- `docs-reviewed: updated - Career Playbook README and ESCO role-title plan cover source/version/license/attribution/RU fallback/import script; project-index updated for the new import entrypoint.`
- `project-index: updated - added scripts/career-playbook/import_esco_role_suggestions.py as durable ESCO subset import/validation entrypoint.`
- `graph-reviewed: no-change-needed - Graphify is not configured: no graphify-out/GRAPH_REPORT.md and no [knowledge_graph] in .codex/orchestrator.toml.`

## Explicit Defers

- No live ESCO API is used in the constructor.
- No full ESCO dataset or raw `occupations_en.csv` is committed or bundled.
- No normalized role ID/source metadata is persisted to backend contracts.
- No OKZ/O\*NET/Lightcast import was added in this stage.
- Dev deploy is not included until explicitly requested.
