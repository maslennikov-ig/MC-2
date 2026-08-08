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
  - none
task_id: mc2-dqbw1
epic_id: mc2-p2908
stage_id: mc2-dqbw1
session_id: mc2-dqbw1
milestone: cohesive-vertical-slice
milestone_status: in_progress
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
status: returned
delivery_method: manual integration
accepted_by_orchestrator: no
cleanup_status: not_applicable
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
docs_review_notes: pending implementation and closeout review
verification:
  - none: pending
changed_files:
  - none
explicit_defers:
  - historical valid-superadmin spinner - requires a running-app Network trace and is not proved by this code path
---

# Summary

In progress.

# Scope / Routing

One root-owned web hook transition. The accepted claim is limited to auth resolving without a
session; the historical valid-session report remains unproven.

# Verification

Pending focused red-green and one root-owned final acceptance.

# Delivery / Cleanup

Pending.

# Risks / Follow-ups / Explicit Defers

Depending only on `isAuthenticated` misses the transition from auth-loading to resolved-without-a-
session because the boolean stays false. The fix must observe auth resolution without re-fetching on
every session object refresh.
