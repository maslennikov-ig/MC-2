---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-dqbw1/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: lesson-inspector-panel
public_facade: useLessonInspectorData-loading-state
bounded_acceptance: auth-resolved-without-session clears the Lesson Inspector loading state while authenticated fetching remains stable
non_goals:
  - claiming or diagnosing the historical valid-superadmin incident without a running-app trace
  - changing Supabase auth, Lesson Inspector queries, or layout
  - deploy, merge, push, live mutation, reindex, migration, secrets, access, or paid calls
evidence:
  - acceptance-receipt
task_id: mc2-dqbw1
epic_id: mc2-p2908
stage_id: mc2-dqbw1
session_id: mc2-dqbw1
milestone: cohesive-vertical-slice
milestone_status: accepted
agent_type: custom
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one localized auth-state transition in a web data hook owned by the root executor
repo: mc2
branch: develop
base_branch: develop
base_commit: 244a24ffe
worktree: /home/me/code/mc2
write_zone:
  - packages/web Lesson Inspector data hook and focused tests
  - repository-local orchestration state
success_criteria:
  - loading remains true while authLoading is true
  - loading becomes false when authLoading is false and session is null
  - an authenticated transition still invokes existing data fetch once
  - focused web tests, type-check, and build pass
selected_docs:
  - specs/026-post-triage-priorities/spec.md
selected_skills:
  - orchestrator-stage
  - graphify-project
  - superpowers-test-driven-development
selected_agents:
  - none
catalog_candidates:
  - none
parallel_group: n/a
depends_on_streams:
  - none
parallel_decision: local
status: accepted
delivery_method: manual integration
accepted_by_orchestrator: yes
cleanup_status: cleaned
cleanup_notes: root owner uses the primary develop worktree; no child branch or worktree exists
risk_level: medium
risk_tags:
  - ui
  - auth
  - state-transition
affected_surfaces:
  - ui
  - user-flow
invariants:
  - state-transition
  - test-matrix
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: the existing Lesson Inspector hook remains the owner; no stable entrypoint, public contract, or operator procedure changed
verification:
  - focused web red-green: passed, 1 test after failing against the old behavior
  - pnpm run type-check: passed
  - pnpm run build: passed with pre-existing DEP0169 warning tracked by mc2-p2908.1
  - scripts/orchestration/run_process_verification.sh via canonical stage closeout: passed
changed_files:
  - packages/web/components/generation-graph/hooks/useLessonInspectorData.ts
  - packages/web/components/generation-graph/hooks/__tests__/useLessonInspectorData.auth.test.tsx
explicit_defers:
  - historical valid-superadmin spinner - requires a running-app Network trace and is not proved by this code path
---

# Summary

The product implementation is committed at `7b29f9d29`. The initial-fetch effect now waits for auth
resolution, preserves the existing authenticated fetch, and clears loading when no session exists.

# Scope / Routing

One root-owned web hook transition. The accepted claim is limited to auth resolving without a
session; the historical valid-session report remains unproven.

# Verification

The focused hook test failed against the old behavior and now passes 1/1. `pnpm run type-check`,
`pnpm run build`, and canonical process verification passed. The receipt is stored at
`.codex/stages/mc2-dqbw1/acceptance-receipt.json`.

# Delivery / Cleanup

Root-owned implementation is accepted on local `develop`; no merge, push, or deploy was requested
at this boundary. No child branch or worktree exists.

# Risks / Follow-ups / Explicit Defers

Depending only on `isAuthenticated` misses the transition from auth-loading to resolved-without-a-
session because the boolean stays false. The fix must observe auth resolution without re-fetching on
every session object refresh.
