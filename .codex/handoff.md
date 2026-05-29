# Orchestrator Handoff

Updated: 2026-05-29
Stage: `mc2-db696.16`
Branch: `codex/career-playbook-open-followups`

## Current State

- `mc2-db696.16` is closed locally: Career Playbook bridge synthetic markdown reserves storage quota before direct writes and releases it on failed persistence or successful bridge-course rollback.
- `mc2-db696.18` investigation found repeated master Integration Tests failed in Qdrant global setup (`getCollections` -> `Not Found`); this branch makes the integration job use a local Qdrant service container with a test API key.
- `mc2-db696.36.6` is a historical external GitHub Actions incident artifact; later develop runs pass, while run `26447325735` remains queued/inconsistent upstream.
- `mc2-db696.11.5` read-only staging preflight passes with a dedicated queue; mutation-smoke plan remains blocked by missing live gates.

## Verification

- Bridge quota RED/GREEN focused test passed after implementation: 13 tests.
- Workflow YAML parse passed.
- `pnpm --filter @megacampus/course-gen-platform type-check` passed.
- `pnpm --filter @megacampus/course-gen-platform lint` passed with existing warnings.
- `git diff --check` passed.
- `python3 scripts/orchestration/run_stage_closeout.py --stage mc2-db696.16` passed.
- Read-only staging preflight passed; non-mutating live-smoke plan reported expected blockers.

## Next recommended

Next stage id: `mc2-db696.16`
Recommended action: commit and push `codex/career-playbook-open-followups`; then deliver to `develop` only with explicit merge authorization.

## Starter prompt for next orchestrator

Use $orchestrator-stage in `/home/me/code/mc2`. Read `AGENTS.md`, `.codex/orchestrator.toml`, `.codex/handoff.md`, `.codex/stages/mc2-db696.16/summary.md`, Beads state, and `git status`. Current branch `codex/career-playbook-open-followups` contains Career Playbook bridge quota accounting plus a GitHub Actions local Qdrant integration-test fix.

## Delivery

- Commit and push `codex/career-playbook-open-followups`.
- Develop merge/dev deploy still need explicit delivery authorization.

## Explicit defers

- `mc2-db696.11.5` live mutation smoke is not run without disposable staging token/user/org, tRPC URL, cleanup scope, numeric cost budget, dedicated queue alignment, and explicit mutation confirmation.
- `mc2-db696.11.6` remains blocked by `.11.5`.
- The Qdrant CI fix needs GitHub Actions proof after branch delivery; local Docker is unavailable in this WSL environment.
