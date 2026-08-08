---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-1ugj1/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: course-viewer-enrichment-refresh
public_facade: lesson_enrichments-realtime-subscription-with-polling-fallback
bounded_acceptance: live publication truth measured and enrichment refresh remains reliable when the realtime channel is silent
non_goals:
  - schema migrations, publication changes, REPLICA IDENTITY changes, or any live database mutation
  - redesigning media UX or reopening already-fixed review findings
  - deploy, merge, push, reindex, secrets, access changes, or paid/live generation
evidence:
  - none
task_id: mc2-1ugj1
epic_id: mc2-p2908
stage_id: mc2-1ugj1
session_id: mc2-1ugj1
milestone: cohesive-vertical-slice
milestone_status: in_progress
agent_type: custom
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one live-measurement-to-client-fallback boundary owned by the root executor
repo: mc2
branch: develop
base_branch: develop
base_commit: 9eaf5148a
worktree: /home/me/code/mc2
write_zone:
  - packages/web course viewer enrichment subscription and polling behavior
  - focused web unit tests
  - repository-local orchestration state
success_criteria:
  - live publication membership and replica identity are measured read-only
  - silent realtime cannot permanently disable enrichment polling
  - already-fixed media UX findings remain closed
  - focused web tests, type-check, and build pass without live mutation
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
  - realtime
  - user-flow
  - live-readonly
affected_surfaces:
  - ui
  - user-flow
invariants:
  - fallback
  - state-transition
  - test-matrix
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: pending live measurement and implementation review
verification:
  - none: pending
changed_files:
  - none
explicit_defers:
  - mc2-dqbw1 - next Tier 1 task after this stage
---

# Summary

In progress.

# Scope / Routing

One root-owned web slice preceded by one required read-only live measurement. A schema migration or
live database change is explicitly outside the authorized boundary.

# Verification

Pending live catalog measurement, focused red-green if code changes, and one root-owned final
acceptance.

# Delivery / Cleanup

Pending.

# Risks / Follow-ups / Explicit Defers

A successful Realtime subscription handshake proves only that the channel connected. It does not
prove that `lesson_enrichments` belongs to the publication or can emit the events the UI expects.
