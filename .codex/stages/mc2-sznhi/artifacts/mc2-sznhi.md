---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-sznhi/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: stage6-single-call-intro-retry
public_facade: validateIntroStructure-localized-teaser-detection
bounded_acceptance: every CONTENT_LABELS locale rejects explicit future-lesson teaser language without rejecting ordinary transitions
non_goals:
  - redesigning lesson prompts, retry policy, or post-processing
  - linguistic fuzzy matching beyond exact bounded teaser phrases
  - deploy, merge, push, live generation, paid calls, reindex, migration, secrets, or access changes
evidence:
  - none
task_id: mc2-sznhi
epic_id: mc2-p2908
stage_id: mc2-sznhi
session_id: mc2-sznhi
milestone: cohesive-vertical-slice
milestone_status: in_progress
agent_type: custom
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one localized Stage 6 guard transition owned by the root executor
repo: mc2
branch: develop
base_branch: develop
base_commit: a50cef60f
worktree: /home/me/code/mc2
write_zone:
  - packages/course-gen-platform Stage 6 intro guard, its caller, and focused unit tests
  - repository-local orchestration state
success_criteria:
  - all CONTENT_LABELS languages select an explicit locale pattern set
  - positive teaser cases cover at least three non-ru-en writing systems
  - normal same-lesson transitions remain accepted
  - existing en, ru, and exact next-lesson-title detection remain accepted behavior
  - focused backend unit tests, type-check, and build pass without live work
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
  - backend
  - parser
  - user-flow
affected_surfaces:
  - backend
  - user-flow
invariants:
  - parsing
  - fallback
  - test-matrix
docs_impact: behavior
docs_reviewed: no-change-needed
docs_review_notes: the existing Stage 6 guard remains the owner; no stable entrypoint, public contract, or operator procedure changes
verification:
  - focused backend unit red-green via vitest.config.unit.ts: pending
  - final type-check, build, and process acceptance: pending
changed_files:
  - pending
explicit_defers:
  - mc2-3sz3d - next task in exact spec order after Tier 1 closes
---

# Summary

Stage scoped. Implementation and TDD are pending.

# Scope / Routing

One root-owned Stage 6 guard slice. Locale selection comes from the shared language contract; no
external or versioned behavior is involved.

# Verification

Pending.

# Delivery / Cleanup

No product delivery yet. No child branch or worktree exists.

# Risks / Follow-ups / Explicit Defers

Broad words such as “next” or their translations would reject normal same-lesson transitions. The
detector must require an explicit localized lesson, section, or chapter phrase.
