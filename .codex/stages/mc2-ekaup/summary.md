# Stage `mc2-ekaup` — durable Career Playbook block actions

Accepted stage id: `mc2-ekaup`
Status: accepted locally; remote delivery not requested.

## Scope and outcome

- Commit `26123e324` removes the misleading local-save success path. When backend edit is
  unavailable, the viewer does not mutate and says the change was not saved.
- Commit `e0572c25b` implements owner-only `library.edit` and `library.regenerateBlock`, persists
  block state with consistent `final_markdown`, polls the stored regeneration result, compensates
  queue-preparation failure, and prevents delayed responses from mutating another open playbook.
- Reindex, migrations, secrets/access changes, deploy, and live paid generation were not performed.

## Acceptance

`run_stage_closeout.py --level slice_acceptance` passed with the focused backend and web
regression set, `pnpm run type-check`, `pnpm run build`, and process verification. The authenticated
mutable E2E scenario was intentionally outside this local boundary.

## Reviews

Documentation: no external/versioned boundary - this stage changes only repository-owned UI,
router, queue, and persistence behavior.

docs-reviewed: updated - `docs/career-playbook/architecture.md` documents durable edit and
regeneration, polling, queue rollback, and failed-block behavior.

project-index: reviewed-no-change - the existing index already owns the Career Playbook library
service and the web store; no new top-level subsystem or navigation entry was introduced.

graph-reviewed: updated - local Graphify 0.9.14 refreshed the code graph at commit `e0572c25b`
without semantic/API labeling; `graphify check-update .` passed and the report matches that commit.

## Evidence

- Backend focused Vitest (`vitest.config.unit.ts`): 72 tests passed.
- Web focused Vitest: 24 tests passed.
- `pnpm run type-check`: passed.
- `pnpm run build`: passed.
- `scripts/orchestration/run_process_verification.sh --stage mc2-ekaup`: passed.
- Added red-green coverage for false save success, edit/reload persistence, regeneration
  persistence and failure, queue rollback, owner authorization, and stale viewer responses.
- ESLint found 0 errors and 8 size warnings; `--max-warnings=0` therefore exited 1 and is not
  recorded as a passing gate.
- The successful web build emitted Node `DEP0169 url.parse()` warnings from page-data workers.
  The call site is outside this diff and is tracked as `mc2-p2908.1`; no blind dependency upgrade
  was attempted.

## Explicit defers

- `mc2-p2908.1` — trace and remove/reclassify the existing Node `DEP0169 url.parse()` build
  warning in a separate slice; it is not caused by the Career Playbook transport change.
