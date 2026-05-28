# Orchestrator Handoff

Updated: 2026-05-28
Stage: `mc2-db696.42`
Branch: `codex/career-playbook-clickable-options`

## Current State

- `mc2-db696.42` fixes the Career Playbook "Failed to enqueue Career Playbook generation" error.
- Root cause: BullMQ rejects custom job ids containing `:`; Career Playbook generation used `career-playbook:<playbookId>`.
- Generation now uses a stable BullMQ-safe id: `career-playbook-<playbookId>`.
- Stale terminal job cleanup and live-smoke cleanup manifest use the same shared helper.

## Verification

- TDD red check: router tests failed while the service still used the colon-separated job id.
- Focused Career Playbook backend suite passed: 59 tests.
- `pnpm --filter @megacampus/course-gen-platform lint` passed with existing warnings.
- `pnpm type-check` passed.
- `pnpm build` passed on rerun with extended timeout.
- `git diff --check` passed.

## Next recommended

Next stage id: `mc2-db696.42`
Recommended action: commit and push `codex/career-playbook-clickable-options`; then deliver to `develop` or dev deploy only after explicit user instruction.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, `.codex/stages/mc2-db696.42/summary.md`, Beads state, and `git status`. Current state: `mc2-db696.42` fixes Career Playbook generation enqueue by replacing BullMQ-unsafe `career-playbook:<playbookId>` ids with `career-playbook-<playbookId>`; verify delivery status before any merge or deploy.

## Delivery

- Commit and push `codex/career-playbook-clickable-options`.
- Dev deploy still needs an explicit delivery step if the user wants this on dev immediately.

## Explicit defers

- No live smoke mutation was run.
- No dev deploy was run as part of this bugfix.
