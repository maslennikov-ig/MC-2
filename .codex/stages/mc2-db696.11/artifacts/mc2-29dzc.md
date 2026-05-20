---
schema_version: orchestration-artifact/v1
artifact_type: delegated-stream
task_id: mc2-29dzc
stage_id: mc2-db696.11
agent_type: worker
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: backend smoke touches env, Supabase, Redis, and mutation-safety boundaries
repo: mc2
branch: codex/career-playbook-e2e-smoke
base_branch: origin/codex/career-playbook-jd-bridge
base_commit: af0aa6599bd83a371b7d3e69e9e3c1f83c96b340
worktree: /home/me/code/mc2/.worktrees/career-playbook-e2e-smoke
write_zone:
  - packages/course-gen-platform/src/**
  - packages/course-gen-platform/scripts/**
  - packages/course-gen-platform/tests/unit/**
  - packages/course-gen-platform/package.json
  - .codex/stages/mc2-db696.11/artifacts/mc2-29dzc.md
success_criteria:
  - TDD RED/GREEN/REFACTOR followed for backend preflight behavior
  - Read-only checks distinguished from mutation smoke with hard stop rules
  - Required env names explicit, including backend SUPABASE_SERVICE_KEY vs web SUPABASE_SERVICE_ROLE_KEY
  - CLI output masks secrets and prints only safe presence/origin/status details
  - Remote/live schema absence is reported as readiness blocker, not solved by migration
  - Package script added where it fits backend conventions
selected_docs:
  - Context7 Supabase service-role/admin guidance
selected_skills:
  - superpowers:test-driven-development
  - superpowers:systematic-debugging
  - superpowers:verification-before-completion
selected_agents:
  - worker
catalog_candidates:
  - none
parallel_group: W2
depends_on_streams:
  - none
parallel_decision: parallel
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: not_applicable
cleanup_notes: no destructive cleanup needed; no commit or push performed yet
risk_level: medium
verification:
  - pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/smoke/career-playbook-preflight.test.ts: passed
  - pnpm --filter @megacampus/course-gen-platform type-check: passed
  - pnpm --dir packages/course-gen-platform exec tsx scripts/career-playbook-smoke-preflight.ts --target local with blank env: blocked as expected, exit 2
changed_files:
  - packages/course-gen-platform/package.json
  - packages/course-gen-platform/scripts/career-playbook-smoke-preflight.ts
  - packages/course-gen-platform/src/smoke/career-playbook-preflight.ts
  - packages/course-gen-platform/tests/unit/smoke/career-playbook-preflight.test.ts
  - .codex/stages/mc2-db696.11/artifacts/mc2-29dzc.md
explicit_defers:
  - Live Supabase/Redis readiness was not exercised because this stage has no approved live secrets and remote Career Playbook schema is absent.
  - Mutation smoke remains deferred behind explicit approval, disposable fixtures, queue isolation, cleanup authorization, and non-staging/prod safety checks.
---

# Summary

Implemented a backend-only Career Playbook smoke preflight planner, runner, formatter, and CLI. The preflight is read-only by default: it can verify required env presence, run Supabase head-only schema probes, run Redis PING, and resolve the BullMQ queue name without adding jobs or starting workers. Mutation smoke is represented as skipped or blocked and is never executed by this command.

Orchestrator review added two fixes after the worker returned:

- `queue-readiness` now stays `skipped` until Redis PING proves readiness and becomes `fail` when Redis PING fails.
- Redis PING now uses a short-lived dedicated `ioredis` client with `enableOfflineQueue: false`, `maxRetriesPerRequest: 1`, `connectTimeout: 2000`, and no retry strategy instead of the app worker retry client.

# Scope / Routing

The work stayed in the W2 backend write zone. It did not touch web Playwright config or sibling W1 files. The planner explicitly distinguishes backend `SUPABASE_SERVICE_KEY` from web `SUPABASE_SERVICE_ROLE_KEY`; if only the web variable is present, backend readiness fails with a warning rather than treating it as a substitute.

Remote/live schema absence is handled as a `blocked` readiness result with guidance not to apply migrations from the preflight. Supabase service-role access is documented in the result as trusted server access and not RLS proof.

# Verification

RED:

```bash
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-service-key SUPABASE_ANON_KEY=test-anon-key REDIS_URL=redis://127.0.0.1:6379 NODE_ENV=test pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/smoke/career-playbook-preflight.test.ts
```

Failed before implementation with:

```text
Error: Cannot find package '@/smoke/career-playbook-preflight'
```

GREEN:

```bash
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-service-key SUPABASE_ANON_KEY=test-anon-key REDIS_URL=redis://127.0.0.1:6379 NODE_ENV=test pnpm --filter @megacampus/course-gen-platform exec vitest run --config vitest.config.unit.ts tests/unit/smoke/career-playbook-preflight.test.ts
```

Passed: 1 test file, 7 tests after orchestrator RED/GREEN fixes.

Additional verification:

```bash
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_KEY=test-service-key SUPABASE_ANON_KEY=test-anon-key REDIS_URL=redis://127.0.0.1:6379 NODE_ENV=test pnpm --filter @megacampus/course-gen-platform type-check
```

Passed.

CLI safe blocker smoke:

```bash
TMPDIR=/tmp NODE_ENV= SUPABASE_URL= SUPABASE_SERVICE_KEY= SUPABASE_SERVICE_ROLE_KEY= SUPABASE_ANON_KEY= REDIS_URL= pnpm --dir packages/course-gen-platform exec tsx scripts/career-playbook-smoke-preflight.ts --target local
```

Returned exit status 2 with `status: blocked`, missing env failures, read-only Supabase/Redis/queue checks blocked, and mutation smoke skipped. No live Supabase, Redis, queue, user, cleanup, or LLM operation was attempted.

# Delivery / Cleanup

Accepted by orchestrator after reviewing the diff, finding and fixing the queue-readiness and Redis-client issues, and rerunning targeted tests. No commit or push has been performed yet. No destructive cleanup was needed.

# Risks / Follow-ups / Explicit Defers

The default Supabase probe uses a local read-only client interface because generated shared Supabase table types do not yet include `career_playbooks` or `career_playbook_fixed_questions`; this matches the current codebase pattern where Career Playbook router code carries local table adapters. Updating generated shared database types remains outside this worker scope.

`tsx` in this environment tried to create an IPC socket under `/mnt/c/...` unless `TMPDIR=/tmp` was set. The successful CLI evidence used `TMPDIR=/tmp`; this is an environment runtime issue, not preflight behavior.
