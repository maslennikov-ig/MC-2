---
schema_version: orchestration-artifact/v3
artifact_type: delegated-stream
stage_manifest: .codex/stages/mc2-3sz3d/stage-manifest.json
stream_owner: root-owner
orchestration_level: slice_acceptance
scope_kind: product_slice
immediate_consumer: backend-test-runner
public_facade: default-backend-vitest-exit-status
bounded_acceptance: backend bootstrap, cleanup, and zero-test paths cannot report success, with Qdrant skipped only by an exact explicit opt-out
non_goals:
  - changing the pinned Qdrant client/server compatibility contract or collection schema
  - running the live integration suite, live Qdrant mutations, reindex, migrations, or paid calls
  - deploy, merge, push, secrets, or access changes
evidence:
  - none
task_id: mc2-3sz3d
epic_id: mc2-p2908
stage_id: mc2-3sz3d
session_id: mc2-3sz3d
milestone: cohesive-vertical-slice
milestone_status: in_progress
agent_type: custom
subagent_model: inherit_orchestrator
reasoning_effort: inherit_orchestrator
model_reasoning_rationale: one test-runner integrity boundary owned by the root executor
repo: mc2
branch: develop
base_branch: develop
base_commit: d88dd3dbb
worktree: /home/me/code/mc2
write_zone:
  - packages/course-gen-platform backend Vitest config, global setup/teardown, env example, and focused unit tests
  - repository-local orchestration state
success_criteria:
  - default backend config rejects an empty test result
  - setup and cleanup failures leave a nonzero process status
  - only SKIP_QDRANT_TEST_SETUP=1 bypasses Qdrant bootstrap and the bypass is visible
  - Qdrant bootstrap and worker startup remain strict defaults
  - focused unit tests, safe child-process proof, type-check, and build pass without live work
selected_docs:
  - specs/026-post-triage-priorities/spec.md
  - installed Vitest 4.1.8 runtime and type declarations
selected_skills:
  - orchestrator-stage
  - graphify-project
  - superpowers-systematic-debugging
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
  - state-transition
  - user-flow
affected_surfaces:
  - backend
invariants:
  - fallback
  - state-transition
  - test-matrix
docs_impact: behavior
docs_reviewed: updated
docs_review_notes: the explicit test-only opt-out will be documented beside Qdrant variables in the package env example
verification:
  - safe loopback reproduction before changes: setup failed and printed the misleading no-tests code-0 message, but final child status was 1; the historical configured-environment exit 0 was not rerun because collection bootstrap can mutate live Qdrant
  - focused backend unit red-green via vitest.config.unit.ts: pending
  - final safe child-process, type-check, build, and process acceptance: pending
changed_files:
  - pending
explicit_defers:
  - mc2-q1ggs - next item is an owner decision and stop boundary
---

# Summary

Stage scoped after root-cause investigation. Implementation and TDD are pending.

# Scope / Routing

One root-owned test-runner integrity slice. The installed Vitest 4.1.8 source is the authority for
versioned runner behavior; live services are outside the proof.

# Verification

The safe loopback reproduction showed the same setup failure and misleading code-0 message, but
its final process status was 1. The historical live-config exit 0 was not repeated because the
bootstrap may mutate Qdrant if its precondition starts passing.

# Delivery / Cleanup

No implementation or product delivery yet. No child branch or worktree exists.

# Risks / Follow-ups / Explicit Defers

The existing teardown calls `process.exit(0)` when cleanup fails, which can overwrite any prior
test failure. The shared `passWithNoTests` setting independently treats an empty run as success.
Both must be fixed; changing Qdrant compatibility or live state is out of scope.
