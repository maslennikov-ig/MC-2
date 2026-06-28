# Stage mc2-db696.88 - Career Playbook generation stability

Beads: `mc2-db696.88`
Status: implementation verified locally; not pushed per current stop rule.

## Scope

- Hardened Career Playbook `RoleProfileSpec` parsing so optional strings accept `null` as missing for `specialization`, `subordinates_description`, `industry`, and `region`.
- Stopped the Career Playbook graph immediately after `specBuilder` errors or missing `roleProfileSpec` instead of advancing through downstream nodes with invalid state.
- Made active Career Playbook progress persistence monotonic in the backend and frontend store.
- Cleared stale `job_status.error_message` / `error_stack` when retried jobs become active.

## Verification

- RED reproduced:
  - backend targeted tests failed on null optional fields, graph downstream advance, lower progress persistence, and stale job status errors.
  - web targeted tests failed on 98% -> 72% store regression.
- GREEN:
  - `pnpm --filter @megacampus/course-gen-platform test -- tests/unit/stages/stage-career-playbook/spec-builder.test.ts tests/unit/stages/stage-career-playbook/graph.test.ts tests/unit/orchestrator/handlers/career-playbook-handler.test.ts tests/unit/orchestrator/job-status-tracker.test.ts`
  - `pnpm --filter @megacampus/web exec vitest run tests/unit/career-playbook-store.test.ts tests/unit/career-playbook-store-progress.test.ts`
  - `pnpm type-check`
  - `pnpm build`
  - `git diff --check`

## Closeout Markers

project-index: reviewed-no-change - stable navigation already lists Career Playbook backend stage, frontend store/tests, and canonical verification commands; no new route, package, migration, or operator entrypoint was added.
docs-reviewed: no-change-needed - behavior hardens existing Career Playbook generation/status flow without public API, schema, route, migration, or operator workflow changes.
graph-reviewed: updated - `graphify query ...` used for routing; `graphify update .` refused non-force overwrite, then `graphify update . --force` rebuilt local graph with 52,442 nodes / 76,662 edges / 3,285 communities; `graphify cluster-only . --no-viz` completed with report updated to 52,367 nodes / 76,502 edges / 3,262 communities.
