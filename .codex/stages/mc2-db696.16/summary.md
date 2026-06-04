# Stage mc2-db696.16 Summary

Status: delivered to develop and Dev
Updated: 2026-05-29
Branch: `develop`
Base: `origin/develop` @ `a92ffb704cc854b0b04a7ff78421f53a96e5d3e8`

## Scope

- `mc2-db696.16`: Career Playbook bridge synthetic markdown now explicitly reserves storage quota before direct file writes and releases it on failed persistence or successful bridge-course rollback.
- `mc2-db696.18`: repeated master Integration Tests failures were traced to Qdrant global setup (`getCollections` returned `Not Found`), so the integration job now runs a local Qdrant service container with a test API key.
- `mc2-db696.36.6`: refreshed CI state shows later develop runs pass; the old queued checkout-403 run remains a historical external GitHub incident artifact.
- `mc2-db696.11.5`: read-only staging preflight still passes with a dedicated queue, while mutation-smoke plan mode remains blocked by missing external live gates.

## Parallel Decomposition Matrix

| Stream       | Goal                                | Owner | Write zone                     | Dependencies                | Verification                 | Decision   | Reason                                              |
| ------------ | ----------------------------------- | ----- | ------------------------------ | --------------------------- | ---------------------------- | ---------- | --------------------------------------------------- |
| Live gates   | Check whether `.11.5/.11.6` can run | local | read-only                      | staging fixtures and budget | preflight/live plan          | sequential | mutation smoke needs external approval and fixtures |
| CI           | Diagnose `.18/.36.6`                | local | workflow + Beads               | GitHub logs/API             | gh logs, workflow YAML parse | sequential | small workflow fix, no local Docker                 |
| Bridge quota | Implement `.16`                     | local | Career Playbook bridge + tests | none                        | TDD Vitest, type-check, lint | sequential | shared backend verification and same files          |
| Closeout     | Record truth                        | local | `.codex`, Beads                | verification                | closeout script              | sequential | after code gates                                    |

## Verification

- RED: bridge quota tests failed before implementation because storage exports/quota behavior did not exist.
- GREEN: `pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/server/routers/career-playbook-course-bridge.service.test.ts` passed, 13 tests.
- `python3` YAML parse for `.github/workflows/ci-cd.yml` passed.
- `pnpm --filter @megacampus/course-gen-platform type-check` passed.
- `pnpm --filter @megacampus/course-gen-platform lint` passed with existing warnings.
- `git diff --check` passed.
- `python3 scripts/orchestration/run_stage_closeout.py --stage mc2-db696.16` passed.
- `bash .claude/scripts/push-dev.sh --yes` merged `codex/career-playbook-open-followups` into `develop` as `66e74eff` and pushed `develop`.
- GitHub Actions run `26622781178` passed; `Deploy to Dev` passed.
- `curl -fsS https://dev.ai.megacampus.ru/api/health` returned `{"status":"ok"}`.
- Read-only staging preflight passed with `BULLMQ_QUEUE_NAME=career-playbook-smoke-20260529`.
- Non-mutating live-smoke plan remained blocked as expected because tRPC URL, token, disposable user/org IDs, cleanup scope, positive cost budget, and `--confirm-live-mutation` were not provided.

## Documentation

- `docs-reviewed: updated - docs/career-playbook/architecture.md documents Course Bridge storage/quota behavior; .codex/project-index.md points to the split storage module.`
- `project-index: updated - added the Career Playbook course bridge storage/quota helper location.`
- `graph-reviewed: no-change-needed - Graphify is not configured; no graphify-out/GRAPH_REPORT.md.`

## Explicit Defers

- `mc2-db696.11.5` live mutation smoke remains gated on disposable staging fixtures, token, tRPC URL, dedicated queue alignment, cleanup scope, numeric LLM/API budget, and explicit mutation confirmation.
- `mc2-db696.11.6` remains blocked until `.11.5` succeeds.
- `.github/workflows/ci-cd.yml` Qdrant service fix still needs master/PR Integration Tests proof; the develop run skipped Integration Tests by workflow design, and Docker is not available in this local WSL environment.
