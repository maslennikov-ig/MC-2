---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-c2p8z/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: CI deploy contract lint job
public_facade: generated blue and green environment contract
bounded_acceptance: every required Compose variable is guaranteed in both generated colour environments before deployment
non_goals:
  - reading or modifying live host environment files or secrets
  - generating deployment secrets or changing the blue-green runtime design
  - deploy, migration, reindex, push, merge, or paid calls
evidence:
  - focused-colour-env-contract-red-green
task_id: mc2-c2p8z
epic_id: n/a
stage_id: mc2-c2p8z
session_id: mc2-c2p8z
milestone: cohesive-vertical-slice
milestone_status: in_progress
agent_type: custom
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one small repository-only CI contract owned by root
repo: mc2
branch: develop
base_branch: develop
base_commit: d17630b76
worktree: /home/me/code/mc2
write_zone:
  - CI deploy contract checker, focused tests, workflow wiring, deployment docs, and local orchestration state
success_criteria:
  - a synthetic required variable missing from only green fails the focused check
  - required keys are derived generically from both production Compose files
  - the production env producer plus colour overlay generator guarantees every key for blue and green
  - focused deploy contracts, type-check, build, and canonical closeout pass
selected_docs:
  - specs/026-post-triage-priorities/spec.md
selected_skills:
  - orchestrator-stage
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
cleanup_status: pending
cleanup_notes: root owner uses the primary develop worktree; no child branch or worktree exists
risk_level: medium
risk_tags:
  - state-transition
affected_surfaces:
  - backend
invariants:
  - test-matrix
docs_impact: ops-deploy
docs_reviewed: n/a
docs_review_notes: pending implementation
verification:
  - focused colour-env contract: pending red-green
changed_files:
  - none
explicit_defers:
  - none
---

# Summary

Add one generic, repository-derived CI contract that catches required Compose variables missing
from either generated production colour environment before deployment.

# Scope / Routing

One root-owned repository-only CI slice. No live host or secret access is necessary.

# Verification

Pending focused red-green, existing deploy contracts, type-check, build, and canonical closeout.

# Delivery / Cleanup

No child branch or worktree exists. Delivery is deferred until the owner finishes the backlog.

# Risks / Follow-ups / Explicit Defers

The checker must derive the contract from repository producers and consumers. A hard-coded copy of
the current four keys would recreate the same silent drift under a different name.
