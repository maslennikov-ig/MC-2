---
schema_version: orchestration-artifact/v1
artifact_type: review-report
task_id: mc2-db696.11-review-correctness
stage_id: mc2-db696.11
agent_type: code-reviewer-correctness
subagent_model: inherit_orchestrator
reasoning_effort: high
model_reasoning_rationale: correctness/security review across Playwright, Supabase, Redis, and smoke safety boundaries
repo: mc2
branch: codex/career-playbook-e2e-smoke
base_branch: origin/codex/career-playbook-jd-bridge
base_commit: af0aa6599bd83a371b7d3e69e9e3c1f83c96b340
worktree: /home/me/code/mc2/.worktrees/career-playbook-e2e-smoke
write_zone:
  - read-only review
success_criteria:
  - Identify must-fix correctness/security issues with evidence
selected_docs:
  - Context7 Playwright webServer/baseURL
  - Context7 Supabase service-role boundaries
  - Context7 Next.js custom PORT behavior
selected_skills:
  - code-review
  - superpowers:requesting-code-review
selected_agents:
  - correctness/security reviewer
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
  - reviewer did not run commands; orchestrator reran targeted tests and type-check after fixes
changed_files:
  - none by reviewer
explicit_defers:
  - Live Supabase/Redis mutation smoke remains approval-gated.
---

# Summary

Correctness review verdict was `NEEDS WORK`.

# Must-Fix Findings And Decisions

## Accepted: preflight can probe the wrong target

Evidence: `packages/course-gen-platform/src/smoke/career-playbook-preflight.ts` built env checks from `input.env`, while default probes used `process.env` or the cached Supabase admin singleton.

Fix: default Supabase and Redis probes now receive the resolved env object. Supabase schema probe uses an env-scoped `createClient` instead of the global admin singleton. Tests assert supplied-env probe calls and Supabase probe config.

## Accepted: raw probe messages can bypass masking

Evidence: probe `result.message` was interpolated directly into check notes.

Fix: added `sanitizeSmokeMessage()` and applied it to Supabase/Redis failure notes and default probe catch blocks. Tests cover known env values, Redis URL credentials, and JWT-like strings.

## Accepted: external `PLAYWRIGHT_BASE_URL` was treated like a local managed server

Evidence: `https://staging.example.com` would resolve port `443` and still configure local `pnpm run dev`.

Fix: Playwright config now distinguishes local managed URLs from external existing targets. Non-local `PLAYWRIGHT_BASE_URL` sets `baseURL` but does not configure `webServer`. Tests cover external URL and path/query preservation.

# Optional Findings And Decisions

## Accepted: risky branches needed focused tests

Covered by added tests in:

- `packages/course-gen-platform/tests/unit/smoke/career-playbook-preflight.test.ts`
- `packages/web/tests/unit/playwright-config.test.ts`

# Verification After Fixes

- Backend preflight unit: 12 passed.
- Web config unit: 6 passed.
- Backend type-check: passed.
- Web type-check: passed.
- Playwright unauth smoke on `PLAYWRIGHT_PORT=3101`: passed, 1 test.

# Risks / Follow-ups

- Live Supabase/Redis mutation smoke remains blocked until staging schema, credentials, disposable fixtures, dedicated queue, cleanup authorization, and API cost approval are available.
