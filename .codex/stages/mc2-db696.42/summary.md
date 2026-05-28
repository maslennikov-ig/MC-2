# Stage mc2-db696.42 Summary

Status: locally verified; ready for delivery
Updated: 2026-05-28
Branch: `codex/career-playbook-clickable-options`

## Scope

- Fixed Career Playbook generation enqueue failure caused by a BullMQ-unsafe custom job id.
- Replaced `career-playbook:<playbookId>` with `career-playbook-<playbookId>` through a shared helper.
- Kept stale terminal job cleanup and live-smoke cleanup manifest aligned with the same stable job id.

## Root Cause

- BullMQ 5.66.3 rejects custom job ids containing `:`.
- `approveCareerPlaybookGeneration` used `career-playbook:<uuid>`, so clicking Generate could fail before the worker received the job.

## Verification

- TDD red check: router tests failed while the service still used the colon-separated job id.
- `pnpm --dir packages/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/server/routers/career-playbook.router.test.ts tests/unit/smoke/career-playbook-live-smoke.test.ts` - passed, 48 tests.
- `pnpm --dir packages/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/server/routers/career-playbook.router.test.ts tests/unit/smoke/career-playbook-live-smoke.test.ts tests/unit/orchestrator/queue-cleanup.test.ts tests/unit/orchestrator/handlers/career-playbook-handler.test.ts tests/unit/orchestrator/worker-career-playbook-failure.test.ts` - passed, 59 tests.
- `pnpm --filter @megacampus/course-gen-platform lint` - passed with existing warnings.
- `pnpm type-check` - passed.
- `pnpm build` - passed on rerun with extended timeout; the first run timed out at 120s during Next build trace collection.
- `git diff --check` - passed.

## Documentation

- `project-index: reviewed-no-change - no new route, package, entrypoint, long-lived integration, or verification command was added; the new helper is internal to existing Career Playbook generation.`
- `docs-reviewed: no-change-needed - no public API, operator workflow, or user-facing behavior changed; only internal BullMQ job id formatting and smoke cleanup target changed.`
- `graph-reviewed: no-change-needed - Graphify is not configured; no graphify-out/GRAPH_REPORT.md.`
