---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-bswhl/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: stage2-document-dashboard
public_facade: file_catalog.error_message-to-DocumentMatrixRow
bounded_acceptance: safe localized actionable failure reason in the existing Stage 2 document row
non_goals:
  - reading scan-only or outlined-text documents, client-side content extraction, or mc2-3gz2m
  - reindex, schema migrations, secrets, access changes, deploy, or live paid work
  - other Tier 1 tasks from specs/026-post-triage-priorities/spec.md
evidence:
  - none
task_id: mc2-bswhl
epic_id: mc2-p2908
stage_id: mc2-bswhl
session_id: mc2-bswhl
milestone: cohesive-vertical-slice
milestone_status: in_progress
agent_type: custom
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one bounded web data-to-presentation path owned by the root executor
repo: mc2
branch: develop
base_branch: develop
base_commit: 7723b1874
worktree: /home/me/code/mc2
write_zone:
  - packages/web Stage 2 dashboard data and presentation
  - packages/web generation translations and focused tests
  - repository-local orchestration state
success_criteria:
  - a stored file_catalog failure reaches the failed document row regardless of Zustand status
  - an empty-text-layer failure becomes localized recovery guidance without internal path or counts
  - unknown failures are sanitized and bounded while missing reasons stay absent
  - focused web tests, type-check, and build pass without live work
selected_docs:
  - specs/026-post-triage-priorities/spec.md
selected_skills:
  - orchestrator-stage
  - lazyweb-design
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
  - user-flow
  - data
affected_surfaces:
  - data
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
  - mc2-3gz2m - actual reading of scan-only or outlined-text files remains research-gated
---

# Summary

In progress.

# Scope / Routing

One root-owned web slice. The existing Stage 2 document table is the acceptance surface. No
subagent, backend change, data migration, or live document processing is needed.

# Verification

Pending focused red-green and one root-owned final acceptance.

# Delivery / Cleanup

Pending.

# Risks / Follow-ups / Explicit Defers

The persisted backend message contains an absolute path and extracted-character count; those must
not be shown verbatim. A browser preflight cannot identify outlined text or failed OCR from the
current size/type checks without duplicating document extraction, so `mc2-3gz2m` remains the owner.
