---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-q1ggs/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: foundation
immediate_consumer: production-and-development-deploy-entrypoints
public_facade: shared-host-operation-lock-wrapper
bounded_acceptance: repository-declared deploy and rollback operations fail before mutation when another cooperating host operation holds the shared lock
non_goals:
  - creating accounts or changing sudoers, SSH keys, secrets, or access
  - enforcing the advisory lock against root commands that deliberately bypass the wrapper
  - deploy, production mutation, migration, reindex, or paid work
evidence:
  - none
task_id: mc2-q1ggs
epic_id: n/a
stage_id: mc2-q1ggs
session_id: mc2-q1ggs
milestone: cohesive-vertical-slice
milestone_status: in_progress
agent_type: custom
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one small concurrency boundary owned by the root executor
repo: mc2
branch: develop
base_branch: develop
base_commit: 46e64e30c
worktree: /home/me/code/mc2
write_zone:
  - repository deployment and rollback shell entrypoints, focused contract tests, deployment docs, and local orchestration state
success_criteria:
  - all repository deploy and rollback entrypoints acquire one non-blocking host lock before mutation
  - a second operation exits nonzero and does not run its command
  - the lock is released when the owning process exits
  - CI ships the helper and helper changes trigger a deployment
  - focused tests, type-check, build, and canonical process verification pass locally
selected_docs:
  - specs/026-post-triage-priorities/spec.md
  - GitHub Actions concurrency documentation
  - util-linux flock manual
selected_skills:
  - orchestrator-stage
  - technical-premortem
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
risk_level: high
risk_tags:
  - concurrency
  - state-transition
  - rollback
affected_surfaces:
  - backend
invariants:
  - state-transition
  - rollback
  - test-matrix
docs_impact: ops-deploy
docs_reviewed: updated
docs_review_notes: deployment guidance will name the one supported wrapper for cooperating infrastructure work
verification:
  - focused shell contention red-green: pending
  - deploy contract tests: pending
  - pnpm type-check and build: pending
  - canonical process verification: pending
changed_files:
  - pending
explicit_defers:
  - separate accounts and narrower sudoers remain deliberately out of scope until another persistent operator exists
---

# Summary

The owner selected the minimal shared-lock option. Implementation and TDD are pending.

# Scope / Routing

One root-owned deployment concurrency slice. The lock is cooperative and repository-enforced; it
does not claim to constrain root commands that deliberately bypass the wrapper.

# Verification

No implementation checks have run yet.

# Delivery / Cleanup

No product delivery or production action is authorized for this stage.

# Risks / Follow-ups / Explicit Defers

Separate identities and narrower sudoers are intentionally deferred. The shared lock must protect
all repository deployment entrypoints and provide one wrapper for infrastructure work.
