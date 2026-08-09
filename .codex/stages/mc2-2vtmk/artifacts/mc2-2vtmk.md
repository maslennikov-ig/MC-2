---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-2vtmk/stage-manifest.json
stream_owner: root-owner
orchestration_level: integration
scope_kind: product_slice
immediate_consumer: production host image operations
public_facade: claude-deploy GHCR read access
bounded_acceptance: immutable private manifest is readable under claude-deploy without an image pull
non_goals:
  - deploy, image pull, service mutation, migration, reindex, push, or paid calls
  - printing, committing, or otherwise exposing a credential or Docker config content
  - changing root Docker credentials or broadening package write permissions
evidence:
  - production-readonly-registry-probe
task_id: mc2-2vtmk
epic_id: n/a
stage_id: mc2-2vtmk
session_id: mc2-2vtmk
milestone: cohesive-vertical-slice
milestone_status: in_progress
agent_type: custom
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one production credential boundary owned by the root executor
repo: mc2
branch: develop
base_branch: develop
base_commit: 1b8fec54bfeab4b2a02f669381a1c13046115092
worktree: /home/me/code/mc2
write_zone:
  - production claude-deploy Docker client credential
  - repository-local orchestration state
success_criteria:
  - current access is measured as claude-deploy against an existing immutable private image
  - denied access is repaired with minimum read scope through a secret-safe channel when possible
  - successful manifest inspection proves the final state without pulling an image
selected_docs:
  - specs/026-post-triage-priorities/spec.md
  - official GitHub Container registry documentation via docs-resolve fallback
selected_skills:
  - orchestrator-stage
  - technical-premortem
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
cleanup_notes: no temporary credential backup or runtime resource exists yet
risk_level: high
risk_tags:
  - security
  - authorization
  - rollback
affected_surfaces:
  - none
invariants:
  - rollback
docs_impact: ops-deploy
docs_reviewed: n/a
docs_review_notes: pending live measurement
verification:
  - production docker manifest inspect as claude-deploy: pending
changed_files:
  - none
explicit_defers:
  - none
---

# Summary

Measure the current production GHCR access under `claude-deploy`. Replace the credential only if
the read-only probe proves it is unusable and a secret-safe issuance path is available.

# Scope / Routing

One root-owned production credential boundary. The user explicitly authorized the read-only live
check and, if needed, credential reissuance. No deploy, image pull, or service mutation is in scope.

# Verification

Pending a secret-safe `docker manifest inspect` probe against an existing immutable private image.

# Delivery / Cleanup

Pending.

# Risks / Follow-ups / Explicit Defers

The historical `denied` result proves only that the credential was unusable on 2026-07-27. It does
not prove expiration, and the current state must be measured before any replacement.
