---
schema_version: orchestration-artifact/v1
artifact_type: review-report
task_id: mc2-db696.11-review-improvement
stage_id: mc2-db696.11
agent_type: code-reviewer-improvement
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: improvement review across CLI ergonomics, docs, E2E config, and smoke maintainability
repo: mc2
branch: codex/career-playbook-e2e-smoke
base_branch: origin/codex/career-playbook-jd-bridge
base_commit: af0aa6599bd83a371b7d3e69e9e3c1f83c96b340
worktree: /home/me/code/mc2/.worktrees/career-playbook-e2e-smoke
write_zone:
  - read-only review
success_criteria:
  - Identify practical maintainability and workflow improvements
selected_docs:
  - Context7 Playwright webServer/baseURL
  - Context7 Supabase service-role boundaries
  - Context7 Next.js custom PORT behavior
selected_skills:
  - code-review
  - superpowers:requesting-code-review
selected_agents:
  - improvement/maintainability reviewer
catalog_candidates:
  - none
parallel_group: review
depends_on_streams:
  - W1
  - W2
parallel_decision: parallel
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: not_applicable
cleanup_notes: read-only review
risk_level: medium
verification:
  - reviewer ran targeted spot checks; orchestrator reran tests and type-check after fixes
changed_files:
  - none by reviewer
explicit_defers:
  - `NODE_ENV` remains required to mirror backend readiness contract.
---

# Summary

Improvement review verdict was `NEEDS WORK` because one diagnostic issue was promoted to must-fix.

# Must-Fix Findings And Decisions

## Accepted: global env failure suppressed independent probes

Evidence: a missing Redis env skipped Supabase diagnostics, and missing Supabase env skipped Redis diagnostics.

Fix: Supabase and Redis probes are now gated independently. Tests cover Supabase-without-Redis and Redis-without-Supabase scenarios.

# Optional Improvements And Decisions

## Accepted: use the package script in docs

Docs now show `pnpm --dir packages/course-gen-platform smoke:career-playbook:preflight --target local`. The package script sets `TMPDIR=${TMPDIR:-/tmp}` to avoid the local tsx IPC socket problem in this environment.

## Accepted: clarify external `PLAYWRIGHT_BASE_URL`

Docs now state that non-local `PLAYWRIGHT_BASE_URL` targets an already-running server and does not start local `pnpm run dev`; `PLAYWRIGHT_PORT` is the managed local server path.

## Accepted: add edge-case tests for Playwright URL resolution

Tests now cover external base URL handling and path/query preservation.

## Rejected for this stage: make `NODE_ENV` non-blocking

Reason: `NODE_ENV` is part of the backend readiness contract and the preflight is intended to surface incomplete backend env. `--target` labels the smoke target; it does not replace runtime env validation.

# Verification After Fixes

- Backend preflight unit: 12 passed.
- Web config unit: 6 passed.
- Backend type-check: passed.
- Web type-check: passed.
- Package script no-env smoke: report status `blocked`; pnpm lifecycle exit observed as 1 while script reports exit code 2 internally.

# Risks / Follow-ups

- `NODE_ENV` remains required by design; if operators need a looser local-only preflight later, create a separate Beads task instead of weakening the backend readiness contract here.
